// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { ipcRenderer } from 'electron';
import { readFile, stat } from 'node:fs/promises';

import type { MessageType } from '../../sql/Interface.std.ts';
import { DataReader } from '../../sql/Client.preload.ts';
import { CallMode } from '../../types/CallDisposition.std.ts';
import {
  buildAddMembersChange,
  buildUpdateAttributesChange,
  createGroupV2,
} from '../../groups.preload.ts';
import { SignalService as Proto } from '../../protobuf/index.std.ts';
import { itemStorage } from '../../textsecure/Storage.preload.ts';
import { DurationInSeconds } from '../../util/durations/index.std.ts';
import { filterAndSortConversations } from '../../util/filterAndSortConversations.std.ts';
import { isGroupV2 } from '../../util/whatTypeOfConversation.dom.ts';
import { areWeAdmin } from '../../util/areWeAdmin.preload.ts';
import { canAddNewMembers } from '../../util/canAddNewMembers.preload.ts';
import { canChangeTimer } from '../../util/canChangeTimer.preload.ts';
import { canEditGroupInfo } from '../../util/canEditGroupInfo.preload.ts';
import { Emoji } from '../../axo/emoji.std.ts';
import { getMessageById } from '../../messages/getMessageById.preload.ts';
import { enqueueReactionForSend } from '../../reactions/enqueueReactionForSend.preload.ts';
import { callRecordingService } from '../callRecordingService.preload.ts';
import { sendSignalChatMessage } from '../sendSignalChatMessage.preload.ts';
import { videoRecordingService } from '../videoRecordingService.preload.ts';
import type {
  AutomationConversation,
  AutomationContact,
  AutomationGroup,
  AutomationGroupMember,
  AutomationMessage,
  AutomationRendererRequest,
} from './automationContracts.std.ts';
import { AutomationRendererHandler } from './automationRendererHandler.std.ts';
import { paginateAutomationItems } from './pagination.std.ts';
import { emitRendererAutomationEvent } from './automationEvents.preload.ts';
import {
  RECORDING_STATE_CHANGED,
  recordingStateEvents,
} from '../recordingStateEvents.std.ts';
import type { MinutesRecordingState } from '../types.std.ts';
import {
  VIDEO_RECORDING_STATE_CHANGED,
  videoRecordingStateEvents,
} from '../videoRecordingStateEvents.std.ts';
import type { VideoRecordingState } from '../videoRecordingServiceCore.std.ts';
import {
  collectGroupsByMatchedMembers,
  detectGroupAvatarFormat,
  validateGroupMemberRemoval,
  validateGroupMemberSelector,
  validateGroupMetadataPatch,
  validateGroupRoleChanges,
} from './groupAutomation.std.ts';
import { planMessageReactionChange } from './messageReactionAutomation.std.ts';
import { toAutomationMessage } from './automationMessage.std.ts';

const MAX_QUERY_ITEMS = 500;
const MAX_GROUP_AVATAR_BYTES = 10 * 1024 * 1024;
let automationRendererInitialized = false;

type ConversationModel = ReturnType<
  typeof window.ConversationController.getAll
>[number];

function automationError(code: string, message: string): never {
  const error = new Error(message);
  Object.assign(error, { code });
  throw error;
}

function requiredString(
  params: Readonly<Record<string, unknown>>,
  name: string
): string {
  const value = params[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    const error = new Error(`${name} must be a non-empty string`);
    Object.assign(error, { code: 'INVALID_ARGUMENT' });
    throw error;
  }
  return value.trim();
}

function optionalString(
  params: Readonly<Record<string, unknown>>,
  name: string
): string | undefined {
  const value = params[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalTypedString(
  params: Readonly<Record<string, unknown>>,
  name: string
): string | undefined {
  const value = params[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return automationError('INVALID_ARGUMENT', `${name} must be a string`);
  }
  return value;
}

function optionalNullableString(
  params: Readonly<Record<string, unknown>>,
  name: string
): string | null | undefined {
  const value = params[name];
  if (value === undefined || value == null) {
    return value;
  }
  if (typeof value !== 'string') {
    return automationError(
      'INVALID_ARGUMENT',
      `${name} must be a string or null`
    );
  }
  return value;
}

function optionalLimit(
  params: Readonly<Record<string, unknown>>
): number | undefined {
  const value = params.limit;
  return typeof value === 'number' ? value : undefined;
}

function requiredStringArray(
  params: Readonly<Record<string, unknown>>,
  name: string
): Array<string> {
  const value = params[name];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every(item => typeof item === 'string')
  ) {
    return automationError(
      'INVALID_ARGUMENT',
      `${name} must be a non-empty string array`
    );
  }
  return value.map(item => {
    const trimmed = item.trim();
    if (trimmed.length === 0) {
      return automationError(
        'INVALID_ARGUMENT',
        `${name} must contain only non-empty strings`
      );
    }
    return trimmed;
  });
}

function requiredNonNegativeInteger(
  params: Readonly<Record<string, unknown>>,
  name: string
): number {
  const value = params[name];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return automationError(
      'INVALID_ARGUMENT',
      `${name} must be a non-negative integer`
    );
  }
  return value;
}

