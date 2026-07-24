// Copyright 2026 minutes contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { get as httpsGet } from 'node:https';
import { cpus } from 'node:os';
import { join } from 'node:path';

import { app, type WebContents } from 'electron';

import { createLogger } from '../logging/log.std.ts';
import {
  DEFAULT_CALL_SUMMARY_EXTENSION,
  getWhisperModelDownloadUrl,
  getWhisperModelDownloadLabel,
  getWhisperModelMinBytes,
  WHISPER_MODEL_CATALOG,
  type CallSummaryExtensionProgress,
  type CallSummaryExtensionPublic,
  type WhisperModelPublic,
} from './callSummaryExtension.std.ts';
import { DEFAULT_WHISPER_MODEL, getWhisperModelLabel } from './whisperSettings.std.ts';
import {
  AI_SETTINGS_DIR_NAME,
} from './constants.std.ts';
import {
  checkWhisperRuntime,
  resetWhisperRuntimeCheck,
  transcribePcm,
  isVadModelReady,
  getWhisperGpuAccelerationPublic,
  type TranscribePcmResult,
  type WhisperTranscribeRuntimeOptions,
} from './whisperTranscribe.main.ts';
import { preparePcmForWhisper } from './whisperAudioPrep.std.ts';
import { getRecordingArtifactPaths } from './recordingArtifacts.std.ts';
import { isAiSummaryEnabled, getAiSettingsPublic, getAiApiKey, isTranscriptCorrectionEnabled } from './aiSettings.main.ts';
import { formatAiModelDisplayLabel, formatAiSummaryProgressMessage } from './aiSettings.std.ts';
import { generateAiSummaryForProvider } from './aiSummaryService.main.ts';
import { correctTranscriptWithAi } from './transcriptCorrection.main.ts';
import { DEFAULT_WHISPER_LANGUAGE, WHISPER_VAD_MODEL_FILE, WHISPER_VAD_MODEL_MIN_BYTES, WHISPER_VAD_MODEL_URL } from './whisperSettings.std.ts';
import {
  isSpeakerActivityCoverageSufficient,
  replaceLegacyLocalSpeakerLabels,
  type AlignedTranscriptSegment,
  type SpeakerActivityLog,
} from './speakerActivity.std.ts';
import {
  alignWhisperSegmentsWithSpeakerActivity,
  formatAlignedSegmentsForAi,
  formatAlignedSegmentsForDisplay,
  isFullFileTranscriptSuspiciouslyWeak,
} from './speakerActivityAlign.std.ts';
import { transcribePcmWithSpeakerWindows } from './transcribeBySpeakerWindows.main.ts';
import {
  clampProgressPercent,
  type TranscriptionProgressCallback,
} from './transcriptionProgress.std.ts';
import { clearTranscriptionJobCancellation,
  throwIfTranscriptionCancelled,
} from './transcriptionCancel.main.ts';
import { writeCallTranscriptMetadata } from './transcriptMetadata.main.ts';
import {
  normalizeWhisperTranscribeSettings,
  resolveWhisperDecodeProfiles,
  shouldUseLenientWeakTranscriptCheck,
  WHISPER_MEDIUM_RECORDING_MS,
  type WhisperTranscribeSettingsPublic,
} from './whisperTranscribeSettings.std.ts';

const log = createLogger('minutes/callSummaryExtension');

const EXTENSION_FILE_NAME = 'call-summary-extension.json';
const MODELS_DIR_NAME = 'minutes/models';

type StoredExtension = {
  activated: boolean;
  modelFileName: string;
  installedAt?: number;
  transcribeSettings?: Partial<WhisperTranscribeSettingsPublic>;
};

type ProgressSender = (progress: CallSummaryExtensionProgress) => void;

type TranscriptionWithAlignedSegments = TranscribePcmResult & {
  alignedSegments: ReadonlyArray<AlignedTranscriptSegment>;
};

type TranscriptionPipelineResult =
  | TranscribePcmResult
  | TranscriptionWithAlignedSegments;

function getSpeakerAlignedSegments(
  transcription: TranscriptionPipelineResult
): ReadonlyArray<AlignedTranscriptSegment> {
  return 'alignedSegments' in transcription ? transcription.alignedSegments : [];
}

