import * as THREE from 'three';

// These palettes and proportions are intentionally isolated so visual assets
// can be edited without touching the world-generation rules.
export const ASSET_PALETTE = {
  house: 0xd5a768,
  library: 0xb98055,
  tower: 0x9a6a4d,
  roof: 0x7a4e45,
  trunk: 0x76513c,
  leaves: 0x4f8c64,
  road: 0x9d7b55,
  snow: 0xe4e8e4,
  cloud: 0xe8e4dc,
  water: 0x3f91a2,
  flower: 0xe7b1a7,
};

const cube = (size: [number, number, number], color: number) =>
  new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ color }));

export function createHouse(height: number, palette = ASSET_PALETTE, footprint = 1) {
  const group = new THREE.Group();
  const body = cube([0.82 * footprint, height, 0.82 * footprint], palette.house);
  body.position.y = height / 2 - 0.9;
  const roof = cube([0.96 * footprint, 0.22, 0.96 * footprint], palette.roof);
  roof.position.y = height - 0.78;
  group.add(body, roof);
  return group;
}

export function createHouseVariant(type = 'cottage', palette = ASSET_PALETTE) {
  if (type === 'tower') return createTower(4, palette);
  if (type === 'hall') return createLibrary(2.5, palette);
  const group = createHouse(type === 'barn' ? 1.5 : 1, palette, type === 'barn' ? 1.5 : 1.15);
  if (type === 'cottage') {
    const chimney = cube([0.18, 0.55, 0.18], palette.roof);
    chimney.position.set(0.22, 1.15, 0.12);
    group.add(chimney);
  }
  return group;
}

export function createLibrary(height = 3, palette = ASSET_PALETTE) {
  const group = createHouse(height, { ...palette, house: palette.library }, 1.3);
  const wing = cube([1.5, Math.max(1, height - 1), 0.9], palette.library);
  wing.position.set(0.58, Math.max(1, height - 1) / 2 - 0.9, 0);
  group.add(wing);
  return group;
}

export function createTower(height = 4, palette = ASSET_PALETTE) {
  const group = createHouse(height, { ...palette, house: palette.tower }, 1.05);
  const beacon = cube([0.42, 0.18, 0.42], 0xf4d692);
  beacon.position.y = height - 0.42;
  group.add(beacon);
  return group;
}

export function createTree(palette = ASSET_PALETTE) {
  const group = new THREE.Group();
  const trunk = cube([0.22, 1.1, 0.22], palette.trunk);
  trunk.position.y = 0.55;
  const crown = cube([0.9, 0.75, 0.9], palette.leaves);
  crown.position.y = 1.3;
  group.add(trunk, crown);
  return group;
}

export function createRoad(length: number, palette = ASSET_PALETTE) {
  return cube([0.16, 0.08, length], palette.road);
}

export function createPlaza(size = 3, color = 0xc9b27e) {
  return cube([size, 0.08, size], color);
}

export function createMarker(color = 0xf4d692) {
  const group = new THREE.Group();
  const base = cube([0.34, 0.7, 0.34], color);
  base.position.y = 0.35;
  const cap = cube([0.58, 0.12, 0.58], color);
  cap.position.y = 0.76;
  group.add(base, cap);
  return group;
}

export function createRock(color = 0x777b78) {
  const group = new THREE.Group();
  const base = cube([0.7, 0.45, 0.6], color);
  base.position.y = 0.22;
  const cap = cube([0.42, 0.22, 0.38], color);
  cap.position.set(0.1, 0.56, -0.04);
  group.add(base, cap);
  return group;
}

export function createShrub(color = 0x477e5d) {
  const group = new THREE.Group();
  const crown = cube([0.62, 0.45, 0.62], color);
  crown.position.y = 0.25;
  group.add(crown);
  return group;
}

export function createPineTree(palette = ASSET_PALETTE) {
  const group = new THREE.Group();
  const trunk = cube([0.2, 1.5, 0.2], palette.trunk);
  trunk.position.y = 0.75;
  for (const [y, width] of [
    [0.8, 1.1],
    [1.35, 0.82],
    [1.8, 0.52],
  ]) {
    const layer = cube([width, 0.68, width], palette.leaves);
    layer.position.y = y;
    group.add(layer);
  }
  group.add(trunk);
  return group;
}

export function createFlower(color = ASSET_PALETTE.flower) {
  const group = new THREE.Group();
  const stem = cube([0.08, 0.45, 0.08], 0x4f8c64);
  stem.position.y = 0.22;
  const bloom = cube([0.24, 0.24, 0.24], color);
  bloom.position.y = 0.5;
  group.add(stem, bloom);
  return group;
}

export function createSnowCap(width = 1) {
  const cap = cube([width, 0.12, width], ASSET_PALETTE.snow);
  cap.userData.assetType = 'snow-cap';
  return cap;
}

export function createCloud(scale = 1) {
  const group = new THREE.Group();
  for (const [x, y, z, size] of [
    [0, 0, 0, 1.4],
    [1, 0.15, 0, 1],
    [-1, 0.1, 0.1, 1],
    [0.4, 0.35, 0.1, 0.9],
  ]) {
    const puff = cube([size, 0.55 * size, size * 0.8], ASSET_PALETTE.cloud);
    puff.position.set(x, y, z);
    group.add(puff);
  }
  group.scale.setScalar(scale);
  group.userData.assetType = 'cloud';
  return group;
}