function optionalNonNegativeInteger(
  params: Readonly<Record<string, unknown>>,
  name: string
): number | undefined {
  return params[name] === undefined
    ? undefined
    : requiredNonNegativeInteger(params, name);
}

function mapConversation(
  conversation: ConversationModel
): AutomationConversation {
  return {
    id: conversation.id,
    title: conversation.getTitle(),
    type: conversation.get('type') === 'group' ? 'group' : 'direct',
    serviceId: conversation.get('serviceId'),
    e164: conversation.get('e164'),
    unreadCount: conversation.get('unreadCount') ?? 0,
    activeAt: conversation.get('active_at') ?? undefined,
  };
}

function mapContact(conversation: ConversationModel): AutomationContact {
  return {
    id: conversation.id,
    title: conversation.getTitle(),
    serviceId: conversation.get('serviceId'),
    e164: conversation.get('e164'),
  };
}

function contactForServiceId(serviceId: string): AutomationContact | undefined {
  const conversation = window.ConversationController.get(serviceId);
  return conversation == null ? undefined : mapContact(conversation);
}

function requireExactContact(contactId: string): ConversationModel {
  const conversation = window.ConversationController.get(contactId);
  if (
    conversation == null ||
    conversation.id !== contactId ||
    conversation.get('type') === 'group' ||
    conversation.getServiceId() == null
  ) {
    return automationError('NOT_FOUND', `Contact not found: ${contactId}`);
  }
  return conversation;
}

function requireGroupV2(
  groupId: string,
  { forMutation = false }: Readonly<{ forMutation?: boolean }> = {}
): ConversationModel {
  const conversation = window.ConversationController.get(groupId);
  if (conversation == null || conversation.id !== groupId) {
    return automationError('NOT_FOUND', `Group V2 not found: ${groupId}`);
  }
  if (
    conversation.get('type') !== 'group' ||
    !isGroupV2(conversation.attributes)
  ) {
    return automationError(
      'INVALID_ARGUMENT',
      'The conversation is not a Group V2 group'
    );
  }
  if (conversation.get('left')) {
    return automationError(
      'INVALID_ARGUMENT',
      'The local account left the group'
    );
  }
  if (forMutation && conversation.get('terminated')) {
    return automationError('INVALID_ARGUMENT', 'The group is terminated');
  }
  return conversation;
}

function groupMembers(group: ConversationModel): Array<AutomationGroupMember> {
  const adminRole = Proto.Member.Role.ADMINISTRATOR;
  return (group.get('membersV2') ?? []).flatMap(member => {
    const contact = contactForServiceId(member.aci);
    return contact == null
      ? []
      : [
          {
            ...contact,
            role:
              member.role === adminRole
                ? ('admin' as const)
                : ('member' as const),
          },
        ];
  });
}

function mapAutomationGroup(group: ConversationModel): AutomationGroup {
  const access = group.get('accessControl');
  const accessRequired = Proto.AccessControl.AccessRequired;
  const inviteAccess = access?.addFromInviteLink;
  let inviteLink: AutomationGroup['permissions']['inviteLink'];
  if (
    group.get('groupInviteLinkPassword') == null ||
    inviteAccess === accessRequired.UNSATISFIABLE
  ) {
    inviteLink = 'disabled';
  } else if (inviteAccess === accessRequired.ADMINISTRATOR) {
    inviteLink = 'admin_approval';
  } else {
    inviteLink = 'open';
  }

  return {
    id: group.id,
    title: group.getTitle(),
    description: group.get('description') ?? undefined,
    avatar: Boolean(group.get('avatar')),
    left: Boolean(group.get('left')),
    terminated: Boolean(group.get('terminated')),
    archived: Boolean(group.get('isArchived')),
    activeAt: group.get('active_at') ?? undefined,
    unreadCount: group.get('unreadCount') ?? 0,
    members: groupMembers(group),
    pendingMembers: (group.get('pendingMembersV2') ?? []).flatMap(member => {
      const contact = contactForServiceId(member.serviceId);
      return contact == null ? [] : [contact];
    }),
    pendingAdminApprovalMembers: (
      group.get('pendingAdminApprovalV2') ?? []
    ).flatMap(member => {
      const contact = contactForServiceId(member.aci);
      return contact == null ? [] : [contact];
    }),
    permissions: {
      editDetails:
        access?.attributes === accessRequired.ADMINISTRATOR
          ? 'admins'
          : 'members',
      addMembers:
        access?.members === accessRequired.ADMINISTRATOR ? 'admins' : 'members',
      inviteLink,
      announcementsOnly: Boolean(group.get('announcementsOnly')),
    },
    disappearingMessagesSeconds: Number(group.get('expireTimer') ?? 0),
  };
}

