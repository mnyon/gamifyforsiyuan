import type { Credentials, SharedCredentials } from '../domain/credentials.js';
export interface SharedConnectionRepository {
  read(): Promise<SharedCredentials | null>;
  save(value: Credentials): Promise<void>;
  clear(): Promise<void>;
}
export interface LocalCredentialsRepository {
  read(): Credentials;
  write(value: Credentials): void;
}
export interface ConnectionPorts {
  current: Credentials;
  shared: SharedConnectionRepository;
  local: Pick<LocalCredentialsRepository, 'write'>;
}
