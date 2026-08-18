// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  MINUTES_RINGRTC_INSTALL_SCRIPT,
  MINUTES_RINGRTC_PACKAGE_NAME,
  MINUTES_RINGRTC_PACKAGE_VERSION,
  MINUTES_RINGRTC_TAP_API_VERSION,
  MINUTES_RINGRTC_UPSTREAM_VERSION,
  validateMinutesRingRtcPackage,
} from './minutesRingRtcInstall.mjs';

const validManifest = {
  name: MINUTES_RINGRTC_PACKAGE_NAME,
  version: MINUTES_RINGRTC_PACKAGE_VERSION,
  config: {
    upstreamVersion: MINUTES_RINGRTC_UPSTREAM_VERSION,
    tapApiVersion: MINUTES_RINGRTC_TAP_API_VERSION,
  },
  scripts: { install: MINUTES_RINGRTC_INSTALL_SCRIPT },
};

describe('validateMinutesRingRtcPackage', () => {
  it('accepts the pinned Signal 8.23 Minutes package', () => {
    assert.doesNotThrow(() => validateMinutesRingRtcPackage(validManifest));
  });

  /** @type {ReadonlyArray<readonly [string, Record<string, unknown>]>} */
  const invalidManifests = [
    ['package name', { name: '@minutes/untrusted' }],
    ['package version', { version: '2.70.2-minutes.3' }],
    [
      'upstream version',
      { config: { ...validManifest.config, upstreamVersion: '2.71.0' } },
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
