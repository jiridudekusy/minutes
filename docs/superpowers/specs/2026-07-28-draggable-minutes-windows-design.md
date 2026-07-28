# Draggable Minutes Windows

## Goal

Allow Minutes-owned modal dialogs and the transcription queue/history panel to
be moved away from their fixed default positions. Movement is the only new
interaction; resizing is out of scope.

## Scope

- Minutes settings, extension, automation, bookmark, log, and readme dialogs.
- The expanded transcription queue/history panel.
- The minimized transcription pill keeps its existing fixed position.
- Signal's shared dialog implementation remains unchanged.

## Design

Minutes will provide a shared pointer-drag hook. A consumer supplies the panel
element and marks its existing header as the drag handle. The hook records the
pointer's starting position and the panel's starting offset, captures the
pointer, and updates a relative pixel offset while dragging.

The offset is applied with the independent CSS `translate` property rather than
the legacy `transform` property, because Signal's dialog opening and closing
animations already own `transform`. Dialogs remain centered by the existing
overlay and move relative to that center. The transcription panel remains
anchored at the bottom right and moves relative to that anchor.

Movement is constrained to the current viewport. The entire panel is kept
inside the viewport when it fits; for a panel larger than the viewport, the
header remains reachable so the user can always move it back. A resize listener
re-constrains an already moved panel when the application window changes size.

The drag handle uses pointer events and pointer capture so mouse and trackpad
movement continue smoothly outside the header. Dragging does not begin from
buttons, links, form controls, or elements explicitly marked as non-draggable.
The header receives a move cursor, while existing click, keyboard, modal focus,
escape, and outside-click behavior remains unchanged.

Positions live only in renderer memory. Closing and reopening a mounted Minutes
dialog preserves its position during that application run; restarting the
application restores the existing default position.

## Testing

Pure behavior tests cover normal movement, viewport clamping, oversized panels,
viewport resize re-clamping, and the conditions under which dragging may start.
Existing Minutes component tests and TypeScript checks guard integration.
