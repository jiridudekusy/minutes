// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { resolveCallSummaryCredential } from '../../minutes/callSummaryCredentials.std.ts';

describe('resolveCallSummaryCredential', () => {
  it('uses an empty credential for the local provider without reading an API key', async () => {
    let apiKeyReadCount = 0;

    const credential = await resolveCallSummaryCredential('local', async () => {
      apiKeyReadCount += 1;
      return 'unexpected-cloud-key';
    });

    assert.strictEqual(credential, '');
    assert.strictEqual(apiKeyReadCount, 0);
  });

  it('reads the configured API key for a cloud provider', async () => {
    const credential = await resolveCallSummaryCredential(
      'openai',
      async provider => {
        assert.strictEqual(provider, 'openai');
        return 'configured-cloud-key';
      }
    );

    assert.strictEqual(credential, 'configured-cloud-key');
  });

  it('reports a missing credential when a cloud provider has no API key', async () => {
    const credential = await resolveCallSummaryCredential(
      'anthropic',
      async () => null
    );

    assert.strictEqual(credential, null);
  });
});
