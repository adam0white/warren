import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Browser, chromium } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act, newGame, save } from '../src/sim/game.ts';
import { idx, SURF, USE } from '../src/sim/grid.ts';

let server: ViteDevServer;
let browser: Browser;
let url: string;
const shots =
  process.platform === 'darwin'
    ? '/Users/abdul/code/.lab-scratch/design-round/warren-shots'
    : join(tmpdir(), 'warren-design-shots');
beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? '';
  browser = await chromium.launch();
  mkdirSync(shots, { recursive: true });
}, 60000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60000);

describe('safety before calling people below', () => {
  for (const [width, height] of [
    [360, 690],
    [1280, 800],
  ] as const) {
    it(`keeps live bed inspection and bell meaning visible at ${width}`, async () => {
      const page = await browser.newPage({
        viewport: { width, height },
        hasTouch: true,
        isMobile: width === 360,
      });
      try {
        await page.clock.install();
        await page.goto(url);
        const g = newGame(7);
        const bed = idx(18, SURF + 3);
        act(g, { verb: 'use', cells: [bed], use: 'beds' });
        g.s.pos.hasan = bed;
        g.s.trips = {};
        await page.evaluate(
          `(async () => {const {put} = await import('/src/ui/store.ts'); await put('hill', ${JSON.stringify(save(g))});})()`,
        );
        await page.reload();
        await page.locator('#cont').click();
        await page.clock.runFor(100);
        expect(await page.locator('#bell-meaning').innerText()).toContain('Sleeping places');
        expect(await page.locator('#bell-meaning').innerText()).toContain('Bell quiet');
        const point = await page.evaluate<{ x: number; y: number }>(
          `(() => { const v=window.__warren.view; const b=document.querySelector('#cv').getBoundingClientRect(); return {x:b.x+(18.5-v.x)*v.cs,y:b.y+(${SURF}+3.5-v.y)*v.cs}; })()`,
        );
        await page.touchscreen.tap(point.x, point.y);
        await page.clock.runFor(100);
        expect(await page.locator('#cell-title').innerText()).toBe('Sleeping room');
        expect(await page.locator('#cell-words').innerText()).toContain('riders');
        expect(await page.locator('#card').isVisible()).toBe(false);
        const close = await page.locator('#cellx').boundingBox();
        expect((close?.y ?? height) + (close?.height ?? height)).toBeLessThan(height);
        await page.screenshot({ path: `${shots}/after-${width}-room.png` });
        await page.locator('#cellx').click();
        // Selecting Door fixes the working view, as it does for a keeper placing a door.
        await page.locator('[data-tool="door"]').tap();
        await page.evaluate(`(() => {
          const s=window.__warren.game.s;
          s.hill.use[${idx(18, SURF + 2)}]=${USE.door};
          s.hill.doorWork[${idx(18, SURF + 2)}]=0;
          for (const p of s.people) s.pos[p.id]=${idx(17, SURF + 3)};
          s.trips={};
        })()`);
        await page.clock.runFor(100);
        const doorPoint = await page.evaluate<{ x: number; y: number }>(
          `(() => {const v=window.__warren.view;const b=document.querySelector('#cv').getBoundingClientRect();return {x:b.x+(18.5-v.x)*v.cs,y:b.y+(${SURF}+2.5-v.y)*v.cs};})()`,
        );
        await page.touchscreen.tap(doorPoint.x, doorPoint.y);
        await page.clock.runFor(100);
        const words = page.locator('#cell-words');
        expect(await words.innerText()).toContain('Nearby adults:');
        expect(await words.innerText()).toContain('Hasan:');
        if (width === 360) {
          expect(await words.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
          await words.evaluate((e) => {
            e.scrollTop = e.scrollHeight;
          });
          expect(await words.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
        }
        await page.screenshot({ path: `${shots}/after-${width}-door.png` });
        await page.locator('#cellx').click();
        await page.locator('#bell').click();
        await page.clock.runFor(100);
        expect(await page.locator('#bell-meaning').innerText()).toContain('Call active');
        await page.screenshot({ path: `${shots}/after-${width}.png` });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      } finally {
        await page.close();
      }
    });
  }
});
