// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export type DraggableSurfaceOffset = Readonly<{
  x: number;
  y: number;
}>;

export type DraggableSurfaceRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export type DraggableSurfaceViewport = Readonly<{
  width: number;
  height: number;
}>;

const VIEWPORT_MARGIN = 8;
const MIN_VISIBLE_WIDTH = 48;
const MIN_VISIBLE_HEADER_HEIGHT = 40;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function constrainSurfacePosition(
  rect: DraggableSurfaceRect,
  viewport: DraggableSurfaceViewport
): Readonly<{ left: number; top: number }> {
  const fitsHorizontally = rect.width + VIEWPORT_MARGIN * 2 <= viewport.width;
  const minimumLeft = fitsHorizontally
    ? VIEWPORT_MARGIN
    : MIN_VISIBLE_WIDTH - rect.width;
  const maximumLeft = fitsHorizontally
    ? viewport.width - rect.width - VIEWPORT_MARGIN
    : viewport.width - MIN_VISIBLE_WIDTH;

  const fitsVertically = rect.height + VIEWPORT_MARGIN * 2 <= viewport.height;
  const maximumTop = fitsVertically
    ? viewport.height - rect.height - VIEWPORT_MARGIN
    : viewport.height - MIN_VISIBLE_HEADER_HEIGHT - VIEWPORT_MARGIN;

  return {
    left: clamp(rect.left, minimumLeft, maximumLeft),
    top: clamp(
      rect.top,
      VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, maximumTop)
    ),
  };
}

export function calculateDraggedOffset({
  startOffset,
  startPointer,
  pointer,
  startRect,
  viewport,
}: Readonly<{
  startOffset: DraggableSurfaceOffset;
  startPointer: DraggableSurfaceOffset;
  pointer: DraggableSurfaceOffset;
  startRect: DraggableSurfaceRect;
  viewport: DraggableSurfaceViewport;
}>): DraggableSurfaceOffset {
  const constrained = constrainSurfacePosition(
    {
      left: startRect.left + pointer.x - startPointer.x,
      top: startRect.top + pointer.y - startPointer.y,
      width: startRect.width,
      height: startRect.height,
    },
    viewport
  );

  return {
    x: startOffset.x + constrained.left - startRect.left,
    y: startOffset.y + constrained.top - startRect.top,
  };
}

export function calculateConstrainedOffset({
  currentOffset,
  currentRect,
  viewport,
}: Readonly<{
  currentOffset: DraggableSurfaceOffset;
  currentRect: DraggableSurfaceRect;
  viewport: DraggableSurfaceViewport;
}>): DraggableSurfaceOffset {
  const constrained = constrainSurfacePosition(currentRect, viewport);
  return {
    x: currentOffset.x + constrained.left - currentRect.left,
    y: currentOffset.y + constrained.top - currentRect.top,
  };
}

export function shouldStartSurfaceDrag({
  button,
  isPrimary,
  interactiveTarget,
}: Readonly<{
  button: number;
  isPrimary: boolean;
  interactiveTarget: boolean;
}>): boolean {
  return button === 0 && isPrimary && !interactiveTarget;
}

export function hasPrimaryPointerButton(buttons: number): boolean {
  return (buttons & 1) === 1;
}
