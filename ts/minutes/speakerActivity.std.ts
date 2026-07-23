// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { CallMode } from '../types/CallDisposition.std.ts';

export const SPEAKER_ACTIVITY_LOG_VERSION = 1;

export const SPEAKER_ACTIVITY_SAMPLE_INTERVAL_MS = 250;

/** PCM sidecar / CallRecorder worklet sample rate. */
export const RECORDING_PCM_SAMPLE_RATE = 48_000;

export const LOCAL_SPEAKER_ID = 'local';

export const REMOTE_SPEAKER_ID = 'remote';

/** Used when speaker log shows overlapping speech in a segment. */
export const MULTIPLE_VOICES_SPEAKER_ID = 'multiple-voices';

export const MULTIPLE_VOICES_SPEAKER_LABEL = 'více hlasů';

/** Legacy label stored in older activity logs and transcripts. */
export const LOCAL_SPEAKER_LEGACY_LABEL = 'Já';

export type SpeakerParticipantInfo = Readonly<{
  displayName: string;
  aci?: string;
  demuxId?: number;
  isLocal: boolean;
}>;

/** Same truncated level Signal stores in Redux (see truncateAudioLevel). */
export type SpeakerActivityLevel = Readonly<{
  id: string;
  level: number;
  /** True when level > 0 — same rule as CallingAudioIndicator in Signal UI. */
  speaking: boolean;
  /** RingRTC last-spoke timestamp for remote group participants. */
  speakerTime?: number;
}>;

export type SpeakerActivitySample = Readonly<{
  /** Milliseconds from start of recorded audio (excludes paused time). */
  tMs: number;
  levels: ReadonlyArray<SpeakerActivityLevel>;
}>;

export type SpeakerActivityLog = Readonly<{
  version: typeof SPEAKER_ACTIVITY_LOG_VERSION;
  conversationId: string;
  callMode: CallMode.Direct | CallMode.Group;
  /** Wall-clock ms when recording started (for mapping RingRTC speakerTime). */
  recordingStartedAt: number;
  recordingDurationMs: number;
  sampleIntervalMs: number;
  participants: Readonly<Record<string, SpeakerParticipantInfo>>;
  samples: ReadonlyArray<SpeakerActivitySample>;
}>;

export type AlignedTranscriptSegment = Readonly<{
  start: string;
  end: string;
  text: string;
  speakerLabel: string;
  speakerId: string;
}>;

export function isSpeakerActivityLog(
  value: unknown
): value is SpeakerActivityLog {
  if (
    typeof value !== 'object' ||
    value == null ||
    !('version' in value) ||
    value.version !== SPEAKER_ACTIVITY_LOG_VERSION ||
    !('conversationId' in value) ||
    typeof value.conversationId !== 'string' ||
    !('callMode' in value) ||
    (value.callMode !== CallMode.Direct && value.callMode !== CallMode.Group) ||
    !('recordingStartedAt' in value) ||
    typeof value.recordingStartedAt !== 'number' ||
    !Number.isFinite(value.recordingStartedAt) ||
    !('recordingDurationMs' in value) ||
    typeof value.recordingDurationMs !== 'number' ||
    !Number.isFinite(value.recordingDurationMs) ||
    value.recordingDurationMs < 0 ||
    !('sampleIntervalMs' in value) ||
    typeof value.sampleIntervalMs !== 'number' ||
    !Number.isFinite(value.sampleIntervalMs) ||
    value.sampleIntervalMs <= 0 ||
    !('participants' in value) ||
    typeof value.participants !== 'object' ||
    value.participants == null ||
    Array.isArray(value.participants) ||
    !('samples' in value) ||
    !Array.isArray(value.samples)
  ) {
    return false;
  }

  const participants = value.participants as Record<string, unknown>;
  for (const participant of Object.values(participants)) {
    if (
      typeof participant !== 'object' ||
      participant == null ||
      !('displayName' in participant) ||
      typeof participant.displayName !== 'string' ||
      !('isLocal' in participant) ||
      typeof participant.isLocal !== 'boolean' ||
      ('aci' in participant &&
        participant.aci != null &&
        typeof participant.aci !== 'string') ||
      ('demuxId' in participant &&
        participant.demuxId != null &&
        typeof participant.demuxId !== 'number')
    ) {
      return false;
    }
  }

  return (value.samples as Array<unknown>).every(sample => {
    if (
      typeof sample !== 'object' ||
      sample == null ||
      !('tMs' in sample) ||
      typeof sample.tMs !== 'number' ||
      !Number.isFinite(sample.tMs) ||
      sample.tMs < 0 ||
      !('levels' in sample) ||
      !Array.isArray(sample.levels)
    ) {
      return false;
    }
    return (sample.levels as Array<unknown>).every(level => {
      return (
        typeof level === 'object' &&
        level != null &&
        'id' in level &&
        typeof level.id === 'string' &&
        'level' in level &&
        typeof level.level === 'number' &&
        Number.isFinite(level.level) &&
        'speaking' in level &&
        typeof level.speaking === 'boolean' &&
        (!('speakerTime' in level) ||
          level.speakerTime == null ||
          typeof level.speakerTime === 'number')
      );
    });
  });
}

