// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';

import { assert } from 'chai';

import {
  initializeMinutesVideoRecordingChannel,
  VideoRecordingFileWriter,
} from '../../../app/minutes_video_recording_channel.main.ts';
import { CallMode } from '../../types/CallDisposition.std.ts';
import {
  SPEAKER_ACTIVITY_LOG_VERSION,
  SPEAKER_ACTIVITY_SAMPLE_INTERVAL_MS,
  type SpeakerActivityLog,
} from '../../minutes/speakerActivity.std.ts';

describe('VideoRecordingFileWriter', () => {
  let recordingsDir: string;

  beforeEach(async () => {
    recordingsDir = await mkdtemp(join(tmpdir(), 'minutes-video-writer-'));
  });

  afterEach(async () => {
    await rm(recordingsDir, { recursive: true, force: true });
  });

  it('serializes concurrent chunk appends in invocation order', async () => {
    const writer = new VideoRecordingFileWriter({ recordingsDir });
    const session = await writer.create(7, {
      conversationId: 'conversation-id',
      conversationTitle: 'Team call',
      callMode: 'Direct',
      startedAt: Date.UTC(2026, 6, 22, 10, 0, 0),
      codec: 'video/webm;codecs=vp9,opus',
      width: 1920,
      height: 1080,
      frameRate: 15,
    });

    await Promise.all([
      writer.append(7, session.sessionId, Uint8Array.from([1, 2])),
      writer.append(7, session.sessionId, Uint8Array.from([3, 4])),
    ]);
    const result = await writer.finalize(7, session.sessionId, {
      endedAt: Date.UTC(2026, 6, 22, 10, 1, 0),
      recordedDurationMs: 60_000,
      speakerActivityLog: createTestSpeakerActivityLog(
        Date.UTC(2026, 6, 22, 10, 0, 0),
        60_000
      ),
    });

    assert.deepEqual([...(await readFile(result.filePath))], [1, 2, 3, 4]);
  });

  it('rejects a chunk when the bounded write queue is full', async () => {
    const writer = new VideoRecordingFileWriter({
      recordingsDir,
      maxQueuedBytes: 3,
    });
    const session = await writer.create(7, {
      conversationId: 'conversation-id',
      conversationTitle: 'Team call',
      callMode: 'Direct',
      startedAt: Date.UTC(2026, 6, 22, 10, 0, 0),
      codec: 'video/webm;codecs=vp9,opus',
      width: 1920,
      height: 1080,
      frameRate: 15,
    });

    const firstWrite = writer.append(
      7,
      session.sessionId,
      Uint8Array.from([1, 2])
    );

    let error: unknown;
    try {
      await writer.append(7, session.sessionId, Uint8Array.from([3, 4]));
    } catch (caught) {
      error = caught;
    }
    assert.instanceOf(error, Error);
    assert.include(String(error), 'Video recording write queue is full');
    await firstWrite;
    await writer.abort(7, session.sessionId);
  });

  it('atomically finalizes the WebM and writes separate video metadata', async () => {
    const writer = new VideoRecordingFileWriter({ recordingsDir });
    const startedAt = Date.UTC(2026, 6, 22, 10, 0, 0);
    const endedAt = Date.UTC(2026, 6, 22, 10, 1, 0);
    const session = await writer.create(7, {
      conversationId: 'conversation-id',
      conversationTitle: 'Team call',
      callMode: 'Group',
      eraId: 'era-id',
      startedAt,
      codec: 'video/webm;codecs=vp9,opus',
      width: 1920,
      height: 1080,
      frameRate: 15,
    });
    await writer.append(7, session.sessionId, Uint8Array.from([1]));

    const result = await writer.finalize(7, session.sessionId, {
      endedAt,
      recordedDurationMs: 55_000,
      speakerActivityLog: createTestSpeakerActivityLog(
        startedAt,
        55_000,
        CallMode.Group
      ),
    });

    const metadata = JSON.parse(await readFile(result.metadataPath, 'utf8'));
    assert.deepInclude(metadata, {
      mediaKind: 'screen-share-video',
      conversationId: 'conversation-id',
      conversationTitle: 'Team call',
      callMode: 'Group',
      eraId: 'era-id',
      startedAt,
      endedAt,
      durationMs: 55_000,
      width: 1920,
      height: 1080,
      frameRate: 15,
      codec: 'video/webm;codecs=vp9,opus',
    });
    assert.strictEqual(metadata.videoFile, result.filePath.split('/').at(-1));
    await assertFileDoesNotExist(session.partialPath);
    assert.strictEqual((await stat(result.filePath)).size, 1);
  });

  it('streams mixed PCM into a finalized sidecar referenced by metadata', async () => {
    const writer = new VideoRecordingFileWriter({ recordingsDir });
    const startedAt = Date.UTC(2026, 6, 24, 10, 0, 0);
    const session = await writer.create(7, {
      conversationId: 'conversation-id',
      conversationTitle: 'Team call',
      callMode: CallMode.Direct,
      startedAt,
      codec: 'video/webm;codecs=vp9,opus',
      width: 1920,
      height: 1080,
      frameRate: 15,
    });
    const pcmWriter = writer as VideoRecordingFileWriter & {
      appendPcm(
        ownerId: number,
        sessionId: string,
        samples: Float32Array<ArrayBuffer>
      ): Promise<void>;
    };
    assert.isFunction(pcmWriter.appendPcm);
    await writer.append(7, session.sessionId, Uint8Array.from([1]));
    await pcmWriter.appendPcm(
      7,
      session.sessionId,
      Float32Array.from([0.25, -0.5])
    );

    const result = (await writer.finalize(7, session.sessionId, {
      endedAt: startedAt + 1_000,
      recordedDurationMs: 1_000,
      speakerActivityLog: createTestSpeakerActivityLog(startedAt, 1_000),
    })) as Awaited<ReturnType<VideoRecordingFileWriter['finalize']>> & {
      pcmPath: string;
    };

    const pcmData = await readFile(result.pcmPath);
    const pcmSamples = new Float32Array(
      pcmData.buffer.slice(
        pcmData.byteOffset,
        pcmData.byteOffset + pcmData.byteLength
      )
    );
    assert.deepEqual([...pcmSamples], [0.25, -0.5]);
    const metadata = JSON.parse(await readFile(result.metadataPath, 'utf8'));
    assert.strictEqual(metadata.pcmFile, result.pcmPath.split('/').at(-1));
  });

  it('rejects finalization without a valid speaker activity log', async () => {
    const writer = new VideoRecordingFileWriter({ recordingsDir });
    const session = await writer.create(7, {
      conversationId: 'conversation-id',
      conversationTitle: 'Team call',
      callMode: CallMode.Direct,
      startedAt: Date.UTC(2026, 6, 22, 10, 0, 0),
      codec: 'video/webm;codecs=vp9,opus',
      width: 1920,
      height: 1080,
      frameRate: 15,
    });
    await writer.append(7, session.sessionId, Uint8Array.from([1]));

    let error: unknown;
    try {
      await writer.finalize(7, session.sessionId, {
        endedAt: Date.UTC(2026, 6, 22, 10, 1, 0),
        recordedDurationMs: 60_000,
        speakerActivityLog: undefined as unknown as SpeakerActivityLog,
      });
    } catch (caught) {
      error = caught;
    }

    assert.instanceOf(error, Error);
    assert.include(String(error), 'speaker activity');
    assert.deepEqual([...(await readFile(session.partialPath))], [1]);
  });

  it('writes the matching speaker activity sidecar and metadata reference', async () => {
    const writer = new VideoRecordingFileWriter({ recordingsDir });
    const startedAt = Date.UTC(2026, 6, 22, 10, 0, 0);
    const session = await writer.create(7, {
      conversationId: 'conversation-id',
      conversationTitle: 'Team call',
      callMode: CallMode.Group,
      startedAt,
      codec: 'video/webm;codecs=vp9,opus',
      width: 1920,
      height: 1080,
      frameRate: 15,
    });
    await writer.append(7, session.sessionId, Uint8Array.from([1]));
    const speakerActivityLog: SpeakerActivityLog = {
      version: SPEAKER_ACTIVITY_LOG_VERSION,
      conversationId: 'conversation-id',
      callMode: CallMode.Group,
      recordingStartedAt: startedAt,
      recordingDurationMs: 1_000,
      sampleIntervalMs: SPEAKER_ACTIVITY_SAMPLE_INTERVAL_MS,
      participants: {
        local: { displayName: 'Jiří', isLocal: true },
      },
      samples: [
        {
          tMs: 250,
          levels: [{ id: 'local', level: 8, speaking: true }],
        },
      ],
    };

    const result = await writer.finalize(7, session.sessionId, {
      endedAt: startedAt + 1_000,
      recordedDurationMs: 1_000,
      speakerActivityLog,
    });

    const { speakerActivityPath } = result;
    assert.isString(speakerActivityPath);
    if (!speakerActivityPath) {
      assert.fail('speaker activity path is missing');
    }
    const sidecar = JSON.parse(await readFile(speakerActivityPath, 'utf8'));
    assert.deepEqual(sidecar, speakerActivityLog);
    const metadata = JSON.parse(await readFile(result.metadataPath, 'utf8'));
    assert.strictEqual(
      metadata.speakerActivityFile,
      speakerActivityPath.split('/').at(-1)
    );
  });

  it('publishes PCM, speaker sidecar, and metadata before the WebM', async () => {
    const published = new Array<string>();
    const writer = new VideoRecordingFileWriter({
      recordingsDir,
      renameFile: async (source, target) => {
        published.push(target.split('/').at(-1) ?? target);
        await rename(source, target);
      },
    });
    const startedAt = Date.UTC(2026, 6, 22, 10, 0, 0);
    const session = await writer.create(7, {
      conversationId: 'conversation-id',
      conversationTitle: 'Team call',
      callMode: CallMode.Group,
      startedAt,
      codec: 'video/webm;codecs=vp9,opus',
      width: 1920,
      height: 1080,
      frameRate: 15,
    });
    await writer.append(7, session.sessionId, Uint8Array.from([1]));

    await writer.finalize(7, session.sessionId, {
      endedAt: startedAt + 1_000,
      recordedDurationMs: 1_000,
      speakerActivityLog: {
        version: SPEAKER_ACTIVITY_LOG_VERSION,
        conversationId: 'conversation-id',
        callMode: CallMode.Group,
        recordingStartedAt: startedAt,
        recordingDurationMs: 1_000,
        sampleIntervalMs: SPEAKER_ACTIVITY_SAMPLE_INTERVAL_MS,
        participants: {},
        samples: [],
      },
    });

    assert.match(published[0] ?? '', /\.pcm\.f32$/);
    assert.match(published[1] ?? '', /\.speaker-activity\.json$/);
    assert.match(published[2] ?? '', /\.json$/);
    assert.match(published[3] ?? '', /\.webm$/);
  });

  it('rolls metadata back when speaker sidecar publication fails', async () => {
    const writer = new VideoRecordingFileWriter({ recordingsDir });
    const startedAt = Date.UTC(2026, 6, 22, 10, 0, 0);
    const session = await writer.create(7, {
      conversationId: 'conversation-id',
      conversationTitle: 'Team call',
      callMode: CallMode.Group,
      startedAt,
      codec: 'video/webm;codecs=vp9,opus',
      width: 1920,
      height: 1080,
      frameRate: 15,
    });
    await writer.append(7, session.sessionId, Uint8Array.from([1, 2]));
    const speakerActivityPath = session.partialPath.replace(
      /\.webm\.partial$/,
      '.speaker-activity.json'
    );
    const metadataPath = session.partialPath.replace(
      /\.webm\.partial$/,
      '.json'
    );
    await mkdir(speakerActivityPath);

    let error: unknown;
    try {
      await writer.finalize(7, session.sessionId, {
        endedAt: startedAt + 1_000,
        recordedDurationMs: 1_000,
        speakerActivityLog: {
          version: SPEAKER_ACTIVITY_LOG_VERSION,
          conversationId: 'conversation-id',
          callMode: CallMode.Group,
          recordingStartedAt: startedAt,
          recordingDurationMs: 1_000,
          sampleIntervalMs: SPEAKER_ACTIVITY_SAMPLE_INTERVAL_MS,
          participants: {},
          samples: [],
        },
      });
    } catch (caught) {
      error = caught;
    }

    assert.instanceOf(error, Error);
    assert.deepEqual([...(await readFile(session.partialPath))], [1, 2]);
    await assertFileDoesNotExist(metadataPath);
    await assertFileDoesNotExist(`${speakerActivityPath}.partial`);
  });

  it('idempotently aborts a session and retains its partial file', async () => {
    const writer = new VideoRecordingFileWriter({ recordingsDir });
    const session = await writer.create(7, {
      conversationId: 'conversation-id',
      conversationTitle: 'Team call',
      callMode: 'Direct',
      startedAt: Date.UTC(2026, 6, 22, 10, 0, 0),
      codec: 'video/webm;codecs=vp9,opus',
      width: 1920,
      height: 1080,
      frameRate: 15,
    });
    await writer.append(7, session.sessionId, Uint8Array.from([1, 2]));

    const first = await writer.abort(7, session.sessionId);
    const second = await writer.abort(7, session.sessionId);

    assert.deepEqual(first, { partialPath: session.partialPath });
    assert.deepEqual(second, { partialPath: session.partialPath });
    assert.deepEqual([...(await readFile(session.partialPath))], [1, 2]);
  });

  it('does not reveal an aborted session path to another owner', async () => {
    const writer = new VideoRecordingFileWriter({ recordingsDir });
    const session = await writer.create(7, {
      conversationId: 'conversation-id',
      conversationTitle: 'Team call',
      callMode: 'Direct',
      startedAt: Date.UTC(2026, 6, 22, 10, 0, 0),
      codec: 'video/webm;codecs=vp9,opus',
      width: 1920,
      height: 1080,
      frameRate: 15,
    });
    await writer.abort(7, session.sessionId);

    let error: unknown;
    try {
      await writer.abort(8, session.sessionId);
    } catch (caught) {
      error = caught;
    }

    assert.include(String(error), 'Unknown video recording session');
  });

  it('reports the retained partial path when a disk write fails', async () => {
    const writer = new VideoRecordingFileWriter({
      recordingsDir,
      openFile: async path => {
        const handle = await open(path, 'wx');
        return {
          writeFile: async () => {
            throw new Error('disk full');
          },
          sync: async () => handle.sync(),
          close: async () => handle.close(),
        };
      },
    });
    const session = await writer.create(7, {
      conversationId: 'conversation-id',
      conversationTitle: 'Team call',
      callMode: 'Direct',
      startedAt: Date.UTC(2026, 6, 22, 10, 0, 0),
      codec: 'video/webm;codecs=vp9,opus',
      width: 1920,
      height: 1080,
      frameRate: 15,
    });

    let error: unknown;
    try {
      await writer.append(7, session.sessionId, Uint8Array.from([1]));
    } catch (caught) {
      error = caught;
    }

    assert.instanceOf(error, Error);
    assert.include(String(error), 'disk full');
    assert.strictEqual(
      (error as Error & { partialPath?: string }).partialPath,
      session.partialPath
    );
    assert.strictEqual((await stat(session.partialPath)).size, 0);
    assert.deepEqual(await writer.abort(7, session.sessionId), {
      partialPath: session.partialPath,
    });
  });
});

