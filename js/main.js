import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/postprocessing/OutputPass.js';
import { makeHeightFn } from './terrain.js?v=14';
import { generateTerrainMesh } from './terrainmesh.js?v=14';
import { generateWater } from './water.js?v=14';
import { generateBuildings, disposeBuildings } from './buildings.js?v=14';
import { generateInterchange, generateRoads, generateTraffic, updateTraffic } from './roads.js?v=14';
import { generateMonorail, updateMonorail, generateCableway, updateCableway } from './landmarks.js?v=14';
import { generateHongya, generateMonument } from './extras.js?v=14';

// ---------- 全局参数（与面板一一对应） ----------
const P = {
  seed: 8888, rugged: 0.65, river: 1, terrace: 0.6, parks: 0.18,
  citySize: 1, density: 0.72, block: 17, streetPattern: 'radial',
  height: 1, variance: 0.7, neon: 1, hongya: true, monument: true,
  levels: 3, railspeed: 1, cable: true, traffic: true,
  tod: 'night', fog: 0.35, exposure: 1.05, sun: 0.45, ambient: 0.55,
  autorotate: false, view: 'orbit',
};

// ---------- 渲染器 / 场景 ----------
const canvas = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// 尺寸一律交给 fitRenderer（启动时隐藏标签页 innerWidth 可能为 0，盲设会把画布毒化成 0×0）
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1, 6000);
camera.position.set(560, 400, 560);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 60;
controls.maxDistance = 1800;
controls.target.set(20, 30, 0);

// ---------- 灯光 ----------
const hemi = new THREE.HemisphereLight(0x9db4d0, 0x2a2318, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dd, 1.1);
sun.position.set(-380, 420, -260);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -620;
sun.shadow.camera.right = sun.shadow.camera.top = 620;
sun.shadow.camera.far = 2200;
sun.shadow.bias = -0.0006;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x6f86ff, 0.18);
fill.position.set(400, 200, 420);
scene.add(fill);

// ---------- 后处理 ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.4, 0.7);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let lastW = 0, lastH = 0;
function fitRenderer(){
  // CSS 万一失效（旧缓存），画布会缩成 300x150 固有尺寸——此时退回窗口尺寸
  const cw = canvas.clientWidth >= 320 ? canvas.clientWidth : innerWidth;
  const ch = canvas.clientHeight >= 180 ? canvas.clientHeight : innerHeight;
  const w = Math.min(cw, 2560), h = Math.min(ch, 1440);
  if (w > 0 && h > 0 && (w !== lastW || h !== lastH)){
    lastW = w; lastH = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
  }
}
fitRenderer();

// ---------- 时象预设 ----------
const TOD = {
  dawn:  { sky: 0xb9c2cf, fog: 0xaeb6c2, sunI: 1.4, sunC: 0xffd0a0, hemiI: 2.0, hemiC: 0xc2cee0, neonF: 0.55, bloom: 0.3, exp: 1.0 },
  day:   { sky: 0x93b2d4, fog: 0xa8bdd6, sunI: 1.6, sunC: 0xfff2dd, hemiI: 2.0, hemiC: 0xbcd0e8, neonF: 0.1, bloom: 0.12, exp: 1.05 },
  dusk:  { sky: 0x453049, fog: 0x5a3f4a, sunI: 1.2, sunC: 0xff9455, hemiI: 2.0, hemiC: 0x9a8ab0, neonF: 0.85, bloom: 0.5, exp: 1.0 },
  night: { sky: 0x0a0e1a, fog: 0x0d1420, sunI: 0.7, sunC: 0x9db4ff, hemiI: 2.2, hemiC: 0x6b7ba8, neonF: 1.0, bloom: 0.7, exp: 1.0 },
};

