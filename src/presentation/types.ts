import type { Credentials } from '../features/connection/domain/credentials.js';
import type { ProgressState } from '../features/progress/domain/types.js';
import type { CompanionUser } from '../features/companion/domain/types.js';
import type {
  AdventureOptions,
  AdventureSnapshot,
} from '../features/companion/presentation/AdventureView.js';
export interface Point {
  x: number;
  y: number;
}
export interface FeedbackContext {
  blockId?: string;
  element?: HTMLElement;
  point?: Point;
  weight?: number;
  caret?: boolean;
}
export interface EffectEntry extends FeedbackContext {
  effect: HTMLDivElement;
  element: HTMLElement;
  frame: number;
}
export interface CaretFollower {
  element: HTMLDivElement;
  origin: Point;
  x: number;
  y: number;
  last: number;
  until: number;
  goldUntil: number;
  phase: number;
  approach: number;
  listeners: Array<[EventTarget, string, EventListener]>;
  activityAt: number;
  wakeAt: number;
  frame: number;
  composing?: boolean;
  maintenanceUntil?: number;
}
export interface ViewOptions {
  css: string;
  onConnect: (value: Credentials) => Promise<void>;
  onSound: (sound: boolean) => void;
  onRefresh: () => unknown;
  onResolve: (retry: boolean) => Promise<unknown>;
  onTestAction?: (action: string) => Promise<unknown>;
  onAdventureLoad?: AdventureOptions['onLoad'];
  onAdventureAction?: AdventureOptions['onAction'];
  onOpenTerrain?: () => void;
}
export interface ViewSnapshot {
  state: ProgressState;
  user?: CompanionUser | null;
  message?: string;
  status?: string;
  backlog?: number;
  testMode?: boolean;
  adventure?: AdventureSnapshot;
}
