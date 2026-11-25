/**
 * 「笔记领地」地图宿主（归档）。
 *
 * 来源：src/plugin/main.ts 中的字段 85-90、onload 里的 118/133 行、
 * 方法 245-393、onunload 清理段 993-1000（2026-11-21 工作区版本）。
 *
 * 原代码是 GamifyPlugin 类的一部分，直接访问 this.name、this.disposed、
 * this.view.close()。归档时用构造参数接收这三个依赖，方法体逐字保留，
 * 只把上述三处访问改成 this.plugin.*。
 *
 * 本目录不参与插件构建、类型检查与测试，仅作存档。
 */
import { Dialog } from 'siyuan';

/** 原插件类中与地图相关的成员。 */
export interface TerritoryHostPlugin {
  /** 插件名，用于拼出 /plugins/<name>/terrain/ 地址。 */
  readonly name: string;
  /** 插件是否已卸载；原 openTerrain() 据此提前返回。 */
  readonly disposed: boolean;
  /** 收起插件面板；原代码写作 this.view.close()。 */
  closeView(): void;
}

export class TerritoryHost {
  terrainDialog: Dialog | null = null;
  terrainHost: HTMLDivElement | null = null;
  terrainFrame: HTMLIFrameElement | null = null;
  terrainResize?: () => void;
  terrainOutsideClick?: (event: PointerEvent) => void;
  terrainDialogClick?: (event: MouseEvent) => void;

  constructor(private readonly plugin: TerritoryHostPlugin) {}

  private parkTerrainFrame() {
    if (!this.terrainHost) return;
    this.terrainHost.style.left = '-10000px';
    this.terrainHost.style.top = '-10000px';
    this.terrainHost.style.width = '1px';
    this.terrainHost.style.height = '1px';
    this.terrainHost.style.visibility = 'hidden';
    this.terrainHost.style.pointerEvents = 'none';
    this.terrainHost.setAttribute('aria-hidden', 'true');
  }

  private syncTerrainFrame() {
    const host = this.terrainHost;
    const dialog = this.terrainDialog?.element;
    if (!host || !dialog?.isConnected) return;
    const target = dialog.querySelector<HTMLElement>('.gamify-territory-frame');
    if (!target) return;
    const rect = target.getBoundingClientRect();
    host.style.left = rect.left + 'px';
    host.style.top = rect.top + 'px';
    host.style.width = Math.max(1, rect.width) + 'px';
    host.style.height = Math.max(1, rect.height) + 'px';
    host.style.visibility = 'visible';
    host.style.pointerEvents = 'auto';
    host.setAttribute('aria-hidden', 'false');
    const close = host.querySelector<HTMLElement>('.gamify-territory-close');
    if (close) {
      close.style.left = Math.max(8, rect.right - 60) + 'px';
      close.style.top = Math.max(8, rect.top + 26) + 'px';
    }
  }

  private startTerrainCollector() {
    if (this.terrainFrame || !document.body) return;
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
      'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;overflow:hidden;visibility:hidden;pointer-events:none;z-index:10000;';
    const frame = document.createElement('iframe');
    frame.title = '笔记领地地图';
    frame.src =
      '/plugins/' +
      encodeURIComponent(this.plugin.name) +
      '/terrain/index.html?workspace=' +
      encodeURIComponent(globalThis.siyuan?.config?.system?.workspaceDir || location.origin) +
      '&embed=map';
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block';
    host.append(frame);
    document.body.append(host);
    this.terrainHost = host;
    this.terrainFrame = frame;
    this.terrainResize = () => this.syncTerrainFrame();
    if (typeof window !== 'undefined') window.addEventListener('resize', this.terrainResize);
  }

  openTerrain() {
    if (this.plugin.disposed) return;
    this.startTerrainCollector();
    if (this.terrainDialog?.element?.isConnected) {
      this.terrainFrame?.focus();
      return;
    }
    if (!this.terrainFrame) return;
    this.terrainDialog = new Dialog({
      title: '',
      content:
        '<div class="gamify-territory-frame" style="position:fixed;left:3vw;top:12.5vh;width:94vw;height:75vh;min-height:320px" aria-label="笔记领地地图"></div>',
      width: '100vw',
      destroyCallback: () => {
        if (
          this.terrainOutsideClick &&
          typeof window !== 'undefined' &&
          typeof window.removeEventListener === 'function'
        )
          window.removeEventListener('pointerdown', this.terrainOutsideClick, true);
        if (this.terrainDialogClick && typeof dialog?.removeEventListener === 'function')
          dialog.removeEventListener('click', this.terrainDialogClick, true);
        this.terrainOutsideClick = undefined;
        this.terrainDialogClick = undefined;
        this.terrainHost?.querySelector('.gamify-territory-close')?.remove();
        this.parkTerrainFrame();
        this.terrainDialog = null;
      },
    });
    const dialog = this.terrainDialog.element;
    const mapTarget = dialog.querySelector<HTMLElement>('.gamify-territory-frame');
    if (!mapTarget) {
      this.terrainDialog.destroy();
      return;
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'gamify-territory-close';
    close.textContent = '×';
    close.setAttribute('aria-label', '关闭笔记领地');
    close.title = '关闭笔记领地';
    close.style.cssText =
      'position:fixed;left:0;top:0;z-index:10001;width:32px;height:32px;border:1px solid #ffffff33;border-radius:8px;background:#201e2ccc;color:#eeeaf5;font:24px/28px sans-serif;cursor:pointer;';
    close.onclick = () => this.terrainDialog?.destroy();
    this.terrainHost!.append(close);
    const closeIfOutside = (clientX: number, clientY: number) => {
      const rect = mapTarget.getBoundingClientRect();
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      )
        this.terrainDialog?.destroy();
    };
    this.terrainOutsideClick = (event) => closeIfOutside(event.clientX, event.clientY);
    this.terrainDialogClick = (event) => closeIfOutside(event.clientX, event.clientY);
    if (typeof dialog.addEventListener === 'function')
      dialog.addEventListener('click', this.terrainDialogClick, true);
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function')
      window.addEventListener('pointerdown', this.terrainOutsideClick, true);
    Object.assign(dialog.style, {
      width: '100vw',
      height: '100vh',
      maxWidth: '100vw',
      maxHeight: '100vh',
      margin: '0',
      padding: '0',
      background: 'transparent',
      border: '0',
      overflow: 'hidden',
    });
    for (const selector of ['.b3-dialog__header', '.b3-dialog__close']) {
      const part = dialog.querySelector<HTMLElement>(selector);
      if (part) part.style.display = 'none';
    }
    for (const selector of ['.b3-dialog__container', '.b3-dialog__body']) {
      const part = dialog.querySelector<HTMLElement>(selector);
      if (part)
        Object.assign(part.style, {
          width: '100%',
          height: '100%',
          maxWidth: 'none',
          maxHeight: 'none',
          margin: '0',
          padding: '0',
          background: 'transparent',
          overflow: 'hidden',
        });
    }
    this.syncTerrainFrame();
    this.terrainFrame.focus();
    this.plugin.closeView();
  }

  /** 原 onunload() 中的地形清理段（main.ts:993-1000）。 */
  destroy() {
    this.terrainDialog?.destroy();
    this.terrainDialog = null;
    if (this.terrainResize && typeof window !== 'undefined')
      window.removeEventListener('resize', this.terrainResize);
    this.terrainResize = undefined;
    this.terrainHost?.remove();
    this.terrainHost = null;
    this.terrainFrame = null;
  }
}
