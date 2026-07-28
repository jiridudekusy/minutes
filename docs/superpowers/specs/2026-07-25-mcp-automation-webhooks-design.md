# Minutes MCP Automation and Webhooks

## Goal

Minutes will expose its meeting artifacts and selected Signal capabilities to
local automation clients through an embedded Model Context Protocol (MCP)
server. The same domain layer will publish outbound webhooks when calls,
recordings, transcripts, summaries, and messages change.

The design keeps all Signal state access inside the running Minutes
application. Neither MCP nor webhook code opens the Signal database directly.

## Scope

The target capability set is:

- read recordings, transcripts, summaries, conversations, contacts, and
  messages;
- inspect active calls;
- start, pause, resume, and stop audio or video recording;
- request transcription and summarization;
- send messages;
- start and hang up calls;
- publish outbound call, recording, transcription, summary, and message events.

The capability set will be delivered incrementally on top of one stable
automation architecture. Interactive confirmation of mutating operations is
explicitly deferred. The initial design still keeps authorization scopes in the
domain model so confirmation or finer client policies can be added later
without changing tool contracts.

## Runtime Boundary

The MCP server is embedded in the Electron main process and exists only while
Minutes is running. It uses MCP Streamable HTTP on:

```text
http://127.0.0.1:<configured-port>/mcp
```

The server:

- binds only to `127.0.0.1`;
- uses a stable, user-configured port, initially prefilled with `37221`;
- never falls back to a random port;
- exposes only `/mcp` and a minimal `/health` diagnostic endpoint;
- starts only after the Minutes database and automation services are ready;
- stops with the application and closes active MCP sessions;
- reports a visible error when the configured port is unavailable.

HTTP+SSE compatibility transport and externally reachable interfaces are not
part of the initial scope.

## User Configuration

MCP is disabled after installation. The Minutes settings UI provides:

- an explicit `Enable MCP server` toggle;
- the configured port;
- current state: `Running`, `Stopped`, or `Port unavailable`;
- the effective MCP URL;
- token creation and regeneration.

Enabling MCP creates a cryptographically random 256-bit bearer token. The
plaintext token is shown exactly once. Minutes stores only its SHA-256 hash in
the macOS Keychain and compares presented tokens in constant time. A lost token
cannot be recovered; the user must regenerate it, invalidating the old token.

OAuth and per-invocation confirmation are outside the first version. The first
version therefore uses a local custom bearer-token profile and does not claim
MCP OAuth conformance.

## Architecture

MCP and webhooks are adapters over a shared domain API:

```text
MCP Streamable HTTP ─┐
                     ├─ MinutesAutomationService ── main-process capabilities
Webhook dispatcher ──┘            │
                                  └─ typed IPC ── Signal renderer capabilities
```

### `McpHttpServer`

Owns the HTTP listener, MCP protocol sessions, authentication, protocol version
negotiation, request limits, and MCP error translation. It contains no Signal
or meeting business logic.

### `MinutesAutomationService`

Is the transport-independent facade for all automation capabilities. It routes
commands and queries to capability modules and is the only application API used
by MCP tools, MCP resources, and webhook event producers.

Capabilities are grouped into focused modules:

- `meetings`
- `messages`
- `contacts`
- `calls`
- `recording`
- `jobs`

Each module owns its input and output schemas and exposes typed operations. The
facade can enforce client scopes later without changing the modules.

### Main-process capability adapters

Existing Minutes main-process services remain authoritative for:

- recording catalog and artifact paths;
- transcript and summary files;
- transcription and summary jobs;
- AI settings and providers;
- webhook configuration and delivery state.

Existing logic is extracted behind reusable service functions where necessary;
MCP handlers must not call Electron IPC handlers as if they were an internal
API.

### `AutomationRendererBridge`

Live Signal state and actions remain in the renderer/preload process. A narrow,
typed request-response bridge carries automation requests between the main
process and the initialized Minutes renderer.

The bridge handles:

- conversation, message, and contact queries;
- active call state;
- sending a message;
- starting or ending a call;
- controlling live recording services;
- renderer-originated call and message events.

