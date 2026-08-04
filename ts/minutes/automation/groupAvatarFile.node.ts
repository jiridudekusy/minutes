// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

function isInsideDirectory(directory: string, path: string): boolean {
  const relativePath = relative(directory, path);
  return (
    relativePath.length > 0 &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

export async function readConfinedGroupAvatar(
  path: string,
  directory: string,
  maxBytes: number
): Promise<Buffer> {
  const absoluteDirectory = resolve(directory);
  const resolvedPath = resolve(path);
  if (!isInsideDirectory(absoluteDirectory, resolvedPath)) {
    throw new Error(
      `Avatar must be inside the designated avatar directory: ${absoluteDirectory}`
    );
  }

  const metadata = await lstat(resolvedPath);
  if (metadata.isSymbolicLink()) {
    throw new Error('Avatar path must not be a symbolic link');
  }
  if (!metadata.isFile()) {
    throw new Error('Avatar path is not a file');
  }
  if (metadata.size > maxBytes) {
    throw new Error(`Avatar file exceeds the ${maxBytes} byte limit`);
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
    throw new Error('Avatar path must not contain symbolic links');
  }

  const file = await open(
    canonicalPath,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  try {
    const openedMetadata = await file.stat();
    if (!openedMetadata.isFile()) {
      throw new Error('Avatar path is not a file');
    }
    if (openedMetadata.size > maxBytes) {
      throw new Error(`Avatar file exceeds the ${maxBytes} byte limit`);
    }
    return await file.readFile();
  } finally {
    await file.close();
  }
}
