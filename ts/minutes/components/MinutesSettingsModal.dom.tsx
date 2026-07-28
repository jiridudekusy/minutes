// Copyright 2026 minutes contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { ipcRenderer } from 'electron';

import { AxoDialog } from '../../axo/AxoDialog.dom.tsx';
import { AxoSwitch } from '../../axo/AxoSwitch.dom.tsx';
import { tw } from '../../axo/tw.dom.tsx';
import { drop } from '../../util/drop.std.ts';
import { openLinkInWebBrowser } from '../../util/openLinkInWebBrowser.dom.ts';
import { formatAppDialogTitle } from '../branding.std.ts';
import {
  AI_PROVIDER_DEFINITIONS,
  AI_OUTPUT_LANGUAGE_OPTIONS,
  DEFAULT_AI_SETTINGS,
  getAiProviderDefinition,
  normalizeAiOutputLanguage,
  type AiProvider,
  type AiProviderDefinition,
  type AiSettingsPublic,
} from '../aiSettings.std.ts';
import {
  AI_LOCAL_MODEL_SAVE_BLOCKED_MESSAGE_CS,
} from '../aiUserMessages.std.ts';
import {
  getAiSettings,
  saveAiSettings,
  testAiSettings,
} from '../aiSettingsService.preload.ts';
import {
  getLocalLlmExtensionState,
  isLocalLlmExtensionActive,
} from '../localLlmExtensionService.preload.ts';
import { localLlmExtensionEvents } from '../localLlmExtensionEvents.std.ts';
import { MinutesDraggableDialogHeader } from './MinutesDraggableSurface.dom.tsx';
import { MinutesLocalLlmPanel } from './MinutesLocalLlmPanel.dom.tsx';

type Props = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>;

type ApiKeyDrafts = Partial<Record<AiProvider, string>>;
type RemoveKeyFlags = Partial<Record<AiProvider, boolean>>;

function formatUserFacingError(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Neznámá chyba';
  const ipcMatch = raw.match(
    /Error invoking remote method[^:]*:\s*(?:Error:\s*)?(.+)/s
  );
  const message = (ipcMatch?.[1] ?? raw).trim();

  if (/exceeded your current quota/i.test(message)) {
    return `${message} Doplňte kredit u poskytovatele. Klíč je platný — uložení funguje.`;
  }
  if (/invalid_api_key|incorrect api key|API key not valid/i.test(message)) {
    return `${message} Zkontrolujte API klíč u zvoleného poskytovatele.`;
  }
  if (/no longer available to new users|is deprecated|has been shut down/i.test(message)) {
    return `${message} Zvolte novější model Gemini (např. gemini-3.1-flash-lite nebo gemini-3.5-flash) a uložte nastavení.`;
  }

  return message;
}

function resolveModelForProvider(
  settings: AiSettingsPublic,
  nextProvider: AiProvider
): string {
  const def = getAiProviderDefinition(nextProvider);
  const saved = settings.modelsByProvider[nextProvider];
  if (saved && def.models.includes(saved)) {
    return saved;
  }
  return def.defaultModel;
}

function providerOptionSuffix(
  def: AiProviderDefinition,
  loaded: AiSettingsPublic
): string {
  if (def.id === 'local') {
    return getLocalLlmExtensionState().activated ? ' ✓' : '';
  }
  return loaded.keyStatusByProvider[def.id]?.hasApiKey ? ' ✓' : '';
}

type ProviderApiKeyFieldProps = Readonly<{
  def: AiProviderDefinition;
  loaded: AiSettingsPublic;
  draft: string;
  markedForRemoval: boolean;
  onDraftChange: (value: string) => void;
  onMarkRemove: () => void;
  onUnmarkRemove: () => void;
}>;

