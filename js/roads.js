import * as THREE from 'three';
import { Rng } from './rng.js?v=14';

// ===== 层叠立交（多层螺旋盘道）=====
// 重庆式立交：中心多层环形盘道 + 多条匝道向四周散出，贴合地形高度
export function generateInterchange(heightFn, params){
  const g = new THREE.Group();
  g.name = 'interchange';
  const rng = new Rng(params.seed * 3 + 7);
  const levels = params.levels;
  const cx = -135, cz = 95;              // 放在南岸坡地，显高差
  const baseY = Math.max(6, heightFn.height(cx, cz));

  const deckMat = new THREE.MeshStandardMaterial({ color: 0x3b3f47, roughness: 0.9 });
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x9aa0aa, roughness: 0.6, metalness: 0.3,
    emissive: 0xffcf7a, emissiveIntensity: 0.5,
  });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x6b6f77, roughness: 0.95 });

  function ringDeck(r, y, arc = Math.PI * 2, rot = 0){
    const seg = 72;
    const pts = [];
    for (let i = 0; i <= seg; i++){
      const a = rot + (i / seg) * arc;
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, seg, 4.4, 8, false);
    // 压扁成桥板（先平移回原点缩放再放回，避免塌向地面）
    geo.translate(0, -y, 0);
    geo.scale(1, 0.34, 1);
    geo.translate(0, y, 0);
    const mesh = new THREE.Mesh(geo, deckMat);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    // 防撞栏（发光轮廓，夜景读得出层次）
    const railGeo = new THREE.TubeGeometry(curve, seg, 0.55, 4, false);
    railGeo.translate(0, 5.4, 0);
    const rail = new THREE.Mesh(railGeo, railMat);
    g.add(rail);
    return curve;
  }

  // 桥墩：从桥面落到地形
  const pillarGeo = new THREE.CylinderGeometry(2.2, 2.6, 1, 10);
  function pillars(curve, deckY){
    for (let i = 0; i <= 20; i++){
      const p = curve.getPoint(i / 20);
      const gy = heightFn.height(p.x, p.z);
      const h = Math.max(2, deckY - gy);
      if (h < 4) continue;
      const m = new THREE.Mesh(pillarGeo, pillarMat);
      m.position.set(p.x, gy + h / 2, p.z);
      m.scale.y = h;
      m.castShadow = true;
      g.add(m);
    }
  }

  const ringCurves = [];
  const radii = [26, 42, 58];
  for (let lv = 0; lv < levels; lv++){
    const r = radii[Math.min(lv, radii.length - 1)] + lv * 4;
    const y = baseY + 10 + lv * 9;
    const c = ringDeck(r, y, Math.PI * 1.75, rng.f(0, Math.PI * 2));
    pillars(c, y);
    ringCurves.push({ c, y, r });
  }

  // 匝道：从各层环道向外落到地面道路
  const rampMat = deckMat;
  for (let k = 0; k < 5; k++){
    const lv = k % levels;
    const { c, y } = ringCurves[lv];
    const a = (k / 5) * Math.PI * 2 + rng.f(-0.3, 0.3);
    const start = new THREE.Vector3(cx + Math.cos(a) * (26 + lv * 8), y, cz + Math.sin(a) * (26 + lv * 8));
    const endR = 95 + rng.f(-15, 25);
    const end = new THREE.Vector3(cx + Math.cos(a + 0.5) * endR, 0, cz + Math.sin(a + 0.5) * endR);
    end.y = heightFn.height(end.x, end.z) + 2;
    const mid = start.clone().lerp(end, 0.5);
    mid.y = (start.y + end.y) / 2 + 6;
    const curve = new THREE.CatmullRomCurve3([start, mid, end]);
    const geo = new THREE.TubeGeometry(curve, 32, 3.0, 4, false);
    const mesh = new THREE.Mesh(geo, rampMat);
    mesh.castShadow = true;
    g.add(mesh);
  }
  return g;
}

