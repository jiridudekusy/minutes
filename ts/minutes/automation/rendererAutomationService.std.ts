// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  AutomationActiveCall,
  AutomationContact,
  AutomationConversation,
  AutomationGroup,
  AutomationGroupSearchResult,
  AutomationMessage,
} from './automationContracts.std.ts';
import type { AutomationRendererBridge } from './automationRendererBridge.node.ts';
import type { AutomationPage } from './pagination.std.ts';

export class RendererAutomationService {
  readonly bridge: AutomationRendererBridge;

  constructor(bridge: AutomationRendererBridge) {
    this.bridge = bridge;
  }

  listConversations(options: {
    query?: string;
    cursor?: string;
    limit?: number;
  }): Promise<AutomationPage<AutomationConversation>> {
    return this.bridge.request('listConversations', options) as Promise<
      AutomationPage<AutomationConversation>
    >;
  }

  getConversation(conversationId: string): Promise<AutomationConversation> {
    return this.bridge.request('getConversation', {
      conversationId,
    }) as Promise<AutomationConversation>;
  }

  listContacts(options: {
    query?: string;
    cursor?: string;
    limit?: number;
  }): Promise<AutomationPage<AutomationContact>> {
    return this.bridge.request('listContacts', options) as Promise<
      AutomationPage<AutomationContact>
    >;
  }

  getContact(contactId: string): Promise<AutomationContact> {
    return this.bridge.request('getContact', {
      contactId,
    }) as Promise<AutomationContact>;
  }

  getGroup(groupId: string): Promise<AutomationGroup> {
    return this.bridge.request('getGroup', {
      groupId,
    }) as Promise<AutomationGroup>;
  }

  findGroupsByMember(options: {
    contactId?: string;
    query?: string;
    cursor?: string;
    limit?: number;
  }): Promise<AutomationPage<AutomationGroupSearchResult>> {
    return this.bridge.request('findGroupsByMember', options) as Promise<
      AutomationPage<AutomationGroupSearchResult>
    >;
  }

  createGroup(options: {
    title: string;
    memberIds: ReadonlyArray<string>;
    avatarPath?: string;
    disappearingMessagesSeconds?: number;
  }): Promise<AutomationGroup> {
    return this.bridge.request(
      'createGroup',
      options
    ) as Promise<AutomationGroup>;
  }

  updateGroupMetadata(options: {
    groupId: string;
    title?: string;
    description?: string;
    avatarPath?: string | null;
  }): Promise<AutomationGroup> {
    return this.bridge.request(
      'updateGroupMetadata',
      options
    ) as Promise<AutomationGroup>;
  }

  addGroupMembers(options: {
    groupId: string;
    memberIds: ReadonlyArray<string>;
  }): Promise<AutomationGroup> {
    return this.bridge.request(
      'addGroupMembers',
      options
    ) as Promise<AutomationGroup>;
  }

  removeGroupMembers(options: {
    groupId: string;
    memberIds: ReadonlyArray<string>;
  }): Promise<AutomationGroup> {
    return this.bridge.request(
      'removeGroupMembers',
      options
    ) as Promise<AutomationGroup>;
  }

  setGroupMemberRoles(options: {
    groupId: string;
    roles: ReadonlyArray<
      Readonly<{ memberId: string; role: 'admin' | 'member' }>
    >;
  }): Promise<AutomationGroup> {
    return this.bridge.request(
      'setGroupMemberRoles',
      options
    ) as Promise<AutomationGroup>;
  }

  setGroupPermissions(options: {
    groupId: string;
    editDetails?: 'members' | 'admins';
    addMembers?: 'members' | 'admins';
    inviteLink?: 'disabled' | 'open' | 'admin_approval';
    announcementsOnly?: boolean;
  }): Promise<AutomationGroup> {
    return this.bridge.request(
      'setGroupPermissions',
      options
    ) as Promise<AutomationGroup>;
  }

  setGroupDisappearingMessages(options: {
    groupId: string;
    seconds: number;
  }): Promise<AutomationGroup> {
    return this.bridge.request(
      'setGroupDisappearingMessages',
      options
    ) as Promise<AutomationGroup>;
  }

  leaveGroup(groupId: string): Promise<AutomationGroup> {
    return this.bridge.request('leaveGroup', {
      groupId,
    }) as Promise<AutomationGroup>;
  }

  getMessages(options: {
    conversationId: string;
    cursor?: string;
    limit?: number;
  }): Promise<AutomationPage<AutomationMessage>> {
    return this.bridge.request('getMessages', options) as Promise<
      AutomationPage<AutomationMessage>
    >;
  }

  searchMessages(options: {
    query: string;
    conversationId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<AutomationPage<AutomationMessage>> {
    return this.bridge.request('searchMessages', options) as Promise<
      AutomationPage<AutomationMessage>
    >;
  }

  sendMessage(options: {
    conversationId: string;
    text: string;
  }): Promise<unknown> {
    return this.bridge.request('sendMessage', options);
  }

  setMessageReaction(options: {
    messageId: string;
    emoji: string | null;
  }): Promise<unknown> {
    return this.bridge.request('setMessageReaction', options);
  }

  getActiveCall(): Promise<{ call: AutomationActiveCall | null }> {
    return this.bridge.request('getActiveCall', {}) as Promise<{
      call: AutomationActiveCall | null;
    }>;
  }

  startCall(options: {
    conversationId: string;
    withVideo: boolean;
  }): Promise<unknown> {
    return this.bridge.request('startCall', options);
  }

  hangUpCall(): Promise<unknown> {
    return this.bridge.request('hangUpCall', {});
  }

  startAudioRecording(): Promise<unknown> {
    return this.bridge.request('startAudioRecording', {});
  }

  startVideoRecording(): Promise<unknown> {
    return this.bridge.request('startVideoRecording', {});
  }

  pauseRecording(): Promise<unknown> {
    return this.bridge.request('pauseRecording', {});
  }

  resumeRecording(): Promise<unknown> {
    return this.bridge.request('resumeRecording', {});
  }

  stopRecording(): Promise<unknown> {
    return this.bridge.request('stopRecording', {});
  }
}
