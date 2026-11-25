import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generateWorld } from '../application/generate-world.js';
import { toWorldInput } from '../adapters/world-input.js';
import type { CollectorSnapshot } from '../collector/snapshot.js';
import type { Feature, Note, WorldInput } from '../domain/world.js';
import { createTerrainMeshes } from './terrain-mesh.js';
import * as assets from './assets.js';

const canvas = document.querySelector<HTMLCanvasElement>('#map')!;
const stats = document.querySelector<HTMLElement>('#stats')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x191a29);
const camera = new THREE.OrthographicCamera(-200, 200, 200, -200, 1, 1500);
camera.position.set(270, 365, 465);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const controls = new OrbitControls(camera, canvas);
controls.enableRotate = false;
controls.minZoom = 0.8;
controls.maxZoom = 5;
const world = new THREE.Group();
scene.add(world, new THREE.HemisphereLight(0xe6f2f4, 0x74847a, 1.7));
const sun = new THREE.DirectionalLight(0xffe1ad, 2);
sun.position.set(-200, 230, 100);
scene.add(sun);

const labels = document.querySelector<HTMLElement>('#labels')!;
const pins: { node: HTMLElement; position: THREE.Vector3 }[] = [];
const render = () => {
  if (detailLayer) detailLayer.visible = camera.zoom > 1.45;
  renderer.render(scene, camera);
  const used = [];
  for (const { node, position } of pins) {
    const projected = position.clone().project(camera);
    const x = ((projected.x + 1) * canvas.clientWidth) / 2;
    const y = ((1 - projected.y) * canvas.clientHeight) / 2;
    node.hidden =
      x < 55 ||
      x > canvas.clientWidth - 55 ||
      y < 100 ||
      y > canvas.clientHeight - 20 ||
      used.some((p) => Math.abs(p.x - x) < 115 && Math.abs(p.y - y) < 26);
    if (node.hidden) continue;
    used.push({ x, y });
    node.style.left = x + 'px';
    node.style.top = y + 'px';
  }
};

let detailLayer: THREE.InstancedMesh | null = null;
let pageInstances: Note[] = [];
let bounds = new THREE.Box3(new THREE.Vector3(-130, 0, -130), new THREE.Vector3(130, 35, 130));
controls.addEventListener('change', render);

function createFeature(feature: Feature): THREE.Object3D {
  switch (feature.kind) {
    case 'library':
      return assets.createLibrary(feature.size);
    case 'house':
      return assets.createHouse(feature.size ?? 0.68, undefined, 1.4);
    case 'barn':
    case 'cottage':
      return assets.createHouseVariant(feature.kind);
    case 'path':
      return assets.createPath(feature.size ?? 2.6, feature.pathType);
    case 'lighthouse':
      return assets.createLighthouse(feature.size);
    case 'windmill':
      return assets.createWindmill();
    case 'tree':
      return assets.createTree();
    case 'pine':
      return assets.createPineTree();
    case 'farm':
      return assets.createFarmPatch(feature.size);
    case 'fence':
      return assets.createFence(feature.size);
    case 'pond':
      return assets.createPond(feature.size);
    case 'rock':
      return assets.createRock(feature.climate === 'snow' ? 0xb9c1bd : 0x777b78);
    case 'shrub':
      return assets.createShrub(0x8b7a49);
    case 'flower':
      return assets.createFlower();
    case 'bridge':
      return assets.createBridge(feature.size);
  }
}

function clear() {
  const materials = new Set<THREE.Material>();
  world.traverse((node) => {
    if (node instanceof THREE.InstancedMesh) node.dispose();
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose();
      for (const material of [node.material].flat()) materials.add(material);
    }
  });
  materials.forEach((m) => m.dispose());
  world.clear();
  pins.length = 0;
  labels.replaceChildren();
  pageInstances = [];
  detailLayer = null;
}

