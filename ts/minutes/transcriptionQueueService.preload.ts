// Copyright 2026 minutes contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { ipcRenderer, type IpcRendererEvent } from 'electron';

import { createLogger } from '../logging/log.std.ts';
import { drop } from '../util/drop.std.ts';
import type {
  CallRecordingMetadata,
  CallRecordingOutput,
} from './types.std.ts';
import { isCallSummaryExtensionActive } from './callSummaryExtensionService.preload.ts';
import { summaryUi } from './summaryUiEvents.std.ts';
import { isTranscriptionCancelledError } from './transcriptionCancel.std.ts';
import type {
  TranscriptionJobKind,
  TranscriptionJobStatus,
  TranscriptionQueueSnapshot,
} from './transcriptionQueue.std.ts';
import type { TranscriptionProgressPhase } from './transcriptionProgress.std.ts';
import { clampProgressPercent } from './transcriptionProgress.std.ts';
import { emitTranscriptionQueueSnapshot } from './transcriptionQueueEvents.std.ts';
import type { CallRecordingCatalogEntry } from './recordingsCatalog.std.ts';
import { getLocalSpeakerDisplayName } from './localSpeakerName.preload.ts';
import { getRecordingArtifactPaths } from './recordingArtifacts.std.ts';

const log = createLogger('minutes/transcriptionQueue');

type MutableJob = {
  id: string;
  kind: TranscriptionJobKind;
  metadata: CallRecordingMetadata;
  status: TranscriptionJobStatus;
  progress: number;
  progressPhase?: TranscriptionProgressPhase;
  progressDetail?: string;
  output?: CallRecordingOutput;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  cancelRequested?: boolean;
};

class TranscriptionQueueService {
  #jobs: Array<MutableJob> = [];
  #queuePaused = false;
  #processing = false;
  #activeJobId: string | null = null;
  #panelOpen = false;

