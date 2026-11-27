import { required } from '../../../presentation/elements.js';
import { armoireReward, purchaseBlockReason, shopItems } from '../application/projections.js';
import type { ShopItem } from '../domain/types.js';
import type { AdventureView } from './AdventureView.js';

/** The traveler's shop. Prices and locks come from the official snapshots. */
export class ShopPanel {
  products: ShopItem[] = [];
  constructor(private readonly host: AdventureView) {}
  render() {
    const host = this.host;
    host.text('.shop-gold', `◉ ${Number(host.user?.stats?.gp || 0).toFixed(2)}`);
    const list = required(host.root, '.products');
    list.replaceChildren();
    if (!host.shops || !host.content) {
      host.text('.shop-state', '进入商店后读取官方商品');
      return;
    }
    host.text('.shop-state', '商品与价格来自 Habitica · 宝石商品请在官方商店购买');
    this.products = shopItems(
      host.shops.market,
      host.shops.gear,
      host.shops.seasonal,
      host.content,
      host.user!,
    );
    for (const item of this.products) {
      const card = host.node('button', 'product');
      card.type = 'button';
      const art = host.node('div', 'product-art');
      art.append(host.image(item.image));
      const info = host.node('div', 'product-info');
      info.append(
        host.node('b', '', item.name),
        host.node(
          'small',
          '',
          `${item.currency === 'gold' ? '◉' : '◆'} ${Number.isFinite(item.price) ? item.price : '—'}`,
        ),
        host.node('span', 'gap', purchaseBlockReason(item, host.user) || '可以购买'),
      );
      card.append(art, info);
      card.onclick = () => this.confirm(item);
      list.append(card);
    }
  }
  confirm(item: ShopItem) {
    const host = this.host;
    const reason =
      purchaseBlockReason(item, host.user) || host.blocked || (host.busy ? '正在处理，请稍候' : '');
    host.dialog(
      item.name,
      `${item.notes}\n价格 ${item.price} ${item.currency === 'gold' ? '金币' : '宝石'}${item.kind === 'potion' ? '，购买后立即使用' : ''}。${reason ? '\n' + reason : ''}`,
      reason || (item.kind === 'armoire' ? '购买并开启' : '确认购买'),
      async () => {
        const result = await host.onAction('buy', item.key);
        if (host.view.destroyed) return;
        host.dismiss(true);
        if (item.kind === 'armoire') host.openChest(armoireReward(result || null, host.content));
        else host.view.feedback(`${item.name}购买成功`, true);
      },
      !!reason,
    );
    if (item.currency !== 'gold') {
      const link = host.node('a', 'official-shop-link', '前往 Habitica 官方商店 ↗');
      link.href = 'https://habitica.com/shops/market';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      required(host.overlay, '.adventure-sheet').append(link);
    }
  }
}
