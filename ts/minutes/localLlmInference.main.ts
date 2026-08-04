// Copyright 2026 Minutes contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { createLogger } from '../logging/log.std.ts';
import { loadNodeLlamaCpp } from './loadNodeLlamaCpp.main.ts';
import {
  canReuseLocalLlmContext,
  DEFAULT_LOCAL_LLM_CONTEXT_SIZE,
  resolveLocalLlmRuntimeContextSize,
  type LocalLlmContextSize,
} from './localLlmContextSize.std.ts';
import {
  DEFAULT_LOCAL_LLM_REASONING_ENABLED,
  getLocalLlmChatWrapperOptions,
  requireNonEmptyLocalLlmOutput,
} from './localLlmReasoning.std.ts';

const log = createLogger('minutes/localLlmInference');

export type LoadedLocalModel = Readonly<{
  modelPath: string;
  modelFileName: string;
  contextSize: LocalLlmContextSize;
  reasoningEnabled: boolean;
  dispose: () => Promise<void>;
  prompt: (options: {
    systemPrompt: string;
    userPrompt: string;
    maxTokens: number;
    temperature: number;
  }) => Promise<string>;
}>;

export type LocalLlmModelRequest = Readonly<{
  modelPath: string;
  modelFileName: string;
  contextSize: LocalLlmContextSize;
  reasoningEnabled: boolean;
}>;

export class LocalLlmModelScheduler {
  #loadedModel: LoadedLocalModel | null = null;
  #operationChain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly loadModel: (
      request: LocalLlmModelRequest
    ) => Promise<LoadedLocalModel>
  ) {}

  generate<T>(
    request: LocalLlmModelRequest,
    run: (model: LoadedLocalModel) => Promise<T>
  ): Promise<T> {
    return this.#enqueue(async () => run(await this.#getLoadedModel(request)));
  }

  dispose(): Promise<void> {
    return this.#enqueue(() => this.#disposeLoadedModel());
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#operationChain.then(operation, operation);
    this.#operationChain = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  async #getLoadedModel(
    request: LocalLlmModelRequest
  ): Promise<LoadedLocalModel> {
    if (
      this.#loadedModel?.modelPath === request.modelPath &&
      canReuseLocalLlmContext(
        this.#loadedModel,
        request.modelFileName,
        request.contextSize,
        request.reasoningEnabled
      )
    ) {
      return this.#loadedModel;
    }

    await this.#disposeLoadedModel();
    log.info(
      `loading local LLM model ${request.modelFileName} (context setting: ${request.contextSize}, reasoning: ${request.reasoningEnabled})`
    );
    const next = await this.loadModel(request);
    this.#loadedModel = next;
    return next;
  }

  async #disposeLoadedModel(): Promise<void> {
    const model = this.#loadedModel;
    this.#loadedModel = null;
    if (!model) {
      return;
    }
    try {
      await model.dispose();
    } catch (error) {
      log.warn(
        'disposeLoadedModel failed',
        error instanceof Error ? error.message : error
      );
    }
  }
}

async function loadLocalModel(
  modelPath: string,
  modelFileName: string,
  contextSize: LocalLlmContextSize,
  reasoningEnabled: boolean
): Promise<LoadedLocalModel> {
  const { getLlama, LlamaChatSession, resolveChatWrapper } =
    await loadNodeLlamaCpp();
  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath });
  const chatWrapper = resolveChatWrapper(
    model,
    getLocalLlmChatWrapperOptions(reasoningEnabled)
  );
  const context = await model.createContext({
    contextSize: resolveLocalLlmRuntimeContextSize(contextSize),
  });
  const contextSequence = context.getSequence();

  log.info(
    `local LLM model ready ${modelFileName} (context: ${context.contextSize}, reasoning: ${reasoningEnabled}, chat wrapper: ${chatWrapper.wrapperName})`
  );

  return {
    modelPath,
    modelFileName,
    contextSize,
    reasoningEnabled,
    dispose: async () => {
      contextSequence.dispose();
      await context.dispose();
      await model.dispose();
    },
    prompt: async options => {
      await contextSequence.clearHistory();

      const session = new LlamaChatSession({
        contextSequence,
        chatWrapper,
        systemPrompt: options.systemPrompt,
      });

      try {
        return await session.prompt(options.userPrompt, {
          maxTokens: options.maxTokens,
          temperature: options.temperature,
        });
      } finally {
        session.dispose({ disposeSequence: false });
        await contextSequence.clearHistory();
      }
    },
  };
}

const modelScheduler = new LocalLlmModelScheduler(request =>
  loadLocalModel(
    request.modelPath,
    request.modelFileName,
    request.contextSize,
    request.reasoningEnabled
  )
);

export function disposeLocalLlmModel(): Promise<void> {
  return modelScheduler.dispose();
}

export async function generateLocalLlmText(options: {
  modelPath: string;
  modelFileName: string;
  contextSize?: LocalLlmContextSize;
  reasoningEnabled?: boolean;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  return modelScheduler.generate(
    {
      modelPath: options.modelPath,
      modelFileName: options.modelFileName,
      contextSize: options.contextSize ?? DEFAULT_LOCAL_LLM_CONTEXT_SIZE,
      reasoningEnabled:
        options.reasoningEnabled ?? DEFAULT_LOCAL_LLM_REASONING_ENABLED,
    },
    async model => {
      const text = await model.prompt({
        systemPrompt: options.systemPrompt,
        userPrompt: options.userPrompt,
        maxTokens: options.maxTokens ?? 2000,
        temperature: options.temperature ?? 0.2,
      });
      return requireNonEmptyLocalLlmOutput(text);
    }
  );
}

export async function testLocalLlmText(options: {
  modelPath: string;
  modelFileName: string;
  contextSize?: LocalLlmContextSize;
  reasoningEnabled?: boolean;
}): Promise<string> {
  const text = await generateLocalLlmText({
    modelPath: options.modelPath,
    modelFileName: options.modelFileName,
    contextSize: options.contextSize,
    reasoningEnabled: options.reasoningEnabled,
    systemPrompt: 'Odpovídej stručně.',
    userPrompt: 'Odpověz jedním slovem: OK',
    maxTokens: 16,
    temperature: 0,
  });
  return text.slice(0, 80);
}
