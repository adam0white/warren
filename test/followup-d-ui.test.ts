import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Browser, chromium } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { newGame, save } from '../src/sim/game.ts';
import { idx, K, SURF, USE } from '../src/sim/grid.ts';

let server: ViteDevServer;
let browser: Browser;
let url: string;
const shots =
  process.platform === 'darwin'
    ? '/Users/abdul/code/.lab-scratch/patterns/warren-shots/regression'
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

for (const [width, height] of [
  [360, 690],
  [1280, 800],
] as const) {
  it(`renders one standing raid call and truthful door cost at ${width}`, { timeout: 20000 }, async () => {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: true,
      isMobile: width === 360,
    });
    page.setDefaultTimeout(20000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.clock.install();
      await page.goto(url);
      const game = newGame(7);
      const x = game.s.hill.surface.entrance;
      const door = idx(x, SURF + 2);
      game.s.hill.kind[door] = K.open;
      game.s.hill.use[door] = USE.door;
      game.s.hill.doorWork[door] = 0;
      game.s.hill.lamp[door] = 1;
      await page.evaluate(
        `(async () => {const {put}=await import('/src/ui/store.ts');await put('hill',${JSON.stringify(save(game))});})()`,
      );
      await page.reload();
      await page.locator('#cont').click();
      await page.evaluate('window.__warren.setSpeed(0)');
      await page.clock.runFor(300);
      await page.locator('[data-tool="look"]').click();
      const point = await page.evaluate<{ x: number; y: number }>(
        `(() => {const v=window.__warren.view,b=document.querySelector('#cv').getBoundingClientRect();return {x:b.x+(${x}+.5-v.x)*v.cs,y:b.y+(${SURF + 2}+.5-v.y)*v.cs};})()`,
      );
      await page.touchscreen.tap(point.x, point.y);
      await page.clock.runFor(300);
      const words = page.locator('#cell-words');
      const doorWords = await words.innerText();
      expect(doorWords).toMatch(/quiet-time call.*six game hours/is);
      expect(doorWords).toMatch(/false alarm.*trust/is);
      expect(doorWords.indexOf('Ring the bell')).toBeLessThan(doorWords.toLowerCase().indexOf('false alarm'));
      await page.screenshot({ path: `${shots}/after-${width}-quiet-door-d.png` });
      expect(await words.evaluate((e) => e.scrollHeight <= e.clientHeight)).toBe(true);
      const assertStage = async () => {
        const map = await page.locator('#cv').boundingBox();
        const detail = await page.locator('#cell-detail').boundingBox();
        const tools = await page.locator('.tools').boundingBox();
        if (!map || !detail || !tools) throw new Error('Missing scene, reading or tools');
        expect(map.height).toBeGreaterThanOrEqual(120);
        expect(detail.y >= map.y + map.height || detail.x >= map.x + map.width).toBe(true);
        expect(tools.y + tools.height).toBeLessThanOrEqual(height);
        expect(tools.x).toBeGreaterThanOrEqual(0);
        expect(tools.x + tools.width).toBeLessThanOrEqual(width);
      };
      await assertStage();
      const advanceTo = async (target: string) => {
        await page.evaluate(
          `(async () => {const {advance}=await import('/src/sim/game.ts');const g=window.__warren.game;advance(g,${target});})()`,
        );
        await page.clock.runFor(300);
      };
      await advanceTo('g.s.raids[0].smoke');
      expect(await page.locator('#goal').innerText()).toMatch(/Smoke.*Ring the bell once.*all-clear/s);
      await page.locator('#bell').click();
      await page.clock.runFor(300);
      expect(await words.innerText()).toMatch(/Call active until the all-clear.*may refuse throughout/s);
      expect(await words.innerText()).not.toMatch(/renew|six game hours/);
      await page.screenshot({ path: `${shots}/after-${width}-smoke-call-d.png` });
      await advanceTo('g.s.bell.at + 7 * 60');
      expect(await words.innerText()).toContain('Call active until the all-clear');
      expect(await page.locator('#bell-meaning').innerText()).not.toMatch(/renew|six game hours/);
      const before = await page.evaluate(
        `(async () => {const {fingerprint}=await import('/src/sim/game.ts');return fingerprint(window.__warren.game.s);})()`,
      );
      const bell = await page.locator('#bell').boundingBox();
      if (!bell) throw new Error('Missing bell button');
      // The ringing bell animates; tap its visible centre as a touch user would.
      await page.touchscreen.tap(bell.x + bell.width / 2, bell.y + bell.height / 2);
      await page.clock.runFor(300);
      expect(
        await page.evaluate(
          `(async () => {const {fingerprint}=await import('/src/sim/game.ts');return fingerprint(window.__warren.game.s);})()`,
        ),
      ).toBe(before);
      expect(await page.evaluate('window.__warren.game.inputs.filter(i=>i.verb==="bell").length')).toBe(1);
      await assertStage();
      await words.evaluate((e) => {
        e.scrollTop = 0;
      });
      await page.screenshot({ path: `${shots}/after-${width}-standing-call-d.png` });
      await advanceTo('g.s.raids[0].riders');
      expect(await page.locator('#goal').innerText()).toMatch(
        /Riders are at the hill.*Call active until the all-clear/s,
      );
      await advanceTo('g.s.raids[0].leave');
      expect(await words.innerText()).toMatch(/Call ended.*all-clear ended the call/s);
      expect(await words.innerText()).not.toMatch(/renew|six game hours elapsed/);
      await words.evaluate((e) => {
        e.scrollTop = 0;
      });
      await page.screenshot({ path: `${shots}/after-${width}-all-clear-d.png` });
      await advanceTo('g.s.raids[1].smoke');
      expect(await words.innerText()).toMatch(/No call active.*Ring the bell once.*all-clear/s);
      expect(await words.innerText()).not.toMatch(/riders have gone|ended the call|renew/i);
      expect(await page.locator('#goal').innerText()).toMatch(/Smoke.*No call active.*Ring the bell once/s);
      await assertStage();
      expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      const close = await page.locator('#cellx').boundingBox();
      expect((close?.y ?? height) + (close?.height ?? height)).toBeLessThan(height);
      await page.screenshot({ path: `${shots}/after-${width}-next-warning-d.png` });
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });
}
