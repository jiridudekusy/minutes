// Copyright 2026 minutes contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const packageJsonPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'package.json'
);

/**
 * Signal's package.json sets build.nativeRebuilder=parallel. On macOS + pnpm,
 * Native workspace addons share node-addon-api@… and parallel
 * electron-rebuild races on .target.mk → make "missing separator".
 *
 * `electron-builder install-app-deps` does not accept `-c.nativeRebuilder=…`,
 * so we temporarily force sequential in package.json for this process only.
 */
function withSequentialNativeRebuild(run) {
  const original = readFileSync(packageJsonPath, 'utf8');
  const pkg = JSON.parse(original);
  const previous = pkg.build?.nativeRebuilder;
  let patched = false;

  try {
    if (pkg.build && previous !== 'sequential') {
      pkg.build.nativeRebuilder = 'sequential';
      writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
      patched = true;
      console.info(
        '[minutes] electron:install-app-deps using nativeRebuilder=sequential'
      );
    }
    return run();
  } finally {
    if (patched) {
      writeFileSync(packageJsonPath, original);
    }
  }
}

try {
  withSequentialNativeRebuild(() => {
    execSync('electron-builder install-app-deps', { stdio: 'inherit' });
  });
} catch (error) {
  const strict =
    process.env.CI === 'true' ||
    process.env.MINUTES_STRICT_NATIVE_BUILD === '1';

  console.warn('');
  console.warn(
    '[minutes] electron:install-app-deps failed — native addons were not rebuilt.'
  );
  if (process.platform === 'win32') {
    console.warn(
      '[minutes] The app can still run on Windows; optional modules (e.g. windows-ucv) are skipped.'
    );
    console.warn(
      '[minutes] For full native support, install Visual Studio 2022 with "Desktop development with C++".'
    );
  } else if (process.platform === 'darwin') {
    console.warn(
      '[minutes] On macOS, rebuild uses sequential mode to avoid node-addon-api makefile races.'
    );
    console.warn(
      '[minutes] Also use Python 3.12 (not Homebrew python@3.14) — see minutes-release.yml.'
    );
  } else {
    console.warn(
      '[minutes] Install build tools for native addons (python3, make, g++), then retry.'
    );
  }
  console.warn('');

  if (strict) {
    throw error;
  }
}
