// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import {
  combinePresentationAndRingRtcStreams,
  createVideoMediaRecorder,
} from '../../minutes/videoRecordingService.preload.ts';

describe('videoRecordingService browser adapters', () => {
  it('combines only the presentation video and RingRTC audio tracks', () => {
    const presentationVideo = { kind: 'video', id: 'presentation' };
    const ignoredPresentationAudio = { kind: 'audio', id: 'ignored-audio' };
    const ringRtcAudio = { kind: 'audio', id: 'ringrtc' };
    const ignoredRingRtcVideo = { kind: 'video', id: 'ignored-video' };
    const createdWith = new Array<unknown>();

    function createFakeMediaStream(tracks: ReadonlyArray<unknown>): {
      tracks: ReadonlyArray<unknown>;
    } {
      createdWith.push(...tracks);
      return { tracks };
    }

    const combined = combinePresentationAndRingRtcStreams(
      {
        getVideoTracks: () => [presentationVideo],
        getAudioTracks: () => [ignoredPresentationAudio],
      } as unknown as MediaStream,
      {
        getVideoTracks: () => [ignoredRingRtcVideo],
        getAudioTracks: () => [ringRtcAudio],
      } as unknown as MediaStream,
      createFakeMediaStream as unknown as typeof MediaStream
    );

    assert.deepEqual(
      (combined as unknown as { tracks: ReadonlyArray<unknown> }).tracks,
      [presentationVideo, ringRtcAudio]
    );
    assert.deepEqual(createdWith, [presentationVideo, ringRtcAudio]);
  });

  it('adapts MediaRecorder BlobEvents to raw Blob chunks', () => {
    const blob = new Blob(['webm']);
    let recorderOptions: MediaRecorderOptions | undefined;
    const operations = new Array<string>();

    class FakeMediaRecorder {
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onstop: (() => void) | null = null;

      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        recorderOptions = options;
      }

      start(): void {
        operations.push('start');
      }
      pause(): void {
        operations.push('pause');
      }
      resume(): void {
        operations.push('resume');
      }
      requestData(): void {
        operations.push('request-data');
      }
      stop(): void {
        operations.push('stop');
      }
    }

    const adapter = createVideoMediaRecorder(
      {} as MediaStream,
      'video/webm;codecs=vp9,opus',
      FakeMediaRecorder as unknown as typeof MediaRecorder
    );
    let received: Blob | undefined;
    adapter.ondataavailable = chunk => {
      received = chunk;
    };
    (
      adapter as unknown as { recorder: FakeMediaRecorder }
    ).recorder.ondataavailable?.({ data: blob } as BlobEvent);

    assert.equal(received, blob);
    assert.deepEqual(recorderOptions, {
      mimeType: 'video/webm;codecs=vp9,opus',
    });
  });
});
