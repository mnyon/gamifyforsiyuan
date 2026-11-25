// Public browser diagnostics and development test entry.
export { AtlasCache } from './adapters/IndexedDbAtlasRepository.js';
export { GentleSync } from './application/GentleSync.js';
export { snapshotOf, validSnapshot } from './application/snapshot.js';
export { CACHE_VERSION, MAX_AGE } from './application/ports.js';
export { restoreWorld, applyMetadata } from './application/updateWorld.js';
