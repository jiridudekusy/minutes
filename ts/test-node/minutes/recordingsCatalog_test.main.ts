// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assert } from 'chai';

import {
  listCallRecordings,
  loadCallRecordingOutput,
} from '../../minutes/recordingsCatalog.main.ts';

describe('recordingsCatalog', () => {
  let recordingsDir: string;

  beforeEach(async () => {
    recordingsDir = await mkdtemp(
      join(tmpdir(), 'minutes-recordings-catalog-')
    );
  });

  afterEach(async () => {
    await rm(recordingsDir, { recursive: true, force: true });
  });

  it('lists a screen-share video with its transcription sidecars', async () => {
    const baseName = '2026-07-24_team-call_abcd1234';
    const recordingPath = join(recordingsDir, `${baseName}.webm`);
    await writeFile(recordingPath, Uint8Array.from([1, 2, 3]));
    await writeFile(
      join(recordingsDir, `${baseName}.pcm.f32`),
      new Uint8Array(new Float32Array([0.25, -0.25]).buffer)
    );
    await writeFile(
      join(recordingsDir, `${baseName}.speaker-activity.json`),
      '{}',
      'utf8'
    );
    await writeFile(
      join(recordingsDir, `${baseName}.json`),
      JSON.stringify({
        mediaKind: 'screen-share-video',
        conversationId: 'conversation-id',
        conversationTitle: 'Team call',
        callMode: 'Direct',
        startedAt: 1_000,
        endedAt: 4_000,
        durationMs: 3_000,
        videoFile: `${baseName}.webm`,
        pcmFile: `${baseName}.pcm.f32`,
        speakerActivityFile: `${baseName}.speaker-activity.json`,
      }),
      'utf8'
    );

    const entries = await listCallRecordings(recordingsDir);

    assert.lengthOf(entries, 1);
    assert.deepInclude(entries[0], {
      conversationId: 'conversation-id',
      conversationTitle: 'Team call',
      mediaKind: 'screen-share-video',
      recordingPath,
      hasPcmSidecar: true,
      hasTranscript: false,
      hasSummary: false,
    });
  });

  it('loads transcript and summary output beside a WebM recording', async () => {
    const baseName = '2026-07-24_team-call_efgh5678';
    await writeFile(
      join(recordingsDir, `${baseName}.webm`),
      Uint8Array.from([1])
    );
    await writeFile(
      join(recordingsDir, `${baseName}.transcript.md`),
      '# Přepis hovoru\n\n## Přepis\n\n[00:00:00] Jiří: Ahoj.',
      'utf8'
    );
    await writeFile(
      join(recordingsDir, `${baseName}.summary.md`),
      'Krátké shrnutí.',
      'utf8'
    );
    await writeFile(
      join(recordingsDir, `${baseName}.json`),
      JSON.stringify({
        mediaKind: 'screen-share-video',
        conversationId: 'conversation-id',
        conversationTitle: 'Team call',
        startedAt: 1_000,
        endedAt: 4_000,
        durationMs: 3_000,
        videoFile: `${baseName}.webm`,
      }),
      'utf8'
    );

    const [entry] = await listCallRecordings(recordingsDir);
    assert.isDefined(entry);
    if (!entry) {
      return;
    }

    assert.deepEqual(await loadCallRecordingOutput(entry), {
      conversationId: 'conversation-id',
      conversationTitle: 'Team call',
      transcriptPath: join(recordingsDir, `${baseName}.transcript.md`),
      transcriptText: '[00:00:00] Jiří: Ahoj.',
      summaryPath: join(recordingsDir, `${baseName}.summary.md`),
      summaryText: 'Krátké shrnutí.',
    });
  });
});
