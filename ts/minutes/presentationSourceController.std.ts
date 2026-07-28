// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import {
  PresentationSourceRegistry,
  type ActivePresentationSource,
  type PresentationGeneration,
  type PresentationSourceRegistration,
} from './presentationSourceRegistry.std.ts';

type ElementRegistration = Readonly<{
  registration: PresentationSourceRegistration;
  token: symbol;
}>;

export class PresentationSourceController<TSource extends object> {
  readonly #registry = new PresentationSourceRegistry<TSource>();
  readonly #registrations = new WeakMap<TSource, ElementRegistration>();
  #authoritative: PresentationGeneration | undefined;

  register(identity: string, source: TSource): () => void {
    this.#registrations.get(source)?.registration.unregister();

    const registration = this.#registry.registerSource(identity, source);
    const token = Symbol(identity);
    this.#registrations.set(source, { registration, token });

    return () => {
      const current = this.#registrations.get(source);
      if (current?.token !== token) {
        return;
      }
      this.#registrations.delete(source);
      registration.unregister();
    };
  }

  setAuthoritative(identity: string): () => void {
    const presentation = this.#registry.setAuthoritativePresenter(identity);
    this.#authoritative = presentation;
    return () => {
      if (this.#authoritative !== presentation) {
        return;
      }
      this.#registry.clearAuthoritativePresenter(presentation);
      this.#authoritative = undefined;
    };
  }

  markRendered(source: TSource): boolean {
    const presentation = this.#authoritative;
    const registration = this.#registrations.get(source)?.registration;
    if (!presentation || !registration) {
      return false;
    }
    return registration.markPresentationFrameRendered(presentation);
  }

  getActiveSource(): ActivePresentationSource<TSource> | undefined {
    return this.#registry.getActiveSource();
  }
}

export function localPresentationIdentity(conversationId: string): string {
  return `local:${conversationId}`;
}

export function directPresentationIdentity(conversationId: string): string {
  return `direct:${conversationId}`;
}

export function groupPresentationIdentity(
  conversationId: string,
  demuxId: number
): string {
  return `group:${conversationId}:${demuxId}`;
}
