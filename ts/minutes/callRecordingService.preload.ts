// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { ipcRenderer } from 'electron';

import { ToastType } from '../types/Toast.dom.tsx';
import { createLogger } from '../logging/log.std.ts';
import type { SpeakerActivityLog } from './speakerActivity.std.ts';
import { clampSpeakerActivityLogToPcmDuration } from './speakerActivity.std.ts';
import { isRecordableCallMode } from './types.std.ts';
import { CallRecorder } from './callRecorder.dom.ts';
import {
  RECORDING_STATE_CHANGED,
  recordingStateEvents,
} from './recordingStateEvents.std.ts';
import { enqueueRecordingTranscription } from './callTranscriptionService.preload.ts';
import { speakerActivityLogger } from './speakerActivityLogger.preload.ts';
import { minutesCaptureCoordinator } from './captureCoordinator.std.ts';
import {
  CallRecordingServiceCore,
  type CallRecordingServiceDependencies,
} from './callRecordingServiceCore.std.ts';
import { RingRtcAudioTrack } from './ringRtcAudioTrack.preload.ts';

const log = createLogger('minutes/callRecording');

const dependencies: CallRecordingServiceDependencies = {
  coordinator: minutesCaptureCoordinator,
  isRecordableCallMode,
  warmup: () => CallRecorder.warmup(),
  recorder: new CallRecorder(),
  getConversationTitle: conversationId => {
    const conversation =
      window.ConversationController.get(conversationId) ?? undefined;
    return conversation?.getTitle() ?? conversationId;
  },
  createAudioTrack: onFatalError => RingRtcAudioTrack.create({ onFatalError }),
  speakerActivity: speakerActivityLogger,
  saveRecording: input =>
    ipcRenderer.invoke('minutes:save-recording', input) as Promise<unknown>,
  showError: () => {
    window.reduxActions.toast.showToast({ toastType: ToastType.Error });
  },
  showFileSaved: filePath => {
    window.reduxActions.toast.showToast({
      toastType: ToastType.FileSaved,
      parameters: { fullPath: filePath },
    });
  },
  enqueueRecordingTranscription,
  emitState: state => recordingStateEvents.emitState(state),
  normalizeSpeakerActivityLog: (activityLog, pcm48) => {
    if (activityLog != null && pcm48 != null && pcm48.length > 0) {
      const pcmDurationMs = (pcm48.length / 48_000) * 1000;
      return clampSpeakerActivityLogToPcmDuration(
        activityLog as SpeakerActivityLog,
        pcmDurationMs
      );
    }
    return activityLog;
  },
  now: () => Date.now(),
  log: {
    info: message => log.info(message),
    warn: message => log.warn(message),
    error: (message, error) => log.error(message, error),
  },
};

export const callRecordingService = new CallRecordingServiceCore(dependencies);
export { RECORDING_STATE_CHANGED };
