import { AtlasCache } from '../adapters/IndexedDbAtlasRepository.js';
import { createSource } from '../adapters/SiYuanMetadataSource.js';
import { browserCollectionEnvironment } from '../adapters/BrowserCollectionEnvironment.js';
import { CollectionSession } from '../application/CollectionSession.js';
import { snapshotOf, validSnapshot } from '../application/snapshot.js';
import { TerrainView } from './TerrainView.js';
import { element as $, message } from './dom.js';
import type { CollectionProgress } from '../application/ports.js';

/** Browser composition root; the page owns the map and its background collector. */
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
  ready: Promise<void> = Promise.resolve();
  private setProgressVisible(visible: boolean) {
    const progress = document.querySelector<HTMLElement>('.collection-progress');
    if (progress) {
      progress.hidden = !visible;
      progress.style.display = visible ? 'block' : 'none';
    }
  }
  private renderProgress(progress: CollectionProgress) {
    if (this.view.real) {
      this.setProgressVisible(false);
      return;
    }
    this.setProgressVisible(true);
    const bar = $('collection-progress') as HTMLProgressElement,
      value = $('collection-progress-value'),
      phase = $('collection-progress-phase'),
      eta = $('collection-progress-eta');
    let percent = 0,
      phaseText = '正在准备首次整理',
      estimate = '预计需要几分钟';
    if (progress.phase === 'books') {
      percent = 4;
      phaseText = '正在读取笔记本目录';
      estimate = '预计还需 1–3 分钟';
    } else if (progress.phase === 'pages') {
      percent = Math.min(42, 8 + Math.min(34, Math.log10(progress.pages + 1) * 14));
      phaseText = `正在读取笔记目录 · 已处理 ${progress.pages} 篇`;
      estimate = '已按大批次读取，通常只需几分钟';
    } else if (progress.phase === 'sizes') {
      percent = 42 + (progress.pages ? Math.min(31, (progress.sizes / progress.pages) * 31) : 0);
      phaseText = `正在整理内容规模 · ${progress.sizes}/${progress.pages} 篇`;
      const remaining = Math.max(0, progress.pages - progress.sizes);
      estimate = remaining ? '已按大批次统计，通常只需几分钟' : '即将整理引用关系';
    } else if (progress.phase === 'edges') {
      percent = 74 + Math.min(20, Math.log10(progress.edges + 1) * 8);
      phaseText = `正在整理引用关系 · 已处理 ${progress.edges} 条`;
      estimate = '预计还需 1–2 分钟';
    } else {
      percent = 98;
      phaseText = '正在生成地形';
      estimate = '通常还需几秒';
    }
    bar.value = Math.round(percent);
    value.textContent = Math.round(percent) + '%';
    phase.textContent = phaseText;
    eta.textContent = estimate;
  }
  private resetProgress() {
    this.setProgressVisible(true);
    this.renderProgress({ phase: 'books', pages: 0, sizes: 0, edges: 0 });
  }
  private unavailableProgress() {
    this.setProgressVisible(true);
    const bar = $('collection-progress') as HTMLProgressElement;
    bar.removeAttribute('value');
    $('collection-progress-value').textContent = '—';
    $('collection-progress-phase').textContent = '本机缓存暂不可用';
    $('collection-progress-eta').textContent = '请稍后重试';
  }
  readonly collection = new CollectionSession(
    this.source.api.bind(this.source),
    this.cache,
    browserCollectionEnvironment(this.cache.scope),
    {
      setBooks: (books) => this.source.setBooks(books),
      progress: (progress) => {
        this.renderProgress(progress);
        $('load-status').textContent = this.view.real
          ? ''
          : '正在绘制你的笔记领地 · 关闭窗口后仍会继续整理';
        $('change-status').textContent = {
          books: '正在认识你的笔记本',
          pages: '逐批记录笔记目录',
          sizes: '逐批整理内容规模',
          edges: '逐批连接笔记之间的道路',
          ready: '正在保存领地',
        }[progress.phase];
      },
      ready: async (previous, checkpoint) => {
        if (previous && !this.view.real) await this.view.restoreSnapshot(previous);
        if (this.disposed) return;
        if (checkpoint && !this.view.real)
          this.renderProgress({
            phase: checkpoint.phase,
            pages: checkpoint.pages.length,
            sizes: checkpoint.sizeIndex,
            edges: checkpoint.edges.length,
            started: checkpoint.started,
          });
        $('demo-edit').disabled = true;
        if (!previous && !this.view.real) {
          this.view.resetModel(this.view.getSavedLayout());
          $('source').textContent = '正在整理笔记';
          $('load-status').textContent = '正在建立笔记地图，关闭窗口后仍会继续整理。';
        }
      },
      collected: async (data) => {
        const { dirty } = await this.view.applyCatalog(data);
        if (!this.disposed) $('dirty-count').textContent = dirty + ' 采样点';
        return snapshotOf(this.view.model);
      },
      saved: (snapshot) => {
        $('source').textContent = '本机笔记 · 缓存世界';
        this.setProgressVisible(false);
        $('load-status').textContent = '';
        $('change-status').textContent = '这一轮小批整理已保存，下次可直接打开。';
        $('world-status').textContent = '本机领地';
        $('demo-edit').disabled = true;
        this.view.requestRender();
      },
      fresh: () => {
        $('load-status').textContent = '';
      },
      error: (_error, unavailable) => {
        if (unavailable) this.unavailableProgress();
        $('load-status').textContent = unavailable
          ? '本机缓存暂不可用，请稍后再来。'
          : this.view.real
            ? '地图保持上次结果，后台会稍后继续更新'
            : '正在建立笔记地图，请稍后再来。';
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
      let restored = false;
      try {
        const cached = await this.cache.read('snapshot');
        if (this.disposed) return;
        if (validSnapshot(cached)) restored = await this.view.restoreSnapshot(cached);
        if (!restored) {
          this.view.resetModel(this.view.getSavedLayout());
          this.resetProgress();
          $('load-status').textContent = '正在建立笔记地图，关闭窗口后仍会继续整理。';
        } else {
          this.setProgressVisible(false);
          $('load-status').textContent = '';
        }
      } catch {
        this.collection.available = false;
        this.unavailableProgress();
        $('load-status').textContent = '本机缓存暂不可用，请稍后再来。';
      }
      if (this.disposed) return;
      try {
        const status = await this.source.api('status');
        if (this.disposed) return;
        if (status.connected) await this.collection.start();
        else
          $('load-status').textContent = restored
            ? '地图保持上次结果，后台连接暂不可用'
            : '正在建立笔记地图，请稍后再来。';
      } catch {
        $('load-status').textContent = restored
          ? '地图保持上次结果，后台连接暂不可用'
          : '正在建立笔记地图，请稍后再来。';
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
    $('overview').addEventListener('click', this.view.fitOverview, options);
    $('export-demo').addEventListener('click', () => this.exportDemoData(), options);
  }
  private exportDemoData() {
    const snapshot = snapshotOf(this.view.model);
    const data = {
      version: snapshot.version,
      generator: snapshot.generator,
      at: snapshot.at,
      books: snapshot.books,
      pages: snapshot.pages,
      edges: snapshot.edges,
      layout: snapshot.layout,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'note-territory-demo.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('load-status').textContent = 'Demo 数据已导出';
  }
  async resetForTest() {
    this.collection.stop();
    this.collection.available = true;
    await this.cache.clear();
    if (this.disposed) return;
    this.view.resetModel(this.view.getSavedLayout());
    this.resetProgress();
    $('load-status').textContent = '测试工具已清除地图缓存';
    this.view.requestRender();
  }
  pauseForTest() {
    this.collection.stop();
    $('load-status').textContent = this.view.real
      ? '测试工具已暂停后台更新'
      : '测试工具已暂停首次整理';
  }
  resumeForTest() {
    this.collection.available = true;
    return this.collection.start();
  }
  runBatchForTest() {
    return this.collection.runNow();
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
  page.ready = page.start();
  return page;
}
