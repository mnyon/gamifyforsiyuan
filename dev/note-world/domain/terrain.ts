import type { Climate, TerrainSurface, WorldRules } from './world.js';

function globalHeight(x: number, z: number) {
  const latitude = z / 200;
  const longitude = x / 200;
  const continental =
    Math.sin(longitude * 1.25 + 0.7) * 0.2 +
    Math.cos(latitude * 1.7 - 0.4) * 0.16 +
    Math.sin((longitude + latitude) * 2.4) * 0.12;
  const shelf =
    Math.exp(-((longitude + 0.7) ** 2 + (latitude - 0.1) ** 2) * 3.8) * 0.82 +
    Math.exp(-((longitude - 0.4) ** 2 + (latitude + 0.34) ** 2) * 4.5) * 0.78 +
    Math.exp(-((longitude + 0.05) ** 2 + (latitude + 0.66) ** 2) * 5) * 0.7 +
    Math.exp(-((longitude - 0.62) ** 2 + (latitude - 0.58) ** 2) * 6) * 0.55;
  const oceanBasin = Math.exp(-(longitude ** 2 + latitude ** 2) * 7) * 0.26;
  const land = continental + shelf - oceanBasin - 0.28;
  if (land < 0.22) return (land - 0.22) * 4.2;
  const relief =
    (1 + Math.sin(x * 0.057 + Math.cos(z * 0.05))) * (1 + Math.cos(z * 0.064 - x * 0.025)) * 7;
  return (land - 0.22) * 38 + relief * (0.36 + Math.max(0, land) * 0.22);
}
export function climateAt(x: number, z: number, elevation: number): Climate {
  const latitude = Math.abs(z) / 200;
  const dry = (Math.sin(x * 0.021) + Math.cos(z * 0.017)) * 0.5;
  if (elevation > 35 || latitude > 0.86) return 'snow';
  if (elevation > 25) return 'alpine';
  if (dry > 0.42 && latitude < 0.6) return 'dry';
  if (latitude > 0.62) return 'boreal';
  return 'temperate';
}

export function generateTerrain(rules: WorldRules): TerrainSurface {
  const { gridSize: GRID, extent } = rules;
  const CELL = extent / GRID;
  const shore = -extent / 2;
  const base = {
    size: GRID,
    extent,
    cellSize: CELL,
    seaLevel: rules.seaLevel,
  };
  const cell = (position: number) => Math.floor((position - shore) / CELL);
  const heights = new Float32Array(GRID * GRID);
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < GRID && z < GRID;
  const top = (x: number, z: number) => (inside(x, z) ? heights[z * GRID + x] : 0);
  for (let z = 0; z < GRID; z++) {
    for (let x = 0; x < GRID; x++) {
      const worldX = shore + (x + 0.5) * CELL;
      const worldZ = shore + (z + 0.5) * CELL;
      const y = globalHeight(worldX, worldZ);
      if (y > rules.landThreshold) heights[z * GRID + x] = Math.max(1, Math.round(y / CELL)) * CELL;
    }
  }

  const climates = Array.from(heights, (_, i) => i).map((i) =>
    climateAt(
      shore + ((i % GRID) + 0.5) * CELL,
      shore + (Math.floor(i / GRID) + 0.5) * CELL,
      heights[i],
    ),
  );
  return {
    ...base,
    heights,
    climates,
    groundAt: (x: number, z: number) => top(cell(x), cell(z)),
  };
}
