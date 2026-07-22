// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  calculateAspectFit,
  decidePresentationFrame,
  RecordingPauseTimeline,
  selectWebmMimeType,
} from '../../minutes/videoRecordingPrimitives.std.ts';

describe('videoRecordingPrimitives', () => {
  describe('calculateAspectFit', () => {
    it('fits a landscape source into 1920x1080 without cropping', () => {
      assert.deepEqual(calculateAspectFit({ width: 2560, height: 1600 }), {
        x: 96,
        y: 0,
        width: 1728,
        height: 1080,
      });
    });

    it('centers a portrait source with black side bars', () => {
      assert.deepEqual(calculateAspectFit({ width: 1080, height: 1920 }), {
        x: 656.25,
        y: 0,
        width: 607.5,
        height: 1080,
      });
    });

    it('returns nothing for a source without drawable dimensions', () => {
      assert.equal(calculateAspectFit({ width: 0, height: 1080 }), undefined);
    });
  });

  describe('decidePresentationFrame', () => {
    it('keeps the output black when there is no presentation source', () => {
      assert.deepEqual(decidePresentationFrame(undefined), { kind: 'black' });
    });

    it('keeps a new presentation generation black until its first frame is confirmed', () => {
      assert.deepEqual(
        decidePresentationFrame({
          sourceId: 'remote-participant',
          generation: 2,
          readyGeneration: 1,
          size: { width: 1920, height: 1080 },
        }),
        { kind: 'black' }
      );
    });

    it('draws only the confirmed presentation generation', () => {
      assert.deepEqual(
        decidePresentationFrame({
          sourceId: 'remote-participant',
          generation: 2,
          readyGeneration: 2,
          size: { width: 1280, height: 720 },
        }),
        {
          kind: 'presentation',
          sourceId: 'remote-participant',
          generation: 2,
          destination: { x: 0, y: 0, width: 1920, height: 1080 },
        }
      );
    });

    it('keeps a confirmed source black until it has drawable dimensions', () => {
      assert.deepEqual(
        decidePresentationFrame({
          sourceId: 'local',
          generation: 1,
          readyGeneration: 1,
          size: { width: 0, height: 0 },
        }),
        { kind: 'black' }
      );
    });
  });

  describe('selectWebmMimeType', () => {
    it('prefers VP9 with Opus when both supported codecs are available', () => {
      assert.equal(
        selectWebmMimeType(() => true),
        'video/webm;codecs=vp9,opus'
      );
    });

    it('falls back from VP9 with Opus to VP8 with Opus', () => {
      const checked: Array<string> = [];

      assert.equal(
        selectWebmMimeType(mimeType => {
          checked.push(mimeType);
          return mimeType === 'video/webm;codecs=vp8,opus';
        }),
        'video/webm;codecs=vp8,opus'
      );
      assert.deepEqual(checked, [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
      ]);
    });

    it('reports unsupported when neither VP9 nor VP8 with Opus is available', () => {
      assert.equal(
        selectWebmMimeType(() => false),
        undefined
      );
    });
  });

  describe('RecordingPauseTimeline', () => {
    it('excludes paused wall-clock time from the recording timeline', () => {
      const timeline = new RecordingPauseTimeline(1_000);

      assert.equal(timeline.getRecordedDuration(1_500), 500);
      timeline.pause(1_500);
      assert.equal(timeline.getRecordedDuration(4_000), 500);
      timeline.resume(4_000, {
        localSample: 160n,
        remoteSample: 275n,
      });
      assert.equal(timeline.getRecordedDuration(4_500), 1_000);
    });

    it('resumes audio readers at current writers and discards samples buffered while paused', () => {
      const staleReadCursors = {
        localSample: 100n,
        remoteSample: 200n,
      };
      const timeline = new RecordingPauseTimeline(0);

      timeline.pause(1_000);
      const resumed = timeline.resume(4_000, {
        localSample: 160n,
        remoteSample: 275n,
      });

      assert.notDeepEqual(resumed.audioReadCursors, staleReadCursors);
      assert.deepEqual(resumed, {
        recordedDurationMs: 1_000,
        audioReadCursors: {
          localSample: 160n,
          remoteSample: 275n,
        },
      });
    });

    it('accumulates more than one pause interval', () => {
      const timeline = new RecordingPauseTimeline(0);

      timeline.pause(1_000);
      timeline.resume(2_000, { localSample: 10n, remoteSample: 20n });
      timeline.pause(3_000);
      timeline.resume(5_000, { localSample: 30n, remoteSample: 40n });

      assert.equal(timeline.getRecordedDuration(6_000), 3_000);
    });
  });
});
