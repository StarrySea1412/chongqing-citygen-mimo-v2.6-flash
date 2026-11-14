import * as THREE from 'three';
import { Rng } from './rng.js?v=14';

// 重庆色调：夜景暖黄窗光 + 冷灰混凝土 + 洪崖洞朱红 + 解放碑白
const FACADES = [
  0x8a8f99, 0x9a927f, 0xa8a49a, 0x7d8490, 0xb0a58c, 0x6f7784, 0xa39a8c,
];

// 窗贴图：程序生成发光窗格
function makeWindowTexture(){
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128);
  const rng = new Rng(777);
  for (let y = 4; y < 124; y += 9){
    for (let x = 4; x < 60; x += 8){
      if (rng.chance(0.28)){
        const warm = rng.chance(0.75);
        g.fillStyle = warm
          ? `rgba(255,${190 + rng.i(0, 50)},${110 + rng.i(0, 60)},${rng.f(0.35, 0.8)})`
          : `rgba(${150 + rng.i(0, 60)},210,255,${rng.f(0.3, 0.7)})`;
        g.fillRect(x, y, 5, 6);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

let WIN_TEX = null;

export function disposeBuildings(group){
  group.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material){
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(m => m.dispose());
    }
  });
}

// 生成城区楼群：网格分区 + 随机高度 + 依山就势（楼底贴合地形）
export function generateBuildings(heightFn, params, features){
  if (!WIN_TEX) WIN_TEX = makeWindowTexture();
  const rng = new Rng(params.seed * 7 + 13);
  const group = new THREE.Group();
  group.name = 'buildings';

  const box = new THREE.BoxGeometry(1, 1, 1);
  const spots = [];
  const parkSpots = [];
  const GRID = params.block;            // 街区尺寸（可调）
  const HALF = Math.floor(430 * params.citySize);

  for (let gx = -HALF; gx <= HALF; gx += GRID){
    for (let gz = -HALF; gz <= HALF; gz += GRID){
      const x = gx + rng.f(-4, 4), z = gz + rng.f(-4, 4);
      // 地标保留区（穿楼、立交、洪崖洞、解放碑）不盖楼
      if (features && features.some(f => Math.hypot(x - f.x, z - f.z) < f.r)) continue;
      const d = heightFn.riverDist(x, z);
      if (d < heightFn.bankR * 0.95) continue;        // 不盖在江里
      const y = heightFn.height(x, z);
      if (y < 1.2) continue;                          // 水面以下不盖
      // 公园绿地：先抽签，抽中留空铺绿
      if (rng.chance(params.parks * 0.45)){ parkSpots.push({ x, y, z }); continue; }
      // 密度：距中心越近越密（母城半岛最密）
      const dc = Math.hypot(x - 30, z) / HALF;
      const dens = params.density * (1.25 - dc * 0.7);
      if (!rng.chance(Math.min(0.96, dens))) continue;
      spots.push({ x, y, z, dc });
    }
  }

  const winMats = [];
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.95 });

  const dummy = new THREE.Object3D();
  const byColor = new Map();  // 颜色 → {list}

  for (const s of spots){
    // 高度：中心高、边缘低 + 随机；坡上楼加“吊脚”式基座
    const coreBoost = Math.max(0, 1 - s.dc * 1.6);
    const V = params.variance;                        // 天际线离散
    let h = (10 + rng.f(2, 12 + 26 * V) + coreBoost * rng.f(20, 60) * Math.min(1.2, 0.4 + V)) * params.height;
    if (s.y > 20 && rng.chance(0.3)) h *= 0.7;         // 高处楼矮一点（山脊限高）
    const w = rng.f(8, 14), dep = rng.f(8, 14);
    // 楼底：向下延伸嵌进山体，避免悬空（依山而建的关键）
    const embed = 6;
    const color = FACADES[rng.i(0, FACADES.length - 1)];
    if (!byColor.has(color)) byColor.set(color, []);
    byColor.get(color).push({ s, h, w, dep, embed });
  }

  // 按颜色合并实例，减少 draw call 用 instancedMesh
  let total = 0;
  for (const [color, list] of byColor){
    const side = new THREE.MeshStandardMaterial({
      color, roughness: 0.88, metalness: 0.08,
      emissive: 0xffffff, emissiveMap: WIN_TEX, emissiveIntensity: 1.8 * params.neon,
    });
    winMats.push(side);
    const im = new THREE.InstancedMesh(box, [side, side, roofMat, roofMat, side, side], list.length);
    for (let i = 0; i < list.length; i++){
      const { s, h, w, dep, embed } = list[i];
      dummy.position.set(s.x, s.y + h / 2 - embed, s.z);
      dummy.scale.set(w, h + embed, dep);
      dummy.rotation.y = Math.round(rng.f(0, 4)) * Math.PI / 2 + rng.f(-0.1, 0.1);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = im.receiveShadow = true;
    group.add(im);
    total += list.length;
  }



  // 公园：墨绿圆盘
  if (parkSpots.length){
    const pGeo = new THREE.CylinderGeometry(6.5, 6.5, 0.7, 12);
    const pMat = new THREE.MeshStandardMaterial({ color: 0x2f4a2a, roughness: 1 });
    const pm = new THREE.InstancedMesh(pGeo, pMat, parkSpots.length);
    parkSpots.forEach((s, i) => {
      dummy.position.set(s.x, s.y + 0.2, s.z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.y = 0;
      dummy.updateMatrix();
      pm.setMatrixAt(i, dummy.matrix);
    });
    pm.instanceMatrix.needsUpdate = true;
    pm.receiveShadow = true;
    group.add(pm);
  }

  return { group, count: total, winMats };
}
