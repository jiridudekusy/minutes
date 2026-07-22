// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export const VIDEO_OUTPUT_SIZE = {
  width: 1920,
  height: 1080,
} as const;

export const WEBM_MIME_TYPE_PREFERENCE = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
] as const;

export type VideoSize = Readonly<{
  width: number;
  height: number;
}>;

export type VideoDrawRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type PresentationFrameCandidate = Readonly<{
  sourceId: string;
  generation: number;
  readyGeneration?: number;
  size: VideoSize;
}>;

export type PresentationFrameDecision =
  | Readonly<{ kind: 'black' }>
  | Readonly<{
      kind: 'presentation';
      sourceId: string;
      generation: number;
      destination: VideoDrawRect;
    }>;

export type AudioSampleCursors = Readonly<{
  localSample: bigint;
  remoteSample: bigint;
}>;

export type RecordingResumePoint = Readonly<{
  recordedDurationMs: number;
  audioReadCursors: AudioSampleCursors;
}>;

export function calculateAspectFit(
  source: VideoSize,
  target: VideoSize = VIDEO_OUTPUT_SIZE
): VideoDrawRect | undefined {
  if (
    source.width <= 0 ||
    source.height <= 0 ||
    target.width <= 0 ||
    target.height <= 0
  ) {
    return undefined;
  }

  const scale = Math.min(
    target.width / source.width,
    target.height / source.height
  );
  const width = source.width * scale;
  const height = source.height * scale;

  return {
    x: (target.width - width) / 2,
    y: (target.height - height) / 2,
    width,
    height,
  };
}

export function decidePresentationFrame(
  candidate: PresentationFrameCandidate | undefined,
  target: VideoSize = VIDEO_OUTPUT_SIZE
): PresentationFrameDecision {
  if (
    candidate === undefined ||
    candidate.readyGeneration !== candidate.generation
  ) {
    return { kind: 'black' };
  }

  const destination = calculateAspectFit(candidate.size, target);
  if (destination === undefined) {
    return { kind: 'black' };
  }

  return {
    kind: 'presentation',
    sourceId: candidate.sourceId,
    generation: candidate.generation,
    destination,
  };
}

export function selectWebmMimeType(
  isTypeSupported: (mimeType: string) => boolean
): (typeof WEBM_MIME_TYPE_PREFERENCE)[number] | undefined {
  return WEBM_MIME_TYPE_PREFERENCE.find(isTypeSupported);
}

export class RecordingPauseTimeline {
  readonly #startedAtMs: number;

  #pausedAtMs: number | undefined;

  #pausedDurationMs = 0;

  constructor(startedAtMs: number) {
    this.#startedAtMs = startedAtMs;
  }

  public pause(atMs: number): void {
    if (this.#pausedAtMs !== undefined) {
      throw new Error('Recording timeline is already paused');
    }

    this.#pausedAtMs = atMs;
  }

  public resume(
    atMs: number,
    currentAudioWriterCursors: AudioSampleCursors
  ): RecordingResumePoint {
    if (this.#pausedAtMs === undefined) {
      throw new Error('Recording timeline is not paused');
    }

    this.#pausedDurationMs += atMs - this.#pausedAtMs;
    this.#pausedAtMs = undefined;

    return {
      recordedDurationMs: this.getRecordedDuration(atMs),
      audioReadCursors: { ...currentAudioWriterCursors },
    };
  }

  public getRecordedDuration(atMs: number): number {
    const effectiveNowMs = this.#pausedAtMs ?? atMs;
    return effectiveNowMs - this.#startedAtMs - this.#pausedDurationMs;
  }
}
