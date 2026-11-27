import { optional, required } from '../../../presentation/elements.js';
import type { RewardPresentation } from '../domain/types.js';
import type { AdventureView } from './AdventureView.js';

export interface ChestState {
  reward: RewardPresentation | null;
  revealed: boolean;
  charging?: boolean;
}
/** The armoire reveal. The server result is already settled; this never generates a drop. */
export class ChestOverlay {
  chest: ChestState | null = null;
  private timer?: number;
  constructor(private readonly host: AdventureView) {}
  open(reward: RewardPresentation | null) {
    const host = this.host;
    host.dialog('魔法宝箱', '', '', () => {}, true);
    this.chest = { reward, revealed: false };
    host.overlay.classList.add('chest-overlay');
    const sheet = host.overlay.firstElementChild as HTMLElement;
    sheet.className = 'sheet';
    sheet.replaceChildren();
    const opening = host.node('div', 'opening');
    opening.innerHTML =
      '<button class="skip" data-dismiss>跳过动画 ↗</button><div class="chest-kicker">THE ENCHANTED ARMOIRE</div><h3 id="adventure-dialog-title">魔法宝箱</h3><p>一份未知的惊喜，正在等待你。</p><div class="chest-stage"><div class="rays"></div><div class="chest-aura"></div><div class="halo"></div></div><button class="primary">开启宝箱</button><div class="burst"></div>';
    required(opening, '.chest-stage').append(host.image('shop_armoire', 'chest-image'));
    sheet.append(opening);
    required(opening, '.primary').onclick = () => {
      if (!this.chest || this.chest.charging) return;
      this.chest.charging = true;
      opening.classList.add('charging');
      this.sound(false);
      required(opening, '.primary').disabled = true;
      this.timer = window.setTimeout(
        () => this.reveal(),
        matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 2400,
      );
    };
    required(opening, '.primary').focus();
  }
  reveal() {
    if (!this.chest || this.chest.revealed) return;
    clearTimeout(this.timer);
    this.chest.revealed = true;
    const host = this.host;
    const reward = this.chest.reward,
      opening = optional(host.overlay, '.opening');
    if (!opening) return;
    opening.classList.remove('charging');
    opening.classList.add('revealed');
    opening.replaceChildren();
    const label = host.node(
      'div',
      'chest-kicker',
      reward
        ? `YOU DISCOVERED · ${{ gear: '装备', food: '食物', experience: '经验' }[reward.type]}`
        : 'HABITICA',
    );
    const stage = host.node('div', 'chest-stage');
    for (const cls of ['rays', 'chest-aura', 'halo']) stage.append(host.node('div', cls));
    for (let i = 0; i < 22; i++) {
      const mote = host.node('i', 'mote');
      mote.style.setProperty('--angle', `${i * 16.36}deg`);
      mote.style.setProperty('--delay', `${(i % 4) * 0.04}s`);
      stage.append(mote);
    }
    stage.append(
      reward?.image
        ? host.image(reward.image, 'reward-art')
        : host.node('span', 'reward-experience', '✦'),
    );
    const heading = host.node('h3', '', reward?.name || '宝箱已开启');
    heading.id = 'adventure-dialog-title';
    const notes = host.node(
      'p',
      '',
      reward?.notes || 'Habitica 已完成购买，请在背包或官方账号中查看结果。',
    );
    const done = host.node('button', 'primary', '收下奖励');
    done.type = 'button';
    done.dataset.dismiss = '';
    opening.append(label, stage, heading, notes, done, host.node('div', 'burst'));
    this.sound(true);
    done.focus();
  }
  reset() {
    clearTimeout(this.timer);
    this.chest = null;
  }
  destroy() {
    clearTimeout(this.timer);
  }
  private sound(reveal: boolean) {
    const view = this.host.view;
    if (!view.soundEnabled || !view.audio || view.audio.state !== 'running') return;
    const audio = view.audio;
    (reveal
      ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
      : [130.81, 196, 261.63, 392, 523.25]
    ).forEach((f, i) => {
      const tone = audio.createOscillator(),
        gain = audio.createGain(),
        start = audio.currentTime + i * (reveal ? 0.09 : 0.35);
      tone.type = 'sine';
      tone.frequency.value = f;
      tone.connect(gain);
      gain.connect(audio.destination);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.035, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 1.1);
      tone.start(start);
      tone.stop(start + 1.2);
    });
  }
}