function ProviderApiKeyField({
  def,
  loaded,
  draft,
  markedForRemoval,
  onDraftChange,
  onMarkRemove,
  onUnmarkRemove,
}: ProviderApiKeyFieldProps): JSX.Element {
  const keyStatus = loaded.keyStatusByProvider[def.id];
  const hasSavedKey = keyStatus?.hasApiKey ?? false;

  let placeholder = def.keyPlaceholder;
  if (markedForRemoval) {
    placeholder = 'Klíč bude po uložení odstraněn';
  } else if (hasSavedKey && draft.length === 0) {
    placeholder = `Uloženo (${keyStatus?.apiKeyMasked ?? '••••'})`;
  }

  return (
    <label className={tw('flex flex-col gap-1')}>
      <span>{def.keyLabel}</span>
      <input
        type="password"
        autoComplete="off"
        className={tw(
          'w-full rounded-md border border-solid px-3 py-2',
          'border-label-disabled bg-background-primary text-label-primary',
          'not-forced-colors:outline-none focus:border-label-primary'
        )}
        placeholder={placeholder}
        value={draft}
        disabled={markedForRemoval}
        onChange={event => onDraftChange(event.target.value)}
      />
      <span className={tw('text-label-small opacity-70')}>
        Klíč získáte na{' '}
        <button
          type="button"
          className={tw('underline')}
          onClick={() => {
            openLinkInWebBrowser(def.keyHelpUrl);
          }}
        >
          {def.keyHelpLabel}
        </button>
        . Prázdné pole = ponechat stávající klíč.
        {hasSavedKey && !markedForRemoval && (
          <>
            {' '}
            <button
              type="button"
              className={tw('underline')}
              onClick={onMarkRemove}
            >
              Odstranit uložený klíč
            </button>
          </>
        )}
        {markedForRemoval && (
          <>
            {' '}
            <button
              type="button"
              className={tw('underline')}
              onClick={onUnmarkRemove}
            >
              Zrušit odstranění
            </button>
          </>
        )}
      </span>
    </label>
  );
}

