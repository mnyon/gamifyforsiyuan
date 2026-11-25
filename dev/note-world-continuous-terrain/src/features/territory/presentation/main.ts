import { startTerritoryPage } from './TerritoryPage.js';
import { snapshotOf } from '../application/snapshot.js';
const page = startTerritoryPage();
const diagnostics = {
  get model() {
    return page.view.model;
  },
  get real() {
    return page.view.real;
  },
  get busy() {
    return page.collection.busy;
  },
  select: page.view.selectPage,
  sync: () => page.collection.start(),
  exportCache: () => snapshotOf(page.view.model),
  cache: page.cache,
  test: {
    reset: () => page.resetForTest(),
    pause: () => page.pauseForTest(),
    resume: () => page.resumeForTest(),
    batch: () => page.runBatchForTest(),
    status: () => ({
      real: page.view.real,
      busy: page.collection.busy,
      available: page.collection.available,
    }),
  },
  get diagnostics() {
    return page.view.diagnostics;
  },
};
declare global {
  interface Window {
    terrainAtlas: typeof diagnostics;
  }
}
window.terrainAtlas = diagnostics;
void page.ready.then(() => {
  if (window.parent !== window)
    window.parent.postMessage({ type: 'gamify-territory-ready' }, window.location.origin);
});
