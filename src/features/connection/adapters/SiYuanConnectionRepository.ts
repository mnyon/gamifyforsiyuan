import { JsonFileStore, type FileFetcher } from '../../../adapters/siyuan/JsonFileStore.js';
import type { SharedConnectionRepository } from '../application/ports.js';
import type { Credentials, SharedCredentials } from '../domain/credentials.js';
import { requireCredentials } from '../domain/credentials.js';
import { parseSharedCredentials } from './credentialsSchema.js';

export class SiYuanConnectionRepository implements SharedConnectionRepository {
  private readonly file: JsonFileStore;
  constructor(name: string, fetcher?: FileFetcher) {
    this.file = new JsonFileStore(name, 'connection.json', fetcher);
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
  async read(): Promise<SharedCredentials | null> {
    const value = await this.file.read();
    return value === null ? null : parseSharedCredentials(value);
  }
  async save(value: Credentials): Promise<void> {
    requireCredentials(value);
    await this.file.write({ version: 1, enabled: true, userId: value.userId, token: value.token });
  }
  async clear(): Promise<void> {
    await this.file.write({ version: 1, enabled: false });
  }
}
