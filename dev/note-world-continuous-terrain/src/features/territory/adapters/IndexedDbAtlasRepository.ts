import type { AtlasRepository, WorldSnapshot, Checkpoint } from '../application/ports.js';
export class AtlasCache implements AtlasRepository {
  scope: string;
  db: IDBDatabase | null;
  constructor(scope = 'local') {
    this.scope = scope;
    this.db = null;
  }
  async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('gamify-note-territory', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('entries');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return this.db;
  }
  async read(key: 'snapshot' | 'checkpoint'): Promise<unknown> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const r = db
        .transaction('entries')
        .objectStore('entries')
        .get(this.scope + ':' + key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  }
  async write(
    key: 'snapshot' | 'checkpoint',
    value: WorldSnapshot | Checkpoint | null,
  ): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      tx.objectStore('entries').put(value, this.scope + ':' + key);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(Object.assign(tx.error || Error('缓存保存失败'), { cacheError: true }));
      tx.onabort = () =>
        reject(Object.assign(tx.error || Error('缓存保存中断'), { cacheError: true }));
    });
  }
  async clear() {
    const db = await this.open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      for (const key of ['snapshot', 'checkpoint'])
        tx.objectStore('entries').delete(this.scope + ':' + key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  close() {
    this.db?.close();
    this.db = null;
  }
}