/** Keep activity samples within actual PCM length so speaker windows cannot outlive audio. */
export function clampSpeakerActivityLogToPcmDuration(
  log: SpeakerActivityLog,
  pcmDurationMs: number
): SpeakerActivityLog {
  if (!Number.isFinite(pcmDurationMs) || pcmDurationMs <= 0) {
    return log;
  }

  const samples = log.samples.filter(sample => sample.tMs < pcmDurationMs);
  return {
    ...log,
    recordingDurationMs: Math.min(log.recordingDurationMs, pcmDurationMs),
    samples,
  };
}

/**
 * Speaker-window transcription needs activity samples for (almost) the full recording.
 * When logging stopped early (background throttling, pause/resume bug), fall back to
 * transcribing the entire PCM sidecar.
 */
export function isSpeakerActivityCoverageSufficient(
  log: SpeakerActivityLog,
  pcmDurationMs: number,
  minCoverageRatio = 0.85
): boolean {
  if (log.samples.length === 0 || pcmDurationMs <= 0) {
    return false;
  }

  const lastSampleMs = log.samples.reduce(
    (max, sample) => Math.max(max, sample.tMs),
    0
  );
  const coveredMs = Math.max(log.recordingDurationMs, lastSampleMs);
  if (coveredMs < pcmDurationMs * minCoverageRatio) {
    return false;
  }

  const expectedSamples = Math.max(
    1,
    Math.floor(pcmDurationMs / log.sampleIntervalMs)
  );
  return log.samples.length >= expectedSamples * 0.4;
}

export function resolveSpeakerDisplayName(
  speakerId: string,
  activityLog: SpeakerActivityLog | null | undefined,
  options?: {
    localSpeakerDisplayName?: string;
    fallbackIndexById?: Map<string, number>;
  }
): string {
  if (speakerId === MULTIPLE_VOICES_SPEAKER_ID) {
    return MULTIPLE_VOICES_SPEAKER_LABEL;
  }

  const localName = options?.localSpeakerDisplayName?.trim();
  const known = activityLog?.participants[speakerId]?.displayName?.trim();

  if (speakerId === LOCAL_SPEAKER_ID) {
    if (localName) {
      return localName;
    }
    if (known && known !== LOCAL_SPEAKER_LEGACY_LABEL) {
      return known;
    }
    return known || LOCAL_SPEAKER_LEGACY_LABEL;
  }

  if (known && known.length > 0) {
    return known;
  }

  const fallbackIndexById = options?.fallbackIndexById;
  if (!fallbackIndexById) {
    return `Řečník ${speakerId.slice(0, 8)}`;
  }

  if (!fallbackIndexById.has(speakerId)) {
    fallbackIndexById.set(speakerId, fallbackIndexById.size + 1);
  }
  return `Řečník ${fallbackIndexById.get(speakerId)}`;
}

export function replaceLegacyLocalSpeakerLabels(
  text: string,
  localSpeakerDisplayName: string
): string {
  const name = localSpeakerDisplayName.trim();
  if (!name || name === LOCAL_SPEAKER_LEGACY_LABEL) {
    return text;
  }

  return text
    .replaceAll(`[${LOCAL_SPEAKER_LEGACY_LABEL}]:`, `[${name}]:`)
    .replaceAll(`| ${LOCAL_SPEAKER_LEGACY_LABEL}]`, `| ${name}]`);
}
