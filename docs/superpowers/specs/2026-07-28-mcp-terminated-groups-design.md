# MCP Terminated Group State

## Goal

Make MCP clients reliably distinguish an active Signal group from a group an
administrator terminated.

## Interface

`get_group` adds a required `terminated: boolean` field to
`AutomationGroup`. The existing `members` collection remains unchanged and is
documented by its behavior as the last locally known membership snapshot. A
terminated group may therefore still list every former member.

`find_groups_by_member` continues to mean “find current groups”. It excludes
groups whose Signal conversation has `terminated: true`, in addition to groups
the local account left and disabled legacy groups. Archived active groups remain
included.

No new selector, compatibility flag, or mutation is added. An MCP client that
already knows an exact group ID can still inspect a terminated group through
`get_group`.

## Data Flow

The renderer reads Signal's existing `terminated` conversation attribute. Group
serialization copies it into `AutomationGroup.terminated`. The pure group
discovery filter receives the same state and removes terminated groups before
sorting and pagination.

Minutes does not infer termination from messages, announcements-only mode,
member counts, or send failures.

## Testing

Regression tests verify that:

- group discovery excludes a terminated group even when its historical member
  list still contains the searched person;
- active and archived groups remain discoverable;
- the public group contract requires the explicit termination field;
- MCP tool registration and existing group behavior remain unchanged.
