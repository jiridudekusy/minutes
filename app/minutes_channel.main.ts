// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { join } from 'node:path';
import { mkdir, open, stat, writeFile } from 'node:fs/promises';

import { app, desktopCapturer, ipcMain, shell } from 'electron';

import { createLogger } from '../ts/logging/log.std.ts';
import {
  LEGACY_RECORDINGS_DIR_NAME,
  SPEAKER_ACTIVITY_FILE_SUFFIX,
  SUMMARIES_DIR_NAME,
} from '../ts/minutes/constants.std.ts';
import {
  migrateLegacyRecordingsDirectory,
  resolveMinutesRecordingsDir,
} from '../ts/minutes/recordingsDirectory.node.ts';
import { RECORDING_PCM_SIDECAR_SUFFIX } from '../ts/minutes/whisperSettings.std.ts';
import type { SpeakerActivityLog } from '../ts/minutes/speakerActivity.std.ts';
import {
  getAiSettingsPublic,
  getAiApiKey,
  assertAiSummaryReady,
  saveAiSettings,
} from '../ts/minutes/aiSettings.main.ts';
import type {
  AiSettingsSaveInput,
  AiProvider,
} from '../ts/minutes/aiSettings.std.ts';
import {
  addBookmark,
  listBookmarks,
  removeBookmark,
} from '../ts/minutes/bookmarks.main.ts';
import type { AddBookmarkInput } from '../ts/minutes/bookmarks.std.ts';
import {
  createExtensionProgressSender,
  generateCallRecordingSummary,
  getCallSummaryExtensionPublic,
  installCallSummaryExtension,
  saveCallSummaryTranscribeSettings,
  transcribeCallRecording,
} from '../ts/minutes/callSummaryExtension.main.ts';
import {
  cancelLocalLlmExtensionDownload,
  createLocalLlmProgressSender,
  getLocalLlmExtensionPublic,
  installLocalLlmExtension,
} from '../ts/minutes/localLlmExtension.main.ts';
import {
  listCallRecordings,
  loadCallRecordingOutput,
} from '../ts/minutes/recordingsCatalog.main.ts';
import { cancelTranscriptionJob } from '../ts/minutes/transcriptionCancel.main.ts';
import {
  testAiConnectionForProvider,
  listAiModelsForProvider,
  generateAiSummaryForProvider,
  generateAiOpinionForProvider,
  generateUnreadConversationSummaryForProvider,
} from '../ts/minutes/aiSummaryService.main.ts';
import { readMinutesReadmeContent } from './minutes_readme.main.ts';
import {
  checkForAppUpdate,
  createAppUpdateProgressSender,
  downloadAndInstallAppUpdate,
  downloadAppUpdate,
  getPendingAppUpdate,
  installPendingAppUpdate,
  resolveStartupAppUpdateState,
} from '../ts/minutes/appUpdate.main.ts';
import { initializeMinutesVideoRecordingChannel } from './minutes_video_recording_channel.main.ts';

const log = createLogger('minutes/main');