function toTranscribePcmResult(
  transcription: TranscriptionPipelineResult
): TranscribePcmResult {
  return {
    text: transcription.text,
    segments: transcription.segments,
    language: transcription.language,
  };
}

function getModelsDir(): string {
  return join(app.getPath('userData'), MODELS_DIR_NAME);
}

function getExtensionSettingsPath(): string {
  return join(app.getPath('userData'), AI_SETTINGS_DIR_NAME, EXTENSION_FILE_NAME);
}

async function readStoredExtension(): Promise<StoredExtension | null> {
  try {
    const raw = await readFile(getExtensionSettingsPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredExtension>;
    if (!parsed.modelFileName) {
      return null;
    }
    return {
      activated: Boolean(parsed.activated),
      modelFileName: parsed.modelFileName,
      installedAt: parsed.installedAt,
      transcribeSettings: parsed.transcribeSettings,
    };
  } catch {
    return null;
  }
}

function buildWhisperRuntimeOptions(
  settings: WhisperTranscribeSettingsPublic,
  pcmDurationMs: number
): WhisperTranscribeRuntimeOptions {
  return {
    threadCount: settings.threadCount,
    useGpu: settings.useGpu,
    decodeProfiles: resolveWhisperDecodeProfiles({
      decodeMode: settings.decodeMode,
      pcmDurationMs,
    }),
    lenientWeakTranscriptCheck: shouldUseLenientWeakTranscriptCheck({
      decodeMode: settings.decodeMode,
      pcmDurationMs,
    }),
  };
}

async function writeStoredExtension(stored: StoredExtension): Promise<void> {
  const path = getExtensionSettingsPath();
  await mkdir(join(app.getPath('userData'), AI_SETTINGS_DIR_NAME), {
    recursive: true,
  });
  await writeFile(path, JSON.stringify(stored, null, 2), 'utf8');
}

async function getModelPath(modelFileName: string): Promise<string> {
  return join(getModelsDir(), modelFileName);
}

async function isModelReady(modelFileName: string): Promise<{
  ready: boolean;
  sizeBytes: number | null;
}> {
  try {
    const modelPath = await getModelPath(modelFileName);
    const fileStat = await stat(modelPath);
    const minBytes = getWhisperModelMinBytes(modelFileName);
    return {
      ready: fileStat.size >= minBytes,
      sizeBytes: fileStat.size,
    };
  } catch {
    return { ready: false, sizeBytes: null };
  }
}

async function getAvailableModelsPublic(): Promise<
  ReadonlyArray<WhisperModelPublic>
> {
  const models: Array<WhisperModelPublic> = [];

  for (const definition of WHISPER_MODEL_CATALOG) {
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

export async function getCallSummaryExtensionPublic(): Promise<CallSummaryExtensionPublic> {
  const runtime = await checkWhisperRuntime();
  const availableModels = await getAvailableModelsPublic();
  const stored = await readStoredExtension();
  const transcribeSettings = normalizeWhisperTranscribeSettings(
    stored?.transcribeSettings
  );
  const cpuCount = cpus().length;
  const gpuAcceleration = getWhisperGpuAccelerationPublic(
    transcribeSettings.useGpu
  );

  if (!stored) {
    return {
      ...DEFAULT_CALL_SUMMARY_EXTENSION,
      whisperRuntimeReady: runtime.ready,
      recommendedModelFileName: DEFAULT_WHISPER_MODEL.fileName,
      availableModels,
      transcribeSettings,
      gpuAcceleration,
      cpuCount,
    };
  }

  const modelStatus = await isModelReady(stored.modelFileName);

  return {
    activated: stored.activated && modelStatus.ready && runtime.ready,
    modelReady: modelStatus.ready,
    whisperRuntimeReady: runtime.ready,
    modelFileName: stored.modelFileName,
    modelSizeBytes: modelStatus.sizeBytes,
    installedAt: stored.installedAt ?? null,
    recommendedModelFileName: DEFAULT_WHISPER_MODEL.fileName,
    availableModels,
    transcribeSettings,
    gpuAcceleration,
    cpuCount,
  };
}

export async function saveCallSummaryTranscribeSettings(
  input: Partial<WhisperTranscribeSettingsPublic>
): Promise<CallSummaryExtensionPublic> {
  const stored = await readStoredExtension();
  const transcribeSettings = normalizeWhisperTranscribeSettings({
    ...normalizeWhisperTranscribeSettings(stored?.transcribeSettings),
    ...input,
  });

  await writeStoredExtension({
    activated: stored?.activated ?? false,
    modelFileName: stored?.modelFileName ?? DEFAULT_WHISPER_MODEL.fileName,
    installedAt: stored?.installedAt,
    transcribeSettings,
  });

  return getCallSummaryExtensionPublic();
}

export type InstallCallSummaryExtensionOptions = Readonly<{
  modelFileName?: string;
  forceRedownload?: boolean;
}>;

async function ensureVadModel(
  sendProgress: ProgressSender = () => undefined
): Promise<void> {
  const vadPath = join(getModelsDir(), WHISPER_VAD_MODEL_FILE);
  try {
    const fileStat = await stat(vadPath);
    if (fileStat.size >= WHISPER_VAD_MODEL_MIN_BYTES) {
      return;
    }
  } catch {
    // download below
  }

  sendProgress({
    phase: 'downloading',
    message: 'Stahuji VAD model (Silero)…',
    percent: 0,
  });

  await downloadFile(WHISPER_VAD_MODEL_URL, vadPath, (loaded, total) => {
    const percent =
      total && total > 0
        ? Math.min(99, Math.round((loaded / total) * 100))
        : undefined;
    sendProgress({
      phase: 'downloading',
      message: 'Stahuji VAD model…',
      percent,
    });
  });
}

async function loadRecordingPcmSidecar(
  recordingPath: string,
  sampleRate = 48_000
): Promise<Float32Array> {
  const { pcmPath } = getRecordingArtifactPaths(recordingPath);
  try {
    const raw = await readFile(pcmPath);
    if (raw.byteLength < 4) {
      throw new Error('PCM sidecar is empty');
    }
    const pcm48 = new Float32Array(
      raw.buffer,
      raw.byteOffset,
      Math.floor(raw.byteLength / 4)
    );
    if (pcm48.length === 0) {
      throw new Error('PCM sidecar is empty');
    }
    return preparePcmForWhisper(pcm48, sampleRate);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'PCM sidecar missing';
    throw new Error(
      `Chybí PCM data nahrávky (${message}). Přepis vyžaduje soubor ${pcmPath}.`
    );
  }
}

function downloadFile(
  url: string,
  destination: string,
  onProgress: (loaded: number, total: number | null) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = httpsGet(url, response => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        downloadFile(response.headers.location, destination, onProgress)
          .then(resolve)
          .catch(reject);
        response.resume();
        return;
      }

      if (response.statusCode !== 200) {
        reject(
          new Error(
            `Stažení modelu selhalo (HTTP ${response.statusCode ?? 'unknown'})`
          )
        );
        response.resume();
        return;
      }

      const total = Number(response.headers['content-length'] ?? 0) || null;
      let loaded = 0;
      const fileStream = createWriteStream(destination);

      response.on('data', chunk => {
        loaded += chunk.length;
        onProgress(loaded, total);
      });

      response.pipe(fileStream);
      fileStream.on('finish', () => resolve());
      fileStream.on('error', reject);
      response.on('error', reject);
    });

    request.on('error', reject);
  });
}

