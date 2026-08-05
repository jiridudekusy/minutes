// minutes electron-builder profile — merges with package.json#build (keeps files/bundles).
import pkg from './package.json' with { type: 'json' };

const isBeta = process.env.MINUTES_RELEASE_CHANNEL === 'beta';

/** @type {import('electron-builder').Configuration} */
export default {
  ...pkg.build,
  productName: isBeta ? 'Minutes Beta' : 'Minutes',
  appId: isBeta ? 'org.minutes.desktop.beta' : 'org.minutes.desktop',
  directories: {
    ...pkg.build.directories,
    output: 'release/minutes',
  },
  // Signal's afterPack flips Electron fuses (rewriting the binary); the
  // unsigned Minutes build must re-sign ad-hoc afterwards or macOS kills the
  // app on launch ("Code Signature Invalid"). See scripts/minutes-after-pack.mjs.
  afterPack: 'scripts/minutes-after-pack.mjs',
  win: {
    ...pkg.build.win,
    icon: 'build/icons/minutes/win/icon.ico',
    artifactName: isBeta
      ? 'Minutes-Beta-setup-${version}.${ext}'
      : 'Minutes-setup-${version}.${ext}',
    publish: null,
    signtoolOptions: {},
    asarUnpack: ['build/icons/minutes/win/icon.ico'],
  },
  nsis: {
    ...pkg.build.nsis,
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: 'build/icons/minutes/win/icon.ico',
    uninstallerIcon: 'build/icons/minutes/win/icon.ico',
    shortcutName: isBeta ? 'Minutes Beta' : 'Minutes',
    deleteAppDataOnUninstall: false,
  },
  linux: {
    ...pkg.build.linux,
    target: [{ target: 'AppImage', arch: ['x64'] }],
    executableName: isBeta ? 'minutes-beta' : 'minutes',
    icon: 'build/icons/minutes/png',
    artifactName: isBeta
      ? 'Minutes-Beta-${version}-linux-${arch}.${ext}'
      : 'Minutes-${version}-linux-${arch}.${ext}',
    publish: null,
    desktop: {
      ...pkg.build.linux.desktop,
      entry: {
        ...pkg.build.linux.desktop.entry,
        StartupWMClass: isBeta ? 'minutes-beta' : 'minutes',
      },
    },
  },
  mac: {
    ...pkg.build.mac,
    target: [{ target: 'dmg', arch: ['arm64'] }],
    icon: 'build/icons/minutes/mac/icon.icns',
    artifactName: 'Minutes-${version}-mac-${arch}.${ext}',
    publish: null,
    // Minutes has no Apple Developer ID — build unsigned (ad-hoc), like the Windows build.
    // electron-builder skips its signing step with identity:null; the ad-hoc
    // signature is applied in the afterPack hook instead.
    identity: null,
    // Hardened runtime only matters with notarization (which needs a Developer
    // ID). Without it, it merely restricts capabilities, so disable it for the
    // ad-hoc build — TCC still gates mic/screen via the Info.plist usage strings.
    hardenedRuntime: false,
    // Drop Signal's release-only signing hooks and update feed metadata.
    sign: undefined,
    signInstaller: undefined,
    releaseInfo: undefined,
    // Universal-build knobs; Minutes ships arm64-only.
    mergeASARs: undefined,
    singleArchFiles: undefined,
    extendInfo: {
      ...pkg.build.mac.extendInfo,
      NSMicrophoneUsageDescription:
        'Minutes potřebuje mikrofon pro nahrávání hovorů.',
      // macOS 14.4+ audio-capture TCC; system audio uses Screen Recording TCC (no key needed).
      NSAudioCaptureUsageDescription:
        'Minutes potřebuje zachytávat zvuk systému pro nahrávání hovorů.',
    },
  },
  dmg: {
    ...pkg.build.dmg,
    title: 'Minutes ${version}',
    // Drop Signal-branded artwork; use electron-builder defaults.
    background: null,
    icon: null,
    sign: false,
  },
  extraMetadata: {
    environment: 'production',
    minutesChannel: isBeta ? 'beta' : 'prod',
  },
};
