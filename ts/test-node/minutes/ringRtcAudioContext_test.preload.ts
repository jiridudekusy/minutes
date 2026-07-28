// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { configureRingRtcRecordingAudioContext } from '../../minutes/ringRtcAudioTrack.preload.ts';

describe('RingRtc recording AudioContext', () => {
  it('uses a silent sink so output device changes do not stop its clock', async () => {
    let selectedSink: unknown;
    const context = {
      async setSinkId(sinkId: unknown): Promise<void> {
        selectedSink = sinkId;
      },
    } as unknown as AudioContext;

    await configureRingRtcRecordingAudioContext(context);

    assert.deepEqual(selectedSink, { type: 'none' });
  });
});
