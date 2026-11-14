const { chromium } = require('playwright-core');
const SAMPLE = `(() => {
  const c = document.getElementById('viewport');
  const t = document.createElement('canvas');
  t.width = 96; t.height = 40;
  const g = t.getContext('2d');
  g.drawImage(c, 0, 0, 96, 40);
  const d = g.getImageData(0, 0, 96, 40).data;
  let sum = 0, dark = 0, bright = 0, warm = 0;
  for (let i = 0; i < d.length; i += 4){
    const lum = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
    sum += lum;
    if (lum < 10) dark++;
    if (lum > 200) bright++;
    if (lum > 40 && d[i] > d[i+2] + 30) warm++;
  }
  return { avg: +(sum/(d.length/4)).toFixed(1), dark, bright, warm };
})()`;
(async () => {
  const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.goto('http://127.0.0.1:8778/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const step = async (js, label) => {
    const info = await page.evaluate(js);
    await page.evaluate(() => window.__CQ.frameStep(0.016));
    const r = await page.evaluate(SAMPLE);
    console.log(label, JSON.stringify(r), info !== undefined && typeof info === 'object' ? JSON.stringify(info) : '');
  };
  // 0) 基线：现有楼群 + 单一标准材质（白 emissive 5）
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    C.scene.fog = null; C.bloom.enabled = false;
    C.hemi.intensity = 1.5; C.sun.intensity = 0.4;
    C.W.buildings.group.children.forEach(o => {
      if (o.isInstancedMesh){ o.castShadow = false; o.receiveShadow = false;
        o.material = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 5 }); }
    });
  })()`, '0-exist-emis5  ');
  // 1) 现有楼群关 frustumCulled
  await step(`(() => {
    const C = window.__CQ;
    C.W.buildings.group.children.forEach(o => { if (o.isInstancedMesh) o.frustumCulled = false; });
  })()`, '1-nocull        ');
  // 2) 读取 instanceMatrix 检查数值是否正常
  const info = await page.evaluate(() => {
    const C = window.__CQ;
    const im = C.W.buildings.group.children.find(o => o.isInstancedMesh);
    const m = new (im.instanceMatrix.array.constructor === Float32Array ? Float32Array : Float32Array)(16);
    const arr = im.instanceMatrix.array;
    return { count: im.count, first16: Array.from(arr.slice(0, 16)).map(v => +v.toFixed(2)),
      matType: im.instanceMatrix.array.constructor.name, itemSize: im.instanceMatrix.itemSize };
  });
  console.log('instanceMatrix info:', JSON.stringify(info));
  // 3) 按真实数据重建：新 InstancedMesh（拷贝矩阵），单材质 emissive 5
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    const src = C.W.buildings.group.children.filter(o => o.isInstancedMesh);
    const mat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 5 });
    const g = new THREE.BoxGeometry(1, 1, 1);
    const total = src.reduce((a, o) => a + o.count, 0);
    const dst = new THREE.InstancedMesh(g, mat, total);
    let k = 0;
    const M = new THREE.Matrix4();
    for (const o of src){
      for (let i = 0; i < o.count; i++){
        o.getMatrixAt(i, M);
        dst.setMatrixAt(k++, M);
      }
    }
    dst.instanceMatrix.needsUpdate = true;
    dst.castShadow = false;
    dst.name = 'rebuiltBuildings';
    src.forEach(o => o.visible = false);
    C.W.group.add(dst);
    return { total };
  })()`, '3-rebuilt-emis5 ');
  // 4) 重建版 + emissiveMap 窗光 2.2 + 真实彩色材质
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    const dst = C.W.group.getObjectByName('rebuiltBuildings');
    const winTex = C.W.buildings.winMats[0].emissiveMap;
    dst.material = new THREE.MeshStandardMaterial({ color: 0x8a8f99, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 2.2 });
  })()`, '4-rebuilt-window');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
