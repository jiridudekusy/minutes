// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { EncryptedAutomationFile } from '../../minutes/automation/encryptedAutomationFile.std.ts';

describe('EncryptedAutomationFile', () => {
  it('persists encrypted JSON and restores it', async () => {
    let raw: string | undefined;
    const file = new EncryptedAutomationFile<{ text: string }>({
      readText: async () => raw,
      writeText: async value => {
        raw = value;
      },
      encrypt: value => Buffer.from(`cipher:${value}`, 'utf8').toString('hex'),
      decrypt: value =>
        Buffer.from(value, 'hex')
          .toString('utf8')
          .replace(/^cipher:/, ''),
    });

    await file.write({ text: 'private message' });

    assert.notInclude(raw, 'private message');
    assert.deepEqual(await file.read(), { text: 'private message' });
  });
});
