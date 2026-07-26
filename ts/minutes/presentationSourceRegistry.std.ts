// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export type PresentationGeneration = Readonly<{
  identity: string;
  generation: number;
}>;

export type PresentationSourceRegistration = Readonly<{
  identity: string;
  generation: number;
  markPresentationFrameRendered(presentation: PresentationGeneration): boolean;
  unregister(): boolean;
}>;

export type ActivePresentationSource<TSource extends object> = Readonly<{
  identity: string;
  source: TSource;
  sourceGeneration: number;
  presentationGeneration: number;
}>;

type SourceRecord<TSource extends object> = {
  readonly source: TSource;
  readonly generation: number;
  readyPresentationGeneration?: number;
};

export class PresentationSourceRegistry<TSource extends object> {
  readonly #sources = new Map<string, SourceRecord<TSource>>();
  #nextSourceGeneration = 1;
  #nextPresentationGeneration = 1;
  #authoritativePresentation: PresentationGeneration | undefined;

  registerSource(
    identity: string,
    source: TSource
  ): PresentationSourceRegistration {
    const generation = this.#nextSourceGeneration;
    this.#nextSourceGeneration += 1;
    this.#sources.set(identity, { source, generation });

    return {
      identity,
      generation,
      markPresentationFrameRendered: presentation =>
        this.#markPresentationFrameRendered(identity, generation, presentation),
      unregister: () => this.#unregisterSource(identity, generation),
    };
  }

  setAuthoritativePresenter(identity: string): PresentationGeneration {
    const presentation = {
      identity,
      generation: this.#nextPresentationGeneration,
    };
    this.#nextPresentationGeneration += 1;
    this.#authoritativePresentation = presentation;
    return presentation;
  }

  clearAuthoritativePresenter(presentation: PresentationGeneration): boolean {
    if (!this.#isAuthoritativePresentation(presentation)) {
      return false;
    }

    this.#authoritativePresentation = undefined;
    return true;
  }

  getActiveSource(): ActivePresentationSource<TSource> | undefined {
    const presentation = this.#authoritativePresentation;
    if (!presentation) {
      return undefined;
    }

    const sourceRecord = this.#sources.get(presentation.identity);
    if (
      !sourceRecord ||
      sourceRecord.readyPresentationGeneration !== presentation.generation
    ) {
      return undefined;
    }

    return {
      identity: presentation.identity,
      source: sourceRecord.source,
      sourceGeneration: sourceRecord.generation,
      presentationGeneration: presentation.generation,
    };
  }

  #markPresentationFrameRendered(
    identity: string,
    sourceGeneration: number,
    presentation: PresentationGeneration
  ): boolean {
    const sourceRecord = this.#sources.get(identity);
    if (
      sourceRecord?.generation !== sourceGeneration ||
      presentation.identity !== identity ||
      !this.#isAuthoritativePresentation(presentation)
    ) {
      return false;
    }

    sourceRecord.readyPresentationGeneration = presentation.generation;
    return true;
  }

  #unregisterSource(identity: string, sourceGeneration: number): boolean {
    const sourceRecord = this.#sources.get(identity);
    if (sourceRecord?.generation !== sourceGeneration) {
      return false;
    }

    this.#sources.delete(identity);
    return true;
  }

  #isAuthoritativePresentation(presentation: PresentationGeneration): boolean {
    return (
      this.#authoritativePresentation?.identity === presentation.identity &&
      this.#authoritativePresentation.generation === presentation.generation
    );
  }
}
