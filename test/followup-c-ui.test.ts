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
});

for (const [width, height] of [
  [360, 690],
  [1280, 800],
] as const) {
  it(`previews a held stroke and recovers full readings at ${width}`, async () => {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: true,
      isMobile: width === 360,
    });
    try {
      await page.clock.install();
      await page.goto(url);
      const game = newGame(7);
      const cells = [idx(18, SURF + 4), idx(19, SURF + 4)];
      for (const c of cells) {
        game.s.hill.kind[c] = K.rock;
        game.s.hill.chalk[c] = 0;
      }
      await page.evaluate(
        `(async () => {const {put}=await import('/src/ui/store.ts');await put('hill',${JSON.stringify(save(game))});})()`,
      );
      await page.reload();
      await page.locator('#cont').click();
      await page.clock.runFor(100);
      await page.locator('[data-tool="chalk"]').click();
      await page.clock.runFor(100);
      const point = async (x: number, y: number) =>
        page.evaluate<{ x: number; y: number }>(
          `(() => { const v=window.__warren.view,b=document.querySelector('#cv').getBoundingClientRect();return {x:b.x+(${x}+.5-v.x)*v.cs,y:b.y+(${y}+.5-v.y)*v.cs};})()`,
        );
      const a = await point(18, SURF + 4),
        b = await point(19, SURF + 4);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 5 });
      await page.clock.runFor(100);
      expect(await page.locator('#cell-title').innerText()).toBe('Plan preview');
      expect(await page.locator('#cell-words').innerText()).toMatch(/about six/);
      expect(await page.evaluate(`window.__warren.game.s.hill.chalk[${cells[0]}]`)).toBe(0);
      await page.screenshot({ path: `${shots}/after-${width}-drag-c.png` });
      const map = await page.locator('#cv').boundingBox();
      const tools = await page.locator('.tools').boundingBox();
      await page.mouse.up();
      await page.clock.runFor(100);
      expect(await page.evaluate(`window.__warren.game.s.hill.chalk[${cells[0]}]`)).toBe(1);
      await page.locator('[data-tool="look"]').click();
      await page.touchscreen.tap(b.x, b.y);
      await page.clock.runFor(100);
      expect(await page.locator('#cell-title').innerText()).toBe('Unbuilt plan');
      expect(await page.locator('#cell-words').innerText()).toMatch(/about six/);
      expect(await page.locator('#cv').boundingBox()).toEqual(map);
      expect(await page.locator('.tools').boundingBox()).toEqual(tools);
      await page.screenshot({ path: `${shots}/after-${width}-plan-c.png` });
      await page.locator('[data-tool="beds"]').click();
      const bedPoint = await point(18, SURF + 3);
      await page.mouse.move(bedPoint.x, bedPoint.y);
      await page.mouse.down();
      await page.clock.runFor(100);
      expect(await page.locator('#cell-words').innerText()).toMatch(/about three/);
      expect(await page.evaluate(`window.__warren.game.s.hill.use[${idx(18, SURF + 3)}]`)).not.toBe(USE.beds);
      await page.screenshot({ path: `${shots}/after-${width}-beds-drag-c.png` });
      await page.mouse.up();
      await page.clock.runFor(100);
      const reading = await page.locator('#cell-words').innerText();
      expect(reading).toContain('sleeping');
      expect(await page.locator('#cell-words').evaluate((e) => getComputedStyle(e).webkitLineClamp)).toBe(
        'none',
      );
      await page.screenshot({ path: `${shots}/after-${width}-reading-c.png` });
      await page.locator('#cellx').click();
      await page.evaluate(
        `window.__warren.game.s.notes.push({at:window.__warren.game.s.minute,kind:'raid',text:'A new warning replaces the journal preview.',weight:3})`,
      );
      await page.clock.runFor(100);
      await page.clock.runFor(300);
      expect(await page.locator('#ticker').innerText()).toContain('new warning');
      await page.getByRole('button', { name: 'Last reading', exact: true }).click();
      expect(await page.locator('#cell-words').innerText()).toBe(reading);
      const close = await page.locator('#cellx').boundingBox();
      expect((close?.y ?? height) + (close?.height ?? height)).toBeLessThan(height);
      expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      await page.screenshot({ path: `${shots}/after-${width}-reopened-c.png` });
    } finally {
      await page.close();
    }
  });
}

for (const [width, height] of [
  [360, 690],
  [1280, 800],
] as const) {
  it(`keeps live bell replies readable and explains expiry at ${width}`, async () => {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: true,
      isMobile: width === 360,
    });
    try {
      await page.clock.install();
      await page.goto(url);
      await page.locator('#new').click();
      await page.evaluate('window.__warren.setSpeed(0)');
      await page.clock.runFor(100);
      const map = await page.locator('#cv').boundingBox();
      const tools = await page.locator('.tools').boundingBox();
      await page.locator('#bell').click();
      await page.evaluate(`(() => {
        const s=window.__warren.game.s;
        for (const p of s.people) {
          s.answers.push({at:s.minute,who:p.id,verdict:'assented',says:'Fine.'});
          p.activity={action:'carve',affordance:{id:'carve',action:'carve',label:'carve the rolling stone',duration:90,effort:0.1,advertises:{}},startedAt:s.minute-20,endsAt:s.minute+90,reviewAt:s.minute+12};
          delete s.trips[p.id];
        }
      })()`);
      await page.clock.runFor(300);
      const words = page.locator('#cell-words');
      expect(await words.innerText()).toMatch(/six game hours.*Fine.*next choice/is);
      await words.evaluate((e) => {
        e.scrollTop = 90;
      });
      const scroll = await words.evaluate((e) => e.scrollTop);
      await page.evaluate('window.__warren.game.s.minute += 30');
      await page.clock.runFor(300);
      expect(await words.evaluate((e) => e.scrollTop)).toBe(scroll);
      expect(await page.locator('#cv').boundingBox()).toEqual(map);
      expect(await page.locator('.tools').boundingBox()).toEqual(tools);
      await page.screenshot({ path: `${shots}/after-${width}-bell-c.png` });
      await page.locator('#cellx').click();
      await page.evaluate(
        `(() => { const s=window.__warren.game.s; s.minute=s.bell.until; s.bell=null; })()`,
      );
      await page.getByRole('button', { name: 'Last reading', exact: true }).click();
      await page.clock.runFor(300);
      expect(await words.innerText()).toMatch(/Call ended.*six game hours elapsed/s);
      expect(await page.locator('#cv').boundingBox()).toEqual(map);
      expect(await page.locator('.tools').boundingBox()).toEqual(tools);
      await words.evaluate((e) => {
        e.scrollTop = 0;
      });
      await page.screenshot({ path: `${shots}/after-${width}-bell-ended-c.png` });
    } finally {
      await page.close();
    }
  });
}
