import { required } from '../../../presentation/elements.js';
import { plainNotes, skillBlockReason } from '../application/projections.js';
import type { CatalogSkill } from '../domain/types.js';
import type { AdventureView } from './AdventureView.js';

type Spell = CatalogSkill & { key: string; lvl: number; mana: number };
/** Class skills on the home page. Shared state and the dialog live on the host. */
export class SkillPanel {
  private signature = '';
  constructor(private readonly host: AdventureView) {}
  update() {
    const { user, content } = this.host;
    const signature = JSON.stringify([
      user?.stats?.class,
      user?.stats?.lvl,
      user?.stats?.mp,
      user?.stats?.buffs?.streaks,
      !!content,
    ]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.render();
    }
    this.refreshStates();
  }
  private spells(): Spell[] {
    const { user, content } = this.host;
    return Object.values(content?.spells?.[user?.stats?.class || ''] || {}).filter(
      (s): s is Spell =>
        typeof s.key === 'string' && typeof s.lvl === 'number' && typeof s.mana === 'number',
    );
  }
  private state(spell: Spell) {
    const reason = skillBlockReason(spell, this.host.user),
      disabled = reason || this.host.blocked || (this.host.busy ? '正在处理，请稍候' : ''),
      hint =
        spell.target === 'task'
          ? '需指定任务'
          : !['self', 'party'].includes(spell.target || '')
            ? '需选择目标'
            : reason || '暂不可用';
    return { disabled, hint };
  }
  refreshStates() {
    const spells = this.spells();
    for (const button of this.host.root.querySelectorAll<HTMLButtonElement>('[data-skill-key]')) {
      const spell = spells.find((item) => item.key === button.dataset.skillKey);
      if (!spell) continue;
      const { disabled, hint } = this.state(spell),
        wrapper = button.parentElement;
      button.disabled = !!disabled;
      button.setAttribute(
        'aria-label',
        `${spell.text}，${spell.mana} 法力${disabled ? '；' + disabled : ''}`,
      );
      if (!wrapper) continue;
      wrapper.title = disabled || plainNotes(spell.notes);
      const existing = wrapper.querySelector<HTMLElement>('.skill-unavailable');
      if (disabled) {
        if (existing) existing.textContent = hint;
        else wrapper.append(this.host.node('small', 'skill-unavailable', hint));
      } else existing?.remove();
    }
  }
  render() {
    const host = this.host;
    const list = required(host.root, '.skills');
    list.replaceChildren();
    const spells = this.spells();
    if (!spells.length) {
      list.append(
        host.node(
          'span',
          'empty-copy',
          host.content ? '等级 11 后解锁职业技能' : '打开面板后加载职业技能',
        ),
      );
      return;
    }
    for (const spell of spells) {
      const reason = skillBlockReason(spell, host.user),
        wrapper = host.node('div', 'skill-wrapper');
      wrapper.title = plainNotes(spell.notes);
      const button = host.node(
        'button',
        `skill${reason === '法力不足' ? ' mana-low' : ''}${spell.key === 'frost' && host.user?.stats?.buffs?.streaks ? ' buff-active' : ''}`,
      );
      button.type = 'button';
      button.dataset.skillKey = spell.key;
      const icon = host.node('span', 'skill-icon');
      icon.append(host.image(`shop_${spell.key}`));
      icon.append(host.node('span', 'slot-glint'));
      button.append(
        icon,
        host.node('span', '', spell.text),
        host.node('small', '', `${spell.mana} MP`),
      );
      wrapper.append(button);
      button.onclick = () => this.confirm(spell);
      list.append(wrapper);
    }
    this.refreshStates();
  }
  confirm(spell: Spell) {
    const host = this.host;
    host.dialog(
      spell.text || spell.key,
      `${plainNotes(spell.notes)}\n消耗 ${spell.mana} 点法力${spell.target === 'party' ? '，作用于当前队伍' : ''}。`,
      '确认施放',
      async () => {
        const result = await host.onAction('cast', spell.key);
        if (host.view.destroyed) return result;
        host.dismiss(true);
        host.view.feedback(`${spell.text}已施放`, true);
        return result;
      },
    );
  }
}
