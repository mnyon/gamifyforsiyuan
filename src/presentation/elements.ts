export function required<K extends keyof HTMLElementTagNameMap>(
  root: ParentNode,
  selector: K,
): HTMLElementTagNameMap[K];
export function required(
  root: ParentNode,
  selector: '.primary' | '.close' | '.refresh' | '.resolve' | '.settings-toggle',
): HTMLButtonElement;
export function required(root: ParentNode, selector: string): HTMLElement;
export function required(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw Error('缺少界面元素：' + selector);
  return element;
}
export function optional(root: ParentNode, selector: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(selector);
}
export function input(form: HTMLFormElement, name: string): HTMLInputElement {
  const element = form.elements.namedItem(name);
  if (!(element instanceof HTMLInputElement)) throw Error('缺少输入项：' + name);
  return element;
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '暂时无法完成操作';
}
