/**
 * Host-neutral, per-file optimistic save queue for Monaco-backed workspaces.
 * Edits may arrive much faster than remote filesystem writes; serialize them
 * and only mark the most recent revision as saved. Never silently overwrite a
 * version conflict or reuse another document's version.
 */
export type SaveOutcome =
  | { ok: true; version: string; mtime?: number }
  | { ok: false; error: string; code?: string };

export type SaveStatus = 'saved' | 'modified' | 'saving' | 'conflict' | 'error';
export type SaveHost = {
  write(path: string, text: string, expectedVersion: string | null, overwrite: boolean): Promise<SaveOutcome>;
  onStatus?(path: string, status: SaveStatus, reason?: string): void;
  onCommitted?(path: string, text: string, outcome: Extract<SaveOutcome, {ok: true}>, superseded: boolean): void;
  debounceMs?: number;
};

type Entry = {
  version: string | null;
  text: string;
  revision: number;
  savedRevision: number;
  status: SaveStatus;
  timer?: ReturnType<typeof setTimeout>;
  inFlight?: Promise<void>;
};

export class WorkspaceSaveQueue {
  private readonly entries = new Map<string, Entry>();
  private readonly host: SaveHost;

  constructor(host: SaveHost) { this.host = host; }

  private get(path: string): Entry {
    if (!path?.trim()) throw new Error('ide_save_path_required');
    let entry = this.entries.get(path);
    if (!entry) {
      entry = { version: null, text: '', revision: 0, savedRevision: 0, status: 'saved' };
      this.entries.set(path, entry);
    }
    return entry;
  }

  status(path: string): SaveStatus { return this.get(path).status; }
  version(path: string): string | null { return this.get(path).version; }

  /** Update the known disk version when loading or explicitly reloading a clean buffer. */
  acceptDiskVersion(path: string, version: string): void {
    const e = this.get(path);
    // If a user began editing before the initial disk read completed, accept
    // the first version without declaring the dirty buffer clean.
    if (e.inFlight || (e.version !== null && e.revision !== e.savedRevision)) return;
    e.version = version;
    if (e.revision === e.savedRevision) {
      e.status = 'saved';
      this.host.onStatus?.(path, 'saved');
    }
  }

  /** Explicitly discard pending changes after the user chooses Reload disk. */
  discardDraft(path: string, version: string): void {
    const e = this.get(path);
    if (e.timer) clearTimeout(e.timer);
    e.timer = undefined;
    e.savedRevision = e.revision;
    e.version = version;
    e.status = 'saved';
    this.host.onStatus?.(path, 'saved');
  }

  edit(path: string, text: string): void {
    const e = this.get(path);
    e.text = text;
    e.revision++;
    if (e.status === 'conflict') return; // never auto-overwrite an unresolved disk conflict
    e.status = 'modified';
    this.host.onStatus?.(path, 'modified');
    this.schedule(path, e);
  }

  private schedule(path: string, e: Entry): void {
    if (e.timer) clearTimeout(e.timer);
    e.timer = setTimeout(() => { e.timer = undefined; void this.flush(path); }, this.host.debounceMs ?? 700);
  }

  async flush(path: string, overwrite = false): Promise<void> {
    const e = this.get(path);
    if (e.timer) clearTimeout(e.timer);
    e.timer = undefined;
    if (e.inFlight) {
      await e.inFlight;
      return this.flush(path, overwrite);
    }
    if (e.status === 'conflict' && !overwrite) return;
    if (e.revision === e.savedRevision && !overwrite) return;
    if (!overwrite && e.version === null) {
      e.status = 'error';
      this.host.onStatus?.(path, 'error', 'The file has no verified disk version; wait for the initial read or explicitly reload it.');
      return;
    }
    const revision = e.revision;
    const text = e.text;
    const expected = overwrite ? null : e.version;
    e.status = 'saving';
    this.host.onStatus?.(path, 'saving');
    const pending = (async () => {
      let result: SaveOutcome;
      try { result = await this.host.write(path, text, expected, overwrite); }
      catch (error) { result = { ok: false, error: error instanceof Error ? error.message : String(error) }; }
      if (result.ok) {
        e.version = result.version;
        e.savedRevision = revision;
        const superseded = e.revision !== revision;
        e.status = superseded ? 'modified' : 'saved';
        this.host.onCommitted?.(path, text, result, superseded);
        this.host.onStatus?.(path, e.status);
        if (superseded) this.schedule(path, e);
      } else {
        e.status = result.code === 'version_conflict' ? 'conflict' : 'error';
        this.host.onStatus?.(path, e.status, result.error);
      }
    })();
    e.inFlight = pending;
    try { await pending; } finally { e.inFlight = undefined; }
  }

  async flushAll(): Promise<void> {
    await Promise.all([...this.entries.keys()].map(path => this.flush(path)));
  }
}
