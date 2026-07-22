// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { CallMode } from '../../types/CallDisposition.std.ts';
import { getVisibleRecordingActions } from '../../minutes/callRecordingControls.std.ts';

describe('getVisibleRecordingActions', () => {
  it('offers separate audio and video actions while idle', () => {
    assert.deepEqual(
      getVisibleRecordingActions(
        { status: 'idle' },
        { status: 'idle' },
        'conversation-a'
      ),
      ['start-audio', 'start-video']
    );
  });

  it('shows only audio pause and stop for this call while audio records', () => {
    assert.deepEqual(
      getVisibleRecordingActions(
        {
          status: 'recording',
          conversationId: 'conversation-a',
          conversationTitle: 'A',
          callMode: CallMode.Direct,
          startedAt: 1,
        },
        { status: 'idle' },
        'conversation-a'
      ),
      ['pause-audio', 'stop-audio']
    );
  });

  it('shows only audio resume and stop for this call while audio is paused', () => {
    assert.deepEqual(
      getVisibleRecordingActions(
        {
          status: 'paused',
          conversationId: 'conversation-a',
          conversationTitle: 'A',
          callMode: CallMode.Direct,
          startedAt: 1,
          pausedAt: 2,
        },
        { status: 'idle' },
        'conversation-a'
      ),
      ['resume-audio', 'stop-audio']
    );
  });

  it('shows only video pause and stop for this call while video records', () => {
    assert.deepEqual(
      getVisibleRecordingActions(
        { status: 'idle' },
        {
          status: 'recording',
          conversationId: 'conversation-a',
          conversationTitle: 'A',
          callMode: 'Direct',
          startedAt: 1,
          codec: 'video/webm;codecs=vp9,opus',
        },
        'conversation-a'
      ),
      ['pause-video', 'stop-video']
    );
  });

  it('shows only video resume and stop for this call while video is paused', () => {
    assert.deepEqual(
      getVisibleRecordingActions(
        { status: 'idle' },
        {
          status: 'paused',
          conversationId: 'conversation-a',
          conversationTitle: 'A',
          callMode: 'Direct',
          startedAt: 1,
          pausedAt: 2,
          codec: 'video/webm;codecs=vp9,opus',
        },
        'conversation-a'
      ),
      ['resume-video', 'stop-video']
    );
  });

  it('shows nothing on another call while audio is active', () => {
    assert.deepEqual(
      getVisibleRecordingActions(
        {
          status: 'recording',
          conversationId: 'conversation-a',
          conversationTitle: 'A',
          callMode: CallMode.Direct,
          startedAt: 1,
        },
        { status: 'idle' },
        'conversation-b'
      ),
      []
    );
  });

  it('shows nothing on another call while video is active', () => {
    assert.deepEqual(
      getVisibleRecordingActions(
        { status: 'idle' },
        {
          status: 'recording',
          conversationId: 'conversation-a',
          conversationTitle: 'A',
          callMode: 'Direct',
          startedAt: 1,
          codec: 'video/webm;codecs=vp9,opus',
        },
        'conversation-b'
      ),
      []
    );
  });

  it('does not offer either start action while video is starting or finalizing', () => {
    assert.deepEqual(
      getVisibleRecordingActions(
        { status: 'idle' },
        { status: 'starting' },
        'conversation-a'
      ),
      []
    );
    assert.deepEqual(
      getVisibleRecordingActions(
        { status: 'idle' },
        { status: 'finalizing' },
        'conversation-a'
      ),
      []
    );
  });
});
