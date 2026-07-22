// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export type MinutesCaptureMode = 'audio' | 'video';

export type MinutesCaptureState =
  | 'idle'
  | 'audio-recording'
  | 'audio-paused'
  | 'video-recording'
  | 'video-paused'
  | 'finalizing';

export type MinutesCaptureLease = Readonly<{
  mode: MinutesCaptureMode;
  pause(): boolean;
  resume(): boolean;
  finalize(): Promise<void>;
  release(): boolean;
}>;

type ActiveCapture = {
  readonly id: symbol;
  readonly mode: MinutesCaptureMode;
  readonly finalizeCapture: () => Promise<void>;
  readonly lease: MinutesCaptureLease;
  finalizePromise?: Promise<void>;
};

const RESOLVED_PROMISE = Promise.resolve();

export class MinutesCaptureCoordinator {
  #state: MinutesCaptureState = 'idle';
  #activeCapture: ActiveCapture | undefined;

  get state(): MinutesCaptureState {
    return this.#state;
  }

  get activeMode(): MinutesCaptureMode | undefined {
    return this.#activeCapture?.mode;
  }

  acquire(
    mode: MinutesCaptureMode,
    finalizeCapture: () => Promise<void>
  ): MinutesCaptureLease {
    if (this.#state !== 'idle') {
      throw new Error(
        `Cannot start capture while coordinator is ${this.#state}`
      );
    }

    const id = Symbol(mode);
    const lease: MinutesCaptureLease = {
      mode,
      pause: () => this.#pause(id),
      resume: () => this.#resume(id),
      finalize: () => this.#finalize(id),
      release: () => this.#release(id),
    };

    this.#activeCapture = { id, mode, finalizeCapture, lease };
    this.#state = `${mode}-recording`;
    return lease;
  }

  finalizeActive(): Promise<void> {
    return this.#activeCapture?.lease.finalize() ?? RESOLVED_PROMISE;
  }

  #pause(id: symbol): boolean {
    const activeCapture = this.#getActiveCapture(id);
    if (!activeCapture || this.#state !== `${activeCapture.mode}-recording`) {
      return false;
    }

    this.#state = `${activeCapture.mode}-paused`;
    return true;
  }

  #resume(id: symbol): boolean {
    const activeCapture = this.#getActiveCapture(id);
    if (!activeCapture || this.#state !== `${activeCapture.mode}-paused`) {
      return false;
    }

    this.#state = `${activeCapture.mode}-recording`;
    return true;
  }

  #finalize(id: symbol): Promise<void> {
    const activeCapture = this.#getActiveCapture(id);
    if (!activeCapture) {
      return RESOLVED_PROMISE;
    }
    if (activeCapture.finalizePromise) {
      return activeCapture.finalizePromise;
    }

    this.#state = 'finalizing';

    let resolveFinalization: (() => void) | undefined;
    let rejectFinalization: ((error: unknown) => void) | undefined;
    const finalizePromise = new Promise<void>((resolve, reject) => {
      resolveFinalization = resolve;
      rejectFinalization = reject;
    });
    activeCapture.finalizePromise = finalizePromise;

    const runFinalization = async (): Promise<void> => {
      try {
        await activeCapture.finalizeCapture();
        this.#completeFinalization(id);
        resolveFinalization?.();
      } catch (error) {
        this.#completeFinalization(id);
        rejectFinalization?.(error);
      }
    };
    void runFinalization();

    return finalizePromise;
  }

  #release(id: symbol): boolean {
    if (this.#state === 'finalizing') {
      return false;
    }
    return this.#clearActiveCapture(id);
  }

  #completeFinalization(id: symbol): void {
    this.#clearActiveCapture(id);
  }

  #clearActiveCapture(id: symbol): boolean {
    if (this.#activeCapture?.id !== id) {
      return false;
    }

    this.#activeCapture = undefined;
    this.#state = 'idle';
    return true;
  }

  #getActiveCapture(id: symbol): ActiveCapture | undefined {
    if (this.#activeCapture?.id !== id) {
      return undefined;
    }
    return this.#activeCapture;
  }
}

export const minutesCaptureCoordinator = new MinutesCaptureCoordinator();
