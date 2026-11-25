export interface Point {
  x: number;
  z: number;
}
export interface Position extends Point {
  y: number;
}
export interface Note {
  id: string;
  title: string;
  book: string;
  chars: number;
}
export interface Citation {
  source: string;
  target: string;
  weight: number;
}
export interface WorldInput {
  notes: readonly Note[];
  bookNames: ReadonlyMap<string, string>;
  citations: readonly Citation[];
}
export type Climate = 'snow' | 'alpine' | 'dry' | 'boreal' | 'temperate';
export interface WorldRules {
  seaLevel: number;
  landThreshold: number;
  extent: number;
  gridSize: number;
  landmarkBooks: number;
}
export const defaultRules: Readonly<WorldRules> = {
  seaLevel: -0.3,
  landThreshold: 0.25,
  extent: 400,
  gridSize: 192,
  landmarkBooks: 16,
};
export type FeatureKind =
  | 'library'
  | 'house'
  | 'barn'
  | 'cottage'
  | 'path'
  | 'lighthouse'
  | 'windmill'
  | 'tree'
  | 'pine'
  | 'farm'
  | 'fence'
  | 'pond'
  | 'rock'
  | 'shrub'
  | 'flower'
  | 'bridge';
export interface Feature extends Position {
  kind: FeatureKind;
  size?: number;
  scale?: number;
  angle?: number;
  climate?: Climate;
  pathType?: 'stone' | 'dirt';
  note?: Note;
}
export interface TerrainSurface {
  size: number;
  extent: number;
  cellSize: number;
  seaLevel: number;
  heights: Float32Array;
  climates: Climate[];
  groundAt(x: number, z: number): number;
}
export interface Terrain extends TerrainSurface {
  tracks: Uint8Array;
}
export interface World {
  terrain: Terrain;
  cities: readonly City[];
  notes: readonly NoteMarker[];
  features: readonly Feature[];
  labels: readonly (Position & { name: string })[];
}
export interface City extends Point {
  book: string;
  notes: Note[];
}
export interface NoteMarker extends Position {
  note: Note;
  height: number;
  onLand: boolean;
}
