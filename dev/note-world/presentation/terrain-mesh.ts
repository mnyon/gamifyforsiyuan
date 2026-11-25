import * as THREE from 'three';
import type { Terrain } from '../domain/world.js';
const stone = new THREE.Color(0x726b58);
const soil = new THREE.Color(0x896847);
const citation = new THREE.Color(0x66b9c5);

function blockSurface(terrain: Terrain) {
  const { size: GRID, extent, cellSize: CELL, heights, tracks, climates } = terrain;
  const shore = -extent / 2;
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < GRID && z < GRID;
  const top = (x: number, z: number) => (inside(x, z) ? heights[z * GRID + x] : 0);
  const vertices: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], color: THREE.Color) => {
    const index = vertices.length / 3;
    vertices.push(...a, ...b, ...c, ...d);
    for (let i = 0; i < 4; i++) colors.push(color.r, color.g, color.b);
    indices.push(index, index + 1, index + 2, index, index + 2, index + 3);
  };
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  const sideColor = new THREE.Color();
  // Neighboring columns share a boundary. Only emit the part above the shorter column.
  for (let z = 0; z < GRID; z++) {
    for (let x = 0; x < GRID; x++) {
      const y = top(x, z);
      if (!y) continue;
      const left = shore + x * CELL,
        front = shore + z * CELL;
      const right = left + CELL,
        back = front + CELL;
      const marked = tracks[z * GRID + x];
      const climate = climates[z * GRID + x];
      const climateColors = {
        snow: 0xdfe4df,
        alpine: 0x8e9386,
        dry: 0xb39a64,
        boreal: 0x4f7562,
        temperate: 0x719671,
      };
      const color = new THREE.Color(climateColors[climate]);
      color.multiplyScalar(0.91 + ((((x * 73) ^ (z * 193)) & 15) / 15) * 0.16);
      quad(
        [left, y, front],
        [left, y, back],
        [right, y, back],
        [right, y, front],
        marked ? citation : color,
      );
      const face = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number) => {
        const low = top(nx, nz);
        if (low >= y) return;
        const ledge = Math.max(low, y - CELL * 0.28);
        const onTrack = marked && inside(nx, nz) && tracks[nz * GRID + nx];
        quad(
          [bx, y, bz],
          [ax, y, az],
          [ax, ledge, az],
          [bx, ledge, bz],
          onTrack ? citation : color,
        );
        if (low < ledge) {
          sideColor.copy(color).lerp(y < 17 ? soil : stone, 0.62);
          quad(
            [bx, ledge, bz],
            [ax, ledge, az],
            [ax, low, az],
            [bx, low, bz],
            onTrack ? citation : sideColor,
          );
        }
      };
      face(left, front, left, back, x - 1, z);
      face(left, back, right, back, x, z + 1);
      face(right, back, right, front, x + 1, z);
      face(right, front, left, front, x, z - 1);
      bounds.expandByPoint(point.set(left, 0, front));
      bounds.expandByPoint(point.set(right, y, back));
    }
  }
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-35, 0, -35), new THREE.Vector3(35, 5, 35));
  const mesh = new THREE.BufferGeometry();
  mesh.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  mesh.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  mesh.setIndex(indices);
  mesh.computeVertexNormals();
  return {
    bounds,
    mesh: new THREE.Mesh(mesh, new THREE.MeshLambertMaterial({ vertexColors: true })),
  };
}
export function createTerrainMeshes(terrain: Terrain) {
  const { bounds, mesh } = blockSurface(terrain);
  const size = bounds.getSize(new THREE.Vector3());
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x + 80, size.z + 80),
    new THREE.MeshBasicMaterial({ color: 0x326d82, transparent: true, opacity: 0.75 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(
    (bounds.min.x + bounds.max.x) / 2,
    terrain.seaLevel,
    (bounds.min.z + bounds.max.z) / 2,
  );
  return { bounds, meshes: [mesh, water] };
}
