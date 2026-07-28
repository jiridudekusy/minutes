// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { CallMode } from '../../types/CallDisposition.std.ts';
import { createCallCaptureService } from '../../minutes/callCaptureService.std.ts';

describe('callCaptureService', () => {
  it('notifies both mutually-exclusive capture services when a call ends', async () => {
    const calls = new Array<string>();
    const service = createCallCaptureService({
      audio: {
        async onCallEnded() {
          calls.push('audio');
        },
      },
      video: {
        async onCallEnded() {
          calls.push('video');
        },
      },
    });

    await service.onCallEnded({
      conversationId: 'conversation',
      callMode: CallMode.Direct,
    });

    assert.sameMembers(calls, ['audio', 'video']);
  });
});
