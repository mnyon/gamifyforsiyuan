import GamifyForSiYuan from '../../src/plugin/main.js';
import { TestGamifyView } from './TestGamifyView.js';
import type { ViewOptions } from '../../src/presentation/types.js';
export default class TestPlugin extends GamifyForSiYuan {
  override createView(options: ViewOptions) {
    return new TestGamifyView({ ...options, onTestAction: (action) => this.testAction(action) });
  }
  async testAction(action: string) {
    if (!this.testMode || this.switchingMode || this.disposed) return;
    if (action === 'reward') {
      this.view.rewardFeedback(1);
      return;
    }
    const id = 'test-' + crypto.randomUUID();
    this.testRows.push({ id, markdown: '* [X] test' });
    this.engine.localChange(id, true);
    this.localDirty = true;
    this.render();
    this.view.completeTodo();
    await this.scan();
  }
}
