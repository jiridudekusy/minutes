// Copyright 2026 Minutes contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { app, type WebContents } from 'electron';

import { createLogger } from '../logging/log.std.ts';
import {
  DEFAULT_LOCAL_LLM_CONTEXT_SIZE,
  normalizeLocalLlmContextSize,
} from './localLlmContextSize.std.ts';
import {
  DEFAULT_LOCAL_LLM_REASONING_ENABLED,
  normalizeLocalLlmReasoningEnabled,
} from './localLlmReasoning.std.ts';
import { AI_SETTINGS_DIR_NAME } from './constants.std.ts';
import {
  DownloadCancelledError,
  downloadHttpsFile,
} from './httpsDownload.main.ts';
import {
  checkLocalLlmRuntime,
  resetLocalLlmRuntimeCheck,
} from './localLlmRuntime.main.ts';
import {
  DEFAULT_LOCAL_LLM_EXTENSION,
  getLocalLlmModelDownloadUrl,
  getLocalLlmModelMinBytes,
  LOCAL_LLM_MODEL_CATALOG,
  type LocalLlmExtensionProgress,
  type LocalLlmExtensionPublic,
  type LocalLlmModelPublic,
} from './localLlmExtension.std.ts';
import {
  parseStoredLocalLlmExtension,
  type StoredLocalLlmExtension,
} from './localLlmExtensionSettings.std.ts';
import {
  DEFAULT_LOCAL_LLM_MODEL,
  getLocalLlmModelLabel,
  LOCAL_LLM_MODELS_DIR,
  normalizeLocalLlmModelFileName,
} from './localLlmSettings.std.ts';
import {
  disposeLocalLlmModel,
  generateLocalLlmText,
  testLocalLlmText,
} from './localLlmInference.main.ts';

const log = createLogger('minutes/localLlmExtension');

const EXTENSION_FILE_NAME = 'local-llm-extension.json';

type ProgressSender = (progress: LocalLlmExtensionProgress) => void;

let activeDownloadAbort: AbortController | null = null;

export function cancelLocalLlmExtensionDownload(): void {
  activeDownloadAbort?.abort();
}

function getModelsDir(): string {
  return join(app.getPath('userData'), LOCAL_LLM_MODELS_DIR);
}

function getExtensionSettingsPath(): string {
  return join(
    app.getPath('userData'),
    AI_SETTINGS_DIR_NAME,
    EXTENSION_FILE_NAME
  );
}

async function readStoredExtension(): Promise<StoredLocalLlmExtension | null> {
  try {
    const raw = await readFile(getExtensionSettingsPath(), 'utf8');
    const parsed = parseStoredLocalLlmExtension(JSON.parse(raw));
    if (!parsed) {
      return null;
    }
    return {
      ...parsed,
      modelFileName: normalizeLocalLlmModelFileName(parsed.modelFileName),
    };
  } catch {
    return null;
  }
}

async function writeStoredExtension(
  stored: StoredLocalLlmExtension
): Promise<void> {
  const path = getExtensionSettingsPath();
  await mkdir(join(app.getPath('userData'), AI_SETTINGS_DIR_NAME), {
    recursive: true,
  });
  await writeFile(path, JSON.stringify(stored, null, 2), 'utf8');
}

function getModelPath(modelFileName: string): string {
  return join(getModelsDir(), modelFileName);
}

async function isModelReady(modelFileName: string): Promise<{
  ready: boolean;
  sizeBytes: number | null;
}> {
  try {
    const modelPath = getModelPath(modelFileName);
    const fileStat = await stat(modelPath);
    const minBytes = getLocalLlmModelMinBytes(modelFileName);
    return {
      ready: fileStat.size >= minBytes,
      sizeBytes: fileStat.size,
    };
  } catch {
    return { ready: false, sizeBytes: null };
  }
}

async function getAvailableModelsPublic(): Promise<
  ReadonlyArray<LocalLlmModelPublic>
> {
  const models: Array<LocalLlmModelPublic> = [];

  for (const definition of LOCAL_LLM_MODEL_CATALOG) {
    const status = await isModelReady(definition.fileName);
    models.push({
      fileName: definition.fileName,
      label: definition.label,
      description: definition.description,
      downloadLabel: definition.downloadLabel,
      recommended: Boolean(definition.recommended),
      installed: status.sizeBytes != null,
      installedSizeBytes: status.sizeBytes,
      ready: status.ready,
    });
  }

  return models;
}

