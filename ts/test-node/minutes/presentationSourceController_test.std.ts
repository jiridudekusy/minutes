// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { getAuthoritativePresentationIdentity } from '../../minutes/presentationAuthority.std.ts';
import { PresentationSourceController } from '../../minutes/presentationSourceController.std.ts';
import { CallMode } from '../../types/CallDisposition.std.ts';

describe('PresentationSourceController', () => {
  it('marks only the rendered element belonging to the authoritative presenter', () => {
    const controller = new PresentationSourceController<object>();
    const alice = {};
    const bob = {};
    const unregisterAlice = controller.register('alice', alice);
    controller.register('bob', bob);
    const clear = controller.setAuthoritative('alice');

    assert.strictEqual(controller.markRendered(bob), false);
    assert.isUndefined(controller.getActiveSource());
    assert.strictEqual(controller.markRendered(alice), true);
    assert.strictEqual(controller.getActiveSource()?.source, alice);

    unregisterAlice();
    assert.isUndefined(controller.getActiveSource());
    clear();
  });

  it('ignores stale authoritative cleanup after presenter replacement', () => {
    const controller = new PresentationSourceController<object>();
    const bob = {};
    controller.register('bob', bob);
    const clearAlice = controller.setAuthoritative('alice');
    controller.setAuthoritative('bob');

    clearAlice();
    assert.strictEqual(controller.markRendered(bob), true);
    assert.strictEqual(controller.getActiveSource()?.identity, 'bob');
  });

  it('replaces an element registration without allowing stale cleanup to remove it', () => {
    const controller = new PresentationSourceController<object>();
    const element = {};
    const unregisterOld = controller.register('alice', element);
    const unregisterNew = controller.register('bob', element);
    controller.setAuthoritative('bob');

    unregisterOld();
    assert.strictEqual(controller.markRendered(element), true);
    unregisterNew();
    assert.isUndefined(controller.getActiveSource());
  });
});

describe('getAuthoritativePresentationIdentity', () => {
  it('prefers the local Signal share and maps direct and group presenters', () => {
    assert.strictEqual(
      getAuthoritativePresentationIdentity({
        callMode: CallMode.Direct,
        conversationId: 'call',
        isLocalPresenting: true,
        isRemotePresenting: true,
      }),
      'local:call'
    );
    assert.strictEqual(
      getAuthoritativePresentationIdentity({
        callMode: CallMode.Direct,
        conversationId: 'call',
        isLocalPresenting: false,
        isRemotePresenting: true,
      }),
      'direct:call'
    );
    assert.strictEqual(
      getAuthoritativePresentationIdentity({
        callMode: CallMode.Group,
        conversationId: 'call',
        isLocalPresenting: false,
        isRemotePresenting: true,
        remotePresenterDemuxId: 42,
      }),
      'group:call:42'
    );
  });

  it('does not authorize cameras or adhoc calls as presentation sources', () => {
    assert.isUndefined(
      getAuthoritativePresentationIdentity({
        callMode: CallMode.Direct,
        conversationId: 'call',
        isLocalPresenting: false,
        isRemotePresenting: false,
      })
    );
    assert.isUndefined(
      getAuthoritativePresentationIdentity({
        callMode: CallMode.Adhoc,
        conversationId: 'call',
        isLocalPresenting: true,
        isRemotePresenting: false,
      })
    );
  });
});
