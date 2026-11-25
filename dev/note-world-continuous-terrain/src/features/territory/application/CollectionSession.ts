import { GentleSync } from './GentleSync.js';
import { MAX_AGE } from './ports.js';
import type {
  AtlasRepository,
  MetadataApi,
  WorldSnapshot,
  CollectionProgress,
  CollectionResult,
  Checkpoint,
} from './ports.js';
import type { Book, Metadata } from '../domain/types.js';
export interface CollectionEnvironment {
  now(): number;
  visible(): boolean;
  schedule(callback: () => void, delay: number): () => void;
  exclusively(work: () => Promise<void>): Promise<void>;
}
export interface CollectionHooks {
  setBooks(books: Book[]): void;
  progress(progress: CollectionProgress): void;
  ready(snapshot: WorldSnapshot | null, checkpoint: Checkpoint | null): Promise<void>;
  collected(metadata: Metadata): Promise<WorldSnapshot>;
  saved(snapshot: WorldSnapshot): void;
  fresh(): void;
  error(error: unknown, cacheUnavailable: boolean): void;
}
/** Owns one visible-page collection session. Timing and cross-tab locking are injected. */
export class CollectionSession {
  private collector: GentleSync | null = null;
  private cancel: (() => void) | null = null;
  private generation = 0;
  private running = false;
  available = true;
  constructor(
    private readonly api: MetadataApi,
    private readonly cache: AtlasRepository,
    private readonly environment: CollectionEnvironment,
    private readonly hooks: CollectionHooks,
  ) {}
  get busy() {
    return this.running;
  }
  /** Run one scheduled batch immediately; exposed for local development diagnostics. */
  async runNow() {
    this.cancel?.();
    this.cancel = null;
    await this.runBatch();
  }
  stop() {
    this.generation++;
    this.cancel?.();
    this.cancel = null;
    this.collector = null;
    this.running = false;
  }
  private schedule(delay: number) {
    this.cancel?.();
    const generation = this.generation;
    this.cancel = this.environment.schedule(() => {
      this.cancel = null;
      if (generation === this.generation) void this.runBatch();
    }, delay);
  }
  async start() {
    if (this.collector || !this.available) return;
    this.stop();
    const generation = this.generation;
    const collector = new GentleSync({
      api: this.api,
      cache: this.cache,
      now: () => this.environment.now(),
      onProgress: (progress) => {
        if (generation === this.generation) this.hooks.progress(progress);
      },
    });
    this.collector = collector;
    try {
      const previous = await collector.initialize();
      if (generation !== this.generation) return;
      this.hooks.setBooks(collector.state?.books || previous?.books || []);
      await this.hooks.ready(previous, collector.state);
      if (generation !== this.generation) return;
      this.schedule(1500);
    } catch (error) {
      if (generation !== this.generation) return;
      this.available = false;
      this.stop();
      this.hooks.error(error, true);
    }
  }
  private async runBatch() {
    const collector = this.collector;
    if (!collector) return;
    if (!this.environment.visible()) {
      this.schedule(15000);
      return;
    }
    if (this.running) {
      this.schedule(5000);
      return;
    }
    const generation = this.generation;
    this.running = true;
    try {
      let result: CollectionResult | undefined;
      await this.environment.exclusively(async () => {
        if (generation !== this.generation) return;
        await collector.initialize();
        if (generation !== this.generation) return;
        this.hooks.setBooks(collector.state?.books || collector.previous?.books || []);
        result = await collector.step();
      });
      if (generation !== this.generation) return;
      if (result?.done && 'data' in result) {
        const snapshot = await this.hooks.collected(result.data);
        if (generation !== this.generation) return;
        await collector.commit(snapshot);
        if (generation !== this.generation) return;
        this.hooks.saved(snapshot);
        this.schedule(MAX_AGE);
      } else if (result?.done && 'fresh' in result) {
        this.hooks.fresh();
        this.schedule(Math.max(60000, MAX_AGE - (this.environment.now() - collector.previous!.at)));
      } else this.schedule(result && !collector.previous ? 200 : 3000);
    } catch (error) {
      if (generation !== this.generation) return;
      const cacheUnavailable =
        typeof error === 'object' &&
        error !== null &&
        'cacheError' in error &&
        error.cacheError === true;
      if (cacheUnavailable) {
        this.available = false;
        this.stop();
      } else this.schedule(60000);
      this.hooks.error(error, cacheUnavailable);
    } finally {
      if (generation === this.generation) this.running = false;
    }
  }
}
