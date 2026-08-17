// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

type AudioSource = 'local' | 'remote';

export const RING_RTC_AUDIO_PREROLL_SAMPLE_COUNT = 4_800;
export const RING_RTC_AUDIO_STALL_TOLERANCE_SAMPLE_COUNT = 12_000;
export const RING_RTC_AUDIO_COUNTER_RESET_SAMPLE_COUNT = 4_800;
export const RING_RTC_AUDIO_MAX_QUEUE_SAMPLE_COUNT = 48_000;

export type RingRtcAudioWorkletMessage =
  | Readonly<{
      type: 'packet';
      source: AudioSource;
      startSample: number;
      samples: Float32Array<ArrayBuffer>;
    }>
  | Readonly<{ type: 'start-degraded' }>
  | Readonly<{ type: 'start-generation'; generation: number }>
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
  #degraded = false;
  #stalledSamples = 0;
  readonly #prerollSamples: number;
  readonly #stallToleranceSamples: number;
  readonly #maxQueueSamples: number;
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

  constructor(
    prerollSamples = 0,
    stallToleranceSamples = RING_RTC_AUDIO_STALL_TOLERANCE_SAMPLE_COUNT,
    maxQueueSamples = RING_RTC_AUDIO_MAX_QUEUE_SAMPLE_COUNT
  ) {
    if (!Number.isSafeInteger(prerollSamples) || prerollSamples < 0) {
      throw new Error('Audio preroll must be a non-negative integer');
    }
    if (
      !Number.isSafeInteger(stallToleranceSamples) ||
      stallToleranceSamples <= 0
    ) {
      throw new Error('Audio stall tolerance must be a positive integer');
    }
    if (!Number.isSafeInteger(maxQueueSamples) || maxQueueSamples <= 0) {
      throw new Error('Audio queue limit must be a positive integer');
    }
    this.#prerollSamples = prerollSamples;
    this.#stallToleranceSamples = stallToleranceSamples;
    this.#maxQueueSamples = maxQueueSamples;
  }

  get cursor(): number {
    return this.#cursor;
  }

  get ready(): boolean {
    return this.#started || this.#canRender(this.#prerollSamples);
  }

  startWithAvailableSource(): boolean {
    if (this.#started) {
      return true;
    }

    const requiredEnd = this.#cursor + this.#prerollSamples;
    const hasAvailableSource = (['local', 'remote'] as const).some(source => {
      const knownThrough = this.#knownThrough[source];
      return knownThrough !== undefined && knownThrough >= requiredEnd;
    });
    if (!hasAvailableSource) {
      return false;
    }

    this.#started = true;
    this.#degraded = true;
    return true;
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

    let rebasedStartSample = startSample + sourceOffset;
    if (this.#degraded && rebasedStartSample + samples.length <= this.#cursor) {
      // Once degraded rendering has skipped past a stalled source, a steady
      // stream can remain a fraction of a packet behind the render cursor
      // forever. Rebase the first wholly-late packet so that the recovered
      // source can rejoin the mix instead of being discarded indefinitely.
      sourceOffset = this.#cursor - startSample;
      this.#sourceOffsets[source] = sourceOffset;
      this.#packets[source].length = 0;
      this.#knownThrough[source] = undefined;
      rebasedStartSample = this.#cursor;
    }
    if (
      rebasedStartSample <
      this.#cursor - RING_RTC_AUDIO_COUNTER_RESET_SAMPLE_COUNT
    ) {
      sourceOffset = this.#cursor - startSample;
      this.#sourceOffsets[source] = sourceOffset;
      this.#packets[source].length = 0;
      this.#knownThrough[source] = undefined;
      rebasedStartSample = this.#cursor;
    }
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
    this.#trimQueuedPackets(source);
  }

  reset(cursor: number, requirePreroll = true): void {
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
    this.#started = !requirePreroll;
    this.#degraded = !requirePreroll;
    this.#stalledSamples = 0;
  }

  render(sampleCount: number): Float32Array<ArrayBuffer> {
    if (!Number.isSafeInteger(sampleCount) || sampleCount < 0) {
      throw new Error('Audio render size must be a non-negative integer');
    }

    const output = new Float32Array(sampleCount);
    if (this.#prerollSamples > 0) {
      if (!this.#started) {
        if (!this.#canRender(this.#prerollSamples)) {
          return output;
        }
        this.#started = true;
      } else if (!this.#canRender(sampleCount)) {
        this.#stalledSamples += sampleCount;
        if (!this.#degraded) {
          if (this.#stalledSamples < this.#stallToleranceSamples) {
            return output;
          }
          this.#degraded = true;
        }
        this.#resyncToLatest(sampleCount);
      } else {
        this.#degraded = false;
        this.#stalledSamples = 0;
      }
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
    const requiredEnd = this.#cursor + sampleCount;
    return (['local', 'remote'] as const).every(source => {
      const knownThrough = this.#knownThrough[source];
      return knownThrough !== undefined && knownThrough >= requiredEnd;
    });
  }

  #resyncToLatest(sampleCount: number): boolean {
    const latestKnownThrough = Math.max(
      this.#knownThrough.local ?? 0,
      this.#knownThrough.remote ?? 0
    );
    if (latestKnownThrough <= this.#cursor) {
      return false;
    }
    this.#cursor = Math.max(this.#cursor, latestKnownThrough - sampleCount);
    this.#stalledSamples = 0;
    return true;
  }

  #trimQueuedPackets(source: AudioSource): void {
    if (!this.#started) {
      return;
    }
    const knownThrough = this.#knownThrough[source];
    if (knownThrough === undefined) {
      return;
    }
    const keepFrom = Math.max(
      this.#cursor,
      knownThrough - this.#maxQueueSamples
    );
    const packets = this.#packets[source];
    while (packets[0] && packetEnd(packets[0]) <= keepFrom) {
      packets.shift();
    }
    const first = packets[0];
    if (first && first.startSample < keepFrom) {
      const trim = keepFrom - first.startSample;
      packets[0] = {
        startSample: keepFrom,
        samples: first.samples.slice(trim),
      };
    }
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
