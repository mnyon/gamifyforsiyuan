import type { GamifyView } from '../src/presentation/GamifyView.js';
import type { ProgressState } from '../src/features/progress/domain/types.js';
import type { ActivityProgress } from '../src/features/progress/domain/ActivityProgress.js';
import type { EditTracker } from '../src/features/progress/presentation/EditTracker.js';
import type { CaretFollower } from '../src/presentation/types.js';
import type {
  adventureContent,
  adventureUser,
  adventureShops,
} from '../tests/fixtures/adventure-fixture.js';
import type { TerritoryPage } from '../src/features/territory/presentation/TerritoryPage.js';
import type { snapshotOf } from '../src/features/territory/application/snapshot.js';
declare global {
  var demo: {
    view: GamifyView;
    state: ProgressState;
    user: ReturnType<typeof adventureUser>;
    content: typeof adventureContent;
    shops: ReturnType<typeof adventureShops>;
    actions(): number;
  };
  var showcase: {
    view: GamifyView;
    state: ProgressState;
    user: { stats: { gp: number }; [key: string]: unknown };
  };
  var state: ProgressState;
  var activity: ActivityProgress;
  var tracker: EditTracker;
  var view: GamifyView;
  var totals: () => { inserted: number; deleted: number; maintenance: number };
  var imeEvents: unknown[];
  var followerBeforeDestroy: CaretFollower;
  var terrainAtlas: {
    model: TerritoryPage['view']['model'];
    real: boolean;
    busy: boolean;
    select: TerritoryPage['view']['selectPage'];
    sync(): Promise<void>;
    exportCache: typeof snapshotOf extends (...args: never[]) => infer R ? () => R : never;
    cache: TerritoryPage['cache'];
    diagnostics: TerritoryPage['view']['diagnostics'];
  };
}
