import { climateAt } from './terrain.js';
import type {
  City,
  Feature,
  FeatureKind,
  Note,
  Point,
  TerrainSurface,
  World,
  WorldInput,
  WorldRules,
  NoteMarker,
  Position,
} from './world.js';

const hash = (text: string) => {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return (value >>> 0) / 4294967295;
};
const placement = (kind: FeatureKind, size?: number): Feature => ({ kind, size, x: 0, y: 0, z: 0 });
function place(feature: Feature, x: number, y: number, z: number) {
  Object.assign(feature, { x, y, z });
}

export function generateCities(
  input: WorldInput,
  terrain: TerrainSurface,
  rules: WorldRules,
): Pick<World, 'cities' | 'features' | 'labels' | 'notes'> {
  const groundAt = terrain.groundAt;
  const notes: NoteMarker[] = [];
  const features: Feature[] = [];
  const labels: (Position & { name: string })[] = [];
  const books = new Map<string, Note[]>();
  for (const page of input.notes) {
    if (!books.has(page.book)) books.set(page.book, []);
    books.get(page.book)!.push(page);
  }
  const cities = new Map<string, City>();
  const cityRows = [...books.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
  const land: Point[] = [];
  for (let i = 0; i < terrain.heights.length; i++) {
    if (!terrain.heights[i]) continue;
    land.push({
      x: ((i % terrain.size) + 0.5) * terrain.cellSize - terrain.extent / 2,
      z: (Math.floor(i / terrain.size) + 0.5) * terrain.cellSize - terrain.extent / 2,
    });
  }
  const centers: (Point & { radius: number })[] = [];
  const markers = new Map<string, NoteMarker>();
  cityRows.forEach(([box, pages], index) => {
    const phase = hash(box);
    const angle = index * 2.39996 + phase * 0.8;
    const spread = 30 + Math.sqrt(index / cityRows.length) * 104;
    const preferred = { x: Math.cos(angle) * spread, z: Math.sin(angle) * spread };
    const radius = 0.58 * Math.sqrt(pages.length);
    let center = preferred;
    let bestScore = Infinity;
    for (const point of land) {
      const distance = Math.hypot(point.x - preferred.x, point.z - preferred.z);
      if (distance >= bestScore) continue;
      let score = distance;
      for (const other of centers)
        score +=
          Math.max(
            0,
            radius + other.radius + 8 - Math.hypot(point.x - other.x, point.z - other.z),
          ) * 4;
      if (score < bestScore) {
        center = point;
        bestScore = score;
      }
    }
    centers.push({ ...center, radius });
    pages.sort((a, b) => a.id.localeCompare(b.id));
    cities.set(box, { book: box, notes: pages, ...center });
    pages.forEach((page, pageIndex) => {
      const direction = pageIndex * 2.39996 + phase * Math.PI * 2;
      const offset = 0.58 * Math.sqrt(pageIndex);
      let x = center.x + Math.cos(direction) * offset;
      let z = center.z + Math.sin(direction) * offset;
      let ground = groundAt(x, z);
      for (let attempt = 1; ground <= 0 && attempt <= 8; attempt++) {
        const rotation = direction + attempt * 2.39996;
        const reach = offset * (1 - attempt / 8);
        x = center.x + Math.cos(rotation) * reach;
        z = center.z + Math.sin(rotation) * reach;
        ground = groundAt(x, z);
      }
      const height = Math.min(1.6, 0.25 + Math.log10(page.chars + 10) * 0.14);
      const marker = {
        x,
        z,
        y: Math.max(0, ground) + height / 2,
        height,
        note: page,
        onLand: ground > 0,
      };
      notes.push(marker);
      markers.set(page.id, marker);
    });
  });
  const occupied: Point[] = [];
  for (const [, pages] of cityRows.slice(0, rules.landmarkBooks)) {
    const ranked = [...pages].sort((a, b) => b.chars - a.chars);
    let placed = 0;
    const city = cities.get(pages[0].book)!;
    for (const page of ranked) {
      const { x: px, z: pz } = markers.get(page.id)!;
      const ground = groundAt(px, pz);
      if (ground <= 0 || occupied.some((p) => Math.hypot(px - p.x, pz - p.z) < 8)) continue;
      const climate = climateAt(px, pz, ground);
      const asset =
        placed === 0
          ? placement('library', 0.9)
          : climate === 'dry'
            ? placement('barn')
            : climate === 'alpine' || climate === 'snow'
              ? placement('cottage')
              : placement('house', 0.68);
      asset.scale = 3.8;
      place(asset, px, ground + 3.1, pz);
      asset.note = page;
      features.push(asset);
      const path = {
        ...placement('path', 2.6),
        pathType: placed % 3 === 0 ? ('stone' as const) : ('dirt' as const),
      };
      place(path, px, ground + 0.18, pz + 1.7);
      path.angle = Math.PI / 2;
      features.push(path);
      occupied.push({ x: px, z: pz });
      if (placed === 0) {
        labels.push({
          x: px,
          y: ground + 7,
          z: pz,
          name: input.bookNames.get(page.book) ?? '未分类',
        });
        const landmark =
          hash(page.book) > 0.78
            ? placement('lighthouse', 3.2)
            : hash(page.book) > 0.58
              ? placement('windmill')
              : null;
        if (landmark) {
          place(landmark, px + 4, ground + 0.2, pz - 2);
          features.push(landmark);
        }
        const cityTree = placement('tree');
        place(cityTree, px - 3.2, ground + 0.2, pz - 1.2);
        cityTree.scale = 2.4;
        features.push(cityTree);
        const cityPath = { ...placement('path', 2.8), pathType: 'stone' as const };
        place(cityPath, px, ground + 0.2, pz + 2.2);
        cityPath.angle = Math.PI / 2;
        cityPath.scale = 2.4;
        features.push(cityPath);
      }
      if (placed === 1 && climate === 'dry') {
        const farm = placement('farm', 2.2);
        place(farm, px + 3, ground + 0.4, pz);
        features.push(farm);
        const fence = placement('fence', 2.4);
        place(fence, px + 3, ground + 0.42, pz + 1.5);
        fence.angle = Math.PI / 2;
        features.push(fence);
      } else if (placed === 1 && climate === 'temperate') {
        const pond = placement('pond', 2.4);
        place(pond, px - 3, ground + 0.2, pz + 2);
        features.push(pond);
      }
      if (++placed >= Math.min(9, 2 + Math.floor(Math.log10(pages.length) * 1.7))) break;
    }
    const cityGround = groundAt(city.x, city.z);
    if (cityGround > 0) {
      const cityTree = placement('tree');
      place(cityTree, city.x - 5, cityGround, city.z - 3);
      cityTree.scale = 3.2;
      features.push(cityTree);
      const cityPath = { ...placement('path', 4.5), pathType: 'stone' as const };
      place(cityPath, city.x, cityGround + 0.2, city.z + 2.8);
      cityPath.angle = Math.PI / 2;
      cityPath.scale = 2.2;
      features.push(cityPath);
      const cityClimate = climateAt(city.x, city.z, cityGround);
      const feature =
        cityClimate === 'dry'
          ? placement('farm', 3.5)
          : cityClimate === 'alpine' || cityClimate === 'snow'
            ? placement('rock')
            : placement('pond', 3.2);
      place(feature, city.x + 5, cityGround + 0.25, city.z + 1);
      feature.scale = 1.8;
      features.push(feature);
    }
  }
  for (let z = -170; z <= 170; z += 9) {
    for (let x = -170; x <= 170; x += 9) {
      const tx = x + Math.sin(z * 7 + x) * 3;
      const tz = z + Math.cos(x * 7 + z) * 3;
      const y = groundAt(tx, tz);
      const worldX = tx;
      const worldZ = tz;
      if (y < 5 || y > 42 || Math.sin(tx * 0.09) * Math.cos(tz * 0.06) < 0.28) continue;
      if (occupied.some((p) => Math.hypot(p.x - worldX, p.z - worldZ) < 6)) continue;
      const climate = climateAt(tx, tz, y);
      const tree =
        climate === 'alpine' || climate === 'snow' ? placement('pine') : placement('tree');
      place(tree, worldX, y, worldZ);
      tree.scale = 1.5 + 0.55 * Math.cos(tx + tz);
      features.push(tree);
      if (climate === 'dry') {
        const shrub = placement('shrub');
        place(shrub, worldX + 1.4, y, worldZ - 0.8);
        features.push(shrub);
      } else if (climate === 'alpine' || climate === 'snow') {
        const rock = { ...placement('rock'), climate };
        place(rock, worldX - 1.2, y, worldZ + 1.1);
        features.push(rock);
      } else if (climate === 'temperate' && Math.sin(tx * 0.13 + tz) > 0.82) {
        const flower = placement('flower');
        place(flower, worldX + 0.8, y, worldZ + 0.6);
        features.push(flower);
      }
    }
  }
  return { cities: [...cities.values()], notes, features, labels };
}
