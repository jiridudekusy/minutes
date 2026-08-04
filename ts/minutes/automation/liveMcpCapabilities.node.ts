// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';

import type { RendererAutomationService } from './rendererAutomationService.std.ts';
import {
  ALL_AUTOMATION_TOOL_NAMES,
  type AutomationToolName,
} from './toolCatalog.std.ts';

const paginationSchema = {
  cursor: z.string().optional().describe('Opaque continuation cursor'),
  limit: z.number().int().min(1).max(100).optional(),
};

const memberIdsSchema = z.array(z.string().min(1)).min(1).max(1_000);
const groupRoleSchema = z.enum(['admin', 'member']);
const groupAccessSchema = z.enum(['members', 'admins']);
const inviteLinkSchema = z.enum(['disabled', 'open', 'admin_approval']);

function jsonResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  };
}

function uriVariable(
  value: string | ReadonlyArray<string> | undefined,
  name: string
): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid resource variable: ${name}`);
  }
  return value;
}

export function registerLiveMcpCapabilities(
  server: McpServer,
  live: RendererAutomationService,
  enabledTools: ReadonlySet<AutomationToolName> = new Set(
    ALL_AUTOMATION_TOOL_NAMES
  )
): void {
  if (enabledTools.has('list_conversations')) {
    server.registerTool(
      'list_conversations',
      {
        description: 'Lists Signal conversations.',
        inputSchema: {
          query: z.string().optional(),
          ...paginationSchema,
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async input => jsonResult(await live.listConversations(input))
    );
  }
  if (enabledTools.has('list_contacts')) {
    server.registerTool(
      'list_contacts',
      {
        description: 'Lists Signal contacts.',
        inputSchema: {
          query: z.string().optional(),
          ...paginationSchema,
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async input => jsonResult(await live.listContacts(input))
    );
  }
  if (enabledTools.has('get_messages')) {
    server.registerTool(
      'get_messages',
      {
        description: 'Returns messages from one Signal conversation.',
        inputSchema: {
          conversationId: z.string().min(1),
          ...paginationSchema,
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async input => jsonResult(await live.getMessages(input))
    );
  }
  if (enabledTools.has('search_messages')) {
    server.registerTool(
      'search_messages',
      {
        description: 'Searches Signal messages.',
        inputSchema: {
          query: z.string().min(1),
          conversationId: z.string().optional(),
          ...paginationSchema,
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async input => jsonResult(await live.searchMessages(input))
    );
  }
  if (enabledTools.has('send_message')) {
    server.registerTool(
      'send_message',
      {
        description:
          'Sends a text message to a Signal conversation. Supply a stable idempotencyKey and reuse it for retries to prevent duplicate delivery.',
        inputSchema: {
          conversationId: z.string().min(1),
          text: z.string().min(1).max(65_536),
          idempotencyKey: z.string().min(1).max(256).optional(),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: true,
        },
      },
      async input => jsonResult(await live.sendMessage(input))
    );
  }
  if (enabledTools.has('set_message_reaction')) {
    server.registerTool(
      'set_message_reaction',
      {
        description:
          'Adds or replaces the local Signal reaction to a message. Pass emoji=null to remove it.',
        inputSchema: {
          messageId: z.string().min(1),
          emoji: z.union([z.string().min(1), z.null()]),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          openWorldHint: true,
        },
      },
      async input => jsonResult(await live.setMessageReaction(input))
    );
  }
  if (enabledTools.has('get_group')) {
    server.registerTool(
      'get_group',
      {
        description:
          'Returns Signal Group V2 details, termination state, members, roles, and settings.',
        inputSchema: { groupId: z.string().min(1) },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async input => jsonResult(await live.getGroup(input.groupId))
    );
  }
  if (enabledTools.has('find_groups_by_member')) {
    server.registerTool(
      'find_groups_by_member',
      {
        description:
          'Finds current Signal groups containing an exact or fuzzy-matched member.',
        inputSchema: {
          contactId: z.string().min(1).optional(),
          query: z.string().min(1).optional(),
          ...paginationSchema,
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async input => jsonResult(await live.findGroupsByMember(input))
    );
  }
  if (enabledTools.has('create_group')) {
    server.registerTool(
      'create_group',
      {
        description: 'Creates a Signal Group V2 group using exact member IDs.',
        inputSchema: {
          title: z.string().min(1),
          memberIds: memberIdsSchema,
          avatarPath: z
            .string()
            .min(1)
            .describe(
              'Absolute path to a regular image file in the Signal user-data minutes/automation-group-avatars directory; symbolic links are rejected.'
            )
            .optional(),
          disappearingMessagesSeconds: z.number().int().min(0).optional(),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: true,
        },
      },
      async input => jsonResult(await live.createGroup(input))
    );
  }
  if (enabledTools.has('update_group_metadata')) {
    server.registerTool(
      'update_group_metadata',
      {
        description: 'Updates Signal group title, description, or avatar.',
        inputSchema: {
          groupId: z.string().min(1),
          title: z.string().min(1).optional(),
          description: z.string().optional(),
          avatarPath: z
            .union([z.string().min(1), z.null()])
            .describe(
              'Absolute path to a regular image file in the Signal user-data minutes/automation-group-avatars directory, or null to remove the avatar; symbolic links are rejected.'
            )
            .optional(),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: true,
        },
      },
      async input => jsonResult(await live.updateGroupMetadata(input))
    );
  }
  for (const [name, description, operation, destructiveHint] of [
    [
      'add_group_members',
      'Adds exact member IDs to a Signal group.',
      (input: { groupId: string; memberIds: ReadonlyArray<string> }) =>
        live.addGroupMembers(input),
      false,
    ],
    [
      'remove_group_members',
      'Removes exact member IDs from a Signal group.',
      (input: { groupId: string; memberIds: ReadonlyArray<string> }) =>
        live.removeGroupMembers(input),
      true,
    ],
  ] as const) {
    if (!enabledTools.has(name)) {
      continue;
    }
    server.registerTool(
      name,
      {
        description,
        inputSchema: {
          groupId: z.string().min(1),
          memberIds: memberIdsSchema,
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint,
          openWorldHint: true,
        },
      },
      async input => jsonResult(await operation(input))
    );
  }
  if (enabledTools.has('set_group_member_roles')) {
    server.registerTool(
      'set_group_member_roles',
      {
        description:
          'Sets exact Signal group members to admin or member roles.',
        inputSchema: {
          groupId: z.string().min(1),
          roles: z
            .array(
              z.object({
                memberId: z.string().min(1),
                role: groupRoleSchema,
              })
            )
            .min(1)
            .max(1_000),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: true,
        },
      },
      async input => jsonResult(await live.setGroupMemberRoles(input))
    );
  }
  if (enabledTools.has('set_group_permissions')) {
    server.registerTool(
      'set_group_permissions',
      {
        description: 'Updates Signal Group V2 permissions and messaging mode.',
        inputSchema: {
          groupId: z.string().min(1),
          editDetails: groupAccessSchema.optional(),
          addMembers: groupAccessSchema.optional(),
          inviteLink: inviteLinkSchema.optional(),
          announcementsOnly: z.boolean().optional(),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: true,
        },
      },
      async input => jsonResult(await live.setGroupPermissions(input))
    );
  }
  if (enabledTools.has('set_group_disappearing_messages')) {
    server.registerTool(
      'set_group_disappearing_messages',
      {
        description:
          'Sets a Signal group disappearing-message duration in seconds; zero disables it.',
        inputSchema: {
          groupId: z.string().min(1),
          seconds: z.number().int().min(0),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: true,
        },
      },
      async input => jsonResult(await live.setGroupDisappearingMessages(input))
    );
  }
  if (enabledTools.has('leave_group')) {
    server.registerTool(
      'leave_group',
      {
        description: 'Leaves a Signal Group V2 group.',
        inputSchema: { groupId: z.string().min(1) },
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          openWorldHint: true,
        },
      },
      async input => jsonResult(await live.leaveGroup(input.groupId))
    );
  }
  if (enabledTools.has('get_active_call')) {
    server.registerTool(
      'get_active_call',
      {
        description: 'Returns the current Signal call, if any.',
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => jsonResult(await live.getActiveCall())
    );
  }
  if (enabledTools.has('start_call')) {
    server.registerTool(
      'start_call',
      {
        description: 'Starts an outgoing Signal call.',
        inputSchema: {
          conversationId: z.string().min(1),
          withVideo: z.boolean().default(false),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: true,
        },
      },
      async input => jsonResult(await live.startCall(input))
    );
  }
  if (enabledTools.has('hang_up_call')) {
    server.registerTool(
      'hang_up_call',
      {
        description: 'Ends the active Signal call.',
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          openWorldHint: true,
        },
      },
      async () => jsonResult(await live.hangUpCall())
    );
  }

  for (const [name, description, operation] of [
    [
      'start_audio_recording',
      'Starts outgoing and incoming call audio recording.',
      () => live.startAudioRecording(),
    ],
    [
      'start_video_recording',
      'Starts shared-video stream recording with call audio.',
      () => live.startVideoRecording(),
    ],
    [
      'pause_recording',
      'Pauses the active Minutes recording.',
      () => live.pauseRecording(),
    ],
    [
      'resume_recording',
      'Resumes the active Minutes recording.',
      () => live.resumeRecording(),
    ],
    [
      'stop_recording',
      'Stops and saves the active Minutes recording.',
      () => live.stopRecording(),
    ],
  ] as const) {
    if (!enabledTools.has(name)) {
      continue;
    }
    server.registerTool(
      name,
      {
        description,
        annotations: {
          readOnlyHint: false,
          destructiveHint: name === 'stop_recording',
          openWorldHint: false,
        },
      },
      async () => jsonResult(await operation())
    );
  }

  if (enabledTools.has('list_conversations')) {
    server.registerResource(
      'conversation',
      new ResourceTemplate('minutes://conversations/{id}', {
        list: undefined,
      }),
      { mimeType: 'application/json' },
      async (uri, variables) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              await live.getConversation(uriVariable(variables.id, 'id'))
            ),
          },
        ],
      })
    );
  }
  if (enabledTools.has('list_contacts')) {
    server.registerResource(
      'contact',
      new ResourceTemplate('minutes://contacts/{id}', { list: undefined }),
      { mimeType: 'application/json' },
      async (uri, variables) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              await live.getContact(uriVariable(variables.id, 'id'))
            ),
          },
        ],
      })
    );
  }
}
