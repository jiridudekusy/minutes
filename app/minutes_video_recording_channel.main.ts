// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
/* eslint-disable signal-desktop/enforce-file-suffix -- Dedicated main-process IPC channel. */

import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import {
  MINUTES_VIDEO_RECORDING_IPC,
  type AppendVideoRecordingChunkInput,
  type CreateVideoRecordingFileOptions,
  type FinalizeVideoRecordingFileInput,
} from '../ts/minutes/videoRecordingFile.std.ts';
import { SPEAKER_ACTIVITY_FILE_SUFFIX } from '../ts/minutes/constants.std.ts';
import { isSpeakerActivityLog } from '../ts/minutes/speakerActivity.std.ts';

type FinalizeOptions = Omit<FinalizeVideoRecordingFileInput, 'sessionId'>;

type IpcSenderLike = Readonly<{
  id: number;
  once(event: 'destroyed', listener: () => void): unknown;
}>;

type IpcMainLike = Readonly<{
  handle(
    channel: string,
    listener: (event: { sender: IpcSenderLike }, input: unknown) => unknown
  ): void;
}>;

type VideoFileHandle = Readonly<{
  writeFile(data: Uint8Array<ArrayBuffer>): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}>;

type VideoRecordingFileError = Error & Readonly<{ partialPath: string }>;

function createVideoRecordingFileError(
  message: string,
  partialPath: string
): VideoRecordingFileError {
  return Object.assign(new Error(message), {
    name: 'VideoRecordingFileError',
    partialPath,
  });
}

function isVideoRecordingFileError(
  error: unknown
): error is VideoRecordingFileError {
  return (
    error instanceof Error &&
    'partialPath' in error &&
    typeof error.partialPath === 'string'
  );
}

async function ignoreFailure(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch {
    // Best-effort cleanup must not hide the original recording error.
  }
}

type Session = Readonly<{
  ownerId: number;
  handle: VideoFileHandle;
  partialPath: string;
  filePath: string;
  options: CreateVideoRecordingFileOptions;
}> & {
  queuedBytes: number;
  writes: Promise<void>;
};

