// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  AutomationRendererBridge,
  type AutomationRendererResponse,
} from '../../minutes/automation/automationRendererBridge.node.ts';

describe('AutomationRendererBridge', () => {
  async function expectRejected(
    promise: Promise<unknown>,
    expectedMessage: string
  ): Promise<void> {
    let caught: unknown;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }
    assert.instanceOf(caught, Error);
    assert.include(caught.message, expectedMessage);
  }

  it('matches responses to concurrent requests', async () => {
    const sent: Array<{ id: string; method: string }> = [];
    const bridge = new AutomationRendererBridge({
      send: request => sent.push(request),
      idFactory: (() => {
        let id = 0;
        return () => `request-${(id += 1)}`;
      })(),
      timeoutMs: 100,
    });

    const first = bridge.request('listConversations', {});
    const second = bridge.request('getGroup', { groupId: 'group-1' });
    bridge.handleResponse({
      id: 'request-2',
      ok: true,
      result: { id: 'group-1', title: 'Team' },
    });
    bridge.handleResponse({
      id: 'request-1',
      ok: true,
      result: { items: [] },
    });

    assert.deepEqual(await first, { items: [] });
    assert.deepEqual(await second, { id: 'group-1', title: 'Team' });
    assert.deepEqual(
      sent.map(item => item.method),
      ['listConversations', 'getGroup']
    );
  });

  it('returns structured renderer failures and times out missing responses', async () => {
    const bridge = new AutomationRendererBridge({
      send: () => undefined,
      idFactory: () => 'request-1',
      timeoutMs: 5,
    });
    const failed = bridge.request('sendMessage', {
      conversationId: 'missing',
      text: 'hello',
    });
    bridge.handleResponse({
      id: 'request-1',
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Conversation not found' },
    });
    await expectRejected(failed, 'Conversation not found');

    const timedOut = bridge.request('getActiveCall', {});
    await expectRejected(timedOut, 'Renderer request timed out');
  });

  it('rejects pending requests when the renderer reloads', async () => {
    const bridge = new AutomationRendererBridge({
      send: () => undefined,
      timeoutMs: 100,
    });
    const request = bridge.request('getActiveCall', {});

    bridge.rendererUnavailable();

    await expectRejected(request, 'Renderer unavailable');
  });

  it('ignores malformed and unknown responses', () => {
    const bridge = new AutomationRendererBridge({
      send: () => undefined,
      timeoutMs: 100,
    });

    assert.isFalse(bridge.handleResponse(null as never));
    assert.isFalse(
      bridge.handleResponse({
        id: 'unknown',
        ok: true,
        result: null,
      } satisfies AutomationRendererResponse)
    );
  });
});
