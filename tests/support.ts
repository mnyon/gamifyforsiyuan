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
