// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

import { app } from 'electron';
import type { BrowserWindow as BrowserWindowType } from 'electron';

import { createLogger } from '../logging/log.std.ts';
import { resolveMinutesRecordingsDir } from './recordingsDirectory.node.ts';
import { transcribeCallRecording } from './callSummaryExtension.main.ts';
import { getAiApiKey, getAiSettingsPublic } from './aiSettings.main.ts';
import { preparePcmForWhisper } from './whisperAudioPrep.std.ts';
import { RECORDING_PCM_SIDECAR_SUFFIX } from './whisperSettings.std.ts';
import { SPEAKER_ACTIVITY_FILE_SUFFIX } from './constants.std.ts';

const log = createLogger('minutes/testCallPipeline');

export const DEFAULT_TEST_RECORDING_BASE =
  '2026-07-09T18-48-59-973Z_Stand_Up_Zmítkovi_a0817902';

type BrowserWindowConstructor = typeof BrowserWindowType;

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadPcmForRecording(
  recordingPath: string,
  BrowserWindow: BrowserWindowConstructor
): Promise<Float32Array> {
  const basePath = recordingPath.replace(/\.mp3$/i, '');
  const pcmPath = `${basePath}${RECORDING_PCM_SIDECAR_SUFFIX}`;

  if (await fileExists(pcmPath)) {
    log.info(`using PCM sidecar: ${pcmPath}`);
    const raw = await readFile(pcmPath);
    const pcm48 = new Float32Array(
      raw.buffer,
      raw.byteOffset,
      Math.floor(raw.byteLength / 4)
    );
    return preparePcmForWhisper(pcm48, 48_000);
  }

  log.info(`decoding MP3 via hidden window: ${recordingPath}`);
  const mp3 = await readFile(recordingPath);
  const b64 = mp3.toString('base64');

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: false,
      contextIsolation: false,
      nodeIntegration: false,
    },
  });

  try {
    await win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html><html><body><script>
async function decodeMp3(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ctx = new AudioContext();
  try {
    const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
    const ch0 = audioBuffer.getChannelData(0);
    let mono;
    if (audioBuffer.numberOfChannels === 1) {
      mono = ch0.slice();
    } else {
      const ch1 = audioBuffer.getChannelData(1);
      mono = new Float32Array(ch0.length);
      for (let i = 0; i < ch0.length; i++) mono[i] = (ch0[i] + ch1[i]) / 2;
    }
    return { samples: Array.from(mono), sampleRate: audioBuffer.sampleRate };
  } finally {
    await ctx.close();
  }
}
window.decodeMp3 = decodeMp3;
</script></body></html>`)}`
    );

    const decoded = (await win.webContents.executeJavaScript(
      `window.decodeMp3(${JSON.stringify(b64)})`
    )) as { samples: Array<number>; sampleRate: number };

    const pcm = Float32Array.from(decoded.samples);
    return preparePcmForWhisper(pcm, decoded.sampleRate);
  } finally {
    win.destroy();
  }
}

type RecordingMetadata = {
  conversationId: string;
  conversationTitle: string;
  startedAt: number;
  endedAt: number;
};

async function loadRecordingMetadata(
  basePath: string
): Promise<RecordingMetadata> {
  const jsonPath = `${basePath}.json`;
  if (await fileExists(jsonPath)) {
    const raw = await readFile(jsonPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<RecordingMetadata>;
    if (
      typeof parsed.startedAt === 'number' &&
      typeof parsed.endedAt === 'number'
    ) {
      return {
        conversationId: parsed.conversationId ?? 'test-conversation',
        conversationTitle: parsed.conversationTitle ?? 'Stand Up Zmítkovi',
        startedAt: parsed.startedAt,
        endedAt: parsed.endedAt,
      };
    }
  }

  return {
    conversationId: 'a0817902',
    conversationTitle: 'Stand Up Zmítkovi',
    startedAt: Date.parse('2026-07-09T18:48:59.973Z'),
    endedAt: Date.parse('2026-07-09T18:49:30.000Z'),
  };
}

export async function runCallPipelineTest(options: {
  BrowserWindow: BrowserWindowConstructor;
  recordingBase?: string;
}): Promise<number> {
  const recordingBase =
    options.recordingBase ??
    process.env.MINUTES_TEST_RECORDING ??
    DEFAULT_TEST_RECORDING_BASE;

  const recordingsDir = resolveMinutesRecordingsDir(app.getPath('documents'));
  const recordingPath = join(recordingsDir, `${recordingBase}.mp3`);
  const basePath = join(recordingsDir, recordingBase);

  log.info(`recordings dir: ${recordingsDir}`);
  log.info(`recording: ${recordingPath}`);

  if (!(await fileExists(recordingPath))) {
    log.error(`recording not found: ${recordingPath}`);
    return 1;
  }

  const activityPath = `${basePath}${SPEAKER_ACTIVITY_FILE_SUFFIX}`;
  if (!(await fileExists(activityPath))) {
    log.warn(`speaker activity missing: ${activityPath}`);
  } else {
    log.info(`speaker activity: ${activityPath}`);
  }

  const metadata = await loadRecordingMetadata(basePath);
  const pcmf32 = await loadPcmForRecording(
    recordingPath,
    options.BrowserWindow
  );

  log.info(
    `PCM samples: ${pcmf32.length} (${(pcmf32.length / 16_000).toFixed(1)} s)`
  );

  const rawTranscriptPath = `${basePath}.transcript.raw.md`;

  let lastPercent = -1;
  const result = await transcribeCallRecording({
    conversationId: metadata.conversationId,
    conversationTitle: metadata.conversationTitle,
    startedAt: metadata.startedAt,
    endedAt: metadata.endedAt,
    recordingPath,
    onProgress: update => {
      if (update.percent !== lastPercent && update.percent % 10 === 0) {
        log.info(
          `progress: ${update.percent}%${update.detail ? ` — ${update.detail}` : ''}`
        );
        lastPercent = update.percent;
      }
    },
  });

  await writeFile(
    rawTranscriptPath,
    `# Raw pipeline output\n\n- transcript: ${result.transcriptPath}\n- summary: ${result.summaryPath ?? '(none)'}\n`,
    'utf8'
  );

  log.info(`transcript saved: ${result.transcriptPath}`);
  log.info(`whisper-only: ${basePath}.transcript.whisper.md`);
  if (await fileExists(`${basePath}.transcript.corrected.md`)) {
    log.info(`AI corrected: ${basePath}.transcript.corrected.md`);
  }
  if (result.summaryPath) {
    log.info(`summary saved: ${result.summaryPath}`);
  } else {
    const settings = await getAiSettingsPublic();
    const apiKey = await getAiApiKey(settings.provider);
    if (!settings.aiEnabled) {
      log.warn(
        'summary not generated: AI sumarizace je vypnuta v Nastaveni AI'
      );
    } else if (!apiKey) {
      log.warn(
        'summary not generated: nelze nacist API klic (set MINUTES_AI_API_KEY nebo spustte Minutes aulohu jednou)'
      );
    } else {
      log.warn('summary not generated: neznamy duvod');
    }
  }

  log.info('pipeline complete');
  return 0;
}
