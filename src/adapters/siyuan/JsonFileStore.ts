/** Low-level SiYuan file transport. Repositories own the document schema. */
export interface FileResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FileFetcher = (path: string, options: RequestInit) => Promise<FileResponse>;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export class JsonFileStore {
  readonly path: string;
  constructor(
    name: string,
    readonly filename: 'progress.json' | 'connection.json' | 'reward-audit.json',
    public fetcher: FileFetcher = fetch,
  ) {
    if (!/^[a-z0-9-]+$/i.test(name)) throw new Error('插件存储名称不正确');
    this.path = '/data/storage/petal/' + name + '/' + filename;
  }
  async read(): Promise<unknown | null> {
    const response = await this.fetcher('/api/file/getFile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: this.path }),
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 202) return null;
    if (!response.ok)
      throw new Error('进度读取失败（HTTP ' + response.status + '），未初始化新进度');
    const value: unknown = await response.json();
    if (record(value) && typeof value.code === 'number')
      throw new Error(
        typeof value.msg === 'string' ? value.msg : '进度读取失败（' + value.code + '）',
      );
    // JSON null is a corrupt document, not a missing file.
    if (value === null) throw new Error('文件内容不正确，已停止读取以保护已有记录');
    return value;
  }
  async write(value: unknown): Promise<void> {
    const form = new FormData();
    form.append('path', this.path);
    form.append('isDir', 'false');
    form.append(
      'file',
      new Blob([JSON.stringify(value)], { type: 'application/json' }),
      this.filename,
    );
    const response = await this.fetcher('/api/file/putFile', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const result: unknown = await response.json();
    if (!record(result) || result.code !== 0)
      throw new Error(
        record(result) && typeof result.msg === 'string' ? result.msg : '文件写入失败',
      );
  }
}
