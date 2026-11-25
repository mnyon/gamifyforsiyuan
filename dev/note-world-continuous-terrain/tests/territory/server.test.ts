import { spawn } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
const port = 4189,
  origin = `http://127.0.0.1:${port}`;
test('local read service rejects foreign origins, arbitrary files, and non-whitelisted queries', async () => {
  const p = spawn(process.execPath, ['--import', 'tsx', 'tools/terrain-server.ts'], {
    env: { ...process.env, TERRAIN_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    let started = false;
    for (let i = 0; i < 50; i++) {
      try {
        const r = await fetch(origin);
        if (r.ok) {
          started = true;
          break;
        }
      } catch {}
      await delay(100);
    }
    assert.ok(started);
    const post = async (path: string, body: object = {}, headers: Record<string, string> = {}) =>
      fetch(origin + path, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    assert.equal((await post('/api/status', {}, { Origin: 'http://example.com' })).status, 403);
    assert.equal((await fetch(origin + '/server.ts')).status, 404);
    assert.equal((await fetch(origin + '/world.test.ts')).status, 404);
    assert.equal((await post('/api/query/sql', { stmt: 'SELECT * FROM blocks' })).status, 404);
    assert.equal((await fetch(origin + '/api/pages')).status, 403);
    const status = await (await post('/api/status')).json();
    assert.equal(status.connected, false);
    assert.equal((await post('/api/pages', { after: 'bad' })).status, 400);
    assert.equal((await post('/api/connect', { key: '' })).status, 400);
    assert.equal((await fetch(origin + '/vendor/three.module.js')).status, 200);
    assert.equal((await post('/api/disconnect')).status, 200);
  } finally {
    p.kill();
    await new Promise<void>((r) => {
      if (p.exitCode !== null) r();
      else p.once('exit', r);
    });
  }
});
