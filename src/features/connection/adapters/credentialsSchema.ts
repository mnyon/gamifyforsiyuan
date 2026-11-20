import { validCredential } from '../domain/credentials.js';
import type { Credentials, SharedCredentials } from '../domain/credentials.js';
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function parseLocalCredentials(value: unknown): Credentials {
  if (!object(value)) throw new Error('本机连接信息格式不正确');
  for (const key of ['userId', 'token'])
    if (value[key] !== undefined && typeof value[key] !== 'string')
      throw new Error('本机连接信息格式不正确');
  for (const key of ['sound', 'syncCredentials'])
    if (value[key] !== undefined && typeof value[key] !== 'boolean')
      throw new Error('本机连接信息格式不正确');
  return value as Credentials;
}
export function parseSharedCredentials(value: unknown): SharedCredentials | null {
  if (!object(value) || value.version !== 1) throw new Error('同步连接信息格式不正确');
  if (value.enabled === false) return null;
  if (value.enabled !== true || !validCredential(value.userId) || !validCredential(value.token))
    throw new Error('同步连接信息格式不正确');
  return { userId: value.userId, token: value.token, syncCredentials: true };
}
