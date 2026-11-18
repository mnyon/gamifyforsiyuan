import test from 'node:test';
import assert from 'node:assert/strict';
import { HabiticaClient, avatarLayers } from './habitica.js';

test('credentials only go to Habitica headers and habit creation uses trivial positive habit', async () => {
  const requests = [];
  const client = new HabiticaClient({ userId: 'user', token: 'secret' }, async (url, options) => {
    requests.push({ url, options }); return { ok: true, json: async () => ({ success: true, data: options.method === 'GET' ? [] : { id: 'habit' } }) };
  });
  await client.ensureHabit('alias');
  assert.equal(requests[0].options.headers['x-api-key'], 'secret');
  const body = JSON.parse(requests[1].options.body);
  assert.equal(body.priority, 0.1); assert.equal(body.type, 'habit'); assert.equal(body.down, false);
  assert.equal(body.up, true); assert.ok(requests.every(r => !r.url.includes('secret')));
});
test('score timeouts are uncertain; read failures are safe to retry', async () => {
  const client = new HabiticaClient({}, async () => { throw new TypeError('network'); });
  await assert.rejects(client.score('alias'), error => error.uncertain === true);
  await assert.rejects(client.user(), error => error.uncertain === false);
});
test('avatar uses costume and filters unsafe asset names', () => {
  const layers = avatarLayers({ preferences: { costume: true, skin: 'f5a76e', size: 'slim' }, items: { gear: { costume: { head: 'head_special_1', weapon: '../invalid' }, equipped: { head: 'other' } } } });
  assert.ok(layers.includes('head_special_1')); assert.ok(!layers.includes('other')); assert.ok(!layers.includes('../invalid'));
});
