// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { open, stat } from 'node:fs/promises';

import {
  normalizePcmForWhisperInPlace,
  WHISPER_PCM_SAMPLE_RATE,
} from './whisperAudioPrep.std.ts';

const PCM_BYTES_PER_SAMPLE = Float32Array.BYTES_PER_ELEMENT;
const DEFAULT_READ_CHUNK_SAMPLES = 4 * 1024 * 1024;

export async function readPcmF32FileForWhisper(options: {
  path: string;
  inputSampleRate?: number;
  readChunkSamples?: number;
}): Promise<Float32Array> {
  const inputSampleRate = options.inputSampleRate ?? 48_000;
  const readChunkSamples = Math.max(
    1,
    Math.floor(options.readChunkSamples ?? DEFAULT_READ_CHUNK_SAMPLES)
  );
  if (!Number.isFinite(inputSampleRate) || inputSampleRate <= 0) {
    throw new Error(`Invalid PCM sample rate: ${inputSampleRate}`);
  }

  const fileStat = await stat(options.path);
  const inputSampleCount = Math.floor(fileStat.size / PCM_BYTES_PER_SAMPLE);
  if (inputSampleCount === 0) {
    throw new Error('PCM sidecar is empty');
  }

  const sourceSamplesPerOutputSample =
    inputSampleRate / WHISPER_PCM_SAMPLE_RATE;
  const outputSampleCount = Math.max(
    1,
    Math.round(inputSampleCount / sourceSamplesPerOutputSample)
  );
  let output: Float32Array;
  try {
    output = new Float32Array(outputSampleCount);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `PCM recording is too long to prepare for Whisper (${message})`
    );
  }

  const file = await open(options.path, 'r');
  try {
    let sourceStart = 0;
    let outputIndex = 0;

    while (sourceStart < inputSampleCount && outputIndex < output.length) {
      const coreSampleCount = Math.min(
        readChunkSamples,
        inputSampleCount - sourceStart
      );
      // One look-ahead sample preserves linear interpolation at chunk edges.
      const samplesToRead = Math.min(
        coreSampleCount + 1,
        inputSampleCount - sourceStart
      );
      const raw = Buffer.allocUnsafe(samplesToRead * PCM_BYTES_PER_SAMPLE);
      let bytesRead = 0;
      while (bytesRead < raw.byteLength) {
        // Reads are deliberately sequential so memory stays bounded.
        // eslint-disable-next-line no-await-in-loop
        const readResult = await file.read(
          raw,
          bytesRead,
          raw.byteLength - bytesRead,
          sourceStart * PCM_BYTES_PER_SAMPLE + bytesRead
        );
        if (readResult.bytesRead === 0) {
          break;
        }
        bytesRead += readResult.bytesRead;
      }

      const availableSampleCount = Math.floor(bytesRead / PCM_BYTES_PER_SAMPLE);
      if (availableSampleCount < coreSampleCount) {
        throw new Error('PCM sidecar ended while it was being read');
      }
      const input = new Float32Array(
        raw.buffer,
        raw.byteOffset,
        availableSampleCount
      );
      const sourceEnd = sourceStart + coreSampleCount;

      while (outputIndex < output.length) {
        const sourcePosition = outputIndex * sourceSamplesPerOutputSample;
        const sourceIndex = Math.floor(sourcePosition);
        if (sourceIndex >= sourceEnd) {
          break;
        }

        const localIndex = sourceIndex - sourceStart;
        const fraction = sourcePosition - sourceIndex;
        const first = input[localIndex] ?? 0;
        const second = input[localIndex + 1] ?? first;
        output[outputIndex] = first + (second - first) * fraction;
        outputIndex += 1;
      }

      sourceStart = sourceEnd;
    }

    if (outputIndex !== output.length) {
      throw new Error('PCM sidecar ended while it was being resampled');
    }
  } finally {
    await file.close();
  }

  return normalizePcmForWhisperInPlace(output);
}