function currentGroupSearchSources(): Array<{
  model: ConversationModel;
  conversation: AutomationConversation;
  members: Array<AutomationContact>;
  left: boolean;
  legacyDisabled: boolean;
  terminated: boolean;
}> {
  return window.ConversationController.getAll()
    .filter(conversation => conversation.get('type') === 'group')
    .map(model => ({
      model,
      conversation: mapConversation(model),
      members: (model.get('membersV2') ?? []).flatMap(member => {
        const contact = contactForServiceId(member.aci);
        return contact == null ? [] : [contact];
      }),
      left: Boolean(model.get('left')),
      legacyDisabled: model.isGroupV1AndDisabled(),
      terminated: Boolean(model.get('terminated')),
    }));
}

async function readValidatedGroupAvatar(
  path: string
): Promise<Uint8Array<ArrayBuffer>> {
  let metadata;
  try {
    metadata = await stat(path);
  } catch {
    return automationError('NOT_FOUND', `Avatar file not found: ${path}`);
  }
  if (!metadata.isFile()) {
    return automationError('INVALID_ARGUMENT', 'Avatar path is not a file');
  }
  if (metadata.size > MAX_GROUP_AVATAR_BYTES) {
    return automationError(
      'INVALID_ARGUMENT',
      'Avatar file exceeds the 10 MiB limit'
    );
  }
  const buffer = await readFile(path);
  if (detectGroupAvatarFormat(buffer) == null) {
    return automationError(
      'INVALID_ARGUMENT',
      'Avatar must be a PNG, JPEG, or WebP image'
    );
  }
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes;
}

function requirePermission(allowed: boolean, message: string): void {
  if (!allowed) {
    automationError('PERMISSION_DENIED', message);
  }
}

function requestedMemberRoles(
  params: Readonly<Record<string, unknown>>
): Array<Readonly<{ memberId: string; role: 'admin' | 'member' }>> {
  const value = params.roles;
  if (!Array.isArray(value) || value.length === 0) {
    return automationError(
      'INVALID_ARGUMENT',
      'roles must be a non-empty array'
    );
  }
  return value.map(item => {
    if (
      item == null ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      !('memberId' in item) ||
      typeof item.memberId !== 'string' ||
      !('role' in item) ||
      (item.role !== 'admin' && item.role !== 'member')
    ) {
      return automationError('INVALID_ARGUMENT', 'Invalid member role');
    }
    return { memberId: item.memberId, role: item.role };
  });
}

function mapAutomationMessage(message: MessageType): AutomationMessage {
  return toAutomationMessage(message, authorId => {
    const title = window.ConversationController.get(authorId)
      ?.getTitle()
      .trim();
    return title || null;
  });
}

function activeCallResult(): {
  call: {
    callId: string;
    conversationId: string;
    callMode: string;
    state: string;
    hasLocalAudio: boolean;
    hasLocalVideo: boolean;
  } | null;
} {
  const active = window.reduxStore.getState().calling.activeCallState;
  if (active == null) {
    return { call: null };
  }
  return {
    call: {
      callId: active.conversationId,
      conversationId: active.conversationId,
      callMode: 'callMode' in active ? active.callMode : 'unknown',
      state: active.state,
      hasLocalAudio: 'hasLocalAudio' in active ? active.hasLocalAudio : false,
      hasLocalVideo: 'hasLocalVideo' in active ? active.hasLocalVideo : false,
    },
  };
}

