const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://127.0.0.1:8778/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const r = await page.evaluate(() => {
    const c = document.getElementById('viewport');
    const cs = getComputedStyle(c);
    return {
      clientWH: [c.clientWidth, c.clientHeight],
      rect: c.getBoundingClientRect().toJSON(),
      computed: { position: cs.position, display: cs.display, inset: cs.top + '/' + cs.left, width: cs.width, height: cs.height },
      sheets: [...document.styleSheets].map(s => ({
        href: (s.href || '').split('/').pop(),
        rules: (() => { try { return s.cssRules.length; } catch (e) { return 'blocked'; } })(),
      })),
      innerWH: [innerWidth, innerHeight],
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
