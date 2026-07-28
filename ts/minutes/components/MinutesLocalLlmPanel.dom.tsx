// Copyright 2026 minutes contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useEffect, useState, type JSX } from 'react';

import { tw } from '../../axo/tw.dom.tsx';
import { drop } from '../../util/drop.std.ts';
import {
  cancelLocalLlmDownload,
  getLocalLlmExtensionState,
  installLocalLlmExtension,
  refreshLocalLlmExtension,
  saveLocalLlmContextSize,
  saveLocalLlmReasoningEnabled,
  subscribeLocalLlmExtensionProgress,
} from '../localLlmExtensionService.preload.ts';
import { localLlmExtensionEvents } from '../localLlmExtensionEvents.std.ts';
import {
  LOCAL_LLM_CONTEXT_SIZE_OPTIONS,
  normalizeLocalLlmContextSize,
  type LocalLlmContextSize,
} from '../localLlmContextSize.std.ts';
import type {
  LocalLlmExtensionProgress,
  LocalLlmExtensionPublic,
} from '../localLlmExtension.std.ts';

type Props = Readonly<{
  selectedModelFileName: string;
  onSelectedModelChange: (fileName: string) => void;
  embedded?: boolean;
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

  if (/node-llama-cpp/i.test(message)) {
    return 'Nelze načíst lokální LLM modul. Restartujte aplikaci a zkuste znovu.';
  }
  if (/HTTP 404|Stažení souboru selhalo \(HTTP 404\)/i.test(message)) {
    return `${message} Zkuste stáhnout znovu — URL modelu bylo opraveno.`;
  }
  if (/zrušeno/i.test(message)) {
    return 'Stažení bylo zrušeno.';
  }

  return message;
}

function getModelLabel(
  state: LocalLlmExtensionPublic,
  fileName: string
): string {
  return (
    state.availableModels.find(model => model.fileName === fileName)?.label ??
    fileName
  );
}

