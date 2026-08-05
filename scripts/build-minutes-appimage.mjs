// Build an unsigned Linux x64 AppImage for local testing and release assets.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(label, command, env = {}) {
  console.log(`\n=== ${label} ===\n`);
  execSync(command, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: true,
  });
}

if (process.platform !== 'linux') {
  console.error('AppImage builds must run on Linux.');
  process.exit(1);
}

console.log('Minutes Linux x64 AppImage build');
console.log('This can take 15–30 minutes on the first run.\n');

if (process.env.MINUTES_SKIP_ICONS !== '1') {
  run('Icons', 'pnpm run build:minutes-icons');
} else {
  console.log('Skipping icons (MINUTES_SKIP_ICONS=1)\n');
}
if (process.env.MINUTES_SKIP_GENERATE !== '1') {
  run('Generate assets (locales, emoji, schema, …)', 'pnpm run generate');
} else {
  console.log('Skipping generate (MINUTES_SKIP_GENERATE=1)\n');
}

const mainBundle = join(root, 'bundles', 'main.js');
if (!existsSync(mainBundle)) {
  console.error(`\nMissing ${mainBundle} — run pnpm run generate first.\n`);
  process.exit(1);
}

run(
  'AppImage (unsigned)',
  [
    'npx electron-builder',
    '--linux AppImage',
    '--x64',
    '--publish never',
    '--config electron-builder.minutes.mjs',
  ].join(' '),
  {
    NODE_OPTIONS: '--import=tsx',
    SIGNAL_ENV: 'production',
    NODE_CONFIG_ENV: 'minutes',
    MINUTES_RELEASE_CHANNEL: process.env.MINUTES_RELEASE_CHANNEL ?? 'prod',
  }
);

const outputDir = join(root, 'release', 'minutes');
const artifacts = readdirSync(outputDir).filter(name =>
  name.endsWith('.AppImage')
);

console.log('\n=== Done ===\n');
if (artifacts.length > 0) {
  for (const name of artifacts) {
    console.log(`  ${join(outputDir, name)}`);
  }
} else {
  console.log(`  Check output in: ${outputDir}`);
}
