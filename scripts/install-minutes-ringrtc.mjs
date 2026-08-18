// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import {
  MINUTES_RINGRTC_PACKAGE_VERSION,
  validateMinutesRingRtcPackage,
} from './utils/minutesRingRtcInstall.mjs';

const require = createRequire(import.meta.url);
const manifestPath = require.resolve('@signalapp/ringrtc/package.json');
const packageRoot = dirname(manifestPath);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

validateMinutesRingRtcPackage(manifest);

const installerPath = join(packageRoot, 'scripts', 'fetch-minutes-prebuild.js');
if (!existsSync(installerPath)) {
  throw new Error(`Missing Minutes RingRTC installer: ${installerPath}`);
}

const prebuilds = JSON.parse(
  readFileSync(join(packageRoot, 'prebuilds.json'), 'utf8')
);
const {
  selectPrebuild,
  sha256,
} = require('@signalapp/ringrtc/scripts/fetch-minutes-prebuild.js');
const selected = selectPrebuild(prebuilds, manifest, process);
const destination = join(packageRoot, selected.destination);

const isVerified =
  existsSync(destination) && (await sha256(destination)) === selected.sha256;

if (isVerified) {
  console.info(
    `[minutes] RingRTC ${MINUTES_RINGRTC_PACKAGE_VERSION} prebuild is verified`
  );
} else {
  console.info(
    `[minutes] installing RingRTC ${MINUTES_RINGRTC_PACKAGE_VERSION} prebuild`
  );
  execFileSync(process.execPath, [installerPath], {
    cwd: packageRoot,
    stdio: 'inherit',
  });
}