function draw(input: WorldInput) {
  const output = generateWorld(input);
  clear();
  const ground = createTerrainMeshes(output.terrain);
  bounds = ground.bounds;
  world.add(...ground.meshes);
  const markers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xc27b50 }),
    output.notes.length,
  );
  const matrix = new THREE.Matrix4();
  output.notes.forEach(({ x, y, z, height, note, onLand }, i) => {
    matrix
      .makeScale(onLand ? 0.28 : 0, onLand ? height : 0, onLand ? 0.28 : 0)
      .setPosition(x, y, z);
    markers.setMatrixAt(i, matrix);
    pageInstances.push(note);
  });
  detailLayer = markers;
  world.add(markers);
  for (const feature of output.features) {
    const object = createFeature(feature);
    // Some assets have their own local base offset.
    object.position.set(feature.x, feature.y, feature.z);
    if (feature.scale !== undefined) object.scale.setScalar(feature.scale);
    if (feature.angle !== undefined) object.rotation.y = feature.angle;
    if (feature.note) object.userData.page = feature.note;
    world.add(object);
  }
  for (const { name, x, y, z } of output.labels) {
    const node = document.createElement('span');
    node.className = 'place';
    node.textContent = name;
    labels.append(node);
    pins.push({ node, position: new THREE.Vector3(x, y, z) });
  }
}
function show(model: WorldInput, source: string) {
  detail.hidden = true;
  draw(model);
  camera.zoom = 1;
  controls.target.copy(bounds.getCenter(new THREE.Vector3()));
  camera.position.copy(controls.target).add(new THREE.Vector3(270, 365, 465));
  controls.update();
  resize();
  stats.textContent = `${source} · ${model.notes.length.toLocaleString('zh-CN')} 篇笔记 · ${model.citations.length.toLocaleString('zh-CN')} 对引用`;
}
function resize() {
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const size = bounds.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 70);
  const view = span * Math.max(0.49, 0.59 / aspect);
  camera.left = -view * aspect;
  camera.right = view * aspect;
  camera.top = view;
  camera.bottom = -view;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  render();
}

function sample(): CollectorSnapshot {
  const books = ['阅读', '创作', '自然', '项目', '研究'].map((name, i) => ({
    id: String(i),
    name,
  }));
  const pages = Array.from({ length: 540 }, (_, i) => ({
    id: `sample-${i}`,
    notebookId: books[i % books.length].id,
    title: `示例笔记 ${i + 1}`,
    characters: 600 + ((i * 131) % 32000),
  }));
  return {
    notebooks: books,
    pages,
    references: pages.slice(1, 110).map((page, i) => ({
      sourceId: pages[i].id,
      targetId: page.id,
      count: 1 + (i % 3),
    })),
  };
}

const detail = document.querySelector<HTMLOutputElement>('#selection')!;
const ray = new THREE.Raycaster();
let pressed: [number, number] | undefined;
canvas.addEventListener('pointerdown', (event) => {
  pressed = [event.clientX, event.clientY];
});
canvas.addEventListener('pointerup', (event) => {
  if (!pressed || Math.hypot(event.clientX - pressed[0], event.clientY - pressed[1]) > 5) return;
  const rect = canvas.getBoundingClientRect();
  ray.setFromCamera(
    new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((event.clientY - rect.top) / rect.height) * 2,
    ),
    camera,
  );
  const hit = ray.intersectObjects(
    world.children.filter((object) => object.visible),
    true,
  )[0];
  const page = hit?.object.parent?.userData.page;
  const instancePage =
    hit?.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined
      ? pageInstances[hit.instanceId]
      : undefined;
  const selected = page || instancePage;
  detail.hidden = !selected;
  if (selected) detail.textContent = selected.title || selected.id;
});

const refresh = document.querySelector<HTMLButtonElement>('#refresh')!;
const sampleButton = document.querySelector<HTMLButtonElement>('#sample')!;
async function load(action: 'cache' | 'collect') {
  refresh.disabled = sampleButton.disabled = true;
  if (action === 'collect') stats.textContent = '正在从思源采集笔记…';
  try {
    const response = await fetch('/api/note-world/' + action, { method: 'POST' });
    if (response.status === 204) return;
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.error ?? '请通过 NoteWorld 本地服务打开 Demo');
    }
    const snapshot: CollectorSnapshot = await response.json();
    show(toWorldInput(snapshot), action === 'collect' ? '思源' : '思源缓存');
  } catch (error) {
    stats.textContent = error instanceof Error ? error.message : '无法载入笔记';
  } finally {
    refresh.disabled = sampleButton.disabled = false;
  }
}
sampleButton.onclick = () => show(toWorldInput(sample()), '示例');
refresh.onclick = () => void load('collect');
addEventListener('resize', resize);
show(toWorldInput(sample()), '示例');
void load('cache');
