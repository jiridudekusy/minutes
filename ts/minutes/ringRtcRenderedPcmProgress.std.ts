// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

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