function applyAtmos(){
  const t = TOD[P.tod];
  const f = (0.0003 + P.fog * 0.0011) * (P.tod === 'night' ? 0.72 : 1);
  scene.background = new THREE.Color(t.sky);
  scene.fog = new THREE.FogExp2(t.fog, f);
  sun.intensity = t.sunI;
  sun.color.setHex(t.sunC);
  const elev = (0.05 + P.sun * 0.8) * Math.PI / 2;
  sun.position.set(-Math.cos(elev) * 520, Math.sin(elev) * 520 + 40, -280);
  hemi.intensity = t.hemiI * P.ambient * 1.2;
  hemi.color.setHex(t.hemiC);
  renderer.toneMappingExposure = P.exposure * t.exp;
  bloom.strength = t.bloom + P.neon * 0.15;
  const wi = 1.8 * P.neon * t.neonF;
  if (W.buildings?.winMats) for (const m of W.buildings.winMats) m.emissiveIntensity = wi;
  if (W.hongya?.userData.glow) W.hongya.userData.glow.emissiveIntensity = 3.0 * P.neon * t.neonF;
  if (W.monument?.userData.glow) W.monument.userData.glow.emissiveIntensity = 1.4 * t.neonF;
}

// ---------- 世界构建 ----------
const W = { group: null, buildings: null, roads: null, traffic: null,
  monorail: null, cableway: null, hongya: null, monument: null, inter: null };

function disposeWorld(){
  const g = W.group;
  if (!g) return;
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material){
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(m => { if (m !== W.buildings?.winMat) m.dispose(); });
    }
  });
  scene.remove(g);
}

function buildWorld(){
  disposeWorld();
  const g = new THREE.Group();
  scene.add(g);
  W.group = g;

  const hf = makeHeightFn(P.seed, P.rugged, P.terrace, P.river);
  W.hf = hf;

  g.add(generateTerrainMesh(hf, P.seed));
  g.add(generateWater(hf));

  // 交通 / 地标（固定锚点，先于楼群建，用于楼群让位）
  const roads = generateRoads(hf, P);
  g.add(roads.group);
  W.roads = roads;

  const inter = generateInterchange(hf, P);
  inter.visible = true;
  g.add(inter); W.inter = inter;

  const monorail = generateMonorail(hf, P);
  g.add(monorail); W.monorail = monorail;

  const cableway = generateCableway(hf, P);
  cableway.visible = P.cable;
  g.add(cableway); W.cableway = cableway;

  const hongya = generateHongya(hf, P);
  hongya.visible = P.hongya;
  g.add(hongya); W.hongya = hongya;

  const monument = generateMonument(hf, P);
  monument.visible = P.monument;
  g.add(monument); W.monument = monument;

  // 楼群保留区：立交、穿楼、洪崖洞、解放碑、索道塔
  const tSt = 0.5;
  const pSt = monorail.userData.curve.getPoint(tSt);
  const features = [
    { x: pSt.x, z: pSt.z, r: 46 },
    { x: -135, z: 95, r: 78 },
    { x: 96, z: -58, r: 55 },
    { x: 30, z: 0, r: 34 },
    { x: 130, z: 145, r: 40 },
  ];
  const b = generateBuildings(hf, P, features);
  g.add(b.group);
  W.buildings = b;

  const traffic = generateTraffic(roads.paths, P);
  traffic.visible = P.traffic;
  g.add(traffic); W.traffic = traffic;

  applyAtmos();
  updateStats(b.count);
}

// 局部重建：只影响楼群（密度/规模/街区/高度等滑杆实时响应）
function rebuildBuildings(){
  if (!W.group || !W.hf) return;
  if (W.buildings){
    disposeGroup(W.buildings.group);
    W.group.remove(W.buildings.group);
  }
  const monorail = W.monorail;
  const pSt = monorail.userData.curve.getPoint(0.5);
  const features = [
    { x: pSt.x, z: pSt.z, r: 46 },
    { x: -135, z: 95, r: 78 },
    { x: 96, z: -58, r: 55 },
    { x: 30, z: 0, r: 34 },
    { x: 130, z: 145, r: 40 },
  ];
  const b = generateBuildings(W.hf, P, features);
  W.group.add(b.group);
  W.buildings = b;
  applyAtmos();
  updateStats(b.count);
}

