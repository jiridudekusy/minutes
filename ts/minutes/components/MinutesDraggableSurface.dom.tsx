// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefCallback,
} from 'react';

import { AxoDialog } from '../../axo/AxoDialog.dom.tsx';
import {
  calculateConstrainedOffset,
  calculateDraggedOffset,
  shouldStartSurfaceDrag,
  type DraggableSurfaceOffset,
} from '../draggableSurface.std.ts';

const INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, [role="button"], [data-minutes-no-drag]';
const ZERO_OFFSET: DraggableSurfaceOffset = { x: 0, y: 0 };
const savedOffsets = new Map<string, DraggableSurfaceOffset>();

type DragState = Readonly<{
  pointerId: number;
  startOffset: DraggableSurfaceOffset;
  startPointer: DraggableSurfaceOffset;
  startRect: Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
}>;

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest(INTERACTIVE_SELECTOR) != null
  );
}

function offsetsEqual(
  left: DraggableSurfaceOffset,
  right: DraggableSurfaceOffset
): boolean {
  return left.x === right.x && left.y === right.y;
}

export function useMinutesDraggableSurface(positionKey: string): Readonly<{
  setSurfaceElement: RefCallback<HTMLElement>;
  dragHandleProps: Readonly<{
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  }>;
}> {
  const [surfaceElement, setSurfaceElement] = useState<HTMLElement | null>(
    null
  );
  const [offset, setOffset] = useState<DraggableSurfaceOffset>(
    () => savedOffsets.get(positionKey) ?? ZERO_OFFSET
  );
  const offsetRef = useRef(offset);
  const dragRef = useRef<DragState | null>(null);

  const updateOffset = useCallback(
    (nextOffset: DraggableSurfaceOffset) => {
      if (offsetsEqual(offsetRef.current, nextOffset)) {
        return;
      }
      offsetRef.current = nextOffset;
      savedOffsets.set(positionKey, nextOffset);
      setOffset(nextOffset);
    },
    [positionKey]
  );

  const constrainCurrentPosition = useCallback(() => {
    if (!surfaceElement) {
      return;
    }

    const rect = surfaceElement.getBoundingClientRect();
    updateOffset(
      calculateConstrainedOffset({
        currentOffset: offsetRef.current,
        currentRect: rect,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      })
    );
  }, [surfaceElement, updateOffset]);

  useLayoutEffect(() => {
    if (!surfaceElement) {
      return;
    }

    surfaceElement.style.translate = `${offset.x}px ${offset.y}px`;
    constrainCurrentPosition();
  }, [constrainCurrentPosition, offset, surfaceElement]);

  useLayoutEffect(() => {
    window.addEventListener('resize', constrainCurrentPosition);
    return () => {
      window.removeEventListener('resize', constrainCurrentPosition);
    };
  }, [constrainCurrentPosition]);

  const finishDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (
        !surfaceElement ||
        !shouldStartSurfaceDrag({
          button: event.button,
          isPrimary: event.isPrimary,
          interactiveTarget: isInteractiveTarget(event.target),
        })
      ) {
        return;
      }

      const rect = surfaceElement.getBoundingClientRect();
      dragRef.current = {
        pointerId: event.pointerId,
        startOffset: offsetRef.current,
        startPointer: {
          x: event.clientX,
          y: event.clientY,
        },
        startRect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [surfaceElement]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      updateOffset(
        calculateDraggedOffset({
          startOffset: drag.startOffset,
          startPointer: drag.startPointer,
          pointer: {
            x: event.clientX,
            y: event.clientY,
          },
          startRect: drag.startRect,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
        })
      );
    },
    [updateOffset]
  );

  return {
    setSurfaceElement,
    dragHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishDrag,
      onPointerCancel: finishDrag,
    },
  };
}

export function MinutesDraggableDialogHeader({
  positionKey,
  children,
}: Readonly<{
  positionKey: string;
  children: ReactNode;
}>): JSX.Element {
  const { setSurfaceElement, dragHandleProps } =
    useMinutesDraggableSurface(positionKey);
  const setHandleElement = useCallback(
    (element: HTMLDivElement | null) => {
      setSurfaceElement(
        element?.closest<HTMLElement>('[role="dialog"]') ?? null
      );
    },
    [setSurfaceElement]
  );

  return (
    <div
      ref={setHandleElement}
      className="MinutesDraggableSurface__handle"
      {...dragHandleProps}
    >
      <AxoDialog.Header>{children}</AxoDialog.Header>
    </div>
  );
}
