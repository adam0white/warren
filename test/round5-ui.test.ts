import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Browser, chromium, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newGame, save } from '../src/sim/game.ts';
import { idx, K, SURF, USE } from '../src/sim/grid.ts';

let server: ViteDevServer;
let browser: Browser;
let url: string;
const evidence =
  process.platform === 'darwin'
    ? '/Users/abdul/code/.lab-scratch/design-round/warren-shots/round5-regression'
    : join(tmpdir(), 'warren-round5-shots');
beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? '';
  browser = await chromium.launch();
  mkdirSync(evidence, { recursive: true });
}, 60000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60000);
async function enter(width = 360, height = 690) {
  const page = await browser.newPage({
    viewport: { width, height },
    hasTouch: true,
    isMobile: width === 360,
  });
  await page.clock.install();
  await page.goto(url);
  await page.locator('#new').waitFor();
  await page.evaluate(
    `(async () => { const {put} = await import('/src/ui/store.ts'); await put('hill', ${JSON.stringify(save(newGame(7)))}); })()`,
  );
  await page.reload();
  await page.locator('#cont').click();
  await page.clock.runFor(300);
  return page;
}
async function point(page: Page, x: number, y: number) {
  return page.evaluate<{ x: number; y: number }>(
    `(() => {const v=window.__warren.view;const b=document.querySelector('#cv').getBoundingClientRect();return {x:b.x+(${x}+.5-v.x)*v.cs,y:b.y+(${y}+.5-v.y)*v.cs};})()`,
  );
}

describe('round five phone building', () => {
  for (const [width, height] of [
    [360, 690],
    [1280, 800],
  ] as const) {
    it(`places small cells with labelled zoom and keeps the working cell stable at ${width}`, async () => {
      const page = await enter(width, height);
      try {
        await page.locator('[data-tool="beds"]').tap();
        await page.getByRole('button', { name: 'Zoom in', exact: true }).tap();
        await page.getByRole('button', { name: 'Zoom in', exact: true }).tap();
        const size = await page.evaluate<number>('window.__warren.view.cs');
        expect(size).toBeGreaterThanOrEqual(44);
        const cell = await point(page, 18, SURF + 3);
        const canvas = await page.locator('#cv').boundingBox();
        expect(cell.y).toBeGreaterThan((canvas?.y ?? 0) + 44);
        expect(cell.y).toBeLessThan((canvas?.y ?? 0) + (canvas?.height ?? 0));
        await page.touchscreen.tap(cell.x, cell.y);
        await page.clock.runFor(300);
        expect(await page.evaluate<number>(`window.__warren.game.s.hill.use[${idx(18, SURF + 3)}]`)).toBe(
          USE.beds,
        );
        await page.evaluate(
          `(() => {const s=window.__warren.game.s;for(let y=12;y<26;y++)s.hill.kind[y*34+18]=${K.open};s.version++;})()`,
        );
        await page.locator('[data-tool="chalk"]').tap();
        await page.clock.runFor(1000);
        const after = await point(page, 18, SURF + 3);
        expect(after.x).toBeCloseTo(cell.x, 3);
        expect(after.y).toBeCloseTo(cell.y, 3);
        const chalk = await point(page, 20, SURF + 3);
        await page.touchscreen.tap(chalk.x, chalk.y);
        await page.clock.runFor(100);
        expect(await page.evaluate<number>(`window.__warren.game.s.hill.chalk[${idx(20, SURF + 3)}]`)).toBe(
          1,
        );
        await page.screenshot({ path: `${evidence}/round5-after-${width}-zoom.png` });
        await page.getByRole('button', { name: 'Fit hill', exact: true }).tap();
        expect(await page.evaluate<number>('window.__warren.view.cs')).toBeLessThan(size);
      } finally {
        await page.close();
      }
    });
  }
  it('keeps shelter reachable during a pending raid and scrolls its live list by wheel and native touch', async () => {
    const page = await enter();
    try {
      await page.evaluate(`window.__warren.game.s.raids[0].stage='smoke'`);
      await page.clock.runFor(300);
      const summary = page.locator('#shelter-brief');
      expect(await summary.innerText()).toMatch(/Sleeping.*exposed/);
      await summary.tap();
      const body = page.locator('#sheet-body');
      const bounds = await body.boundingBox();
      expect(bounds).not.toBeNull();
      const minute = await page.evaluate<number>('window.__warren.game.s.minute');
      await page.mouse.move(180, (bounds?.y ?? 0) + 100);
      await page.mouse.wheel(0, 350);
      await page.clock.runFor(1200);
      expect(await body.evaluate((e) => e.scrollTop)).toBeGreaterThan(100);
      const before = await body.evaluate((e) => e.scrollTop);
      await page.clock.runFor(1000);
      expect(await body.evaluate((e) => e.scrollTop)).toBeGreaterThanOrEqual(before - 2);
      await body.evaluate((e) => {
        e.scrollTop = 0;
      });
      const cdp = await page.context().newCDPSession(page);
      const y = Math.min(620, (bounds?.y ?? 0) + (bounds?.height ?? 0) - 40);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y }] });
      for (let k = 1; k <= 8; k++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: 180, y: y - k * 35 }],
        });
        await page.clock.runFor(40);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.clock.runFor(1200);
      expect(await body.evaluate((e) => e.scrollTop)).toBeGreaterThan(100);
      await page.screenshot({ path: `${evidence}/round5-after-360-shelter-touch.png` });
      await page.clock.runFor(32000);
      expect(await page.evaluate<number>('window.__warren.game.s.minute')).toBeGreaterThan(minute);
      const close = await page.locator('#bookx').boundingBox();
      expect((close?.y ?? 999) + (close?.height ?? 0)).toBeLessThan(690);
      await page.locator('#bookx').tap();
      expect(await page.locator('#drawer').isVisible()).toBe(false);
    } finally {
      await page.close();
    }
  });
  it('shows the full rolled-back door response for Look and Door', async () => {
    const page = await enter();
    try {
      await page.evaluate(
        `(() => {const s=window.__warren.game.s;s.hill.use[${idx(17, SURF + 2)}]=${USE.door};s.hill.doorWork[${idx(17, SURF + 2)}]=0;})()`,
      );
      for (const tool of ['look', 'door']) {
        await page.locator(`[data-tool="${tool}"]`).tap();
        const cell = await point(page, 17, SURF + 2);
        await page.touchscreen.tap(cell.x, cell.y);
        await page.clock.runFor(300);
        expect(await page.locator('#cell-detail').innerText()).toContain('Ring the bell');
        expect(await page.locator('#cell-detail').innerText()).toContain('choose');
        await page.screenshot({ path: `${evidence}/round5-after-360-door-${tool}.png` });
        const scene = await page.locator('#cv').boundingBox();
        if (!scene) throw new Error('No scene');
        // Native tap on the uncovered canvas edge starts another inspection.
        await page.touchscreen.tap(scene.x + 4, scene.y + scene.height - 4);
        await page.clock.runFor(300);
        expect(await page.locator('#cell-title').innerText()).not.toBe('Stone door');
        expect(await page.locator('#cell-words').innerText()).not.toContain('Nearby adults:');
      }
    } finally {
      await page.close();
    }
  });
});