export async function getLocalLlmExtensionPublic(): Promise<LocalLlmExtensionPublic> {
  const runtime = await checkLocalLlmRuntime();
  const availableModels = await getAvailableModelsPublic();
  const stored = await readStoredExtension();

  if (!stored) {
    return {
      ...DEFAULT_LOCAL_LLM_EXTENSION,
      runtimeReady: runtime.ready,
      recommendedModelFileName: DEFAULT_LOCAL_LLM_MODEL.fileName,
      availableModels,
    };
  }

  const modelStatus = await isModelReady(stored.modelFileName);

  return {
    activated: stored.activated && modelStatus.ready && runtime.ready,
    modelReady: modelStatus.ready,
    runtimeReady: runtime.ready,
    modelFileName: stored.modelFileName,
    modelSizeBytes: modelStatus.sizeBytes,
    installedAt: stored.installedAt ?? null,
    contextSize: stored.contextSize,
    reasoningEnabled: stored.reasoningEnabled,
    recommendedModelFileName: DEFAULT_LOCAL_LLM_MODEL.fileName,
    availableModels,
  };
}

export async function isLocalLlmExtensionActive(
  modelFileName?: string
): Promise<boolean> {
  const state = await getLocalLlmExtensionPublic();
  if (!state.activated || !state.modelReady || !state.runtimeReady) {
    return false;
  }
  if (modelFileName && state.modelFileName !== modelFileName) {
    return false;
  }
  return true;
}

export type InstallLocalLlmExtensionOptions = Readonly<{
  modelFileName?: string;
  forceRedownload?: boolean;
}>;

export async function installLocalLlmExtension(
  sendProgress: ProgressSender,
  options: InstallLocalLlmExtensionOptions = {}
): Promise<LocalLlmExtensionPublic> {
  activeDownloadAbort = new AbortController();
  const { signal } = activeDownloadAbort;
  let modelPath: string | null = null;

  const throwIfCancelled = (): void => {
    if (signal.aborted) {
      throw new DownloadCancelledError();
    }
  };

  try {
    sendProgress({
      phase: 'checking',
      message: 'Kontroluji lokální LLM runtime…',
    });

    resetLocalLlmRuntimeCheck();
    const runtime = await checkLocalLlmRuntime();
    throwIfCancelled();
    if (!runtime.ready) {
      const message =
        runtime.error ??
        'Nelze načíst node-llama-cpp. Zkuste znovu spustit instalaci závislostí.';
      sendProgress({ phase: 'error', message });
      throw new Error(message);
    }

    const modelFileName = normalizeLocalLlmModelFileName(
      options.modelFileName ?? DEFAULT_LOCAL_LLM_MODEL.fileName
    );
    if (
      !LOCAL_LLM_MODEL_CATALOG.some(model => model.fileName === modelFileName)
    ) {
      throw new Error(`Neznámý lokální model: ${modelFileName}`);
    }

    const modelsDir = getModelsDir();
    await mkdir(modelsDir, { recursive: true });

    modelPath = getModelPath(modelFileName);
    if (options.forceRedownload) {
      await disposeLocalLlmModel();
      try {
        await unlink(modelPath);
      } catch {
        // ignore missing file
      }
    }

    const currentStatus = await isModelReady(modelFileName);
    if (!currentStatus.ready) {
      sendProgress({
        phase: 'downloading',
        message: `Stahuji ${getLocalLlmModelLabel(modelFileName)}…`,
        percent: 0,
      });

      await downloadHttpsFile(
        getLocalLlmModelDownloadUrl(modelFileName),
        modelPath,
        (loaded, total) => {
          const percent =
            total && total > 0
              ? Math.min(99, Math.round((loaded / total) * 100))
              : undefined;
          sendProgress({
            phase: 'downloading',
            message: `Stahuji ${getLocalLlmModelLabel(modelFileName)}…`,
            percent,
          });
        },
        { signal }
      );
    }

    throwIfCancelled();

    sendProgress({
      phase: 'verifying',
      message: 'Ověřuji stažený model…',
    });

    const verified = await isModelReady(modelFileName);
    if (!verified.ready) {
      const message = 'Stažený model je neúplný. Zkuste přeinstalovat.';
      sendProgress({ phase: 'error', message });
      throw new Error(message);
    }

    const previousStored = await readStoredExtension();
    await writeStoredExtension({
      activated: true,
      modelFileName,
      installedAt: Date.now(),
      contextSize:
        previousStored?.contextSize ?? DEFAULT_LOCAL_LLM_CONTEXT_SIZE,
      reasoningEnabled:
        previousStored?.reasoningEnabled ?? DEFAULT_LOCAL_LLM_REASONING_ENABLED,
    });

    await disposeLocalLlmModel();

    sendProgress({
      phase: 'complete',
      message: 'Lokální model je aktivní.',
      percent: 100,
    });

    log.info(`local LLM extension activated with ${modelFileName}`);
    return getLocalLlmExtensionPublic();
  } catch (error) {
    if (error instanceof DownloadCancelledError || signal.aborted) {
      if (modelPath) {
        try {
          await unlink(modelPath);
        } catch {
          // ignore missing partial file
        }
      }
      sendProgress({
        phase: 'cancelled',
        message: 'Stažení bylo zrušeno.',
      });
      throw new DownloadCancelledError();
    }
    throw error;
  } finally {
    activeDownloadAbort = null;
  }
}

