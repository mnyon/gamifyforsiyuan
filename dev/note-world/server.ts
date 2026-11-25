import { createServer } from 'node:http';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSiYuan, createSiYuanRequest } from './collector/siyuan.js';

const root = new URL('../../', import.meta.url);
const cache =
  process.env.NOTE_WORLD_CACHE_DIR || fileURLToPath(new URL('./cache/', import.meta.url));
const snapshotFile = join(cache, 'snapshot.json');
const port = Number(process.env.NOTE_WORLD_PORT || 4181);
const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const files = new Map([
  ['/dev/note-world/presentation/hybrid-territory.html', 'text/html; charset=utf-8'],
  ['/dev/note-world/presentation/asset-gallery.html', 'text/html; charset=utf-8'],
  ['/dist/previews/note-world/hybrid-territory.js', 'text/javascript'],
  ['/dist/previews/note-world/asset-gallery.js', 'text/javascript'],
  ['/dist/previews/note-world/voxel-assets.js', 'text/javascript'],
  ['/dist/gamify-for-siyuan/terrain/vendor/three.module.js', 'text/javascript'],
  ['/dist/gamify-for-siyuan/terrain/vendor/OrbitControls.js', 'text/javascript'],
]);
let refresh: Promise<string> | undefined;

async function refreshSnapshot() {
  const token = process.env.NOTE_WORLD_SIYUAN_TOKEN?.trim();
  if (!token) throw new Error('请配置 NOTE_WORLD_SIYUAN_TOKEN 后重启服务');
  const origin = new URL(process.env.NOTE_WORLD_SIYUAN_URL || 'http://127.0.0.1:6806');
  const snapshot = await collectSiYuan(createSiYuanRequest(origin, token));
  const data = JSON.stringify(snapshot);
  await mkdir(cache, { recursive: true });
  const temporary = join(cache, randomUUID() + '.tmp');
  try {
    await writeFile(temporary, data);
    await rename(temporary, snapshotFile);
  } finally {
    await rm(temporary, { force: true });
  }
  return data;
}

createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const host = req.headers.host ?? '';
  if (!hosts.has(host)) {
    res.writeHead(403).end();
    return;
  }
  const origin = 'http://' + host;
  try {
    const { pathname } = new URL(req.url ?? '/', origin);
    if (pathname === '/api/note-world/collect' || pathname === '/api/note-world/cache') {
      if (req.method !== 'POST' || req.headers.origin !== origin) {
        res.writeHead(403).end();
        return;
      }
      let data: string;
      if (pathname.endsWith('/collect')) {
        refresh ??= refreshSnapshot().finally(() => {
          refresh = undefined;
        });
        data = await refresh;
      } else {
        try {
          data = await readFile(snapshotFile, 'utf8');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          res.writeHead(204).end();
          return;
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(data);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    if (pathname === '/') {
      res.writeHead(302, { Location: '/dev/note-world/presentation/hybrid-territory.html' }).end();
      return;
    }
    const contentType = files.get(pathname);
    if (!contentType) {
      res.writeHead(404).end();
      return;
    }
    const data = await readFile(new URL('.' + pathname, root));
    res
      .writeHead(200, { 'Content-Type': contentType })
      .end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    const response = error as NodeJS.ErrnoException;
    const status = response.code === 'ENOENT' ? 404 : 502;
    const message = response.code
      ? '本地文件读取或写入失败'
      : error instanceof Error
        ? error.message
        : '无法读取思源';
    res
      .writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
      .end(JSON.stringify({ error: message }));
  }
}).listen(port, '127.0.0.1', () => console.log(`NoteWorld at http://127.0.0.1:${port}/`));
