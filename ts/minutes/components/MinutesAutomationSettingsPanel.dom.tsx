// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
/* oxlint-disable better-tailwindcss/no-unknown-classes */
/* oxlint-disable jsx-a11y/control-has-associated-label */
/* oxlint-disable jsx-a11y/label-has-associated-control */

// This renderer component intentionally delegates actions to preload services.
// oxlint-disable-next-line signal-desktop/enforce-file-suffix
import { useCallback, useEffect, useState, type JSX } from 'react';

import { AxoSwitch } from '../../axo/AxoSwitch.dom.tsx';
import { tw } from '../../axo/tw.dom.tsx';
import { drop } from '../../util/drop.std.ts';
import {
  DEFAULT_AUTOMATION_PORT,
  type AutomationRuntimeStatus,
  type AutomationSettingsPublic,
} from '../automation/automationSettings.std.ts';
import {
  ALL_AUTOMATION_TOOL_NAMES,
  AUTOMATION_TOOL_CATALOG,
  type AutomationToolName,
} from '../automation/toolCatalog.std.ts';
import type { AutomationEventType } from '../automation/events.std.ts';
import {
  getAutomationSettings,
  getAutomationStatus,
  regenerateAutomationToken,
  removeAutomationWebhook,
  saveAutomationServerSettings,
  testAutomationWebhook,
  upsertAutomationWebhook,
} from '../automation/automationSettingsService.preload.ts';

const ALL_EVENTS: ReadonlyArray<AutomationEventType> = [
  'call.started',
  'call.ended',
  'recording.started',
  'recording.completed',
  'recording.failed',
  'transcript.completed',
  'summary.completed',
  'message.received',
  'message.sent',
];

const EMPTY_SETTINGS: AutomationSettingsPublic = {
  enabled: false,
  port: DEFAULT_AUTOMATION_PORT,
  hasToken: false,
  enabledTools: ALL_AUTOMATION_TOOL_NAMES,
  endpoints: [],
};

const TOOL_GROUPS = [
  { id: 'recordings', label: 'Nahrávky' },
  { id: 'processing', label: 'Přepisy a shrnutí' },
  { id: 'messages', label: 'Konverzace, kontakty a zprávy' },
  { id: 'groups', label: 'Skupiny' },
  { id: 'calls', label: 'Hovory' },
  { id: 'recording-controls', label: 'Ovládání nahrávání' },
] as const;

function statusLabel(status: AutomationRuntimeStatus): string {
  switch (status.state) {
    case 'running':
      return `Běží · ${status.url ?? ''}`;
    case 'port-unavailable':
      return `Port není dostupný${status.error ? ` · ${status.error}` : ''}`;
    case 'error':
      return `Chyba${status.error ? ` · ${status.error}` : ''}`;
    case 'stopped':
      return 'Zastaveno';
    default:
      return status.state;
  }
}

