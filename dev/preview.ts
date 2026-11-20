// Explicit exports for browser fixtures; never included in the plugin package.
export { TestGamifyView as GamifyView } from './TestGamifyView.js';
export { PLUGIN_CSS } from '../src/plugin/styles.js';
export { HABITICA_ICON } from '../src/presentation/icon.js';
export { EditTracker } from '../src/features/progress/presentation/EditTracker.js';
export {
  ActivityProgress,
  editingApproach,
} from '../src/features/progress/domain/ActivityProgress.js';
export { newProgress } from '../src/features/progress/domain/TodoProgress.js';