export async function installCallSummaryExtension(
  sendProgress: ProgressSender,
  options: InstallCallSummaryExtensionOptions = {}
): Promise<CallSummaryExtensionPublic> {
  sendProgress({
    phase: 'checking',
    message: 'Kontroluji lokální Whisper…',
  });

  resetWhisperRuntimeCheck();
  const runtime = await checkWhisperRuntime();
  if (!runtime.ready) {
    const message =
      runtime.error ??
      'Nelze načíst whisper-cpp-node. Zkuste znovu spustit instalaci závislostí.';
    sendProgress({ phase: 'error', message });
    throw new Error(message);
  }

  const modelFileName =
    options.modelFileName ?? DEFAULT_WHISPER_MODEL.fileName;
  if (!WHISPER_MODEL_CATALOG.some(model => model.fileName === modelFileName)) {
    throw new Error(`Neznámý Whisper model: ${modelFileName}`);
  }

  const modelsDir = getModelsDir();
  await mkdir(modelsDir, { recursive: true });

  const modelPath = await getModelPath(modelFileName);
  let existing = await isModelReady(modelFileName);

  if (options.forceRedownload && existing.sizeBytes != null) {
    sendProgress({
      phase: 'checking',
      message: 'Odstraňuji starý model…',
    });
    try {
      await unlink(modelPath);
    } catch {
      // ignore missing file
    }
    existing = { ready: false, sizeBytes: null };
  }

  if (!existing.ready) {
    const downloadUrl = getWhisperModelDownloadUrl(modelFileName);
    const downloadLabel = getWhisperModelDownloadLabel(modelFileName);
    sendProgress({
      phase: 'downloading',
      message: `Stahuji ${modelFileName} (${downloadLabel})…`,
      percent: 0,
    });

    await downloadFile(downloadUrl, modelPath, (loaded, total) => {
      const percent =
        total && total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : undefined;
      sendProgress({
        phase: 'downloading',
        message: `Stahuji ${modelFileName}…`,
        percent,
      });
    });
  }

  sendProgress({
    phase: 'verifying',
    message: 'Ověřuji model…',
    percent: 100,
  });

  const verified = await isModelReady(modelFileName);
  if (!verified.ready) {
    const message = 'Stažený model je neúplný. Zkuste instalaci zopakovat.';
    sendProgress({ phase: 'error', message });
    throw new Error(message);
  }

  await ensureVadModel(sendProgress);

  const installedAt = Date.now();
  const storedExtension = await readStoredExtension();
  await writeStoredExtension({
    activated: true,
    modelFileName,
    installedAt,
    transcribeSettings: storedExtension?.transcribeSettings,
  });

  sendProgress({
    phase: 'complete',
    message: 'Rozšíření Sumarizace hovoru je aktivní.',
    percent: 100,
  });

  log.info('call summary extension installed');
  return getCallSummaryExtensionPublic();
}

