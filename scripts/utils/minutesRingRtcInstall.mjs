// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export const MINUTES_RINGRTC_PACKAGE_NAME = '@minutes/ringrtc';
export const MINUTES_RINGRTC_PACKAGE_VERSION = '2.70.2-minutes.2';
export const MINUTES_RINGRTC_UPSTREAM_VERSION = '2.70.2';
export const MINUTES_RINGRTC_TAP_API_VERSION = 1;
export const MINUTES_RINGRTC_INSTALL_SCRIPT =
  'node scripts/fetch-minutes-prebuild.js';

export function validateMinutesRingRtcPackage(manifest) {
  if (
    manifest?.name !== MINUTES_RINGRTC_PACKAGE_NAME ||
    manifest.version !== MINUTES_RINGRTC_PACKAGE_VERSION ||
    manifest.config?.upstreamVersion !== MINUTES_RINGRTC_UPSTREAM_VERSION ||
    manifest.config?.tapApiVersion !== MINUTES_RINGRTC_TAP_API_VERSION ||
    manifest.scripts?.install !== MINUTES_RINGRTC_INSTALL_SCRIPT
  ) {
    throw new Error(
      `Unexpected Minutes RingRTC package: ${String(manifest?.name)}@${String(manifest?.version)}`
    );
  }
}
