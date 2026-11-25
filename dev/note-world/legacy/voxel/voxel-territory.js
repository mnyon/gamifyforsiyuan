import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createHouse, createLibrary, createMarker, createPlaza, createRoad, createTower, createTree } from '../../../../dist/previews/note-world/voxel-assets.js';

const canvas = document.querySelector('#map');
const stats = document.querySelector('#stats');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x171326);
scene.fog = new THREE.Fog(0x171326, 70, 150);
const camera = new THREE.OrthographicCamera(-20, 20, 12, -12, 0.1, 200);
camera.position.set(28, 32, 28);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = false;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableRotate = false;
controls.minZoom = 0.55;
controls.maxZoom = 2.2;
controls.target.set(0, 0, 0);
controls.addEventListener('change', updateChunkVisibility);
scene.add(new THREE.AmbientLight(0xe6dcff, 2.1));
scene.add(new THREE.HemisphereLight(0xd8d2ff, 0x486c62, 2.4));
const sun = new THREE.DirectionalLight(0xffe4ad, 2.2);
sun.position.set(-18, 34, 12);
scene.add(sun);
const world = new THREE.Group();
scene.add(world);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let landmarks = [];
let worldSize = 44;
const CHUNK_SIZE = 16;
let chunks = new Map();
let chunkRoot = null;
let activeData = sampleData();
let overviewMode = true;

