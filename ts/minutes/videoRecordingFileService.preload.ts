// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { ipcRenderer } from 'electron';

import {
  MINUTES_VIDEO_RECORDING_IPC,
  type AbortedVideoRecordingFile,
  type AbortVideoRecordingFileInput,
  type AppendVideoRecordingChunkInput,
  type AppendVideoRecordingPcmInput,
  type CreatedVideoRecordingFile,
  type CreateVideoRecordingFileOptions,
  type FinalizedVideoRecordingFile,
  type FinalizeVideoRecordingFileInput,
} from './videoRecordingFile.std.ts';

export type VideoRecordingFileIpcInvoke = (
  channel: string,
  input: unknown
) => Promise<unknown>;

export type VideoRecordingFileService = Readonly<{
  create(
    options: CreateVideoRecordingFileOptions
  ): Promise<CreatedVideoRecordingFile>;
  append(
    sessionId: string,
    data: AppendVideoRecordingChunkInput['data']
  ): Promise<void>;
  appendPcm(
    sessionId: string,
    samples: AppendVideoRecordingPcmInput['samples']
  ): Promise<void>;
  finalize(
    input: FinalizeVideoRecordingFileInput
  ): Promise<FinalizedVideoRecordingFile>;
  abort(sessionId: string): Promise<AbortedVideoRecordingFile>;
}>;

export function unwrapVideoRecordingFileResult<T = void>(result: unknown): T {
  if (
    typeof result === 'object' &&
    result != null &&
    'ok' in result &&
    result.ok === false &&
    'error' in result &&
    typeof result.error === 'string' &&
    'partialPath' in result &&
    typeof result.partialPath === 'string'
  ) {
    throw Object.assign(new Error(result.error), {
      partialPath: result.partialPath,
    });
  }

  if (
    typeof result === 'object' &&
    result != null &&
    'ok' in result &&
    result.ok === true
  ) {
    return ('value' in result ? result.value : undefined) as T;
  }

  throw new Error('Invalid video recording file IPC result');
}

export function createVideoRecordingFileService(
  invoke: VideoRecordingFileIpcInvoke
): VideoRecordingFileService {
  return {
    async create(options) {
      const result = await invoke(MINUTES_VIDEO_RECORDING_IPC.create, options);
      if (
        typeof result !== 'object' ||
        result == null ||
        !('sessionId' in result) ||
        typeof result.sessionId !== 'string' ||
        !('partialPath' in result) ||
        typeof result.partialPath !== 'string'
      ) {
        throw new Error('Invalid create video recording file IPC result');
      }
      return {
        sessionId: result.sessionId,
        partialPath: result.partialPath,
      };
    },
    async append(sessionId, data) {
      const result = await invoke(MINUTES_VIDEO_RECORDING_IPC.append, {
        sessionId,
        data,
      } satisfies AppendVideoRecordingChunkInput);
      unwrapVideoRecordingFileResult(result);
    },
    async appendPcm(sessionId, samples) {
      const result = await invoke(MINUTES_VIDEO_RECORDING_IPC.appendPcm, {
        sessionId,
        samples,
      } satisfies AppendVideoRecordingPcmInput);
      unwrapVideoRecordingFileResult(result);
    },
    async finalize(input) {
      const result = await invoke(MINUTES_VIDEO_RECORDING_IPC.finalize, input);
      const value = unwrapVideoRecordingFileResult<unknown>(result);
      if (
        typeof value !== 'object' ||
        value == null ||
        !('filePath' in value) ||
        typeof value.filePath !== 'string' ||
        !('pcmPath' in value) ||
        typeof value.pcmPath !== 'string' ||
        !('metadataPath' in value) ||
        typeof value.metadataPath !== 'string' ||
        !('speakerActivityPath' in value) ||
        typeof value.speakerActivityPath !== 'string'
      ) {
        throw new Error('Invalid finalize video recording file IPC result');
      }
      return {
        filePath: value.filePath,
        pcmPath: value.pcmPath,
        metadataPath: value.metadataPath,
        speakerActivityPath: value.speakerActivityPath,
      };
    },
    async abort(sessionId) {
      const result = await invoke(MINUTES_VIDEO_RECORDING_IPC.abort, {
        sessionId,
      } satisfies AbortVideoRecordingFileInput);
      if (
        typeof result !== 'object' ||
        result == null ||
        !('partialPath' in result) ||
        typeof result.partialPath !== 'string'
      ) {
        throw new Error('Invalid abort video recording file IPC result');
      }
      return { partialPath: result.partialPath };
    },
  };
}

export const videoRecordingFileService = createVideoRecordingFileService(
  (channel, input) => ipcRenderer.invoke(channel, input)
);
