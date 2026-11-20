export interface Point {
  x: number;
  z: number;
}
export interface Book {
  id: string;
  name: string;
}
export interface Page {
  id: string;
  box: string;
  title: string;
  updated: string | number | null;
  chars?: number;
}
export interface Edge {
  source: string;
  target: string;
  weight: number;
}
export interface Region extends Point {
  r: number;
  angle: number;
}
export interface PagePosition extends Point {
  slot: number;
  box: string;
  form: string;
  radius: number;
}
export interface FormGeometry extends Point {
  box: string;
  month: string;
  r: number;
  capacity: number;
  next: number;
}
export interface Landform extends FormGeometry {
  count: number;
  chars: number;
  support: number;
  angle: number;
  stretch: number;
  bound: number;
  mass: number;
}
export interface Layout {
  version: 4;
  regions: Record<string, Region>;
  books: Record<string, Point>;
  pages: Record<string, PagePosition>;
  forms?: Record<string, FormGeometry>;
}
export type WorldPage = Page & PagePosition;
export type CitationFlow = Point[] & { source: string; target: string; weight: number };
export interface Metadata {
  books: Book[];
  pages: Page[];
  edges: Edge[];
}
