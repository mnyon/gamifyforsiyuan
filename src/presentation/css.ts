import base from './styles.css';
import mobile from './mobile.css';

/** Full plugin stylesheet: base rules plus the mobile projection, in that
 * order. Mobile selectors carry :host(.mobile) and outrank the base rules. */
export const PLUGIN_CSS = base + '\n' + mobile;
