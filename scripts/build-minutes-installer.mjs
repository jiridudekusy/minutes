// Build a minutes installer (unsigned, for ad-hoc distribution):
// Windows NSIS on win32, macOS DMG (arm64) on darwin.
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isMac = process.platform === 'darwin';

function run(label, command, env = {}) {
  console.log(`\n=== ${label} ===\n`);
  execSync(command, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: true,
  });
}

console.log(`minutes ${isMac ? 'macOS' : 'Windows'} installer build`);
console.log('This can take 15–30 minutes on first run.\n');

if (process.env.MINUTES_SKIP_VERSION_BUMP !== '1') {
  run('Release version bump', 'pnpm run bump:minutes:release');
  const version = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8')
  ).version;
  run(
    'Prepare CHANGELOG',
    `node scripts/prepare-changelog-release.mjs ${version}`
  );
} else {
  console.log('Skipping version bump (MINUTES_SKIP_VERSION_BUMP=1)\n');
}

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
if (process.env.MINUTES_SKIP_BUNDLES !== '1') {
  run('JavaScript bundles', 'pnpm run build:rolldown:prod');
  run('Styles', 'pnpm run build:styles:prod');
} else {
  console.log('Skipping bundles (MINUTES_SKIP_BUNDLES=1)\n');
}

const mainBundle = join(root, 'bundles', 'main.js');
if (!existsSync(mainBundle)) {
  console.error(`\nMissing ${mainBundle} — run build:rolldown:prod first.\n`);
  process.exit(1);
}

run('Check preload module initializers', 'pnpm run check:minutes:preload');

run(
  isMac ? 'DMG (unsigned)' : 'NSIS installer (unsigned)',
  [
    'npx electron-builder',
    isMac ? '--mac dmg' : '--win nsis',
    isMac ? '--arm64' : '--x64',
    '--publish never',
    '--config electron-builder.minutes.mjs',
  ].join(' '),
  {
    NODE_OPTIONS: '--import=tsx',
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    SIGNAL_ENV: 'production',
    NODE_CONFIG_ENV: process.env.NODE_CONFIG_ENV ?? 'minutes',
    MINUTES_RELEASE_CHANNEL: process.env.MINUTES_RELEASE_CHANNEL ?? 'prod',
  }
);

const outputDir = join(root, 'release', 'minutes');
const installerExt = isMac ? '.dmg' : '.exe';
const installers = readdirSync(outputDir).filter(name =>
  name.endsWith(installerExt)
);

console.log('\n=== Done ===\n');
if (installers.length > 0) {
  for (const name of installers) {
    console.log(`  ${join(outputDir, name)}`);
  }
} else {
  console.log(`  Check output in: ${outputDir}`);
}

if (isMac) {
  const appName =
    process.env.MINUTES_RELEASE_CHANNEL === 'beta' ? 'Minutes Beta' : 'Minutes';
  console.log(`
Notes:
  • App is NOT code-signed/notarized — Gatekeeper blocks a normal double-click.
  • First launch: right-click ${appName}.app → Open, or run:
      xattr -dr com.apple.quarantine "/Applications/${appName}.app"
  • User data stays in ~/Library/Application Support/${appName.replace(' ', '-')}.
`);
} else {
  console.log(`
Notes:
  • Installer is NOT code-signed — Windows SmartScreen may warn on first run.
  • Recipient can click "More info" → "Run anyway".
  • Prod data: %APPDATA%\\Minutes — beta: %APPDATA%\\Minutes-Beta (parallel install).
`);
}
