// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

type AutomationCursor = Readonly<{ offset: number }>;

export type AutomationPage<T> = Readonly<{
  items: ReadonlyArray<T>;
  nextCursor?: string;
}>;

function encodeAutomationCursor(cursor: AutomationCursor): string {
  return Buffer.from(JSON.stringify({ o: cursor.offset }), 'utf8').toString(
    'base64url'
  );
}

export function decodeAutomationCursor(
  encoded: string | undefined
): AutomationCursor {
  if (encoded == null) {
    return { offset: 0 };
  }

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    );
    if (
      typeof parsed !== 'object' ||
      parsed == null ||
      !('o' in parsed) ||
      typeof parsed.o !== 'number' ||
      !Number.isSafeInteger(parsed.o) ||
      parsed.o < 0
    ) {
      throw new Error('invalid');
    }
    return { offset: parsed.o };
  } catch {
    throw new Error('Invalid automation cursor');
  }
}

export function paginateAutomationItems<T>(
  items: ReadonlyArray<T>,
  options: Readonly<{
    cursor?: string;
    limit?: number;
    maxLimit: number;
  }>
): AutomationPage<T> {
  const { offset } = decodeAutomationCursor(options.cursor);
  const requestedLimit = options.limit ?? options.maxLimit;
  const limit = Math.max(
    1,
    Math.min(
      options.maxLimit,
      Number.isSafeInteger(requestedLimit) ? requestedLimit : options.maxLimit
    )
  );
  const pageItems = items.slice(offset, offset + limit);
  const nextOffset = offset + pageItems.length;

  return {
    items: pageItems,
    nextCursor:
      nextOffset < items.length
        ? encodeAutomationCursor({ offset: nextOffset })
        : undefined,
  };
}
