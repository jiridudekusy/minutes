// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export const RING_RTC_AUDIO_TAP_VERSION = 1;
export const RING_RTC_AUDIO_SAMPLE_RATE = 48_000;
export const RING_RTC_AUDIO_CHANNELS = 1;

export type RingRtcAudioTapChunk = Readonly<{
  sampleRate: number;
  channels: number;
  localInputStartSample: number;
  remotePlayoutStartSample: number;
  localInputPcm: Uint8Array<ArrayBuffer>;
  remotePlayoutPcm: Uint8Array<ArrayBuffer>;
  droppedLocalInputSamples: number;
  droppedRemotePlayoutSamples: number;
}>;

export type RingRtcAudioPacket = Readonly<{
  startSample: number;
  samples: Float32Array<ArrayBuffer>;
}>;

export type RingRtcAudioPackets = Readonly<{
  local: RingRtcAudioPacket;
  remote: RingRtcAudioPacket;
  droppedSamples: number;
}>;

function decodeS16Le(pcm: Uint8Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  if (pcm.byteLength % 2 !== 0) {
    throw new Error('RingRTC audio tap returned malformed 16-bit PCM');
  }

  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const samples = new Float32Array(pcm.byteLength / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 32_768;
  }
  return samples;
}

export function createRingRtcAudioPackets(
  chunk: RingRtcAudioTapChunk
): RingRtcAudioPackets {
  if (
    chunk.sampleRate !== RING_RTC_AUDIO_SAMPLE_RATE ||
    chunk.channels !== RING_RTC_AUDIO_CHANNELS
  ) {
    throw new Error('RingRTC audio tap must provide 48 kHz mono PCM');
  }
  if (
    !Number.isSafeInteger(chunk.localInputStartSample) ||
    chunk.localInputStartSample < 0 ||
    !Number.isSafeInteger(chunk.remotePlayoutStartSample) ||
    chunk.remotePlayoutStartSample < 0
  ) {
    throw new Error('RingRTC audio tap returned an invalid sample offset');
  }

  return {
    local: {
      startSample: chunk.localInputStartSample,
      samples: decodeS16Le(chunk.localInputPcm),
    },
    remote: {
      startSample: chunk.remotePlayoutStartSample,
      samples: decodeS16Le(chunk.remotePlayoutPcm),
    },
    droppedSamples:
      chunk.droppedLocalInputSamples + chunk.droppedRemotePlayoutSamples,
  };
}
