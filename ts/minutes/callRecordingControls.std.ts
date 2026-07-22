// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { MinutesRecordingState } from './types.std.ts';
import type { VideoRecordingState } from './videoRecordingServiceCore.std.ts';

export type RecordingControlAction =
  | 'start-audio'
  | 'start-video'
  | 'pause-audio'
  | 'resume-audio'
  | 'stop-audio'
  | 'pause-video'
  | 'resume-video'
  | 'stop-video';

export type RecordingControlActions =
  | readonly []
  | readonly ['start-audio', 'start-video']
  | readonly ['pause-audio', 'stop-audio']
  | readonly ['resume-audio', 'stop-audio']
  | readonly ['pause-video', 'stop-video']
  | readonly ['resume-video', 'stop-video'];

export function getVisibleRecordingActions(
  audioState: MinutesRecordingState,
  videoState: VideoRecordingState,
  conversationId: string
): RecordingControlActions {
  if (audioState.status === 'recording') {
    if (audioState.conversationId !== conversationId) {
      return [];
    }
    return ['pause-audio', 'stop-audio'];
  }
  if (audioState.status === 'paused') {
    if (audioState.conversationId !== conversationId) {
      return [];
    }
    return ['resume-audio', 'stop-audio'];
  }

  if (videoState.status === 'recording') {
    if (videoState.conversationId !== conversationId) {
      return [];
    }
    return ['pause-video', 'stop-video'];
  }
  if (videoState.status === 'paused') {
    if (videoState.conversationId !== conversationId) {
      return [];
    }
    return ['resume-video', 'stop-video'];
  }
  if (videoState.status === 'starting' || videoState.status === 'finalizing') {
    return [];
  }

  return ['start-audio', 'start-video'];
}