// ===== 地面路网：细线网 + 车流动画用的路径 =====
export function generateRoads(heightFn, params){
  const g = new THREE.Group();
  g.name = 'roads';
  const rng = new Rng(params.seed * 5 + 21);
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.95 });
  const paths = [];

  // 放射+环形混合路网（简化）：8 条主干 + 2 条环路，全部贴地
  const center = new THREE.Vector3(30, 0, 0);
  const pattern = params.streetPattern || 'radial';

  // 顺山自由曲线（organic）：大摆幅正弦沿山脊走
  const organicAmp = pattern === 'organic' ? 40 : 14;
  const radialCount = pattern === 'grid' ? 0 : 8;
  for (let i = 0; i < radialCount; i++){
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const pts = [];
    for (let t = 0; t <= 1.001; t += 0.1){
      const r = t * 400;
      const x = center.x + Math.cos(a) * r + Math.sin(t * 6 + i) * organicAmp;
      const z = center.z + Math.sin(a) * r + Math.cos(t * 5 + i) * organicAmp;
      const d = heightFn.riverDist(x, z);
      if (d < heightFn.bankR * 0.9) break;
      pts.push(new THREE.Vector3(x, heightFn.height(x, z) + 0.6, z));
    }
    if (pts.length > 3) paths.push(pts);
  }

  // 棋盘格网：纵横各 9 条，过江处断开
  if (pattern === 'grid'){
    for (let k = -4; k <= 4; k++){
      for (const axis of ['x', 'z']){
        const pts = [];
        for (let t = -440; t <= 440; t += 20){
          const x = axis === 'x' ? t : center.x + k * 88;
          const z = axis === 'x' ? center.z + k * 88 : t;
          const d = heightFn.riverDist(x, z);
          if (d < heightFn.bankR * 0.9){ if (pts.length > 3) paths.push(pts.slice()); pts.length = 0; continue; }
          pts.push(new THREE.Vector3(x, heightFn.height(x, z) + 0.6, z));
        }
        if (pts.length > 3) paths.push(pts);
      }
    }
  }
  // 环路（三种形态通用，有机形态环更扁）
  const squash = pattern === 'organic' ? 1.45 : 1;
  for (const [r0, r1] of [[140, 170], [260, 285]]){
    const pts = [];
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.12){
      const x = center.x + Math.cos(a) * r0 + Math.sin(a * 3) * (r1 - r0);
      const z = (center.z + Math.sin(a) * r0 + Math.cos(a * 2) * (r1 - r0)) * squash;
      const d = heightFn.riverDist(x, z);
      if (d < heightFn.bankR * 0.9) continue;
      pts.push(new THREE.Vector3(x, heightFn.height(x, z) + 0.6, z));
    }
    if (pts.length > 5) paths.push(pts);
  }

  for (const pts of paths){
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, pts.length * 4, 2.6, 4, false);
    const m = new THREE.Mesh(geo, roadMat);
    m.receiveShadow = true;
    g.add(m);
  }
  return { group: g, paths };
}

// ===== 车流：沿路径运动的小光点 =====
export function generateTraffic(paths, params){
  const g = new THREE.Group();
  g.name = 'traffic';
  const rng = new Rng(params.seed * 11 + 3);
  const curves = paths.map(p => new THREE.CatmullRomCurve3(p));
  const cars = [];
  const geo = new THREE.BoxGeometry(3.4, 1.4, 1.8);
  const colors = [0xff4d4d, 0xffd24d, 0xffffff, 0x4da6ff];
  for (let i = 0; i < 90; i++){
    const ci = rng.i(0, curves.length - 1);
    const mat = new THREE.MeshBasicMaterial({ color: colors[rng.i(0, 3)] });
    const m = new THREE.Mesh(geo, mat);
    m.userData = { curve: curves[ci], t: rng.f(0, 1), speed: rng.f(0.02, 0.05) };
    m.scale.setScalar(rng.f(0.7, 1.1));
    g.add(m);
    cars.push(m);
  }
  g.userData.cars = cars;
  return g;
}

export function updateTraffic(group, dt){
  const cars = group.userData.cars || [];
  const tmp = new THREE.Vector3();
  for (const c of cars){
    const u = c.userData;
    u.t = (u.t + u.speed * dt) % 1;
    u.curve.getPointAt(u.t, tmp);
    const tan = u.curve.getTangentAt(u.t);
    c.position.copy(tmp);
    c.position.y += 3.6;
    c.lookAt(tmp.clone().add(tan));
  }
}
