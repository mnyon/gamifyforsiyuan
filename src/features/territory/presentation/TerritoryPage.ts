import { AtlasCache } from '../adapters/IndexedDbAtlasRepository.js';
import { createSource } from '../adapters/SiYuanMetadataSource.js';
import { browserCollectionEnvironment } from '../adapters/BrowserCollectionEnvironment.js';
import { CollectionSession } from '../application/CollectionSession.js';
import { snapshotOf, validSnapshot } from '../application/snapshot.js';
import { TerrainView } from './TerrainView.js';
import { element as $, message } from './dom.js';

/** Browser composition root; domain and application do not import this module. */
export class TerritoryPage {
  readonly view = new TerrainView();
  readonly source = createSource();
  readonly cache = new AtlasCache(
    this.source.native
      ? location.pathname.split('/').slice(0, 3).join('/') +
          ':' +
          (new URLSearchParams(location.search).get('workspace') || location.origin)
      : 'standalone',
  );
  readonly events = new AbortController();
  disposed = false;
  readonly collection = new CollectionSession(
    this.source.api.bind(this.source),
    this.cache,
    browserCollectionEnvironment(this.cache.scope),
    {
      setBooks: (books) => this.source.setBooks(books),
      progress: (progress) => {
        $('load-status').textContent = this.view.real
          ? '本机地图可继续浏览 · 正在缓慢整理'
          : '首次整理中 · 可随时关闭，下次继续';
        $('change-status').textContent = {
          books: '正在认识你的笔记本',
          pages: '逐批记录笔记目录',
          sizes: '逐批整理内容规模',
          edges: '逐批连接笔记之间的道路',
          ready: '正在保存领地',
        }[progress.phase];
      },
      ready: async (previous) => {
        if (previous && !this.view.real) await this.view.restoreSnapshot(previous);
        if (this.disposed) return;
        $('demo-edit').disabled = true;
        if (!previous && !this.view.real) {
          this.view.resetModel(this.view.getSavedLayout());
          $('source').textContent = '正在整理笔记';
          $('load-status').textContent = '首次整理会分多次完成；可随时关闭。';
        }
      },
      collected: async (data) => {
        const { dirty } = await this.view.applyCatalog(data);
        if (!this.disposed) $('dirty-count').textContent = dirty + ' 采样点';
        return snapshotOf(this.view.model);
      },
      saved: (snapshot) => {
        $('source').textContent = '本机笔记 · 缓存世界';
        $('load-status').textContent =
          '上次整理 ' + new Date(snapshot.at).toLocaleString('zh-CN', { hour12: false });
        $('change-status').textContent = '这一轮小批整理已保存，下次可直接打开。';
        $('world-status').textContent = '本机领地';
        $('demo-edit').disabled = true;
        this.view.requestRender();
      },
      fresh: () => {
        $('change-status').textContent = '保留当前风景，稍后再慢慢整理。';
      },
      error: (_error, unavailable) => {
        $('change-status').textContent = unavailable
          ? '本机缓存不可用，暂不读取整库。'
          : '暂时保留当前地图，稍后会从已保存的进度继续。';
      },
    },
  );
  async start() {
    this.bindEvents();
    try {
      this.view.initScene();
      this.view.demo();
      try {
        const cached = await this.cache.read('snapshot');
        if (this.disposed) return;
        if (validSnapshot(cached)) await this.view.restoreSnapshot(cached);
      } catch {
        this.collection.available = false;
        $('change-status').textContent = '本机缓存不可用，暂不读取整库。';
      }
      if (this.disposed) return;
      try {
        const status = await this.source.api('status');
        if (this.disposed) return;
        if (this.source.native) {
          $('connection').hidden = true;
          $('disconnect').hidden = true;
        }
        if (status.connected) await this.collection.start();
      } catch {
        $('load-status').textContent = '保留当前地图；本地连接暂不可用。';
      }
    } catch (error) {
      if (!this.view.ready) {
        $('webgl-error').hidden = false;
        $('webgl-error').textContent =
          '无法创建三维视图。请启用浏览器硬件加速或使用支持 WebGL 的浏览器。';
        $('load-status').textContent = '三维视图初始化失败。';
      } else $('load-status').textContent = message(error);
    }
  }
  private bindEvents() {
    const options = { signal: this.events.signal };
    window.addEventListener('pagehide', () => this.destroy(), options);
    $('pages').addEventListener(
      'change',
      () => this.view.selectPage($('pages').value, true),
      options,
    );
    $('search').addEventListener('input', this.view.search, options);
    $('focus').addEventListener('click', this.view.focusPage, options);
    $('roads').addEventListener('change', this.view.buildRoutes, options);
    $('overview').addEventListener('click', this.view.fitOverview, options);
    $('connection').addEventListener(
      'click',
      () => {
        $('connect-error').textContent = '';
        $('connect-dialog').showModal();
      },
      options,
    );
    $('cancel-connect').addEventListener('click', () => $('connect-dialog').close(), options);
    $('connect-form').addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        void this.connect();
      },
      options,
    );
    $('disconnect').addEventListener('click', () => void this.disconnect(), options);
    $('demo-edit').addEventListener('click', () => this.view.editDemo(), options);
  }
  private async connect() {
    $('connect-submit').disabled = true;
    $('connect-error').textContent = '';
    try {
      await this.source.api('connect', { key: $('key').value });
      if (this.disposed) return;
      $('key').value = '';
      $('connect-dialog').close();
      await this.collection.start();
    } catch (error) {
      if (!this.disposed) $('connect-error').textContent = message(error);
    } finally {
      if (!this.disposed) $('connect-submit').disabled = false;
    }
  }
  private async disconnect() {
    if (this.collection.busy) {
      $('connect-error').textContent = '这一小批整理完成后即可断开。';
      return;
    }
    this.collection.stop();
    try {
      await this.source.api('disconnect');
      await this.cache.clear();
      if (this.disposed) return;
      $('key').value = '';
      $('connect-dialog').close();
      $('progress').hidden = true;
      $('dirty-count').textContent = '—';
      this.view.demo();
    } catch (error) {
      if (!this.disposed) $('connect-error').textContent = message(error);
    }
  }
  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.events.abort();
    this.collection.stop();
    this.cache.close();
    this.view.destroy();
  }
}
export function startTerritoryPage() {
  const page = new TerritoryPage();
  void page.start();
  return page;
}