Every request has a unique ID, a bounded timeout, schema validation on both
sides, and a structured error response. A renderer reload rejects outstanding
requests. The bridge never exposes Redux, models, or arbitrary method
invocation to the main process.

### `AutomationEventBus`

Normalizes domain events from main-process services and the renderer bridge.
MCP notifications and webhook delivery consume the same event objects.

Events are emitted only after the underlying state change has succeeded. The
event bus is in-memory; webhook durability begins in the outbox.

## MCP Public Surface

### Resources

Canonical read-only artifacts use resource templates:

- `minutes://recordings/{id}`
- `minutes://recordings/{id}/transcript`
- `minutes://recordings/{id}/summary`
- `minutes://conversations/{id}`
- `minutes://contacts/{id}`
- `minutes://jobs/{id}`

Recording resources return metadata, MIME type, size, and local absolute file
path. Audio and video are not embedded as base64 MCP content. Transcript and
summary resources return their text content.

### Tools

Initial tool families are:

- `list_recordings`
- `search_recordings`
- `get_recording`
- `list_conversations`
- `search_messages`
- `get_messages`
- `list_contacts`
- `get_active_call`
- `start_audio_recording`
- `start_video_recording`
- `pause_recording`
- `resume_recording`
- `stop_recording`
- `transcribe_recording`
- `summarize_recording`
- `send_message`
- `start_call`
- `hang_up_call`

Read operations that need filters, pagination, or search are tools even when
their results point to canonical resources.

Prompts are excluded from the first version because Minutes does not yet have a
prompt workflow that adds value beyond tools and resources.

### Long-running jobs

Transcription and summarization tools return a `jobId` immediately. Jobs use:

- `queued`
- `running`
- `completed`
- `failed`

The result and current state are readable from `minutes://jobs/{id}`. When a
client provides an MCP progress token, Minutes also sends progress
notifications. Disconnecting the initiating MCP session does not cancel the
job.

The job registry has bounded concurrency and retention. Existing Minutes
transcription queue behavior remains authoritative.

## Pagination and Content Limits

Conversations, messages, contacts, and recordings use opaque cursor-based
pagination. Each operation has a conservative default and a fixed maximum page
size.

Search results and message bodies have explicit response-size limits. A
truncated result reports that it is incomplete and supplies a continuation
cursor where applicable. MCP requests also have a fixed maximum HTTP body size.

All inputs and outputs are validated with shared Zod schemas at capability and
transport boundaries.

## Webhook Configuration

Minutes supports multiple webhook endpoints. Each endpoint has:

- an HTTP URL;
- enabled/disabled state;
- subscribed event types;
- an independent HMAC secret;
- last successful delivery time;
- last delivery error.

Only `https://` endpoints and HTTP endpoints on numeric or named loopback
addresses are accepted. Redirects are not followed. The settings UI can send a
test event.

Webhook HMAC secrets must remain available for signing, so unlike the MCP
bearer token they are stored as secrets in the Keychain rather than as hashes.

## Webhook Events

The initial event set is:

- `call.started`
- `call.ended`
- `recording.started`
- `recording.completed`
- `recording.failed`
- `transcript.completed`
- `summary.completed`
- `message.received`
- `message.sent`

Every delivery has:

```json
{
  "id": "delivery-id",
  "type": "recording.completed",
  "occurredAt": "2026-07-25T10:00:00.000Z",
  "data": {
    "recordingId": "recording-id",
    "conversationId": "conversation-id",
    "mediaKind": "screen-share-video"
  }
}
```

Message events include a `text` field by default. It contains the complete text
for textual messages and `null` for messages without text. They include
attachment metadata and internal attachment IDs but never attachment bytes.

Transcript and summary completion events include only IDs and metadata. The
consumer retrieves their full content through MCP resources. Audio and video
recordings are never embedded in webhook payloads.

The delivery request includes:

- `X-Minutes-Event`
- `X-Minutes-Delivery`
- `X-Minutes-Signature`

`X-Minutes-Signature` contains an HMAC-SHA-256 signature over the exact request
body. A `2xx` response completes delivery.

