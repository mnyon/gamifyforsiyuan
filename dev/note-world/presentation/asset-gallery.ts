import * as THREE from 'three';
import {
  createBridge,
  createCloud,
  createFarmPatch,
  createFence,
  createFlower,
  createHouseVariant,
  createLighthouse,
  createOceanSurface,
  createPineTree,
  createPond,
  createRock,
  createShrub,
  createSnowfall,
  createTerrainTile,
  createTree,
  createWindmill,
} from './assets.js';
const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x171326);
const camera = new THREE.OrthographicCamera(-14, 14, 9, -9, 0.1, 100);
camera.position.set(15, 18, 18);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
scene.add(new THREE.AmbientLight(0xe6dcff, 2), new THREE.HemisphereLight(0xd8d2ff, 0x49685d, 2));
const root = new THREE.Group();
scene.add(root);
const animated: THREE.Object3D[] = [];
const add = (asset: THREE.Object3D, x: number, z: number, scale = 1) => {
  asset.position.set(x, 0, z);
  asset.scale.multiplyScalar(scale);
  root.add(asset);
  return asset;
};
add(createHouseVariant('cottage'), -7, -1, 2.2);
add(createHouseVariant('barn'), -3, -1, 1.8);
add(createHouseVariant('hall'), 1, -1, 1.8);
add(createHouseVariant('tower'), 5, -1, 1.35);
add(createPineTree(), -6, 3, 1.4);
add(createTree(), -3, 3, 1.3);
add(createShrub(), 0, 3, 1.5);
add(createFlower(), 2, 3, 1.6);
add(createRock(), 5, 3, 1.4);
add(createTerrainTile(3, 'grass'), -7, -5, 1.2);
add(createFarmPatch(3), -3, -5, 1.2);
add(createPond(3), 1, -5, 1.2);
add(createBridge(3), 5, -5, 1.2);
add(createFence(3), 8, -5, 1.2);
add(createLighthouse(), -8, 7, 1.3);
add(createWindmill(), -3, 7, 1.2);
add(createCloud(1.8), -4, 6, 1);
add(createCloud(1.25), 3, 6.8, 1);
const ocean = createOceanSurface(32);
ocean.position.y = -1.1;
root.add(ocean);
animated.push(ocean, createSnowfall(260, 28));
animated[animated.length - 1].position.y = 0;
root.add(animated[animated.length - 1]);
function resize() {
  const a = innerWidth / innerHeight,
    v = 14;
  camera.left = -v * a;
  camera.right = v * a;
  camera.top = v;
  camera.bottom = -v;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
}
addEventListener('resize', resize);
resize();
let last = performance.now();
renderer.setAnimationLoop((time) => {
  const delta = (time - last) / 1000;
  last = time;
  for (const asset of animated) asset.userData.animate?.(time * 1000, delta);
  renderer.render(scene, camera);
});
