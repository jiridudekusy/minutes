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
  it('registers only selected meeting tools and preserves resources', () => {
    const registry = createRegistry();

    registerMeetingMcpCapabilities(
      registry.server,
      {} as Parameters<typeof registerMeetingMcpCapabilities>[1],
      selected('get_recording')
    );

    assert.deepEqual(registry.tools, ['get_recording']);
    assert.sameMembers(registry.resources, [
      'recording',
      'recording-transcript',
      'recording-summary',
      'automation-job',
    ]);
  });

  it('registers only selected live tools and preserves resources', () => {
    const registry = createRegistry();

    registerLiveMcpCapabilities(
      registry.server,
      {} as RendererAutomationService,
      selected(
        'list_contacts',
        'find_groups_by_member',
        'remove_group_members',
        'send_message'
      )
    );

    assert.deepEqual(registry.tools, [
      'list_contacts',
      'send_message',
      'find_groups_by_member',
      'remove_group_members',
    ]);
    assert.sameMembers(registry.resources, ['conversation', 'contact']);
  });
});
