// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  getPrivateRecordingPcmPath,
  resolveRecordingPcmPath,
} from '../../minutes/recordingPcmStorage.node.ts';

describe('recording PCM storage', () => {
  it('keeps PCM outside the user-visible recordings directory', () => {
    assert.strictEqual(
      getPrivateRecordingPcmPath(
        '/Users/alice/Library/Application Support/Signal',
        '/Users/alice/Documents/Minutes/meeting.webm'
      ),
      '/Users/alice/Library/Application Support/Signal/minutes/recording-pcm/meeting.pcm.f32'
    );
  });

  it('prefers private PCM but still reads legacy adjacent sidecars', async () => {
    const privatePath = '/private/meeting.pcm.f32';
    const legacyPath = '/recordings/meeting.pcm.f32';
    const seen = new Array<string>();

    assert.strictEqual(
      await resolveRecordingPcmPath({
        privatePath,
        legacyPath,
        exists: async path => {
          seen.push(path);
          return path === legacyPath;
        },
      }),
      legacyPath
    );
    assert.deepEqual(seen, [privatePath, legacyPath]);
  });
});
