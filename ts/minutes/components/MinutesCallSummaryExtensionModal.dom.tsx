// Copyright 2026 minutes contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useEffect, useState, type JSX } from 'react';
import { ipcRenderer } from 'electron';

import { AxoDialog } from '../../axo/AxoDialog.dom.tsx';
import { AxoSwitch } from '../../axo/AxoSwitch.dom.tsx';
import { tw } from '../../axo/tw.dom.tsx';
import { drop } from '../../util/drop.std.ts';
import { formatAppDialogTitle } from '../branding.std.ts';
import {
  getCallSummaryExtensionState,
  installCallSummaryExtension,
  refreshCallSummaryExtension,
  saveWhisperTranscribeSettings,
  subscribeCallSummaryExtensionOpen,
  subscribeCallSummaryExtensionProgress,
} from '../callSummaryExtensionService.preload.ts';
import { callSummaryExtensionEvents } from '../callSummaryExtensionEvents.std.ts';
import {
  type CallSummaryExtensionProgress,
  type CallSummaryExtensionPublic,
} from '../callSummaryExtension.std.ts';
import {
  WHISPER_DECODE_MODE_OPTIONS,
  type WhisperDecodeMode,
  type WhisperTranscribeSettingsPublic,
} from '../whisperTranscribeSettings.std.ts';
import { MinutesDraggableDialogHeader } from './MinutesDraggableSurface.dom.tsx';

type Props = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>;

function formatSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) {
    return '—';
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatInstallError(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Instalace selhala.';
  const ipcMatch = raw.match(
    /Error invoking remote method[^:]*:\s*(?:Error:\s*)?(.+)/s
  );
  const message = (ipcMatch?.[1] ?? raw).trim();

  if (/index\.mjs|whisper-cpp-node/i.test(message)) {
    return 'Nelze načíst lokální Whisper modul. Restartujte aplikaci a zkuste znovu.';
  }

  return message;
}

function StatusRow({
  label,
  value,
  valueClassName,
}: Readonly<{
  label: string;
  value: string;
  valueClassName?: string;
}>): JSX.Element {
  return (
    <div className="MinutesCallSummaryExtensionModal__row">
      <span className="MinutesCallSummaryExtensionModal__rowLabel">{label}</span>
      <span
        className={tw(
          'MinutesCallSummaryExtensionModal__rowValue',
          valueClassName
        )}
      >
        {value}
      </span>
    </div>
  );
}

function getModelLabel(
  state: CallSummaryExtensionPublic,
  fileName: string
): string {
  return (
    state.availableModels.find(model => model.fileName === fileName)?.label ??
    fileName
  );
}

export function MinutesCallSummaryExtensionModal({
  open,
  onOpenChange,
}: Props): JSX.Element | null {
  const [state, setState] = useState<CallSummaryExtensionPublic>(
    getCallSummaryExtensionState()
  );
  const [selectedModelFileName, setSelectedModelFileName] = useState(
    state.recommendedModelFileName
  );
  const [progress, setProgress] = useState<CallSummaryExtensionProgress | null>(
    null
  );
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcribeSettings, setTranscribeSettings] =
    useState<WhisperTranscribeSettingsPublic>(state.transcribeSettings);
  const [settingsSavedMessage, setSettingsSavedMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setProgress(null);
    setErrorMessage(null);
    setSettingsSavedMessage(null);
    drop(
      refreshCallSummaryExtension().then(next => {
        setState(next);
        setTranscribeSettings(next.transcribeSettings);
        setSelectedModelFileName(
          next.modelFileName ?? next.recommendedModelFileName
        );
      })
    );
  }, [open]);

  useEffect(() => {
    return callSummaryExtensionEvents.on(next => {
      setState(next);
      setTranscribeSettings(next.transcribeSettings);
    });
  }, []);

  useEffect(() => {
    return subscribeCallSummaryExtensionProgress(setProgress);
  }, []);

  const persistTranscribeSettings = useCallback(
    (patch: Partial<WhisperTranscribeSettingsPublic>) => {
      setSettingsSavedMessage(null);
      drop(
        (async () => {
          try {
            const next = await saveWhisperTranscribeSettings(patch);
            setState(next);
            setTranscribeSettings(next.transcribeSettings);
            setSettingsSavedMessage('Nastavení výkonu uloženo.');
          } catch (error) {
            setErrorMessage(formatInstallError(error));
          }
        })()
      );
    },
    []
  );

  const runInstall = useCallback(
    (options: { modelFileName: string; forceRedownload?: boolean }) => {
      setIsBusy(true);
      setErrorMessage(null);
      setProgress({
        phase: 'checking',
        message: options.forceRedownload
          ? 'Připravuji přeinstalaci…'
          : 'Připravuji instalaci…',
      });

      drop(
        (async () => {
          try {
            const next = await installCallSummaryExtension(options);
            setState(next);
            setSelectedModelFileName(next.modelFileName ?? options.modelFileName);
            setProgress({
              phase: 'complete',
              message: options.forceRedownload
                ? 'Model byl znovu stažen. Rozšíření je aktivní.'
                : 'Rozšíření je aktivní. Nahrávání hovorů je povoleno.',
              percent: 100,
            });
          } catch (error) {
            const message = formatInstallError(error);
            setErrorMessage(message);
            setProgress({ phase: 'error', message });
          } finally {
            setIsBusy(false);
          }
        })()
      );
    },
    []
  );

  const isActive =
    state.activated && state.modelReady && state.whisperRuntimeReady;
  const activeModelFileName = state.modelFileName;
  const selectedModel =
    state.availableModels.find(
      model => model.fileName === selectedModelFileName
    ) ?? null;
  const isModelChange =
    isActive &&
    activeModelFileName != null &&
    selectedModelFileName !== activeModelFileName;
  const canReinstall =
    isActive &&
    activeModelFileName != null &&
    selectedModelFileName === activeModelFileName;
  const resolvedThreadLabel =
    transcribeSettings.threadCount > 0
      ? String(transcribeSettings.threadCount)
      : `auto (${Math.max(1, state.cpuCount - 1)})`;
  const selectedDecodeMode =
    WHISPER_DECODE_MODE_OPTIONS.find(
      option => option.id === transcribeSettings.decodeMode
    ) ?? WHISPER_DECODE_MODE_OPTIONS[0]!;

  if (!open) {
    return null;
  }

  return (
    <AxoDialog.Root open={open} onOpenChange={onOpenChange}>
      <AxoDialog.Content size="md" escape="cancel-is-noop">
        <MinutesDraggableDialogHeader positionKey="transcription-settings">
          <AxoDialog.Title>
            {formatAppDialogTitle('Nastavení přepisů')}
          </AxoDialog.Title>
          <AxoDialog.Close />
        </MinutesDraggableDialogHeader>

        <AxoDialog.Body>
          <AxoDialog.Description>
            <p className={tw('mb-5 text-label-medium leading-relaxed')}>
              Přepis probíhá lokálně: nejdřív Whisper přes celé audio, pak
              párování se speaker logem (včetně „více hlasů“ při souběžné
              řeči) a volitelně AI korekce v{' '}
              <strong>Nastavení AI</strong>.
            </p>
          </AxoDialog.Description>

          <div className="MinutesCallSummaryExtensionModal__statusCard">
            <StatusRow
              label="Stav rozšíření"
              value={isActive ? 'Aktivní' : 'Neaktivní'}
              valueClassName={
                isActive
                  ? 'MinutesCallSummaryExtensionModal__rowValue--ok'
                  : 'MinutesCallSummaryExtensionModal__rowValue--muted'
              }
            />
            <StatusRow
              label="Whisper runtime"
              value={state.whisperRuntimeReady ? 'Nainstalován' : 'Chybí'}
              valueClassName={
                state.whisperRuntimeReady
                  ? 'MinutesCallSummaryExtensionModal__rowValue--ok'
                  : undefined
              }
            />
            <StatusRow
              label="Aktivní model"
              value={
                activeModelFileName && state.modelReady
                  ? `${getModelLabel(state, activeModelFileName)} (${formatSize(state.modelSizeBytes)})`
                  : activeModelFileName
                    ? `${getModelLabel(state, activeModelFileName)} — nestáhnut`
                    : '—'
              }
              valueClassName={
                state.modelReady
                  ? 'MinutesCallSummaryExtensionModal__rowValue--ok'
                  : undefined
              }
            />
            <StatusRow
              label="Akcelerace přepisu"
              value={state.gpuAcceleration.statusLabel}
              valueClassName={
                state.gpuAcceleration.gpuDeviceCount > 0 &&
                state.gpuAcceleration.useGpuRequested
                  ? 'MinutesCallSummaryExtensionModal__rowValue--ok'
                  : undefined
              }
            />
            <StatusRow
              label="Nahrávání hovorů"
              value={isActive ? 'Povoleno' : 'Zakázáno'}
              valueClassName={
                isActive
                  ? 'MinutesCallSummaryExtensionModal__rowValue--ok'
                  : undefined
              }
            />
          </div>

          <fieldset className="MinutesCallSummaryExtensionModal__modelField">
            <legend className="MinutesCallSummaryExtensionModal__modelLegend">
              Whisper model pro přepis
            </legend>
            <p className={tw('mb-2 text-label-small text-label-secondary')}>
              Doporučujeme <strong>Large v3 Turbo</strong> — u češtiny nejlepší
              poměr přesnosti a rychlosti, zejména s GPU (Vulkan na Windows,
              Metal na Macu). Medium je vhodné pro slabší PC bez grafiky.
            </p>
            <label className="MinutesCallSummaryExtensionModal__modelLabel">
              <span>Model</span>
              <select
                className="MinutesCallSummaryExtensionModal__modelSelect"
                value={selectedModelFileName}
                disabled={isBusy}
                onChange={event => setSelectedModelFileName(event.target.value)}
              >
                {state.availableModels.map(model => (
                  <option key={model.fileName} value={model.fileName}>
                    {model.label} ({model.downloadLabel})
                    {model.recommended ? ' — doporučeno' : ''}
                    {model.ready ? ' ✓' : ''}
                  </option>
                ))}
              </select>
            </label>
            {selectedModel && (
              <p className="MinutesCallSummaryExtensionModal__modelHint">
                {selectedModel.description}
                {selectedModel.installed && (
                  <>
                    {' '}
                    — na disku {formatSize(selectedModel.installedSizeBytes)}
                    {!selectedModel.ready ? ' (neúplný, stáhněte znovu)' : ''}
                  </>
                )}
              </p>
            )}
          </fieldset>

          <fieldset
            className={tw(
              'MinutesCallSummaryExtensionModal__modelField',
              'flex flex-col gap-4'
            )}
          >
            <legend className="MinutesCallSummaryExtensionModal__modelLegend">
              Výkon přepisu
            </legend>

            <label className={tw('flex items-center justify-between gap-3')}>
              <span>Použít GPU (pokud je k dispozici)</span>
              <AxoSwitch.Root
                checked={transcribeSettings.useGpu}
                disabled={isBusy}
                onCheckedChange={useGpu => {
                  setTranscribeSettings(prev => ({ ...prev, useGpu }));
                  persistTranscribeSettings({ useGpu });
                }}
              />
            </label>
            <p className={tw('text-label-small opacity-70 -mt-2')}>
              Po změně se aktualizuje indikátor akcelerace výše. Při zapnutém GPU
              se použije Flash Attention pro rychlejší přepis.
            </p>

            <label className={tw('flex flex-col gap-1')}>
              <span>Počet vláken CPU</span>
              <input
                type="number"
                className={tw(
                  'w-24 rounded-md border border-solid px-3 py-2',
                  'border-label-disabled bg-background-primary'
                )}
                min={0}
                max={Math.max(1, state.cpuCount)}
                value={transcribeSettings.threadCount}
                disabled={isBusy}
                onChange={event => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  const threadCount = Number.isFinite(parsed)
                    ? Math.max(0, parsed)
                    : 0;
                  setTranscribeSettings(prev => ({ ...prev, threadCount }));
                }}
                onBlur={() => {
                  persistTranscribeSettings({
                    threadCount: transcribeSettings.threadCount,
                  });
                }}
              />
              <span className={tw('text-label-small opacity-70')}>
                0 = auto ({Math.max(1, state.cpuCount - 1)} vláken z{' '}
                {state.cpuCount} jader). Aktuálně se použije:{' '}
                <strong>{resolvedThreadLabel}</strong>.
              </span>
            </label>

            <label className={tw('flex flex-col gap-1')}>
              <span>Režim decode profilů</span>
              <select
                className={tw(
                  'rounded-md border border-solid px-3 py-2',
                  'border-label-disabled bg-background-primary'
                )}
                value={transcribeSettings.decodeMode}
                disabled={isBusy}
                onChange={event => {
                  const decodeMode = event.target.value as WhisperDecodeMode;
                  setTranscribeSettings(prev => ({ ...prev, decodeMode }));
                  persistTranscribeSettings({ decodeMode });
                }}
              >
                {WHISPER_DECODE_MODE_OPTIONS.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className={tw('text-label-small opacity-70')}>
                {selectedDecodeMode.description}
              </span>
            </label>

            {settingsSavedMessage && (
              <p className={tw('text-label-small text-label-secondary')}>
                {settingsSavedMessage}
              </p>
            )}
          </fieldset>

          {!isActive && (
            <p className={tw('mt-4 text-label-small text-label-secondary')}>
              Při první aktivaci se stáhne zvolený jazykový model Whisperu.
              Bez něj nelze hovory přepisovat.
            </p>
          )}

          {progress && (
            <div
              className={tw(
                'MinutesCallSummaryExtensionModal__progress',
                progress.phase === 'error' &&
                  'MinutesCallSummaryExtensionModal__progress--error',
                progress.phase === 'complete' &&
                  'MinutesCallSummaryExtensionModal__progress--complete'
              )}
            >
              <span>{progress.message}</span>
              {typeof progress.percent === 'number' &&
                progress.phase === 'downloading' && (
                  <div className="MinutesCallSummaryExtensionModal__bar">
                    <div
                      className="MinutesCallSummaryExtensionModal__barFill"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                )}
            </div>
          )}

          {errorMessage && (
            <p className="MinutesCallSummaryExtensionModal__error">
              {errorMessage}
            </p>
          )}
        </AxoDialog.Body>

        <AxoDialog.Footer>
          <AxoDialog.Actions>
            <AxoDialog.Action
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Zavřít
            </AxoDialog.Action>
            {canReinstall && (
              <AxoDialog.Action
                variant="secondary"
                disabled={isBusy}
                onClick={() =>
                  runInstall({
                    modelFileName: selectedModelFileName,
                    forceRedownload: true,
                  })
                }
              >
                {isBusy ? 'Stahuji…' : 'Přeinstalovat model'}
              </AxoDialog.Action>
            )}
            {(!isActive || isModelChange) && (
              <AxoDialog.Action
                variant="primary"
                disabled={isBusy}
                onClick={() =>
                  runInstall({ modelFileName: selectedModelFileName })
                }
              >
                {isBusy
                  ? 'Stahuji…'
                  : isModelChange
                    ? 'Změnit model'
                    : 'Stáhnout a aktivovat'}
              </AxoDialog.Action>
            )}
          </AxoDialog.Actions>
        </AxoDialog.Footer>
      </AxoDialog.Content>
    </AxoDialog.Root>
  );
}

export function MinutesCallSummaryExtensionHost(): JSX.Element {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openModal = (): void => {
      setOpen(true);
    };
    const unsubscribe = subscribeCallSummaryExtensionOpen(openModal);
    ipcRenderer.on('minutes:open-call-summary-extension', openModal);
    return () => {
      unsubscribe();
      ipcRenderer.removeListener(
        'minutes:open-call-summary-extension',
        openModal
      );
    };
  }, []);

  return (
    <MinutesCallSummaryExtensionModal open={open} onOpenChange={setOpen} />
  );
}
