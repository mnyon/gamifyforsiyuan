import { GamifyView } from '../src/presentation/GamifyView.js';
import { required, errorMessage } from '../src/presentation/elements.js';
import type { ViewOptions, ViewSnapshot } from '../src/presentation/types.js';
/** Simulation controls are reachable only from the test/preview entry graph. */
export class TestGamifyView extends GamifyView {
  constructor(options: ViewOptions) {
    super(options);
    const form = required(this.root, 'form');
    const onTestAction = options.onTestAction || (async () => {});

    const testControls = document.createElement('div');
    testControls.className = 'test-settings';
    testControls.innerHTML =
      '<span class="eyebrow">测试构建 · 仅模拟奖励</span><p class="privacy">独立模拟进度：每 3 项结算，勾选保持约 3 秒。不连接 Habitica，不修改真实奖励进度。日常使用请安装正式包。</p>';
    form.prepend(testControls);
    const testActions = document.createElement('div');
    testActions.className = 'test-actions';
    testActions.hidden = true;
    testActions.innerHTML =
      '<span class="eyebrow">测试模式 · 奖励均为模拟</span><div><button type="button" class="text" data-action="todo">模拟完成 TODO</button><button type="button" class="text" data-action="reward">预览金币特效</button></div>';
    testActions.onclick = async (event) => {
      const button = (event.target instanceof Element ? event.target : null)?.closest('button');
      if (!button) return;
      button.disabled = true;
      try {
        await onTestAction(button.dataset.action || '');
      } catch (error) {
        this.feedback(errorMessage(error));
      } finally {
        button.disabled = false;
      }
    };
    required(this.root, '.dashboard').prepend(testActions);
  }
  override update(snapshot: ViewSnapshot) {
    const testMode = !!snapshot.testMode;

    required(this.root, '.test-actions').hidden = !testMode;
    required(this.root, '.primary').disabled = testMode;

    super.update(snapshot);
  }
}