export function createSnowfall(count = 180, area = 40) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * area;
    positions[i * 3 + 1] = Math.random() * area * 0.65;
    positions[i * 3 + 2] = (Math.random() - 0.5) * area;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: ASSET_PALETTE.snow, size: 0.12 }),
  );
  points.userData.assetType = 'snowfall';
  points.userData.animate = (delta: number) => {
    const position = geometry.attributes.position;
    for (let i = 1; i < position.count; i++) {
      const y = position.getY(i) - delta * 1.8;
      position.setY(i, y < 0 ? area * 0.65 : y);
    }
    position.needsUpdate = true;
  };
  return points;
}

export function createOceanSurface(size = 80) {
  const geometry = new THREE.PlaneGeometry(size, size, 16, 16);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: ASSET_PALETTE.water,
    transparent: true,
    opacity: 0.78,
  });
  const ocean = new THREE.Mesh(geometry, material);
  ocean.userData.assetType = 'ocean';
  ocean.userData.animate = (time: number) => {
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++)
      positions.setY(
        i,
        Math.sin(time * 0.001 + positions.getX(i) * 0.08 + positions.getZ(i) * 0.06) * 0.035,
      );
    positions.needsUpdate = true;
  };
  return ocean;
}

export function createPath(length: number, type: 'dirt' | 'stone' | 'boardwalk' = 'dirt') {
  const colors = { dirt: 0x9d7b55, stone: 0x8d8e86, boardwalk: 0xb58b58 };
  const path = cube(
    [type === 'boardwalk' ? 0.24 : 0.18, 0.08, length],
    colors[type] || colors.dirt,
  );
  path.userData.assetType = `path-${type}`;
  return path;
}

export function createTerrainTile(
  size = 4,
  type: 'grass' | 'soil' | 'sand' | 'stone' | 'snow' = 'grass',
) {
  const colors = {
    grass: 0x79aa68,
    soil: 0x8f6845,
    sand: 0xc9ad70,
    stone: 0x777b78,
    snow: 0xdfe5e1,
  };
  const group = new THREE.Group();
  const top = cube([size, 0.28, size], colors[type] || colors.grass);
  top.position.y = 0.15;
  const soil = cube([size, 0.7, size], type === 'stone' ? colors.stone : 0x744e39);
  soil.position.y = -0.3;
  group.add(soil, top);
  group.userData.assetType = `terrain-${type}`;
  return group;
}

export function createFarmPatch(size = 4) {
  const group = createTerrainTile(size, 'soil');
  for (let i = -1; i <= 1; i++) {
    const row = cube([size * 0.08, 0.12, size * 0.82], 0x5c4435);
    row.position.set(i * size * 0.22, 0.38, 0);
    group.add(row);
  }
  return group;
}

export function createPond(size = 3) {
  const pond = cube([size, 0.08, size * 0.75], 0x3f91a2);
  pond.position.y = 0.32;
  pond.userData.assetType = 'pond';
  return pond;
}

export function createBridge(length = 4) {
  const group = new THREE.Group();
  const deck = cube([1, 0.22, length], 0xb58b58);
  deck.position.y = 0.55;
  group.add(deck);
  for (const z of [-length / 2 + 0.35, length / 2 - 0.35]) {
    for (const x of [-0.48, 0.48]) {
      const post = cube([0.12, 0.9, 0.12], 0x76513c);
      post.position.set(x, 0.45, z);
      group.add(post);
    }
  }
  group.userData.assetType = 'bridge';
  return group;
}

export function createFence(length = 3) {
  const group = new THREE.Group();
  const rail = cube([0.1, 0.1, length], 0xd1ae73);
  rail.position.y = 0.62;
  group.add(rail);
  for (const z of [-length / 2, 0, length / 2]) {
    const post = cube([0.14, 0.8, 0.14], 0xb58b58);
    post.position.set(0, 0.4, z);
    group.add(post);
  }
  group.userData.assetType = 'fence';
  return group;
}

export function createLighthouse(height = 4) {
  const group = createHouse(height, { ...ASSET_PALETTE, house: 0xe9e1c8, roof: 0xb94f4a }, 0.8);
  const beacon = cube([0.32, 0.24, 0.32], 0xf4d692);
  beacon.position.y = height - 0.3;
  group.add(beacon);
  group.userData.assetType = 'lighthouse';
  return group;
}

export function createWindmill() {
  const group = createHouse(2.4, { ...ASSET_PALETTE, house: 0xb8a48b, roof: 0x594c49 }, 1.1);
  const pole = cube([0.12, 2.2, 0.12], 0x76513c);
  pole.position.set(0, 1.7, 0.62);
  group.add(pole);
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const blade = cube([0.08, 0.72, 0.08], 0xe2d4b8);
    blade.position.set(Math.cos(angle) * 0.35, 1.7 + Math.sin(angle) * 0.35, 0.7);
    blade.rotation.z = angle;
    group.add(blade);
  }
  group.userData.assetType = 'windmill';
  return group;
}