function activeRecordableCall(): {
  conversationId: string;
  callMode: CallMode.Direct | CallMode.Group;
} {
  const active = window.reduxStore.getState().calling.activeCallState;
  if (
    active == null ||
    active.state !== 'Active' ||
    (active.callMode !== CallMode.Direct && active.callMode !== CallMode.Group)
  ) {
    const error = new Error('No active recordable call');
    Object.assign(error, { code: 'INVALID_STATE' });
    throw error;
  }
  return {
    conversationId: active.conversationId,
    callMode: active.callMode,
  };
}

async function waitForActiveCall(conversationId: string): Promise<void> {
  const initial = window.reduxStore.getState().calling.activeCallState;
  if (
    initial?.state === 'Active' &&
    initial.conversationId === conversationId
  ) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Call lobby did not become ready'));
    }, 15_000);
    const unsubscribe = window.reduxStore.subscribe(() => {
      const active = window.reduxStore.getState().calling.activeCallState;
      if (
        active?.state === 'Active' &&
        active.conversationId === conversationId
      ) {
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      }
    });
  });
}

function pauseActiveRecording(): boolean {
  if (callRecordingService.getState().status === 'recording') {
    return callRecordingService.pauseRecording();
  }
  if (videoRecordingService.getState().status === 'recording') {
    return videoRecordingService.pauseRecording();
  }
  return false;
}

function resumeActiveRecording(): boolean {
  if (callRecordingService.getState().status === 'paused') {
    return callRecordingService.resumeRecording();
  }
  if (videoRecordingService.getState().status === 'paused') {
    return videoRecordingService.resumeRecording();
  }
  return false;
}

async function stopActiveRecording(): Promise<boolean> {
  const audioState = callRecordingService.getState();
  if (audioState.status === 'recording' || audioState.status === 'paused') {
    return (await callRecordingService.stopRecording()) != null;
  }
  const videoState = videoRecordingService.getState();
  if (videoState.status === 'recording' || videoState.status === 'paused') {
    await videoRecordingService.stopRecording();
    return true;
  }
  return false;
}

