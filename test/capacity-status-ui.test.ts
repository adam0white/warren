import { mkdirSync } from 'node:fs';
import { type Browser, chromium } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { localHill } from './local-hill.ts';

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

for (const [width, height] of [
  [360, 690],
  [1280, 800],
] as const) {
  it(`shows the complete sleeping-place instruction at ${width}`, async () => {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await page.clock.install();
      await page.goto(url);
      await localHill(page);
      await page.locator('#cv').waitFor();
      await page.evaluate(`(async () => {
        const { idx, USE } = await import('/src/sim/grid.ts');
        const s = window.__warren.game.s;
        s.stats.dug = 3;
        s.hill.chalk.fill(0);
        s.hill.use.fill(USE.none);
        s.hill.use[idx(16, 9)] = USE.store;
        s.hill.grain[idx(16, 9)] = 60;
        s.hill.use[idx(18, 11)] = USE.beds;
        window.__warren.setSpeed(0);
      })()`);
      await page.clock.runFor(300);
      const goal = page.locator('#goal');
      expect(await goal.innerText()).toContain('The village needs more sleeping places.');
      const dimensions = await goal.evaluate((e) => ({ scroll: e.scrollHeight, client: e.clientHeight }));
      const shots = process.env.WARREN_BUG_SHOTS;
      if (shots) {
        mkdirSync(shots, { recursive: true });
        if (process.env.WARREN_SCREENSHOTS === '1')
          await page.screenshot({ path: `${shots}/status-${width}.png` });
      }
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
      expect(await goal.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    } finally {
      await page.close();
    }
  });
}
