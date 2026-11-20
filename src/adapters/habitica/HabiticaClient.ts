import type { HabiticaRewardClient } from '../../features/progress/adapters/HabiticaRewardGateway.js';
import type { HabiticaCompanionClient } from '../../features/companion/adapters/HabiticaCompanionGateway.js';
import { HabiticaError } from './HabiticaError.js';
import * as schema from './schema.js';
import type { Decoder } from './schema.js';
import type { CompanionUser } from '../../features/companion/domain/types.js';
export { HabiticaError } from './HabiticaError.js';
export interface Credentials {
  userId?: string;
  token?: string;
}
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface ReadOptions {
  fresh?: boolean;
  refresh?: boolean;
}
type CacheEntry = { value: unknown; at: number };
function defaultStorage(): KeyValueStore | null {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}
export class HabiticaClient implements HabiticaRewardClient, HabiticaCompanionClient {
  credentials: Credentials;
  fetcher: typeof fetch;
  now: () => number;
  storage: KeyValueStore | null;
  cache: Map<string, CacheEntry>;
  reads: Map<string, Promise<unknown>>;
  blockedUntil: number;
  failures: number;
  private decode<T>(value: unknown, decoder: Decoder<T>, mutating = false): T {
    try {
      return decoder(value);
    } catch {
      throw new HabiticaError('Habitica 返回了无法读取的数据', mutating);
    }
  }
  constructor(
    credentials: Credentials,
    fetcher: typeof fetch = fetch,
    now = () => Date.now(),
    storage: KeyValueStore | null = defaultStorage(),
  ) {
    this.credentials = { ...credentials };
    this.fetcher = fetcher;
    this.now = now;
    this.storage = storage;
    this.cache = new Map();
    this.reads = new Map();
    this.blockedUntil = 0;
    this.failures = 0;
  }
  async request(path: string, method = 'GET', body?: object): Promise<unknown> {
    const mutating = method !== 'GET';
    if (this.now() < this.blockedUntil)
      throw new HabiticaError(
        `请求暂缓，请在 ${Math.ceil((this.blockedUntil - this.now()) / 1000)} 秒后重试`,
      );
    let response;
    try {
      response = await this.fetcher(`https://habitica.com/api/v3${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-user': this.credentials.userId || '',
          'x-api-key': this.credentials.token || '',
          'x-client': `${this.credentials.userId}-gamify-for-siyuan`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      this.blockedUntil = this.now() + Math.min(60000, 5000 * 2 ** Math.min(this.failures++, 4));
      throw new HabiticaError('暂时无法连接 Habitica，请稍后重试', mutating);
    }
    if (!response.ok) {
      let detail;
      try {
        detail = schema.object(await response.json()).message;
      } catch {
        /* Preserve HTTP explanation. */
      }
      if (response.status === 429 || response.status >= 500) {
        const retry = response.headers?.get?.('Retry-After'),
          seconds = Number(retry);
        const delay =
          retry && !Number.isFinite(seconds) ? Date.parse(retry) - this.now() : seconds * 1000;
        this.blockedUntil =
          this.now() +
          (Number.isFinite(delay) && delay > 0
            ? Math.min(delay, 86400000)
            : Math.min(300000, 30000 * 2 ** Math.min(this.failures++, 3)));
      }
      throw new HabiticaError(
        response.status === 401
          ? 'User ID 或 API Token 不正确'
          : response.status === 429
            ? 'Habitica 请求较频繁，请稍后重试'
            : typeof detail === 'string'
              ? detail.slice(0, 240)
              : `Habitica 暂时不可用（${response.status}）`,
        mutating && response.status >= 500,
      );
    }
    let result;
    try {
      result = schema.object(await response.json());
    } catch {
      throw new HabiticaError('Habitica 返回了无法读取的响应', mutating);
    }
    if (result.success !== true) throw new HabiticaError('Habitica 未能完成请求', mutating);
    this.failures = 0;
    return result.data;
  }
  async read<T>(
    path: string,
    ttl: number,
    decoder: Decoder<T>,
    { fresh = false, refresh = false }: ReadOptions = {},
  ): Promise<T> {
    const inflight = this.reads.get(path);
    if (inflight) return this.decode(await inflight, decoder);
    const cached = this.cache.get(path),
      age = cached ? this.now() - cached.at : Infinity;
    if (!fresh && cached && age < (refresh ? 15000 : ttl))
      return this.decode(cached.value, decoder);
    const pending = this.request(path)
      .then((value) => {
        const decoded = this.decode(value, decoder);
        this.cache.set(path, { value: decoded, at: this.now() });
        return decoded;
      })
      .finally(() => this.reads.delete(path));
    this.reads.set(path, pending);
    return pending;
  }
  user(options?: ReadOptions) {
    return this.read('/user', 60000, schema.user, options);
  }
  rememberUser(user: CompanionUser) {
    this.cache.set('/user', { value: user, at: this.now() });
  }
  invalidateUser() {
    this.cache.delete('/user');
  }
  async content(language = 'zh') {
    const locale = /^[\w-]+$/.test(language) ? language : 'zh',
      path = `/content?language=${locale}`,
      key = `gamify:content:v1:${locale}`;
    if (!this.cache.has(path)) {
      try {
        const saved = schema.object(JSON.parse(this.storage?.getItem(key) || 'null'));
        if (
          typeof saved.at === 'number' &&
          Number.isFinite(saved.at) &&
          schema.object(saved.value).spells &&
          this.now() - saved.at < 86400000
        )
          this.cache.set(path, { at: saved.at, value: schema.content(saved.value) });
      } catch {
        /* Cache is optional. */
      }
    }
    const value = await this.read(path, 86400000, schema.content);
    try {
      const { spells, gear, food, eggs, hatchingPotions, quests, potion, armoire } = value;
      this.storage?.setItem(
        key,
        JSON.stringify({
          at: this.cache.get(path)!.at,
          value: { spells, gear, food, eggs, hatchingPotions, quests, potion, armoire },
        }),
      );
    } catch {
      /* Full or unavailable local storage must not block browsing. */
    }
    return value;
  }
  shop(kind: 'market' | 'market-gear' | 'seasonal') {
    if (!['market', 'market-gear', 'seasonal'].includes(kind)) throw new Error('未知商店');
    return this.read(`/shops/${kind}`, 300000, schema.shop);
  }
  invalidateShops() {
    for (const key of this.cache.keys()) if (key.startsWith('/shops/')) this.cache.delete(key);
  }
  async cast(key: string) {
    if (!/^[a-zA-Z]+$/.test(key)) throw new Error('技能标识不正确');
    return this.decode(
      await this.request(`/user/class/cast/${key}`, 'POST'),
      schema.actionResult,
      true,
    );
  }
  async buy(key: string) {
    if (!/^[\w-]+$/.test(key)) throw new Error('商品标识不正确');
    return this.decode(
      await this.request(`/user/buy/${key}`, 'POST', { quantity: 1 }),
      schema.actionResult,
      true,
    );
  }
  async task(alias: string) {
    return this.decode(await this.request(`/tasks/${encodeURIComponent(alias)}`), schema.task);
  }
  async ensureHabit(alias: string) {
    const habits = this.decode(await this.request('/tasks/user?type=habits'), schema.tasks);
    const existing = habits.find((task) => task.alias === alias);
    if (existing) {
      if (existing.type !== 'habit' || existing.priority !== 0.1 || existing.down || !existing.up)
        throw new HabiticaError('请将专用习惯设为「琐事」、仅启用正向按钮');
      return existing;
    }
    return this.decode(
      await this.request('/tasks/user', 'POST', {
        type: 'habit',
        text: '在思源完成任务',
        alias,
        notes: '由 Gamify for SiYuan 管理。请保留琐事难度、仅正向；不要手动加分，以便核对奖励。',
        priority: 0.1,
        up: true,
        down: false,
      }),
      schema.task,
      true,
    );
  }
  async score(alias: string) {
    return this.decode(
      await this.request(`/tasks/${encodeURIComponent(alias)}/score/up`, 'POST'),
      schema.stats,
      true,
    );
  }
}