function disposeGroup(g){
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material){
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(m => m.dispose());
    }
  });
}

// ---------- 统计 ----------
let fps = 60, statT = 0, lastCount = null;
function updateStats(count){
  if (count != null) lastCount = count;
  const el = document.getElementById('stats');
  const tri = renderer.info.render.triangles;
  el.textContent = `${lastCount ?? '—'} 栋 · ${tri.toLocaleString()} 三角面 · ${fps} FPS`;
}

// ---------- 视角预设 ----------
const VIEWS = {
  orbit:     { pos: [560, 400, 560],  target: [20, 30, 0] },
  overhead:  { pos: [30, 980, 180],   target: [30, 0, 0] },
  riverside: { pos: [250, 130, 330],  target: [60, 45, -40] },
  rail:      null,   // 依赖穿楼点，动态取
};
let camTween = null;
function setView(name){
  P.view = name;
  document.querySelectorAll('#viewpreset button').forEach(b =>
    b.classList.toggle('on', b.dataset.view === name));
  let v = VIEWS[name];
  if (name === 'rail' && W.monorail){
    const p = W.monorail.userData.curve.getPoint(0.5);
    v = { pos: [p.x + 70, p.y + 30, p.z + 70], target: [p.x, p.y, p.z] };
  }
  if (!v) return;
  camTween = {
    t: 0,
    p0: camera.position.clone(), p1: new THREE.Vector3(...v.pos),
    t0: controls.target.clone(), t1: new THREE.Vector3(...v.target),
  };
}

// ---------- 动画循环 ----------
const clock = new THREE.Clock();
renderer.info.autoReset = false;
function frameStep(dt){
  fitRenderer();
  renderer.info.reset();

  if (W.traffic && W.traffic.visible) updateTraffic(W.traffic, dt);
  if (W.monorail) updateMonorail(W.monorail, dt, P.railspeed);
  if (W.cableway && W.cableway.visible) updateCableway(W.cableway, dt);

  if (camTween){
    camTween.t = Math.min(1, camTween.t + dt * 1.4);
    const e = 1 - Math.pow(1 - camTween.t, 3);   // easeOutCubic
    camera.position.lerpVectors(camTween.p0, camTween.p1, e);
    controls.target.lerpVectors(camTween.t0, camTween.t1, e);
    if (camTween.t >= 1) camTween = null;
  }

  controls.autoRotate = P.autorotate;
  controls.autoRotateSpeed = 0.55;
  controls.update();
  composer.render();

  fps = Math.round(1 / Math.max(dt, 1e-4));
  statT += dt;
  if (statT > 1){ statT = 0; updateStats(); }
}

let lastRaf = 0;
function animate(){
  requestAnimationFrame(animate);
  lastRaf = performance.now();
  frameStep(Math.min(clock.getDelta(), 0.1));
}
// 后台/隐藏标签页 rAF 会被 Chromium 暂停：低频兜底驱动，保持场景与统计活着
setInterval(() => {
  if (performance.now() - lastRaf > 1200){
    frameStep(Math.min(clock.getDelta(), 0.1));
  }
}, 1000);



// ---------- 截图 ----------
document.getElementById('btn-shot').addEventListener('click', () => {
  composer.render();
  const a = document.createElement('a');
  a.download = `chongqing-${P.seed}-${P.tod}.png`;
  a.href = renderer.domElement.toDataURL('image/png');
  a.click();
});

// ---------- UI 绑定 ----------
// 全量重建（改变形/路网结构）的参数
const FULL_KEYS = new Set(['seed', 'rugged', 'river', 'terrace', 'streetPattern', 'levels']);
// 只重建楼群的参数（实时跟手）
const BLD_KEYS = new Set(['citySize', 'density', 'block', 'height', 'variance', 'parks']);

function refreshBadge(){
  document.getElementById('seed-badge').textContent = `SEED ${P.seed}`;
}

