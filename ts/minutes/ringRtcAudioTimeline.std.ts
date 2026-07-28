// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

type AudioSource = 'local' | 'remote';

export const RING_RTC_AUDIO_PREROLL_SAMPLE_COUNT = 4_800;

export type RingRtcAudioWorkletMessage =
  | Readonly<{
      type: 'packet';
      source: AudioSource;
      startSample: number;
      samples: Float32Array<ArrayBuffer>;
    }>
  | Readonly<{ type: 'reset'; cursor: number; generation: number }>
  | Readonly<{ type: 'pause' }>
  | Readonly<{ type: 'stop' }>;

type Packet = Readonly<{
  startSample: number;
  samples: Float32Array;
}>;

function packetEnd(packet: Packet): number {
  return packet.startSample + packet.samples.length;
}

export class RingRtcAudioTimeline {
  #cursor = 0;
  #started = false;
  readonly #prerollSamples: number;
  readonly #sourceOffsets: Record<AudioSource, number | undefined> = {
    local: undefined,
    remote: undefined,
  };
  readonly #knownThrough: Record<AudioSource, number | undefined> = {
    local: undefined,
    remote: undefined,
  };
  readonly #packets: Record<AudioSource, Array<Packet>> = {
    local: [],
    remote: [],
  };

  constructor(prerollSamples = 0) {
    if (!Number.isSafeInteger(prerollSamples) || prerollSamples < 0) {
      throw new Error('Audio preroll must be a non-negative integer');
    }
    this.#prerollSamples = prerollSamples;
  }

  get cursor(): number {
    return this.#cursor;
  }

  get ready(): boolean {
    return this.#canRender(0);
  }

  enqueue(
    source: AudioSource,
    startSample: number,
    samples: Float32Array
  ): void {
    if (!Number.isSafeInteger(startSample) || startSample < 0) {
      throw new Error(
        'Audio packet sample offset must be a non-negative integer'
      );
    }
    if (samples.length === 0) {
      return;
    }

    let sourceOffset = this.#sourceOffsets[source];
    if (sourceOffset === undefined) {
      sourceOffset =
        startSample + samples.length <= this.#cursor
          ? this.#cursor - startSample
          : 0;
      this.#sourceOffsets[source] = sourceOffset;
    }

    const rebasedStartSample = startSample + sourceOffset;
    if (rebasedStartSample + samples.length <= this.#cursor) {
      return;
    }

    const trim = Math.max(0, this.#cursor - rebasedStartSample);
    this.#packets[source].push({
      startSample: rebasedStartSample + trim,
      samples: trim === 0 ? samples : samples.slice(trim),
    });
    this.#knownThrough[source] = Math.max(
      this.#knownThrough[source] ?? 0,
      rebasedStartSample + samples.length
    );
  }

  reset(cursor: number): void {
    if (!Number.isSafeInteger(cursor) || cursor < 0) {
      throw new Error('Audio timeline cursor must be a non-negative integer');
    }
    this.#cursor = cursor;
    this.#packets.local.length = 0;
    this.#packets.remote.length = 0;
    this.#sourceOffsets.local = undefined;
    this.#sourceOffsets.remote = undefined;
    this.#knownThrough.local = undefined;
    this.#knownThrough.remote = undefined;
    this.#started = false;
  }

  render(sampleCount: number): Float32Array<ArrayBuffer> {
    if (!Number.isSafeInteger(sampleCount) || sampleCount < 0) {
      throw new Error('Audio render size must be a non-negative integer');
    }

    const output = new Float32Array(sampleCount);
    if (!this.#canRender(sampleCount)) {
      return output;
    }
    this.#started = true;
    for (let index = 0; index < sampleCount; index += 1) {
      const local = this.#sampleAt('local', this.#cursor);
      const remote = this.#sampleAt('remote', this.#cursor);
      output[index] = Math.max(-1, Math.min(1, local + remote));
      this.#cursor += 1;
    }
    return output;
  }

  #canRender(sampleCount: number): boolean {
    if (this.#prerollSamples === 0) {
      return true;
    }

    const requiredSamples = this.#started ? sampleCount : this.#prerollSamples;
    const requiredEnd = this.#cursor + requiredSamples;
    return (['local', 'remote'] as const).every(source => {
      const knownThrough = this.#knownThrough[source];
      return knownThrough !== undefined && knownThrough >= requiredEnd;
    });
  }

  #sampleAt(source: AudioSource, sample: number): number {
    const packets = this.#packets[source];
    while (packets[0] && packetEnd(packets[0]) <= sample) {
      packets.shift();
    }

    const packet = packets[0];
    if (!packet || packet.startSample > sample) {
      return 0;
    }
    return packet.samples[sample - packet.startSample] ?? 0;
  }
}
