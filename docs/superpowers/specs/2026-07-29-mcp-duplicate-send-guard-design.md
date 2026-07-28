# MCP duplicate-send guard

## Problem

`initializeMinutes()` can run repeatedly during one renderer lifetime. Every
run currently registers another `minutes:automation-request` IPC listener and
another set of recording and call subscriptions. A single MCP `send_message`
request is therefore handled once per accumulated listener and creates many
independent Signal send jobs.

The production log demonstrated the exact relationship: 61 Minutes
initializations produced 61 sends to each affected recipient.

## Design

Minutes initialization and the automation renderer initialization become
idempotent within one renderer module lifetime. Repeated calls return without
registering listeners or subscriptions again.

Automation handlers also share the promise for an in-flight renderer request
ID. Concurrent listeners receiving one request therefore invoke its capability
once and reuse the same response. The entry is removed as soon as the request
settles, so memory is bounded by current concurrency and separate intentional
MCP calls remain separate operations.

## Testing

- Calling a one-time initializer repeatedly executes its body once.
- Repeating one renderer request ID invokes the capability once.
- Different request IDs remain independent.
- Existing automation renderer and MCP tests remain green.
