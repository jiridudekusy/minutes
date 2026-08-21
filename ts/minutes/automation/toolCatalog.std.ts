// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export type AutomationToolAccess = 'read' | 'write' | 'destructive';

export const AUTOMATION_TOOL_CATALOG = [
  {
    name: 'list_recordings',
    label: 'Vypsat nahrávky',
    group: 'recordings',
    access: 'read',
  },
  {
    name: 'search_recordings',
    label: 'Hledat v nahrávkách',
    group: 'recordings',
    access: 'read',
  },
  {
    name: 'get_recording',
    label: 'Načíst nahrávku',
    group: 'recordings',
    access: 'read',
  },
  {
    name: 'transcribe_recording',
    label: 'Přepsat nahrávku',
    group: 'processing',
    access: 'write',
  },
  {
    name: 'summarize_recording',
    label: 'Shrnout nahrávku',
    group: 'processing',
    access: 'write',
  },
  {
    name: 'list_conversations',
    label: 'Vypsat konverzace',
    group: 'messages',
    access: 'read',
  },
  {
    name: 'list_contacts',
    label: 'Vypsat kontakty',
    group: 'messages',
    access: 'read',
  },
  {
    name: 'get_messages',
    label: 'Načíst zprávy',
    group: 'messages',
    access: 'read',
  },
  {
    name: 'get_message',
    label: 'Načíst jednu zprávu',
    group: 'messages',
    access: 'read',
  },
  {
    name: 'search_messages',
    label: 'Hledat ve zprávách',
    group: 'messages',
    access: 'read',
  },
  {
    name: 'get_attachment_directories',
    label: 'Zjistit adresáře příloh',
    group: 'messages',
    access: 'read',
  },
  {
    name: 'download_attachment',
    label: 'Stáhnout přílohu',
    group: 'messages',
    access: 'write',
  },
  {
    name: 'send_message',
    label: 'Odeslat zprávu',
    group: 'messages',
    access: 'write',
  },
  {
    name: 'set_message_reaction',
    label: 'Nastavit reakci na zprávu',
    group: 'messages',
    access: 'destructive',
  },
  {
    name: 'get_group',
    label: 'Načíst skupinu',
    group: 'groups',
    access: 'read',
  },
  {
    name: 'find_groups_by_member',
    label: 'Hledat skupiny podle člena',
    group: 'groups',
    access: 'read',
  },
  {
    name: 'create_group',
    label: 'Vytvořit skupinu',
    group: 'groups',
    access: 'write',
  },
  {
    name: 'update_group_metadata',
    label: 'Upravit údaje skupiny',
    group: 'groups',
    access: 'write',
  },
  {
    name: 'add_group_members',
    label: 'Přidat členy skupiny',
    group: 'groups',
    access: 'write',
  },
  {
    name: 'remove_group_members',
    label: 'Odebrat členy skupiny',
    group: 'groups',
    access: 'destructive',
  },
  {
    name: 'set_group_member_roles',
    label: 'Nastavit role členů',
    group: 'groups',
    access: 'write',
  },
  {
    name: 'set_group_permissions',
    label: 'Nastavit oprávnění skupiny',
    group: 'groups',
    access: 'write',
  },
  {
    name: 'set_group_disappearing_messages',
    label: 'Nastavit mizející zprávy',
    group: 'groups',
    access: 'write',
  },
  {
    name: 'leave_group',
    label: 'Opustit skupinu',
    group: 'groups',
    access: 'destructive',
  },
  {
    name: 'terminate_group',
    label: 'Ukončit skupinu',
    group: 'groups',
    access: 'destructive',
  },
  {
    name: 'get_active_call',
    label: 'Zjistit aktivní hovor',
    group: 'calls',
    access: 'read',
  },
  {
    name: 'start_call',
    label: 'Zahájit hovor',
    group: 'calls',
    access: 'write',
  },
  {
    name: 'hang_up_call',
    label: 'Ukončit hovor',
    group: 'calls',
    access: 'destructive',
  },
  {
    name: 'start_audio_recording',
    label: 'Spustit audio nahrávání',
    group: 'recording-controls',
    access: 'write',
  },
  {
    name: 'start_video_recording',
    label: 'Spustit video nahrávání',
    group: 'recording-controls',
    access: 'write',
  },
  {
    name: 'pause_recording',
    label: 'Pozastavit nahrávání',
    group: 'recording-controls',
    access: 'write',
  },
  {
    name: 'resume_recording',
    label: 'Pokračovat v nahrávání',
    group: 'recording-controls',
    access: 'write',
  },
  {
    name: 'stop_recording',
    label: 'Ukončit nahrávání',
    group: 'recording-controls',
    access: 'destructive',
  },
] as const;

export type AutomationToolName =
  (typeof AUTOMATION_TOOL_CATALOG)[number]['name'];

export const ALL_AUTOMATION_TOOL_NAMES: ReadonlyArray<AutomationToolName> =
  AUTOMATION_TOOL_CATALOG.map(tool => tool.name);

export function getAutomationToolNamesByAccess(
  access: AutomationToolAccess
): ReadonlyArray<AutomationToolName> {
  return AUTOMATION_TOOL_CATALOG.filter(tool => tool.access === access).map(
    tool => tool.name
  );
}

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
