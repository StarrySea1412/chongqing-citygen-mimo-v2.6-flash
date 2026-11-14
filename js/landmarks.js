import * as THREE from 'three';
import { Rng } from './rng.js?v=14';

// ===== 轻轨穿楼（李子坝）=====
// 高架轨道 + 一栋开洞的楼，列车从楼体中间穿过
export function generateMonorail(heightFn, params){
  const g = new THREE.Group();
  g.name = 'monorail';
  const rng = new Rng(params.seed * 13 + 5);

  // 轨道：一条横穿城区的高架线，基本平缓、略有起伏
  const pts = [];
  const y0 = 26;
  for (let t = 0; t <= 1.001; t += 0.05){
    const x = -320 + t * 640;
    const z = -290 + Math.sin(t * Math.PI * 1.2) * 35;
    const gy = heightFn.height(x, z);
    // 轨面 = max(地形+18, 固定高差)，保持“高架”感
    const y = Math.max(gy + 16, y0 + Math.sin(t * 4) * 3);
    pts.push(new THREE.Vector3(x, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);

  // 轨道梁（双轨箱梁）
  const beamGeo = new THREE.TubeGeometry(curve, 200, 1.6, 6, false);
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x9aa2ad, roughness: 0.7, metalness: 0.3 });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.castShadow = true;
  g.add(beam);

  // 轨道墩柱
  const pilGeo = new THREE.CylinderGeometry(1.4, 1.8, 1, 8);
  const pilMat = new THREE.MeshStandardMaterial({ color: 0x777d87, roughness: 0.9 });
  for (let i = 0; i <= 30; i++){
    const p = curve.getPoint(i / 30);
    const gy = heightFn.height(p.x, p.z);
    const h = p.y - gy - 1.6;
    if (h < 5) continue;
    const m = new THREE.Mesh(pilGeo, pilMat);
    m.position.set(p.x, gy + h / 2, p.z);
    m.scale.y = h;
    m.castShadow = true;
    g.add(m);
  }

  // 穿楼：选轨道中段一点，楼包住轨道
  const tStation = 0.5;
  const pStation = curve.getPoint(tStation);
  const tan = curve.getTangent(tStation);
  const bldW = 44, bldD = 26, bldH = 52;
  const groundY = heightFn.height(pStation.x, pStation.z);
  const bld = new THREE.Group();

  // 楼体 = 左右两半 + 顶跨，中间留出轨道洞（洞高 7m）
  const mat = new THREE.MeshStandardMaterial({ color: 0xb0a58c, roughness: 0.85, metalness: 0.1 });
  const holeH = 8, holeHalfW = 6;
  const angle = Math.atan2(-tan.z, tan.x);   // 局部 x 轴对齐轨道方向（隧道沿 x 穿出）

  function block(w, h, d, ox, oy, oz){
    const geo = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(ox, oy, oz);
    m.castShadow = m.receiveShadow = true;
    bld.add(m);
    return m;
  }
  // 洞在楼体局部坐标：轨道沿 x 方向穿过
  const base = groundY;
  const top = groundY + bldH;
  const holeBot = pStation.y - holeH / 2 - base;
  const holeTop = pStation.y + holeH / 2 - base;
  // 左半
  block(bldD, holeBot, (bldW - holeHalfW * 2) / 2, 0, holeBot / 2, -(holeHalfW + (bldW - holeHalfW * 2) / 4));
  // 右半
  block(bldD, holeBot, (bldW - holeHalfW * 2) / 2, 0, holeBot / 2, (holeHalfW + (bldW - holeHalfW * 2) / 4));
  // 左上
  const upH = top - (base + holeTop);
  block(bldD, upH, (bldW - holeHalfW * 2) / 2, 0, holeTop + upH / 2, -(holeHalfW + (bldW - holeHalfW * 2) / 4));
  // 右上
  block(bldD, upH, (bldW - holeHalfW * 2) / 2, 0, holeTop + upH / 2, (holeHalfW + (bldW - holeHalfW * 2) / 4));
  // 洞顶过梁（整宽）
  block(bldD, 5, holeHalfW * 2, 0, holeTop + 2.5, 0);

  bld.position.set(pStation.x, base, pStation.z);
  bld.rotation.y = angle;
  g.add(bld);

  // 列车（两节车厢）
  const train = new THREE.Group();
  const carGeo = new THREE.BoxGeometry(4, 3.6, 16);
  const carMat = new THREE.MeshStandardMaterial({
    color: 0x6fd08c, roughness: 0.4, metalness: 0.35,
    emissive: 0x1c4a2a, emissiveIntensity: 0.6,
  });
  for (let i = 0; i < 2; i++){
    const c = new THREE.Mesh(carGeo, carMat);
    c.position.z = i * 17 - 8.5;
    c.castShadow = true;
    train.add(c);
  }
  g.add(train);

  g.userData = { curve, train, state: { t: 0.05 } };
  return g;
}

export function updateMonorail(group, dt, speed){
  const { curve, train, state } = group.userData;
  state.t = (state.t + dt * 0.035 * speed) % 1;
  const p = curve.getPointAt(state.t);
  const tan = curve.getTangentAt(state.t);
  train.position.copy(p);
  train.position.y += 2.6;
  train.lookAt(p.clone().add(tan));
}

// ===== 长江索道 =====
export function generateCableway(heightFn, params){
  const g = new THREE.Group();
  g.name = 'cableway';
  // 跨越长江：取长江中点，沿河法线向两岸各偏出 62m 立塔（真·跨江索道）
  const P = [70, 175], Q = [190, 118];
  const mx = (P[0] + Q[0]) / 2, mz = (P[1] + Q[1]) / 2;
  const dx = Q[0] - P[0], dz = Q[1] - P[1];
  const len = Math.hypot(dx, dz);
  const nx = -dz / len, nz = dx / len;
  const a = new THREE.Vector3(mx - nx * 62, 0, mz - nz * 62);
  const b = new THREE.Vector3(mx + nx * 62, 0, mz + nz * 62);
  a.y = Math.max(4, heightFn.height(a.x, a.z)) + 42;
  b.y = Math.max(4, heightFn.height(b.x, b.z)) + 42;

  const cableMat = new THREE.LineBasicMaterial({ color: 0x222222 });
  const mkLine = (p1, p2, dy) => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(p1.x, p1.y + dy, p1.z),
      new THREE.Vector3(p2.x, p2.y + dy, p2.z),
    ]);
    return new THREE.Line(geo, cableMat);
  };
  g.add(mkLine(a, b, 0));
  g.add(mkLine(a, b, -2.5));

  // 两端塔架
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.7 });
  for (const p of [a, b]){
    const gy = heightFn.height(p.x, p.z);
    const h = p.y - gy;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, h, 6), towerMat);
    t.position.set(p.x, gy + h / 2, p.z);
    t.castShadow = true;
    g.add(t);
  }

  // 厢体
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(5, 4, 8),
    new THREE.MeshStandardMaterial({
      color: 0xd94f3d, roughness: 0.5, metalness: 0.2,
      emissive: 0x61140c, emissiveIntensity: 0.5,
    }),
  );
  g.add(cabin);
  g.userData = { a, b, cabin, state: { t: 0.3 } };
  return g;
}

export function updateCableway(group, dt){
  const { a, b, cabin, state } = group.userData;
  state.t = (state.t + dt * 0.02) % 1;
  const u = 0.5 - 0.5 * Math.cos(state.t * Math.PI * 2);
  cabin.position.lerpVectors(a, b, u);
  cabin.position.y -= 3 + 6 * Math.sin(u * Math.PI); // 跨中下垂
}
