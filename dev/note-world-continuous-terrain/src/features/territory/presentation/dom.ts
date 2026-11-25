const controls = {
  search: 'input',
  key: 'input',
  roads: 'input',
  pages: 'select',
  focus: 'button',
  'demo-edit': 'button',
  overview: 'button',
  connection: 'button',
  'cancel-connect': 'button',
  'connect-submit': 'button',
  disconnect: 'button',
  open: 'a',
  'connect-dialog': 'dialog',
  'connect-form': 'form',
} as const;
type Controls = typeof controls;
type ElementFor<K extends string> = K extends keyof Controls
  ? HTMLElementTagNameMap[Controls[K]]
  : HTMLElement;
export function element<K extends string>(id: K): ElementFor<K> {
  const found = document.getElementById(id);
  if (!found) throw Error('缺少地图界面元素：' + id);
  const tag = controls[id as keyof Controls];
  if (tag && found.tagName.toLowerCase() !== tag) throw Error('地图界面元素类型不匹配：' + id);
  return found as ElementFor<K>;
}
export function yieldFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
export function message(error: unknown): string {
  return error instanceof Error ? error.message : '暂时无法完成操作';
}
