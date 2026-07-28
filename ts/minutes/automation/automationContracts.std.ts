// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export type AutomationConversation = Readonly<{
  id: string;
  title: string;
  type: 'direct' | 'group';
  serviceId?: string;
  e164?: string;
  unreadCount: number;
  activeAt?: number;
}>;

export type AutomationContact = Readonly<{
  id: string;
  title: string;
  serviceId?: string;
  e164?: string;
}>;

export type AutomationGroupMember = AutomationContact &
  Readonly<{
    role: 'admin' | 'member';
  }>;

export type AutomationGroup = Readonly<{
  id: string;
  title: string;
  description?: string;
  avatar?: boolean;
  left: boolean;
  terminated: boolean;
  archived: boolean;
  activeAt?: number;
  unreadCount: number;
  members: ReadonlyArray<AutomationGroupMember>;
  pendingMembers: ReadonlyArray<AutomationContact>;
  pendingAdminApprovalMembers: ReadonlyArray<AutomationContact>;
  permissions: Readonly<{
    editDetails: 'members' | 'admins';
    addMembers: 'members' | 'admins';
    inviteLink: 'disabled' | 'open' | 'admin_approval';
    announcementsOnly: boolean;
  }>;
  disappearingMessagesSeconds: number;
}>;

export type AutomationGroupSearchResult = Readonly<{
  group: AutomationConversation;
  matchedMembers: ReadonlyArray<AutomationContact>;
}>;

export type AutomationReaction = Readonly<{
  emoji: string;
  authorId: string;
  authorName: string | null;
  timestamp: number;
}>;

export type AutomationMessage = Readonly<{
  id: string;
  conversationId: string;
  source: 'incoming' | 'outgoing';
  sentAt: number;
  receivedAt?: number;
  text: string | null;
  attachments: ReadonlyArray<{
    id: string;
    contentType?: string;
    fileName?: string;
    size?: number;
  }>;
  reactions: ReadonlyArray<AutomationReaction>;
}>;

export type AutomationActiveCall = Readonly<{
  callId: string;
  conversationId: string;
  callMode: string;
  state: string;
  hasLocalAudio: boolean;
  hasLocalVideo: boolean;
}>;

export type AutomationRendererMethod =
  | 'listConversations'
  | 'getConversation'
  | 'listContacts'
  | 'getContact'
  | 'getGroup'
  | 'findGroupsByMember'
  | 'createGroup'
  | 'updateGroupMetadata'
  | 'addGroupMembers'
  | 'removeGroupMembers'
  | 'setGroupMemberRoles'
  | 'setGroupPermissions'
  | 'setGroupDisappearingMessages'
  | 'leaveGroup'
  | 'getMessages'
  | 'searchMessages'
  | 'sendMessage'
  | 'setMessageReaction'
  | 'getActiveCall'
  | 'startCall'
  | 'hangUpCall'
  | 'startAudioRecording'
  | 'startVideoRecording'
  | 'pauseRecording'
  | 'resumeRecording'
  | 'stopRecording';

export type AutomationRendererRequest = Readonly<{
  id: string;
  method: AutomationRendererMethod;
  params: unknown;
}>;

export type AutomationRendererResponse =
  | Readonly<{ id: string; ok: true; result: unknown }>
  | Readonly<{
      id: string;
      ok: false;
      error: Readonly<{ code: string; message: string }>;
    }>;

export type AutomationRendererEventEnvelope = Readonly<{
  type: 'automation-event';
  event: unknown;
}>;
