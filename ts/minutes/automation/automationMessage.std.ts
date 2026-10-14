// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { MessageType } from '../../sql/Interface.std.ts';
import {
  applyRangesToText,
  BodyRange,
  type HydratedBodyRangeMention,
} from '../../types/BodyRange.std.ts';
import type {
  AutomationMessage,
  AutomationPoll,
} from './automationContracts.std.ts';
import { toAutomationReactions } from './messageReactionAutomation.std.ts';

type AutomationMessageSource = Pick<
  MessageType,
  | 'id'
  | 'conversationId'
  | 'type'
  | 'sourceServiceId'
  | 'sent_at'
  | 'received_at_ms'
  | 'body'
  | 'bodyRanges'
  | 'attachments'
  | 'reactions'
  | 'poll'
>;

type MessageAttachment = NonNullable<
  AutomationMessageSource['attachments']
>[number];

export function getAutomationAttachmentId(
  messageId: string,
  attachment: MessageAttachment,
  index: number
): string {
  return (
    attachment.clientUuid ??
    attachment.digest ??
    attachment.cdnKey ??
    `${messageId}:${index}`
  );
}

export function toAutomationMessage(
  message: AutomationMessageSource,
  resolveReactionAuthorName: (authorId: string) => string | null,
  resolveMessageAuthor: (
    sourceServiceId: string | undefined,
    source: 'incoming' | 'outgoing'
  ) => Readonly<{ id: string; name: string }> | null = () => null,
  resolvePollVoter: (voterId: string) => Readonly<{
    id: string;
    title: string | null;
    isMe: boolean;
  }> | null = voterId => ({ id: voterId, title: null, isMe: false })
): AutomationMessage {
  const source = message.type === 'incoming' ? 'incoming' : 'outgoing';
  const author = resolveMessageAuthor(message.sourceServiceId, source);
  const text = resolveAutomationMessageText(message, mentionAci =>
    resolveMessageAuthor(mentionAci, 'incoming')
  );
  return {
    id: message.id,
    conversationId: message.conversationId,
    source,
    authorId: author?.id ?? null,
    authorName: author?.name ?? null,
    sentAt: message.sent_at,
    receivedAt: message.received_at_ms,
    text,
    attachments: (message.attachments ?? []).map((attachment, index) => ({
      id: getAutomationAttachmentId(message.id, attachment, index),
      contentType: attachment.contentType,
      fileName: attachment.fileName,
      size: attachment.size,
    })),
    reactions: toAutomationReactions(
      message.reactions ?? [],
      resolveReactionAuthorName
    ),
    poll:
      message.poll == null
        ? undefined
        : toAutomationPoll(message.poll, resolvePollVoter),
  };
}

function resolveAutomationMessageText(
  message: Pick<AutomationMessageSource, 'body' | 'bodyRanges'>,
  resolveMention: (
    mentionAci: string
  ) => Readonly<{ id: string; name: string }> | null
): string | null {
  if (message.body == null) {
    return null;
  }

  const mentions = (message.bodyRanges ?? []).flatMap(
    (range): ReadonlyArray<HydratedBodyRangeMention> => {
      if (!BodyRange.isMention(range)) {
        return [];
      }
      const contact = resolveMention(range.mentionAci);
      if (contact == null) {
        return [];
      }
      return [
        {
          ...range,
          conversationID: contact.id,
          replacementText: contact.name,
        },
      ];
    }
  );

  return applyRangesToText(
    { body: message.body, bodyRanges: mentions },
    { replaceMentions: true, replaceSpoilers: false }
  ).body;
}

function toAutomationPoll(
  poll: NonNullable<AutomationMessageSource['poll']>,
  resolvePollVoter: (
    voterId: string
  ) => Readonly<{ id: string; title: string | null; isMe: boolean }> | null
): AutomationPoll {
  const latestVoteByVoter = new Map<
    string,
    NonNullable<typeof poll.votes>[number]
  >();
  for (const vote of poll.votes ?? []) {
    if (vote.sendStateByConversationId != null) {
      continue;
    }
    const existing = latestVoteByVoter.get(vote.fromConversationId);
    if (
      existing == null ||
      vote.voteCount > existing.voteCount ||
      (vote.voteCount === existing.voteCount &&
        vote.timestamp > existing.timestamp)
    ) {
      latestVoteByVoter.set(vote.fromConversationId, vote);
    }
  }

  const votersByOption = poll.options.map(
    () =>
      new Map<
        string,
        Readonly<{ id: string; title: string | null; isMe: boolean }>
      >()
  );
  const uniqueVoterIds = new Set<string>();
  for (const vote of latestVoteByVoter.values()) {
    const voter = resolvePollVoter(vote.fromConversationId) ?? {
      id: vote.fromConversationId,
      title: null,
      isMe: false,
    };
    for (const optionIndex of new Set(vote.optionIndexes)) {
      const optionVoters = votersByOption[optionIndex];
      if (optionVoters == null) {
        continue;
      }
      optionVoters.set(voter.id, voter);
      uniqueVoterIds.add(voter.id);
    }
  }

  const uniqueVoters = uniqueVoterIds.size;
  const options = poll.options.map((text, index) => {
    const voters = [...(votersByOption[index]?.values() ?? [])];
    return {
      index,
      text,
      voteCount: voters.length,
      percentage: uniqueVoters === 0 ? 0 : (voters.length / uniqueVoters) * 100,
      voters,
    };
  });

  return {
    question: poll.question,
    allowMultiple: poll.allowMultiple,
    terminated: poll.terminatedAt != null,
    ...(poll.terminatedAt == null ? {} : { terminatedAt: poll.terminatedAt }),
    totalVotes: options.reduce((total, option) => total + option.voteCount, 0),
    uniqueVoters,
    options,
  };
}

export function selectAutomationMessageContext(
  older: ReadonlyArray<AutomationMessage>,
  newer: ReadonlyArray<AutomationMessage>,
  before: number,
  after: number
): Readonly<{
  before: ReadonlyArray<AutomationMessage>;
  after: ReadonlyArray<AutomationMessage>;
}> {
  return {
    before: before === 0 ? [] : older.slice(-before),
    after: newer.slice(0, after),
  };
}
