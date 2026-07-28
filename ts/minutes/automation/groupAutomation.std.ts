// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  AutomationContact,
  AutomationConversation,
  AutomationGroupSearchResult,
} from './automationContracts.std.ts';

export type GroupMemberSelector =
  | Readonly<{ kind: 'exact'; contactId: string }>
  | Readonly<{ kind: 'query'; query: string }>;

export type AutomationGroupSearchSource = Readonly<{
  conversation: AutomationConversation;
  members: ReadonlyArray<AutomationContact>;
  left: boolean;
  legacyDisabled: boolean;
  terminated: boolean;
}>;

function invalidSelector(): never {
  return invalidArgument('Exactly one of contactId or query is required');
}

function invalidArgument(message: string): never {
  const error = new Error(message);
  Object.assign(error, { code: 'INVALID_ARGUMENT' });
  throw error;
}

function notFound(message: string): never {
  const error = new Error(message);
  Object.assign(error, { code: 'NOT_FOUND' });
  throw error;
}

export function validateGroupMemberSelector(
  input: Readonly<{ contactId?: string; query?: string }>
): GroupMemberSelector {
  const contactId = input.contactId?.trim();
  const query = input.query?.trim();
  if (
    (contactId == null || contactId.length === 0) ===
    (query == null || query.length === 0)
  ) {
    return invalidSelector();
  }
  if (contactId != null && contactId.length > 0) {
    return { kind: 'exact', contactId };
  }
  if (query != null && query.length > 0) {
    return { kind: 'query', query };
  }
  return invalidSelector();
}

export function collectGroupsByMatchedMembers(
  groups: ReadonlyArray<AutomationGroupSearchSource>,
  matchedMemberIds: ReadonlySet<string>
): Array<AutomationGroupSearchResult> {
  return groups
    .filter(group => !group.left && !group.legacyDisabled && !group.terminated)
    .map(group => ({
      group: group.conversation,
      matchedMembers: group.members.filter(member =>
        matchedMemberIds.has(member.id)
      ),
    }))
    .filter(result => result.matchedMembers.length > 0)
    .sort(
      (left, right) =>
        (right.group.activeAt ?? 0) - (left.group.activeAt ?? 0) ||
        left.group.title.localeCompare(right.group.title)
    );
}

type GroupMemberRole = Readonly<{
  id: string;
  role: 'admin' | 'member';
}>;

function uniqueNonEmptyIds(values: ReadonlyArray<string>): Array<string> {
  const result = new Array<string>();
  const seen = new Set<string>();
  for (const value of values) {
    const id = value.trim();
    if (id.length === 0) {
      invalidArgument('Member IDs must be non-empty strings');
    }
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  if (result.length === 0) {
    invalidArgument('At least one member ID is required');
  }
  return result;
}

function ensureAdministratorRemains(
  members: ReadonlyArray<GroupMemberRole>,
  resultingRoles: ReadonlyMap<string, 'admin' | 'member' | 'removed'>
): void {
  const administratorRemains = members.some(member => {
    const resultingRole = resultingRoles.get(member.id) ?? member.role;
    return resultingRole === 'admin';
  });
  if (!administratorRemains) {
    invalidArgument('A group must retain at least one administrator');
  }
}

export function validateGroupMemberRemoval({
  requestedMemberIds,
  members,
  selfId,
}: Readonly<{
  requestedMemberIds: ReadonlyArray<string>;
  members: ReadonlyArray<GroupMemberRole>;
  selfId: string;
}>): Array<string> {
  const memberIds = uniqueNonEmptyIds(requestedMemberIds);
  const existingIds = new Set(members.map(member => member.id));
  const resultingRoles = new Map<string, 'removed'>();
  for (const memberId of memberIds) {
    if (!existingIds.has(memberId)) {
      notFound(`Unknown group member: ${memberId}`);
    }
    if (memberId === selfId) {
      invalidArgument('Use leave_group to remove the local account');
    }
    resultingRoles.set(memberId, 'removed');
  }
  ensureAdministratorRemains(members, resultingRoles);
  return memberIds;
}

export function validateGroupRoleChanges({
  requestedRoles,
  members,
}: Readonly<{
  requestedRoles: ReadonlyArray<
    Readonly<{ memberId: string; role: 'admin' | 'member' }>
  >;
  members: ReadonlyArray<GroupMemberRole>;
}>): Array<Readonly<{ memberId: string; role: 'admin' | 'member' }>> {
  if (requestedRoles.length === 0) {
    invalidArgument('At least one member role is required');
  }
  const existingIds = new Set(members.map(member => member.id));
  const rolesByMember = new Map<string, 'admin' | 'member'>();
  for (const requested of requestedRoles) {
    const memberId = requested.memberId.trim();
    if (!existingIds.has(memberId)) {
      notFound(`Unknown group member: ${memberId}`);
    }
    rolesByMember.set(memberId, requested.role);
  }
  ensureAdministratorRemains(members, rolesByMember);
  return [...rolesByMember].map(([memberId, role]) => ({ memberId, role }));
}

export function validateGroupMetadataPatch(
  input: Readonly<{
    title?: string;
    description?: string;
    avatarPath?: string | null;
  }>
): Readonly<{
  title?: string;
  description?: string;
  avatarPath?: string | null;
}> {
  if (
    input.title === undefined &&
    input.description === undefined &&
    input.avatarPath === undefined
  ) {
    invalidArgument('At least one metadata field is required');
  }
  const title = input.title?.trim();
  if (input.title !== undefined && !title) {
    invalidArgument('title must be a non-empty string');
  }
  const avatarPath =
    typeof input.avatarPath === 'string'
      ? input.avatarPath.trim()
      : input.avatarPath;
  if (typeof input.avatarPath === 'string' && avatarPath === '') {
    invalidArgument('avatarPath must be a non-empty string or null');
  }
  return {
    ...(title === undefined ? {} : { title }),
    ...(input.description === undefined
      ? {}
      : { description: input.description }),
    ...(avatarPath === undefined ? {} : { avatarPath }),
  };
}

export function detectGroupAvatarFormat(
  bytes: Uint8Array<ArrayBuffer>
): 'png' | 'jpeg' | 'webp' | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'jpeg';
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'webp';
  }
  return undefined;
}
