// 可复现随机数：seed → mulberry32
export function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class Rng {
  constructor(seed){ this.next = mulberry32(seed); }
  f(min = 0, max = 1){ return min + this.next() * (max - min); }
  i(min, max){ return Math.floor(this.f(min, max + 1)); }
  pick(arr){ return arr[Math.floor(this.next() * arr.length)]; }
  chance(p){ return this.next() < p; }
}

// 2D 值噪声 + fbm（用于地形）
export function makeNoise(seed){
  const perm = new Uint8Array(512);
  const r = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--){
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => {
    switch (h & 7){
      case 0: return  x + y; case 1: return  x - y;
      case 2: return -x + y; case 3: return -x - y;
      case 4: return  x;     case 5: return -x;
      case 6: return  y;     default: return -y;
    }
  };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  function noise2(x, y){
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    return (
      (1 - v) * ((1 - u) * grad(perm[a], x, y)     + u * grad(perm[b], x - 1, y)) +
      v       * ((1 - u) * grad(perm[a + 1], x, y - 1) + u * grad(perm[b + 1], x - 1, y - 1))
    ) * 0.7;
  }
  function fbm(x, y, oct = 4, lac = 2.0, gain = 0.5){
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++){
      sum += amp * noise2(x * freq, y * freq);
      norm += amp; amp *= gain; freq *= lac;
    }
    return sum / norm;
  }
  return { noise2, fbm };
}
