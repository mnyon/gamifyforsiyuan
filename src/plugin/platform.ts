// Single registry of platform knowledge. When a mobile issue surfaces, start
// here: detection, capabilities and WebView quirks are enumerated in one file.
// Probe capabilities, never sniff user agents. The presentation layer reads
// the .mobile class projection applied by the composition root instead of
// importing this module (no upward dependency).
import { getFrontend } from 'siyuan';

/** SiYuan's official frontend detection: mobile app and mobile browser. */
export function isMobileFrontend(): boolean {
  return ['mobile', 'browser-mobile'].includes(getFrontend());
}

/** Some mobile WebViews do not expose Web Locks; without them we assume a
 * single active window and keep the plugin usable. */
export function supportsWebLocks(): boolean {
  return !!navigator.locks;
}

/** SiYuan may leave its presentation class behind after unchecking a task on
 * a mobile WebView. Follow the explicit blank marker without editing notes. */
export const MOBILE_TASK_QUIRK_CSS =
  '.protyle-wysiwyg .li[data-type="NodeListItem"][data-subtype="t"][data-task=" "].protyle-task--done > div[data-node-id].p { color: inherit; text-decoration: none; }';

export function applyMobileTaskQuirk(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = MOBILE_TASK_QUIRK_CSS;
  document.head.append(style);
  return style;
}
