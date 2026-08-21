// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import {
  chmod,
  copyFile,
  mkdir,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';

import artifactsManifest from '../../config/minutes_ffmpeg_artifacts.json' with { type: 'json' };

import { downloadHttpsFile } from './httpsDownload.main.ts';
import type {
  VideoMp4SupportProgress,
  VideoMp4SupportPublic,
} from './videoMp4Support.std.ts';

const execFileAsync = promisify(execFile);
const MAX_COMMAND_OUTPUT_BYTES = 32 * 1024 * 1024;

type Artifact =
  (typeof artifactsManifest.targets)[keyof typeof artifactsManifest.targets];

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function run(
  path: string,
  args: ReadonlyArray<string>,
  env?: NodeJS.ProcessEnv
): Promise<string> {
  const { stdout, stderr } = await execFileAsync(path, [...args], {
    encoding: 'utf8',
    maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
    windowsHide: true,
    env: env ? { ...process.env, ...env } : process.env,
  });
  return `${stdout}\n${stderr}`;
}

async function verifyFfmpeg(
  path: string,
  options: Readonly<{ rejectNonfree: boolean; expectedVersion?: string }>
): Promise<{ path: string; version: string } | null> {
  try {
    const canonicalPath = await realpath(path);
    const versionOutput = await run(canonicalPath, ['-version']);
    if (
      options.expectedVersion &&
      !versionOutput.includes(options.expectedVersion)
    ) {
      return null;
    }
    const encoders = await run(canonicalPath, ['-hide_banner', '-encoders']);
    if (
      !/\blibx264\b/.test(encoders) ||
      !/^\s*[A-Z.]{6}\s+aac\s/m.test(encoders)
    ) {
      return null;
    }
    if (options.rejectNonfree) {
      const license = await run(canonicalPath, ['-L']);
      if (
        /--enable-nonfree|not legally redistributable|nonfree parts/i.test(
          license
        )
      ) {
        return null;
      }
    }
    const version = versionOutput.split('\n')[0]?.trim() ?? 'FFmpeg';
    return { path: canonicalPath, version };
  } catch {
    return null;
  }
}

function getSystemCandidates(binaryName: string): ReadonlyArray<string> {
  const fromPath = (process.env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map(directory => join(directory, binaryName));
  let known: ReadonlyArray<string> = [];
  if (process.platform === 'darwin') {
    known = [
      '/opt/homebrew/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/opt/local/bin/ffmpeg',
    ];
  } else if (process.platform === 'linux') {
    known = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/snap/bin/ffmpeg'];
  }
  return [...new Set([...fromPath, ...known])];
}

async function findFile(
  directory: string,
  name: string
): Promise<string | null> {
  const directories: Array<string> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      directories.push(path);
    } else if (entry.name === name) {
      return path;
    }
  }
  const nested = await Promise.all(
    directories.map(path => findFile(path, name))
  );
  return nested.find(path => path != null) ?? null;
}

export function buildWindowsExpandArchiveArgs(): ReadonlyArray<string> {
  return [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath $env:MINUTES_MP4_ARCHIVE_PATH -DestinationPath $env:MINUTES_MP4_DESTINATION_PATH -Force",
  ];
}

export async function extractFfmpegArchive(
  archiveType: Artifact['archiveType'],
  archivePath: string,
  destination: string
): Promise<void> {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  if (archiveType === 'tar.xz') {
    await run('tar', ['-xJf', archivePath, '-C', destination]);
    return;
  }
  if (process.platform === 'win32') {
    await run('powershell.exe', buildWindowsExpandArchiveArgs(), {
      MINUTES_MP4_ARCHIVE_PATH: archivePath,
      MINUTES_MP4_DESTINATION_PATH: destination,
    });
    return;
  }
  await run('ditto', ['-x', '-k', archivePath, destination]);
}

