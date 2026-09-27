import { newJobId } from "../core/id.js";

export type JobType =
  | "optimize"
  | "transcode"
  | "generate-variant"
  | "generate-poster"
  | "import-batch"
  | "rag-index"
  | "semantic-enrich"
  | (string & {});

export type JobState = "queued" | "running" | "done" | "failed";

export interface ContentJob<T = Record<string, unknown>> {
  id: string;
  type: JobType;
  assetId?: string;
  payload: T;
  state: JobState;
  error?: string;
  createdAt: string;
  finishedAt?: string;
}

export type JobHandler = (job: ContentJob) => Promise<void>;

/**
 * Durable-job boundary. In-memory queue for Local Studio/tests;
 * hosts back this with Cloudflare Queues (and a Go worker for
 * large batch/encode work) without the studio noticing.
 */
export interface JobQueue {
  enqueue<T extends Record<string, unknown>>(type: JobType, payload: T, assetId?: string): ContentJob<T>;
  handle(type: JobType, handler: JobHandler): void;
  /** Drain queued jobs (test/local runner). Hosts run real consumers instead. */
  drain(): Promise<ContentJob[]>;
  jobs(): ContentJob[];
}

export class InMemoryJobQueue implements JobQueue {
  private queue: ContentJob[] = [];
  private handlers = new Map<string, JobHandler>();

  enqueue<T extends Record<string, unknown>>(type: JobType, payload: T, assetId?: string): ContentJob<T> {
    const job: ContentJob<T> = {
      id: newJobId(),
      type,
      assetId,
      payload,
      state: "queued",
      createdAt: new Date().toISOString(),
    };
    this.queue.push(job as ContentJob);
    return job;
  }

  handle(type: JobType, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  async drain(): Promise<ContentJob[]> {
    const processed: ContentJob[] = [];
    for (const job of this.queue) {
      if (job.state !== "queued") continue;
      const handler = this.handlers.get(job.type);
      if (!handler) continue;
      job.state = "running";
      try {
        await handler(job);
        job.state = "done";
      } catch (err) {
        job.state = "failed";
        job.error = err instanceof Error ? err.message : String(err);
      }
      job.finishedAt = new Date().toISOString();
      processed.push(job);
    }
    return processed;
  }

  jobs(): ContentJob[] {
    return [...this.queue];
  }
}
