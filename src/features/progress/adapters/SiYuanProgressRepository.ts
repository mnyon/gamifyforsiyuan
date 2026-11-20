import { JsonFileStore, type FileFetcher } from '../../../adapters/siyuan/JsonFileStore.js';
import type { ProgressRepository } from '../application/persistence.js';
import type { ProgressState } from '../domain/types.js';
import { parseProgress } from './progressSchema.js';

export class SiYuanProgressRepository implements ProgressRepository {
  private readonly file: JsonFileStore;
  constructor(name: string, fetcher?: FileFetcher) {
    this.file = new JsonFileStore(name, 'progress.json', fetcher);
  }
  get path(): string {
    return this.file.path;
  }
  get fetcher(): FileFetcher {
    return this.file.fetcher;
  }
  set fetcher(value: FileFetcher) {
    this.file.fetcher = value;
  }
  async read(): Promise<ProgressState | null> {
    const value = await this.file.read();
    return value === null ? null : parseProgress(value);
  }
  async write(state: ProgressState): Promise<void> {
    await this.file.write(parseProgress(state));
  }
}
