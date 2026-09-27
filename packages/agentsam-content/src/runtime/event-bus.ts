import type {
  ContentEvent,
  ContentEventBus,
  ContentEventListener,
  ContentEventType,
} from "../core/events.js";

export class InMemoryEventBus implements ContentEventBus {
  private listeners = new Map<string, Set<ContentEventListener>>();
  private log: ContentEvent[] = [];
  private maxLog: number;

  constructor(options: { maxLog?: number } = {}) {
    this.maxLog = options.maxLog ?? 5000;
  }

  emit(event: ContentEvent): void {
    this.log.push(event);
    if (this.log.length > this.maxLog) this.log.splice(0, this.log.length - this.maxLog);
    for (const key of [event.type, "*"]) {
      for (const listener of this.listeners.get(key) ?? []) {
        try {
          void listener(event);
        } catch {
          // listeners must not break the pipeline
        }
      }
    }
  }

  on(type: ContentEventType | "*", listener: ContentEventListener): () => void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
    return () => set.delete(listener);
  }

  history(filter?: { assetId?: string; type?: ContentEventType }): ContentEvent[] {
    return this.log.filter(
      (e) =>
        (!filter?.assetId || e.assetId === filter.assetId) &&
        (!filter?.type || e.type === filter.type),
    );
  }
}
