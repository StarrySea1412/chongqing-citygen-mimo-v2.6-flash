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
    const extra = await page.evaluate(js);
    await page.evaluate(() => window.__CQ.frameStep(0.016));
    const r = await page.evaluate(SAMPLE);
    console.log(label, JSON.stringify(r), extra ? JSON.stringify(extra) : '');
  };
  // 1) 直渲：绕过 composer，材质照旧
  await step(`(() => {
    const C = window.__CQ;
    C.scene.fog = null; C.bloom.enabled = false;
    C.renderer.render(C.scene, C.camera);
    return 'direct-render-done';
  })()`, 'direct  ');
  // 2) 灯光拉满 50 倍
  await step(`(() => { const C = window.__CQ; C.hemi.intensity = 15; C.sun.intensity = 10; })()`, 'lights50');
  // 3) 相机位置加一个超强点光
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    const pl = new THREE.PointLight(0xffffff, 200000, 0, 2);
    pl.position.copy(C.camera.position);
    C.scene.add(pl);
    C.scene.userData._pl = pl;
    return 'pointlight added';
  })()`, 'pointlit');
  // 4) 灯复位
  await step(`(() => {
    const C = window.__CQ;
    C.hemi.intensity = 0.297; C.sun.intensity = 0.2;
    if (C.scene.userData._pl) C.scene.remove(C.scene.userData._pl);
  })()`, 'reset   ');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