export class VideoMp4Support {
  readonly #toolsDir: string;
  readonly #targetKey = `${process.platform}-${process.arch}`;
  readonly #artifact: Artifact | undefined;
  #resolved: {
    path: string;
    version: string;
    source: 'system' | 'downloaded';
  } | null = null;
  #installing = false;

  constructor(userDataPath: string) {
    this.#toolsDir = join(userDataPath, 'minutes', 'tools', 'ffmpeg');
    this.#artifact = artifactsManifest.targets[
      this.#targetKey as keyof typeof artifactsManifest.targets
    ] as Artifact | undefined;
  }

  #getInstalledBinaryPath(): string | null {
    return this.#artifact
      ? join(this.#toolsDir, this.#targetKey, this.#artifact.binaryName)
      : null;
  }

  async getPublic(): Promise<VideoMp4SupportPublic> {
    const resolved = await this.resolve(false);
    if (resolved) {
      return {
        source: resolved.source,
        ffmpegPath: resolved.path,
        version: resolved.version,
      };
    }
    return {
      source: 'missing',
      downloadLabel: this.#artifact?.downloadLabel,
    };
  }

  async resolve(required: boolean): Promise<{
    path: string;
    version: string;
    source: 'system' | 'downloaded';
  } | null> {
    if (this.#resolved) {
      return this.#resolved;
    }
    const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const systemCandidates = await Promise.all(
      getSystemCandidates(binaryName).map(candidate =>
        verifyFfmpeg(candidate, { rejectNonfree: false })
      )
    );
    const system = systemCandidates.find(candidate => candidate != null);
    if (system) {
      this.#resolved = { ...system, source: 'system' };
      return this.#resolved;
    }
    const installedPath = this.#getInstalledBinaryPath();
    if (installedPath && this.#artifact) {
      const installed = await verifyFfmpeg(installedPath, {
        rejectNonfree: true,
        expectedVersion: this.#artifact.expectedVersion,
      });
      if (installed) {
        this.#resolved = { ...installed, source: 'downloaded' };
        return this.#resolved;
      }
    }
    if (required) {
      throw new Error(
        'Podpora MP4 není nainstalována a kompatibilní systémový FFmpeg nebyl nalezen.'
      );
    }
    return null;
  }

  async install(
    onProgress: (
      progress: Omit<VideoMp4SupportProgress, 'recordingPath'>
    ) => void
  ): Promise<VideoMp4SupportPublic> {
    if (!this.#artifact) {
      throw new Error(`Podpora MP4 není dostupná pro ${this.#targetKey}.`);
    }
    if (this.#installing) {
      throw new Error('Instalace podpory MP4 již probíhá.');
    }
    this.#installing = true;
    const artifact = this.#artifact;
    const targetDir = join(this.#toolsDir, this.#targetKey);
    const archiveExtension =
      artifact.archiveType === 'tar.xz' ? 'tar.xz' : 'zip';
    const archivePath = join(
      this.#toolsDir,
      `${this.#targetKey}.partial.${archiveExtension}`
    );
    const extractionDir = join(this.#toolsDir, `.extract-${this.#targetKey}`);
    const binaryPath = join(targetDir, artifact.binaryName);
    const binaryPartialPath = `${binaryPath}.partial`;
    const licensePath = join(targetDir, 'COPYING.GPLv3');
    const licensePartialPath = `${licensePath}.partial`;
    try {
      await mkdir(this.#toolsDir, { recursive: true });
      await rm(archivePath, { force: true });
      await rm(extractionDir, { recursive: true, force: true });
      onProgress({ percent: 0, detail: 'Stahuji podporu MP4…' });
      await downloadHttpsFile(artifact.url, archivePath, (loaded, total) => {
        const denominator = total ?? Math.max(loaded, 1);
        onProgress({
          percent: Math.min(90, Math.round((loaded / denominator) * 90)),
          detail: 'Stahuji podporu MP4…',
        });
      });
      onProgress({ percent: 91, detail: 'Ověřuji stažený soubor…' });
      const checksum = await sha256File(archivePath);
      if (checksum !== artifact.sha256) {
        throw new Error('Kontrolní součet staženého FFmpeg nesouhlasí.');
      }
      onProgress({ percent: 94, detail: 'Rozbaluji podporu MP4…' });
      await extractFfmpegArchive(
        artifact.archiveType,
        archivePath,
        extractionDir
      );
      const extracted = await findFile(extractionDir, artifact.binaryName);
      if (!extracted) {
        throw new Error(`Archiv neobsahuje ${artifact.binaryName}.`);
      }
      await mkdir(targetDir, { recursive: true });
      await copyFile(extracted, binaryPartialPath);
      if (process.platform !== 'win32') {
        await chmod(binaryPartialPath, 0o755);
      }
      const verified = await verifyFfmpeg(binaryPartialPath, {
        rejectNonfree: true,
        expectedVersion: artifact.expectedVersion,
      });
      if (!verified) {
        throw new Error(
          'Stažený FFmpeg neprošel kontrolou licence nebo kodeků.'
        );
      }
      await downloadHttpsFile(
        artifactsManifest.license.url,
        licensePartialPath,
        () => undefined
      );
      if (
        (await sha256File(licensePartialPath)) !==
        artifactsManifest.license.sha256
      ) {
        throw new Error('Kontrolní součet licence FFmpeg nesouhlasí.');
      }
      await rm(licensePath, { force: true });
      await rename(licensePartialPath, licensePath);
      await writeFile(
        join(targetDir, 'NOTICE.txt'),
        [
          'FFmpeg downloaded by Minutes',
          `Binary archive: ${artifact.url}`,
          `Archive SHA-256: ${artifact.sha256}`,
          `Corresponding FFmpeg source: ${artifact.sourceUrl}`,
          `Build project and scripts: ${artifact.buildInfoUrl}`,
          `License: ${artifactsManifest.license.name} (see COPYING.GPLv3)`,
          '',
        ].join('\n'),
        'utf8'
      );
      await rm(binaryPath, { force: true });
      await rename(binaryPartialPath, binaryPath);
      this.#resolved = {
        path: await realpath(binaryPath),
        version: verified.version,
        source: 'downloaded',
      };
      onProgress({ percent: 100, detail: 'Podpora MP4 je připravena.' });
      return await this.getPublic();
    } finally {
      await rm(archivePath, { force: true }).catch(() => undefined);
      await rm(extractionDir, { recursive: true, force: true }).catch(
        () => undefined
      );
      await rm(binaryPartialPath, { force: true }).catch(() => undefined);
      await rm(licensePartialPath, { force: true }).catch(() => undefined);
      this.#installing = false;
    }
  }
}
