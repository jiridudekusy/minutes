// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import {
  basename,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';

const CONTENT_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.aac': 'audio/aac',
  '.csv': 'text/csv',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.m4a': 'audio/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.txt': 'text/plain',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
};

function isInsideDirectory(directory: string, path: string): boolean {
  const relativePath = relative(directory, path);
  return (
    relativePath.length > 0 &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

export function inferAttachmentContentType(
  path: string,
  explicit?: string
): string {
  return (
    explicit ??
    CONTENT_TYPES_BY_EXTENSION[extname(path).toLocaleLowerCase()] ??
    'application/octet-stream'
  );
}

export async function readConfinedAttachmentFile(
  path: string,
  directory: string,
  maxBytes: number
): Promise<Buffer<ArrayBuffer>> {
  const absoluteDirectory = resolve(directory);
  const resolvedPath = resolve(path);
  if (!isInsideDirectory(absoluteDirectory, resolvedPath)) {
    throw new Error(
      `File must be inside the designated outgoing attachment directory: ${absoluteDirectory}`
    );
  }

  const metadata = await lstat(resolvedPath);
  if (metadata.isSymbolicLink()) {
    throw new Error('Attachment path must not be a symbolic link');
  }
  if (!metadata.isFile()) {
    throw new Error('Attachment path is not a file');
  }
  if (metadata.size > maxBytes) {
    throw new Error(`Attachment file exceeds the ${maxBytes} byte limit`);
  }

  const resolvedDirectory = await realpath(absoluteDirectory);
  const canonicalPath = await realpath(resolvedPath);
  const expectedCanonicalPath = resolve(
    resolvedDirectory,
    relative(absoluteDirectory, resolvedPath)
  );
  if (
    canonicalPath !== expectedCanonicalPath ||
    !isInsideDirectory(resolvedDirectory, canonicalPath)
  ) {
    throw new Error('Attachment path must not contain symbolic links');
  }

  const file = await open(
    canonicalPath,
    // oxlint-disable-next-line no-bitwise
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  try {
    const openedMetadata = await file.stat();
    if (!openedMetadata.isFile()) {
      throw new Error('Attachment path is not a file');
    }
    if (openedMetadata.size > maxBytes) {
      throw new Error(`Attachment file exceeds the ${maxBytes} byte limit`);
    }
    return await file.readFile();
  } finally {
    await file.close();
  }
}

export async function writeConfinedAttachmentFile(options: {
  data: Uint8Array<ArrayBuffer>;
  directory: string;
  fileName: string;
}): Promise<string> {
  const { data, directory, fileName } = options;
  const absoluteDirectory = resolve(directory);
  await mkdir(absoluteDirectory, { recursive: true, mode: 0o700 });
  const directoryMetadata = await lstat(absoluteDirectory);
  if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory()) {
    throw new Error(
      'Attachment download directory must be a regular directory'
    );
  }
  const canonicalDirectory = await realpath(absoluteDirectory);

  const rawName = basename(fileName).replace(/[\u0000-\u001f\u007f]/g, '_');
  const safeName =
    rawName === '' || rawName === '.' || rawName === '..'
      ? 'attachment'
      : rawName;
  const extension = extname(safeName);
  const stem =
    extension.length > 0 ? safeName.slice(0, -extension.length) : safeName;

  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const candidateName =
      suffix === 0 ? safeName : `${stem}-${suffix}${extension}`;
    const canonicalPath = join(canonicalDirectory, candidateName);
    let file;
    try {
      // Candidate allocation must be serial so EEXIST advances the suffix.
      // oxlint-disable-next-line no-await-in-loop
      file = await open(
        canonicalPath,
        // oxlint-disable-next-line no-bitwise
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600
      );
    } catch (error) {
      if (
        error != null &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'EEXIST'
      ) {
        continue;
      }
      throw error;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop
      await file.writeFile(data);
    } finally {
      // oxlint-disable-next-line no-await-in-loop
      await file.close();
    }
    return join(absoluteDirectory, candidateName);
  }
  throw new Error('Could not allocate a unique attachment filename');
}