export function MinutesSettingsModal({
  open,
  onOpenChange,
}: Props): JSX.Element | null {
  const [loaded, setLoaded] = useState<AiSettingsPublic>(DEFAULT_AI_SETTINGS);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [provider, setProvider] = useState<AiProvider>(
    DEFAULT_AI_SETTINGS.provider
  );
  const [model, setModel] = useState(DEFAULT_AI_SETTINGS.model);
  const [outputLanguage, setOutputLanguage] = useState(
    DEFAULT_AI_SETTINGS.outputLanguage
  );
  const [transcriptCorrectionEnabled, setTranscriptCorrectionEnabled] =
    useState(DEFAULT_AI_SETTINGS.transcriptCorrectionEnabled);
  const [apiKeyDrafts, setApiKeyDrafts] = useState<ApiKeyDrafts>({});
  const [removeKeyFlags, setRemoveKeyFlags] = useState<RemoveKeyFlags>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [localLlmState, setLocalLlmState] = useState(getLocalLlmExtensionState());

  const providerDef = useMemo(
    () => getAiProviderDefinition(provider),
    [provider]
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    drop(
      (async () => {
        const settings = await getAiSettings();
        setLoaded(settings);
        setAiEnabled(settings.aiEnabled);
        setProvider(settings.provider);
        setModel(settings.model);
        setOutputLanguage(normalizeAiOutputLanguage(settings.outputLanguage));
        setTranscriptCorrectionEnabled(settings.transcriptCorrectionEnabled);
        setApiKeyDrafts({});
        setRemoveKeyFlags({});
        setStatusMessage(null);
      })()
    );
  }, [open]);

  useEffect(() => {
    return localLlmExtensionEvents.on(setLocalLlmState);
  }, []);

  const localModelReady =
    localLlmState.activated &&
    localLlmState.modelReady &&
    localLlmState.runtimeReady &&
    localLlmState.modelFileName === model;
  const cannotEnableAiWithLocal =
    provider === 'local' && aiEnabled && !localModelReady;

  const handleProviderChange = useCallback(
    (nextProvider: AiProvider) => {
      setProvider(nextProvider);
      setModel(resolveModelForProvider(loaded, nextProvider));
    },
    [loaded]
  );

  const buildApiKeysPayload = useCallback((): Partial<
    Record<AiProvider, string | undefined>
  > => {
    const apiKeys: Partial<Record<AiProvider, string | undefined>> = {};
    for (const def of AI_PROVIDER_DEFINITIONS) {
      if (removeKeyFlags[def.id]) {
        apiKeys[def.id] = '';
        continue;
      }
      const draft = apiKeyDrafts[def.id];
      if (draft !== undefined && draft.trim().length > 0) {
        apiKeys[def.id] = draft.trim();
      }
    }
    return apiKeys;
  }, [apiKeyDrafts, removeKeyFlags]);

  const handleSave = useCallback(() => {
    if (cannotEnableAiWithLocal) {
      setStatusMessage(AI_LOCAL_MODEL_SAVE_BLOCKED_MESSAGE_CS);
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    drop(
      (async () => {
        try {
          const saved = await saveAiSettings({
            aiEnabled,
            provider,
            model,
            outputLanguage,
            transcriptCorrectionEnabled,
            apiKeys: buildApiKeysPayload(),
          });
          setLoaded(saved);
          setApiKeyDrafts({});
          setRemoveKeyFlags({});
          setStatusMessage('Nastavení uloženo.');
          onOpenChange(false);
        } catch (error) {
          setStatusMessage(formatUserFacingError(error));
        } finally {
          setIsBusy(false);
        }
      })()
    );
  }, [
    aiEnabled,
    buildApiKeysPayload,
    cannotEnableAiWithLocal,
    model,
    onOpenChange,
    outputLanguage,
    provider,
    transcriptCorrectionEnabled,
  ]);

  const handleTest = useCallback(() => {
    if (provider === 'local' && !isLocalLlmExtensionActive(model)) {
      setStatusMessage(AI_LOCAL_MODEL_SAVE_BLOCKED_MESSAGE_CS);
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    drop(
      (async () => {
        try {
          const draftKey = apiKeyDrafts[provider]?.trim();
          const result = await testAiSettings({
            provider,
            model,
            apiKey: draftKey && draftKey.length > 0 ? draftKey : undefined,
          });
          setStatusMessage(`Připojení OK (${result.message})`);
        } catch (error) {
          setStatusMessage(formatUserFacingError(error));
        } finally {
          setIsBusy(false);
        }
      })()
    );
  }, [apiKeyDrafts, model, provider]);

  if (!open) {
    return null;
  }

  const providerDraft = apiKeyDrafts[provider] ?? '';
  const providerMarkedForRemoval = removeKeyFlags[provider] ?? false;

  return (
    <AxoDialog.Root open={open} onOpenChange={onOpenChange}>
      <AxoDialog.Content size="lg" escape="cancel-is-noop">
        <MinutesDraggableDialogHeader positionKey="ai-settings">
          <AxoDialog.Title>{formatAppDialogTitle('Nastavení AI')}</AxoDialog.Title>
          <AxoDialog.Close />
        </MinutesDraggableDialogHeader>
        <AxoDialog.Body>
          <AxoDialog.Description>
            <p className={tw('mb-4 text-label-medium opacity-90')}>
              Nastavte, jak Minutes vytváří AI shrnutí chatů a hovorů. Cloud
              poskytovatelé vyžadují API klíč; lokální Gemma běží jen na vašem
              počítači.
            </p>
          </AxoDialog.Description>

          <div className={tw('flex flex-col gap-5')}>
            <label className={tw('flex items-center justify-between gap-3')}>
              <span>Povolit AI shrnutí</span>
              <AxoSwitch.Root
                checked={aiEnabled}
                onCheckedChange={checked => {
                  if (
                    checked &&
                    provider === 'local' &&
                    !isLocalLlmExtensionActive(model)
                  ) {
                    setStatusMessage(AI_LOCAL_MODEL_SAVE_BLOCKED_MESSAGE_CS);
                    return;
                  }
                  setAiEnabled(checked);
                }}
              />
            </label>

            <label className={tw('flex items-center justify-between gap-3')}>
              <span>Opravit přepis hovoru pomocí AI</span>
              <AxoSwitch.Root
                checked={transcriptCorrectionEnabled}
                disabled={!aiEnabled}
                onCheckedChange={setTranscriptCorrectionEnabled}
              />
            </label>
            <p className={tw('-mt-2 text-label-small opacity-70')}>
              Po lokálním Whisper přepisu opraví zjevné chyby rozpoznání řeči. Použije stejného
              poskytovatele jako shrnutí níže.
            </p>

            <fieldset
              className={tw(
                'm-0 flex flex-col gap-4 rounded-md border border-solid p-4',
                'border-label-disabled'
              )}
            >
              <legend className={tw('px-1 text-label-medium font-medium')}>
                Aktivní poskytovatel pro sumarizaci
              </legend>

              <label className={tw('flex flex-col gap-1')}>
                <span>Jazyk shrnutí</span>
                <select
                  className={tw(
                    'rounded-md border border-solid px-3 py-2',
                    'border-label-disabled bg-background-primary'
                  )}
                  value={outputLanguage}
                  onChange={event =>
                    setOutputLanguage(
                      normalizeAiOutputLanguage(event.target.value)
                    )
                  }
                >
                  {AI_OUTPUT_LANGUAGE_OPTIONS.map(option => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className={tw('text-label-small opacity-70')}>
                  Jazyk, ve kterém AI sepíše shrnutí chatů a hovorů.
                </span>
              </label>

              <label className={tw('flex flex-col gap-1')}>
                <span>Poskytovatel</span>
                <select
                  className={tw(
                    'rounded-md border border-solid px-3 py-2',
                    'border-label-disabled bg-background-primary'
                  )}
                  value={provider}
                  onChange={event =>
                    handleProviderChange(event.target.value as AiProvider)
                  }
                >
                  {AI_PROVIDER_DEFINITIONS.map(def => (
                    <option key={def.id} value={def.id}>
                      {def.label}
                      {providerOptionSuffix(def, loaded)}
                    </option>
                  ))}
                </select>
                <span className={tw('text-label-small opacity-70')}>
                  {providerDef.billingNote}
                </span>
              </label>

              {provider === 'local' ? (
                <>
                  <MinutesLocalLlmPanel
                    embedded
                    selectedModelFileName={model}
                    onSelectedModelChange={setModel}
                  />
                  {aiEnabled && !localModelReady && (
                    <p className={tw('text-label-small text-label-primary')}>
                      {AI_LOCAL_MODEL_SAVE_BLOCKED_MESSAGE_CS}
                    </p>
                  )}
                </>
              ) : (
                <div className={tw('flex flex-col gap-4')}>
                  <label className={tw('flex flex-col gap-1')}>
                    <span>Model</span>
                    <select
                      className={tw(
                        'rounded-md border border-solid px-3 py-2',
                        'border-label-disabled bg-background-primary'
                      )}
                      value={model}
                      onChange={event => setModel(event.target.value)}
                    >
                      {providerDef.models.map(option => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <ProviderApiKeyField
                    def={providerDef}
                    loaded={loaded}
                    draft={providerDraft}
                    markedForRemoval={providerMarkedForRemoval}
                    onDraftChange={value => {
                      setApiKeyDrafts(prev => ({ ...prev, [provider]: value }));
                      if (value.length > 0) {
                        setRemoveKeyFlags(prev => ({
                          ...prev,
                          [provider]: false,
                        }));
                      }
                    }}
                    onMarkRemove={() => {
                      setRemoveKeyFlags(prev => ({
                        ...prev,
                        [provider]: true,
                      }));
                      setApiKeyDrafts(prev => ({
                        ...prev,
                        [provider]: '',
                      }));
                    }}
                    onUnmarkRemove={() => {
                      setRemoveKeyFlags(prev => ({
                        ...prev,
                        [provider]: false,
                      }));
                    }}
                  />
                </div>
              )}
            </fieldset>

            <p className={tw('text-label-small opacity-70')}>
              Klíče u ostatních poskytovatelů zůstávají uložené — přepněte
              poskytovatele výše a doplňte klíč, pokud ho chcete používat
              později. Uložení probíhá šifrovaně přes safeStorage OS.
            </p>
          </div>
        </AxoDialog.Body>
        <AxoDialog.Footer>
          {statusMessage && (
            <AxoDialog.FooterContent>
              <p className={tw('text-label-small')} role="status">
                {statusMessage}
              </p>
            </AxoDialog.FooterContent>
          )}
          <AxoDialog.Actions>
            <AxoDialog.Action
              variant="secondary"
              disabled={isBusy}
              onClick={handleTest}
            >
              Otestovat aktivního
            </AxoDialog.Action>
            <AxoDialog.Action
              variant="primary"
              disabled={isBusy || cannotEnableAiWithLocal}
              onClick={handleSave}
            >
              Uložit
            </AxoDialog.Action>
          </AxoDialog.Actions>
        </AxoDialog.Footer>
      </AxoDialog.Content>
    </AxoDialog.Root>
  );
}

export function MinutesSettingsHost(): JSX.Element {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (): void => {
      setOpen(true);
    };
    ipcRenderer.on('minutes:open-settings', handler);
    return () => {
      ipcRenderer.removeListener('minutes:open-settings', handler);
    };
  }, []);

  return <MinutesSettingsModal open={open} onOpenChange={setOpen} />;
}
