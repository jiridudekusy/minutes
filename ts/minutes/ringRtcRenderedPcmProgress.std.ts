// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { RING_RTC_AUDIO_PROGRESS_SAMPLE_COUNT } from './ringRtcPcmChunker.std.ts';

export {
  RING_RTC_AUDIO_PROGRESS_SAMPLE_COUNT,
  RingRtcPcmChunker,
} from './ringRtcPcmChunker.std.ts';

export type RingRtcAudioWorkletEvent =
  | Readonly<{
      type: 'ready';
    }>
  | Readonly<{
      type: 'rendered-samples';
      generation: number;
      sampleCount: number;
    }>
  | Readonly<{
      type: 'rendered-pcm';
      generation: number;
      samples: Float32Array<ArrayBuffer>;
    }>
  | Readonly<{
      type: 'stopped';
      generation: number;
    }>;

export function readRingRtcAudioReadyEvent(event: unknown): boolean {
  return (
    typeof event === 'object' &&
    event != null &&
    Object.keys(event).length === 1 &&
    'type' in event &&
    event.type === 'ready'
  );
}

export function readRenderedPcmProgressEvent(
  event: unknown,
  generation: number
): number | undefined {
  if (
    typeof event !== 'object' ||
    event == null ||
    !('type' in event) ||
    event.type !== 'rendered-samples' ||
    !('generation' in event) ||
    event.generation !== generation ||
    !('sampleCount' in event) ||
    typeof event.sampleCount !== 'number' ||
    !Number.isSafeInteger(event.sampleCount) ||
    event.sampleCount <= 0
  ) {
    return undefined;
  }
  return event.sampleCount;
}

export function readRenderedPcmEvent(
  event: unknown,
  generation: number
): Float32Array<ArrayBuffer> | undefined {
  if (
    typeof event !== 'object' ||
    event == null ||
    !('type' in event) ||
    event.type !== 'rendered-pcm' ||
    !('generation' in event) ||
    event.generation !== generation ||
    !('samples' in event) ||
    !(event.samples instanceof Float32Array) ||
    event.samples.length === 0
  ) {
    return undefined;
  }
  return event.samples as Float32Array<ArrayBuffer>;
}

export class RingRtcRenderedPcmProgress {
  #pendingSamples = 0;

  reset(): void {
    this.#pendingSamples = 0;
  }

  addRenderedSamples(sampleCount: number): number {
    if (!Number.isSafeInteger(sampleCount) || sampleCount < 0) {
      throw new Error(
        'Rendered audio sample count must be a non-negative integer'
      );
    }
    this.#pendingSamples += sampleCount;
    if (this.#pendingSamples < RING_RTC_AUDIO_PROGRESS_SAMPLE_COUNT) {
      return 0;
    }

    const reportedSamples =
      Math.floor(this.#pendingSamples / RING_RTC_AUDIO_PROGRESS_SAMPLE_COUNT) *
      RING_RTC_AUDIO_PROGRESS_SAMPLE_COUNT;
    this.#pendingSamples -= reportedSamples;
    return reportedSamples;
  }
}
