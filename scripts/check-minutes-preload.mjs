// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('oxlint/package.json')), 'bin/oxlint');
const bundle = process.argv[2] ?? join(root, 'bundles/preload/main.js');
const result = spawnSync(
  process.execPath,
  [
    cli,
    '--config',
    join(root, 'scripts/minutes-bundle-check.oxlintrc.json'),
    '--disable-nested-config',
    '--no-ignore',
    '--format',
    'json',
    bundle,
  ],
  { cwd: root, encoding: 'utf8' }
);
if (result.error || result.signal || !result.stdout) {
  throw (
    result.error ??
    new Error(result.stderr || 'Preload analysis did not complete')
  );
}
const report = JSON.parse(result.stdout);
if (report.number_of_files !== 1) {
  throw new Error('Expected to analyze one preload bundle');
}
// Third-party libraries have dormant UMD/polyfill branches with undeclared globals.
// Generated module initializers, however, must always have a binding in this bundle.
const failures = report.diagnostics.filter(diagnostic => {
  if (diagnostic.code !== 'eslint(no-undef)') {
    return true;
  }
  const name = diagnostic.message.match(/^'([^']+)' is not defined\./)?.[1];
  return name == null || /^(init|require)_/.test(name);
});
if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`${failure.filename}: ${failure.message}`);
  }
  process.exitCode = 1;
} else {
  console.log('Minutes preload: all generated module initializers are defined');
}
