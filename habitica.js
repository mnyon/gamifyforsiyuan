export class HabiticaError extends Error {
  constructor(message, uncertain = false) { super(message); this.uncertain = uncertain; }
}

export class HabiticaClient {
  constructor(credentials, fetcher = fetch) { this.credentials = credentials; this.fetcher = fetcher; }
  async request(path, method = 'GET', body) {
    const mutating = method !== 'GET';
    let response;
    try {
      response = await this.fetcher(`https://habitica.com/api/v3${path}`, {
        method, headers: { 'Content-Type': 'application/json', 'x-api-user': this.credentials.userId,
          'x-api-key': this.credentials.token, 'x-client': `${this.credentials.userId}-gamify-for-siyuan` },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000)
      });
    } catch { throw new HabiticaError('暂时无法连接 Habitica，请稍后重试', mutating); }
    if (!response.ok) {
      const message = response.status === 401 ? 'User ID 或 API Token 不正确' : response.status === 429 ? '请求较频繁，请稍后重试' : `Habitica 暂时不可用（${response.status}）`;
      throw new HabiticaError(message, mutating && response.status >= 500);
    }
    let result;
    try { result = await response.json(); } catch { throw new HabiticaError('Habitica 返回了无法读取的响应', mutating); }
    if (!result.success) throw new HabiticaError('Habitica 未能完成请求', mutating);
    return result.data;
  }
  user() { return this.request('/user'); }
  task(alias) { return this.request(`/tasks/${encodeURIComponent(alias)}`); }
  async ensureHabit(alias) {
    const habits = await this.request('/tasks/user?type=habits');
    const existing = habits.find(task => task.alias === alias);
    if (existing) {
      if (existing.type !== 'habit' || existing.priority !== 0.1 || existing.down || !existing.up) {
        throw new HabiticaError('请将专用习惯设为「琐事」、仅启用正向按钮');
      }
      return existing;
    }
    return this.request('/tasks/user', 'POST', { type: 'habit', text: '在思源完成任务', alias,
      notes: '由 Gamify for SiYuan 管理。请保留琐事难度、仅正向；不要手动加分，以便核对奖励。',
      priority: 0.1, up: true, down: false });
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