export function MinutesAutomationSettingsPanel(): JSX.Element {
  const [settings, setSettings] =
    useState<AutomationSettingsPublic>(EMPTY_SETTINGS);
  const [enabled, setEnabled] = useState(false);
  const [port, setPort] = useState(DEFAULT_AUTOMATION_PORT);
  const [enabledTools, setEnabledTools] = useState<
    ReadonlySet<AutomationToolName>
  >(new Set(ALL_AUTOMATION_TOOL_NAMES));
  const [runtimeStatus, setRuntimeStatus] = useState<AutomationRuntimeStatus>({
    state: 'stopped',
  });
  const [shownSecret, setShownSecret] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [nextSettings, nextStatus] = await Promise.all([
      getAutomationSettings(),
      getAutomationStatus(),
    ]);
    setSettings(nextSettings);
    setEnabled(nextSettings.enabled);
    setPort(nextSettings.port);
    setEnabledTools(new Set(nextSettings.enabledTools));
    setRuntimeStatus(nextStatus);
  }, []);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        await reload();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      }
    }
    drop(load());
  }, [reload]);

  const run = useCallback((operation: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    drop(
      (async () => {
        try {
          await operation();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error));
        } finally {
          setBusy(false);
        }
      })()
    );
  }, []);

  return (
    <fieldset
      className={tw(
        'm-0 mt-6 flex flex-col gap-4 rounded-md border border-solid p-4',
        'border-label-disabled'
      )}
    >
      <legend className={tw('text-label-medium px-1 font-medium')}>
        Lokální automatizace (MCP a webhooky)
      </legend>
      <p className={tw('text-label-small opacity-70')}>
        Server je dostupný jen na 127.0.0.1. Token se po vytvoření ukáže pouze
        jednou; Minutes ukládá jen jeho šifrovaný SHA‑256 hash.
      </p>

      <label className={tw('flex items-center justify-between gap-3')}>
        <span>Povolit MCP server</span>
        <AxoSwitch.Root checked={enabled} onCheckedChange={setEnabled} />
      </label>
      <label className={tw('flex flex-col gap-1')}>
        <span>Port</span>
        <input
          type="number"
          min={1}
          max={65535}
          className={tw(
            'rounded-md border border-solid px-3 py-2',
            'border-label-disabled bg-background-primary'
          )}
          value={port}
          onChange={event => setPort(Number(event.target.value))}
        />
      </label>
      <p className={tw('text-label-small')} role="status">
        Stav: {statusLabel(runtimeStatus)}
      </p>
      <div className={tw('flex flex-wrap gap-2')}>
        <button
          type="button"
          disabled={busy}
          className={tw('rounded-md border border-solid px-3 py-2')}
          onClick={() =>
            run(async () => {
              if (enabled && !settings.hasToken) {
                const tokenResult = await regenerateAutomationToken();
                setShownSecret(tokenResult.token);
              }
              const result = await saveAutomationServerSettings({
                enabled,
                port,
                enabledTools: ALL_AUTOMATION_TOOL_NAMES.filter(name =>
                  enabledTools.has(name)
                ),
              });
              setSettings(result.settings);
              setEnabledTools(new Set(result.settings.enabledTools));
              setRuntimeStatus(result.status);
              setMessage(
                enabled && !settings.hasToken
                  ? 'MCP je zapnuté. Nový token se zobrazil výše — uložte si ho nyní.'
                  : 'Nastavení MCP uloženo.'
              );
            })
          }
        >
          Uložit MCP
        </button>
        <button
          type="button"
          disabled={busy}
          className={tw('rounded-md border border-solid px-3 py-2')}
          onClick={() =>
            run(async () => {
              const result = await regenerateAutomationToken();
              setSettings(result.settings);
              setRuntimeStatus(result.status);
              setShownSecret(result.token);
              setMessage('Nový token byl vytvořen. Uložte si ho nyní.');
            })
          }
        >
          {settings.hasToken ? 'Vygenerovat nový token' : 'Vytvořit token'}
        </button>
      </div>

      {shownSecret && (
        <div className={tw('flex flex-col gap-2')}>
          <code className={tw('rounded-md p-2 break-all select-all')}>
            {shownSecret}
          </code>
          <button
            type="button"
            className={tw('self-start underline')}
            onClick={() => {
              drop(navigator.clipboard.writeText(shownSecret));
            }}
          >
            Kopírovat
          </button>
        </div>
      )}

      <div className={tw('mt-2 flex flex-col gap-3')}>
        <div
          className={tw('flex flex-wrap items-center justify-between gap-2')}
        >
          <span className={tw('font-medium')}>
            MCP nástroje ({enabledTools.size}/{ALL_AUTOMATION_TOOL_NAMES.length}
            )
          </span>
          <div className={tw('flex gap-3')}>
            <button
              type="button"
              className={tw('underline')}
              disabled={busy}
              onClick={() =>
                setEnabledTools(new Set(ALL_AUTOMATION_TOOL_NAMES))
              }
            >
              Povolit vše
            </button>
            <button
              type="button"
              className={tw('underline')}
              disabled={busy}
              onClick={() => setEnabledTools(new Set())}
            >
              Zakázat vše
            </button>
          </div>
        </div>
        <p className={tw('text-label-small opacity-70')}>
          Vypnutý nástroj se nezobrazí MCP klientům a nelze ho zavolat.
        </p>
        {TOOL_GROUPS.map(group => (
          <fieldset
            key={group.id}
            className={tw(
              'm-0 flex flex-col gap-2 rounded-md border border-solid p-3',
              'border-label-disabled'
            )}
          >
            <legend className={tw('text-label-small px-1 font-medium')}>
              {group.label}
            </legend>
            {AUTOMATION_TOOL_CATALOG.filter(
              tool => tool.group === group.id
            ).map(tool => (
              <label
                key={tool.name}
                className={tw('flex items-center justify-between gap-3')}
              >
                <span>
                  {tool.label}{' '}
                  <code className={tw('text-label-small opacity-70')}>
                    {tool.name}
                  </code>
                </span>
                <AxoSwitch.Root
                  checked={enabledTools.has(tool.name)}
                  onCheckedChange={checked => {
                    setEnabledTools(current => {
                      const next = new Set(current);
                      if (checked) {
                        next.add(tool.name);
                      } else {
                        next.delete(tool.name);
                      }
                      return next;
                    });
                  }}
                />
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      <div className={tw('mt-2 flex flex-col gap-2')}>
        <span className={tw('font-medium')}>Webhooky</span>
        <input
          type="url"
          placeholder="https://example.com/minutes-webhook"
          className={tw(
            'rounded-md border border-solid px-3 py-2',
            'border-label-disabled bg-background-primary'
          )}
          value={webhookUrl}
          onChange={event => setWebhookUrl(event.target.value)}
        />
        <button
          type="button"
          disabled={busy || webhookUrl.trim().length === 0}
          className={tw('self-start rounded-md border border-solid px-3 py-2')}
          onClick={() =>
            run(async () => {
              const result = await upsertAutomationWebhook({
                enabled: true,
                url: webhookUrl.trim(),
                eventTypes: ALL_EVENTS,
              });
              setShownSecret(result.secret ?? null);
              setWebhookUrl('');
              await reload();
              setMessage(
                'Webhook přidán. Zobrazený secret použijte k ověření HMAC podpisu.'
              );
            })
          }
        >
          Přidat webhook pro všechny události
        </button>
      </div>

      {settings.endpoints.map(endpoint => (
        <div
          key={endpoint.id}
          className={tw(
            'flex flex-col gap-2 rounded-md border border-solid p-3',
            'border-label-disabled'
          )}
        >
          <code className={tw('text-label-small break-all')}>
            {endpoint.url}
          </code>
          <span className={tw('text-label-small opacity-70')}>
            {endpoint.enabled ? 'Aktivní' : 'Vypnutý'} ·{' '}
            {endpoint.eventTypes.join(', ')}
          </span>
          {endpoint.lastError && (
            <span className={tw('text-label-small')}>{endpoint.lastError}</span>
          )}
          <div className={tw('flex gap-3')}>
            <button
              type="button"
              className={tw('underline')}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await testAutomationWebhook(endpoint.id);
                  setMessage('Testovací webhook byl odeslán.');
                })
              }
            >
              Otestovat
            </button>
            <button
              type="button"
              className={tw('underline')}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  setSettings(await removeAutomationWebhook(endpoint.id));
                  setMessage('Webhook odstraněn.');
                })
              }
            >
              Odstranit
            </button>
          </div>
        </div>
      ))}
      {message && (
        <p className={tw('text-label-small')} role="status">
          {message}
        </p>
      )}
    </fieldset>
  );
}
