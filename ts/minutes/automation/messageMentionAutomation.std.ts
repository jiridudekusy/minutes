// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as z from 'zod';
import type {
  DraftBodyRangeMention,
  DraftBodyRanges,
} from '../../types/BodyRange.std.ts';
import type { AciString } from '../../types/ServiceId.std.ts';

export const automationMentionsSchema = z
  .array(
    z.object({
      contactId: z.string().min(1),
      start: z.number().int().nonnegative(),
      length: z.number().int().positive(),
    })
  )
  .max(100);

export type AutomationMention = z.infer<
  typeof automationMentionsSchema
>[number];

function invalidMention(message: string): never {
  throw Object.assign(new Error(message), { code: 'INVALID_ARGUMENT' });
}

export function prepareAutomationMentions(
  text: string | undefined,
  mentions: unknown,
  resolveContact: (
    id: string
  ) => Readonly<{ aci: AciString; name: string }> | null,
  memberAcis: ReadonlySet<string> | undefined
): Readonly<{
  body: string | undefined;
  bodyRanges: DraftBodyRanges | undefined;
}> {
  const parsed = automationMentionsSchema.safeParse(
    mentions === undefined ? [] : mentions
  );
  if (!parsed.success) {
    return invalidMention(
      'mentions must be an array of at most 100 contactId/start/length ranges'
    );
  }
  if (parsed.data.length === 0) {
    return { body: text, bodyRanges: undefined };
  }
  if (text == null || memberAcis == null) {
    return invalidMention('Mentions require text and a Group V2 conversation');
  }

  const ranges = parsed.data.toSorted((a, b) => a.start - b.start);
  const bodyRanges: Array<DraftBodyRangeMention> = [];
  let body = '';
  let previousEnd = 0;
  for (const range of ranges) {
    const end = range.start + range.length;
    if (range.start < previousEnd || end > text.length) {
      return invalidMention(
        'Mention ranges must not overlap or extend beyond text'
      );
    }
    // Signal uses UTF-16 offsets. A boundary must not split a surrogate pair.
    if (
      [range.start, end].some(index => {
        const before = text.charCodeAt(index - 1);
        const after = text.charCodeAt(index);
        return (
          before >= 0xd800 &&
          before <= 0xdbff &&
          after >= 0xdc00 &&
          after <= 0xdfff
        );
      })
    ) {
      return invalidMention('Mention ranges must not split Unicode characters');
    }
    const contact = resolveContact(range.contactId);
    if (contact == null || !memberAcis.has(contact.aci)) {
      return invalidMention(
        `Mentioned contact is not a current group member: ${range.contactId}`
      );
    }
    body += text.slice(previousEnd, range.start);
    bodyRanges.push({
      start: body.length,
      length: 1,
      mentionAci: contact.aci,
      replacementText: contact.name,
    });
    body += '\uFFFC';
    previousEnd = end;
  }
  body += text.slice(previousEnd);
  return { body, bodyRanges };
}
