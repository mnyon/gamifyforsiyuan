import { required } from '../../../presentation/elements.js';
import { inventoryItems } from '../application/projections.js';
import type { InventoryItem } from '../domain/types.js';
import type { AdventureView } from './AdventureView.js';

/** The adventure bag: browse owned items and equip/unequip battle gear. */
export class BagPanel {
  category = 'all';
  selected?: string;
  constructor(private readonly host: AdventureView) {}
  render() {
    const host = this.host;
    const items = inventoryItems(host.user, host.content),
      filtered = items.filter((i) => this.category === 'all' || i.category === this.category);
    host.text('.bag-total', `${items.length} 种物品`);
    const tabs = required(host.root, '.bag-tabs');
    tabs.replaceChildren();
    for (const [key, title] of [
      ['all', '全部'],
      ['gear', '装备'],
      ['food', '食物'],
      ['other', '蛋与药水'],
      ['quest', '任务卷轴'],
    ]) {
      const b = host.node('button', '', title);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(this.category === key));
      b.onclick = () => {
        this.category = key;
        this.render();
        ([...tabs.children] as HTMLElement[]).find((n) => n.textContent === title)?.focus();
      };
      tabs.append(b);
    }
    const selected = filtered.find((i) => i.key === this.selected) || filtered[0];
    this.selected = selected?.key;
    const grid = required(host.root, '.bag-grid');
    grid.replaceChildren();
    for (const item of filtered) {
      const b = host.node('button', `bag-slot${item === selected ? ' selected' : ''}`);
      b.type = 'button';
      b.title = item.name;
      b.dataset.key = item.key;
      b.setAttribute(
        'aria-label',
        `${item.name}，数量 ${item.quantity}${item.equipped ? '，已装备' : ''}`,
      );
      b.setAttribute('aria-pressed', String(item === selected));
      b.append(host.image(item.image), host.node('small', '', item.quantity));
      if (item.equipped) b.append(host.node('i', 'equipped-dot'));
      b.onclick = () => this.select(item, grid);
      grid.append(b);
    }
    for (let i = filtered.length; i < 12; i++) {
      const empty = host.node('span', 'bag-slot empty', '◇');
      empty.setAttribute('aria-hidden', 'true');
      grid.append(empty);
    }
    this.detail(selected);
  }
  /** Selection only repaints the detail: rebuilding the grid would refetch art. */
  private select(item: InventoryItem, grid: HTMLElement) {
    this.selected = item.key;
    for (const slot of grid.querySelectorAll<HTMLElement>('button.bag-slot')) {
      const current = slot.dataset.key === item.key;
      slot.classList.toggle('selected', current);
      slot.setAttribute('aria-pressed', String(current));
      if (current) slot.focus();
    }
    this.detail(item);
  }
  private detail(selected?: InventoryItem) {
    const host = this.host;
    const detail = required(host.root, '.bag-detail');
    detail.replaceChildren();
    if (!selected) {
      detail.append(
        host.node('p', '', host.content ? '这个分类暂时没有物品。' : '正在读取物品说明…'),
      );
      return;
    }
    const art = host.node('div', 'detail-art');
    art.append(host.image(selected.image));
    const info = host.node('div');
    info.append(
      host.node('div', 'detail-type', selected.equipped ? '已装备' : '持有物品'),
      host.node('h3', '', selected.name),
      host.node('p', '', selected.notes || '官方暂未提供物品说明'),
      host.node('small', '', `持有数量 · ${selected.quantity}`),
    );
    if (selected.category === 'gear') {
      const reason = host.blocked || (host.busy ? '正在处理，请稍候' : '');
      const button = host.node('button', 'primary', selected.equipped ? '卸下' : '穿戴');
      button.type = 'button';
      button.disabled = !!reason;
      button.onclick = () => this.confirmEquip(selected, selected.key.slice('gear:'.length));
      const actions = host.node('div', 'detail-actions');
      actions.append(button);
      info.append(actions);
    }
    detail.append(art, info);
  }
  confirmEquip(item: InventoryItem, gearKey: string) {
    const host = this.host;
    const entry = host.content?.gear?.flat?.[gearKey];
    const crossClass =
      !!entry?.klass &&
      entry.klass !== 'special' &&
      !!host.user?.stats?.class &&
      entry.klass !== host.user.stats.class;
    const notes = [
      item.notes,
      item.equipped ? '卸下后角色外观立即更新。' : '穿戴后角色外观立即更新。',
      host.user?.preferences?.costume ? '当前展示装扮套装，战斗装备变化不会改变外观。' : '',
      crossClass ? '跨职业装备会有属性惩罚。' : '',
    ]
      .filter(Boolean)
      .join('\n');
    const reason = host.blocked || (host.busy ? '正在处理，请稍候' : '');
    host.dialog(
      item.name,
      notes + (reason ? '\n' + reason : ''),
      reason || (item.equipped ? '确认卸下' : '确认穿戴'),
      async () => {
        await host.onAction('equip', gearKey);
        if (host.view.destroyed) return;
        host.dismiss(true);
        host.view.feedback(`${item.name}${item.equipped ? '已卸下' : '已穿戴'}`, true);
      },
      !!reason,
    );
  }
}
