export const DEFAULT_DIRECTORY = '/data/storage/petal/siyuan-time-spent';

export class TimeSpentReader {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async readDay(date: string, directory = DEFAULT_DIRECTORY): Promise<unknown[]> {
    const path = `${directory.replace(/\\/g, '/').replace(/\/$/, '')}/${date}.json`;
    const response = await this.fetcher('/api/file/getFile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (response.status === 202 || response.status === 404) return [];
    if (!response.ok) throw new Error(`读取 siyuan-time-spent 失败（HTTP ${response.status}）`);
    const value: unknown = await response.json();
    if (value && typeof value === 'object' && 'code' in value && typeof value.code === 'number')
      throw new Error(
        'msg' in value && typeof value.msg === 'string' ? value.msg : '读取 siyuan-time-spent 失败',
      );
    if (!Array.isArray(value)) throw new Error('数据格式不是数组');
    return value;
  }

  async readLatest(directory = DEFAULT_DIRECTORY, date = new Date()) {
    const pad = (value: number) => String(value).padStart(2, '0');
    const localDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return this.readDay(localDate, directory);
  }
}
