// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { presentationSourceController } from './presentationSourceControllerGlobal.std.ts';
import { RingRtcOutgoingVideoSource } from './ringRtcOutgoingVideoSource.preload.ts';
import { ScreenShareCompositor } from './screenShareCompositor.dom.ts';

type VideoSourceLifecycle = Readonly<{
  start(): void;
  pause(): void;
  resume(): void;
  stop(): void;
}>;

type CanvasCompositor = Readonly<{
  start(): unknown;
  pause(): void;
  resume(): void;
  stop(): void;
}>;

export class RingRtcScreenShareCompositor {
  readonly #source: VideoSourceLifecycle;
  readonly #compositor: CanvasCompositor;
  #canvasStopped = false;
  #sourceStopped = false;

  constructor(source: VideoSourceLifecycle, compositor: CanvasCompositor) {
    this.#source = source;
    this.#compositor = compositor;
  }

  static isSupported(): boolean {
    return RingRtcOutgoingVideoSource.isSupported();
  }

  static create(options: {
    conversationId: string;
    onFatalError: (error: Error) => void;
  }): RingRtcScreenShareCompositor {
    return new RingRtcScreenShareCompositor(
      RingRtcOutgoingVideoSource.create(options),
      new ScreenShareCompositor(presentationSourceController)
    );
  }

  start(): unknown {
    this.#source.start();
    try {
      return this.#compositor.start();
    } catch (error) {
      this.#source.stop();
      this.#sourceStopped = true;
      throw error;
    }
  }

  pause(): void {
    try {
      this.#compositor.pause();
    } finally {
      this.#source.pause();
    }
  }

  resume(): void {
    this.#source.resume();
    this.#compositor.resume();
  }

  stop(): void {
    if (this.#canvasStopped && this.#sourceStopped) {
      return;
    }

    let firstError: Error | undefined;
    if (!this.#canvasStopped) {
      try {
        this.#compositor.stop();
        this.#canvasStopped = true;
      } catch (error) {
        firstError = toError(error);
      }
    }
    if (!this.#sourceStopped) {
      try {
        this.#source.stop();
        this.#sourceStopped = true;
      } catch (error) {
        firstError ??= toError(error);
      }
    }
    if (firstError) {
      throw firstError;
    }
  }
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
