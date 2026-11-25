import * as THREE from 'three';
import { CHUNK, CELL } from '../domain/WorldModel.js';
export const terrainColor = (h: number, active: number, dormant: number) => {
  const c = new THREE.Color();
  if (h < 1.8) c.setRGB(0.42, 0.4, 0.29);
  else {
    const rock = THREE.MathUtils.smoothstep(h, 13, 32);
    c.setRGB(0.21, 0.29, 0.22);
    c.lerp(new THREE.Color(0.24, 0.36, 0.23), active * 0.7);
    c.lerp(new THREE.Color(0.36, 0.39, 0.37), rock);
    const snow = dormant * THREE.MathUtils.smoothstep(h, 27, 48);
    c.lerp(new THREE.Color(0.81, 0.86, 0.85), snow);
  }
  return c;
};
export const geomChunk = (cx: number, cz: number) => {
  const g = new THREE.BufferGeometry(),
    n = CHUNK + 1,
    count = n * n,
    pos = new Float32Array(count * 3),
    col = new Float32Array(count * 3),
    normal = new Float32Array(count * 3),
    indices = [];
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const i = z * n + x;
      pos[i * 3] = (cx * CHUNK + x) * CELL - 200;
      pos[i * 3 + 2] = (cz * CHUNK + z) * CELL - 200;
      if (x < CHUNK && z < CHUNK) {
        const a = i,
          b = i + 1,
          c = i + n,
          d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  g.setIndex(indices);
  return g;
};
