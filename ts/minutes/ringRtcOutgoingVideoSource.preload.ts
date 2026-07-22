// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// The native RingRTC singleton is intentionally consumed from Signal's preload.
import { RingRTC } from '@signalapp/ringrtc';

import {
  localPresentationIdentity,
  presentationSourceController,
} from './presentationSourceControllerGlobal.std.ts';
import {
  resolveRingRtcVideoTapApi,
  validateRingRtcVideoTapFrame,
  type RingRtcVideoPixelFormat,
  type RingRtcVideoTapApi,
} from './ringRtcVideoTapApi.std.ts';

export const RING_RTC_VIDEO_POLL_INTERVAL_MS = 1_000 / 15;

type LocalPresentationController = Readonly<{
  register(identity: string, source: HTMLCanvasElement): () => void;
  markRendered(source: HTMLCanvasElement): boolean;
}>;

export type RingRtcOutgoingVideoSourceDependencies = Readonly<{
  createCanvas(): HTMLCanvasElement;
  createVideoFrame(
    data: AllowSharedBufferSource,
    init: VideoFrameBufferInit
  ): VideoFrame;
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
}>;

const DEFAULT_DEPENDENCIES: RingRtcOutgoingVideoSourceDependencies = {
  createCanvas: () => document.createElement('canvas'),
  createVideoFrame: (data, init) => new VideoFrame(data, init),
  setInterval: (callback, intervalMs) =>
    window.setInterval(callback, intervalMs),
  clearInterval: handle => window.clearInterval(handle as number),
};

type VideoTapEvent = NonNullable<
  ReturnType<RingRtcVideoTapApi['readVideoTap']>
>;

export class RingRtcOutgoingVideoSource {
  readonly #api: RingRtcVideoTapApi;
  readonly #canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D;
  readonly #controller: LocalPresentationController;
  readonly #dependencies: RingRtcOutgoingVideoSourceDependencies;
  readonly #identity: string;
  readonly #onFatalError: (error: Error) => void;

  #state: 'idle' | 'running' | 'paused' | 'stopped' = 'idle';
  #lastSequence = 0;
  #timer: unknown;
  #tapStarted = false;
  #unregister: (() => void) | undefined;
  #presentationNeedsReady = false;
  #fatalErrorReported = false;

  constructor(options: {
    api: RingRtcVideoTapApi;
    conversationId: string;
    controller: LocalPresentationController;
    dependencies?: RingRtcOutgoingVideoSourceDependencies;
    onFatalError: (error: Error) => void;
  }) {
    this.#api = options.api;
    this.#controller = options.controller;
    this.#dependencies = options.dependencies ?? DEFAULT_DEPENDENCIES;
    this.#identity = localPresentationIdentity(options.conversationId);
    this.#onFatalError = options.onFatalError;
    this.#canvas = this.#dependencies.createCanvas();
    const context = this.#canvas.getContext('2d');
    if (!context) {
      throw new Error('RingRTC video source requires a 2D canvas context');
    }
    this.#context = context;
  }

  static isSupported(): boolean {
    return resolveRingRtcVideoTapApi(RingRTC) !== undefined;
  }

  static create(options: {
    conversationId: string;
    onFatalError: (error: Error) => void;
  }): RingRtcOutgoingVideoSource {
    const api = resolveRingRtcVideoTapApi(RingRTC);
    if (!api) {
      throw new Error(
        'This RingRTC build does not support Minutes video tap v1'
      );
    }
    return new RingRtcOutgoingVideoSource({
      api,
      conversationId: options.conversationId,
      controller: presentationSourceController,
      onFatalError: options.onFatalError,
    });
  }

  start(): void {
    if (this.#state !== 'idle') {
      throw new Error('RingRTC video source has already started');
    }
    this.#state = 'running';
    try {
      this.#activate();
    } catch (error) {
      this.#state = 'stopped';
      this.#deactivateIgnoringErrors();
      throw error;
    }
  }

  pause(): void {
    if (this.#state !== 'running') {
      return;
    }
    this.#state = 'paused';
    this.#deactivate();
  }

  resume(): void {
    if (this.#state !== 'paused') {
      return;
    }
    this.#state = 'running';
    try {
      this.#activate();
    } catch (error) {
      this.#state = 'stopped';
      this.#deactivateIgnoringErrors();
      throw error;
    }
  }

  stop(): void {
    this.#state = 'stopped';
    this.#deactivate();
  }

  #activate(): void {
    this.#lastSequence = 0;
    this.#api.startVideoTap();
    this.#tapStarted = true;
    this.#timer = this.#dependencies.setInterval(
      () => this.#poll(),
      RING_RTC_VIDEO_POLL_INTERVAL_MS
    );
    this.#poll();
  }

  #deactivate(): void {
    if (this.#timer !== undefined) {
      this.#dependencies.clearInterval(this.#timer);
      this.#timer = undefined;
    }
    this.#removePresentationSource();
    if (this.#tapStarted) {
      this.#api.stopVideoTap();
      this.#tapStarted = false;
    }
  }

  #deactivateIgnoringErrors(): void {
    try {
      this.#deactivate();
    } catch {
      // Preserve the startup or polling error that initiated cleanup.
    }
  }

  #poll(): void {
    if (this.#state !== 'running') {
      return;
    }
    try {
      const rawEvent = this.#api.readVideoTap(this.#lastSequence);
      if (rawEvent === undefined) {
        this.#retryPresentationReadiness();
        return;
      }
      const event = validateRingRtcVideoTapFrame(rawEvent, this.#lastSequence);
      if (!event) {
        throw new Error('RingRTC video tap returned an incompatible event');
      }
      this.#lastSequence = event.sequence;
      this.#handleEvent(event);
    } catch (error) {
      this.#state = 'stopped';
      this.#deactivateIgnoringErrors();
      this.#reportFatalError(toError(error));
    }
  }

  #handleEvent(event: VideoTapEvent): void {
    if (!event.active) {
      this.#removePresentationSource();
      this.#context.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
      return;
    }
    const { width, height } = event;
    const videoFrame = this.#dependencies.createVideoFrame(event.data, {
      format: toVideoFrameFormat(event.format),
      codedWidth: width,
      codedHeight: height,
      timestamp: event.timestampUs,
    });
    try {
      this.#canvas.width = width;
      this.#canvas.height = height;
      this.#context.drawImage(videoFrame, 0, 0, width, height);
    } finally {
      videoFrame.close();
    }

    this.#unregister ??= this.#controller.register(
      this.#identity,
      this.#canvas
    );
    this.#presentationNeedsReady = !this.#controller.markRendered(this.#canvas);
  }

  #removePresentationSource(): void {
    this.#unregister?.();
    this.#unregister = undefined;
    this.#presentationNeedsReady = false;
  }

  #retryPresentationReadiness(): void {
    if (!this.#presentationNeedsReady || !this.#unregister) {
      return;
    }
    this.#presentationNeedsReady = !this.#controller.markRendered(this.#canvas);
  }

  #reportFatalError(error: Error): void {
    if (this.#fatalErrorReported) {
      return;
    }
    this.#fatalErrorReported = true;
    this.#onFatalError(error);
  }
}

function toVideoFrameFormat(format: RingRtcVideoPixelFormat): VideoPixelFormat {
  switch (format) {
    case 'rgba':
      return 'RGBA';
    case 'i420':
      return 'I420';
    case 'nv12':
      return 'NV12';
    default:
      throw new Error(`Unsupported RingRTC video pixel format: ${format}`);
  }
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