function formatTranscriptMarkdown(options: {
  conversationTitle: string;
  startedAt: number;
  endedAt: number;
  result: TranscribePcmResult;
  activityLog?: SpeakerActivityLog | null;
  alignedSegments?: ReadonlyArray<AlignedTranscriptSegment>;
  localSpeakerDisplayName?: string;
  whisperModelLabel?: string;
}): string {
  const lines = [
    `# Přepis hovoru: ${options.conversationTitle}`,
    '',
    `- Začátek: ${new Date(options.startedAt).toLocaleString('cs-CZ')}`,
    `- Konec: ${new Date(options.endedAt).toLocaleString('cs-CZ')}`,
    `- Délka: ${Math.round((options.endedAt - options.startedAt) / 1000)} s`,
  ];

  if (options.whisperModelLabel) {
    lines.push(`- Whisper model: ${options.whisperModelLabel}`);
  }

  lines.push('', '## Přepis', '');

  const alignedSegments =
    options.alignedSegments ??
    alignWhisperSegmentsWithSpeakerActivity(
      options.result.segments,
      options.activityLog,
      { localSpeakerDisplayName: options.localSpeakerDisplayName }
    );

  if (alignedSegments.length > 0) {
    lines.push(formatAlignedSegmentsForDisplay(alignedSegments));
    lines.push('');
  } else if (options.result.text) {
    lines.push(options.result.text);
    lines.push('');
  } else {
    lines.push('_Přepis je prázdný._');
    lines.push('');
  }

  return lines.join('\n');
}