## Webhook Durability

`WebhookDispatcher` persists deliveries before sending them. The outbox is
separate from the Signal database and contains:

- stable delivery ID;
- endpoint ID;
- event payload;
- attempt count;
- next-attempt time;
- last error.

Retries reuse the same delivery ID and apply bounded exponential backoff. Retry
processing resumes after Minutes restarts. The outbox has age and item-count
limits and reports dropped deliveries in diagnostics.

Because message deliveries can contain text, persisted outbox payloads are
encrypted at rest with a per-installation key stored in the Keychain. Logs and
diagnostic summaries expose delivery metadata but never the payload.

Webhook failures never block or roll back calls, messages, recordings,
transcripts, or summaries.

## Security

The Streamable HTTP adapter:

- validates bearer authentication before MCP dispatch;
- accepts a missing `Origin` header from native MCP clients and rejects any
  present origin that is not explicitly valid for the loopback server;
- validates the `Host` header against loopback and the configured port;
- binds only to the numeric loopback address;
- applies request-body and response-size limits;
- generates cryptographically random MCP session and job IDs;
- never logs bearer tokens, webhook secrets, message text, transcripts, or
  summaries.

Tool inputs cannot contain arbitrary database queries, Redux actions, file
paths, or method names. File-backed operations accept catalog IDs and resolve
paths inside Minutes-owned directories.

Interactive approval and fine-grained scopes are deferred, but the
transport-independent facade carries an authorization context so they can be
added later.

## Error Handling

Domain errors have stable codes such as:

- `NOT_READY`
- `NOT_FOUND`
- `INVALID_STATE`
- `PORT_UNAVAILABLE`
- `UNAUTHORIZED`
- `RENDERER_UNAVAILABLE`
- `TIMEOUT`
- `LIMIT_EXCEEDED`
- `INTERNAL_ERROR`

MCP adapters translate these to structured tool or protocol errors without
exposing stack traces or sensitive paths. Renderer crashes, client disconnects,
invalid webhook responses, and failures in one capability must not terminate
Minutes or other MCP sessions.

## Delivery Phases

### Phase 1: automation foundation and meeting artifacts

- settings, lifecycle, authentication, and health state;
- Streamable HTTP MCP transport;
- domain facade and capability registry;
- recordings, transcripts, summaries, and jobs;
- webhook event bus, endpoint configuration, signing, and durable outbox;
- recording, transcription, and summary events.

### Phase 2: live recording and calls

- renderer bridge;
- active call resource;
- recording controls;
- start and hang up call tools;
- call lifecycle webhook events.

### Phase 3: conversations, contacts, and messages

- paginated conversation, contact, and message queries;
- search;
- send-message tool;
- message sent/received webhook events with full message text.

The phases share schemas and domain contracts from Phase 1. Later phases do not
add alternate transports or direct database access.

## Testing

### Unit tests

- capability schemas and registry;
- token hashing and constant-time verification;
- pagination and response limits;
- resource URI parsing;
- job state transitions and concurrency;
- webhook filtering, payload construction, HMAC signatures, retry scheduling,
  and outbox bounds;
- secret redaction from logs and errors.

### Contract tests

- main-to-renderer request, response, timeout, reload, and invalid-payload
  handling;
- event normalization from call, message, recording, transcription, and
  summary sources.

### Integration tests

- start and stop the HTTP server on an isolated configured port;
- authentication, origin validation, session lifecycle, tools, resources, and
  progress notifications;
- restart recovery of queued webhook deliveries;
- occupied-port behavior without random-port fallback.

### Packaged acceptance

- connect MCP Inspector to a packaged Minutes build;
- read a recording, transcript, and summary;
- run a transcription job and observe progress;
- receive a message webhook containing text;
- verify transcript and summary webhooks contain IDs but not full text;
- inspect and control a live call and recording;
- restart Minutes and confirm MCP lifecycle and webhook retry recovery.

## References

- [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP server concepts](https://modelcontextprotocol.io/specification/2025-06-18/server/index)
- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/)
