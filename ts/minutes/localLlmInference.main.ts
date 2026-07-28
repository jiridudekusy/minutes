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

type LoadedLocalModel = Readonly<{
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

let loadedModel: LoadedLocalModel | null = null;
let loadPromise: Promise<LoadedLocalModel> | null = null;
let promptChain: Promise<unknown> = Promise.resolve();

async function disposeLoadedModel(): Promise<void> {
  if (!loadedModel) {
    return;
  }
  try {
    await loadedModel.dispose();
  } catch (error) {
    log.warn(
      'disposeLoadedModel failed',
      error instanceof Error ? error.message : error
    );
  }
  loadedModel = null;
}

export async function disposeLocalLlmModel(): Promise<void> {
  loadPromise = null;
  promptChain = Promise.resolve();
  await disposeLoadedModel();
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

async function getLoadedModel(
  modelPath: string,
  modelFileName: string,
  contextSize: LocalLlmContextSize,
  reasoningEnabled: boolean
): Promise<LoadedLocalModel> {
  if (
    loadedModel &&
    canReuseLocalLlmContext(
      loadedModel,
      modelFileName,
      contextSize,
      reasoningEnabled
    )
  ) {
    return loadedModel;
  }

  if (loadPromise) {
    const pending = await loadPromise;
    if (
      canReuseLocalLlmContext(
        pending,
        modelFileName,
        contextSize,
        reasoningEnabled
      )
    ) {
      return pending;
    }
  }

  loadPromise = (async () => {
    await disposeLoadedModel();
    log.info(
      `loading local LLM model ${modelFileName} (context setting: ${contextSize}, reasoning: ${reasoningEnabled})`
    );
    const next = await loadLocalModel(
      modelPath,
      modelFileName,
      contextSize,
      reasoningEnabled
    );
    loadedModel = next;
    return next;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
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
  const model = await getLoadedModel(
    options.modelPath,
    options.modelFileName,
    options.contextSize ?? DEFAULT_LOCAL_LLM_CONTEXT_SIZE,
    options.reasoningEnabled ?? DEFAULT_LOCAL_LLM_REASONING_ENABLED
  );

  const runPrompt = async (): Promise<string> => {
    const text = await model.prompt({
      systemPrompt: options.systemPrompt,
      userPrompt: options.userPrompt,
      maxTokens: options.maxTokens ?? 2000,
      temperature: options.temperature ?? 0.2,
    });
    return requireNonEmptyLocalLlmOutput(text);
  };

  const result = promptChain.then(runPrompt, runPrompt);
  promptChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
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