async function loadSpeakerActivityLog(
  recordingPath: string
): Promise<SpeakerActivityLog | null> {
  const { speakerActivityPath: activityPath } =
    getRecordingArtifactPaths(recordingPath);
  try {
    const raw = await readFile(activityPath, 'utf8');
    const parsed = JSON.parse(raw) as SpeakerActivityLog;
    if (parsed?.version !== 1 || !Array.isArray(parsed.samples)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function transcribeCallRecording(options: {
  jobId?: string;
  pcmf32?: Float32Array;
  conversationId: string;
  conversationTitle: string;
  startedAt: number;
  endedAt: number;
  recordingPath: string;
  background?: boolean;
  localSpeakerDisplayName?: string;
  onProgress?: TranscriptionProgressCallback;
}): Promise<{
  transcriptPath: string;
  transcriptText: string;
  summaryPath?: string;
  summaryText?: string;
}> {
  try {
  const extension = await getCallSummaryExtensionPublic();
  if (!extension.activated || !extension.modelFileName) {
    throw new Error('Rozšíření Sumarizace hovoru není aktivní.');
  }

  throwIfTranscriptionCancelled(options.jobId);

  const report: TranscriptionProgressCallback = update => {
    options.onProgress?.({
      percent: clampProgressPercent(update.percent),
      phase: update.phase,
      detail: update.detail,
    });
  };

  report({ percent: 1, phase: 'prepare', detail: 'Načítám audio nahrávky…' });

  const modelPath = await getModelPath(extension.modelFileName);
  throwIfTranscriptionCancelled(options.jobId);
  const activityLog = await loadSpeakerActivityLog(options.recordingPath);
  const pcmf32 = await loadRecordingPcmSidecar(options.recordingPath);
  const background = options.background === true;

  report({ percent: 4, phase: 'prepare', detail: 'Audio připraveno k přepisu' });
  throwIfTranscriptionCancelled(options.jobId);

  if (!(await isVadModelReady())) {
    try {
      await ensureVadModel();
    } catch (error) {
      log.warn('VAD model download skipped', error);
    }
  }

  const pcmDurationMs = (pcmf32.length / 16_000) * 1000;
  const transcribeSettings = extension.transcribeSettings;
  const whisperRuntime = buildWhisperRuntimeOptions(
    transcribeSettings,
    pcmDurationMs
  );
  const speakerActivityCoversRecording =
    activityLog != null &&
    isSpeakerActivityCoverageSufficient(activityLog, pcmDurationMs);

  if (
    activityLog != null &&
    activityLog.samples.length > 0 &&
    !speakerActivityCoversRecording
  ) {
    const coveredSec = Math.round(
      Math.max(
        activityLog.recordingDurationMs,
        activityLog.samples.at(-1)?.tMs ?? 0
      ) / 1000
    );
    const totalSec = Math.round(pcmDurationMs / 1000);
    log.warn(
      `speaker activity covers only ${coveredSec}s of ${totalSec}s — names only where log exists`
    );
    report({
      percent: 5,
      phase: 'whisper',
      detail: `Speaker log pokrývá jen ${coveredSec} s z ${totalSec} s — přepis celého audia…`,
    });
  }

  const whisperOnProgress = (innerPercent: number, detail?: string): void => {
    report({
      percent: 5 + (innerPercent / 100) * 85,
      phase: 'whisper',
      detail: detail ?? 'Whisper přepis',
    });
  };

  report({
    percent: 5,
    phase: 'whisper',
    detail: 'Přepis celého audia…',
  });

  let transcription: TranscriptionPipelineResult = await transcribePcm({
    modelPath,
    pcmf32,
    language: DEFAULT_WHISPER_LANGUAGE,
    background,
    jobId: options.jobId,
    runtime: whisperRuntime,
    onProgress: whisperOnProgress,
  });

  const canRetryWithSpeakerWindows =
    activityLog != null &&
    speakerActivityCoversRecording &&
    pcmDurationMs < WHISPER_MEDIUM_RECORDING_MS &&
    isFullFileTranscriptSuspiciouslyWeak(transcription.text, pcmDurationMs);

  if (canRetryWithSpeakerWindows) {
    log.info(
      'full-file transcript looks weak on short recording — trying speaker windows'
    );
    report({
      percent: 40,
      phase: 'whisper',
      detail: 'Slabý přepis — zkouším úseky podle řečníků…',
    });
    transcription = await transcribePcmWithSpeakerWindows({
      modelPath,
      pcmf32,
      activityLog,
      language: DEFAULT_WHISPER_LANGUAGE,
      background,
      jobId: options.jobId,
      localSpeakerDisplayName: options.localSpeakerDisplayName,
      runtime: whisperRuntime,
      onProgress: (innerPercent, detail) => {
        whisperOnProgress(innerPercent, detail);
      },
    });
  }

  throwIfTranscriptionCancelled(options.jobId);
  report({ percent: 90, phase: 'finalize', detail: 'Sestavuji přepis…' });

  const speakerAlignedSegments = getSpeakerAlignedSegments(transcription);
  const result = toTranscribePcmResult(transcription);

  const { basePath } = getRecordingArtifactPaths(options.recordingPath);
  const transcriptPath = `${basePath}.transcript.md`;
  const alignedSegments: Array<AlignedTranscriptSegment> =
    speakerAlignedSegments.length > 0
      ? [...speakerAlignedSegments]
      : [
          ...alignWhisperSegmentsWithSpeakerActivity(result.segments, activityLog, {
            localSpeakerDisplayName: options.localSpeakerDisplayName,
          }),
        ];
  const transcriptForAi =
    alignedSegments.length > 0
      ? formatAlignedSegmentsForAi(alignedSegments)
      : result.text;
  let transcriptForDisplay =
    alignedSegments.length > 0
      ? formatAlignedSegmentsForDisplay(alignedSegments)
      : result.text;

  const whisperModelFileName = extension.modelFileName;
  const whisperModelLabel = getWhisperModelLabel(whisperModelFileName);

  const whisperMarkdown = formatTranscriptMarkdown({
    conversationTitle: options.conversationTitle,
    startedAt: options.startedAt,
    endedAt: options.endedAt,
    result,
    activityLog,
    alignedSegments: [...alignedSegments],
    localSpeakerDisplayName: options.localSpeakerDisplayName,
    whisperModelLabel,
  });
  report({ percent: 92, phase: 'finalize', detail: 'Ukládám soubory přepisu…' });
  throwIfTranscriptionCancelled(options.jobId);
  await writeFile(`${basePath}.transcript.whisper.md`, whisperMarkdown, 'utf8');

  if (await isTranscriptCorrectionEnabled()) {
    throwIfTranscriptionCancelled(options.jobId);
    const settings = await getAiSettingsPublic();
    report({
      percent: 94,
      phase: 'ai-correction',
      detail: `AI korekce přepisu… (${formatAiModelDisplayLabel(settings.provider, settings.model)})`,
    });
    const apiKey = await getAiApiKey(settings.provider);
    if (apiKey && transcriptForAi.length > 0) {
      try {
        const corrected = await correctTranscriptWithAi({
          provider: settings.provider,
          apiKey,
          model: settings.model,
          outputLanguage: settings.outputLanguage,
          conversationTitle: options.conversationTitle,
          rawTranscript: transcriptForDisplay,
          alignedSegments:
            alignedSegments.length > 0 ? alignedSegments : undefined,
        });
        if (corrected.alignedSegments.length > 0) {
          alignedSegments.splice(
            0,
            alignedSegments.length,
            ...corrected.alignedSegments
          );
          transcriptForDisplay = formatAlignedSegmentsForDisplay(
            corrected.alignedSegments
          );
        } else if (corrected.text.length > 0) {
          transcriptForDisplay = corrected.text;
        }
        await writeFile(
          `${basePath}.transcript.corrected.md`,
          formatTranscriptMarkdown({
            conversationTitle: options.conversationTitle,
            startedAt: options.startedAt,
            endedAt: options.endedAt,
            result,
            activityLog,
            alignedSegments,
            localSpeakerDisplayName: options.localSpeakerDisplayName,
            whisperModelLabel,
          }),
          'utf8'
        );
      } catch (error) {
        log.warn('transcript AI correction failed', error);
      }
    }
  }

  throwIfTranscriptionCancelled(options.jobId);
  const markdown = formatTranscriptMarkdown({
    conversationTitle: options.conversationTitle,
    startedAt: options.startedAt,
    endedAt: options.endedAt,
    result,
    activityLog,
    alignedSegments,
    localSpeakerDisplayName: options.localSpeakerDisplayName,
    whisperModelLabel,
  });
  await writeFile(transcriptPath, markdown, 'utf8');
  await writeCallTranscriptMetadata(basePath, {
    whisperModelFileName,
    whisperModelLabel,
    transcribedAt: Date.now(),
  });

  const correctedTranscriptForAi =
    alignedSegments.length > 0
      ? formatAlignedSegmentsForAi(alignedSegments)
      : transcriptForDisplay;

  let summaryPath: string | undefined;
  if (await isAiSummaryEnabled()) {
    throwIfTranscriptionCancelled(options.jobId);
    const settings = await getAiSettingsPublic();
    report({
      percent: 97,
      phase: 'ai-correction',
      detail: `AI shrnutí hovoru… (${formatAiModelDisplayLabel(settings.provider, settings.model)})`,
    });
    const apiKey = await getAiApiKey(settings.provider);
    if (apiKey && correctedTranscriptForAi.length > 0) {
      const summaryText = await generateAiSummaryForProvider({
        provider: settings.provider,
        apiKey,
        model: settings.model,
        outputLanguage: settings.outputLanguage,
        conversationTitle: options.conversationTitle,
        scopeLabel: 'Přepis hovoru',
        transcript: correctedTranscriptForAi,
      });
      summaryPath = `${basePath}.summary.md`;
      await writeFile(summaryPath, summaryText, 'utf8');
    }
  }

  report({ percent: 100, phase: 'finalize', detail: 'Přepis dokončen' });

  let summaryText: string | undefined;
  if (summaryPath) {
    try {
      summaryText = (await readFile(summaryPath, 'utf8')).trim();
    } catch {
      summaryText = undefined;
    }
  }

  return {
    transcriptPath,
    transcriptText: transcriptForDisplay,
    summaryPath,
    summaryText,
  };
  } finally {
    clearTranscriptionJobCancellation(options.jobId);
  }
}

export async function generateCallRecordingSummary(options: {
  jobId?: string;
  recordingPath: string;
  conversationTitle: string;
  localSpeakerDisplayName?: string;
  onProgress?: TranscriptionProgressCallback;
}): Promise<{ summaryPath: string; summaryText: string }> {
  try {
    throwIfTranscriptionCancelled(options.jobId);

    if (!(await isAiSummaryEnabled())) {
      throw new Error('AI shrnutí není zapnuté v nastavení.');
    }

    const settings = await getAiSettingsPublic();
    const apiKey = await getAiApiKey(settings.provider);
    if (!apiKey) {
      throw new Error('Chybí API klíč pro AI shrnutí.');
    }

    const { basePath } = getRecordingArtifactPaths(options.recordingPath);
    const transcriptPath = `${basePath}.transcript.md`;
    let transcript: string;
    try {
      transcript = (await readFile(transcriptPath, 'utf8')).trim();
    } catch {
      throw new Error('Přepis nahrávky neexistuje — nejdřív spusťte přepis.');
    }

    if (transcript.length === 0) {
      throw new Error('Přepis nahrávky je prázdný.');
    }

    if (options.localSpeakerDisplayName) {
      transcript = replaceLegacyLocalSpeakerLabels(
        transcript,
        options.localSpeakerDisplayName
      );
    }

    options.onProgress?.({
      percent: 20,
      phase: 'ai-correction',
      detail: formatAiSummaryProgressMessage(settings.provider, settings.model),
    });
    throwIfTranscriptionCancelled(options.jobId);

    const summaryText = await generateAiSummaryForProvider({
      provider: settings.provider,
      apiKey,
      model: settings.model,
      outputLanguage: settings.outputLanguage,
      conversationTitle: options.conversationTitle,
      scopeLabel: 'Přepis hovoru',
      transcript,
    });

    throwIfTranscriptionCancelled(options.jobId);

    const summaryPath = `${basePath}.summary.md`;
    await writeFile(summaryPath, summaryText, 'utf8');

    options.onProgress?.({
      percent: 100,
      phase: 'finalize',
      detail: 'Shrnutí uloženo',
    });

    return {
      summaryPath,
      summaryText: summaryText.trim(),
    };
  } finally {
    clearTranscriptionJobCancellation(options.jobId);
  }
}

export function createExtensionProgressSender(
  webContents: WebContents | null | undefined
): ProgressSender {
  return progress => {
    if (!webContents || webContents.isDestroyed()) {
      return;
    }
    webContents.send('minutes:call-summary-extension-progress', progress);
  };
}
