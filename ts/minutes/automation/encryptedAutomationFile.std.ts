// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export class EncryptedAutomationFile<T> {
  readonly #readText: () => Promise<string | undefined>;
  readonly #writeText: (value: string) => Promise<void>;
  readonly #encrypt: (value: string) => string;
  readonly #decrypt: (value: string) => string;

  constructor(
    options: Readonly<{
      readText: () => Promise<string | undefined>;
      writeText: (value: string) => Promise<void>;
      encrypt: (value: string) => string;
      decrypt: (value: string) => string;
    }>
  ) {
    this.#readText = options.readText;
    this.#writeText = options.writeText;
    this.#encrypt = options.encrypt;
    this.#decrypt = options.decrypt;
  }

  async read(): Promise<T | undefined> {
    const encrypted = await this.#readText();
    if (encrypted == null || encrypted.trim().length === 0) {
      return undefined;
    }
    return JSON.parse(this.#decrypt(encrypted)) as T;
  }

  async write(value: T): Promise<void> {
    await this.#writeText(this.#encrypt(JSON.stringify(value)));
  }
}
