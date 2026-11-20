import type {
  ActionStatus,
  CompanionAction,
  CompanionSkill,
  CompanionUser,
  PurchasableItem,
} from '../domain/types.js';
export interface ActionCatalog {
  skillFor(user: CompanionUser, key: string): CompanionSkill | undefined;
  productFor(user: CompanionUser, key: string): PurchasableItem | undefined;
}
export interface CompanionGateway {
  loadCatalog(kind: CompanionAction['kind']): Promise<ActionCatalog>;
  readPlayer(): Promise<CompanionUser>;
  execute(action: CompanionAction): Promise<unknown>;
  invalidateUser(): void;
  invalidateShops(): void;
}
export interface ActionJournal {
  hasPending(): boolean;
  begin(action: CompanionAction, at: number): void;
  clear(): void;
}
export interface CompanionOperationPorts {
  gateway: CompanionGateway;
  journal: ActionJournal;
  isCurrent(): boolean;
  onUser(user: CompanionUser): void;
  onStatus(status: ActionStatus): void;
  onShopsInvalidated(): void;
}
export interface ExecuteActionPorts extends CompanionOperationPorts {
  now(): number;
}
