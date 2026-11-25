import type { ServerResponse } from 'node:http';
import { build } from 'esbuild';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('请求格式不正确');
  return value as Record<string, unknown>;
}
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const compiled = new Map<string, Promise<Uint8Array>>();
const entries: Record<string, string> = {
  'app.js': 'presentation/main.ts',
  'world.js': 'domain/WorldModel.ts',
  'cache.js': 'cache.ts',
  'source.js': 'adapters/SiYuanMetadataSource.ts',
};
async function browserModule(name: string) {
  if (!compiled.has(name))
    compiled.set(
      name,
      build({
        entryPoints: [path.join(ROOT, 'src/features/territory', entries[name])],
        external: ['three', 'three/addons/controls/OrbitControls.js'],
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'esm',
        target: 'es2022',
      }).then((result) => result.outputFiles[0].contents),
    );
  return compiled.get(name);
}
const PORT = Number(process.env.TERRAIN_PORT || 4177),
  ORIGIN = `http://127.0.0.1:${PORT}`;
let token = '',
  books = new Set<string>();
const idRE = /^[0-9]{14}-[a-z0-9]{7}$/;
const valid = (id: unknown): id is string => typeof id === 'string' && idRE.test(id);
function quote(id: unknown) {
  if (!valid(id)) throw Error('无效文档标识');
  return `'${id}'`;
}
async function siyuan(endpoint: string, body: object, key = token): Promise<unknown> {
  if (!key) throw Error('请先连接本地思源');
  const r = await fetch('http://127.0.0.1:6806' + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Token ' + key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw Error('思源请求失败：HTTP ' + r.status);
  const j = object(await r.json());
  if (j.code !== 0) throw Error('思源读取失败（代码 ' + j.code + '）');
  return j.data;
}
async function catalog(key = token) {
  const d = object(await siyuan('/api/notebook/lsNotebooks', {}, key));
  if (!Array.isArray(d.notebooks)) throw Error('笔记本目录格式不正确');
  return d.notebooks
    .map(object)
    .filter((b) => !b.closed && valid(b.id))
    .map((b) => {
      if (!valid(b.id) || typeof b.name !== 'string') throw Error('笔记本格式不正确');
      return { id: b.id, name: b.name };
    });
}
function scope() {
  if (!books.size) throw Error('没有打开的笔记本');
  return [...books].map(quote).join(',');
}
function send(res: ServerResponse, status: number, obj: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}
const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${PORT}`) {
      send(res, 403, { error: '仅允许本机访问' });
      return;
    }
    const url = new URL(req.url || '/', ORIGIN);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'POST' || req.headers.origin !== ORIGIN) {
        send(res, 403, { error: '只接受此原型的本机请求' });
        return;
      }
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 65536) throw Error('请求过大');
      }
      const body = object(JSON.parse(raw || '{}'));
      const limit = Math.min(128, Math.max(1, Math.floor(Number(body.limit) || 128)));
      let data;
      if (url.pathname === '/api/connect') {
        if (typeof body.key !== 'string' || !body.key.trim()) throw Error('请输入请求 Key');
        const next = body.key.trim(),
          rows = await catalog(next);
        token = next;
        books = new Set(rows.map((b) => b.id));
        data = { books: rows };
      } else if (url.pathname === '/api/status') {
        data = { connected: !!token };
      } else if (url.pathname === '/api/disconnect') {
        token = '';
        books.clear();
        data = { connected: false };
      } else if (url.pathname === '/api/books') {
        const rows = await catalog();
        books = new Set(rows.map((b) => b.id));
        data = { books: rows };
      } else if (url.pathname === '/api/pages') {
        const after = body.after ? ' AND id>' + quote(body.after) : '';
        data = await siyuan('/api/query/sql', {
          stmt: `SELECT id,box,content AS title,updated FROM blocks WHERE type='d' AND box IN (${scope()})${after} ORDER BY id LIMIT ${limit}`,
        });
      } else if (url.pathname === '/api/sizes') {
        if (!Array.isArray(body.ids) || body.ids.length > 256 || !body.ids.length)
          throw Error('文档批次无效');
        data = await siyuan('/api/query/sql', {
          stmt: `SELECT root_id AS id,SUM(length(content)) AS chars FROM blocks WHERE box IN (${scope()}) AND root_id IN (${body.ids.map(quote).join(',')}) GROUP BY root_id ORDER BY root_id LIMIT 256`,
        });
      } else if (url.pathname === '/api/edges') {
        let after = '';
        if (body.after) {
          const a = quote(object(body.after).source),
            b = quote(object(body.after).target);
          after = ` AND (r.root_id>${a} OR (r.root_id=${a} AND t.root_id>${b}))`;
        }
        data = await siyuan('/api/query/sql', {
          stmt: `SELECT r.root_id AS source,t.root_id AS target,COUNT(*) AS weight FROM refs r JOIN blocks s ON s.id=r.root_id JOIN blocks t ON t.id=r.def_block_id WHERE s.type='d' AND s.box IN (${scope()}) AND t.box IN (${scope()}) AND r.root_id<>t.root_id${after} GROUP BY r.root_id,t.root_id ORDER BY r.root_id,t.root_id LIMIT ${limit}`,
        });
      } else {
        send(res, 404, { error: '无此读取接口' });
        return;
      }
      send(res, 200, data);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, { error: '不支持的请求' });
      return;
    }
    const pathname =
      url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    if (
      !/^(index\.html|app\.js|cache\.js|source\.js|world\.js|style\.css|vendor\/(three\.module\.js|OrbitControls\.js|THREE-LICENSE\.txt))$/.test(
        pathname,
      )
    ) {
      send(res, 404, { error: '文件不存在' });
      return;
    }
    const content = Object.hasOwn(entries, pathname)
      ? await browserModule(pathname)
      : await readFile(
          pathname.startsWith('vendor/')
            ? path.join(ROOT, 'third_party/three', pathname.slice(7))
            : path.join(ROOT, 'src/features/territory/presentation', pathname),
        );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'",
    );
    res.setHeader(
      'Content-Type',
      pathname.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : pathname.endsWith('.css')
          ? 'text/css; charset=utf-8'
          : pathname.endsWith('.js')
            ? 'text/javascript; charset=utf-8'
            : 'text/plain',
    );
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (e) {
    send(res, 400, {
      error:
        e instanceof Error && e.name === 'TimeoutError'
          ? '本地思源读取超时，请重试'
          : e instanceof Error
            ? e.message
            : '读取请求失败',
    });
  }
});
server.listen(PORT, '127.0.0.1', () =>
  console.log(`笔记领地已启动：${ORIGIN}（只读，Key 仅驻留内存）`),
);
