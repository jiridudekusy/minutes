// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import {
  APP_DISPLAY_NAME,
  formatMenuActionLabel,
  formatMinutesScopedMenuLabel,
} from './branding.std.ts';

export const MINUTES_MENU_LABEL = APP_DISPLAY_NAME;

export const MINUTES_MENU_SUMMARIZE_CURRENT_CHAT = 'Sumarizovat aktuální chat';

export const MINUTES_MENU_SUMMARIZE_UNREAD = 'Sumarizovat nepřečtené';

export const MINUTES_MENU_BOOKMARKS = 'Záložky';

export const MINUTES_MENU_AI_SETTINGS = 'Nastavení AI';

export const MINUTES_MENU_MCP_SETTINGS = 'Nastavení MCP';

export const MINUTES_MENU_CALL_TRANSCRIPTION_SETTINGS =
  formatMinutesScopedMenuLabel('Nastavení přepisů');

export const MINUTES_MENU_README = 'Příručka';

export const MINUTES_MENU_SHOW_LOG = 'Zobrazit log';

export const MINUTES_MENU_ABOUT = `O ${APP_DISPLAY_NAME}`;

export const MINUTES_MENU_OPEN_RECORDINGS = 'Otevřít nahrávky hovorů';

export const MINUTES_MENU_OPEN_SUMMARIES = 'Otevřít sumarizace chatů';

export const MINUTES_MENU_SUMMARIZE_1H = 'Sumarizovat poslední 1 hodinu';

export const MINUTES_MENU_SUMMARIZE_8H = 'Sumarizovat poslední 8 hodin';

export const MINUTES_MENU_SUMMARIZE_24H = 'Sumarizovat poslední 24 hodin';

export const MINUTES_MENU_SUMMARIZE_FROM_HERE =
  formatMenuActionLabel('Sumarizovat odtud');

export const MINUTES_MENU_MARK_UNREAD_FROM_HERE =
  formatMenuActionLabel('Nepřečteno odsud');

export const MINUTES_MENU_ADD_BOOKMARK =
  formatMenuActionLabel('Přidat do záložek');

export const MINUTES_MENU_ASK_AI_OPINION = formatMenuActionLabel(
  'Zeptat se na názor AI'
);

export const MINUTES_MENU_TRANSCRIPTION_QUEUE =
  formatMinutesScopedMenuLabel('Přepisy');
