// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

for (const [name, source, status] of [
  ['valid initializer', 'function init_real$1() {} init_real$1();', 0],
  ['missing initializer', 'init_missing$1();', 1],
  ['missing require wrapper', 'require_missing();', 1],
]) {
  void test(name, () => {
    const directory = mkdtempSync(join(tmpdir(), 'minutes-preload-check-'));
    try {
      const path = join(directory, 'bundle.js');
      writeFileSync(path, source);
      const result = spawnSync(
        process.execPath,
        ['scripts/check-minutes-preload.mjs', path],
        { encoding: 'utf8' }
      );
      assert.equal(result.status, status, result.stderr);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
