// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { ToastType } from '../types/Toast.dom.tsx';
import type { CallMode } from '../types/CallDisposition.std.ts';
import { createLogger } from '../logging/log.std.ts';
import { minutesCaptureCoordinator } from './captureCoordinator.std.ts';
import { RingRtcAudioTrack } from './ringRtcAudioTrack.preload.ts';
import { RingRtcScreenShareCompositor } from './ringRtcScreenShareCompositor.preload.ts';
import { videoRecordingFileService } from './videoRecordingFileService.preload.ts';
import {
  VideoRecordingServiceCore,
  type VideoRecordingStartOptions,
  type VideoRecordingState,
} from './videoRecordingServiceCore.std.ts';
import { videoRecordingStateEvents } from './videoRecordingStateEvents.std.ts';
import { speakerActivityLogger } from './speakerActivityLogger.preload.ts';
import { clampSpeakerActivityLogToPcmDuration } from './speakerActivity.std.ts';
import { enqueueRecordingTranscription } from './callTranscriptionService.preload.ts';
import {
  combinePresentationAndRingRtcStreams,
  createVideoMediaRecorder,
} from './videoRecordingBrowserAdapters.std.ts';

const log = createLogger('minutes/videoRecording');

export type StartVideoRecordingOptions = Readonly<{
  conversationId: string;
  callMode: CallMode.Direct | CallMode.Group;
  eraId?: string;
}>;

const core = new VideoRecordingServiceCore({
  coordinator: minutesCaptureCoordinator,
  isAudioSupported: () => RingRtcAudioTrack.isSupported(),
  isVideoSupported: () => RingRtcScreenShareCompositor.isSupported(),
  isCodecSupported: codec => MediaRecorder.isTypeSupported(codec),
  writer: {
    create: options => videoRecordingFileService.create(options),
    append: input =>
      videoRecordingFileService.append(input.sessionId, input.data),
    appendPcm: input =>
      videoRecordingFileService.appendPcm(input.sessionId, input.samples),
    finalize: input => videoRecordingFileService.finalize(input),
    abort: input => videoRecordingFileService.abort(input.sessionId),
  },
  createAudioTrack: (onFatalError, onPcm) =>
    RingRtcAudioTrack.create({
      onFatalError,
      onPcm,
    }),
  createCompositor: (options, onFatalError) =>
    RingRtcScreenShareCompositor.create({
      conversationId: options.conversationId,
      onFatalError,
    }),
  combineStreams: (videoStream, audioStream) =>
    combinePresentationAndRingRtcStreams(
      videoStream as MediaStream,
      audioStream as MediaStream,
      MediaStream
    ),
  createMediaRecorder: (stream, codec) =>
    createVideoMediaRecorder(stream as MediaStream, codec, MediaRecorder),
  speakerActivity: {
    onRecordingPcm: sampleCount =>
      speakerActivityLogger.onRecordingPcm(sampleCount),
    start: options =>
      speakerActivityLogger.start({
        ...options,
        callMode: options.callMode as CallMode.Direct | CallMode.Group,
      }),
    pause: () => speakerActivityLogger.pause(),
    resume: () => speakerActivityLogger.resume(),
    stop: () => speakerActivityLogger.stop(),
  },
  normalizeSpeakerActivityLog: (activityLog, recordedDurationMs) =>
    activityLog
      ? clampSpeakerActivityLogToPcmDuration(activityLog, recordedDurationMs)
      : null,
  onFinalized: enqueueRecordingTranscription,
  emitState: state => {
    videoRecordingStateEvents.emitState(state);
    if (state.status === 'error') {
      log.error(
        state.partialPath
          ? `${state.message}; partial recording retained at ${state.partialPath}`
          : state.message,
        new Error(state.message)
      );
      window.reduxActions.toast.showToast({ toastType: ToastType.Error });
    }
  },
  now: () => Date.now(),
});

class VideoRecordingService {
  #pendingStart: VideoRecordingStartOptions | undefined;
  #endedDuringStart = false;

  getState(): VideoRecordingState {
    return core.getState();
  }

  async startRecording(options: StartVideoRecordingOptions): Promise<boolean> {
    if (this.#pendingStart) {
      return false;
    }
    const conversation =
      window.ConversationController.get(options.conversationId) ?? undefined;
    const fullOptions: VideoRecordingStartOptions = {
      ...options,
      conversationTitle: conversation?.getTitle() ?? options.conversationId,
    };
    this.#pendingStart = fullOptions;
    this.#endedDuringStart = false;
    try {
      const started = await core.startRecording(fullOptions);
      if (started && this.#endedDuringStart) {
        await this.#stopAndShowSavedFile();
        return false;
      }
      return started;
    } finally {
      if (this.#pendingStart === fullOptions) {
        this.#pendingStart = undefined;
      }
    }
  }

  pauseRecording(): boolean {
    return core.pauseRecording();
  }

  resumeRecording(): boolean {
    return core.resumeRecording();
  }

  async stopRecording(): Promise<void> {
    await this.#stopAndShowSavedFile();
  }

  async onCallEnded(options: StartVideoRecordingOptions): Promise<void> {
    const pending = this.#pendingStart;
    if (
      pending?.conversationId === options.conversationId &&
      pending.callMode === options.callMode
    ) {
      this.#endedDuringStart = true;
    }

    const state = core.getState();
    if (
      (state.status !== 'recording' && state.status !== 'paused') ||
      state.conversationId !== options.conversationId ||
      state.callMode !== options.callMode
    ) {
      return;
    }
    await this.#stopAndShowSavedFile();
  }

  async #stopAndShowSavedFile(): Promise<void> {
    const result = await core.stopRecording();
    if (result) {
      window.reduxActions.toast.showToast({
        toastType: ToastType.FileSaved,
        parameters: { fullPath: result.filePath },
      });
    }
  }
}

export const videoRecordingService = new VideoRecordingService();
