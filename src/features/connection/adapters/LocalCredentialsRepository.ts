import type { LocalCredentialsRepository as Repository } from '../application/ports.js';
import type { Credentials } from '../domain/credentials.js';
import { parseLocalCredentials } from './credentialsSchema.js';
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;
export class LocalCredentialsRepository implements Repository {
  private readonly key: string;
  constructor(
    scope: string,
    private readonly storage?: KeyValueStorage,
  ) {
    this.key = scope + ':credentials';
  }
  read(): Credentials {
    // Preserve existing startup behavior for unavailable/corrupt local preferences.
    // This never writes, clears or changes a shared connection file.
    try {
      return parseLocalCredentials(
        JSON.parse((this.storage ?? globalThis.localStorage).getItem(this.key) || '{}'),
      );
    } catch {
      return {};
    }
  }
  write(value: Credentials): void {
    (this.storage ?? globalThis.localStorage).setItem(
      this.key,
      JSON.stringify(parseLocalCredentials(value)),
    );
  }
}