export function MinutesLocalLlmPanel({
  selectedModelFileName,
  onSelectedModelChange,
  embedded = false,
}: Props): JSX.Element {
  const [state, setState] = useState<LocalLlmExtensionPublic>(
    getLocalLlmExtensionState()
  );
  const [progress, setProgress] = useState<LocalLlmExtensionProgress | null>(
    null
  );
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    drop(refreshLocalLlmExtension().then(setState));
  }, []);

  useEffect(() => {
    return localLlmExtensionEvents.on(setState);
  }, []);

  useEffect(() => {
    return subscribeLocalLlmExtensionProgress(setProgress);
  }, []);

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
            const next = await installLocalLlmExtension(options);
            setState(next);
            onSelectedModelChange(next.modelFileName ?? options.modelFileName);
            setProgress({
              phase: 'complete',
              message: options.forceRedownload
                ? 'Model byl znovu stažen.'
                : 'Lokální model je aktivní.',
              percent: 100,
            });
          } catch (error) {
            const message = formatInstallError(error);
            if (/zrušeno/i.test(message)) {
              setErrorMessage(null);
              setProgress({ phase: 'cancelled', message });
              await refreshLocalLlmExtension().then(setState);
            } else {
              setErrorMessage(message);
              setProgress({ phase: 'error', message });
            }
          } finally {
            setIsBusy(false);
          }
        })()
      );
    },
    [onSelectedModelChange]
  );

  const handleCancelDownload = useCallback(() => {
    drop(cancelLocalLlmDownload());
  }, []);

  const handleContextSizeChange = useCallback(
    (contextSize: LocalLlmContextSize) => {
      setIsBusy(true);
      setErrorMessage(null);
      drop(
        (async () => {
          try {
            const next = await saveLocalLlmContextSize(contextSize);
            setState(next);
          } catch (error) {
            setErrorMessage(formatInstallError(error));
          } finally {
            setIsBusy(false);
          }
        })()
      );
    },
    []
  );

  const handleReasoningChange = useCallback((reasoningEnabled: boolean) => {
    setIsBusy(true);
    setErrorMessage(null);
    drop(
      (async () => {
        try {
          const next = await saveLocalLlmReasoningEnabled(reasoningEnabled);
          setState(next);
        } catch (error) {
          setErrorMessage(formatInstallError(error));
        } finally {
          setIsBusy(false);
        }
      })()
    );
  }, []);

  const isDownloading =
    isBusy &&
    (progress?.phase === 'downloading' || progress?.phase === 'checking');
  const isActive = state.activated && state.modelReady && state.runtimeReady;
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

  const content = (
    <>
      {!embedded && (
        <p className={tw('text-label-small opacity-80')}>
          Sumarizace proběhne na vašem počítači bez cloud API. Při prvním
          použití se stáhne zvolený GGUF model.
        </p>
      )}

      <div className={tw('text-label-small flex flex-col gap-1')}>
        <span>
          Runtime:{' '}
          <strong>{state.runtimeReady ? 'OK' : 'Chybí node-llama-cpp'}</strong>
        </span>
        <span>
          Aktivní model:{' '}
          <strong>
            {activeModelFileName && state.modelReady
              ? `${getModelLabel(state, activeModelFileName)} (${formatSize(state.modelSizeBytes)})`
              : '—'}
          </strong>
        </span>
      </div>

      <label className={tw('flex flex-col gap-1')}>
        <span>Model ke stažení</span>
        <select
          className={tw(
            'rounded-md border border-solid px-3 py-2',
            'border-label-disabled bg-background-primary'
          )}
          value={selectedModelFileName}
          disabled={isBusy}
          onChange={event => onSelectedModelChange(event.target.value)}
        >
          {state.availableModels.map(model => (
            <option key={model.fileName} value={model.fileName}>
              {model.label} ({model.downloadLabel}){model.ready ? ' ✓' : ''}
            </option>
          ))}
        </select>
      </label>

      <label className={tw('flex flex-col gap-1')}>
        <span>Velikost kontextu</span>
        <select
          className={tw(
            'rounded-md border border-solid px-3 py-2',
            'border-label-disabled bg-background-primary'
          )}
          value={String(state.contextSize)}
          disabled={isBusy}
          onChange={event => {
            const raw = event.target.value;
            handleContextSizeChange(
              normalizeLocalLlmContextSize(raw === 'auto' ? raw : Number(raw))
            );
          }}
        >
          {LOCAL_LLM_CONTEXT_SIZE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className={tw('text-label-small opacity-70')}>
          Vyšší hodnota umožní zpracovat delší přepis najednou, ale spotřebuje
          více paměti. Změna nevyžaduje nové stažení modelu.
        </span>
      </label>

      <label className={tw('flex items-start gap-2')}>
        <input
          type="checkbox"
          checked={state.reasoningEnabled}
          disabled={isBusy}
          onChange={event => handleReasoningChange(event.target.checked)}
        />
        <span className={tw('flex flex-col gap-1')}>
          <span>Reasoning</span>
          <span className={tw('text-label-small opacity-70')}>
            Umožní modelu interně promýšlet složité úlohy. Generování bude
            pomalejší a část výstupního limitu se spotřebuje na uvažování.
          </span>
        </span>
      </label>

      {selectedModel && (
        <p className={tw('text-label-small opacity-70')}>
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

      {progress && (
        <div
          className={tw(
            'text-label-small rounded-md px-3 py-2',
            progress.phase === 'error' &&
              'bg-fill-secondary text-label-primary',
            progress.phase === 'cancelled' && 'opacity-80',
            progress.phase === 'complete' && 'opacity-80'
          )}
        >
          <span>{progress.message}</span>
          {typeof progress.percent === 'number' &&
            progress.phase === 'downloading' && (
              <div
                className={tw(
                  'mt-2 h-1.5 overflow-hidden rounded-full bg-fill-secondary'
                )}
              >
                <div
                  className={tw('h-full bg-label-primary')}
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            )}
        </div>
      )}

      {errorMessage && (
        <p className={tw('text-label-small text-label-primary')}>
          {errorMessage}
        </p>
      )}

      <div className={tw('flex flex-wrap gap-2')}>
        {isDownloading && (
          <button
            type="button"
            className={tw(
              'text-label-small rounded-md border border-solid px-3 py-1.5',
              'border-label-disabled'
            )}
            onClick={handleCancelDownload}
          >
            Zrušit stahování
          </button>
        )}
        {canReinstall && (
          <button
            type="button"
            className={tw(
              'text-label-small rounded-md border border-solid px-3 py-1.5',
              'border-label-disabled'
            )}
            disabled={isBusy}
            onClick={() =>
              runInstall({
                modelFileName: selectedModelFileName,
                forceRedownload: true,
              })
            }
          >
            {isBusy ? 'Stahuji…' : 'Přeinstalovat model'}
          </button>
        )}
        {(!isActive || isModelChange) && (
          <button
            type="button"
            className={tw(
              'text-label-small rounded-md px-3 py-1.5',
              'bg-label-primary text-background-primary'
            )}
            disabled={isBusy}
            onClick={() => runInstall({ modelFileName: selectedModelFileName })}
          >
            {isBusy
              ? 'Stahuji…'
              : isModelChange
                ? 'Změnit model'
                : 'Stáhnout a aktivovat'}
          </button>
        )}
      </div>
    </>
  );

  if (embedded) {
    return <div className={tw('flex flex-col gap-3')}>{content}</div>;
  }

  return (
    <fieldset
      className={tw(
        'm-0 flex flex-col gap-3 rounded-md border border-solid p-4',
        'border-label-disabled'
      )}
    >
      <legend className={tw('text-label-medium px-1 font-medium')}>
        Lokální model (Gemma)
      </legend>
      {content}
    </fieldset>
  );
}
