import type { TaskRow } from '../../features/progress/domain/types.js';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('思源查询结果不正确');
  return value as Record<string, unknown>;
}
export async function queryRows(path: string, body: object): Promise<unknown> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('思源暂时无法读取 TODO');
  const result = object(await response.json());
  if (result.code !== 0)
    throw new Error(typeof result.msg === 'string' ? result.msg : 'TODO 读取失败');
  return result.data;
}
function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('思源查询结果不是数组');
  return value.map(object);
}
export function taskRows(value: unknown): TaskRow[] {
  return rows(value).map((row) => {
    if (typeof row.id !== 'string' || typeof row.markdown !== 'string')
      throw new Error('TODO 查询结果不正确');
    return { id: row.id, markdown: row.markdown };
  });
}
export function updatedRows(
  value: unknown,
): Array<{ id: string; updated: string | number | null }> {
  return rows(value).map((row) => {
    if (
      typeof row.id !== 'string' ||
      !(row.updated === null || typeof row.updated === 'string' || typeof row.updated === 'number')
    )
      throw new Error('笔记更新时间格式不正确');
    return { id: row.id, updated: row.updated };
  });
}
