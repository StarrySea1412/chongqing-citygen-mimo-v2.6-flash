import { makeNoise } from './rng.js?v=14';

// 世界尺寸（米为单位的世界坐标）
export const WORLD = 900;
export const HALF = WORLD / 2;
export const WATER_Y = 0;

// 两江参数曲线：嘉陵江（北）、长江（南）在朝天门汇合后称长江出城
export function buildRivers(){
  return {
    jialing: [
      [-HALF, -235], [-240, -215], [-90, -195], [60, -160],
      [180, -110], [268, -62], [318, -30],
    ],
    yangtze: [
      [-HALF, 255], [-250, 238], [-90, 215], [70, 175],
      [190, 118], [272, 58], [318, -30],
    ],
    changjiang: [
      [318, -30], [400, -78], [HALF, -135],
    ],
  };
}

function distToPolyline(x, z, pts){
  let min = 1e9;
  for (let i = 0; i < pts.length - 1; i++){
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const t = Math.max(0, Math.min(1,
      ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz || 1e-9)));
    const ex = x1 + t * dx - x, ez = z1 + t * dz - z;
    const d = Math.hypot(ex, ez);
    if (d < min) min = d;
  }
  return min;
}

// 河道半宽（含河岸缓冲）
export const RIVER_R = 46;

function smoothstep(a, b, x){
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function makeHeightFn(seed, rugged, terraceAmt, riverW){
  const { fbm } = makeNoise(seed);
  const rivers = buildRivers();

  function riverDist(x, z){
    return Math.min(
      distToPolyline(x, z, rivers.jialing),
      distToPolyline(x, z, rivers.yangtze),
      distToPolyline(x, z, rivers.changjiang),
    );
  }

  // 重庆：山脊基底 + 台地高差 + 江岸陡坡切入水面以下
  function height(x, z){
    // 1) 基础山形：中部（母城山脊）高、边缘低
    const dCenter = Math.hypot(x, z) / HALF;
    let h = 16 + 30 * fbm(x * 0.0022, z * 0.0022, 5) * rugged;
    h += (1 - Math.min(1, dCenter)) * 20;
    h += fbm(x * 0.006 + 9, z * 0.006 - 4, 3) * 10 * rugged;
    h = Math.max(h, 2.5);              // 陆地不产生零星湖泊

    // 2) 台地：量化成梯田状平台（坡坎坎）
    const step = 9;
    const terraced = Math.round(h / step) * step;
    h = h * (1 - terraceAmt * 0.7) + terraced * (terraceAmt * 0.7);

    // 3) 江岸陡坡切入：smoothstep 保证河床在水面以下、岸坡自然抬起
    const d = riverDist(x, z);
    const bankW = RIVER_R * riverW;
    const t = smoothstep(bankW, bankW + 55, d);   // 0=江心 1=岸上
    const riverBed = -7 + 3 * (d / (bankW + 55)); // 江心 -7 → 岸线渐升
    h = riverBed * (1 - t) + h * t;
    return h;
  }

  return { height, riverDist, rivers, bankR: RIVER_R };
}
