import type { Book, Page, Edge, Metadata, Layout } from '../domain/types.js';
export const CACHE_VERSION = 1,
  MAX_AGE = 24 * 60 * 60 * 1000;
export const FIELD_NAMES = [
  'base',
  'heights',
  'sourceHeights',
  'activity',
  'dormancy',
  'density',
  'content',
  'runoff',
] as const;
export type TerrainFields = Record<(typeof FIELD_NAMES)[number], Float32Array>;
export interface WorldSnapshot extends Metadata {
  version: 1;
  generator: 4;
  at: number;
  now?: number;
  layout: Layout;
  fields?: TerrainFields;
}
export type CollectionPhase = 'books' | 'pages' | 'sizes' | 'edges' | 'ready';
export interface EdgeCursor {
  source: string;
  target: string;
}
export interface Checkpoint extends Metadata {
  version: 1;
  phase: CollectionPhase;
  after: string;
  sizeIndex: number;
  edgeCursor: EdgeCursor | null;
  started: number;
}
export interface AtlasRepository {
  read(key: 'snapshot' | 'checkpoint'): Promise<unknown>;
  write(key: 'snapshot' | 'checkpoint', value: WorldSnapshot | Checkpoint | null): Promise<void>;
}
export interface MetadataApi {
  (name: 'books'): Promise<{ books: Book[] }>;
  (name: 'pages', body: { after: string; limit: number }): Promise<Page[]>;
  (name: 'sizes', body: { ids: string[] }): Promise<Array<{ id: string; chars: number }>>;
  (name: 'edges', body: { after: EdgeCursor | null; limit: number }): Promise<Edge[]>;
}
export interface CollectionProgress {
  phase: CollectionPhase;
  pages: number;
  sizes: number;
  edges: number;
}
export type CollectionResult =
  { done: false } | { done: true; fresh: true } | { done: true; data: Metadata };
