import type { Citation, NoteMarker, TerrainSurface } from './world.js';

export function generateRoutes(
  citations: readonly Citation[],
  notes: readonly NoteMarker[],
  { size, extent, cellSize, heights }: TerrainSurface,
): Uint8Array {
  const tracks = new Uint8Array(heights.length);
  const positions = new Map(
    notes.filter((note) => note.onLand).map((note) => [note.note.id, note]),
  );
  const cell = (coordinate: number) => Math.floor((coordinate + extent / 2) / cellSize);
  function mark(x: number, z: number) {
    if (x >= 0 && z >= 0 && x < size && z < size && heights[z * size + x] > 0)
      tracks[z * size + x] = 1;
  }
  for (const { source, target } of citations) {
    const start = positions.get(source);
    const end = positions.get(target);
    if (!start || !end || start.note.book === end.note.book) continue;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (cellSize / 2)));
    let previousX = cell(start.x);
    let previousZ = cell(start.z);
    for (let step = 0; step <= steps; step++) {
      const x = cell(start.x + (dx * step) / steps);
      const z = cell(start.z + (dz * step) / steps);
      if (x !== previousX && z !== previousZ) mark(x, previousZ);
      mark(x, z);
      previousX = x;
      previousZ = z;
    }
  }
  return tracks;
}
