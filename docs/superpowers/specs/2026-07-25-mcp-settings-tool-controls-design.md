# MCP Settings and Tool Controls

## Goal

Move MCP configuration out of the AI settings dialog and give it a dedicated
Minutes menu item and dialog. Let the user enable or disable every MCP tool
independently while preserving the existing global server switch, token,
port, and webhook configuration.

## User Interface

The Minutes application menu gains a `Nastavení MCP…` item next to the
existing `Nastavení AI` and `Nastavení přepisů` items. It opens a dedicated
modal dialog through a new, narrowly scoped renderer event.

The dialog contains:

- the global MCP server switch;
- configured port and current runtime status;
- bearer-token creation and regeneration;
- `Povolit vše` and `Zakázat vše` tool actions;
- one switch for every MCP tool, grouped by purpose;
- the existing webhook endpoint configuration.

The MCP panel is removed from the AI settings dialog. AI settings return to
their original title and scope.

Tool groups are:

- recordings and meeting artifacts;
- transcription and summarization;
- conversations, contacts, and messages;
- calls;
- recording controls.

Disabling the global server preserves the selected tool configuration. Tool
controls remain editable while the server is disabled.

## Tool Catalog

A shared, static catalog is the single source of truth for public MCP tool
names, Czech display labels, group membership, and registration identifiers.
Both the settings UI and main-process registration code consume this catalog.

The current tools are enabled when no explicit saved tool selection exists.
Once a selection has been saved, it is authoritative. A tool introduced by a
future application version is therefore disabled for an existing configured
installation until the user explicitly enables it. A fresh installation
continues to begin with all tools available in that version enabled.

Unknown saved tool names are discarded during normalization. Resources are
not tool controls and remain registered whenever the MCP server is running.

## Persistence and Runtime

Automation settings gain an optional list of enabled tool names. The public
settings response exposes the normalized enabled list.

Saving server settings accepts the global state, port, and enabled tool list
as one atomic update. The main process validates every name against the
catalog, persists the result, and reconciles the MCP runtime.

When the server is running, changing a tool selection restarts the local MCP
listener on the same configured port. New MCP sessions then expose only the
selected tools. Existing sessions close as part of the normal restart.

The two capability registrars receive the enabled-name set. Each registrar
always registers its resources, but registers a tool only when the
corresponding name is enabled. Disabled tools are therefore absent from
`tools/list` and cannot be invoked.

## Menu and Modal Integration

The Electron menu callback sends `minutes:open-automation-settings` to the
main window. A new `MinutesAutomationSettingsHost` listens for this event and
owns the dedicated dialog state.

The host is mounted alongside the existing Minutes settings and extension
hosts in the application root. The existing automation settings panel becomes
the body of this dedicated dialog rather than being embedded in the AI modal.

## Compatibility

Existing settings files without an enabled-tool field normalize to all current
tools enabled, preserving the behavior of the already deployed MCP build.
Webhook settings, bearer-token hashes, and configured ports remain unchanged.

The MCP URL, authentication model, resources, tool schemas, and webhook
contracts do not change.

## Error Handling

Invalid ports and unknown tool names are rejected before settings are written.
If restarting the listener fails, the saved selection remains visible and the
dialog reports the existing runtime error state.

Bulk enable and disable operations only modify local dialog state until the
user saves the MCP configuration.

## Testing

Tests cover:

- legacy settings defaulting to all current tools;
- persistence and normalization of an explicit enabled-tool list;
- unknown tool rejection;
- capability registrars exposing only selected tools while preserving
  resources;
- the menu callback and dedicated renderer event;
- removal of the MCP panel from AI settings;
- global server disablement preserving tool selections;
- production type, lint, bundle, and VM startup verification.
