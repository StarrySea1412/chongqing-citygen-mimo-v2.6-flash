const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.goto('http://127.0.0.1:8778/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const r = await page.evaluate(() => {
    const C = window.__CQ;
    const hf = C.W.hf;
    const P = C.P;
    // 复刻 buildings.js 的选点循环
    let nan = 0, ok = 0, samples = [];
    const GRID = P.block, HALF = Math.floor(430 * P.citySize);
    for (let gx = -HALF; gx <= HALF; gx += GRID){
      for (let gz = -HALF; gz <= HALF; gz += GRID){
        const x = gx, z = gz;
        const d = hf.riverDist(x, z);
        const y = hf.height(x, z);
        if (!isFinite(y) || !isFinite(d)){
          nan++;
          if (samples.length < 8) samples.push({ x, z, d: String(d), y: String(y) });
        } else ok++;
      }
    }
    // 也查矩阵 NaN 总数
    let nanM = 0, tot = 0;
    for (const o of C.W.buildings.group.children){
      if (!o.isInstancedMesh) continue;
      tot += o.count;
      const a = o.instanceMatrix.array;
      for (let i = 0; i < a.length; i++) if (!isFinite(a[i])) nanM++;
    }
    return { nan, ok, samples, nanMatrixElems: nanM, totalInstances: tot };
  });
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
