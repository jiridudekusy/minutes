// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { PresentationSourceRegistry } from '../../minutes/presentationSourceRegistry.std.ts';

describe('PresentationSourceRegistry', () => {
  it('keeps a newly registered presentation unavailable until its frame is confirmed', () => {
    const registry = new PresentationSourceRegistry<object>();
    const source = {};
    const registration = registry.registerSource('alice', source);
    const presentation = registry.setAuthoritativePresenter('alice');

    assert.isUndefined(registry.getActiveSource());
    assert.strictEqual(
      registration.markPresentationFrameRendered(presentation),
      true
    );
    assert.deepEqual(registry.getActiveSource(), {
      identity: 'alice',
      source,
      sourceGeneration: registration.generation,
      presentationGeneration: presentation.generation,
    });
  });

  it('does not let a stale source generation ready or unregister its replacement', () => {
    const registry = new PresentationSourceRegistry<object>();
    const oldSource = {};
    const newSource = {};
    const oldRegistration = registry.registerSource('alice', oldSource);
    const presentation = registry.setAuthoritativePresenter('alice');
    const newRegistration = registry.registerSource('alice', newSource);

    assert.strictEqual(
      oldRegistration.markPresentationFrameRendered(presentation),
      false
    );
    assert.strictEqual(oldRegistration.unregister(), false);
    assert.isUndefined(registry.getActiveSource());

    assert.strictEqual(
      newRegistration.markPresentationFrameRendered(presentation),
      true
    );
    assert.strictEqual(registry.getActiveSource()?.source, newSource);
  });

  it('selects only the source matching the authoritative presenter', () => {
    const registry = new PresentationSourceRegistry<object>();
    const alice = {};
    const bob = {};
    const aliceRegistration = registry.registerSource('alice', alice);
    const bobRegistration = registry.registerSource('bob', bob);

    const alicePresentation = registry.setAuthoritativePresenter('alice');
    aliceRegistration.markPresentationFrameRendered(alicePresentation);
    bobRegistration.markPresentationFrameRendered(alicePresentation);
    assert.strictEqual(registry.getActiveSource()?.source, alice);

    const bobPresentation = registry.setAuthoritativePresenter('bob');
    assert.isUndefined(registry.getActiveSource());
    bobRegistration.markPresentationFrameRendered(bobPresentation);
    assert.strictEqual(registry.getActiveSource()?.source, bob);
  });

  it('does not let a stale presentation generation mark a restarted share ready', () => {
    const registry = new PresentationSourceRegistry<object>();
    const source = {};
    const registration = registry.registerSource('alice', source);
    const firstPresentation = registry.setAuthoritativePresenter('alice');
    const secondPresentation = registry.setAuthoritativePresenter('alice');

    assert.strictEqual(
      registration.markPresentationFrameRendered(firstPresentation),
      false
    );
    assert.isUndefined(registry.getActiveSource());

    assert.strictEqual(
      registration.markPresentationFrameRendered(secondPresentation),
      true
    );
    assert.strictEqual(registry.getActiveSource()?.source, source);
  });

  it('unregisters the current source and ignores stale presenter cleanup', () => {
    const registry = new PresentationSourceRegistry<object>();
    const source = {};
    const registration = registry.registerSource('alice', source);
    const firstPresentation = registry.setAuthoritativePresenter('alice');
    const secondPresentation = registry.setAuthoritativePresenter('alice');

    assert.strictEqual(
      registry.clearAuthoritativePresenter(firstPresentation),
      false
    );
    registration.markPresentationFrameRendered(secondPresentation);
    assert.strictEqual(registry.getActiveSource()?.source, source);

    assert.strictEqual(registration.unregister(), true);
    assert.strictEqual(registration.unregister(), false);
    assert.isUndefined(registry.getActiveSource());
    assert.strictEqual(
      registry.clearAuthoritativePresenter(secondPresentation),
      true
    );
  });
});