let rebuildTimer = 0, rebuildFull = false, rebuildBld = false;
function scheduleRebuild(full){
  rebuildFull = rebuildFull || full;
  rebuildBld = true;
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    const f = rebuildFull;
    rebuildFull = rebuildBld = false;
    if (f) buildWorld(); else rebuildBuildings();
  }, 120);   // 去抖：拖动时跟手、停下即重建
}

function bindSlider(id, key, { full = false, bld = false, after = null } = {}){
  const el = document.getElementById(id);
  const val = document.getElementById('v-' + id);
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    P[key] = v;
    if (val) val.textContent = id === 'block' || id === 'levels' ? String(v) : v.toFixed(2);
    if (full) scheduleRebuild(true);
    else if (bld) scheduleRebuild(false);
    if (after) after(v);
  });
}

bindSlider('rugged', 'rugged', { full: true });
bindSlider('river', 'river', { full: true });
bindSlider('terrace', 'terrace', { full: true });
bindSlider('parks', 'parks', { bld: true });
bindSlider('citySize', 'citySize', { bld: true });
bindSlider('density', 'density', { bld: true });
bindSlider('block', 'block', { bld: true });
bindSlider('height', 'height', { bld: true });
bindSlider('variance', 'variance', { bld: true });
bindSlider('neon', 'neon', { after: applyAtmos });
bindSlider('levels', 'levels', { full: true });
bindSlider('railspeed', 'railspeed');
bindSlider('fog', 'fog', { after: applyAtmos });
bindSlider('exposure', 'exposure', { after: applyAtmos });
bindSlider('sun', 'sun', { after: applyAtmos });
bindSlider('ambient', 'ambient', { after: applyAtmos });

// 种子
const seedEl = document.getElementById('seed');
seedEl.addEventListener('change', () => {
  P.seed = Math.max(0, Math.floor(+seedEl.value || 0));
  seedEl.value = P.seed;
  refreshBadge();
  scheduleRebuild(true);
});
document.getElementById('btn-dice').addEventListener('click', () => {
  P.seed = Math.floor(Math.random() * 999999);
  seedEl.value = P.seed;
  refreshBadge();
  scheduleRebuild(true);
});
document.getElementById('btn-regen').addEventListener('click', () => {
  P.seed = Math.floor(Math.random() * 999999);
  seedEl.value = P.seed;
  refreshBadge();
  buildWorld();
});

// 开关
function bindCheck(id, key, fn){
  document.getElementById(id).addEventListener('change', e => {
    P[key] = e.target.checked;
    if (fn) fn(e.target.checked);
  });
}
bindCheck('hongya', 'hongya', v => { if (W.hongya) W.hongya.visible = v; });
bindCheck('monument', 'monument', v => { if (W.monument) W.monument.visible = v; });
bindCheck('cable', 'cable', v => { if (W.cableway) W.cableway.visible = v; });
bindCheck('traffic', 'traffic', v => { if (W.traffic) W.traffic.visible = v; });
bindCheck('autorotate', 'autorotate');

// 街道形态
document.getElementById('streetPattern').addEventListener('change', e => {
  P.streetPattern = e.target.value;
  scheduleRebuild(true);
});

// 时象
document.querySelectorAll('#tod button').forEach(b => {
  b.addEventListener('click', () => {
    P.tod = b.dataset.tod;
    document.querySelectorAll('#tod button').forEach(x => x.classList.toggle('on', x === b));
    applyAtmos();
  });
});
// 视角
document.querySelectorAll('#viewpreset button').forEach(b => {
  b.addEventListener('click', () => setView(b.dataset.view));
});

// ---------- 调试钩子（验收用） ----------
window.__CQ = { P, scene, renderer, camera, controls, W, TOD, applyAtmos,
  buildWorld, rebuildBuildings, bloom, hemi, sun, composer, frameStep };

// ---------- 启动 ----------
refreshBadge();
buildWorld();
setView('orbit');
frameStep(0.016);   // 首帧同步渲染，rAF 未跑也能出画面
animate();
setTimeout(() => document.getElementById('loading').classList.add('hide'), 350);