export function initializeAutomationRenderer(): void {
  if (automationRendererInitialized) {
    return;
  }
  automationRendererInitialized = true;

  const handler = new AutomationRendererHandler({
    listConversations: async params => {
      const query = optionalString(params, 'query')?.toLocaleLowerCase();
      const items = window.ConversationController.getAll()
        .map(mapConversation)
        .filter(item =>
          query == null ? true : item.title.toLocaleLowerCase().includes(query)
        )
        .sort((left, right) => (right.activeAt ?? 0) - (left.activeAt ?? 0));
      return paginateAutomationItems(items, {
        cursor: optionalString(params, 'cursor'),
        limit: optionalLimit(params),
        maxLimit: 100,
      });
    },
    getConversation: async params => {
      const id = requiredString(params, 'conversationId');
      const conversation = window.ConversationController.get(id);
      if (conversation == null) {
        const error = new Error('Conversation not found');
        Object.assign(error, { code: 'NOT_FOUND' });
        throw error;
      }
      return mapConversation(conversation);
    },
    listContacts: async params => {
      const query = optionalString(params, 'query')?.toLocaleLowerCase();
      const contacts: Array<AutomationContact> =
        window.ConversationController.getAll()
          .filter(conversation => conversation.get('type') !== 'group')
          .map(conversation => ({
            id: conversation.id,
            title: conversation.getTitle(),
            serviceId: conversation.get('serviceId'),
            e164: conversation.get('e164'),
          }))
          .filter(item =>
            query == null
              ? true
              : item.title.toLocaleLowerCase().includes(query) ||
                item.e164?.includes(query) === true
          );
      return paginateAutomationItems(contacts, {
        cursor: optionalString(params, 'cursor'),
        limit: optionalLimit(params),
        maxLimit: 100,
      });
    },
    getContact: async params => {
      const id = requiredString(params, 'contactId');
      const conversation = window.ConversationController.get(id);
      if (conversation == null || conversation.get('type') === 'group') {
        const error = new Error('Contact not found');
        Object.assign(error, { code: 'NOT_FOUND' });
        throw error;
      }
      return {
        id: conversation.id,
        title: conversation.getTitle(),
        serviceId: conversation.get('serviceId'),
        e164: conversation.get('e164'),
      } satisfies AutomationContact;
    },
    getGroup: async params => {
      const groupId = requiredString(params, 'groupId');
      return mapAutomationGroup(requireGroupV2(groupId));
    },
    findGroupsByMember: async params => {
      const selector = validateGroupMemberSelector({
        contactId: optionalString(params, 'contactId'),
        query: optionalString(params, 'query'),
      });
      const sources = currentGroupSearchSources();
      const matchedMemberIds = new Set<string>();

      if (selector.kind === 'exact') {
        matchedMemberIds.add(requireExactContact(selector.contactId).id);
      } else {
        const candidates = new Map<string, ConversationModel>();
        for (const source of sources) {
          for (const member of source.model.get('membersV2') ?? []) {
            const conversation = window.ConversationController.get(member.aci);
            if (conversation != null && conversation.get('type') !== 'group') {
              candidates.set(conversation.id, conversation);
            }
          }
        }
        const matches = filterAndSortConversations(
          [...candidates.values()].map(conversation => conversation.format()),
          selector.query,
          itemStorage.get('regionCode')
        );
        for (const match of matches) {
          matchedMemberIds.add(match.id);
        }
      }

      return paginateAutomationItems(
        collectGroupsByMatchedMembers(sources, matchedMemberIds),
        {
          cursor: optionalString(params, 'cursor'),
          limit: optionalLimit(params),
          maxLimit: 100,
        }
      );
    },
    createGroup: async params => {
      const title = requiredString(params, 'title');
      const requestedIds = requiredStringArray(params, 'memberIds');
      const selfId =
        window.ConversationController.getOurConversationIdOrThrow();
      const memberIds = [...new Set(requestedIds)]
        .map(id => requireExactContact(id))
        .filter(contact => contact.id !== selfId)
        .map(contact => contact.id);
      const avatarPath =
        params.avatarPath === undefined
          ? undefined
          : requiredString(params, 'avatarPath');
      const disappearingMessagesSeconds = optionalNonNegativeInteger(
        params,
        'disappearingMessagesSeconds'
      );
      const avatar =
        avatarPath == null
          ? undefined
          : await readValidatedGroupAvatar(avatarPath);
      const group = await createGroupV2({
        name: title,
        avatar,
        expireTimer:
          disappearingMessagesSeconds == null ||
          disappearingMessagesSeconds === 0
            ? undefined
            : DurationInSeconds.fromSeconds(disappearingMessagesSeconds),
        conversationIds: memberIds,
      });
      return mapAutomationGroup(group);
    },
    updateGroupMetadata: async params => {
      const group = requireGroupV2(requiredString(params, 'groupId'), {
        forMutation: true,
      });
      requirePermission(
        canEditGroupInfo(group.attributes),
        'The local account cannot edit group information'
      );
      const title = optionalTypedString(params, 'title');
      const description = optionalTypedString(params, 'description');
      const avatarPath = optionalNullableString(params, 'avatarPath');
      const patch = validateGroupMetadataPatch({
        title,
        description,
        avatarPath,
      });
      const attributes: {
        avatar?: undefined | Uint8Array<ArrayBuffer>;
        description?: string;
        title?: string;
      } = {};
      if (patch.title !== undefined) {
        attributes.title = patch.title;
      }
      if (patch.description !== undefined) {
        attributes.description = patch.description;
      }
      if (patch.avatarPath !== undefined) {
        attributes.avatar =
          patch.avatarPath == null
            ? undefined
            : await readValidatedGroupAvatar(patch.avatarPath);
      }
      await group.modifyGroupV2({
        name: 'minutesUpdateGroupMetadata',
        usingCredentialsFrom: [],
        createGroupChange: () =>
          buildUpdateAttributesChange(group.attributes, attributes),
      });
      return mapAutomationGroup(group);
    },
    addGroupMembers: async params => {
      const group = requireGroupV2(requiredString(params, 'groupId'), {
        forMutation: true,
      });
      requirePermission(
        canAddNewMembers(group.attributes),
        'The local account cannot add group members'
      );
      const contacts = [
        ...new Map(
          requiredStringArray(params, 'memberIds').map(id => {
            const contact = requireExactContact(id);
            return [contact.id, contact] as const;
          })
        ).values(),
      ];
      const existingServiceIds = new Set([
        ...(group.get('membersV2') ?? []).map(member => member.aci),
        ...(group.get('pendingMembersV2') ?? []).map(
          member => member.serviceId
        ),
      ]);
      const memberIds = contacts
        .filter(contact => {
          const serviceId = contact.getServiceId();
          return serviceId != null && !existingServiceIds.has(serviceId);
        })
        .map(contact => contact.id);
      if (memberIds.length > 0) {
        await group.modifyGroupV2({
          name: 'minutesAddGroupMembers',
          usingCredentialsFrom: [],
          createGroupChange: () =>
            buildAddMembersChange(group.attributes, memberIds),
        });
      }
      return mapAutomationGroup(group);
    },
    removeGroupMembers: async params => {
      const group = requireGroupV2(requiredString(params, 'groupId'), {
        forMutation: true,
      });
      requirePermission(
        canAddNewMembers(group.attributes),
        'The local account cannot remove group members'
      );
      const requestedMemberIds = requiredStringArray(params, 'memberIds');
      for (const memberId of requestedMemberIds) {
        requireExactContact(memberId);
      }
      const memberIds = validateGroupMemberRemoval({
        requestedMemberIds,
        members: groupMembers(group),
        selfId: window.ConversationController.getOurConversationIdOrThrow(),
      });
      for (const memberId of memberIds) {
        // Each update advances the Group V2 revision, so these must be serial.
        // oxlint-disable-next-line no-await-in-loop
        await group.removeFromGroupV2(memberId);
      }
      return mapAutomationGroup(group);
    },
    setGroupMemberRoles: async params => {
      const group = requireGroupV2(requiredString(params, 'groupId'), {
        forMutation: true,
      });
      requirePermission(
        areWeAdmin(group.attributes),
        'Only a group administrator can change member roles'
      );
      const requestedRoles = requestedMemberRoles(params);
      for (const { memberId } of requestedRoles) {
        requireExactContact(memberId);
      }
      const currentMembers = groupMembers(group);
      const roles = validateGroupRoleChanges({
        requestedRoles,
        members: currentMembers,
      });
      const rolesByMember = new Map(
        currentMembers.map(member => [member.id, member.role])
      );
      for (const { memberId, role } of roles) {
        if (rolesByMember.get(memberId) !== role) {
          // Each update advances the Group V2 revision, so these must be serial.
          // oxlint-disable-next-line no-await-in-loop
          await group.toggleAdmin(memberId);
        }
      }
      return mapAutomationGroup(group);
    },
    setGroupPermissions: async params => {
      const group = requireGroupV2(requiredString(params, 'groupId'), {
        forMutation: true,
      });
      requirePermission(
        areWeAdmin(group.attributes),
        'Only a group administrator can change group permissions'
      );
      const editDetails = params.editDetails;
      const addMembers = params.addMembers;
      const inviteLink = params.inviteLink;
      const announcementsOnly = params.announcementsOnly;
      if (
        editDetails === undefined &&
        addMembers === undefined &&
        inviteLink === undefined &&
        announcementsOnly === undefined
      ) {
        return automationError(
          'INVALID_ARGUMENT',
          'At least one permission field is required'
        );
      }
      if (
        editDetails !== undefined &&
        editDetails !== 'members' &&
        editDetails !== 'admins'
      ) {
        return automationError(
          'INVALID_ARGUMENT',
          'editDetails must be members or admins'
        );
      }
      if (
        addMembers !== undefined &&
        addMembers !== 'members' &&
        addMembers !== 'admins'
      ) {
        return automationError(
          'INVALID_ARGUMENT',
          'addMembers must be members or admins'
        );
      }
      if (
        inviteLink !== undefined &&
        inviteLink !== 'disabled' &&
        inviteLink !== 'open' &&
        inviteLink !== 'admin_approval'
      ) {
        return automationError('INVALID_ARGUMENT', 'Invalid inviteLink value');
      }
      if (
        announcementsOnly !== undefined &&
        typeof announcementsOnly !== 'boolean'
      ) {
        return automationError(
          'INVALID_ARGUMENT',
          'announcementsOnly must be a boolean'
        );
      }
      if (announcementsOnly === true && !group.canBeAnnouncementGroup()) {
        return automationError(
          'INVALID_STATE',
          'This group cannot enable announcements-only mode'
        );
      }

      const accessRequired = Proto.AccessControl.AccessRequired;
      if (editDetails !== undefined) {
        await group.updateAccessControlAttributes(
          editDetails === 'admins'
            ? accessRequired.ADMINISTRATOR
            : accessRequired.MEMBER
        );
      }
      if (addMembers !== undefined) {
        await group.updateAccessControlMembers(
          addMembers === 'admins'
            ? accessRequired.ADMINISTRATOR
            : accessRequired.MEMBER
        );
      }
      if (inviteLink === 'disabled') {
        await group.toggleGroupLink(false);
      } else if (inviteLink === 'open') {
        await group.toggleGroupLink(true);
      } else if (inviteLink === 'admin_approval') {
        await group.toggleGroupLink(true);
        await group.updateAccessControlAddFromInviteLink(true);
      }
      if (announcementsOnly !== undefined) {
        await group.updateAnnouncementsOnly(announcementsOnly);
      }
      return mapAutomationGroup(group);
    },
    setGroupDisappearingMessages: async params => {
      const group = requireGroupV2(requiredString(params, 'groupId'), {
        forMutation: true,
      });
      requirePermission(
        canChangeTimer(group.attributes),
        'The local account cannot change the disappearing-message timer'
      );
      const seconds = requiredNonNegativeInteger(params, 'seconds');
      await group.updateExpirationTimer(
        seconds === 0 ? undefined : DurationInSeconds.fromSeconds(seconds),
        {
          reason: 'minutesSetGroupDisappearingMessages',
          version: undefined,
        }
      );
      return mapAutomationGroup(group);
    },
    leaveGroup: async params => {
      const group = requireGroupV2(requiredString(params, 'groupId'), {
        forMutation: true,
      });
      await group.leaveGroupV2();
      return mapAutomationGroup(group);
    },
    getMessages: async params => {
      const conversationId = requiredString(params, 'conversationId');
      if (window.ConversationController.get(conversationId) == null) {
        const error = new Error('Conversation not found');
        Object.assign(error, { code: 'NOT_FOUND' });
        throw error;
      }
      const messages = await DataReader.getOlderMessagesByConversation({
        conversationId,
        includeStoryReplies: false,
        storyId: undefined,
        limit: MAX_QUERY_ITEMS,
      });
      return paginateAutomationItems(messages.map(mapAutomationMessage), {
        cursor: optionalString(params, 'cursor'),
        limit: optionalLimit(params),
        maxLimit: 100,
      });
    },
    searchMessages: async params => {
      const query = requiredString(params, 'query');
      const messages = await DataReader.searchMessages({
        query,
        conversationId: optionalString(params, 'conversationId'),
        options: { limit: MAX_QUERY_ITEMS },
      });
      return paginateAutomationItems(messages.map(mapAutomationMessage), {
        cursor: optionalString(params, 'cursor'),
        limit: optionalLimit(params),
        maxLimit: 100,
      });
    },
    sendMessage: async params => {
      const conversationId = requiredString(params, 'conversationId');
      const text = requiredString(params, 'text');
      const queued = await sendSignalChatMessage(
        conversationId,
        text,
        'automation/sendMessage'
      );
      if (!queued) {
        const error = new Error('Message could not be queued');
        Object.assign(error, { code: 'INVALID_STATE' });
        throw error;
      }
      emitRendererAutomationEvent({
        id: globalThis.crypto.randomUUID(),
        type: 'message.sent',
        occurredAt: new Date().toISOString(),
        data: {
          messageId: `automation:${globalThis.crypto.randomUUID()}`,
          conversationId,
          text,
          attachments: [],
        },
      });
      return { queued: true };
    },
    setMessageReaction: async params => {
      const messageId = requiredString(params, 'messageId');
      const requestedEmoji = optionalNullableString(params, 'emoji');
      if (requestedEmoji === undefined) {
        return automationError(
          'INVALID_ARGUMENT',
          'emoji must be one supported emoji or null'
        );
      }
      const message = await getMessageById(messageId);
      if (message == null) {
        return automationError('NOT_FOUND', 'Message not found');
      }
      const plan = planMessageReactionChange({
        reactions: message.attributes.reactions ?? [],
        ourConversationId:
          window.ConversationController.getOurConversationIdOrThrow(),
        requestedEmoji,
      });
      if (!plan.changed) {
        return { changed: false, messageId, emoji: requestedEmoji };
      }
      if (!Emoji.isEmoji(plan.emoji)) {
        return automationError(
          'INVALID_STATE',
          'Stored reaction is not a supported emoji'
        );
      }
      await enqueueReactionForSend({
        messageId,
        emoji: Emoji.ignorePreferredSkinTone(plan.emoji),
        remove: plan.remove,
      });
      return { changed: true, messageId, emoji: requestedEmoji };
    },
    getActiveCall: async () => activeCallResult(),
    startCall: async params => {
      const conversationId = requiredString(params, 'conversationId');
      const withVideo = params.withVideo === true;
      window.reduxActions.calling.startCallingLobby({
        conversationId,
        isVideoCall: withVideo,
      });
      await waitForActiveCall(conversationId);
      const active = window.reduxStore.getState().calling.activeCallState;
      if (
        active == null ||
        active.state !== 'Active' ||
        active.conversationId !== conversationId
      ) {
        const error = new Error('Call lobby is not ready');
        Object.assign(error, { code: 'INVALID_STATE' });
        throw error;
      }
      window.reduxActions.calling.startCall({
        callMode: active.callMode,
        conversationId,
        hasLocalAudio: true,
        hasLocalVideo: withVideo,
      });
      return activeCallResult();
    },
    hangUpCall: async () => {
      const before = activeCallResult();
      if (before.call == null) {
        const error = new Error('No active call');
        Object.assign(error, { code: 'INVALID_STATE' });
        throw error;
      }
      window.reduxActions.calling.hangUpActiveCall(
        'Minutes automation request'
      );
      return { ended: true, callId: before.call.callId };
    },
    startAudioRecording: async () => {
      const active = activeRecordableCall();
      return {
        started: await callRecordingService.startRecording(active),
        mediaKind: 'audio',
      };
    },
    startVideoRecording: async () => {
      const active = activeRecordableCall();
      return {
        started: await videoRecordingService.startRecording(active),
        mediaKind: 'screen-share-video',
      };
    },
    pauseRecording: async () => ({
      paused: pauseActiveRecording(),
    }),
    resumeRecording: async () => ({
      resumed: resumeActiveRecording(),
    }),
    stopRecording: async () => {
      return { stopped: await stopActiveRecording() };
    },
  });

  ipcRenderer.on(
    'minutes:automation-request',
    (_event, request: AutomationRendererRequest) => {
      void (async () => {
        const response = await handler.handle(request);
        ipcRenderer.send('minutes:automation-response', response);
      })();
    }
  );

  let previousAudio: MinutesRecordingState = callRecordingService.getState();
  recordingStateEvents.on(
    RECORDING_STATE_CHANGED,
    (state: MinutesRecordingState) => {
      if (previousAudio.status === 'idle' && state.status === 'recording') {
        emitRendererAutomationEvent({
          id: globalThis.crypto.randomUUID(),
          type: 'recording.started',
          occurredAt: new Date().toISOString(),
          data: {
            recordingId: `live:${state.conversationId}:${state.startedAt}`,
            conversationId: state.conversationId,
            mediaKind: 'audio',
          },
        });
      }
      previousAudio = state;
    }
  );

  let previousVideo: VideoRecordingState = videoRecordingService.getState();
  videoRecordingStateEvents.on(
    VIDEO_RECORDING_STATE_CHANGED,
    (state: VideoRecordingState) => {
      if (
        (previousVideo.status === 'idle' ||
          previousVideo.status === 'starting') &&
        state.status === 'recording'
      ) {
        emitRendererAutomationEvent({
          id: globalThis.crypto.randomUUID(),
          type: 'recording.started',
          occurredAt: new Date().toISOString(),
          data: {
            recordingId: `live:${state.conversationId}:${state.startedAt}`,
            conversationId: state.conversationId,
            mediaKind: 'screen-share-video',
          },
        });
      } else if (state.status === 'error') {
        const conversationId =
          'conversationId' in previousVideo
            ? previousVideo.conversationId
            : 'unknown';
        emitRendererAutomationEvent({
          id: globalThis.crypto.randomUUID(),
          type: 'recording.failed',
          occurredAt: new Date().toISOString(),
          data: {
            conversationId,
            mediaKind: 'screen-share-video',
            error: state.message,
          },
        });
      }
      previousVideo = state;
    }
  );

  let previousCall = window.reduxStore.getState().calling.activeCallState;
  window.reduxStore.subscribe(() => {
    const nextCall = window.reduxStore.getState().calling.activeCallState;
    if (
      nextCall?.state === 'Active' &&
      (previousCall == null ||
        previousCall.state !== 'Active' ||
        previousCall.conversationId !== nextCall.conversationId)
    ) {
      emitRendererAutomationEvent({
        id: globalThis.crypto.randomUUID(),
        type: 'call.started',
        occurredAt: new Date().toISOString(),
        data: {
          callId: nextCall.conversationId,
          conversationId: nextCall.conversationId,
          callMode: nextCall.callMode,
        },
      });
    } else if (previousCall?.state === 'Active' && nextCall == null) {
      emitRendererAutomationEvent({
        id: globalThis.crypto.randomUUID(),
        type: 'call.ended',
        occurredAt: new Date().toISOString(),
        data: {
          callId: previousCall.conversationId,
          conversationId: previousCall.conversationId,
          callMode: previousCall.callMode,
        },
      });
    }
    previousCall = nextCall;
  });

  ipcRenderer.send('minutes:automation-renderer-ready');
}
