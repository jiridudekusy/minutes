// Copyright 2026 minutes contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { access, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { app } from 'electron';

import { createLogger } from '../logging/log.std.ts';
import type {
  CallRecordingCatalogEntry,
  StoredCallRecordingMetadata,
} from './recordingsCatalog.std.ts';
import type { CallRecordingOutput } from './types.std.ts';
import { readCallTranscriptMetadata } from './transcriptMetadata.main.ts';
import {
  getRecordingArtifactPaths,
  type RecordingMediaKind,
} from './recordingArtifacts.std.ts';
import {
  getPrivateRecordingPcmPath,
  resolveRecordingPcmPath,
} from './recordingPcmStorage.node.ts';

const log = createLogger('minutes/recordingsCatalog');

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isMetadataJsonFile(fileName: string): boolean {
  return (
    fileName.endsWith('.json') && !fileName.endsWith('.speaker-activity.json')
  );
}

function parseLegacyTitleFromMp3(fileName: string): string {
  const withoutExt = fileName.replace(/\.mp3$/i, '');
  const parts = withoutExt.split('_');
  if (parts.length <= 2) {
    return withoutExt;
  }
  return parts.slice(1, -1).join('_') || withoutExt;
}

async function buildCatalogEntry(
  metadata: StoredCallRecordingMetadata,
  recordingPath: string,
  mediaKind: RecordingMediaKind
): Promise<CallRecordingCatalogEntry | null> {
  if (!(await fileExists(recordingPath))) {
    return null;
  }

  const { basePath, pcmPath, transcriptPath, summaryPath } =
    getRecordingArtifactPaths(recordingPath);
  const hasPcmSidecar =
    (await resolveRecordingPcmPath({
      privatePath: getPrivateRecordingPcmPath(
        app.getPath('userData'),
        recordingPath
      ),
      legacyPath: pcmPath,
    })) != null;
  const hasTranscript = await fileExists(transcriptPath);
  const hasSummary = await fileExists(summaryPath);
  const transcriptMeta = hasTranscript
    ? await readCallTranscriptMetadata(basePath)
    : null;

  return {
    conversationId: metadata.conversationId,
    conversationTitle: metadata.conversationTitle,
    startedAt: metadata.startedAt,
    endedAt: metadata.endedAt,
    durationMs: metadata.durationMs,
    mediaKind,
    recordingPath,
    hasPcmSidecar,
    hasTranscript,
    hasSummary,
    transcriptPath: hasTranscript ? transcriptPath : undefined,
    summaryPath: hasSummary ? summaryPath : undefined,
    transcriptWhisperModelFileName: transcriptMeta?.whisperModelFileName,
    transcriptWhisperModelLabel: transcriptMeta?.whisperModelLabel,
    transcriptGeneratedAt: transcriptMeta?.transcribedAt,
  };
}

