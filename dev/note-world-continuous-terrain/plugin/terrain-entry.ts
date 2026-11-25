/**
 * 「笔记领地」入口按钮（归档）。
 *
 * 来源：src/presentation/GamifyView.ts:125-144（2026-11-21 工作区版本）。
 * 原代码内联在 GamifyView 构造函数里，通过闭包调用 onOpenTerrain，
 * 失败时调用 this.feedback(errorMessage(error))。归档时抽成独立函数，
 * DOM 结构与事件行为保持不变；错误交给调用方处理。
 *
 * 本目录不参与插件构建、类型检查与测试，仅作存档。
 */
export interface TerrainEntryHandlers {
  onOpen(): void;
  onError(error: unknown): void;
}

export function createTerrainEntry(handlers: TerrainEntryHandlers): HTMLDivElement {
  const auxiliary = document.createElement('div');
  auxiliary.className = 'companion-auxiliary';
  const terrain = document.createElement('button');
  terrain.type = 'button';
  terrain.className = 'terrain-entry';
  terrain.textContent = '笔记领地';
  terrain.setAttribute('aria-label', '打开笔记领地地图');
  const arrow = document.createElement('span');
  arrow.textContent = '↗';
  arrow.setAttribute('aria-hidden', 'true');
  terrain.append(arrow);
  terrain.onclick = () => {
    try {
      handlers.onOpen();
    } catch (error) {
      handlers.onError(error);
    }
  };
  auxiliary.append(terrain);
  return auxiliary;
}