function hash(text) {
  let n = 2166136261;
  for (const char of text) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return (n >>> 0) / 4294967295;
}
function noise(x, z, seed) {
  const a = Math.sin((x + seed) * 0.31) * Math.cos((z - seed) * 0.27);
  const b = Math.sin((x + z + seed) * 0.12) * 0.5;
  return Math.max(0, Math.min(1, 0.5 + a * 0.28 + b));
}
function densityScore(page, district, seed) {
  const content = Math.min(1, Math.log10(Number(page.chars || 1) + 10) / 6);
  const stable = hash(page.id + ':' + district.box + ':' + seed);
  return content * 0.65 + stable * 0.35;
}
function terrainHeight(x, z, size, seed) {
  const radius = Math.hypot(x, z) / (size * 0.72);
  const island = Math.max(0, 1 - radius * radius);
  const broad = noise(x * 0.45, z * 0.45, seed);
  const detail = noise(x * 1.7, z * 1.7, seed + 4.1);
  return Math.max(0, Math.round((island * (0.65 + broad * 0.55) + detail * 0.12) * 6 - 1));
}
function sampleData() {
  const pages = Array.from({ length: 220 }, (_, i) => ({
    id: `sample-${i}`,
    title: ['阅读与思考', '技术与创造', '自然观察', '长期项目', '旅行手记'][i % 5] + ` ${i + 1}`,
    chars: Math.round(120 + hash(String(i * 19)) * 6200),
    updated: Date.now() - Math.round(hash(String(i)) * 70 * 86400000),
  }));
  return { pages, edges: pages.slice(1).map((page, i) => ({ source: pages[i].id, target: page.id, weight: 1 + (i % 4) })) };
}
function normalize(data) {
  const pages = Array.isArray(data.pages) ? data.pages : [];
  return { pages, edges: Array.isArray(data.edges) ? data.edges : [] };
}
function clearWorld() {
  while (world.children.length) {
    const child = world.children.pop();
    child.traverse((node) => {
      node.geometry?.dispose();
      if (Array.isArray(node.material)) node.material.forEach((material) => material.dispose());
      else node.material?.dispose();
    });
  }
  landmarks = [];
  chunks = new Map();
  chunkRoot = null;
}
function chunkKey(x, z) {
  return `${Math.floor((x + worldSize / 2) / CHUNK_SIZE)},${Math.floor((z + worldSize / 2) / CHUNK_SIZE)}`;
}
function chunkGroup(x, z) {
  const key = chunkKey(x, z);
  let group = chunks.get(key);
  if (!group) {
    group = new THREE.Group();
    group.name = `chunk:${key}`;
    group.userData.chunk = key;
    chunks.set(key, group);
    chunkRoot.add(group);
  }
  return group;
}
function addToChunk(object, x, z) {
  chunkGroup(x, z).add(object);
}
function updateChunkVisibility() {
  if (!chunkRoot) return;
  const center = controls.target;
  const radius = Math.max(CHUNK_SIZE * 1.8, worldSize * 0.9 / Math.max(0.75, camera.zoom));
  for (const group of chunks.values()) {
    const box = group.userData.chunk.split(',').map(Number);
    const x = (box[0] + 0.5) * CHUNK_SIZE - worldSize / 2;
    const z = (box[1] + 0.5) * CHUNK_SIZE - worldSize / 2;
    group.visible = Math.hypot(x - center.x, z - center.z) <= radius;
  }
}
function addOverview(data) {
  clearWorld();
  const pages = data.pages;
  const size = Math.max(32, Math.min(72, Math.ceil(Math.sqrt(Math.max(1, pages.length) / 2))));
  worldSize = size;
  const ground = new THREE.Mesh(new THREE.BoxGeometry(size, 0.5, size), new THREE.MeshBasicMaterial({ color: 0x5f9d78 }));
  ground.position.y = -0.9;
  world.add(ground);
  const water = new THREE.Mesh(new THREE.BoxGeometry(size + 8, 0.16, size + 8), new THREE.MeshBasicMaterial({ color: 0x3a7890, transparent: true, opacity: 0.8 }));
  water.position.y = -0.55;
  world.add(water);
  const districts = new Map();
  for (const page of pages) {
    const key = page.box || 'unfiled';
    if (!districts.has(key)) districts.set(key, []);
    districts.get(key).push(page);
  }
  const list = [...districts.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12);
  list.forEach(([box, rows], i) => {
    const angle = i * 2.39996 + hash(box) * 0.7;
    const radius = 2 + Math.sqrt(i / Math.max(1, list.length)) * size * 0.34;
    const x = Math.round(Math.cos(angle) * radius);
    const z = Math.round(Math.sin(angle) * radius);
    const group = new THREE.Group();
    group.userData.district = { box, name: rows[0]?.box || '未分类', count: rows.length };
    const city = new THREE.Mesh(new THREE.BoxGeometry(Math.max(3, Math.min(8, 2 + Math.sqrt(rows.length))), 0.7, Math.max(3, Math.min(8, 2 + Math.sqrt(rows.length)))), new THREE.MeshBasicMaterial({ color: [0xc18a5a, 0xa96d65, 0x8f9a61, 0x9e6e50][i % 4] }));
    city.position.y = -0.35;
    const marker = createMarker(0xf4d692);
    marker.position.y = 0.05;
    group.add(city, marker);
    group.position.set(x, 0, z);
    world.add(group);
  });
  stats.textContent = `${pages.length.toLocaleString()} 篇笔记 · ${data.edges.length.toLocaleString()} 条引用 · 总览 ${list.length} 个区域`;
  document.querySelector('#mode').textContent = '进入区域详情';
  resize();
}
function addTerrain(data) {
  clearWorld();
  const pages = data.pages;
  const seed = pages.length * 0.013;
  const size = Math.max(32, Math.min(72, Math.ceil(Math.sqrt(Math.max(1, pages.length) / 2))));
  worldSize = size;
  document.querySelector('#mode').textContent = '返回总览';
  const chunkCount = Math.ceil(size / CHUNK_SIZE) ** 2;
  chunkRoot = new THREE.Group();
  chunkRoot.name = 'chunks';
  world.add(chunkRoot);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const matrix = new THREE.Matrix4();
  const heights = new Map();
  const surfaceCells = { grass: [], sand: [], snow: [] };
  const ground = new THREE.InstancedMesh(cube, new THREE.MeshBasicMaterial({ color: 0x5f9d78 }), size * size * 7);
  let index = 0;
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const gx = x - size / 2;
    const gz = z - size / 2;
    const height = terrainHeight(gx, gz, size, seed);
    heights.set(`${gx},${gz}`, height);
    surfaceCells[height >= 5 ? 'snow' : height <= 1 ? 'sand' : 'grass'].push({ x: gx, y: height - 0.95, z: gz });
    for (let y = 0; y <= height; y++) {
      matrix.makeTranslation(gx, y - 1.5, gz);
      ground.setMatrixAt(index, matrix);
      index++;
    }
  }
  ground.count = index;
  addToChunk(ground, 0, 0);
  for (const [kind, cells] of Object.entries(surfaceCells)) {
    const colors = { grass: 0x78a985, sand: 0xc5a86b, snow: 0xdedbcf };
    const byChunk = new Map();
    for (const cell of cells) {
      const key = chunkKey(cell.x, cell.z);
      if (!byChunk.has(key)) byChunk.set(key, []);
      byChunk.get(key).push(cell);
    }
    for (const chunkCells of byChunk.values()) {
      const surface = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1.01, 0.12, 1.01),
        new THREE.MeshBasicMaterial({ color: colors[kind] }),
        chunkCells.length,
      );
      chunkCells.forEach((cell, i) => {
        matrix.makeTranslation(cell.x, cell.y, cell.z);
        surface.setMatrixAt(i, matrix);
      });
      addToChunk(surface, chunkCells[0].x, chunkCells[0].z);
    }
  }
  const water = new THREE.Mesh(
    new THREE.BoxGeometry(size + 8, 0.16, size + 8),
    new THREE.MeshBasicMaterial({ color: 0x3a7890, transparent: true, opacity: 0.8 }),
  );
  water.position.y = -0.35;
  world.add(water);

  const districts = new Map();
  for (const page of pages) {
    const key = page.box || 'unfiled';
    if (!districts.has(key)) districts.set(key, []);
    districts.get(key).push(page);
  }
  const districtList = [...districts.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12);
  const districtCenters = districtList.map(([box, rows], i) => {
    const angle = i * 2.39996 + hash(box) * 0.7;
    const radius = 2 + Math.sqrt(i / Math.max(1, districtList.length)) * size * 0.34;
    const themes = [
      { house: 0xd5a768, roof: 0x7a4e45, library: 0xb98055, tower: 0x9a6a4d, road: 0x9d7b55 },
      { house: 0xc68f72, roof: 0x65475d, library: 0xa96d65, tower: 0x805264, road: 0x8e6d62 },
      { house: 0xb8ae72, roof: 0x536b59, library: 0x8f9a61, tower: 0x647d59, road: 0x8f845d },
      { house: 0xc18a5a, roof: 0x554d6d, library: 0x9e6e50, tower: 0x6d5c78, road: 0x8b735e },
    ];
    return { box, rows, theme: themes[i % themes.length], x: Math.round(Math.cos(angle) * radius), z: Math.round(Math.sin(angle) * radius) };
  });
  const ordered = districtCenters.flatMap((district) => {
    const limit = Math.min(16, Math.max(5, Math.round(district.rows.length ** 0.45)));
    return [...district.rows]
      .sort((a, b) => densityScore(b, district, seed) - densityScore(a, district, seed))
      .slice(0, limit)
      .map((page) => ({ page, district }));
  });
  const maxBuildings = Math.min(ordered.length, Math.floor(size * size * 0.1));
  const buildings = new THREE.Group();
  ordered.slice(0, maxBuildings).forEach(({ page, district }, i) => {
    const angle = i * 2.39996 + hash(page.id) * 6.28;
    const distance = 1 + Math.sqrt((i % 18) / 18) * 4;
    const x = district.x + Math.round(Math.cos(angle) * distance);
    const z = district.z + Math.round(Math.sin(angle) * distance);
    const base = heights.get(`${x},${z}`) ?? terrainHeight(x, z, size, seed);
    const h = Math.max(1, Math.min(3, Math.ceil(Math.log10(Number(page.chars || 10) + 10) * 0.72)));
    const isDistrictCore = i === 0 || (i > 0 && ordered[i - 1].district.box !== district.box);
    const isTower = i % 17 === 0 && h >= 3;
    const house = isTower ? createTower(Math.min(4, h + 1), district.theme) : isDistrictCore ? createLibrary(Math.min(3, h + 1), district.theme) : createHouse(h, district.theme, 1.15);
    house.position.set(x, base, z);
    house.userData.page = page;
    buildings.add(house);
    landmarks.push({ x, z, page, height: h });
  });
  for (const house of buildings.children) addToChunk(house, house.position.x, house.position.z);
  const landmarkById = new Map(landmarks.map((landmark) => [landmark.page.id, landmark]));
  for (const edge of data.edges.filter((item) => Number(item.weight || 0) >= 2).slice(0, 180)) {
    const from = landmarkById.get(edge.source);
    const to = landmarkById.get(edge.target);
    if (!from || !to) continue;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz);
    if (length < 1.5) continue;
    const roadTheme = districtCenters.find((district) => district.box === from.page.box)?.theme;
    const road = createRoad(length, roadTheme || undefined);
    const roadX = Math.round((from.x + to.x) / 2);
    const roadZ = Math.round((from.z + to.z) / 2);
    const roadBase = heights.get(`${roadX},${roadZ}`) ?? 0;
    road.position.set((from.x + to.x) / 2, roadBase + 0.14, (from.z + to.z) / 2);
    road.rotation.y = Math.atan2(dx, dz);
    addToChunk(road, road.position.x, road.position.z);
  }
  for (const district of districtCenters) {
    const districtBase = heights.get(`${district.x},${district.z}`) ?? 0;
    const plaza = createPlaza(3, district.theme.library);
    plaza.position.set(district.x, districtBase + 0.08, district.z);
    addToChunk(plaza, plaza.position.x, plaza.position.z);
    const marker = createMarker(district.theme.tower);
    marker.position.set(district.x, districtBase + 0.12, district.z);
    addToChunk(marker, marker.position.x, marker.position.z);
    const path = createRoad(size * 0.35, district.theme);
    path.position.set(district.x, districtBase + 0.12, district.z);
    path.rotation.y = hash(district.box) * Math.PI;
    addToChunk(path, path.position.x, path.position.z);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const x = district.x + Math.round(Math.cos(angle) * 6);
      const z = district.z + Math.round(Math.sin(angle) * 6);
      const base = heights.get(`${x},${z}`) ?? 0;
      if (base < 2 || base >= 5) continue;
      const tree = createTree();
      tree.position.set(x, base, z);
      addToChunk(tree, tree.position.x, tree.position.z);
    }
  }
  for (let i = 0; i < districtCenters.length - 1; i++) {
    const from = districtCenters[i];
    const to = districtCenters[i + 1];
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz);
    if (length < 3) continue;
    const road = createRoad(length, from.theme);
    const roadX = Math.round((from.x + to.x) / 2);
    const roadZ = Math.round((from.z + to.z) / 2);
    const roadBase = heights.get(`${roadX},${roadZ}`) ?? 0;
    road.position.set((from.x + to.x) / 2, roadBase + 0.16, (from.z + to.z) / 2);
    road.rotation.y = Math.atan2(dx, dz);
    world.add(road);
  }
  const treeCount = Math.min(80, Math.round(size * size * 0.08));
  for (let i = 0; i < treeCount; i++) {
    const angle = i * 2.39996;
    const radius = size * (0.24 + (i % 7) * 0.045);
    const x = Math.round(Math.cos(angle) * radius);
    const z = Math.round(Math.sin(angle) * radius);
    const base = heights.get(`${x},${z}`) ?? 0;
    if (base < 2 || base >= 5) continue;
    const tree = createTree();
    tree.position.set(x, base, z);
    addToChunk(tree, tree.position.x, tree.position.z);
  }
  updateChunkVisibility();
  stats.textContent = `${pages.length.toLocaleString()} 篇笔记 · ${data.edges.length.toLocaleString()} 条引用 · ${chunkCount} 个区块`;
}
function resize() {
  const aspect = innerWidth / innerHeight;
  const view = Math.max(20, worldSize * 0.56);
  camera.left = -view * aspect; camera.right = view * aspect; camera.top = view; camera.bottom = -view; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false);
}
canvas.addEventListener('pointerup', (event) => {
  pointer.x = (event.clientX / innerWidth) * 2 - 1; pointer.y = -(event.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(world.children)[0];
  const page = hit?.object?.parent?.userData?.page || hit?.object?.userData?.page;
  const district = hit?.object?.parent?.userData?.district || hit?.object?.userData?.district;
  if (district) {
    alert(`${district.name} · ${district.count} 篇笔记`);
    return;
  }
  if (page) alert(page.title || page.id);
});
document.querySelector('#file').addEventListener('change', async (event) => {
  const file = event.target.files[0]; if (!file) return;
  activeData = normalize(JSON.parse(await file.text()));
  overviewMode = true;
  addOverview(activeData);
});
document.querySelector('#sample').addEventListener('click', () => {
  activeData = sampleData();
  overviewMode = true;
  addOverview(activeData);
});
document.querySelector('#mode').addEventListener('click', () => {
  overviewMode = !overviewMode;
  if (overviewMode) addOverview(activeData);
  else addTerrain(activeData);
});
addOverview(activeData);
addEventListener('resize', resize); resize();
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
