// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  generateAutomationToken,
  hashAutomationToken,
  verifyAutomationToken,
} from '../../minutes/automation/auth.node.ts';
import {
  decodeAutomationCursor,
  paginateAutomationItems,
} from '../../minutes/automation/pagination.std.ts';
import { AutomationJobRegistry } from '../../minutes/automation/jobRegistry.std.ts';

describe('Minutes automation foundation', () => {
  describe('bearer tokens', () => {
    it('generates a 256-bit URL-safe token and stores only its hash', () => {
      const token = generateAutomationToken();
      const hash = hashAutomationToken(token);

      assert.match(token, /^[A-Za-z0-9_-]{43}$/);
      assert.match(hash, /^[a-f0-9]{64}$/);
      assert.notInclude(hash, token);
      assert.isTrue(verifyAutomationToken(token, hash));
      assert.isFalse(verifyAutomationToken(`${token}x`, hash));
      assert.isFalse(verifyAutomationToken(token, 'not-a-hash'));
    });
  });

  describe('cursor pagination', () => {
    it('returns opaque continuation cursors and enforces the maximum page size', () => {
      const first = paginateAutomationItems(['a', 'b', 'c', 'd'], {
        limit: 99,
        maxLimit: 2,
      });

      assert.deepEqual(first.items, ['a', 'b']);
      assert.isString(first.nextCursor);
      assert.notInclude(first.nextCursor ?? '', '2');
      assert.deepEqual(decodeAutomationCursor(first.nextCursor), { offset: 2 });

      const second = paginateAutomationItems(['a', 'b', 'c', 'd'], {
        cursor: first.nextCursor,
        limit: 2,
        maxLimit: 2,
      });
      assert.deepEqual(second.items, ['c', 'd']);
      assert.isUndefined(second.nextCursor);
    });

    it('rejects malformed cursors', () => {
      assert.throws(
        () =>
          paginateAutomationItems(['a'], {
            cursor: 'malformed',
            limit: 1,
            maxLimit: 10,
          }),
        'Invalid automation cursor'
      );
    });
  });

  describe('job registry', () => {
    it('runs jobs with bounded concurrency and exposes progress and results', async () => {
      const registry = new AutomationJobRegistry({ maxConcurrent: 1 });
      let releaseFirst: (() => void) | undefined;
      const firstGate = new Promise<void>(resolve => {
        releaseFirst = resolve;
      });

      const first = registry.enqueue('transcription', async context => {
        context.reportProgress(25, 'Transcribing');
        await firstGate;
        return { transcriptId: 'transcript-1' };
      });
      const second = registry.enqueue('summary', async () => {
        return { summaryId: 'summary-1' };
      });

      await Promise.resolve();
      assert.strictEqual(registry.get(first.id)?.status, 'running');
      assert.strictEqual(registry.get(first.id)?.progress, 25);
      assert.strictEqual(registry.get(second.id)?.status, 'queued');

      assert.isDefined(releaseFirst);
      releaseFirst();
      await registry.waitFor(first.id);
      await registry.waitFor(second.id);

      assert.deepInclude(registry.get(first.id), {
        status: 'completed',
        result: { transcriptId: 'transcript-1' },
      });
      assert.deepInclude(registry.get(second.id), {
        status: 'completed',
        result: { summaryId: 'summary-1' },
      });
    });

    it('records sanitized failures without rejecting the scheduler', async () => {
      const registry = new AutomationJobRegistry({ maxConcurrent: 1 });
      const job = registry.enqueue('summary', async () => {
        throw new Error('provider failed');
      });

      await registry.waitFor(job.id);

      assert.deepInclude(registry.get(job.id), {
        status: 'failed',
        error: 'provider failed',
      });
    });
  });
});
