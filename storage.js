export class ProgressStorage {
  constructor(name, fetcher = fetch) {
    if (!/^[a-z0-9-]+$/i.test(name)) throw new Error('插件存储名称不正确');
    this.path = `/data/storage/petal/${name}/progress.json`;
    this.fetcher = fetcher;
  }
  async read() {
    const response = await this.fetcher('/api/file/getFile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: this.path }), signal: AbortSignal.timeout(15000)
    });
    if (response.status === 202) return null;
    if (!response.ok) throw new Error(`进度读取失败（HTTP ${response.status}），未初始化新进度`);
    const value = await response.json();
    if (value && typeof value.code === 'number') throw new Error(value.msg || `进度读取失败（${value.code}）`);
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) throw new Error('进度文件格式不正确，已停止读取以保护已有记录');
    return value;
  }
  async write(state) {
    const form = new FormData();
    form.append('path', this.path);
    form.append('isDir', 'false');
    form.append('file', new Blob([JSON.stringify(state)], { type: 'application/json' }), 'progress.json');
    const response = await this.fetcher('/api/file/putFile', {
      method: 'POST', body: form, signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (result.code !== 0) throw new Error(result.msg || `文件写入失败（${result.code}）`);
  }
}

// Separate from progress: opting out removes the secret from the shared file.
export class ConnectionStorage extends ProgressStorage {
  constructor(name, fetcher = fetch) {
    super(name, fetcher);
    this.path = `/data/storage/petal/${name}/connection.json`;
  }
  async read() {
    const value = await super.read();
    if (!value || value.enabled === false) return null;
    const valid = text => typeof text === 'string' && /^[a-f0-9-]{36}$/i.test(text);
    if (value.enabled !== true || !valid(value.userId) || !valid(value.token)) throw new Error('同步连接信息格式不正确');
    return { userId: value.userId, token: value.token, syncCredentials: true };
  }
  async save(value) {
    await this.write({ version: 1, enabled: true, userId: value.userId, token: value.token });
  }
  async clear() { await this.write({ version: 1, enabled: false }); }
}
