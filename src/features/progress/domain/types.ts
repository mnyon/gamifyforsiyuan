/** Existing v1 JSON format. Optional receipt fields also support legacy records. */
export type RewardStatus = 'queued' | 'sending' | 'uncertain' | 'sent';
export type RewardKind = 'editing' | 'maintenance';
export interface Reward {
  id: string;
  status: RewardStatus;
  kind?: RewardKind;
  created: number;
  count: number;
  sources: string[];
  attempted?: number;
  before?: number;
  historyBefore?: number;
  goldBefore?: number;
  gold?: number | null;
}
export interface ActivityBlock {
  inserted: number;
  deleted: number;
  previousUpdated: number | null;
  contribution: number;
  weight?: number;
}
export interface ActivityDay {
  inserted: number;
  deleted: number;
  maintenance: number;
  blocks: Record<string, ActivityBlock>;
  editingRewards: number;
  maintenanceReward: boolean;
  editingTarget: number;
  maintenanceTarget: number;
}
export interface ActivityState {
  version: 1;
  editingBaseline: number;
  maintenanceBaseline: number;
  current?: string;
  days: Record<string, ActivityDay>;
}
export interface ProgressState {
  version: 1;
  target: number | null;
  pending: Record<string, { since: number; day: string }>;
  credits: Array<{ id: string; day: string }>;
  used: Record<string, Record<string, 'spent' | 'unspent' | true>>;
  rewards: Reward[];
  total: number;
  snapshot?: { day: string; backlog: number; target: number };
  activity?: ActivityState;
  alias?: string;
  account?: string;
}
export interface TaskRow {
  id: string;
  markdown: string;
}
export interface BlockEdit {
  id: string;
  inserted?: number;
  deleted?: number;
  previousUpdated?: number | null;
}
