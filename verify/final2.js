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
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    C.scene.fog = null; C.bloom.enabled = false;
    C.hemi.intensity = 1.5; C.sun.intensity = 0.4;
    // A: 楼群关掉 castShadow（Standard 材质保留）
    C.W.buildings.group.children.forEach(o => {
      if (o.isInstancedMesh){ o.castShadow = false; o.receiveShadow = false;
        o.material = new THREE.MeshStandardMaterial({ color: 0x999999, emissive: 0xffaa33, emissiveIntensity: 2.0 }); }
    });
    return 'no-shadow';
  })()`, 'A-noshadow-std ');
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    // B: 普通 Mesh + standard emissive + castShadow=true（对照立方体，带投影）
    let cube = C.scene.getObjectByName('debugCube');
    if (!cube){
      cube = new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 5 }));
      cube.position.set(0, 40, 150); cube.name = 'debugCube';
      C.scene.add(cube);
      C.camera.position.set(0, 40, 300); C.camera.lookAt(0, 40, 150); C.controls.target.set(0, 40, 150);
    }
    cube.castShadow = true; cube.receiveShadow = true;
    return 'cube-shadow-on';
  })()`, 'B-cube-shadow  ');
  await step(`(async () => {
    const THREE = await import('three');
    const C = window.__CQ;
    // C: 单实例 InstancedMesh + standard emissive + castShadow=false
    let ic = C.scene.getObjectByName('debugInst');
    if (!ic){
      const g = new THREE.BoxGeometry(40, 40, 40);
      ic = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 5 }), 1);
      ic.setMatrixAt(0, new THREE.Matrix4().setPosition(-100, 40, 150));
      ic.name = 'debugInst';
      C.scene.add(ic);
    }
    ic.castShadow = false;
    return 'inst-noshadow';
  })()`, 'C-inst-noshadow');
  await step(`(async () => {
    const C = window.__CQ;
    const ic = C.scene.getObjectByName('debugInst');
    ic.castShadow = true;
    return 'inst-shadow';
  })()`, 'D-inst-shadow  ');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
