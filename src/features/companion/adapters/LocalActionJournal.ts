import type { ActionJournal } from '../application/ports.js';
import { companionAction } from '../domain/types.js';
import type { CompanionAction, ActionRecord } from '../domain/types.js';
export type ActionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class LocalActionJournal implements ActionJournal {
  private readonly key: string;
  constructor(
    scope: string,
    account: string,
    private readonly storage?: ActionStorage,
  ) {
    this.key = scope + ':action:' + account;
  }
  private get store(): ActionStorage {
    return this.storage ?? globalThis.localStorage;
  }
  hasPending(): boolean {
    // Any nonempty legacy or malformed marker keeps the pause. Never erase it on parsing failure.
    return !!this.store.getItem(this.key);
  }
  begin(action: CompanionAction, at: number): void {
    const valid = companionAction(action.kind, action.key);
    if (!Number.isFinite(at) || at < 0) throw new Error('操作记录时间不正确');
    const record: ActionRecord = { ...valid, at };
    this.store.setItem(this.key, JSON.stringify(record));
  }
  clear(): void {
    this.store.removeItem(this.key);
  }
}
