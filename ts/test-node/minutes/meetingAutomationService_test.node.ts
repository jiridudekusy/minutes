// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { AutomationJobRegistry } from '../../minutes/automation/jobRegistry.std.ts';
import { MeetingAutomationService } from '../../minutes/automation/meetingAutomationService.node.ts';
import type { CallRecordingCatalogEntry } from '../../minutes/recordingsCatalog.std.ts';

const RECORDINGS: ReadonlyArray<CallRecordingCatalogEntry> = [
  {
    conversationId: 'conversation-a',
    conversationTitle: 'PSS Team',
    startedAt: 200,
    endedAt: 300,
    durationMs: 100,
    mediaKind: 'screen-share-video',
    recordingPath: '/Documents/Minutes/team.webm',
    hasPcmSidecar: true,
    hasTranscript: true,
    hasSummary: true,
    transcriptPath: '/Documents/Minutes/team.transcript.md',
    summaryPath: '/Documents/Minutes/team.summary.md',
  },
  {
    conversationId: 'conversation-b',
    conversationTitle: 'Alice',
    startedAt: 100,
    endedAt: 150,
    durationMs: 50,
    mediaKind: 'audio',
    recordingPath: '/Documents/Minutes/alice.mp3',
    hasPcmSidecar: true,
    hasTranscript: false,
    hasSummary: false,
  },
];

describe('MeetingAutomationService', () => {
  function createService() {
    const registry = new AutomationJobRegistry({
      maxConcurrent: 1,
      idFactory: (() => {
        let id = 0;
        return () => `job-${(id += 1)}`;
      })(),
    });
    const calls: Array<string> = [];
    const service = new MeetingAutomationService({
      jobRegistry: registry,
      listRecordings: async () => [...RECORDINGS],
      loadRecordingOutput: async entry => ({
        conversationId: entry.conversationId,
        conversationTitle: entry.conversationTitle,
        transcriptPath: entry.transcriptPath ?? '',
        transcriptText: 'Speaker: transcript text',
        summaryPath: entry.summaryPath,
        summaryText: 'Summary text',
      }),
      getFileSize: async () => 1234,
      transcribeRecording: async (entry, context) => {
        calls.push(`transcribe:${entry.recordingPath}`);
        context.reportProgress(50, 'half');
        return { transcriptPath: '/result.transcript.md' };
      },
      summarizeRecording: async entry => {
        calls.push(`summary:${entry.recordingPath}`);
        return { summaryPath: '/result.summary.md' };
      },
    });
    return { calls, registry, service };
  }

  it('lists opaque recording IDs with pagination and file metadata', async () => {
    const { service } = createService();

    const first = await service.listRecordings({ limit: 1 });

    assert.lengthOf(first.items, 1);
    const firstItem = first.items[0];
    if (firstItem == null) {
      throw new Error('Expected first recording');
    }
    assert.deepInclude(firstItem, {
      conversationTitle: 'PSS Team',
      mimeType: 'video/webm',
      sizeBytes: 1234,
      hasTranscript: true,
      hasSummary: true,
    });
    assert.match(firstItem.id, /^[a-f0-9]{32}$/);
    assert.notInclude(firstItem.id, 'team');
    assert.isString(first.nextCursor);

    const second = await service.listRecordings({
      cursor: first.nextCursor,
      limit: 1,
    });
    const secondItem = second.items[0];
    if (secondItem == null) {
      throw new Error('Expected second recording');
    }
    assert.strictEqual(secondItem.conversationTitle, 'Alice');
  });

  it('searches recordings and reads canonical transcript and summary resources', async () => {
    const { service } = createService();
    const search = await service.searchRecordings({ query: 'pss' });
    assert.lengthOf(search.items, 1);
    const recording = search.items[0];
    if (recording == null) {
      throw new Error('Expected searched recording');
    }
    assert.strictEqual(
      (await service.readTranscript(recording.id)).text,
      'Speaker: transcript text'
    );
    assert.strictEqual(
      (await service.readSummary(recording.id)).text,
      'Summary text'
    );
  });

  it('queues transcription and summary jobs against catalog IDs', async () => {
    const { calls, registry, service } = createService();
    const { items } = await service.listRecordings({});
    const recording = items[0];
    if (recording == null) {
      throw new Error('Expected recording');
    }
    const recordingId = recording.id;

    const transcription = await service.transcribeRecording(recordingId);
    const summary = await service.summarizeRecording(recordingId);
    await registry.waitFor(transcription.id);
    await registry.waitFor(summary.id);

    assert.deepEqual(calls, [
      'transcribe:/Documents/Minutes/team.webm',
      'summary:/Documents/Minutes/team.webm',
    ]);
    assert.deepInclude(registry.get(transcription.id), {
      status: 'completed',
      result: { transcriptPath: '/result.transcript.md' },
    });
    assert.deepInclude(registry.get(summary.id), {
      status: 'completed',
      result: { summaryPath: '/result.summary.md' },
    });
  });

  it('rejects unknown recording IDs without accepting arbitrary paths', async () => {
    const { service } = createService();

    await assert.isRejected(
      service.readTranscript('/tmp/arbitrary.mp3'),
      'Recording not found'
    );
  });
});
