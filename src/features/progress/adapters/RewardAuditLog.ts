import { JsonFileStore, type FileFetcher } from '../../../adapters/siyuan/JsonFileStore.js';

export type AuditKind = 'reward' | 'connection';
export interface AuditEntry {
  at: number;
  kind: AuditKind;
  action: string;
  rewardId?: string;
  from?: string;
  to?: string;
  count?: number;
  gold?: number | null;
  message?: string;
}
interface AuditDocument {
  version: 1;
  entries: AuditEntry[];
}
const MAX_ENTRIES = 200;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isEntry(value: unknown): value is AuditEntry {
  return (
    record(value) &&
    typeof value.at === 'number' &&
    (value.kind === 'reward' || value.kind === 'connection') &&
    typeof value.action === 'string'
  );
}
function isDocument(value: unknown): value is AuditDocument {
  return (
    record(value) &&
    value.version === 1 &&
    Array.isArray(value.entries) &&
    value.entries.every(isEntry)
  );
}

/**
 * Persists the reward and connection history next to the progress file so a
 * later support request can reconstruct what happened without exposing it in
 * the panel. Best effort: a broken audit write must never block rewards.
 */
export class RewardAuditLog {
  private readonly file: JsonFileStore;
  private entries: AuditEntry[] = [];
  private writes: Promise<void> = Promise.resolve();

  constructor(name: string, fetcher?: FileFetcher) {
    this.file = new JsonFileStore(name, 'reward-audit.json', fetcher);
  }
  get path(): string {
    return this.file.path;
  }
  async load(): Promise<void> {
    try {
      const value = await this.file.read();
      if (isDocument(value)) this.entries = value.entries.slice(-MAX_ENTRIES);
    } catch (error) {
      console.warn('[gamify] 无法读取奖励审计日志，将从新的记录开始', error);
    }
  }
  record(entry: AuditEntry): void {
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries = this.entries.slice(-MAX_ENTRIES);
    console.info('[gamify] 奖励审计', entry);
    const document: AuditDocument = { version: 1, entries: this.entries };
    this.writes = this.writes
      .then(() => this.file.write(document))
      .catch((error: unknown) => {
        console.warn('[gamify] 无法写入奖励审计日志', error);
      });
  }
  async flush(): Promise<void> {
    await this.writes;
  }
}
