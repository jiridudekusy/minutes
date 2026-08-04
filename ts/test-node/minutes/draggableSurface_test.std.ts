// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  calculateConstrainedOffset,
  calculateDraggedOffset,
  constrainSurfacePosition,
  hasPrimaryPointerButton,
  shouldStartSurfaceDrag,
} from '../../minutes/draggableSurface.std.ts';

describe('draggable Minutes surfaces', () => {
  it('stops dragging when pointer movement has no primary button', () => {
    assert.strictEqual(hasPrimaryPointerButton(0), false);
    assert.strictEqual(hasPrimaryPointerButton(1), true);
    assert.strictEqual(hasPrimaryPointerButton(2), false);
  });

  it('keeps a normally sized surface fully inside the viewport', () => {
    assert.deepEqual(
      constrainSurfacePosition(
        {
          left: 850,
          top: 700,
          width: 300,
          height: 200,
        },
        {
          width: 1000,
          height: 800,
        }
      ),
      {
        left: 692,
        top: 592,
      }
    );

    assert.deepEqual(
      constrainSurfacePosition(
        {
          left: 100,
          top: 120,
          width: 300,
          height: 200,
        },
        {
          width: 1000,
          height: 800,
        }
      ),
      {
        left: 100,
        top: 120,
      }
    );
  });

  it('keeps an oversized surface header and horizontal edge reachable', () => {
    const surface = {
      width: 500,
      height: 400,
    };
    const viewport = {
      width: 300,
      height: 200,
    };

    assert.deepEqual(
      constrainSurfacePosition(
        {
          ...surface,
          left: -900,
          top: -100,
        },
        viewport
      ),
      {
        left: -452,
        top: 8,
      }
    );

    assert.deepEqual(
      constrainSurfacePosition(
        {
          ...surface,
          left: 900,
          top: 900,
        },
        viewport
      ),
      {
        left: 252,
        top: 152,
      }
    );
  });

  it('converts constrained pointer movement back to a relative offset', () => {
    assert.deepEqual(
      calculateDraggedOffset({
        startOffset: {
          x: 10,
          y: -20,
        },
        startPointer: {
          x: 100,
          y: 100,
        },
        pointer: {
          x: 900,
          y: 900,
        },
        startRect: {
          left: 200,
          top: 100,
          width: 300,
          height: 200,
        },
        viewport: {
          width: 800,
          height: 600,
        },
      }),
      {
        x: 302,
        y: 272,
      }
    );
  });

  it('re-constrains the current offset after the viewport shrinks', () => {
    assert.deepEqual(
      calculateConstrainedOffset({
        currentOffset: {
          x: 200,
          y: 100,
        },
        currentRect: {
          left: 650,
          top: 500,
          width: 300,
          height: 200,
        },
        viewport: {
          width: 800,
          height: 600,
        },
      }),
      {
        x: 42,
        y: -8,
      }
    );
  });

  it('starts only a primary-button drag outside interactive controls', () => {
    assert.isTrue(
      shouldStartSurfaceDrag({
        button: 0,
        isPrimary: true,
        interactiveTarget: false,
      })
    );
    assert.isFalse(
      shouldStartSurfaceDrag({
        button: 1,
        isPrimary: true,
        interactiveTarget: false,
      })
    );
    assert.isFalse(
      shouldStartSurfaceDrag({
        button: 0,
        isPrimary: false,
        interactiveTarget: false,
      })
    );
    assert.isFalse(
      shouldStartSurfaceDrag({
        button: 0,
        isPrimary: true,
        interactiveTarget: true,
      })
    );
  });
});
