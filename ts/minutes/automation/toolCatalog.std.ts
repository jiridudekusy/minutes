// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export const AUTOMATION_TOOL_CATALOG = [
  {
    name: 'list_recordings',
    label: 'Vypsat nahrávky',
    group: 'recordings',
  },
  {
    name: 'search_recordings',
    label: 'Hledat v nahrávkách',
    group: 'recordings',
  },
  {
    name: 'get_recording',
    label: 'Načíst nahrávku',
    group: 'recordings',
  },
  {
    name: 'transcribe_recording',
    label: 'Přepsat nahrávku',
    group: 'processing',
  },
  {
    name: 'summarize_recording',
    label: 'Shrnout nahrávku',
    group: 'processing',
  },
  {
    name: 'list_conversations',
    label: 'Vypsat konverzace',
    group: 'messages',
  },
  {
    name: 'list_contacts',
    label: 'Vypsat kontakty',
    group: 'messages',
  },
  {
    name: 'get_messages',
    label: 'Načíst zprávy',
    group: 'messages',
  },
  {
    name: 'search_messages',
    label: 'Hledat ve zprávách',
    group: 'messages',
  },
  {
    name: 'send_message',
    label: 'Odeslat zprávu',
    group: 'messages',
  },
  {
    name: 'set_message_reaction',
    label: 'Nastavit reakci na zprávu',
    group: 'messages',
  },
  {
    name: 'get_group',
    label: 'Načíst skupinu',
    group: 'groups',
  },
  {
    name: 'find_groups_by_member',
    label: 'Hledat skupiny podle člena',
    group: 'groups',
  },
  {
    name: 'create_group',
    label: 'Vytvořit skupinu',
    group: 'groups',
  },
  {
    name: 'update_group_metadata',
    label: 'Upravit údaje skupiny',
    group: 'groups',
  },
  {
    name: 'add_group_members',
    label: 'Přidat členy skupiny',
    group: 'groups',
  },
  {
    name: 'remove_group_members',
    label: 'Odebrat členy skupiny',
    group: 'groups',
  },
  {
    name: 'set_group_member_roles',
    label: 'Nastavit role členů',
    group: 'groups',
  },
  {
    name: 'set_group_permissions',
    label: 'Nastavit oprávnění skupiny',
    group: 'groups',
  },
  {
    name: 'set_group_disappearing_messages',
    label: 'Nastavit mizející zprávy',
    group: 'groups',
  },
  {
    name: 'leave_group',
    label: 'Opustit skupinu',
    group: 'groups',
  },
  {
    name: 'get_active_call',
    label: 'Zjistit aktivní hovor',
    group: 'calls',
  },
  {
    name: 'start_call',
    label: 'Zahájit hovor',
    group: 'calls',
  },
  {
    name: 'hang_up_call',
    label: 'Ukončit hovor',
    group: 'calls',
  },
  {
    name: 'start_audio_recording',
    label: 'Spustit audio nahrávání',
    group: 'recording-controls',
  },
  {
    name: 'start_video_recording',
    label: 'Spustit video nahrávání',
    group: 'recording-controls',
  },
  {
    name: 'pause_recording',
    label: 'Pozastavit nahrávání',
    group: 'recording-controls',
  },
  {
    name: 'resume_recording',
    label: 'Pokračovat v nahrávání',
    group: 'recording-controls',
  },
  {
    name: 'stop_recording',
    label: 'Ukončit nahrávání',
    group: 'recording-controls',
  },
] as const;

export type AutomationToolName =
  (typeof AUTOMATION_TOOL_CATALOG)[number]['name'];

export const ALL_AUTOMATION_TOOL_NAMES: ReadonlyArray<AutomationToolName> =
  AUTOMATION_TOOL_CATALOG.map(tool => tool.name);

const AUTOMATION_TOOL_NAMES = new Set<string>(ALL_AUTOMATION_TOOL_NAMES);

export function isAutomationToolName(
  value: string
): value is AutomationToolName {
  return AUTOMATION_TOOL_NAMES.has(value);
}

export function normalizeStoredAutomationToolNames(
  value: ReadonlyArray<string> | undefined
): ReadonlyArray<AutomationToolName> {
  if (value == null) {
    return [...ALL_AUTOMATION_TOOL_NAMES];
  }
  const selected = new Set(value.filter(isAutomationToolName));
  return ALL_AUTOMATION_TOOL_NAMES.filter(name => selected.has(name));
}

export function validateAutomationToolNames(
  value: ReadonlyArray<string>
): ReadonlyArray<AutomationToolName> {
  for (const name of value) {
    if (!isAutomationToolName(name)) {
      throw new Error(`Unknown MCP tool: ${name}`);
    }
  }
  return normalizeStoredAutomationToolNames(value);
}
