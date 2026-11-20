import type { MetadataApi } from '../src/features/territory/application/ports.js';
/** Fixture transport deliberately permits malformed payloads: production decoders validate them. */
export interface StubResponse {
  ok?: boolean;
  status?: number;
  json?(): Promise<unknown>;
  headers?: { get(name: string): string | null };
}
export interface RequestOptions extends RequestInit {
  body: string | FormData;
  headers: Record<string, string>;
}
export function stubFetch(
  handler: (url: string, options: RequestOptions) => Promise<StubResponse>,
): typeof fetch {
  return (async (input, init) => {
    const result = await handler(String(input), {
      body: '',
      headers: {},
      ...init,
    } as RequestOptions);
    const status = result.status ?? (result.ok === false ? 500 : 200);
    const response = new Response(null, { status });
    if (result.json) response.json = result.json;
    if (result.headers)
      response.headers.set('Retry-After', result.headers.get('Retry-After') || '');
    return response;
  }) as typeof fetch;
}
/** Runtime-invalid data is intentional in boundary tests, never in production sources. */
export function invalidFixture<T>(value: unknown): T {
  return value as T;
}
/** This mock dispatches by name; the adapter tests independently validate wire data. */
export type MetadataRequest = {
  after?: string | { source: string; target: string } | null;
  limit?: number;
  ids?: string[];
};
export function metadataApi(
  handler: (name: string, body: MetadataRequest) => Promise<unknown>,
): MetadataApi {
  return ((name: string, body: MetadataRequest = {}) => handler(name, body)) as MetadataApi;
}
export function jsonResponse(data: unknown): Response {
  return Response.json(data);
}
export class MemoryAtlas {
  values = new Map<string, unknown>();
  read(
    key: 'snapshot',
  ): Promise<import('../src/features/territory/application/ports.js').WorldSnapshot | null>;
  read(
    key: 'checkpoint',
  ): Promise<import('../src/features/territory/application/ports.js').Checkpoint | null>;
  async read(key: string): Promise<unknown> {
    return structuredClone(this.values.get(key) ?? null);
  }
  async write(key: 'snapshot' | 'checkpoint', value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }
}
