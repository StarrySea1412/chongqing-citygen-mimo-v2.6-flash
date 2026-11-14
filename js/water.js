import * as THREE from 'three';

// 江面：三段河道各一条带状水面（贴合折线走向），微波 + 夜景反光
export function generateWater(heightFn){
  const g = new THREE.Group();
  g.name = 'water';
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0e2c33, roughness: 0.15, metalness: 0.65,
    emissive: 0x07181d, emissiveIntensity: 0.9,
    transparent: true, opacity: 0.96,
  });
  const rivers = heightFn.rivers;
  const R = heightFn.bankR + 6;
  for (const key of ['jialing', 'yangtze', 'changjiang']){
    const pts = rivers[key];
    for (let i = 0; i < pts.length - 1; i++){
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const geo = new THREE.PlaneGeometry(len + R, R * 2, 1, 1);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x1 + x2) / 2, 0.25, (z1 + z2) / 2);
      m.rotation.z = -Math.atan2(z2 - z1, x2 - x1);
      g.add(m);
    }
  }
  g.userData.mat = mat;
  return g;
}
