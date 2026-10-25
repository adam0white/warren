import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Browser, chromium } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act, newGame, save } from '../src/sim/game.ts';
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

describe('safety before calling people below', () => {
  for (const [width, height] of [
    [360, 690],
    [1280, 800],
  ] as const) {
    for (const theme of ['light', 'dark'] as const) {
      it(`keeps the inspected room visible and previews off the map at ${width} in ${theme}`, {
        timeout: 20000,
      }, async () => {
        const page = await browser.newPage({
          viewport: { width, height },
          colorScheme: theme,
          hasTouch: true,
          isMobile: width === 360,
        });
        page.setDefaultTimeout(6000);
        try {
          await page.addInitScript(`(() => {
          window.drawnWords = [];
          const fill = CanvasRenderingContext2D.prototype.fillText;
          CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
            window.drawnWords.push(text);
            return fill.call(this, text, ...args);
          };
        })()`);
          await page.clock.install();
          await page.goto(url);
          const g = newGame(7);
          const bed = idx(18, SURF + 3);
          act(g, { verb: 'use', cells: [bed], use: 'beds' });
          g.s.pos.meryem = bed;
          g.s.trips = {};
          await page.evaluate(
            `(async () => {const {put} = await import('/src/ui/store.ts'); await put('hill', ${JSON.stringify(save(g))});})()`,
          );
          await page.reload();
          await page.locator('#cont').click();
          await page.clock.runFor(100);
          expect(await page.locator('#shelter-check').getAttribute('aria-label')).toBe('The village');
          expect(await page.locator('#bell-state').getAttribute('aria-label')).toContain('Bell quiet');
          const suffix = theme === 'light' ? '' : '-dark';
          await page.clock.runFor(1000);
          expect(await page.locator('#ticker').innerText()).toBe('Journal ▸');
          expect(await page.locator('#ticker').getAttribute('title')).toContain('Riders had burned');
          expect(await page.locator('#scene').innerText()).not.toContain('Riders had burned');
          expect(
            await page.evaluate<boolean>(
              `window.drawnWords.some(text => text.includes('Riders had burned'))`,
            ),
          ).toBe(false);
          if (process.env.WARREN_SCREENSHOTS === '1')
            await page.screenshot({ animations: 'disabled', path: `${shots}/after-${width}${suffix}-b.png` });
          const point = await page.evaluate<{ x: number; y: number }>(
            `(() => { const v=window.__warren.view; const b=document.querySelector('#cv').getBoundingClientRect(); return {x:b.x+(18.5-v.x)*v.cs,y:b.y+(${SURF}+3.5-v.y)*v.cs}; })()`,
          );
          await page.touchscreen.tap(point.x, point.y);
          await page.clock.runFor(100);
          expect(await page.locator('#cell-title').innerText()).toBe('Sleeping room');
          expect(await page.locator('#cell-words').innerText()).toMatch(/riders/i);
          expect(await page.locator('#card').isVisible()).toBe(false);
          const close = await page.locator('#cellx').boundingBox();
          expect((close?.y ?? height) + (close?.height ?? height)).toBeLessThan(height);
          const map = await page.locator('#cv').boundingBox();
          const detail = await page.locator('#cell-detail').boundingBox();
          if (!map || !detail) throw new Error('Missing room or map');
          expect(detail.y >= map.y && detail.y + detail.height <= height).toBe(true);
          const tools = await page.locator('.tools').boundingBox();
          if (!tools) throw new Error('Missing tools');
          expect(tools.y).toBeGreaterThanOrEqual(detail.y + detail.height);
          expect(tools.y + tools.height).toBeLessThanOrEqual(height);
          expect(
            await page.locator('#cell-words').evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
          ).toBe(true);
          expect(await page.locator('#clock-rate').isVisible()).toBe(true);
          const roomPoint = await page.evaluate<{ x: number; y: number }>(
            `(() => {const v=window.__warren.view;const b=document.querySelector('#cv').getBoundingClientRect();return {x:b.x+(18.5-v.x)*v.cs,y:b.y+(${SURF}+3.5-v.y)*v.cs};})()`,
          );
          expect(roomPoint.x).toBeGreaterThan(map.x);
          expect(roomPoint.x).toBeLessThan(map.x + map.width);
          expect(roomPoint.y).toBeGreaterThan(map.y + 44);
          expect(roomPoint.y).toBeLessThan(map.y + map.height);
          if (process.env.WARREN_SCREENSHOTS === '1')
            await page.screenshot({
              animations: 'disabled',
              path: `${shots}/after-${width}-room${suffix}-b.png`,
            });
          // Opening shelter directly replaces the room reading rather than stacking sheets.
          await page.locator('#shelter-check').click();
          expect(await page.locator('#cell-detail').isVisible()).toBe(false);
          expect(await page.locator('#drawer').isVisible()).toBe(true);
          await page.locator('#bookx').click();
          await page.touchscreen.tap(roomPoint.x, roomPoint.y);
          await page.clock.runFor(100);
          expect(await page.locator('#cell-detail').isVisible()).toBe(true);
          const camera = await page.evaluate('JSON.stringify(window.__warren.view)');
          // Growing excavation must not move the inspected room out from under its reading.
          await page.evaluate(
            `(() => {const s=window.__warren.game.s;s.hill.kind[${idx(20, SURF + 9)}]=${K.open};s.version++;})()`,
          );
          await page.clock.runFor(1000);
          expect(await page.evaluate('JSON.stringify(window.__warren.view)')).toBe(camera);
          await page.locator('#cellx').click();
          expect(await page.locator('#cv').evaluate((e) => e === document.activeElement)).toBe(true);
          // Selecting Door fixes the working view, as it does for a keeper placing a door.
          await page.locator('#furnish').click();
          await page.locator('[data-tool="door"]').tap();
          await page.clock.runFor(1000);
          expect(await page.locator('#scene .hint').count()).toBe(0);
          expect(await page.locator('#event-sentence').innerText()).toContain(
            'You can mark up to three doors',
          );
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
          expect(await words.innerText()).toContain('Ring the bell');
          expect(await words.innerText()).toMatch(/false alarms/i);
          expect(await words.innerText()).not.toContain('Nearby adults:');
          expect(await words.evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
          await page.locator('#reading-context summary').click();
          expect(await page.locator('#door-context').innerText()).toContain('Nearby adults:');
          expect(await page.locator('#door-context').innerText()).toContain('Meryem:');
          await page.locator('#reading-context summary').click();
          if (process.env.WARREN_SCREENSHOTS === '1')
            await page.screenshot({
              animations: 'disabled',
              path: `${shots}/after-${width}-door${suffix}-b.png`,
            });
          await page.locator('#cellx').click();
          await page.locator('#bell').click();
          await page.clock.runFor(100);
          expect(await page.locator('#cell-words').innerText()).toContain('The call lasts six game hours');
          if (process.env.WARREN_SCREENSHOTS === '1')
            await page.screenshot({
              animations: 'disabled',
              path: `${shots}/after-${width}-bell${suffix}-b.png`,
            });
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
          expect(await page.locator('#scene .hint').count()).toBe(0);
          await page.locator('#shelter-check').click();
          expect(await page.locator('#cell-detail').isVisible()).toBe(false);
          expect(await page.locator('#card').isVisible()).toBe(false);
          expect(await page.locator('#drawer').isVisible()).toBe(true);
          await page.locator('#bookx').click();
          expect(await page.locator('#shelter-check').evaluate((e) => e === document.activeElement)).toBe(
            true,
          );
        } finally {
          await page.close();
        }
      });
      it(`renders entrance, shaft and protected room at ${width} in ${theme}`, {
        timeout: 20000,
      }, async () => {
        const page = await browser.newPage({
          viewport: { width, height },
          colorScheme: theme,
          hasTouch: true,
          isMobile: width === 360,
        });
        page.setDefaultTimeout(6000);
        try {
          await page.clock.install();
          await page.goto(url);
          const g = newGame(7);
          g.s.hill.kind.fill(K.rock);
          g.s.hill.use.fill(0);
          g.s.hill.lamp.fill(0);
          g.s.hill.shut.fill(0);
          g.s.hill.known.fill(1);
          g.s.trips = {};
          // Main entrance and its sleeping room; a separate shaft reaches the right room.
          for (let y = SURF; y <= SURF + 7; y++) g.s.hill.kind[idx(18, y)] = K.open;
          for (let x = 15; x <= 21; x++) g.s.hill.kind[idx(x, SURF + 5)] = K.open;
          for (let y = SURF; y <= SURF + 4; y++) g.s.hill.kind[idx(22, y)] = K.open;
          for (let x = 22; x <= 23; x++) g.s.hill.kind[idx(x, SURF + 4)] = K.open;
          const door = idx(18, SURF + 2);
          g.s.hill.use[door] = USE.door;
          g.s.hill.doorWork[door] = 0;
          g.s.hill.use[idx(16, SURF + 5)] = USE.beds;
          g.s.hill.use[idx(23, SURF + 4)] = USE.beds;
          for (const p of g.s.people) g.s.pos[p.id] = idx(18, SURF - 1);
          await page.evaluate(
            `(async () => {const {put} = await import('/src/ui/store.ts');await put('hill',${JSON.stringify(save(g))});})()`,
          );
          await page.reload();
          await page.locator('#cont').click();
          await page.clock.runFor(100);
          await page.evaluate(() => document.fonts.ready);
          await page.locator('#fit-hill').click();
          await page.clock.runFor(100);
          const suffix = theme === 'light' ? '' : '-dark';
          if (process.env.WARREN_SCREENSHOTS === '1')
            await page.screenshot({
              animations: 'disabled',
              path: `${shots}/after-${width}-exposure-open${suffix}-b.png`,
            });
          // Fix a readable pixel-sampling scale independently of the reserved phone scene height.
          await page.evaluate(`Object.assign(window.__warren.view, {cs:24,x:14,y:${SURF + 2}})`);
          await page.clock.runFor(100);
          const sample = (x: number, y: number) =>
            page.evaluate<number>(
              `(() => {const v=window.__warren.view;const c=document.querySelector('#cv');const dpr=c.width/v.w;
          const p=c.getContext('2d').getImageData(Math.floor((${x}+.5-v.x)*v.cs*dpr),Math.floor((${y}+.12-v.y)*v.cs*dpr),1,1).data;
          return (p[0]+p[1]+p[2])/3;})()`,
            );
          const open = await sample(16, SURF + 5);
          const shaft = await sample(23, SURF + 4);
          expect(shaft).toBeGreaterThan(theme === 'dark' ? 150 : 190);
          await page.evaluate(
            `(() => {const s=window.__warren.game.s;s.hill.shut[${door}]=1;s.version++;})()`,
          );
          await page.clock.runFor(100);
          expect(open - (await sample(16, SURF + 5))).toBeGreaterThan(20);
          expect(await sample(23, SURF + 4)).toBeCloseTo(shaft, 0);
          if (process.env.WARREN_SCREENSHOTS === '1')
            await page.screenshot({
              animations: 'disabled',
              path: `${shots}/after-${width}-exposure-shut${suffix}-b.png`,
            });
        } finally {
          await page.close();
        }
      });
    }
  }
});
