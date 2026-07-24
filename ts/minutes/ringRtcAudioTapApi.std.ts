// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import {
  createRingRtcAudioPackets,
  RING_RTC_AUDIO_TAP_VERSION,
  type RingRtcAudioPackets,
  type RingRtcAudioTapChunk,
} from './ringRtcAudioMixer.std.ts';

export type RingRtcAudioTapApi = Readonly<{
  isAudioTapSupported(): boolean;
  audioTapVersion(): number;
  startAudioTap(): void;
  readAudioTap(maxSamplesPerSource: number): RingRtcAudioTapChunk;
  stopAudioTap(): void;
}>;

export type RingRtcAudioDropEvent = Readonly<{
  localInputSamples: number;
  remotePlayoutSamples: number;
}>;

export function readRingRtcAudioTap(
  api: RingRtcAudioTapApi,
  maxSamplesPerSource: number,
  onDroppedSamples: (event: RingRtcAudioDropEvent) => void
): RingRtcAudioPackets {
  const chunk = api.readAudioTap(maxSamplesPerSource);
  if (
    chunk.droppedLocalInputSamples > 0 ||
    chunk.droppedRemotePlayoutSamples > 0
  ) {
    onDroppedSamples({
      localInputSamples: chunk.droppedLocalInputSamples,
      remotePlayoutSamples: chunk.droppedRemotePlayoutSamples,
    });
  }
  return createRingRtcAudioPackets(chunk);
}

function hasFunction(
  value: object,
  property: keyof RingRtcAudioTapApi
): boolean {
  return typeof Reflect.get(value, property) === 'function';
}

export function resolveRingRtcAudioTapApi(
  value: unknown
): RingRtcAudioTapApi | undefined {
  if (
    typeof value !== 'object' ||
    value == null ||
    !hasFunction(value, 'isAudioTapSupported') ||
    !hasFunction(value, 'audioTapVersion') ||
    !hasFunction(value, 'startAudioTap') ||
    !hasFunction(value, 'readAudioTap') ||
    !hasFunction(value, 'stopAudioTap')
  ) {
    return undefined;
  }

  const api = value as RingRtcAudioTapApi;
  try {
    if (
      !api.isAudioTapSupported() ||
      api.audioTapVersion() !== RING_RTC_AUDIO_TAP_VERSION
    ) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return api;
}
