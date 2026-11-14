import * as THREE from 'three';
import { WORLD, WATER_Y } from './terrain.js?v=14';

// 地形网格：按 heightFn 采样顶点色（岩壁/植被/江岸）
export function generateTerrainMesh(heightFn, seed){
  const SEG = 180;
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  // Color 构造会把 hex 转 linear，这里补偿约 2.8 倍保持视觉亮度
  const cRock = new THREE.Color(0xa89f90);
  const cGreen = new THREE.Color(0x6f8a64);
  const cBank = new THREE.Color(0xbcae8b);
  const cDeep = new THREE.Color(0x3a4a56);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++){
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightFn.height(x, z);
    pos.setY(i, h);
    // 坡度（有限差分）→ 陡坡露岩
    const e = 4;
    const dh = Math.abs(heightFn.height(x + e, z) - h) + Math.abs(heightFn.height(x, z + e) - h);
    const slope = dh / e;
    if (h < WATER_Y + 1) tmp.copy(cDeep);
    else if (h < 3.5) tmp.copy(cBank);
    else {
      const veg = Math.max(0, 1 - slope * 1.6);
      tmp.copy(cRock).lerp(cGreen, veg * 0.75);
      tmp.lerp(cBank, Math.max(0, 0.4 - h * 0.02));
    }
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0.02,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
