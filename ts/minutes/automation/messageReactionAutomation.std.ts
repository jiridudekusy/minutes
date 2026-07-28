// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { Emoji } from '../../axo/emoji.std.ts';

type ReactionLike = Readonly<{
  emoji: string | undefined;
  fromId: string;
  targetTimestamp: number;
  timestamp: number;
  isSentByConversationId?: Readonly<Record<string, boolean>>;
}>;

export type AutomationReaction = Readonly<{
  emoji: string;
  authorId: string;
  authorName: string | null;
  timestamp: number;
}>;

export function toAutomationReactions(
  reactions: ReadonlyArray<ReactionLike>,
  resolveAuthorName: (authorId: string) => string | null
): ReadonlyArray<AutomationReaction> {
  const latestByAuthor = new Map<string, ReactionLike>();
  for (const reaction of reactions) {
    const previous = latestByAuthor.get(reaction.fromId);
    if (previous == null || previous.timestamp <= reaction.timestamp) {
      latestByAuthor.set(reaction.fromId, reaction);
    }
  }
  return Array.from(latestByAuthor.values())
    .filter(
      (reaction): reaction is ReactionLike & { emoji: string } =>
        reaction.emoji != null
    )
    .sort((left, right) => left.timestamp - right.timestamp)
    .map(reaction => ({
      emoji: reaction.emoji,
      authorId: reaction.fromId,
      authorName: resolveAuthorName(reaction.fromId),
      timestamp: reaction.timestamp,
    }));
}

export function planMessageReactionChange(options: {
  reactions: ReadonlyArray<ReactionLike>;
  ourConversationId: string;
  requestedEmoji: string | null;
}):
  | Readonly<{ changed: false }>
  | Readonly<{ changed: true; emoji: string; remove: boolean }> {
  const { reactions, ourConversationId, requestedEmoji } = options;
  if (requestedEmoji != null && !Emoji.isEmoji(requestedEmoji)) {
    const error = new Error('emoji must be one supported emoji or null');
    Object.assign(error, { code: 'INVALID_ARGUMENT' });
    throw error;
  }

  const current = reactions
    .filter(reaction => reaction.fromId === ourConversationId)
    .reduce<
      ReactionLike | undefined
    >((latest, reaction) => (latest == null || latest.timestamp <= reaction.timestamp ? reaction : latest), undefined);
  const currentEmoji = current?.emoji;

  if (requestedEmoji == null) {
    return currentEmoji == null
      ? { changed: false }
      : { changed: true, emoji: currentEmoji, remove: true };
  }
  return currentEmoji === requestedEmoji
    ? { changed: false }
    : { changed: true, emoji: requestedEmoji, remove: false };
}
