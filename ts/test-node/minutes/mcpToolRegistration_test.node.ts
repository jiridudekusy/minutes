// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerLiveMcpCapabilities } from '../../minutes/automation/liveMcpCapabilities.node.ts';
import { registerMeetingMcpCapabilities } from '../../minutes/automation/meetingMcpCapabilities.node.ts';
import type { RendererAutomationService } from '../../minutes/automation/rendererAutomationService.std.ts';
import type { AutomationToolName } from '../../minutes/automation/toolCatalog.std.ts';

function createRegistry(): {
  server: McpServer;
  tools: Array<string>;
  resources: Array<string>;
} {
  const tools = new Array<string>();
  const resources = new Array<string>();
  const server = {
    registerTool: (name: string) => {
      tools.push(name);
    },
    registerResource: (name: string) => {
      resources.push(name);
    },
  } as unknown as McpServer;
  return { server, tools, resources };
}

function selected(...names: ReadonlyArray<AutomationToolName>) {
  return new Set(names);
}

describe('MCP tool registration controls', () => {
  it('registers only selected meeting tools and their corresponding resources', () => {
    const registry = createRegistry();

    registerMeetingMcpCapabilities(
      registry.server,
      {} as Parameters<typeof registerMeetingMcpCapabilities>[1],
      selected('get_recording')
    );

    assert.deepEqual(registry.tools, ['get_recording']);
    assert.deepEqual(registry.resources, ['recording']);
  });

  it('registers only selected live tools and their corresponding resources', () => {
    const registry = createRegistry();

    registerLiveMcpCapabilities(
      registry.server,
      {} as RendererAutomationService,
      selected(
        'list_contacts',
        'get_attachment_directories',
        'download_attachment',
        'find_groups_by_member',
        'remove_group_members',
        'send_message'
      )
    );

    assert.deepEqual(registry.tools, [
      'list_contacts',
      'get_attachment_directories',
      'download_attachment',
      'send_message',
      'find_groups_by_member',
      'remove_group_members',
    ]);
    assert.deepEqual(registry.resources, ['contact']);
  });

  it('does not expose resources after all corresponding tools are disabled', () => {
    const registry = createRegistry();

    registerMeetingMcpCapabilities(
      registry.server,
      {} as Parameters<typeof registerMeetingMcpCapabilities>[1],
      selected()
    );
    registerLiveMcpCapabilities(
      registry.server,
      {} as RendererAutomationService,
      selected()
    );

    assert.deepEqual(registry.tools, []);
    assert.deepEqual(registry.resources, []);
  });

  it('exposes only the artifact and job resources needed by processing tools', () => {
    const transcriptRegistry = createRegistry();
    registerMeetingMcpCapabilities(
      transcriptRegistry.server,
      {} as Parameters<typeof registerMeetingMcpCapabilities>[1],
      selected('transcribe_recording')
    );
    assert.deepEqual(transcriptRegistry.resources, [
      'recording-transcript',
      'automation-job',
    ]);

    const summaryRegistry = createRegistry();
    registerMeetingMcpCapabilities(
      summaryRegistry.server,
      {} as Parameters<typeof registerMeetingMcpCapabilities>[1],
      selected('summarize_recording')
    );
    assert.deepEqual(summaryRegistry.resources, [
      'recording-summary',
      'automation-job',
    ]);
  });
});