export async function listCallRecordings(
  recordingsDir: string
): Promise<Array<CallRecordingCatalogEntry>> {
  let fileNames: Array<string>;
  try {
    fileNames = await readdir(recordingsDir);
  } catch (error) {
    log.warn('listCallRecordings: cannot read directory', error);
    return [];
  }

  const entries = new Map<string, CallRecordingCatalogEntry>();
  const metadataFiles = fileNames.filter(isMetadataJsonFile);

  for (const fileName of metadataFiles) {
    const jsonPath = join(recordingsDir, fileName);
    try {
      const raw = await readFile(jsonPath, 'utf8');
      const parsed = JSON.parse(raw) as StoredCallRecordingMetadata;
      const audioFile =
        typeof parsed.audioFile === 'string' ? parsed.audioFile : undefined;
      const videoFile =
        parsed.mediaKind === 'screen-share-video' &&
        typeof parsed.videoFile === 'string'
          ? parsed.videoFile
          : undefined;
      const recordingFile = videoFile ?? audioFile;
      if (
        typeof parsed.conversationId !== 'string' ||
        typeof parsed.conversationTitle !== 'string' ||
        !recordingFile ||
        typeof parsed.startedAt !== 'number' ||
        typeof parsed.endedAt !== 'number'
      ) {
        continue;
      }

      const mediaKind: RecordingMediaKind = videoFile
        ? 'screen-share-video'
        : 'audio';
      const recordingPath = join(recordingsDir, recordingFile);
      const entry = await buildCatalogEntry(parsed, recordingPath, mediaKind);
      if (entry) {
        entries.set(entry.recordingPath, entry);
      }
    } catch (error) {
      log.warn(`listCallRecordings: skip ${fileName}`, error);
    }
  }

  for (const fileName of fileNames) {
    if (!fileName.toLowerCase().endsWith('.mp3')) {
      continue;
    }

    const mp3Path = join(recordingsDir, fileName);
    if (entries.has(mp3Path)) {
      continue;
    }

    const { basePath, pcmPath, transcriptPath, summaryPath } =
      getRecordingArtifactPaths(mp3Path);
    const hasPcmSidecar =
      (await resolveRecordingPcmPath({
        privatePath: getPrivateRecordingPcmPath(
          app.getPath('userData'),
          mp3Path
        ),
        legacyPath: pcmPath,
      })) != null;
    const hasTranscript = await fileExists(transcriptPath);
    const hasSummary = await fileExists(summaryPath);
    const transcriptMeta = hasTranscript
      ? await readCallTranscriptMetadata(basePath)
      : null;
    let startedAt = Date.now();
    let durationMs = 0;
    try {
      const mp3Stat = await stat(mp3Path);
      startedAt = mp3Stat.mtimeMs;
      durationMs = 0;
    } catch {
      continue;
    }

    entries.set(mp3Path, {
      conversationId: fileName.slice(0, 8),
      conversationTitle: parseLegacyTitleFromMp3(fileName),
      startedAt,
      endedAt: startedAt,
      durationMs,
      mediaKind: 'audio',
      recordingPath: mp3Path,
      hasPcmSidecar,
      hasTranscript,
      hasSummary,
      transcriptPath: hasTranscript ? transcriptPath : undefined,
      summaryPath: hasSummary ? summaryPath : undefined,
      transcriptWhisperModelFileName: transcriptMeta?.whisperModelFileName,
      transcriptWhisperModelLabel: transcriptMeta?.whisperModelLabel,
      transcriptGeneratedAt: transcriptMeta?.transcribedAt,
    });
  }

  return [...entries.values()].sort((a, b) => b.startedAt - a.startedAt);
}

function extractTranscriptBodyFromMarkdown(markdown: string): string {
  const marker = '## Přepis';
  const index = markdown.indexOf(marker);
  if (index >= 0) {
    return markdown.slice(index + marker.length).trim();
  }
  return markdown.trim();
}

export async function loadCallRecordingOutput(
  entry: Pick<
    CallRecordingCatalogEntry,
    | 'recordingPath'
    | 'conversationId'
    | 'conversationTitle'
    | 'hasTranscript'
    | 'hasSummary'
    | 'transcriptPath'
    | 'summaryPath'
  >
): Promise<CallRecordingOutput | null> {
  const artifacts = getRecordingArtifactPaths(entry.recordingPath);
  const transcriptPath = entry.transcriptPath ?? artifacts.transcriptPath;
  const summaryPath = entry.summaryPath ?? artifacts.summaryPath;

  let transcriptText = '';
  if (entry.hasTranscript) {
    try {
      transcriptText = extractTranscriptBodyFromMarkdown(
        await readFile(transcriptPath, 'utf8')
      );
    } catch {
      return null;
    }
  }

  let summaryText: string | undefined;
  if (entry.hasSummary) {
    try {
      summaryText = (await readFile(summaryPath, 'utf8')).trim();
    } catch {
      summaryText = undefined;
    }
  }

  if (!entry.hasTranscript && !summaryText) {
    return null;
  }

  return {
    conversationId: entry.conversationId,
    conversationTitle: entry.conversationTitle,
    transcriptPath,
    transcriptText,
    summaryPath: entry.hasSummary ? summaryPath : undefined,
    summaryText,
  };
}
