// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';

import type { AutomationJob } from './jobRegistry.std.ts';
import type {
  AutomationRecording,
  AutomationTextResource,
} from './meetingAutomationService.node.ts';
import type { AutomationPage } from './pagination.std.ts';
import {
  ALL_AUTOMATION_TOOL_NAMES,
  type AutomationToolName,
} from './toolCatalog.std.ts';

type MeetingAutomationApi = Readonly<{
  listRecordings: (options: {
    cursor?: string;
    limit?: number;
  }) => Promise<AutomationPage<AutomationRecording>>;
  searchRecordings: (options: {
    query: string;
    cursor?: string;
    limit?: number;
  }) => Promise<AutomationPage<AutomationRecording>>;
  getRecording: (id: string) => Promise<AutomationRecording>;
  readTranscript: (id: string) => Promise<AutomationTextResource>;
  readSummary: (id: string) => Promise<AutomationTextResource>;
  transcribeRecording: (id: string) => Promise<AutomationJob>;
  summarizeRecording: (id: string) => Promise<AutomationJob>;
  getJob: (id: string) => AutomationJob | undefined;
}>;

const paginationSchema = {
  cursor: z.string().optional().describe('Opaque continuation cursor'),
  limit: z.number().int().min(1).max(100).optional(),
};

function jsonToolResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  };
}

function variableAsString(
  value: string | ReadonlyArray<string> | undefined,
  name: string
): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid resource variable: ${name}`);
  }
  return value;
}

export function registerMeetingMcpCapabilities(
  server: McpServer,
  meetings: MeetingAutomationApi,
  enabledTools: ReadonlySet<AutomationToolName> = new Set(
    ALL_AUTOMATION_TOOL_NAMES
  )
): void {
  if (enabledTools.has('list_recordings')) {
    server.registerTool(
      'list_recordings',
      {
        title: 'List Minutes recordings',
        description:
          'Lists call recordings with opaque IDs and artifact status.',
        inputSchema: paginationSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async options => jsonToolResult(await meetings.listRecordings(options))
    );
  }

  if (enabledTools.has('search_recordings')) {
    server.registerTool(
      'search_recordings',
      {
        title: 'Search Minutes recordings',
        description: 'Searches recordings by conversation title or identifier.',
        inputSchema: {
          query: z.string().min(1),
          ...paginationSchema,
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async options => jsonToolResult(await meetings.searchRecordings(options))
    );
  }

  if (enabledTools.has('get_recording')) {
    server.registerTool(
      'get_recording',
      {
        title: 'Get a Minutes recording',
        description: 'Returns metadata for one recording catalog ID.',
        inputSchema: { recordingId: z.string().min(1) },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async ({ recordingId }) =>
        jsonToolResult(await meetings.getRecording(recordingId))
    );
  }

  if (enabledTools.has('transcribe_recording')) {
    server.registerTool(
      'transcribe_recording',
      {
        title: 'Transcribe a Minutes recording',
        description: 'Queues transcription and immediately returns a job ID.',
        inputSchema: { recordingId: z.string().min(1) },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async ({ recordingId }) =>
        jsonToolResult(await meetings.transcribeRecording(recordingId))
    );
  }

  if (enabledTools.has('summarize_recording')) {
    server.registerTool(
      'summarize_recording',
      {
        title: 'Summarize a Minutes recording',
        description:
          'Queues AI summarization and immediately returns a job ID.',
        inputSchema: { recordingId: z.string().min(1) },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async ({ recordingId }) =>
        jsonToolResult(await meetings.summarizeRecording(recordingId))
    );
  }

  if (enabledTools.has('get_recording')) {
    server.registerResource(
      'recording',
      new ResourceTemplate('minutes://recordings/{id}', { list: undefined }),
      {
        title: 'Minutes recording metadata',
        mimeType: 'application/json',
      },
      async (uri, variables) => {
        const id = variableAsString(variables.id, 'id');
        const recording = await meetings.getRecording(id);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(recording),
            },
          ],
        };
      }
    );
  }

  if (enabledTools.has('transcribe_recording')) {
    server.registerResource(
      'recording-transcript',
      new ResourceTemplate('minutes://recordings/{id}/transcript', {
        list: undefined,
      }),
      {
        title: 'Minutes recording transcript',
        mimeType: 'text/markdown',
      },
      async (_uri, variables) => {
        const resource = await meetings.readTranscript(
          variableAsString(variables.id, 'id')
        );
        return { contents: [resource] };
      }
    );
  }

  if (enabledTools.has('summarize_recording')) {
    server.registerResource(
      'recording-summary',
      new ResourceTemplate('minutes://recordings/{id}/summary', {
        list: undefined,
      }),
      {
        title: 'Minutes recording summary',
        mimeType: 'text/markdown',
      },
      async (_uri, variables) => {
        const resource = await meetings.readSummary(
          variableAsString(variables.id, 'id')
        );
        return { contents: [resource] };
      }
    );
  }

  if (
    enabledTools.has('transcribe_recording') ||
    enabledTools.has('summarize_recording')
  ) {
    server.registerResource(
      'automation-job',
      new ResourceTemplate('minutes://jobs/{id}', { list: undefined }),
      {
        title: 'Minutes automation job',
        mimeType: 'application/json',
      },
      async (uri, variables) => {
        const id = variableAsString(variables.id, 'id');
        const job = meetings.getJob(id);
        if (job == null) {
          throw new Error('Automation job not found');
        }
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(job),
            },
          ],
        };
      }
    );
  }
}