function sanitizeFilePart(value: string): string {
  return value
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function formatTimestampForFilename(epochMs: number): string {
  return new Date(epochMs).toISOString().replace(/[:.]/g, '-');
}

export class VideoRecordingFileWriter {
  static readonly DEFAULT_MAX_QUEUED_BYTES = 16 * 1024 * 1024;
  static readonly MAX_REMEMBERED_ABORTS = 32;

  readonly #abortedSessions = new Map<
    string,
    Readonly<{ ownerId: number; partialPath: string }>
  >();
  readonly #maxQueuedBytes: number;
  readonly #openFile: (path: string) => Promise<VideoFileHandle>;
  readonly #recordingsDir: string;
  readonly #renameFile: (source: string, target: string) => Promise<void>;
  readonly #sessions = new Map<string, Session>();

  constructor({
    recordingsDir,
    maxQueuedBytes = VideoRecordingFileWriter.DEFAULT_MAX_QUEUED_BYTES,
    openFile = async path => open(path, 'wx'),
    renameFile = rename,
  }: {
    recordingsDir: string;
    maxQueuedBytes?: number;
    openFile?: (path: string) => Promise<VideoFileHandle>;
    renameFile?: (source: string, target: string) => Promise<void>;
  }) {
    this.#recordingsDir = recordingsDir;
    this.#maxQueuedBytes = maxQueuedBytes;
    this.#openFile = openFile;
    this.#renameFile = renameFile;
  }

  async create(
    ownerId: number,
    options: CreateVideoRecordingFileOptions
  ): Promise<{ sessionId: string; partialPath: string }> {
    await mkdir(this.#recordingsDir, { recursive: true });
    const sessionId = randomUUID();
    const baseName = [
      formatTimestampForFilename(options.startedAt),
      sanitizeFilePart(options.conversationTitle),
      sanitizeFilePart(options.conversationId.slice(0, 8)),
      sessionId.slice(0, 8),
    ].join('_');
    const filePath = join(this.#recordingsDir, `${baseName}.webm`);
    const partialPath = `${filePath}.partial`;
    const handle = await this.#openFile(partialPath);
    this.#sessions.set(sessionId, {
      ownerId,
      handle,
      partialPath,
      filePath,
      options,
      queuedBytes: 0,
      writes: Promise.resolve(),
    });
    return { sessionId, partialPath };
  }

  async append(
    ownerId: number,
    sessionId: string,
    data: Uint8Array<ArrayBuffer>
  ): Promise<void> {
    const session = this.#getOwnedSession(ownerId, sessionId);
    if (session.queuedBytes + data.byteLength > this.#maxQueuedBytes) {
      throw createVideoRecordingFileError(
        'Video recording write queue is full',
        session.partialPath
      );
    }
    const chunk = Buffer.from(data);
    session.queuedBytes += chunk.byteLength;
    session.writes = this.#writeAfterPending(sessionId, session, chunk);
    await session.writes;
  }

  async #writeAfterPending(
    sessionId: string,
    session: Session,
    chunk: Uint8Array<ArrayBuffer>
  ): Promise<void> {
    const previousWrites = session.writes;
    try {
      await previousWrites;
      await session.handle.writeFile(chunk);
    } catch (error) {
      if (isVideoRecordingFileError(error)) {
        throw error;
      }
      throw createVideoRecordingFileError(
        `Video recording write failed: ${String(error)}`,
        session.partialPath
      );
    } finally {
      const currentSession = this.#sessions.get(sessionId);
      if (currentSession === session) {
        currentSession.queuedBytes -= chunk.byteLength;
      }
    }
  }

  async finalize(
    ownerId: number,
    sessionId: string,
    options: FinalizeOptions
  ): Promise<{
    filePath: string;
    metadataPath: string;
    speakerActivityPath: string;
  }> {
    const session = this.#getOwnedSession(ownerId, sessionId);
    if (!isSpeakerActivityLog(options.speakerActivityLog)) {
      throw createVideoRecordingFileError(
        'Video speaker activity log is invalid',
        session.partialPath
      );
    }
    const metadataPath = session.filePath.replace(/\.webm$/, '.json');
    const metadataPartialPath = `${metadataPath}.partial`;
    const speakerActivityPath = session.filePath.replace(
      /\.webm$/,
      SPEAKER_ACTIVITY_FILE_SUFFIX
    );
    const speakerActivityPartialPath = `${speakerActivityPath}.partial`;
    let mediaRenamed = false;
    let metadataRenamed = false;
    let speakerActivityRenamed = false;
    try {
      await session.writes;
      await session.handle.sync();
      await writeFile(
        metadataPartialPath,
        JSON.stringify(
          {
            mediaKind: 'screen-share-video',
            conversationId: session.options.conversationId,
            conversationTitle: session.options.conversationTitle,
            callMode: session.options.callMode,
            eraId: session.options.eraId,
            startedAt: session.options.startedAt,
            endedAt: options.endedAt,
            durationMs: options.recordedDurationMs,
            width: session.options.width,
            height: session.options.height,
            frameRate: session.options.frameRate,
            codec: session.options.codec,
            videoFile: basename(session.filePath),
            speakerActivityFile: basename(speakerActivityPath),
          },
          null,
          2
        ),
        { encoding: 'utf8', flag: 'wx' }
      );
      await writeFile(
        speakerActivityPartialPath,
        JSON.stringify(options.speakerActivityLog, null, 2),
        { encoding: 'utf8', flag: 'wx' }
      );
      await session.handle.close();
      await this.#renameFile(speakerActivityPartialPath, speakerActivityPath);
      speakerActivityRenamed = true;
      await this.#renameFile(metadataPartialPath, metadataPath);
      metadataRenamed = true;
      await this.#renameFile(session.partialPath, session.filePath);
      mediaRenamed = true;
    } catch (error) {
      await ignoreFailure(() => session.handle.close());
      if (mediaRenamed) {
        await ignoreFailure(() =>
          this.#renameFile(session.filePath, session.partialPath)
        );
      }
      if (metadataRenamed) {
        await ignoreFailure(() => rm(metadataPath, { force: true }));
      }
      if (speakerActivityRenamed) {
        await ignoreFailure(() => rm(speakerActivityPath, { force: true }));
      }
      await ignoreFailure(() => rm(metadataPartialPath, { force: true }));
      await ignoreFailure(() =>
        rm(speakerActivityPartialPath, { force: true })
      );
      if (isVideoRecordingFileError(error)) {
        throw error;
      }
      throw createVideoRecordingFileError(
        `Video recording finalization failed: ${String(error)}`,
        session.partialPath
      );
    }
    this.#sessions.delete(sessionId);
    return {
      filePath: session.filePath,
      metadataPath,
      speakerActivityPath,
    };
  }

  async abort(
    ownerId: number,
    sessionId: string
  ): Promise<{ partialPath: string }> {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      const aborted = this.#abortedSessions.get(sessionId);
      if (aborted?.ownerId === ownerId) {
        return { partialPath: aborted.partialPath };
      }
      throw new Error('Unknown video recording session');
    }
    if (session.ownerId !== ownerId) {
      throw new Error('Unknown video recording session');
    }

    this.#sessions.delete(sessionId);
    this.#rememberAbortedSession(sessionId, ownerId, session.partialPath);

    try {
      await session.writes;
    } catch {
      // The producer already received the write error. Preserve what was written.
    }
    await session.handle.close();
    return { partialPath: session.partialPath };
  }

  async cleanupOwner(ownerId: number): Promise<void> {
    const sessionIds = [...this.#sessions.entries()]
      .filter(([, session]) => session.ownerId === ownerId)
      .map(([sessionId]) => sessionId);
    await Promise.all(
      sessionIds.map(async sessionId => {
        await this.abort(ownerId, sessionId);
      })
    );
  }

  #rememberAbortedSession(
    sessionId: string,
    ownerId: number,
    partialPath: string
  ): void {
    if (
      this.#abortedSessions.size >=
      VideoRecordingFileWriter.MAX_REMEMBERED_ABORTS
    ) {
      const oldestSessionId = this.#abortedSessions.keys().next().value;
      if (oldestSessionId) {
        this.#abortedSessions.delete(oldestSessionId);
      }
    }
    this.#abortedSessions.set(sessionId, { ownerId, partialPath });
  }

  #getOwnedSession(ownerId: number, sessionId: string): Session {
    const session = this.#sessions.get(sessionId);
    if (!session || session.ownerId !== ownerId) {
      throw new Error('Unknown video recording session');
    }
    return session;
  }
}

