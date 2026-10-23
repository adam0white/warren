import { type Browser, chromium } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';

let server: ViteDevServer;
let browser: Browser;
let url: string;
beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? '';
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

for (const width of [360, 1280]) {
  it(`acknowledges store and lamp without holding play at ${width}`, async () => {
    const page = await browser.newPage({ viewport: { width, height: width === 360 ? 690 : 800 } });
    try {
      await page.clock.install();
      await page.goto(url);
      await page.locator('#new').click();
      await page.locator('#cv').waitFor();
      await page.clock.runFor(300);
      const point = await page.evaluate<{ x: number; y: number }>(`(async () => {
        const d = window.__warren;
        const {idx,SURF,USE,xOf,yOf}=await import('/src/sim/grid.ts');
        const s=d.game.s, c=idx(s.hill.surface.entrance-1,SURF+3);
        s.hill.use[c]=USE.none; s.hill.lamp[c]=0; s.hill.lampsSpare=2;
        const v=d.view,b=document.querySelector('#cv').getBoundingClientRect();
        return {x:b.x+(xOf(c)+.5-v.x)*v.cs,y:b.y+(yOf(c)+.5-v.y)*v.cs};
      })()`);
      for (const tool of ['store', 'lamp']) {
        await page.locator('#furnish').click();
        await page.locator(`[data-tool=${tool}]`).click();
        await page.mouse.click(point.x, point.y);
        await page.clock.runFor(300);
        expect(await page.locator('#cell-detail').isVisible()).toBe(false);
        expect(await page.locator('#event-sentence').innerText()).toContain(
          tool === 'store' ? 'Store marked' : 'Lamp hung',
        );
        const before = await page.evaluate<number>(`window.__warren.game.s.minute`);
        await page.clock.runFor(8000);
        const after = await page.evaluate<number>(`window.__warren.game.s.minute`);
        expect(after).toBeGreaterThan(before);
        await page.locator('#last-reading').click();
        expect(await page.locator('#cell-words').innerText()).toContain(
          tool === 'store' ? 'Store marked' : 'Lamp hung',
        );
        await page.locator('#cellx').click();
      }
      await page.locator('#bell').click();
      expect(await page.locator('#cell-words').innerText()).toContain('No smoke or riders in sight.');
    } finally {
      await page.close();
    }
  }, 20000);
}
