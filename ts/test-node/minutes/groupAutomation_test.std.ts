// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  collectGroupsByMatchedMembers,
  detectGroupAvatarFormat,
  validateGroupMemberRemoval,
  validateGroupMemberSelector,
  validateGroupMetadataPatch,
  validateGroupRoleChanges,
} from '../../minutes/automation/groupAutomation.std.ts';
import type {
  AutomationContact,
  AutomationConversation,
} from '../../minutes/automation/automationContracts.std.ts';

const alice: AutomationContact = {
  id: 'alice-id',
  title: 'Alice',
  serviceId: 'alice-aci',
};
const jan: AutomationContact = {
  id: 'jan-id',
  title: 'Jan Novák',
  serviceId: 'jan-aci',
};
const secondJan: AutomationContact = {
  id: 'second-jan-id',
  title: 'Jan Novak',
  serviceId: 'second-jan-aci',
};

function group(
  id: string,
  title: string,
  activeAt: number,
  members: ReadonlyArray<AutomationContact>,
  options: Readonly<{
    left?: boolean;
    legacyDisabled?: boolean;
    terminated?: boolean;
  }> = {}
) {
  return {
    conversation: {
      id,
      title,
      type: 'group',
      unreadCount: 0,
      activeAt,
    } satisfies AutomationConversation,
    members,
    left: options.left ?? false,
    legacyDisabled: options.legacyDisabled ?? false,
    terminated: options.terminated ?? false,
  };
}

describe('group automation discovery', () => {
  it('requires exactly one exact or fuzzy member selector', () => {
    assert.deepEqual(validateGroupMemberSelector({ contactId: 'alice-id' }), {
      kind: 'exact',
      contactId: 'alice-id',
    });
    assert.deepEqual(validateGroupMemberSelector({ query: ' Jan ' }), {
      kind: 'query',
      query: 'Jan',
    });

    for (const input of [
      {},
      { contactId: 'alice-id', query: 'Alice' },
      { contactId: '  ' },
      { query: '  ' },
    ]) {
      assert.throws(
        () => validateGroupMemberSelector(input),
        'Exactly one of contactId or query is required'
      );
    }
  });

  it('returns current groups containing an exact internal member ID', () => {
    const results = collectGroupsByMatchedMembers(
      [
        group('older', 'Older', 10, [alice]),
        group('unrelated', 'Unrelated', 30, [jan]),
        group('newer', 'Newer', 20, [alice, jan]),
      ],
      new Set(['alice-id'])
    );

    assert.deepEqual(
      results.map(result => ({
        groupId: result.group.id,
        matchedIds: result.matchedMembers.map(member => member.id),
      })),
      [
        { groupId: 'newer', matchedIds: ['alice-id'] },
        { groupId: 'older', matchedIds: ['alice-id'] },
      ]
    );
  });

  it('deduplicates groups and reports every fuzzy-matched member', () => {
    const results = collectGroupsByMatchedMembers(
      [group('team', 'Team', 20, [jan, secondJan, alice])],
      new Set(['jan-id', 'second-jan-id'])
    );

    assert.lengthOf(results, 1);
    assert.deepEqual(
      results[0]?.matchedMembers.map(member => member.id),
      ['jan-id', 'second-jan-id']
    );
  });

  it('excludes groups the local user left and disabled legacy groups', () => {
    const results = collectGroupsByMatchedMembers(
      [
        group('current', 'Current', 10, [alice]),
        group('left', 'Left', 30, [alice], { left: true }),
        group('legacy', 'Legacy', 20, [alice], { legacyDisabled: true }),
      ],
      new Set(['alice-id'])
    );

    assert.deepEqual(
      results.map(result => result.group.id),
      ['current']
    );
  });

  it('excludes a terminated group with a historical matching member', () => {
    const results = collectGroupsByMatchedMembers(
      [
        group('active', 'Active', 10, [alice]),
        group('terminated', 'Terminated', 20, [alice, jan], {
          terminated: true,
        }),
      ],
      new Set(['alice-id'])
    );

    assert.deepEqual(
      results.map(result => result.group.id),
      ['active']
    );
  });

  it('validates an entire member-removal batch before mutation', () => {
    const members = [
      { id: 'self-id', role: 'admin' as const },
      { id: 'other-admin', role: 'admin' as const },
      { id: 'member-id', role: 'member' as const },
    ];

    assert.deepEqual(
      validateGroupMemberRemoval({
        requestedMemberIds: ['member-id', 'member-id'],
        members,
        selfId: 'self-id',
      }),
      ['member-id']
    );
    const missingRemoval = assert.throws(
      () =>
        validateGroupMemberRemoval({
          requestedMemberIds: ['missing'],
          members,
          selfId: 'self-id',
        }),
      'Unknown group member: missing'
    );
    assert.propertyVal(missingRemoval, 'code', 'NOT_FOUND');
    assert.throws(
      () =>
        validateGroupMemberRemoval({
          requestedMemberIds: ['self-id'],
          members,
          selfId: 'self-id',
        }),
      'Use leave_group'
    );
    assert.throws(
      () =>
        validateGroupMemberRemoval({
          requestedMemberIds: ['self-id', 'other-admin'],
          members,
          selfId: 'someone-else',
        }),
      'at least one administrator'
    );
  });

  it('rejects role changes that would demote the final administrator', () => {
    const members = [
      { id: 'admin-id', role: 'admin' as const },
      { id: 'member-id', role: 'member' as const },
    ];

    assert.deepEqual(
      validateGroupRoleChanges({
        requestedRoles: [
          { memberId: 'member-id', role: 'admin' },
          { memberId: 'member-id', role: 'admin' },
        ],
        members,
      }),
      [{ memberId: 'member-id', role: 'admin' }]
    );
    const missingRole = assert.throws(
      () =>
        validateGroupRoleChanges({
          requestedRoles: [{ memberId: 'missing', role: 'admin' }],
          members,
        }),
      'Unknown group member: missing'
    );
    assert.propertyVal(missingRole, 'code', 'NOT_FOUND');
    assert.throws(
      () =>
        validateGroupRoleChanges({
          requestedRoles: [{ memberId: 'admin-id', role: 'member' }],
          members,
        }),
      'at least one administrator'
    );
  });

  it('requires a meaningful metadata change and trims a supplied title', () => {
    assert.deepEqual(
      validateGroupMetadataPatch({
        title: ' New title ',
        description: '',
        avatarPath: null,
      }),
      {
        title: 'New title',
        description: '',
        avatarPath: null,
      }
    );
    assert.throws(() => validateGroupMetadataPatch({}), 'metadata field');
    assert.throws(
      () => validateGroupMetadataPatch({ title: '  ' }),
      'title must be a non-empty string'
    );
  });

  it('recognizes only supported group avatar image signatures', () => {
    assert.strictEqual(
      detectGroupAvatarFormat(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      ),
      'png'
    );
    assert.strictEqual(
      detectGroupAvatarFormat(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])),
      'jpeg'
    );
    assert.strictEqual(
      detectGroupAvatarFormat(
        Uint8Array.from([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        ])
      ),
      'webp'
    );
    assert.isUndefined(
      detectGroupAvatarFormat(Uint8Array.from([0x47, 0x49, 0x46]))
    );
  });
});
