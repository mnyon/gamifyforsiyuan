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
