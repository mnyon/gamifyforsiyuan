import { requireCredentials } from '../domain/credentials.js';
import type { Credentials } from '../domain/credentials.js';
import type { ConnectionPorts } from './ports.js';

export async function restoreConnection(
  ports: ConnectionPorts,
): Promise<{ credentials: Credentials; restored: boolean }> {
  const { current, shared, local } = ports;
  if (current.userId && current.token && !current.syncCredentials)
    return { credentials: current, restored: false };
  const saved = await shared.read();
  if (!saved) {
    if (!current.syncCredentials) return { credentials: current, restored: false };
    const credentials = { ...current, syncCredentials: false };
    local.write(credentials);
    return { credentials, restored: false };
  }
  const credentials = { ...current, ...saved };
  local.write(credentials);
  return { credentials, restored: true };
}
export async function saveConnection(
  ports: ConnectionPorts,
  value: Credentials,
): Promise<Credentials> {
  const { current, shared, local } = ports;
  requireCredentials(value);
  if (value.syncCredentials === true) {
    const existing = await shared.read();
    if (!existing || existing.userId !== value.userId || existing.token !== value.token)
      await shared.save(value);
  } else if (current.syncCredentials === true) await shared.clear();
  const credentials = { ...value, syncCredentials: value.syncCredentials === true };
  local.write(credentials);
  return credentials;
}
