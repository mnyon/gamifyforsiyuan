export interface Credentials {
  userId?: string;
  token?: string;
  sound?: boolean;
  syncCredentials?: boolean;
}
export interface SharedCredentials extends Credentials {
  userId: string;
  token: string;
  syncCredentials: true;
}
export function validCredential(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
}
export function requireCredentials(
  value: Credentials,
): asserts value is Credentials & { userId: string; token: string } {
  if (!validCredential(value.userId) || !validCredential(value.token))
    throw new Error('请输入完整的 User ID 和 API Token');
}
