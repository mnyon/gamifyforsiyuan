import { refreshLabels, placeLabels, type MapLabel } from './MapLabels.js';
import { terrainColor, geomChunk } from './terrainGeometry.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  WorldModel,
  GRID,
  STRIDE,
  CELL,
  CHUNK,
  random,
  parseUpdated,
} from '../domain/WorldModel.js';
import type { Layout, Metadata } from '../domain/types.js';
import { restoreWorld, applyMetadata } from '../application/updateWorld.js';
import { validSnapshot } from '../application/snapshot.js';
import type { WorldSnapshot } from '../application/ports.js';
import { element as $, yieldFrame } from './dom.js';
type TerrainMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export class TerrainView {
  readonly container = $('scene');
  readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  real = false;
  selected: string | null = null;
  renderer!: THREE.WebGLRenderer;
  controls!: OrbitControls;
  camera!: THREE.OrthographicCamera;
  scene!: THREE.Scene;
  model = new WorldModel();
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | null = null;
  towers: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> | null = null;
  forest: THREE.InstancedMesh<THREE.ConeGeometry, THREE.MeshStandardMaterial> | null = null;
  routeGroup: THREE.Group | null = null;
  selectionMarker: THREE.Group | null = null;
  riverGroup: THREE.Group | null = null;
  labels: MapLabel[] = [];
  framePending = false;
  last = 0;
  ready = false;
  overviewZoom = 1;
  meshes: TerrainMesh[] = [];
  moving = new Set<number>();
  shown: Float32Array = new Float32Array(STRIDE * STRIDE);
  pointIds: string[] = [];
  positionVersion = 0;
  picking = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  routeSerial = 0;
  needLandmarks = false;
  settling = false;
  resizeObserver: ResizeObserver | null = null;
  frameId: number | null = null;
  disposed = false;
  dispose = (object: THREE.Object3D | null) => {
    if (!object) return;
    object.traverse((o) => {
      if (o instanceof THREE.DirectionalLight || o instanceof THREE.SpotLight) o.shadow.dispose();
      if (!(o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points))
        return;
      o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) m?.dispose();
    });
    this.scene.remove(object);
  };
  updateChunk = (k: number) => {
    const mesh = this.meshes[k],
      cx = k % 8,
      cz = Math.floor(k / 8),
      pos = mesh.geometry.attributes.position,
      col = mesh.geometry.attributes.color,
      norm = mesh.geometry.attributes.normal;
    for (let z = 0; z <= CHUNK; z++)
      for (let x = 0; x <= CHUNK; x++) {
        const gx = cx * CHUNK + x,
          gz = cz * CHUNK + z,
          i = gz * STRIDE + gx,
          j = z * (CHUNK + 1) + x,
          h = this.shown[i];
        pos.setY(j, h);
        const c = terrainColor(h, this.model.activity[i], this.model.dormancy[i]);
        col.setXYZ(j, c.r, c.g, c.b);
        const dx =
            (this.shown[gz * STRIDE + Math.min(GRID, gx + 1)] -
              this.shown[gz * STRIDE + Math.max(0, gx - 1)]) /
            (CELL * (gx === 0 || gx === GRID ? 1 : 2)),
          dz =
            (this.shown[Math.min(GRID, gz + 1) * STRIDE + gx] -
              this.shown[Math.max(0, gz - 1) * STRIDE + gx]) /
            (CELL * (gz === 0 || gz === GRID ? 1 : 2)),
          v = new THREE.Vector3(-dx, 1, -dz).normalize();
        norm.setXYZ(j, v.x, v.y, v.z);
      }
    pos.needsUpdate = col.needsUpdate = norm.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  };
  buildTerrain = () => {
    for (const m of this.meshes) this.dispose(m);
    this.meshes.length = 0;
    this.shown = Float32Array.from(this.model.heights);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.97,
      metalness: 0.02,
    });
    for (let z = 0; z < 8; z++)
      for (let x = 0; x < 8; x++) {
        const mesh = new THREE.Mesh(geomChunk(x, z), mat.clone());
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.meshes.push(mesh);
        this.updateChunk(this.meshes.length - 1);
      }
    mat.dispose();
    this.buildRivers();
  };
  buildRivers = () => {
    this.dispose(this.riverGroup);
    this.riverGroup = new THREE.Group();
    for (const path of this.model.rivers) {
      const coords = path.map(
        (p) => new THREE.Vector3(p.x, Math.max(0.24, this.model.height(p.x, p.z) + 0.18), p.z),
      );
      const curve = new THREE.CatmullRomCurve3(coords, false, 'centripetal');
      const sampled = curve.getPoints(Math.min(600, path.length * 3));
      for (const p of sampled) p.y = Math.max(0.25, this.model.height(p.x, p.z) + 0.22);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(sampled),
        new THREE.LineBasicMaterial({ color: 0x6898a4, transparent: true, opacity: 0.85 }),
      );
      this.riverGroup.add(line);
      const ribbon = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(sampled),
          Math.min(650, sampled.length),
          Math.min(1.1, 0.1 + 0.08 * Math.log2(1 + path.weight)),
          4,
          false,
        ),
        new THREE.MeshStandardMaterial({ color: 0x477480, roughness: 0.36, metalness: 0.15 }),
      );
      this.riverGroup.add(ribbon);
      const a = sampled[Math.floor(sampled.length * 0.52)],
        b = sampled[Math.floor(sampled.length * 0.55)],
        dir = b.clone().sub(a).normalize();
      if (dir.lengthSq()) this.riverGroup.add(new THREE.ArrowHelper(dir, a, 4, 0xb4dee5, 2, 1));
    }
    this.scene.add(this.riverGroup);
  };
  refreshMetrics = () => {
    $('page-count').textContent = this.model.pages.size.toLocaleString();
    $('edge-count').textContent = this.model.edges.length.toLocaleString();
    $('book-count').textContent = this.model.books.size.toLocaleString();
  };
  buildLandmarks = () => {
    this.dispose(this.points);
    this.dispose(this.towers);
    this.dispose(this.forest);
    const ps = [...this.model.pages.values()];
    this.pointIds = ps.map((p) => p.id);
    const geo = new THREE.BufferGeometry(),
      positions = new Float32Array(ps.length * 3),
      colors = new Float32Array(ps.length * 3);
    const box = new THREE.BoxGeometry(0.65, 1.4, 0.65);
    this.towers = new THREE.InstancedMesh(
      box,
      new THREE.MeshStandardMaterial({ color: 0xb6c8bc, roughness: 0.8 }),
      ps.length,
    );
    const matrix = new THREE.Matrix4(),
      trees = [];
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i],
        h = this.model.height(p.x, p.z),
        degree = this.model.adjacency.get(p.id)?.length || 0,
        age = (this.model.now - parseUpdated(p.updated)) / 86400000,
        active = Math.exp(-Math.max(0, age) / 35),
        c = new THREE.Color().lerpColors(
          new THREE.Color(0x778e91),
          new THREE.Color(0xe5dca2),
          active,
        );
      positions.set([p.x, Math.max(0.6, h) + 1.6, p.z], i * 3);
      colors.set([c.r, c.g, c.b], i * 3);
      const scale = 0.6 + Math.min(2, Math.log2(1 + degree) * 0.25);
      matrix.compose(
        new THREE.Vector3(p.x, Math.max(0.4, h) + 0.7 * scale, p.z),
        new THREE.Quaternion(),
        new THREE.Vector3(1, scale, 1),
      );
      this.towers.setMatrixAt(i, matrix);
      this.towers.setColorAt(i, c);
      if (age >= 0 && age < 30) trees.push(p);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 2.3,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
      }),
    );
    this.scene.add(this.points);
    this.towers.castShadow = true;
    this.scene.add(this.towers);
    this.forest = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.65, 2.4, 5),
      new THREE.MeshStandardMaterial({ color: 0x354a3e, roughness: 1 }),
      trees.length,
    );
    for (let i = 0; i < trees.length; i++) {
      const p = trees[i],
        x = p.x + 1.6,
        z = p.z + 0.8,
        h = this.model.height(x, z);
      matrix.makeTranslation(x, h + 1.2, z);
      this.forest.setMatrixAt(i, matrix);
    }
    this.forest.castShadow = true;
    this.scene.add(this.forest);
    this.refreshLabels();
    this.refreshMetrics();
    this.positionVersion++;
    this.requestRender();
  };
  updateLandmarkHeights = () => {
    if (!this.points || !this.towers) return;
    const pos = this.points.geometry.attributes.position,
      m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      s = new THREE.Vector3(),
      v = new THREE.Vector3();
    for (let i = 0; i < this.pointIds.length; i++) {
      const p = this.model.pages.get(this.pointIds[i]);
      if (!p) continue;
      const h = this.model.height(p.x, p.z);
      pos.setY(i, Math.max(0.6, h) + 1.6);
      this.towers.getMatrixAt(i, m);
      m.decompose(v, q, s);
      v.y = Math.max(0.4, h) + 0.7 * s.y;
      m.compose(v, q, s);
      this.towers.setMatrixAt(i, m);
    }
    pos.needsUpdate = true;
    this.towers.instanceMatrix.needsUpdate = true;
    this.updateMarker();
  };
  refreshLabels = () => {
    this.labels = refreshLabels(this.labels, this.model, this.selected, $('labels'));
  };
  placeLabels = () => {
    placeLabels(this.labels, this.model, this.camera, this.container, this.overviewZoom);
  };
  updateMarker = () => {
    if (!this.selectionMarker) return;
    const p = this.selected ? this.model.pages.get(this.selected) : undefined;
    this.selectionMarker.visible = !!p;
    if (p)
      this.selectionMarker.position.set(p.x, Math.max(0.5, this.model.height(p.x, p.z)) + 0.7, p.z);
  };
  buildRoutes = async () => {
    const serial = ++this.routeSerial;
    this.dispose(this.routeGroup);
    this.routeGroup = new THREE.Group();
    this.scene.add(this.routeGroup);
    const p = this.selected ? this.model.pages.get(this.selected) : undefined;
    if (!p || !$('roads').checked) {
      $('route-info').textContent = p
        ? '双链道路已隐藏。蓝色流线仍表示跨笔记本引用。'
        : '选择笔记后显示关联道路。';
      return;
    }
    const rows = this.model.related(this.selected!),
      max = 12;
    $('route-info').textContent = rows.length
      ? `正在计算 ${Math.min(max, rows.length)} 条绕地形路线…`
      : '这篇笔记尚无页面级双链。';
    for (const { page: q } of rows.slice(0, max)) {
      if (serial !== this.routeSerial) return;
      const path = this.model.route(p, q),
        coords = path.map(
          (v) => new THREE.Vector3(v.x, Math.max(0.65, this.model.height(v.x, v.z) + 0.55), v.z),
        );
      const land: THREE.Vector3[] = [],
        bridge: THREE.Vector3[] = [];
      for (let i = 1; i < coords.length; i++) {
        const a = coords[i - 1],
          b = coords[i],
          sea = this.model.height((a.x + b.x) / 2, (a.z + b.z) / 2) < 0.5;
        (sea ? bridge : land).push(a, b);
      }
      if (land.length)
        this.routeGroup.add(
          new THREE.LineSegments(
            new THREE.BufferGeometry().setFromPoints(land),
            new THREE.LineBasicMaterial({ color: 0xd5bd80, transparent: true, opacity: 0.85 }),
          ),
        );
      if (bridge.length) {
        const line = new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(bridge),
          new THREE.LineDashedMaterial({
            color: 0x9fc3ca,
            dashSize: 1.3,
            gapSize: 0.8,
            transparent: true,
            opacity: 0.85,
          }),
        );
        line.computeLineDistances();
        this.routeGroup.add(line);
      }
      this.requestRender();
      await yieldFrame();
    }
    if (serial === this.routeSerial)
      $('route-info').textContent = rows.length
        ? `共 ${rows.length} 篇关联；显示权重最高的 ${Math.min(max, rows.length)} 条路线。金色为陆路，蓝色虚线为跨水连接。`
        : '这篇笔记尚无页面级双链。';
  };
  updateDetail = () => {
    const p = this.selected ? this.model.pages.get(this.selected) : undefined;
    $('focus').disabled = !p;
    $('open').hidden = !p || !this.real;
    if (!p) {
      $('explain-position').textContent = '选择地标或点击地表，查看生成依据';
      for (const id of [
        'explain-density',
        'explain-content',
        'explain-height',
        'explain-age',
        'explain-active',
      ])
        $(id).textContent = '—';
      $('title').textContent = '选择一篇笔记';
      $('book').textContent = '';
      for (const id of ['chars', 'updated', 'degree']) $(id).textContent = '—';
      return;
    }
    $('book').textContent = this.model.books.get(p.box)?.name || '笔记本';
    $('title').textContent = p.title || '未命名';
    $('chars').textContent =
      p.chars === undefined ? '统计读取中' : p.chars.toLocaleString() + ' 字符';
    const t = parseUpdated(p.updated);
    $('updated').textContent = t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '未知';
    const edges = this.model.adjacency.get(p.id) || [];
    $('degree').textContent =
      edges.filter((e) => e.target === p.id).length +
      ' / ' +
      edges.filter((e) => e.source === p.id).length;
    $('open').href = 'siyuan://blocks/' + p.id;
    this.explainTerrain(p.x, p.z);
  };
  explainTerrain = (x: number, z: number) => {
    const e = this.model.explain(x, z);
    $('explain-position').textContent =
      '此处由 ' +
      e.forms.length +
      ' 个创建月份群落与 ' +
      e.contributors.length +
      ' 篇局部 Page 共同塑形';
    $('explain-density').textContent = e.density.toFixed(2);
    $('explain-content').textContent = e.mass.toFixed(2) + ' / ' + e.content.toFixed(2);
    $('explain-height').textContent =
      this.model.height(x, z).toFixed(2) + ' / ' + e.height.toFixed(2);
    $('explain-age').textContent = Math.round(e.dormant * 100) + '%';
    $('explain-active').textContent = Math.round(e.active * 100) + '%';
    $('explain-rule').textContent =
      '山体来自创建月份群落的笔记数与字符量，以平滑曲面融合，再按地势汇水下切谷地；局部 Page 叠加细部。绿意对应更新活跃度；高处的浅色覆盖同时取决于高度与沉寂程度。';
  };
  selectPage = (id: string, focus = false) => {
    if (!this.model.pages.has(id)) return;
    this.selected = id;
    this.updateDetail();
    this.updateMarker();
    this.refreshLabels();
    this.buildRoutes();
    if (focus) this.focusPage();
    this.requestRender();
  };
  focusPage = () => {
    const p = this.selected ? this.model.pages.get(this.selected) : undefined;
    if (!p) return;
    const delta = new THREE.Vector3(p.x, Math.max(0, this.model.height(p.x, p.z)), p.z).sub(
      this.controls.target,
    );
    this.camera.position.add(delta);
    this.controls.target.add(delta);
    this.camera.zoom = Math.max(this.camera.zoom, this.overviewZoom * 3);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.requestRender();
  };
  fitOverview = () => {
    let minX = 200,
      minZ = 200,
      maxX = -200,
      maxZ = -200,
      maxH = 0;
    for (let i = 0; i < this.model.heights.length; i++) {
      if (this.model.heights[i] <= 0) continue;
      const x = (i % STRIDE) * CELL - 200,
        z = Math.floor(i / STRIDE) * CELL - 200;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      maxH = Math.max(maxH, this.model.heights[i]);
    }
    if (minX > maxX) {
      minX = minZ = -100;
      maxX = maxZ = 100;
    }
    const center = new THREE.Vector3((minX + maxX) / 2, maxH * 0.24, (minZ + maxZ) / 2);
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(new THREE.Vector3(240, 310, 310));
    this.camera.zoom = 1;
    this.camera.lookAt(center);
    this.camera.updateMatrixWorld();
    this.camera.updateProjectionMatrix();
    let extent = 0.1;
    for (const x of [minX, maxX])
      for (const z of [minZ, maxZ])
        for (const h of [0, maxH]) {
          const p = new THREE.Vector3(x, h, z).project(this.camera);
          extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y));
        }
    this.overviewZoom = Math.max(0.7, Math.min(4, 0.83 / extent));
    this.camera.zoom = this.overviewZoom;
    this.controls.minZoom = this.overviewZoom * 0.6;
    this.controls.maxZoom = this.overviewZoom * 14;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.requestRender();
  };
  search = () => {
    const term = $('search').value.trim().toLocaleLowerCase(),
      s = $('pages');
    s.replaceChildren();
    const pages = [...this.model.pages.values()]
      .filter((p) => !term || p.title.toLocaleLowerCase().includes(term))
      .sort((a, b) => parseUpdated(b.updated) - parseUpdated(a.updated))
      .slice(0, 30);
    for (const p of pages) {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.title || '未命名';
      s.append(o);
    }
    s.value = this.selected || '';
    if (!pages.length) {
      const o = document.createElement('option');
      o.textContent = '没有匹配的笔记';
      o.disabled = true;
      s.append(o);
    }
  };
  requestRender = () => {
    if (!this.disposed && !this.framePending && this.ready) {
      this.framePending = true;
      this.frameId = requestAnimationFrame(this.render);
    }
  };
  render = (t: number) => {
    this.framePending = false;
    const dt = Math.min(50, t - (this.last || t - 16));
    this.last = t;
    if (this.model.dirty.size) {
      this.model.step(650);
      for (const k of this.model.changedChunks) this.moving.add(k);
      this.model.changedChunks.clear();
      this.settling = true;
    }
    const f = this.reduced ? 1 : 1 - Math.exp(-dt / 100);
    const complete = [];
    for (const k of this.moving) {
      const cx = k % 8,
        cz = Math.floor(k / 8);
      let remaining = false;
      for (let z = 0; z <= CHUNK; z++)
        for (let x = 0; x <= CHUNK; x++) {
          const i = (cz * CHUNK + z) * STRIDE + cx * CHUNK + x,
            d = this.model.heights[i] - this.shown[i];
          if (Math.abs(d) > 0.002) {
            this.shown[i] += d * f;
            remaining = true;
          } else this.shown[i] = this.model.heights[i];
        }
      this.updateChunk(k);
      if (!remaining) complete.push(k);
    }
    for (const k of complete) this.moving.delete(k);
    if (this.settling && !this.moving.size && !this.model.dirty.size) {
      this.settling = false;
      this.updateLandmarkHeights();
      if (this.selected) this.updateDetail();
      this.buildRivers();
      if (this.needLandmarks) {
        this.buildLandmarks();
        this.needLandmarks = false;
      }
      if (this.selected) this.buildRoutes();

      $('world-status').textContent = this.real ? '元信息地形 · 更新完成' : '模拟世界 · 可探索';
    }
    const changing = false;
    const detail = this.camera.zoom > this.overviewZoom * 2.2;
    this.towers && (this.towers.visible = detail);
    if (this.points) {
      this.points.visible = this.camera.zoom > this.overviewZoom * 1.3;
      this.points.material.size = detail ? 2.3 : 1.5;
      this.points.material.opacity = detail ? 0.8 : 0.4;
    }
    this.placeLabels();
    this.renderer.render(this.scene, this.camera);
    if (changing || this.moving.size || this.model.dirty.size) this.requestRender();
  };
  initScene = () => {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101d25);
    this.scene.fog = new THREE.FogExp2(0x15272e, 0.00065);
    this.camera = new THREE.OrthographicCamera(-240, 240, 180, -180, 0.1, 1500);
    this.camera.position.set(240, 310, 310);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.dampingFactor = 0.12;
    this.controls.minZoom = 0.75;
    this.controls.maxZoom = 18;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minPolarAngle = 0.15;
    this.controls.target.set(0, 2, 0);
    this.controls.addEventListener('change', this.requestRender);
    this.scene.add(new THREE.HemisphereLight(0xbdcfd8, 0x30392b, 1.25));
    const sun = new THREE.DirectionalLight(0xf6e2c2, 3.7);
    sun.position.set(-170, 180, -100);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -240,
      right: 240,
      top: 240,
      bottom: -240,
      near: 1,
      far: 650,
    });
    sun.shadow.normalBias = 0.6;
    sun.shadow.bias = -0.00015;
    this.scene.add(sun);
    this.scene.add(sun.target);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1200),
      new THREE.MeshBasicMaterial({ color: 0x142d39 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.08;
    water.receiveShadow = true;
    this.scene.add(water);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.18, 6, 40),
      new THREE.MeshBasicMaterial({ color: 0xe7d6a2 }),
    );
    ring.rotation.x = -Math.PI / 2;
    this.selectionMarker = new THREE.Group();
    this.selectionMarker.add(ring);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xeadfb8 }),
    );
    pole.position.y = 3;
    this.selectionMarker.add(pole);
    this.scene.add(this.selectionMarker);
    this.resizeObserver = new ResizeObserver(() => {
      const w = this.container.clientWidth,
        h = this.container.clientHeight;
      this.renderer.setSize(w, h);
      const half = 185;
      this.camera.left = (-half * w) / h;
      this.camera.right = (half * w) / h;
      this.camera.top = half;
      this.camera.bottom = -half;
      this.camera.updateProjectionMatrix();
      this.requestRender();
    });
    this.resizeObserver.observe(this.container);
    let down: { x: number; y: number } | null = null;
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY };
    });
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || e.button !== 0) return;
      const r = this.renderer.domElement.getBoundingClientRect();
      this.mouse.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      );
      this.picking.setFromCamera(this.mouse, this.camera);
      if (!this.points) return;
      this.picking.params.Points.threshold = Math.max(0.8, 4 / this.camera.zoom);
      const hit = this.picking.intersectObject(this.points)[0];
      if (hit && hit.index !== undefined) this.selectPage(this.pointIds[hit.index]);
      else {
        const ground = this.picking.intersectObjects(this.meshes)[0];
        if (ground) this.explainTerrain(ground.point.x, ground.point.z);
      }
    });
    this.ready = true;
  };
  resetModel = (saved: Partial<Layout> = {}) => {
    this.routeSerial++;
    this.dispose(this.routeGroup);
    this.dispose(this.points);
    this.points = null;
    this.dispose(this.towers);
    this.towers = null;
    this.dispose(this.forest);
    this.forest = null;
    this.pointIds = [];
    for (const l of this.labels) l.el.remove();
    this.labels = [];
    this.moving.clear();
    this.settling = false;
    this.needLandmarks = false;
    this.model = new WorldModel(saved);
    this.selected = null;
    this.updateDetail();
    this.updateMarker();
    this.buildTerrain();
    this.search();
    this.refreshMetrics();
    $('route-info').textContent = '引用关系读取后显示道路与引用流。';
    $('world-status').textContent = '等待 Page 元信息生成陆地';
    this.requestRender();
  };
  demo = () => {
    this.real = false;
    $('source').textContent = '模拟世界';
    this.resetModel();
    const books = [
      '生活与日常',
      '技术与创造',
      '阅读与思考',
      '旅行手记',
      '灵感与设计',
      '自然观察',
      '长期项目',
      '学习札记',
    ].map((name, i) => ({ id: 'demo-book-' + i, name }));
    this.model.setBooks(books);
    const titles = [
      '山间的观察',
      '知识的连接',
      '一次新的尝试',
      '关于时间',
      '创造的工具',
      '设计与秩序',
      '沿途风景',
      '新的灵感',
    ];
    const demoRows = [];
    for (let i = 0; i < 450; i++)
      demoRows.push({
        id: 'demo-page-' + i,
        box: books[i % books.length].id,
        title: titles[i % 8] + ' · ' + (i + 1),
        updated: Date.now() - random(i + 'age') * 150 * 86400000,
        chars: Math.round(500 + random(i + 'size') * 16000),
      });
    this.model.prepareLayout(demoRows);
    for (const p of demoRows) this.model.upsert(p);
    this.model.setEdges(
      [...this.model.pages.values()].slice(1).map((p, i) => ({
        source: p.id,
        target: 'demo-page-' + Math.max(0, i - 7),
        weight: 1 + Math.floor(random(i + 'e') * 4),
      })),
    );
    while (this.model.dirty.size) this.model.step(99999);
    this.model.changedChunks.clear();
    this.shown.set(this.model.heights);
    for (let k = 0; k < 64; k++) this.updateChunk(k);
    this.buildLandmarks();
    this.search();
    this.selectPage('demo-page-93');
    $('load-status').textContent = '450 篇模拟 Page。连接思源后生成你的真实领地。';
    $('world-status').textContent = '模拟世界 · 可探索';
    $('demo-edit').disabled = false;
    this.fitOverview();
    this.requestRender();
  };
  restoreSnapshot = async (snapshot: WorldSnapshot) => {
    if (!validSnapshot(snapshot)) return false;
    this.real = true;
    this.resetModel(snapshot.layout);
    await restoreWorld(this.model, snapshot, yieldFrame);
    if (this.disposed) return false;
    this.buildTerrain();
    this.buildLandmarks();
    this.selected = snapshot.pages[0]?.id || null;
    this.updateDetail();
    this.updateMarker();
    this.refreshLabels();
    this.search();
    this.fitOverview();
    $('source').textContent = '本机笔记 · 缓存世界';
    $('world-status').textContent = '已保存的领地';
    $('load-status').textContent =
      '上次整理 ' + new Date(snapshot.at).toLocaleString('zh-CN', { hour12: false });
    $('change-status').textContent = '地图已从本机缓存恢复。无需等待重新读取。';
    $('demo-edit').disabled = true;
    this.requestRender();
    return true;
  };
  async applyCatalog(data: Metadata) {
    const first = !this.real;
    if (first) {
      this.real = true;
      this.resetModel(this.getSavedLayout());
    }
    const result = await applyMetadata(this.model, data, Date.now(), yieldFrame);
    if (this.disposed) return result;
    this.moving.clear();
    this.buildTerrain();
    this.buildLandmarks();
    this.selected =
      this.selected && this.model.pages.has(this.selected)
        ? this.selected
        : data.pages[0]?.id || null;
    this.updateDetail();
    this.updateMarker();
    this.refreshLabels();
    this.search();
    if (first) this.fitOverview();
    this.saveLayout();
    this.requestRender();
    return result;
  }
  getSavedLayout(): Partial<Layout> {
    try {
      return JSON.parse(localStorage.getItem('note-territory-layout-v4') || '{}');
    } catch {
      return {};
    }
  }
  saveLayout() {
    if (!this.real) return;
    try {
      localStorage.setItem('note-territory-layout-v4', JSON.stringify(this.model.layout));
    } catch {
      $('change-status').textContent = '浏览器未能保存地图坐标；当前会话内位置仍保持稳定。';
    }
  }
  editDemo() {
    const p = this.selected ? this.model.pages.get(this.selected) : undefined;
    if (!p || this.real) return;
    this.model.now = Date.now();
    this.model.upsert({ ...p, chars: (p.chars || 0) + 5000, updated: Date.now() });
    $('dirty-count').textContent = this.model.dirty.size + ' 采样点';
    $('change-status').textContent = '模拟写入 5,000 字符；附近地形抬升，地标保留原位。';
    this.needLandmarks = true;
    this.updateDetail();
    this.requestRender();
  }
  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    this.routeSerial++;
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    if (this.scene) {
      for (const child of [...this.scene.children]) this.dispose(child);
    }
    for (const label of this.labels) label.el.remove();
    this.labels = [];
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer?.domElement.remove();
  }
  get diagnostics() {
    return {
      pages: this.model.pages.size,
      edges: this.model.edges.length,
      books: this.model.books.size,
      renderChunks: this.meshes.length,
      dirty: this.model.dirty.size,
      moving: this.moving.size,
      citationFlows: this.model.rivers.map((p) => ({ points: p.length, weight: p.weight })),
      layoutVersion: this.model.layout.version,
      renderer: this.renderer?.info.render,
      positionVersion: this.positionVersion,
    };
  }
}
