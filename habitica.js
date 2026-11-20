export class HabiticaError extends Error {
  constructor(message, uncertain = false) { super(message); this.uncertain = uncertain; }
}
export class HabiticaClient {
  constructor(credentials, fetcher = fetch, now = () => Date.now(), storage = globalThis.localStorage) {
    this.credentials = { ...credentials }; this.fetcher = fetcher; this.now = now; this.storage = storage;
    this.cache = new Map(); this.reads = new Map(); this.blockedUntil = 0; this.failures = 0;
  }
  async request(path, method = 'GET', body) {
    const mutating = method !== 'GET';
    if (this.now() < this.blockedUntil) throw new HabiticaError(`请求暂缓，请在 ${Math.ceil((this.blockedUntil - this.now()) / 1000)} 秒后重试`);
    let response;
    try {
      response = await this.fetcher(`https://habitica.com/api/v3${path}`, {
        method, headers: { 'Content-Type': 'application/json', 'x-api-user': this.credentials.userId,
          'x-api-key': this.credentials.token, 'x-client': `${this.credentials.userId}-gamify-for-siyuan` },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000)
      });
    } catch {
      this.blockedUntil = this.now() + Math.min(60000, 5000 * 2 ** Math.min(this.failures++, 4));
      throw new HabiticaError('暂时无法连接 Habitica，请稍后重试', mutating);
    }
    if (!response.ok) {
      let detail; try { detail = (await response.json()).message; } catch { /* Preserve HTTP explanation. */ }
      if (response.status === 429 || response.status >= 500) {
        const retry = response.headers?.get?.('Retry-After'), seconds = Number(retry);
        const delay = retry && !Number.isFinite(seconds) ? Date.parse(retry) - this.now() : seconds * 1000;
        this.blockedUntil = this.now() + (Number.isFinite(delay) && delay > 0 ? Math.min(delay, 86400000) : Math.min(300000, 30000 * 2 ** Math.min(this.failures++, 3)));
      }
      throw new HabiticaError(response.status === 401 ? 'User ID 或 API Token 不正确' : response.status === 429 ? 'Habitica 请求较频繁，请稍后重试' : typeof detail === 'string' ? detail.slice(0, 240) : `Habitica 暂时不可用（${response.status}）`, mutating && response.status >= 500);
    }
    let result;
    try { result = await response.json(); } catch { throw new HabiticaError('Habitica 返回了无法读取的响应', mutating); }
    if (!result.success) throw new HabiticaError('Habitica 未能完成请求', mutating);
    this.failures = 0;
    return result.data;
  }
  async read(path, ttl, { fresh = false, refresh = false } = {}) {
    if (this.reads.has(path)) return this.reads.get(path);
    const cached = this.cache.get(path), age = cached ? this.now() - cached.at : Infinity;
    if (!fresh && cached && age < (refresh ? 15000 : ttl)) return cached.value;
    const pending = this.request(path).then(value => { this.cache.set(path, { value, at: this.now() }); return value; }).finally(() => this.reads.delete(path));
    this.reads.set(path, pending); return pending;
  }
  user(options) { return this.read('/user', 60000, options); }
  rememberUser(user) { this.cache.set('/user', { value: user, at: this.now() }); }
  invalidateUser() { this.cache.delete('/user'); }
  async content(language = 'zh') {
    const locale = /^[\w-]+$/.test(language) ? language : 'zh', path = `/content?language=${locale}`, key = `gamify:content:v1:${locale}`;
    if (!this.cache.has(path)) {
      try { const saved = JSON.parse(this.storage?.getItem(key) || 'null'); if (saved?.value?.spells && this.now() - saved.at < 86400000) this.cache.set(path, saved); } catch { /* Cache is optional. */ }
    }
    const value = await this.read(path, 86400000);
    try { const { spells, gear, food, eggs, hatchingPotions, quests, potion, armoire } = value; this.storage?.setItem(key, JSON.stringify({ at: this.cache.get(path).at, value: { spells, gear, food, eggs, hatchingPotions, quests, potion, armoire } })); } catch { /* Full or unavailable local storage must not block browsing. */ }
    return value;
  }
  shop(kind) { if (!['market', 'market-gear', 'seasonal'].includes(kind)) throw new Error('未知商店'); return this.read(`/shops/${kind}`, 300000); }
  invalidateShops() { for (const key of this.cache.keys()) if (key.startsWith('/shops/')) this.cache.delete(key); }
  cast(key) { if (!/^[a-zA-Z]+$/.test(key)) throw new Error('技能标识不正确'); return this.request(`/user/class/cast/${key}`, 'POST'); }
  buy(key) { if (!/^[\w-]+$/.test(key)) throw new Error('商品标识不正确'); return this.request(`/user/buy/${key}`, 'POST', { quantity: 1 }); }
  task(alias) { return this.request(`/tasks/${encodeURIComponent(alias)}`); }
  async ensureHabit(alias) {
    const habits = await this.request('/tasks/user?type=habits');
    const existing = habits.find(task => task.alias === alias);
    if (existing) {
      if (existing.type !== 'habit' || existing.priority !== 0.1 || existing.down || !existing.up) throw new HabiticaError('请将专用习惯设为「琐事」、仅启用正向按钮');
      return existing;
    }
    return this.request('/tasks/user', 'POST', { type: 'habit', text: '在思源完成任务', alias,
      notes: '由 Gamify for SiYuan 管理。请保留琐事难度、仅正向；不要手动加分，以便核对奖励。', priority: 0.1, up: true, down: false });
  }
  score(alias) { return this.request(`/tasks/${encodeURIComponent(alias)}/score/up`, 'POST'); }
}

export function avatarLayers(user) {
  const p = user.preferences || {};
  const gear = user.items?.gear?.[p.costume ? 'costume' : 'equipped'] || {};
  const size = p.size || 'slim';
  const hair = p.hair || {};
  const layers = [p.chair && `chair_${p.chair}`, gear.back, `skin_${p.skin || 'ddc994'}${p.sleep ? '_sleep' : ''}`,
    `${size}_shirt_${p.shirt || 'black'}`, 'head_0', gear.armor && `${size}_${gear.armor}`, gear.back_collar,
    ...['bangs', 'base', 'mustache', 'beard'].map(slot => hair[slot] && `hair_${slot}_${hair[slot]}_${hair.color || 'brown'}`),
    gear.body, gear.eyewear, gear.head, gear.headAccessory, hair.flower && `hair_flower_${hair.flower}`, gear.shield, gear.weapon,
    p.sleep && 'zzz'];
  return layers.filter(v => v && /^[\w-]+$/.test(v) && !/(?:_base_0|chair_none)$/.test(v));
}