describe('minutes video recording IPC', () => {
  it('binds a file session to the creating webContents', async () => {
    const recordingsDir = await mkdtemp(
      join(tmpdir(), 'minutes-video-channel-')
    );
    try {
      const ipcMain = new FakeIpcMain();
      initializeMinutesVideoRecordingChannel({ ipcMain, recordingsDir });
      const owner = createFakeSender(7);
      const stranger = createFakeSender(8);
      const created = await ipcMain.invoke(
        'minutes:create-video-recording-file',
        owner,
        {
          conversationId: 'conversation-id',
          conversationTitle: 'Team call',
          callMode: 'Direct',
          startedAt: Date.UTC(2026, 6, 22, 10, 0, 0),
          codec: 'video/webm;codecs=vp9,opus',
          width: 1920,
          height: 1080,
          frameRate: 15,
        }
      );

      let error: unknown;
      try {
        await ipcMain.invoke('minutes:append-video-recording-chunk', stranger, {
          sessionId: created.sessionId,
          data: Uint8Array.from([1]),
        });
      } catch (caught) {
        error = caught;
      }
      assert.instanceOf(error, Error);
      assert.include(String(error), 'Unknown video recording session');
      await ipcMain.invoke('minutes:abort-video-recording-file', owner, {
        sessionId: created.sessionId,
      });
    } finally {
      await rm(recordingsDir, { recursive: true, force: true });
    }
  });

  it('closes and retains partial sessions when webContents is destroyed', async () => {
    const recordingsDir = await mkdtemp(
      join(tmpdir(), 'minutes-video-channel-')
    );
    try {
      const ipcMain = new FakeIpcMain();
      initializeMinutesVideoRecordingChannel({ ipcMain, recordingsDir });
      const owner = createFakeSender(7);
      const created = await ipcMain.invoke(
        'minutes:create-video-recording-file',
        owner,
        {
          conversationId: 'conversation-id',
          conversationTitle: 'Team call',
          callMode: 'Direct',
          startedAt: Date.UTC(2026, 6, 22, 10, 0, 0),
          codec: 'video/webm;codecs=vp9,opus',
          width: 1920,
          height: 1080,
          frameRate: 15,
        }
      );
      await ipcMain.invoke('minutes:append-video-recording-chunk', owner, {
        sessionId: created.sessionId,
        data: Uint8Array.from([1, 2]),
      });

      owner.emit('destroyed');
      await new Promise(resolve => {
        setImmediate(resolve);
      });

      let error: unknown;
      try {
        await ipcMain.invoke('minutes:append-video-recording-chunk', owner, {
          sessionId: created.sessionId,
          data: Uint8Array.from([3]),
        });
      } catch (caught) {
        error = caught;
      }
      assert.instanceOf(error, Error);
      assert.include(String(error), 'Unknown video recording session');
      assert.deepEqual([...(await readFile(created.partialPath))], [1, 2]);
    } finally {
      await rm(recordingsDir, { recursive: true, force: true });
    }
  });

  it('returns the partial path and closes the session after an IPC write failure', async () => {
    const recordingsDir = await mkdtemp(
      join(tmpdir(), 'minutes-video-channel-')
    );
    try {
      const ipcMain = new FakeIpcMain();
      const writer = new VideoRecordingFileWriter({
        recordingsDir,
        openFile: async path => {
          const handle = await open(path, 'wx');
          return {
            writeFile: async () => {
              throw new Error('disk full');
            },
            sync: async () => handle.sync(),
            close: async () => handle.close(),
          };
        },
      });
      initializeMinutesVideoRecordingChannel({
        ipcMain,
        recordingsDir,
        writer,
      });
      const owner = createFakeSender(7);
      const created = await ipcMain.invoke(
        'minutes:create-video-recording-file',
        owner,
        {
          conversationId: 'conversation-id',
          conversationTitle: 'Team call',
          callMode: 'Direct',
          startedAt: Date.UTC(2026, 6, 22, 10, 0, 0),
          codec: 'video/webm;codecs=vp9,opus',
          width: 1920,
          height: 1080,
          frameRate: 15,
        }
      );

      const result = await ipcMain.invoke(
        'minutes:append-video-recording-chunk',
        owner,
        { sessionId: created.sessionId, data: Uint8Array.from([1]) }
      );

      assert.deepInclude(result, {
        ok: false,
        partialPath: created.partialPath,
      });
      assert.include(result.error, 'disk full');
      let error: unknown;
      try {
        await writer.append(7, created.sessionId, Uint8Array.from([2]));
      } catch (caught) {
        error = caught;
      }
      assert.include(String(error), 'Unknown video recording session');
    } finally {
      await rm(recordingsDir, { recursive: true, force: true });
    }
  });

  it('returns the retained partial path when final rename fails', async () => {
    const recordingsDir = await mkdtemp(
      join(tmpdir(), 'minutes-video-channel-')
    );
    try {
      const ipcMain = new FakeIpcMain();
      initializeMinutesVideoRecordingChannel({ ipcMain, recordingsDir });
      const owner = createFakeSender(7);
      const created = await ipcMain.invoke(
        'minutes:create-video-recording-file',
        owner,
        {
          conversationId: 'conversation-id',
          conversationTitle: 'Team call',
          callMode: 'Direct',
          startedAt: Date.UTC(2026, 6, 22, 10, 0, 0),
          codec: 'video/webm;codecs=vp9,opus',
          width: 1920,
          height: 1080,
          frameRate: 15,
        }
      );
      await ipcMain.invoke('minutes:append-video-recording-chunk', owner, {
        sessionId: created.sessionId,
        data: Uint8Array.from([1, 2]),
      });
      await mkdir(created.partialPath.replace(/\.partial$/, ''));

      const result = await ipcMain.invoke(
        'minutes:finalize-video-recording-file',
        owner,
        {
          sessionId: created.sessionId,
          endedAt: Date.UTC(2026, 6, 22, 10, 1, 0),
          recordedDurationMs: 60_000,
          speakerActivityLog: createTestSpeakerActivityLog(
            Date.UTC(2026, 6, 22, 10, 0, 0),
            60_000
          ),
        }
      );

      assert.deepInclude(result, {
        ok: false,
        partialPath: created.partialPath,
      });
      assert.deepEqual([...(await readFile(created.partialPath))], [1, 2]);
    } finally {
      await rm(recordingsDir, { recursive: true, force: true });
    }
  });
});

