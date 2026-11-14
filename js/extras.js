import * as THREE from 'three';
import { Rng } from './rng.js?v=14';

// ===== 洪崖洞：崖壁上的吊脚楼群（暖金灯光 + 层叠出檐）=====
// ===== 洪崖洞：崖壁上的吊脚楼群（暖金灯光，自江岸层层爬升）=====
export function generateHongya(heightFn, params){
  const g = new THREE.Group();
  g.name = 'hongya';
  const ax = 96;                    // 嘉陵江南岸崖壁
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a2e, roughness: 0.85 });
  const roofM = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.9 });
  const glow = new THREE.MeshStandardMaterial({
    color: 0xffb347, emissive: 0xffa030, emissiveIntensity: 1.8 * params.neon, roughness: 0.6,
  });

  const tiers = 5;
  for (let t = 0; t < tiers; t++){
    const bz = -72 + t * 7;                 // 由江岸向内陆爬升
    const by = heightFn.height(ax, bz);     // 贴地形
    const w = 46 - t * 3, d = 13;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 8, d), wood);
    body.position.set(ax, by + 1.5, bz);    // 下半嵌进崖体
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    const eave = new THREE.Mesh(new THREE.BoxGeometry(w + 4, 0.8, d + 5), roofM);
    eave.position.set(ax, by + 6.1, bz);
    eave.castShadow = true;
    g.add(eave);
    // 暖金灯带：江面侧与城内侧各一条
    for (const sd of [-1, 1]){
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w - 6, 1.5, 0.5), glow);
      strip.position.set(ax, by + 1.2, bz + sd * (d / 2 + 0.4));
      g.add(strip);
    }
    // 吊脚柱
    if (t > 0){
      for (let k = -2; k <= 2; k++){
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 9, 6), wood);
        col.position.set(ax + k * (w / 5), by - 4.5, bz - d / 2 + 1);
        g.add(col);
      }
    }
  }
  g.userData.glow = glow;
  return g;
}

export function generateMonument(heightFn, params){
  const g = new THREE.Group();
  g.name = 'monument';
  const mx = 30, mz = 0;
  const y = heightFn.height(mx, mz);

  const white = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.6 });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xd4a531, emissive: 0xffc860, emissiveIntensity: 1.4, roughness: 0.4, metalness: 0.6,
  });
  // 广场
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 1.2, 40),
    new THREE.MeshStandardMaterial({ color: 0x555a63, roughness: 0.9 }));
  plaza.position.set(mx, y + 0.4, mz);
  plaza.receiveShadow = true;
  g.add(plaza);
  // 碑体：八角柱身 + 细腰 + 顶亭
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.4, 30, 8), white);
  shaft.position.set(mx, y + 16, mz);
  shaft.castShadow = true;
  g.add(shaft);
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 3, 8), white);
  waist.position.set(mx, y + 32, mz);
  g.add(waist);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 6, 8), white);
  top.position.set(mx, y + 36.5, mz);
  top.castShadow = true;
  g.add(top);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 12), gold);
  beacon.position.set(mx, y + 40.5, mz);
  g.add(beacon);
  g.userData.glow = gold;
  return g;
}
