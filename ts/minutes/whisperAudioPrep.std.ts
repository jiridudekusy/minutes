// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { DEFAULT_WHISPER_PROMPT } from './whisperSettings.std.ts';

export const WHISPER_PCM_SAMPLE_RATE = 16_000;

/** Okraj okna řečníka — aby se neusekávaly začátky/konce slov. */
export const SPEAKER_WINDOW_PADDING_MS = 280;

const MAX_CHAINED_PROMPT_CHARS = 360;

function getNormalizationGain(
  input: Float32Array,
  targetRms: number,
  maxGain: number
): number {
  if (input.length === 0) {
    return 1;
  }

  let sumSquares = 0;
  for (const sample of input) {
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / input.length);
  if (rms < 1e-6) {
    return 1;
  }

  return Math.min(maxGain, targetRms / rms);
}

/**
 * Normalizuje hlasitost na cílovou RMS — pomáhá u tichého VoIP signálu.
 */
export function normalizePcmForWhisper(
  input: Float32Array,
  targetRms = 0.08,
  maxGain = 12
): Float32Array {
  const gain = getNormalizationGain(input, targetRms, maxGain);
  if (Math.abs(gain - 1) < 0.05) {
    return input;
  }

  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    output[i] = Math.max(-1, Math.min(1, (input[i] ?? 0) * gain));
  }
  return output;
}

/**
 * Normalizes an owned PCM buffer without allocating a second equally large
 * Float32Array. This is important for multi-hour recordings.
 */
export function normalizePcmForWhisperInPlace(
  input: Float32Array,
  targetRms = 0.08,
  maxGain = 12
): Float32Array {
  const gain = getNormalizationGain(input, targetRms, maxGain);
  if (Math.abs(gain - 1) < 0.05) {
    return input;
  }

  const owned = input;
  for (let i = 0; i < owned.length; i += 1) {
    owned[i] = Math.max(-1, Math.min(1, (owned[i] ?? 0) * gain));
  }
  return owned;
}

export function resamplePcmTo16kHz(
  input: Float32Array,
  inputSampleRate: number
): Float32Array {
  if (inputSampleRate === WHISPER_PCM_SAMPLE_RATE) {
    return input;
  }

  const ratio = inputSampleRate / WHISPER_PCM_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const srcIndex = i * ratio;
    const idx = Math.floor(srcIndex);
    const frac = srcIndex - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    output[i] = a + (b - a) * frac;
  }

  return output;
}

export function preparePcmForWhisper(
  input: Float32Array,
  inputSampleRate: number
): Float32Array {
  const resampled = resamplePcmTo16kHz(input, inputSampleRate);
  return normalizePcmForWhisper(resampled);
}

export function buildChainedWhisperPrompt(previousText: string): string {
  const trimmed = previousText.trim();
  if (trimmed.length === 0) {
    return DEFAULT_WHISPER_PROMPT;
  }

  const tail = trimmed.slice(-MAX_CHAINED_PROMPT_CHARS);
  return `${DEFAULT_WHISPER_PROMPT}\n\n${tail}`;
}