async function assertFileDoesNotExist(path: string): Promise<void> {
  let error: unknown;
  try {
    await stat(path);
  } catch (caught) {
    error = caught;
  }
  assert.instanceOf(error, Error);
  assert.include(String(error), 'ENOENT');
}

function createTestSpeakerActivityLog(
  recordingStartedAt: number,
  recordingDurationMs: number,
  callMode: CallMode.Direct | CallMode.Group = CallMode.Direct
): SpeakerActivityLog {
  return {
    version: SPEAKER_ACTIVITY_LOG_VERSION,
    conversationId: 'conversation-id',
    callMode,
    recordingStartedAt,
    recordingDurationMs,
    sampleIntervalMs: SPEAKER_ACTIVITY_SAMPLE_INTERVAL_MS,
    participants: {},
    samples: [],
  };
}

type FakeSender = EventEmitter & Readonly<{ id: number }>;

function createFakeSender(id: number): FakeSender {
  return Object.assign(new EventEmitter(), { id });
}

type FakeIpcResult = Readonly<{
  sessionId: string;
  partialPath: string;
  ok: boolean;
  error: string;
}>;

type FakeIpcHandler = (
  event: { sender: FakeSender },
  input: unknown
) => unknown;

class FakeIpcMain {
  readonly #handlers = new Map<string, FakeIpcHandler>();

  handle(channel: string, handler: FakeIpcHandler): void {
    this.#handlers.set(channel, handler);
  }

  async invoke(
    channel: string,
    sender: FakeSender,
    input: unknown
  ): Promise<FakeIpcResult> {
    const handler = this.#handlers.get(channel);
    assert.isFunction(handler, `Missing IPC handler ${channel}`);
    return (await handler?.({ sender }, input)) as FakeIpcResult;
  }
}
