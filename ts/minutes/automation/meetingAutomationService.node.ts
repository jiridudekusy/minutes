// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';

import type {
  AutomationJob,
  AutomationJobContext,
  AutomationJobRegistry,
} from './jobRegistry.std.ts';
import {
  paginateAutomationItems,
  type AutomationPage,
} from './pagination.std.ts';
import type { CallRecordingCatalogEntry } from '../recordingsCatalog.std.ts';
import type { CallRecordingOutput } from '../types.std.ts';

export type AutomationRecording = Readonly<{
  id: string;
  conversationId: string;
  conversationTitle: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  mediaKind: CallRecordingCatalogEntry['mediaKind'];
  recordingPath: string;
  mimeType: 'audio/mpeg' | 'video/webm';
  sizeBytes: number;
  hasTranscript: boolean;
  hasSummary: boolean;
}>;

export type AutomationTextResource = Readonly<{
  uri: string;
  mimeType: 'text/markdown';
  text: string;
}>;

type RecordingJobResult = Readonly<{
  transcriptPath?: string;
  summaryPath?: string;
}>;

type MeetingAutomationDependencies = Readonly<{
  jobRegistry: AutomationJobRegistry;
  listRecordings: () => Promise<Array<CallRecordingCatalogEntry>>;
  loadRecordingOutput: (
    entry: CallRecordingCatalogEntry
  ) => Promise<CallRecordingOutput | null>;
  getFileSize: (path: string) => Promise<number>;
  transcribeRecording: (
    entry: CallRecordingCatalogEntry,
    context: AutomationJobContext
  ) => Promise<RecordingJobResult>;
  summarizeRecording: (
    entry: CallRecordingCatalogEntry,
    context: AutomationJobContext
  ) => Promise<RecordingJobResult>;
}>;

function getRecordingId(
  entry: Pick<CallRecordingCatalogEntry, 'recordingPath'>
): string {
  return createHash('sha256')
    .update(entry.recordingPath, 'utf8')
    .digest('hex')
    .slice(0, 32);
}

export class MeetingAutomationService {
  readonly #deps: MeetingAutomationDependencies;

  constructor(dependencies: MeetingAutomationDependencies) {
    this.#deps = dependencies;
  }

  static getRecordingId(
    entry: Pick<CallRecordingCatalogEntry, 'recordingPath'>
  ): string {
    return getRecordingId(entry);
  }

  async listRecordings(
    options: Readonly<{ cursor?: string; limit?: number }>
  ): Promise<AutomationPage<AutomationRecording>> {
    const recordings = await this.#loadAutomationRecordings();
    return paginateAutomationItems(recordings, {
      ...options,
      maxLimit: 100,
    });
  }

  async searchRecordings(
    options: Readonly<{
      query: string;
      cursor?: string;
      limit?: number;
    }>
  ): Promise<AutomationPage<AutomationRecording>> {
    const query = options.query.trim().toLocaleLowerCase();
    const recordings = (await this.#loadAutomationRecordings()).filter(
      recording =>
        recording.conversationTitle.toLocaleLowerCase().includes(query) ||
        recording.conversationId.toLocaleLowerCase().includes(query)
    );
    return paginateAutomationItems(recordings, {
      cursor: options.cursor,
      limit: options.limit,
      maxLimit: 100,
    });
  }

  async getRecording(id: string): Promise<AutomationRecording> {
    const recordings = await this.#loadAutomationRecordings();
    const recording = recordings.find(item => item.id === id);
    if (recording == null) {
      throw new Error('Recording not found');
    }
    return recording;
  }

  async readTranscript(id: string): Promise<AutomationTextResource> {
    const { entry, output } = await this.#loadRecordingOutput(id);
    const text = output.transcriptText.trim();
    if (!entry.hasTranscript || text.length === 0) {
      throw new Error('Recording transcript not found');
    }
    return {
      uri: `minutes://recordings/${id}/transcript`,
      mimeType: 'text/markdown',
      text,
    };
  }

  async readSummary(id: string): Promise<AutomationTextResource> {
    const { entry, output } = await this.#loadRecordingOutput(id);
    const text = output.summaryText?.trim() ?? '';
    if (!entry.hasSummary || text.length === 0) {
      throw new Error('Recording summary not found');
    }
    return {
      uri: `minutes://recordings/${id}/summary`,
      mimeType: 'text/markdown',
      text,
    };
  }

  async transcribeRecording(id: string): Promise<AutomationJob> {
    const entry = await this.#resolveCatalogEntry(id);
    return this.#deps.jobRegistry.enqueue('transcription', context =>
      this.#deps.transcribeRecording(entry, context)
    );
  }

  async summarizeRecording(id: string): Promise<AutomationJob> {
    const entry = await this.#resolveCatalogEntry(id);
    return this.#deps.jobRegistry.enqueue('summary', context =>
      this.#deps.summarizeRecording(entry, context)
    );
  }

  getJob(id: string): AutomationJob | undefined {
    return this.#deps.jobRegistry.get(id);
  }

  async #loadRecordingOutput(id: string): Promise<{
    entry: CallRecordingCatalogEntry;
    output: CallRecordingOutput;
  }> {
    const entry = await this.#resolveCatalogEntry(id);
    const output = await this.#deps.loadRecordingOutput(entry);
    if (output == null) {
      throw new Error('Recording output not found');
    }
    return { entry, output };
  }

  async #resolveCatalogEntry(id: string): Promise<CallRecordingCatalogEntry> {
    const entries = await this.#deps.listRecordings();
    const entry = entries.find(item => getRecordingId(item) === id);
    if (entry == null) {
      throw new Error('Recording not found');
    }
    return entry;
  }

  async #loadAutomationRecordings(): Promise<Array<AutomationRecording>> {
    const entries = await this.#deps.listRecordings();
    return Promise.all(
      entries.map(async entry => ({
        id: getRecordingId(entry),
        conversationId: entry.conversationId,
        conversationTitle: entry.conversationTitle,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        durationMs: entry.durationMs,
        mediaKind: entry.mediaKind,
        recordingPath: entry.recordingPath,
        mimeType:
          entry.mediaKind === 'screen-share-video'
            ? ('video/webm' as const)
            : ('audio/mpeg' as const),
        sizeBytes: await this.#deps.getFileSize(entry.recordingPath),
        hasTranscript: entry.hasTranscript,
        hasSummary: entry.hasSummary,
      }))
    );
  }
}
