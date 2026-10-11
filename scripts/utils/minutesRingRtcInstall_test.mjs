// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { validateMinutesRingRtcPackage } from './minutesRingRtcInstall.mjs';

const validManifest = {
  name: '@minutes/ringrtc',
  version: '2.71.0-minutes.1',
  config: {
    upstreamVersion: '2.71.0',
    tapApiVersion: 1,
  },
  scripts: { install: 'node scripts/fetch-minutes-prebuild.js' },
};

describe('validateMinutesRingRtcPackage', () => {
  it('accepts the pinned Signal 8.26 Minutes package', () => {
    assert.doesNotThrow(() => validateMinutesRingRtcPackage(validManifest));
  });

  /** @type {ReadonlyArray<readonly [string, Record<string, unknown>]>} */
  const invalidManifests = [
    ['package name', { name: '@minutes/untrusted' }],
    ['package version', { version: '2.70.2-minutes.3' }],
    [
      'upstream version',
      { config: { ...validManifest.config, upstreamVersion: '2.70.2' } },
    ],
    ['tap API', { config: { ...validManifest.config, tapApiVersion: 2 } }],
    ['install script', { scripts: { install: 'node unexpected.js' } }],
  ];

  for (const [label, override] of invalidManifests) {
    it(`rejects an unexpected ${label}`, () => {
      assert.throws(() =>
        validateMinutesRingRtcPackage({ ...validManifest, ...override })
      );
    });
  }
});
