export interface CollectorSnapshot {
  notebooks: { id: string; name: string }[];
  pages: { id: string; notebookId: string; title: string; characters: number }[];
  references: { sourceId: string; targetId: string; count: number }[];
}
