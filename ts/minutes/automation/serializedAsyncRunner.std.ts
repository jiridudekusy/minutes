// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export class SerializedAsyncRunner {
  #tail: Promise<void> = Promise.resolve();
  #closed = false;
  #closePromise: Promise<void> | undefined;

  run(task: () => Promise<void>): Promise<void> {
    if (this.#closed) {
      return Promise.resolve();
    }
    const result = this.#tail.then(task);
    this.#tail = result.catch(() => undefined);
    return result;
  }

  close(cleanup: () => Promise<void>): Promise<void> {
    if (this.#closePromise != null) {
      return this.#closePromise;
    }
    this.#closed = true;
    const result = this.#tail.then(cleanup);
    this.#tail = result.catch(() => undefined);
    this.#closePromise = result;
    return result;
  }
}
