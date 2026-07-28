// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export type AutomationJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type AutomationJob = Readonly<{
  id: string;
  kind: string;
  status: AutomationJobStatus;
  createdAt: number;
  updatedAt: number;
  progress?: number;
  progressMessage?: string;
  result?: unknown;
  error?: string;
}>;

export type AutomationJobContext = Readonly<{
  reportProgress: (progress: number, message?: string) => void;
}>;

type JobTask = (context: AutomationJobContext) => Promise<unknown>;

type MutableAutomationJob = {
  id: string;
  kind: string;
  status: AutomationJobStatus;
  createdAt: number;
  updatedAt: number;
  progress?: number;
  progressMessage?: string;
  result?: unknown;
  error?: string;
};

type QueueEntry = Readonly<{
  job: MutableAutomationJob;
  task: JobTask;
}>;

export class AutomationJobRegistry {
  readonly #maxConcurrent: number;
  readonly #idFactory: () => string;
  readonly #now: () => number;
  readonly #jobs = new Map<string, MutableAutomationJob>();
  readonly #completion = new Map<string, Promise<void>>();
  readonly #resolveCompletion = new Map<string, () => void>();
  readonly #queue: Array<QueueEntry> = [];
  #running = 0;

  constructor(
    options: Readonly<{
      maxConcurrent: number;
      idFactory?: () => string;
      now?: () => number;
    }>
  ) {
    if (
      !Number.isSafeInteger(options.maxConcurrent) ||
      options.maxConcurrent < 1
    ) {
      throw new Error('maxConcurrent must be a positive integer');
    }
    this.#maxConcurrent = options.maxConcurrent;
    this.#idFactory =
      options.idFactory ?? (() => globalThis.crypto.randomUUID());
    this.#now = options.now ?? Date.now;
  }

  enqueue(kind: string, task: JobTask): AutomationJob {
    const now = this.#now();
    const job: MutableAutomationJob = {
      id: this.#idFactory(),
      kind,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    };
    let resolveCompletion: (() => void) | undefined;
    const completion = new Promise<void>(resolve => {
      resolveCompletion = resolve;
    });
    if (resolveCompletion == null) {
      throw new Error('Failed to initialize automation job');
    }

    this.#jobs.set(job.id, job);
    this.#completion.set(job.id, completion);
    this.#resolveCompletion.set(job.id, resolveCompletion);
    this.#queue.push({ job, task });
    this.#drain();
    return { ...job };
  }

  get(id: string): AutomationJob | undefined {
    const job = this.#jobs.get(id);
    return job == null ? undefined : { ...job };
  }

  async waitFor(id: string): Promise<void> {
    const completion = this.#completion.get(id);
    if (completion == null) {
      throw new Error(`Unknown automation job: ${id}`);
    }
    await completion;
  }

  #drain(): void {
    while (this.#running < this.#maxConcurrent) {
      const entry = this.#queue.shift();
      if (entry == null) {
        return;
      }
      this.#running += 1;
      entry.job.status = 'running';
      entry.job.updatedAt = this.#now();
      void this.#run(entry);
    }
  }

  async #run({ job, task }: QueueEntry): Promise<void> {
    const activeJob = job;
    try {
      activeJob.result = await task({
        reportProgress: (progress, message) => {
          activeJob.progress = Math.max(0, Math.min(100, progress));
          activeJob.progressMessage = message;
          activeJob.updatedAt = this.#now();
        },
      });
      activeJob.status = 'completed';
      activeJob.progress = 100;
    } catch (error) {
      activeJob.status = 'failed';
      activeJob.error = error instanceof Error ? error.message : String(error);
    } finally {
      activeJob.updatedAt = this.#now();
      this.#running -= 1;
      this.#resolveCompletion.get(activeJob.id)?.();
      this.#resolveCompletion.delete(activeJob.id);
      this.#drain();
    }
  }
}
