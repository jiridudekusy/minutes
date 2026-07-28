// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { VideoRecordingState } from './videoRecordingServiceCore.std.ts';

export const VIDEO_RECORDING_STATE_CHANGED =
  'minutes-video-recording-state-changed';

type VideoRecordingStateListener = (state: VideoRecordingState) => void;

class VideoRecordingStateEvents {
  readonly #listeners = new Set<VideoRecordingStateListener>();

  on(
    _event: typeof VIDEO_RECORDING_STATE_CHANGED,
    listener: VideoRecordingStateListener
  ): void {
    this.#listeners.add(listener);
  }

  off(
    _event: typeof VIDEO_RECORDING_STATE_CHANGED,
    listener: VideoRecordingStateListener
  ): void {
    this.#listeners.delete(listener);
  }

  emitState(state: VideoRecordingState): void {
    for (const listener of this.#listeners) {
      listener(state);
    }
  }
}

export const videoRecordingStateEvents = new VideoRecordingStateEvents();
