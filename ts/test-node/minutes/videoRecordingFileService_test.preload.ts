// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { CallMode } from '../../types/CallDisposition.std.ts';
import {
  SPEAKER_ACTIVITY_LOG_VERSION,
  SPEAKER_ACTIVITY_SAMPLE_INTERVAL_MS,
  type SpeakerActivityLog,
} from '../../minutes/speakerActivity.std.ts';
import {
  createVideoRecordingFileService,
  unwrapVideoRecordingFileResult,
} from '../../minutes/videoRecordingFileService.preload.ts';

const speakerActivityLog: SpeakerActivityLog = {
  version: SPEAKER_ACTIVITY_LOG_VERSION,
  conversationId: 'conversation-id',
  callMode: CallMode.Direct,
  recordingStartedAt: Date.UTC(2026, 6, 22, 10, 0, 0),
  recordingDurationMs: 55_000,
  sampleIntervalMs: SPEAKER_ACTIVITY_SAMPLE_INTERVAL_MS,
  participants: {},
  samples: [],
};

describe('unwrapVideoRecordingFileResult', () => {
  it('throws an Error carrying the retained partial path on failure', () => {
    let error: unknown;
    try {
      unwrapVideoRecordingFileResult({
        ok: false,
        error: 'disk full',
        partialPath: '/recordings/call.webm.partial',
      });
    } catch (caught) {
      error = caught;
    }

    assert.instanceOf(error, Error);
    assert.strictEqual(error.message, 'disk full');
    assert.strictEqual(
      (error as Error & { partialPath?: string }).partialPath,
      '/recordings/call.webm.partial'
    );
  });
});

describe('videoRecordingFileService', () => {
  it('creates a streaming file session through the typed IPC channel', async () => {
    const calls: Array<{ channel: string; input: unknown }> = [];
    const service = createVideoRecordingFileService(async (channel, input) => {
      calls.push({ channel, input });
      return {
        sessionId: 'session-id',
        partialPath: '/recordings/call.webm.partial',
      };
    });
    const options = {
      conversationId: 'conversation-id',
      conversationTitle: 'Team call',
      callMode: 'Direct',
      startedAt: Date.UTC(2026, 6, 22, 10, 0, 0),
      codec: 'video/webm;codecs=vp9,opus' as const,
      width: 1920,
      height: 1080,
      frameRate: 15,
    };

    const created = await service.create(options);

    assert.deepEqual(created, {
      sessionId: 'session-id',
      partialPath: '/recordings/call.webm.partial',
    });
    assert.deepEqual(calls, [
      { channel: 'minutes:create-video-recording-file', input: options },
    ]);
  });

  it('awaits an acknowledged chunk append without retaining the chunk', async () => {
    const calls: Array<{ channel: string; input: unknown }> = [];
    const service = createVideoRecordingFileService(async (channel, input) => {
      calls.push({ channel, input });
      return { ok: true };
    });
    const data = Uint8Array.from([1, 2, 3]);

    await service.append('session-id', data);

    assert.deepEqual(calls, [
      {
        channel: 'minutes:append-video-recording-chunk',
        input: { sessionId: 'session-id', data },
      },
    ]);
  });

  it('streams PCM samples through the dedicated IPC channel', async () => {
    const calls: Array<{ channel: string; input: unknown }> = [];
    const service = createVideoRecordingFileService(async (channel, input) => {
      calls.push({ channel, input });
      return { ok: true };
    });
    const samples = Float32Array.from([0.25, -0.5]);

    await service.appendPcm('session-id', samples);

    assert.deepEqual(calls, [
      {
        channel: 'minutes:append-video-recording-pcm',
        input: { sessionId: 'session-id', samples },
      },
    ]);
  });

  it('unwraps the finalized WebM, metadata, and speaker paths', async () => {
    const calls: Array<{ channel: string; input: unknown }> = [];
    const service = createVideoRecordingFileService(async (channel, input) => {
      calls.push({ channel, input });
      return {
        ok: true,
        value: {
          filePath: '/recordings/call.webm',
          pcmPath: '/recordings/call.pcm.f32',
          metadataPath: '/recordings/call.json',
          speakerActivityPath: '/recordings/call.speaker-activity.json',
        },
      };
    });

    const finalized = await service.finalize({
      sessionId: 'session-id',
      endedAt: Date.UTC(2026, 6, 22, 10, 1, 0),
      recordedDurationMs: 55_000,
      speakerActivityLog,
    });

    assert.deepEqual(finalized, {
      filePath: '/recordings/call.webm',
      pcmPath: '/recordings/call.pcm.f32',
      metadataPath: '/recordings/call.json',
      speakerActivityPath: '/recordings/call.speaker-activity.json',
    });
    assert.deepEqual(calls, [
      {
        channel: 'minutes:finalize-video-recording-file',
        input: {
          sessionId: 'session-id',
          endedAt: Date.UTC(2026, 6, 22, 10, 1, 0),
          recordedDurationMs: 55_000,
          speakerActivityLog,
        },
      },
    ]);
  });

  it('preserves the finalized speaker activity sidecar path', async () => {
    const service = createVideoRecordingFileService(async () => ({
      ok: true,
      value: {
        filePath: '/recordings/call.webm',
        pcmPath: '/recordings/call.pcm.f32',
        metadataPath: '/recordings/call.json',
        speakerActivityPath: '/recordings/call.speaker-activity.json',
      },
    }));

    const finalized = await service.finalize({
      sessionId: 'session-id',
      endedAt: Date.UTC(2026, 6, 22, 10, 1, 0),
      recordedDurationMs: 55_000,
      speakerActivityLog,
    });

    assert.deepEqual(finalized, {
      filePath: '/recordings/call.webm',
      pcmPath: '/recordings/call.pcm.f32',
      metadataPath: '/recordings/call.json',
      speakerActivityPath: '/recordings/call.speaker-activity.json',
    });
  });

  it('rejects a malformed successful finalize result', async () => {
    const service = createVideoRecordingFileService(async () => ({
      ok: true,
      value: { filePath: 7, metadataPath: null },
    }));

    let error: unknown;
    try {
      await service.finalize({
        sessionId: 'session-id',
        endedAt: Date.UTC(2026, 6, 22, 10, 1, 0),
        recordedDurationMs: 55_000,
        speakerActivityLog,
      });
    } catch (caught) {
      error = caught;
    }

    assert.include(
      String(error),
      'Invalid finalize video recording file IPC result'
    );
  });

  it('aborts the writer session and returns its retained partial path', async () => {
    const calls: Array<{ channel: string; input: unknown }> = [];
    const service = createVideoRecordingFileService(async (channel, input) => {
      calls.push({ channel, input });
      return { partialPath: '/recordings/call.webm.partial' };
    });

    const aborted = await service.abort('session-id');

    assert.deepEqual(aborted, {
      partialPath: '/recordings/call.webm.partial',
    });
    assert.deepEqual(calls, [
      {
        channel: 'minutes:abort-video-recording-file',
        input: { sessionId: 'session-id' },
      },
    ]);
  });
});
