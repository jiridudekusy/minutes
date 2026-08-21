// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { access, realpath, rename, rm, stat } from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
} from 'node:path';

import type {
  VideoMp4ExportProgress,
  VideoMp4ExportResult,
} from './videoMp4Export.std.ts';

export function getMp4ExportPath(recordingPath: string): string {
  return join(
    dirname(recordingPath),
    `${basename(recordingPath, extname(recordingPath))}.mp4`
  );
}

export function parseFfmpegProgress(
  output: string,
  durationMs: number
): number | undefined {
  const matches = [...output.matchAll(/^out_time_us=(\d+)$/gm)];
  const value = Number(matches.at(-1)?.[1]);
  if (!Number.isFinite(value) || durationMs <= 0) {
    return undefined;
  }
  return Math.min(99, Math.max(0, Math.round(value / (durationMs * 10))));
}

export function buildFfmpegMp4Args(
  sourcePath: string,
  partialPath: string
): ReadonlyArray<string> {
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-i',
    sourcePath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    '-f',
    'mp4',
    partialPath,
  ];
}

async function replaceAtomically(
  partialPath: string,
  outputPath: string
): Promise<void> {
  const backupPath = `${outputPath}.backup`;
  await rm(backupPath, { force: true });
  let hadExistingOutput = false;
  try {
    await rename(outputPath, backupPath);
    hadExistingOutput = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  try {
    await rename(partialPath, outputPath);
    await rm(backupPath, { force: true });
  } catch (error) {
    if (hadExistingOutput) {
      await rename(backupPath, outputPath).catch(() => undefined);
    }
    throw error;
  }
}

export class VideoMp4Exporter {
  readonly #recordingsDir: string;
  readonly #resolveFfmpegPath: () => Promise<string>;
  #active:
    | {
        recordingPath: string;
        child: ChildProcessWithoutNullStreams;
        cancelled: boolean;
      }
    | undefined;

  constructor(
    options: Readonly<{
      recordingsDir: string;
      resolveFfmpegPath: () => Promise<string>;
    }>
  ) {
    this.#recordingsDir = options.recordingsDir;
    this.#resolveFfmpegPath = options.resolveFfmpegPath;
  }

  async export(
    options: Readonly<{ recordingPath: string; durationMs: number }>,
    onProgress: (progress: VideoMp4ExportProgress) => void
  ): Promise<VideoMp4ExportResult> {
    if (this.#active) {
      throw new Error('Jiný převod videa již probíhá.');
    }

    const recordingsRoot = await realpath(this.#recordingsDir);
    const sourcePath = await realpath(options.recordingPath);
    const relativeSource = relative(recordingsRoot, sourcePath);
    if (
      relativeSource === '' ||
      relativeSource.startsWith('..') ||
      isAbsolute(relativeSource) ||
      extname(sourcePath).toLowerCase() !== '.webm'
    ) {
      throw new Error('Lze převádět pouze WebM nahrávky z adresáře Minutes.');
    }
    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile()) {
      throw new Error('Zdrojová nahrávka není soubor.');
    }
    const ffmpegPath = await this.#resolveFfmpegPath();
    await access(ffmpegPath);

    const outputPath = getMp4ExportPath(sourcePath);
    const partialPath = `${outputPath}.partial`;
    await rm(partialPath, { force: true });

    const child = spawn(
      ffmpegPath,
      buildFfmpegMp4Args(sourcePath, partialPath),
      {
        shell: false,
        windowsHide: true,
      }
    );
    this.#active = { recordingPath: sourcePath, child, cancelled: false };
    const active = this.#active;
    let progressBuffer = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      progressBuffer = `${progressBuffer}${chunk}`.slice(-16_384);
      const percent = parseFfmpegProgress(progressBuffer, options.durationMs);
      if (percent != null) {
        onProgress({ recordingPath: sourcePath, percent });
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-8_192);
    });

    try {
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      });
      if (active.cancelled) {
        throw new Error('Převod videa byl zrušen.');
      }
      if (exitCode !== 0) {
        throw new Error(
          `FFmpeg skončil s kódem ${String(exitCode)}: ${stderr.trim()}`
        );
      }
      await replaceAtomically(partialPath, outputPath);
      onProgress({ recordingPath: sourcePath, percent: 100 });
      return { outputPath };
    } finally {
      await rm(partialPath, { force: true }).catch(() => undefined);
      if (this.#active === active) {
        this.#active = undefined;
      }
    }
  }

  async cancel(recordingPath: string): Promise<boolean> {
    if (!this.#active) {
      return false;
    }
    const requestedPath = await realpath(recordingPath).catch(
      () => recordingPath
    );
    if (requestedPath !== this.#active.recordingPath) {
      return false;
    }
    return this.cancelActive();
  }

  cancelActive(): boolean {
    if (!this.#active) {
      return false;
    }
    this.#active.cancelled = true;
    return this.#active.child.kill();
  }
}