function sanitizeFilePart(value: string): string {
  return value
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function formatTimestampForFilename(epochMs: number): string {
  return new Date(epochMs).toISOString().replace(/[:.]/g, '-');
}

function getSummariesDir(): string {
  return join(app.getPath('userData'), SUMMARIES_DIR_NAME);
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function initializeMinutesChannel(): Promise<void> {
  const recordingsDir = resolveMinutesRecordingsDir(app.getPath('documents'));
  const migration = await migrateLegacyRecordingsDirectory({
    legacyDir: join(app.getPath('userData'), LEGACY_RECORDINGS_DIR_NAME),
    targetDir: recordingsDir,
  });
  if (migration.migratedFiles.length > 0) {
    log.info(
      `migrated ${migration.migratedFiles.length} recording artifacts to Documents`
    );
  }
  if (migration.conflicts.length > 0) {
    log.warn(
      `left ${migration.conflicts.length} conflicting recording artifacts in legacy storage`
    );
  }

  initializeMinutesVideoRecordingChannel({
    ipcMain,
    recordingsDir,
  });

  ipcMain.handle('minutes:get-loopback-audio-source', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
    });

    const primary =
      sources.find(source => /screen|display|entire/i.test(source.name)) ??
      sources[0];

    if (!primary) {
      log.warn('no desktop capturer sources for loopback audio');
      return '';
    }

    return primary.id;
  });

  ipcMain.handle(
    'minutes:save-recording',
    async (
      _event,
      options: {
        conversationId: string;
        conversationTitle: string;
        callMode?: string;
        eraId?: string;
        startedAt: number;
        endedAt: number;
        data: Uint8Array<ArrayBuffer>;
        pcm48?: Float32Array<ArrayBuffer>;
        speakerActivityLog?: SpeakerActivityLog | null;
      }
    ) => {
      await ensureDir(recordingsDir);

      const baseName = [
        formatTimestampForFilename(options.startedAt),
        sanitizeFilePart(options.conversationTitle),
        sanitizeFilePart(options.conversationId.slice(0, 8)),
      ].join('_');

      const filePath = join(recordingsDir, `${baseName}.mp3`);
      await writeFile(filePath, Buffer.from(options.data));

      if (options.pcm48 && options.pcm48.length > 0) {
        const pcmPath = join(
          recordingsDir,
          `${baseName}${RECORDING_PCM_SIDECAR_SUFFIX}`
        );
        await writeFile(
          pcmPath,
          Buffer.from(
            options.pcm48.buffer,
            options.pcm48.byteOffset,
            options.pcm48.byteLength
          )
        );
      }

      const metadataPath = join(recordingsDir, `${baseName}.json`);
      await writeFile(
        metadataPath,
        JSON.stringify(
          {
            conversationId: options.conversationId,
            conversationTitle: options.conversationTitle,
            callMode: options.callMode,
            eraId: options.eraId,
            startedAt: options.startedAt,
            endedAt: options.endedAt,
            durationMs: options.endedAt - options.startedAt,
            audioFile: `${baseName}.mp3`,
            speakerActivityFile:
              options.speakerActivityLog != null
                ? `${baseName}${SPEAKER_ACTIVITY_FILE_SUFFIX}`
                : undefined,
          },
          null,
          2
        ),
        'utf8'
      );

      if (options.speakerActivityLog != null) {
        const speakerActivityPath = join(
          recordingsDir,
          `${baseName}${SPEAKER_ACTIVITY_FILE_SUFFIX}`
        );
        await writeFile(
          speakerActivityPath,
          JSON.stringify(options.speakerActivityLog, null, 2),
          'utf8'
        );
      }

      return filePath;
    }
  );

  ipcMain.handle(
    'minutes:save-chat-summary',
    async (
      _event,
      options: {
        conversationId: string;
        conversationTitle: string;
        generatedAt: number;
        messageCount: number;
        scope?: string;
        summaryText: string;
        aiModel?: string;
        aiProvider?: string;
      }
    ) => {
      const summariesDir = getSummariesDir();
      await ensureDir(summariesDir);

      const baseName = [
        formatTimestampForFilename(options.generatedAt),
        sanitizeFilePart(options.conversationTitle),
        'summary',
      ].join('_');

      const filePath = join(summariesDir, `${baseName}.md`);
      await writeFile(filePath, options.summaryText, 'utf8');

      const metadataPath = join(summariesDir, `${baseName}.json`);
      await writeFile(
        metadataPath,
        JSON.stringify(
          {
            conversationId: options.conversationId,
            conversationTitle: options.conversationTitle,
            generatedAt: options.generatedAt,
            messageCount: options.messageCount,
            scope: options.scope,
            summaryFile: `${baseName}.md`,
            aiProvider: options.aiProvider,
            aiModel: options.aiModel,
          },
          null,
          2
        ),
        'utf8'
      );

      return filePath;
    }
  );

  ipcMain.handle('minutes:get-readme-content', async () => {
    return readMinutesReadmeContent();
  });

  ipcMain.handle('minutes:open-recordings-folder', async () => {
    await ensureDir(recordingsDir);
    await shell.openPath(recordingsDir);
  });

  ipcMain.handle('minutes:list-call-recordings', async () => {
    await ensureDir(recordingsDir);
    return listCallRecordings(recordingsDir);
  });

  ipcMain.handle(
    'minutes:load-call-recording-output',
    async (
      _event,
      entry: {
        recordingPath: string;
        conversationId: string;
        conversationTitle: string;
        hasTranscript: boolean;
        hasSummary: boolean;
        transcriptPath?: string;
        summaryPath?: string;
      }
    ) => {
      return loadCallRecordingOutput(entry);
    }
  );

  ipcMain.handle('minutes:open-summaries-folder', async () => {
    const summariesDir = getSummariesDir();
    await ensureDir(summariesDir);
    await shell.openPath(summariesDir);
  });

  ipcMain.handle('minutes:read-recent-logs', async () => {
    const logPath = join(app.getPath('userData'), 'logs', 'app.log');
    try {
      const fileStat = await stat(logPath);
      const maxBytes = 120_000;
      const readSize = Math.min(fileStat.size, maxBytes);
      const start = Math.max(0, fileStat.size - readSize);
      const handle = await open(logPath, 'r');
      try {
        const buffer = Buffer.alloc(readSize);
        await handle.read(buffer, 0, readSize, start);
        return buffer.toString('utf8');
      } finally {
        await handle.close();
      }
    } catch (error) {
      log.warn(`read-recent-logs failed: ${String(error)}`);
      return '';
    }
  });

  ipcMain.handle('minutes:list-bookmarks', async () => {
    return listBookmarks();
  });

  ipcMain.handle(
    'minutes:add-bookmark',
    async (_event, input: AddBookmarkInput) => {
      return addBookmark(input);
    }
  );

  ipcMain.handle(
    'minutes:remove-bookmark',
    async (_event, bookmarkId: string) => {
      return removeBookmark(bookmarkId);
    }
  );

  ipcMain.handle('minutes:get-call-summary-extension', async () => {
    return getCallSummaryExtensionPublic();
  });

  ipcMain.handle(
    'minutes:save-call-summary-transcribe-settings',
    async (
      _event,
      settings: Partial<{
        threadCount: number;
        useGpu: boolean;
        gpuDeviceIndex: number;
        decodeMode: 'smart' | 'quality' | 'balanced' | 'fast';
      }>
    ) => {
      return saveCallSummaryTranscribeSettings(settings);
    }
  );

  ipcMain.handle(
    'minutes:install-call-summary-extension',
    async (
      event,
      options: { modelFileName?: string; forceRedownload?: boolean } = {}
    ) => {
      const sendProgress = createExtensionProgressSender(event.sender);
      return installCallSummaryExtension(sendProgress, options);
    }
  );

  ipcMain.handle('minutes:get-local-llm-extension', async () => {
    return getLocalLlmExtensionPublic();
  });

  ipcMain.handle(
    'minutes:install-local-llm-extension',
    async (
      event,
      options: { modelFileName?: string; forceRedownload?: boolean } = {}
    ) => {
      const sendProgress = createLocalLlmProgressSender(event.sender);
      return installLocalLlmExtension(sendProgress, options);
    }
  );

  ipcMain.handle('minutes:cancel-local-llm-download', async () => {
    cancelLocalLlmExtensionDownload();
  });

  ipcMain.handle(
    'minutes:transcribe-call-recording',
    async (
      event,
      options: {
        jobId?: string;
        recordingPath: string;
        conversationId: string;
        conversationTitle: string;
        startedAt: number;
        endedAt: number;
        localSpeakerDisplayName?: string;
        background?: boolean;
      }
    ) => {
      return transcribeCallRecording({
        ...options,
        onProgress: update => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('minutes:call-transcription-progress', {
              jobId: options.jobId,
              percent: update.percent,
              phase: update.phase,
              detail: update.detail,
            });
          }
        },
      });
    }
  );

  ipcMain.handle(
    'minutes:cancel-transcription-job',
    (_event, options: { jobId: string }) => {
      if (typeof options?.jobId === 'string' && options.jobId.length > 0) {
        cancelTranscriptionJob(options.jobId);
      }
    }
  );

  ipcMain.handle(
    'minutes:generate-call-recording-summary',
    async (
      event,
      options: {
        jobId?: string;
        recordingPath: string;
        conversationTitle: string;
        localSpeakerDisplayName?: string;
      }
    ) => {
      return generateCallRecordingSummary({
        ...options,
        onProgress: update => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('minutes:call-transcription-progress', {
              jobId: options.jobId,
              percent: update.percent,
              phase: update.phase,
              detail: update.detail,
            });
          }
        },
      });
    }
  );

  ipcMain.handle('minutes:get-ai-settings', async () => {
    return getAiSettingsPublic();
  });

  ipcMain.handle(
    'minutes:save-ai-settings',
    async (_event, input: AiSettingsSaveInput) => {
      return saveAiSettings(input);
    }
  );

  ipcMain.handle(
    'minutes:test-ai-settings',
    async (
      _event,
      options: { apiKey?: string; provider: AiProvider; model: string }
    ): Promise<{ ok: true; message: string }> => {
      const settings = await getAiSettingsPublic();
      const provider = options.provider ?? settings.provider;
      const model = options.model ?? settings.model;
      if (provider === 'local') {
        const message = await testAiConnectionForProvider({
          provider: 'local',
          apiKey: '',
          model,
        });
        return { ok: true, message };
      }
      const apiKey =
        options.apiKey?.trim() || (await getAiApiKey(provider)) || undefined;
      if (!apiKey) {
        throw new Error('API klíč není nastaven');
      }
      const message = await testAiConnectionForProvider({
        provider,
        apiKey,
        model,
      });
      return { ok: true, message };
    }
  );

  ipcMain.handle(
    'minutes:list-ai-models',
    async (
      _event,
      options: { provider: AiProvider; apiKey?: string }
    ): Promise<ReadonlyArray<string>> => {
      const provider = options.provider;
      if (provider === 'local') {
        return listAiModelsForProvider({ provider });
      }
      const apiKey =
        options.apiKey?.trim() || (await getAiApiKey(provider)) || null;
      return listAiModelsForProvider({ provider, apiKey });
    }
  );

  ipcMain.handle(
    'minutes:generate-ai-summary',
    async (
      _event,
      options: {
        conversationTitle: string;
        scopeLabel: string;
        transcript: string;
      }
    ): Promise<string> => {
      await assertAiSummaryReady();

      const settings = await getAiSettingsPublic();
      const apiKey =
        settings.provider === 'local'
          ? ''
          : ((await getAiApiKey(settings.provider)) ?? undefined);
      if (settings.provider !== 'local' && !apiKey) {
        throw new Error('API klíč není nastaven');
      }

      return generateAiSummaryForProvider({
        provider: settings.provider,
        apiKey: apiKey ?? '',
        model: settings.model,
        outputLanguage: settings.outputLanguage,
        conversationTitle: options.conversationTitle,
        scopeLabel: options.scopeLabel,
        transcript: options.transcript,
        style: settings.summaryStyle,
        customInstructions: settings.customSummaryInstructions,
      });
    }
  );

  ipcMain.handle(
    'minutes:generate-ai-opinion',
    async (
      _event,
      options: {
        conversationTitle: string;
        messageAuthorLabel: string;
        messageText: string;
        isNoteToSelf: boolean;
      }
    ): Promise<string> => {
      await assertAiSummaryReady();

      const settings = await getAiSettingsPublic();
      const apiKey =
        settings.provider === 'local'
          ? ''
          : ((await getAiApiKey(settings.provider)) ?? undefined);
      if (settings.provider !== 'local' && !apiKey) {
        throw new Error('API klíč není nastaven');
      }

      return generateAiOpinionForProvider({
        provider: settings.provider,
        apiKey: apiKey ?? '',
        model: settings.model,
        outputLanguage: settings.outputLanguage,
        conversationTitle: options.conversationTitle,
        messageAuthorLabel: options.messageAuthorLabel,
        messageText: options.messageText,
        isNoteToSelf: options.isNoteToSelf,
      });
    }
  );

  ipcMain.handle(
    'minutes:generate-unread-conversation-summary',
    async (
      _event,
      options: {
        conversationTitle: string;
        unreadCount: number;
        transcript: string;
      }
    ): Promise<string> => {
      await assertAiSummaryReady();

      const settings = await getAiSettingsPublic();
      const apiKey =
        settings.provider === 'local'
          ? ''
          : ((await getAiApiKey(settings.provider)) ?? undefined);
      if (settings.provider !== 'local' && !apiKey) {
        throw new Error('API klíč není nastaven');
      }

      return generateUnreadConversationSummaryForProvider({
        provider: settings.provider,
        apiKey: apiKey ?? '',
        model: settings.model,
        outputLanguage: settings.outputLanguage,
        conversationTitle: options.conversationTitle,
        unreadCount: options.unreadCount,
        transcript: options.transcript,
      });
    }
  );

  ipcMain.handle('minutes:check-for-app-update', async () => {
    return checkForAppUpdate();
  });

  ipcMain.handle('minutes:get-startup-app-update-state', async () => {
    return resolveStartupAppUpdateState();
  });

  ipcMain.handle('minutes:get-pending-app-update', async () => {
    return getPendingAppUpdate();
  });

  ipcMain.handle(
    'minutes:download-app-update',
    async (
      event,
      options: {
        downloadUrl: string;
        latestVersion: string;
        releaseUrl: string;
        userInitiated?: boolean;
      }
    ) => {
      const sendProgress = createAppUpdateProgressSender(event.sender);
      return downloadAppUpdate({
        ...options,
        sendProgress,
      });
    }
  );

  ipcMain.handle(
    'minutes:install-pending-app-update',
    async (event, options: { version?: string } = {}) => {
      const sendProgress = createAppUpdateProgressSender(event.sender);
      return installPendingAppUpdate({
        ...options,
        sendProgress,
      });
    }
  );

  ipcMain.handle(
    'minutes:download-and-install-app-update',
    async (
      event,
      options: {
        downloadUrl: string;
        latestVersion: string;
        releaseUrl: string;
      }
    ) => {
      const sendProgress = createAppUpdateProgressSender(event.sender);
      return downloadAndInstallAppUpdate({
        ...options,
        sendProgress,
      });
    }
  );

  log.info('minutes IPC channel initialized');
}