export function initializeMinutesVideoRecordingChannel({
  ipcMain,
  recordingsDir,
  writer = new VideoRecordingFileWriter({ recordingsDir }),
}: {
  ipcMain: IpcMainLike;
  recordingsDir: string;
  writer?: VideoRecordingFileWriter;
}): void {
  const registeredSenders = new WeakSet<IpcSenderLike>();

  function registerCleanup(sender: IpcSenderLike): void {
    if (registeredSenders.has(sender)) {
      return;
    }
    registeredSenders.add(sender);
    sender.once('destroyed', () => {
      void ignoreFailure(() => writer.cleanupOwner(sender.id));
    });
  }

  ipcMain.handle(MINUTES_VIDEO_RECORDING_IPC.create, (event, input) => {
    registerCleanup(event.sender);
    return writer.create(
      event.sender.id,
      input as CreateVideoRecordingFileOptions
    );
  });
  ipcMain.handle(MINUTES_VIDEO_RECORDING_IPC.append, async (event, input) => {
    const { sessionId, data } = input as AppendVideoRecordingChunkInput;
    try {
      await writer.append(event.sender.id, sessionId, data);
      return { ok: true } as const;
    } catch (error) {
      if (!isVideoRecordingFileError(error)) {
        throw error;
      }
      await writer.abort(event.sender.id, sessionId);
      return {
        ok: false,
        error: error.message,
        partialPath: error.partialPath,
      } as const;
    }
  });
  ipcMain.handle(MINUTES_VIDEO_RECORDING_IPC.finalize, async (event, input) => {
    const { sessionId, ...options } = input as FinalizeOptions & {
      sessionId: string;
    };
    try {
      const value = await writer.finalize(event.sender.id, sessionId, options);
      return { ok: true, value } as const;
    } catch (error) {
      if (!isVideoRecordingFileError(error)) {
        throw error;
      }
      await writer.abort(event.sender.id, sessionId);
      return {
        ok: false,
        error: error.message,
        partialPath: error.partialPath,
      } as const;
    }
  });
  ipcMain.handle(MINUTES_VIDEO_RECORDING_IPC.abort, (event, input) => {
    const { sessionId } = input as { sessionId: string };
    return writer.abort(event.sender.id, sessionId);
  });
}