export async function resolveLocalLlmModelPath(
  modelFileName: string
): Promise<string> {
  const status = await isModelReady(modelFileName);
  if (!status.ready) {
    throw new Error(
      `Lokální model ${getLocalLlmModelLabel(modelFileName)} není stažen. Otevřete Nastavení AI a stáhněte ho.`
    );
  }
  return getModelPath(modelFileName);
}

export async function generateLocalLlmSummary(options: {
  modelFileName: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const state = await getLocalLlmExtensionPublic();
  if (
    !state.activated ||
    !state.modelReady ||
    !state.runtimeReady ||
    state.modelFileName !== options.modelFileName
  ) {
    throw new Error(
      'Lokální LLM není aktivní nebo neodpovídá zvolenému modelu. Stáhněte model v Nastavení AI.'
    );
  }

  const modelPath = await resolveLocalLlmModelPath(options.modelFileName);
  return generateLocalLlmText({
    modelPath,
    modelFileName: options.modelFileName,
    contextSize: state.contextSize,
    reasoningEnabled: state.reasoningEnabled,
    systemPrompt: options.systemPrompt,
    userPrompt: options.userPrompt,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
  });
}

export async function testLocalLlmConnection(options: {
  modelFileName: string;
}): Promise<string> {
  const state = await getLocalLlmExtensionPublic();
  const modelPath = await resolveLocalLlmModelPath(options.modelFileName);
  const response = await testLocalLlmText({
    modelPath,
    modelFileName: options.modelFileName,
    contextSize: state.contextSize,
    reasoningEnabled: state.reasoningEnabled,
  });
  return `Lokální model odpověděl: ${response}`;
}

export async function saveLocalLlmContextSize(
  value: unknown
): Promise<LocalLlmExtensionPublic> {
  const contextSize = normalizeLocalLlmContextSize(value);
  const stored = await readStoredExtension();
  const previousContextSize =
    stored?.contextSize ?? DEFAULT_LOCAL_LLM_CONTEXT_SIZE;

  await writeStoredExtension({
    activated: stored?.activated ?? false,
    modelFileName: stored?.modelFileName ?? DEFAULT_LOCAL_LLM_MODEL.fileName,
    installedAt: stored?.installedAt,
    contextSize,
    reasoningEnabled:
      stored?.reasoningEnabled ?? DEFAULT_LOCAL_LLM_REASONING_ENABLED,
  });

  if (contextSize !== previousContextSize) {
    await disposeLocalLlmModel();
  }

  return getLocalLlmExtensionPublic();
}

export async function saveLocalLlmReasoningEnabled(
  value: unknown
): Promise<LocalLlmExtensionPublic> {
  const reasoningEnabled = normalizeLocalLlmReasoningEnabled(value);
  const stored = await readStoredExtension();
  const previousReasoningEnabled =
    stored?.reasoningEnabled ?? DEFAULT_LOCAL_LLM_REASONING_ENABLED;

  await writeStoredExtension({
    activated: stored?.activated ?? false,
    modelFileName: stored?.modelFileName ?? DEFAULT_LOCAL_LLM_MODEL.fileName,
    installedAt: stored?.installedAt,
    contextSize: stored?.contextSize ?? DEFAULT_LOCAL_LLM_CONTEXT_SIZE,
    reasoningEnabled,
  });

  if (reasoningEnabled !== previousReasoningEnabled) {
    await disposeLocalLlmModel();
  }

  return getLocalLlmExtensionPublic();
}

export function createLocalLlmProgressSender(
  webContents: WebContents | null | undefined
): ProgressSender {
  return progress => {
    if (!webContents || webContents.isDestroyed()) {
      return;
    }
    webContents.send('minutes:local-llm-extension-progress', progress);
  };
}
