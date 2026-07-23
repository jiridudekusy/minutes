// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/** IPC channel prefix for minutes main-process handlers. */
export const MINUTES_IPC_PREFIX = 'minutes';

/** Legacy subdirectory under Electron userData for call recordings. */
export const LEGACY_RECORDINGS_DIR_NAME = 'minutes/recordings';

/** Subdirectory under Electron userData for chat summaries. */
export const SUMMARIES_DIR_NAME = 'minutes/summaries';

/** Subdirectory under Electron userData for minutes settings. */
export const AI_SETTINGS_DIR_NAME = 'minutes';

/** Filename for AI provider settings (API key encrypted via OS safeStorage). */
export const AI_SETTINGS_FILE_NAME = 'ai-settings.json';

/** Default number of recent messages included in a chat summary. */
export const CHAT_SUMMARY_MESSAGE_LIMIT = 200;

/** Max conversations processed in one unread digest run. */
export const UNREAD_SUMMARY_MAX_CONVERSATIONS = 30;

/** Max unread messages loaded per conversation for digest. */
export const UNREAD_SUMMARY_PER_CHAT_LIMIT = 80;

/** Bump when testing that the latest build is running. */
export const MINUTES_BUILD_ID = '2026-07-09l';

/** Subdirectory under Electron userData for Whisper models. */
export const MODELS_DIR_NAME = 'minutes/models';

/** Sidecar filename suffix for speaker activity log (paired with recording base name). */
export const SPEAKER_ACTIVITY_FILE_SUFFIX = '.speaker-activity.json';