  constructor() {
    ipcRenderer.on('minutes:call-transcription-progress', this.#onProgress);
  }

  isPanelOpen(): boolean {
    return this.#panelOpen;
  }

  setPanelOpen(open: boolean): void {
    this.#panelOpen = open;
  }

  enqueue(
    metadata: CallRecordingMetadata,
    kind: TranscriptionJobKind = 'transcription'
  ): void {
    if (kind === 'transcription' && !isCallSummaryExtensionActive()) {
      return;
    }

    const duplicate = this.#jobs.some(
      job =>
        job.kind === kind &&
        job.metadata.filePath === metadata.filePath &&
        (job.status === 'queued' || job.status === 'processing')
    );
    if (duplicate) {
      log.warn('enqueue: duplicate job skipped', metadata.filePath);
      return;
    }

    this.#jobs.push({
      id: `${kind}-${metadata.startedAt}-${metadata.conversationId}`,
      kind,
      metadata,
      status: 'queued',
      progress: 0,
      createdAt: Date.now(),
    });

    this.#emit();
    this.#panelOpen = true;
    drop(this.#processNext());
  }

  enqueueFromCatalog(
    entry: CallRecordingCatalogEntry,
    kind: TranscriptionJobKind
  ): boolean {
    const metadata: CallRecordingMetadata = {
      conversationId: entry.conversationId,
      conversationTitle: entry.conversationTitle,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      filePath: entry.recordingPath,
      durationMs: entry.durationMs,
    };

    if (kind === 'transcription' && !entry.hasPcmSidecar) {
      return false;
    }
    if (kind === 'summary' && !entry.hasTranscript) {
      return false;
    }

    this.enqueue(metadata, kind);
    return true;
  }

  pauseQueue(): void {
    this.#queuePaused = true;
    this.#emit();
  }

  resumeQueue(): void {
    this.#queuePaused = false;
    this.#emit();
    drop(this.#processNext());
  }

  retryJob(jobId: string): void {
    const job = this.#jobs.find(entry => entry.id === jobId);
    if (!job || job.status !== 'failed') {
      return;
    }
    job.status = 'queued';
    job.progress = 0;
    job.progressPhase = undefined;
    job.progressDetail = undefined;
    job.output = undefined;
    job.error = undefined;
    job.startedAt = undefined;
    job.completedAt = undefined;
    this.#queuePaused = false;
    this.#emit();
    drop(this.#processNext());
  }

  cancelJob(jobId: string): void {
    const job = this.#jobs.find(entry => entry.id === jobId);
    if (!job) {
      return;
    }

    if (job.status === 'queued') {
      job.status = 'cancelled';
      job.completedAt = Date.now();
      this.#emit();
      return;
    }

    if (job.status === 'processing' && job.id === this.#activeJobId) {
      job.cancelRequested = true;
      job.progressDetail = 'Rušení po dokončení aktuálního kroku…';
      drop(
        ipcRenderer.invoke('minutes:cancel-transcription-job', {
          jobId: job.id,
        })
      );
      this.#emit();
    }
  }

  cancelAllActive(): void {
    for (const job of this.#jobs) {
      if (job.status === 'queued') {
        job.status = 'cancelled';
        job.completedAt = Date.now();
      }
    }

    const processing = this.#jobs.find(
      entry => entry.status === 'processing' && entry.id === this.#activeJobId
    );
    if (processing) {
      processing.cancelRequested = true;
      processing.progressDetail = 'Rušení po dokončení aktuálního kroku…';
      drop(
        ipcRenderer.invoke('minutes:cancel-transcription-job', {
          jobId: processing.id,
        })
      );
    }

    this.#emit();
  }

  removeJob(jobId: string): void {
    const job = this.#jobs.find(entry => entry.id === jobId);
    if (!job || job.status === 'processing') {
      return;
    }
    this.#jobs = this.#jobs.filter(entry => entry.id !== jobId);
    this.#emit();
  }

  clearCompleted(): void {
    this.#jobs = this.#jobs.filter(
      job => job.status !== 'completed' && job.status !== 'cancelled'
    );
    this.#emit();
  }

  getSnapshot(): TranscriptionQueueSnapshot {
    return this.#snapshot();
  }

  readonly #onProgress = (
    _event: IpcRendererEvent,
    payload: {
      percent?: number;
      jobId?: string;
      phase?: TranscriptionProgressPhase;
      detail?: string;
    }
  ): void => {
    const jobId = payload.jobId ?? this.#activeJobId;
    if (!jobId) {
      return;
    }
    const job = this.#jobs.find(entry => entry.id === jobId);
    if (!job || job.status !== 'processing') {
      return;
    }
    if (job.cancelRequested) {
      return;
    }
    if (typeof payload.percent === 'number') {
      job.progress = clampProgressPercent(payload.percent);
    }
    if (payload.phase) {
      job.progressPhase = payload.phase;
    }
    if (payload.detail) {
      job.progressDetail = payload.detail;
    }
    this.#emit();
  };

  #snapshot(): TranscriptionQueueSnapshot {
    return {
      jobs: this.#jobs.map(job => ({ ...job })),
      queuePaused: this.#queuePaused,
      activeJobId: this.#activeJobId,
      panelOpen: this.#panelOpen,
    };
  }

  #emit(): void {
    emitTranscriptionQueueSnapshot(this.#snapshot());
  }

  async #processNext(): Promise<void> {
    if (this.#processing || this.#queuePaused) {
      return;
    }

    const job = this.#jobs.find(entry => entry.status === 'queued');
    if (!job) {
      return;
    }

    this.#processing = true;
    this.#activeJobId = job.id;
    job.status = 'processing';
    job.progress = 0;
    job.progressPhase = 'prepare';
    job.progressDetail =
      job.kind === 'summary'
        ? 'Zařazeno do fronty (shrnutí)'
        : 'Zařazeno do fronty';
    job.startedAt = Date.now();
    job.error = undefined;
    this.#emit();

    try {
      const { metadata, kind } = job;

      if (kind === 'summary') {
        const result = (await ipcRenderer.invoke(
          'minutes:generate-call-recording-summary',
          {
            jobId: job.id,
            recordingPath: metadata.filePath,
            conversationTitle: metadata.conversationTitle,
            localSpeakerDisplayName: getLocalSpeakerDisplayName(),
          }
        )) as {
          summaryPath?: string;
          summaryText?: string;
        };

        const summaryPath =
          typeof result?.summaryPath === 'string' ? result.summaryPath : null;
        const summaryText =
          typeof result?.summaryText === 'string'
            ? result.summaryText.trim()
            : '';

        if (!summaryPath) {
          throw new Error('Shrnutí se nepodařilo uložit.');
        }

        job.status = 'completed';
        job.progress = 100;
        job.completedAt = Date.now();
        job.output = {
          conversationId: metadata.conversationId,
          conversationTitle: metadata.conversationTitle,
          transcriptPath: getRecordingArtifactPaths(metadata.filePath)
            .transcriptPath,
          transcriptText: '',
          summaryPath,
          summaryText,
        };
        return;
      }

      const result = (await ipcRenderer.invoke(
        'minutes:transcribe-call-recording',
        {
          jobId: job.id,
          recordingPath: metadata.filePath,
          conversationId: metadata.conversationId,
          conversationTitle: metadata.conversationTitle,
          startedAt: metadata.startedAt,
          endedAt: metadata.endedAt,
          background: true,
          localSpeakerDisplayName: getLocalSpeakerDisplayName(),
        }
      )) as {
        transcriptPath?: string;
        transcriptText?: string;
        summaryPath?: string;
        summaryText?: string;
      };

      const transcriptPath =
        typeof result?.transcriptPath === 'string'
          ? result.transcriptPath
          : null;
      const transcriptText =
        typeof result?.transcriptText === 'string'
          ? result.transcriptText.trim()
          : '';

      if (!transcriptPath) {
        throw new Error('Přepis se nepodařilo uložit.');
      }

      job.status = 'completed';
      job.progress = 100;
      job.completedAt = Date.now();
      job.output = {
        conversationId: metadata.conversationId,
        conversationTitle: metadata.conversationTitle,
        transcriptPath,
        transcriptText,
        summaryPath:
          typeof result?.summaryPath === 'string'
            ? result.summaryPath
            : undefined,
        summaryText:
          typeof result?.summaryText === 'string'
            ? result.summaryText.trim()
            : undefined,
      };

      summaryUi.showSaved({
        conversationId: metadata.conversationId,
        conversationTitle: metadata.conversationTitle,
        messageCount: 0,
        generatedAt: Date.now(),
        summaryText: transcriptText,
        transcriptText,
        filePath: transcriptPath,
        scope: { kind: 'recent', limit: 0 },
        aiSummary: job.output.summaryText,
      });
    } catch (error) {
      if (isTranscriptionCancelledError(error) || job.cancelRequested) {
        job.status = 'cancelled';
        job.error = undefined;
        job.progressDetail = undefined;
      } else {
        const message =
          error instanceof Error ? error.message : 'Přepis hovoru selhal.';
        log.error('transcription job failed', job.id, error);
        job.status = 'failed';
        job.error = message;
      }
      job.completedAt = Date.now();
      job.cancelRequested = undefined;
    } finally {
      this.#processing = false;
      this.#activeJobId = null;
      this.#emit();
      drop(this.#processNext());
    }
  }
}

export const transcriptionQueue = new TranscriptionQueueService();

export function enqueueRecordingTranscription(
  metadata: CallRecordingMetadata
): void {
  transcriptionQueue.enqueue(metadata);
}

export function openTranscriptionQueuePanel(): void {
  transcriptionQueue.setPanelOpen(true);
  emitTranscriptionQueueSnapshot(transcriptionQueue.getSnapshot());
}

export function closeTranscriptionQueuePanel(): void {
  transcriptionQueue.setPanelOpen(false);
  emitTranscriptionQueueSnapshot(transcriptionQueue.getSnapshot());
}
