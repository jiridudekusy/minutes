// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export const RING_RTC_AUDIO_PROGRESS_SAMPLE_COUNT = 12_000;

export class RingRtcPcmChunker {
  readonly #chunkSize: number;
  #pending: Float32Array<ArrayBuffer>;
  #pendingLength = 0;

  constructor(chunkSize = RING_RTC_AUDIO_PROGRESS_SAMPLE_COUNT) {
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
      throw new Error('PCM chunk size must be a positive integer');
    }
    this.#chunkSize = chunkSize;
    this.#pending = new Float32Array(chunkSize);
  }

  reset(): void {
    this.#pendingLength = 0;
  }

  flush(): Float32Array<ArrayBuffer> | undefined {
    if (this.#pendingLength === 0) {
      return undefined;
    }
    const chunk = this.#pending.slice(0, this.#pendingLength);
    this.#pending = new Float32Array(this.#chunkSize);
    this.#pendingLength = 0;
    return chunk;
  }

  add(samples: Float32Array): Array<Float32Array<ArrayBuffer>> {
    const chunks = new Array<Float32Array<ArrayBuffer>>();
    let sourceOffset = 0;

    while (sourceOffset < samples.length) {
      const copyLength = Math.min(
        this.#chunkSize - this.#pendingLength,
        samples.length - sourceOffset
      );
      this.#pending.set(
        samples.subarray(sourceOffset, sourceOffset + copyLength),
        this.#pendingLength
      );
      this.#pendingLength += copyLength;
      sourceOffset += copyLength;

      if (this.#pendingLength === this.#chunkSize) {
        chunks.push(this.#pending);
        this.#pending = new Float32Array(this.#chunkSize);
        this.#pendingLength = 0;
      }
    }

    return chunks;
  }
}
