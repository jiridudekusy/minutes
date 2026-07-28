# MCP Group Discovery and Management

## Goal

Add MCP capabilities that:

- find every current Signal group containing a specific person, including
  people known only through shared group membership;
- inspect the complete current state of a group;
- create and administer Signal Group V2 groups without bypassing Signal's
  existing permission, cryptography, conflict, and synchronization logic.

## Read-only MCP Interface

Register two independently configurable read-only tools.

### `find_groups_by_member`

The input accepts exactly one member selector:

- `contactId`: an exact internal conversation identifier obtained from
  `list_contacts`.
- `query`: a fuzzy member search over Signal names, profile names, usernames,
  and phone numbers.

The existing opaque `cursor` and bounded `limit` pagination fields are
supported. Supplying neither selector or both selectors returns an
`INVALID_ARGUMENT` error.

The response is an `AutomationPage` whose items have this shape:

```json
{
  "group": {
    "id": "group-conversation-id",
    "title": "PSS Team",
    "type": "group",
    "unreadCount": 0,
    "activeAt": 1785146400000
  },
  "matchedMembers": [
    {
      "id": "member-conversation-id",
      "title": "Jan Novak",
      "serviceId": "member-aci",
      "e164": "+420..."
    }
  ]
}
```

A group is returned once even when multiple members match. `matchedMembers`
makes ambiguous fuzzy results explicit. Results are ordered by the group's
recent activity before pagination.

### `get_group`

The input contains an exact `groupId`. The response contains:

- group identifier, title, description, avatar state, archive state, and recent
  activity;
- established members with exact internal IDs, Signal service identifiers,
  display information, and `admin` or `member` roles;
- current access-control settings;
- invite-link mode;
- announcements-only state;
- disappearing-message duration.

Pending invitations and pending admin approvals may be reported in separate
read-only collections but are never represented as established members.

## Mutating MCP Interface

Every mutation uses exact `groupId` and `memberIds`. Names and fuzzy queries are
never accepted by a mutating tool.

### `create_group`

Creates a Signal Group V2 group. Required input:

- `title`;
- at least one exact `memberId`.

Optional input:

- `avatarPath`;
- disappearing-message duration.

The local Signal account is always included as an administrator. Duplicate
member IDs are normalized before validation. Description, permissions,
invite-link policy, and announcements-only mode are changed after creation
through their dedicated tools; this keeps group creation mapped to Signal's
single native Group V2 creation operation and avoids partially configured
creation.

### `update_group_metadata`

Updates title, description, and avatar. `avatarPath` points to a PNG, JPEG, or
WebP file on the same Mac. An explicit `avatarPath: null` removes the avatar.
At least one metadata field must be provided.

### `add_group_members`

Adds one or more exact member IDs. Existing established members are treated as a
no-op; unresolved IDs fail before any group change is submitted.

### `remove_group_members`

Removes one or more exact established member IDs. The local account is rejected
with `INVALID_ARGUMENT`; leaving is available only through `leave_group`.
Removing members may not leave the group without an administrator.

### `set_group_member_roles`

Applies explicit `admin` or `member` roles to established members. It rejects
unknown members and any operation that would demote the final administrator.

### `set_group_permissions`

Updates the supported Group V2 policies:

- who may edit group information: `members` or `admins`;
- who may add or remove members: `members` or `admins`;
- invite-link mode: `disabled`, `open`, or `admin_approval`;
- announcements-only mode.

The tool exposes stable Minutes values and maps them to Signal protocol enums in
the renderer. MCP clients do not send raw Signal enum values.

### `set_group_disappearing_messages`

Sets a duration in whole seconds. Zero disables disappearing messages. The
renderer uses Signal's existing conversation timer operation so the change is
announced and synchronized normally.

### `leave_group`

Explicitly removes the local account from the group using Signal's existing
leave operation. It is separate from member removal and is annotated as
destructive.

All successful mutations return the same refreshed complete group shape as
`get_group`.

## Renderer Data Flow

The MCP server delegates through `RendererAutomationService` and the existing
renderer bridge. The renderer remains the only layer that accesses
`ConversationController`.

For exact lookup, the renderer resolves `contactId` to a direct conversation and
uses its Signal service identifier. A missing direct conversation or service
identifier returns `NOT_FOUND`.

For fuzzy lookup, the renderer enumerates current members of every current group
and resolves membership service identifiers through `ConversationController`.
This does not require a saved system contact or an existing one-to-one chat:
Signal maintains internal direct-conversation models for group members. Member
matching reuses Signal's existing conversation search behavior so matching is
case-insensitive, diacritic-tolerant, and consistent with the application UI.

Only established members are searched. Pending invitations and pending
approvals are excluded.

Group mutations resolve and validate every supplied ID before submitting a
change. They delegate to Signal's existing Group V2 creation and modification
operations and change builders. Minutes does not construct or upload raw group
protocol messages independently.

Avatar paths are read locally and passed through Signal's existing avatar image
processing before upload. Only supported image formats are accepted, file size
is bounded, and non-image or unreadable files fail before a group mutation.

## Group Scope

Only groups the local user has not left are returned. Archived groups remain in
scope because the local user is still a member. Disabled legacy groups and
groups without a current matching member are excluded.

`get_group` may inspect an archived current Group V2 group. Mutations work only
for a current Group V2 group and only when Signal's current permission checks
allow the requested operation. Legacy, disabled, or left groups are rejected.

## Tool Configuration

The read and mutation tools are added to a new Groups section in the existing
MCP settings. Each tool can be enabled independently.

Existing installations migrate safely: a missing stored tool selection enables
the complete current catalog, while an explicit stored selection remains
unchanged and does not silently enable new tools.

Read tools use `readOnlyHint`. Creation, metadata, membership, role, permission,
and timer tools are marked mutating. `remove_group_members` and `leave_group`
also use `destructiveHint`. No additional in-app confirmation dialog is added in
this version.

## Error Handling

- Invalid selector combinations: `INVALID_ARGUMENT`.
- Unknown exact `contactId`: `NOT_FOUND`.
- A fuzzy query with no matches: an empty page, not an error.
- Members that cannot be resolved to a local model are skipped without exposing
  incomplete internal membership data.
- Unknown group or member IDs: `NOT_FOUND`.
- Non-Group V2, disabled, or left groups: `INVALID_ARGUMENT`.
- Missing Signal permission or administrator role: `PERMISSION_DENIED`.
- Conflicting, empty, or unsafe mutation input: `INVALID_ARGUMENT`.
- Signal service conflicts are retried by Signal's existing Group V2 layer and
  returned as a normalized operation error if retries are exhausted.
- Mutation validation is completed before submitting any change so invalid
  batch input cannot partially modify a group.

## Testing

Tests cover:

- Tool catalog registration and opt-in controls.
- Complete group serialization, including member IDs, roles, and settings.
- Exact lookup for a known direct conversation.
- Fuzzy lookup for a member with no saved contact or direct chat.
- Diacritic-tolerant matching and ambiguous names.
- Group deduplication with all matching members attached.
- Exclusion of left groups and pending members.
- Pagination and invalid selector combinations.
- Renderer bridge and MCP result serialization.
- Group creation through Signal's Group V2 operation.
- Metadata and validated local-avatar changes.
- Adding and removing members with exact IDs.
- Rejection of self-removal and protection of the final administrator.
- Role, permission, announcements-only, invite-link, and timer changes.
- Explicit group leave behavior.
- Permission, legacy-group, invalid-ID, and atomic-validation failures.
