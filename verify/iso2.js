const { chromium } = require('playwright-core');
const SAMPLE = `(() => {
  const c = document.getElementById('viewport');
  const t = document.createElement('canvas');
  t.width = 96; t.height = 40;
  const g = t.getContext('2d');
  g.drawImage(c, 0, 0, 96, 40);
  const d = g.getImageData(0, 0, 96, 40).data;
  let sum = 0, dark = 0, bright = 0;
  for (let i = 0; i < d.length; i += 4){
    const lum = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
    sum += lum;
    if (lum < 10) dark++;
    if (lum > 200) bright++;
  }
  return { avg: +(sum/(d.length/4)).toFixed(1), dark, bright };
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
    await page.evaluate(js);
    await page.evaluate(() => window.__CQ.frameStep(0.016));
    const r = await page.evaluate(SAMPLE);
    console.log(label, JSON.stringify(r));
  };
  // 1) 白模：不受光照影响 → 测管线
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    C.scene.fog = null; C.bloom.enabled = false;
    C.scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  })()`, 'white-mat');
  // 2) 红模近景
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    C.scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    C.camera.position.set(0, 120, 300); C.controls.target.set(0, 20, 0);
  })()`, 'red-close');
  // 3) 撤销白模，恢复标准材质但白模改用 MeshBasic 白（只针对楼）看 UV/emissive 通路
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    C.scene.overrideMaterial = null;
    C.W.buildings.winMats.forEach(m => { m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = 2.0; m.color = new THREE.Color(0x111111); });
    C.hemi.intensity = 0.1; C.sun.intensity = 0.05;
  })()`, 'win-self ');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
