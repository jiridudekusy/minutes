// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
/* oxlint-disable better-tailwindcss/no-unknown-classes */
/* oxlint-disable jsx-a11y/control-has-associated-label */
/* oxlint-disable jsx-a11y/label-has-associated-control */

// This renderer component intentionally delegates actions to preload services.
// oxlint-disable-next-line signal-desktop/enforce-file-suffix
import { useCallback, useEffect, useState, type JSX } from 'react';

import { AxoButton } from '../../axo/AxoButton.dom.tsx';
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
  getAutomationToolNamesByAccess,
  type AutomationToolAccess,
  type AutomationToolName,
} from '../automation/toolCatalog.std.ts';
import type { AutomationEventType } from '../automation/events.std.ts';
import {
  getAutomationSettings,
  getAutomationStatus,
  regenerateAutomationToken,
  removeAutomationWebhook,
  saveAutomationServerSettings,
  saveAutomationWebhookSettings,
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
  webhooksEnabled: false,
  port: DEFAULT_AUTOMATION_PORT,
  allowedHosts: [],
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

const TOOL_ACCESS_LEVELS: ReadonlyArray<
  Readonly<{
    id: AutomationToolAccess;
    label: string;
    description: string;
    tone: 'normal' | 'warning';
  }>
> = [
  {
    id: 'read',
    label: 'Pouze čtení',
    description: 'Vyhledávání a načítání dat bez změny stavu v Signalu.',
    tone: 'normal',
  },
  {
    id: 'write',
    label: 'Běžné zápisy',
    description: 'Odesílání zpráv, přepisy, úpravy skupin, hovory a nahrávání.',
    tone: 'normal',
  },
  {
    id: 'destructive',
    label: 'Destruktivní zápisy',
    description:
      'Mazání reakcí, odebírání členů, ukončení skupin, hovorů nebo nahrávání.',
    tone: 'warning',
  },
];

function statusLabel(status: AutomationRuntimeStatus): string {
  switch (status.state) {
    case 'running':
      return 'Běží';
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

function parseCommaSeparated(value: string): ReadonlyArray<string> {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function MinutesAutomationSettingsPanel(): JSX.Element {
  const [settings, setSettings] =
    useState<AutomationSettingsPublic>(EMPTY_SETTINGS);
  const [enabled, setEnabled] = useState(false);
  const [webhooksEnabled, setWebhooksEnabled] = useState(false);
  const [port, setPort] = useState(DEFAULT_AUTOMATION_PORT);
  const [allowedHosts, setAllowedHosts] = useState('');
  const [enabledTools, setEnabledTools] = useState<
    ReadonlySet<AutomationToolName>
  >(new Set(ALL_AUTOMATION_TOOL_NAMES));
  const [runtimeStatus, setRuntimeStatus] = useState<AutomationRuntimeStatus>({
    state: 'stopped',
  });
  const [shownMcpToken, setShownMcpToken] = useState<string | null>(null);
  const [mcpTokenVisible, setMcpTokenVisible] = useState(false);
  const [shownWebhookSecret, setShownWebhookSecret] = useState<string | null>(
    null
  );
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEventTypes, setWebhookEventTypes] = useState<
    ReadonlySet<AutomationEventType>
  >(new Set(ALL_EVENTS));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [nextSettings, nextStatus] = await Promise.all([
      getAutomationSettings(),
      getAutomationStatus(),
    ]);
    setSettings(nextSettings);
    setEnabled(nextSettings.enabled);
    setWebhooksEnabled(nextSettings.webhooksEnabled);
    setPort(nextSettings.port);
    setAllowedHosts(nextSettings.allowedHosts.join(', '));
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

  const mcpUrl = `http://127.0.0.1:${port}/mcp`;

  const copyText = useCallback(
    (value: string, successMessage: string) => {
      run(async () => {
        await navigator.clipboard.writeText(value);
        setMessage(successMessage);
      });
    },
    [run]
  );

  const setAccessEnabled = useCallback(
    (access: AutomationToolAccess, checked: boolean) => {
      const names = getAutomationToolNamesByAccess(access);
      setEnabledTools(current => {
        const next = new Set(current);
        for (const name of names) {
          if (checked) {
            next.add(name);
          } else {
            next.delete(name);
          }
        }
        return next;
      });
    },
    []
  );

  return (
    <div className={tw('flex flex-col gap-5 py-4')}>
      <section
        className={tw(
          'flex flex-col gap-4 rounded-lg border border-solid p-4',
          'border-label-disabled bg-background-primary'
        )}
      >
        <div className={tw('flex items-start justify-between gap-4')}>
          <div>
            <h2 className={tw('text-label-medium m-0 font-medium')}>
              MCP server
            </h2>
            <p className={tw('text-label-small mt-1 opacity-70')}>
              Lokální Streamable HTTP server pro AI klienty a automatizace.
            </p>
          </div>
          <AxoSwitch.Root checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className={tw('grid grid-cols-1 gap-4 sm:grid-cols-2')}>
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
          <label className={tw('flex flex-col gap-1')}>
            <span>Povolení hosté</span>
            <input
              type="text"
              placeholder="host.docker.internal"
              className={tw(
                'rounded-md border border-solid px-3 py-2',
                'border-label-disabled bg-background-primary'
              )}
              value={allowedHosts}
              onChange={event => setAllowedHosts(event.target.value)}
            />
          </label>
        </div>
        <p className={tw('text-label-small -mt-2 opacity-70')}>
          Hostnames oddělené čárkami, bez schématu a portu. 127.0.0.1 a
          localhost jsou povolené vždy; pro Docker Desktop přidejte
          host.docker.internal.
        </p>

        <div className={tw('flex flex-col gap-1')}>
          <span>MCP URL</span>
          <div className={tw('flex min-w-0 items-center gap-2')}>
            <input
              aria-label="MCP URL"
              readOnly
              className={tw(
                'min-w-0 grow rounded-md border border-solid px-3 py-2 font-mono',
                'border-label-disabled bg-background-secondary'
              )}
              value={mcpUrl}
            />
            <AxoButton.Root
              variant="strong-secondary"
              size="sm"
              symbol="copy"
              disabled={busy}
              onClick={() => copyText(mcpUrl, 'MCP URL zkopírována.')}
            >
              Kopírovat URL
            </AxoButton.Root>
          </div>
        </div>

        <div
          className={tw('flex flex-wrap items-center justify-between gap-3')}
        >
          <p className={tw('text-label-small m-0')} role="status">
            Stav: {statusLabel(runtimeStatus)}
          </p>
          <AxoButton.Root
            variant="strong-primary"
            size="md"
            pending={busy}
            onClick={() =>
              run(async () => {
                const needsToken = enabled && !settings.hasToken;
                if (needsToken) {
                  const tokenResult = await regenerateAutomationToken();
                  setShownMcpToken(tokenResult.token);
                  setMcpTokenVisible(false);
                }
                const result = await saveAutomationServerSettings({
                  enabled,
                  port,
                  allowedHosts: parseCommaSeparated(allowedHosts),
                  enabledTools: ALL_AUTOMATION_TOOL_NAMES.filter(name =>
                    enabledTools.has(name)
                  ),
                });
                setSettings(result.settings);
                setAllowedHosts(result.settings.allowedHosts.join(', '));
                setEnabledTools(new Set(result.settings.enabledTools));
                setRuntimeStatus(result.status);
                setMessage(
                  needsToken
                    ? 'MCP je zapnuté. Nový token zkopírujte a bezpečně uložte.'
                    : 'Nastavení MCP uloženo.'
                );
              })
            }
          >
            Uložit MCP
          </AxoButton.Root>
        </div>
      </section>

      <section
        className={tw(
          'flex flex-col gap-3 rounded-lg border border-solid p-4',
          'border-label-disabled bg-background-primary'
        )}
      >
        <div className={tw('flex items-start justify-between gap-3')}>
          <div>
            <h2 className={tw('text-label-medium m-0 font-medium')}>
              Přístupový token
            </h2>
            <p className={tw('text-label-small mt-1 opacity-70')}>
              {settings.hasToken
                ? 'Token je nastavený. Minutes ukládá pouze jeho šifrovaný SHA‑256 hash, proto ho nelze znovu načíst.'
                : 'Token zatím není nastavený. Při zapnutí serveru se vytvoří automaticky.'}
            </p>
          </div>
          <span
            className={tw(
              'text-label-small shrink-0 rounded-full px-2 py-1',
              settings.hasToken
                ? 'bg-affirmative-tint text-affirmative'
                : 'bg-secondary opacity-70'
            )}
          >
            {settings.hasToken ? 'Nastaven' : 'Chybí'}
          </span>
        </div>

        {shownMcpToken && (
          <div
            className={tw(
              'flex flex-col gap-2 rounded-md border border-solid p-3',
              'border-label-disabled bg-background-secondary'
            )}
          >
            <strong>Nový token — zobrazí se pouze nyní</strong>
            <input
              aria-label="Nový MCP token"
              readOnly
              type={mcpTokenVisible ? 'text' : 'password'}
              className={tw(
                'w-full rounded-md border border-solid px-3 py-2 font-mono',
                'border-label-disabled bg-background-primary'
              )}
              value={shownMcpToken}
            />
            <div className={tw('flex flex-wrap gap-2')}>
              <AxoButton.Root
                variant="strong-secondary"
                size="sm"
                symbol="copy"
                onClick={() => copyText(shownMcpToken, 'MCP token zkopírován.')}
              >
                Kopírovat token
              </AxoButton.Root>
              <AxoButton.Root
                variant="subtle-secondary"
                size="sm"
                pressed={mcpTokenVisible}
                onClick={() => setMcpTokenVisible(current => !current)}
              >
                {mcpTokenVisible ? 'Skrýt hodnotu' : 'Zobrazit hodnotu'}
              </AxoButton.Root>
              <AxoButton.Root
                variant="subtle-secondary"
                size="sm"
                onClick={() => {
                  setShownMcpToken(null);
                  setMcpTokenVisible(false);
                }}
              >
                Zavřít
              </AxoButton.Root>
            </div>
          </div>
        )}

        <div>
          <AxoButton.Root
            variant={
              settings.hasToken ? 'subtle-destructive' : 'strong-secondary'
            }
            size="sm"
            symbol="key"
            pending={busy}
            onClick={() =>
              run(async () => {
                const result = await regenerateAutomationToken();
                setSettings(result.settings);
                setRuntimeStatus(result.status);
                setShownMcpToken(result.token);
                setMcpTokenVisible(false);
                setMessage(
                  settings.hasToken
                    ? 'Token byl nahrazen. Starý token už nefunguje.'
                    : 'Nový token byl vytvořen.'
                );
              })
            }
          >
            {settings.hasToken ? 'Nahradit token' : 'Vytvořit token'}
          </AxoButton.Root>
          {settings.hasToken && (
            <p className={tw('text-label-small mt-2 opacity-70')}>
              Nahrazení tokenu okamžitě odpojí klienty používající starou
              hodnotu.
            </p>
          )}
        </div>
      </section>

      <section
        className={tw(
          'flex flex-col gap-4 rounded-lg border border-solid p-4',
          'border-label-disabled bg-background-primary'
        )}
      >
        <div
          className={tw('flex flex-wrap items-center justify-between gap-2')}
        >
          <div>
            <h2 className={tw('text-label-medium m-0 font-medium')}>
              Oprávnění MCP nástrojů
            </h2>
            <p className={tw('text-label-small mt-1 opacity-70')}>
              Povolte jen schopnosti, které má MCP klient skutečně potřebovat.
            </p>
          </div>
          <span className={tw('text-label-small')}>
            MCP nástroje ({enabledTools.size}/{ALL_AUTOMATION_TOOL_NAMES.length}
            )
          </span>
        </div>

        <div className={tw('grid grid-cols-1 gap-3 md:grid-cols-3')}>
          {TOOL_ACCESS_LEVELS.map(access => {
            const names = getAutomationToolNamesByAccess(access.id);
            const enabledCount = names.filter(name =>
              enabledTools.has(name)
            ).length;
            return (
              <label
                key={access.id}
                className={tw(
                  'flex cursor-pointer flex-col gap-3 rounded-md border border-solid p-3',
                  access.tone === 'warning'
                    ? 'border-label-destructive'
                    : 'border-label-disabled'
                )}
              >
                <div className={tw('flex items-center justify-between gap-3')}>
                  <strong>{access.label}</strong>
                  <AxoSwitch.Root
                    checked={enabledCount > 0}
                    disabled={busy}
                    onCheckedChange={checked =>
                      setAccessEnabled(access.id, checked)
                    }
                  />
                </div>
                <span className={tw('text-label-small opacity-70')}>
                  {access.description}
                </span>
                <span className={tw('text-label-small')}>
                  Povoleno {enabledCount} z {names.length}
                </span>
              </label>
            );
          })}
        </div>

        <details
          className={tw('border-label-disabled rounded-md border border-solid')}
        >
          <summary className={tw('cursor-pointer px-3 py-2 font-medium')}>
            Pokročilý výběr jednotlivých nástrojů
          </summary>
          <div
            className={tw(
              'border-label-disabled flex flex-col gap-3 border-t border-solid p-3'
            )}
          >
            <div className={tw('flex flex-wrap justify-end gap-3')}>
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
            <div className={tw('grid grid-cols-1 gap-3 md:grid-cols-2')}>
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
          </div>
        </details>
      </section>

      <section
        className={tw(
          'flex flex-col gap-3 rounded-lg border border-solid p-4',
          'border-label-disabled bg-background-primary'
        )}
      >
        <h2 className={tw('text-label-medium m-0 font-medium')}>Webhooky</h2>
        <label className={tw('flex items-center justify-between gap-3')}>
          <span>Povolit odesílání webhooků</span>
          <AxoSwitch.Root
            checked={webhooksEnabled}
            onCheckedChange={setWebhooksEnabled}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          className={tw('self-start rounded-md border border-solid px-3 py-2')}
          onClick={() =>
            run(async () => {
              const nextSettings = await saveAutomationWebhookSettings({
                enabled: webhooksEnabled,
              });
              setSettings(nextSettings);
              setMessage('Nastavení webhooků uloženo.');
            })
          }
        >
          Uložit webhooky
        </button>
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
        <fieldset
          className={tw(
            'm-0 grid grid-cols-1 gap-2 rounded-md border border-solid p-3',
            'border-label-disabled sm:grid-cols-2'
          )}
        >
          <legend className={tw('text-label-small px-1 font-medium')}>
            Odebírané události
          </legend>
          {ALL_EVENTS.map(eventType => (
            <label key={eventType} className={tw('flex items-center gap-2')}>
              <input
                type="checkbox"
                checked={webhookEventTypes.has(eventType)}
                onChange={event => {
                  setWebhookEventTypes(current => {
                    const next = new Set(current);
                    if (event.target.checked) {
                      next.add(eventType);
                    } else {
                      next.delete(eventType);
                    }
                    return next;
                  });
                }}
              />
              <code className={tw('text-label-small')}>{eventType}</code>
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          disabled={
            busy ||
            webhookUrl.trim().length === 0 ||
            webhookEventTypes.size === 0
          }
          className={tw('self-start rounded-md border border-solid px-3 py-2')}
          onClick={() =>
            run(async () => {
              const result = await upsertAutomationWebhook({
                enabled: true,
                url: webhookUrl.trim(),
                eventTypes: ALL_EVENTS.filter(eventType =>
                  webhookEventTypes.has(eventType)
                ),
              });
              setShownWebhookSecret(result.secret ?? null);
              setWebhookUrl('');
              await reload();
              setMessage(
                'Webhook přidán. Zobrazený secret použijte k ověření HMAC podpisu.'
              );
            })
          }
        >
          Přidat webhook
        </button>

        {shownWebhookSecret && (
          <div
            className={tw(
              'flex flex-col gap-2 rounded-md border border-solid p-3',
              'border-label-disabled bg-background-secondary'
            )}
          >
            <strong>Nový webhook secret — zobrazí se pouze nyní</strong>
            <code className={tw('break-all select-all')}>
              {shownWebhookSecret}
            </code>
            <div className={tw('flex flex-wrap gap-2')}>
              <AxoButton.Root
                variant="strong-secondary"
                size="sm"
                symbol="copy"
                onClick={() =>
                  copyText(shownWebhookSecret, 'Webhook secret zkopírován.')
                }
              >
                Kopírovat secret
              </AxoButton.Root>
              <AxoButton.Root
                variant="subtle-secondary"
                size="sm"
                onClick={() => setShownWebhookSecret(null)}
              >
                Zavřít
              </AxoButton.Root>
            </div>
          </div>
        )}

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
            <label className={tw('flex items-center justify-between gap-3')}>
              <span>Endpoint aktivní</span>
              <AxoSwitch.Root
                checked={endpoint.enabled}
                disabled={busy}
                onCheckedChange={checked =>
                  run(async () => {
                    await upsertAutomationWebhook({
                      id: endpoint.id,
                      enabled: checked,
                      url: endpoint.url,
                      eventTypes: endpoint.eventTypes,
                    });
                    await reload();
                  })
                }
              />
            </label>
            <fieldset
              className={tw(
                'm-0 grid grid-cols-1 gap-2 rounded-md border border-solid p-3',
                'border-label-disabled sm:grid-cols-2'
              )}
            >
              <legend className={tw('text-label-small px-1 font-medium')}>
                Odebírané události
              </legend>
              {ALL_EVENTS.map(eventType => (
                <label
                  key={eventType}
                  className={tw('flex items-center gap-2')}
                >
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={endpoint.eventTypes.includes(eventType)}
                    onChange={event =>
                      run(async () => {
                        const eventTypes = event.target.checked
                          ? [...endpoint.eventTypes, eventType]
                          : endpoint.eventTypes.filter(
                              current => current !== eventType
                            );
                        if (eventTypes.length === 0) {
                          throw new Error(
                            'Webhook musí odebírat alespoň jednu událost.'
                          );
                        }
                        await upsertAutomationWebhook({
                          id: endpoint.id,
                          enabled: endpoint.enabled,
                          url: endpoint.url,
                          eventTypes,
                        });
                        await reload();
                      })
                    }
                  />
                  <code className={tw('text-label-small')}>{eventType}</code>
                </label>
              ))}
            </fieldset>
            {endpoint.lastError && (
              <span className={tw('text-label-small')}>
                {endpoint.lastError}
              </span>
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
      </section>
      {message && (
        <p className={tw('text-label-small')} role="status">
          {message}
        </p>
      )}
    </div>
  );
}
