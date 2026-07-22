// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { RingRtcAudioTapChunk } from './ringRtcAudioMixer.std.ts';
import { RING_RTC_AUDIO_TAP_VERSION } from './ringRtcAudioMixer.std.ts';

export type RingRtcAudioTapApi = Readonly<{
  isAudioTapSupported(): boolean;
  audioTapVersion(): number;
  startAudioTap(): void;
  readAudioTap(maxSamplesPerSource: number): RingRtcAudioTapChunk;
  stopAudioTap(): void;
}>;

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
