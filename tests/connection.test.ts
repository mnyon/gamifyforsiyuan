import type {
  Credentials,
  SharedCredentials,
} from '../src/features/connection/domain/credentials.js';
import type { ConnectionPorts } from '../src/features/connection/application/ports.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  restoreConnection,
  saveConnection,
} from '../src/features/connection/application/manageConnection.ts';
import { LocalCredentialsRepository } from '../src/features/connection/adapters/LocalCredentialsRepository.ts';
const credentials = {
  userId: '11111111-1111-4111-8111-111111111111',
  token: '22222222-2222-4222-8222-222222222222',
};
function fixture(current: Credentials = {}) {
  const calls: unknown[][] = [];
  let saved: SharedCredentials | null = null;
  const ports: ConnectionPorts = {
    current,
    local: { write: (value) => calls.push(['local', value]) },
    shared: {
      read: async () => {
        calls.push(['read']);
        return saved;
      },
      save: async (value) => {
        calls.push(['save']);
        saved = { ...value, userId: value.userId!, token: value.token!, syncCredentials: true };
      },
      clear: async () => {
        calls.push(['clear']);
        saved = null;
      },
    },
  };
  return { ports, calls, setShared: (value: SharedCredentials) => (saved = value) };
}

test('local-only connection never reads or writes a shared secret file', async () => {
  const { ports, calls } = fixture(credentials);
  const restored = await restoreConnection(ports);
  assert.equal(restored.credentials, credentials);
  assert.equal(restored.restored, false);
  assert.deepEqual(calls, []);
  const saved = await saveConnection(ports, { ...credentials, sound: false });
  assert.equal(saved.syncCredentials, false);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['local'],
  );
});

test('restoring shared credentials preserves local sound and updates local storage first', async () => {
  const { ports, calls, setShared } = fixture({ sound: false });
  setShared({ ...credentials, syncCredentials: true });
  const result = await restoreConnection(ports);
  assert.equal(result.restored, true);
  assert.deepEqual(result.credentials, { sound: false, ...credentials, syncCredentials: true });
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['read', 'local'],
  );
});

test('shared opt-out disables sync locally while preserving locally stored credentials', async () => {
  const { ports, calls } = fixture({ ...credentials, syncCredentials: true, sound: false });
  const result = await restoreConnection(ports);
  assert.equal(result.restored, false);
  assert.deepEqual(result.credentials, { ...credentials, syncCredentials: false, sound: false });
  assert.equal(calls.filter((c) => c[0] === 'clear').length, 0);
});

test('unchanged shared credentials do not rewrite secrets; opt-out clears shared file before local commit', async () => {
  const { ports, calls, setShared } = fixture({ ...credentials, syncCredentials: true });
  setShared({ ...credentials, syncCredentials: true });
  await saveConnection(ports, { ...credentials, syncCredentials: true });
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['read', 'local'],
  );
  calls.length = 0;
  await saveConnection(ports, credentials);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['clear', 'local'],
  );
});

test('shared write failures leave current and local credentials untouched', async () => {
  for (const syncCredentials of [true, false]) {
    const current = { ...credentials, syncCredentials: true };
    const { ports, calls } = fixture(current);
    ports.shared.save = async () => {
      throw Error('disk full');
    };
    ports.shared.clear = async () => {
      throw Error('disk full');
    };
    await assert.rejects(saveConnection(ports, { ...credentials, syncCredentials }), /disk full/);
    assert.equal(ports.current, current);
    assert.equal(calls.filter((c) => c[0] === 'local').length, 0);
  }
});

test('invalid credentials never reach any storage and errors do not include submitted secrets', async () => {
  const { ports, calls } = fixture();
  const secret = 'not-a-valid-secret';
  await assert.rejects(
    saveConnection(ports, { userId: 'bad', token: secret }),
    (error) => error instanceof Error && !error.message.includes(secret),
  );
  assert.deepEqual(calls, []);
});

test('local repository retains existing key, defaults invalid startup data without writing, and reports save errors', () => {
  let stored: string | null = null,
    writeCount = 0;
  const storage = {
    getItem: (key: string) => {
      assert.equal(key, 'workspace:credentials');
      return stored;
    },
    setItem: (key: string, value: string) => {
      writeCount++;
      assert.equal(key, 'workspace:credentials');
      stored = value;
    },
  };
  const local = new LocalCredentialsRepository('workspace', storage);
  for (const value of ['null', '[]', 'broken', '{"sound":"false"}', '{"syncCredentials":1}']) {
    stored = value;
    assert.deepEqual(local.read(), {});
  }
  assert.equal(writeCount, 0);
  local.write({ ...credentials, sound: false });
  assert.deepEqual(local.read(), { ...credentials, sound: false });
  assert.equal(writeCount, 1);
  storage.setItem = () => {
    throw Error('quota');
  };
  assert.throws(() => local.write(credentials), /quota/);
});

test('unavailable browser storage does not abort construction or credential startup', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw Error('storage unavailable');
      },
    });
    const repository = new LocalCredentialsRepository('workspace');
    assert.deepEqual(repository.read(), {});
    assert.throws(() => repository.write(credentials), /storage unavailable/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
