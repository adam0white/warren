import { type Browser, chromium, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act, newGame, save } from '../src/sim/game.ts';
import { idx, SURF } from '../src/sim/grid.ts';

let server: ViteDevServer;
let browser: Browser;
let url: string;
beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? '';
  browser = await chromium.launch();
}, 60000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60000);
async function enter(width: number, height: number) {
  const page = await browser.newPage({
    viewport: { width, height },
    hasTouch: true,
    isMobile: width === 360,
  });
  page.setDefaultTimeout(6000);
  page.setDefaultTimeout(5000);
  await page.clock.install();
  await page.goto(url);
  await page.locator('#new').waitFor();
  const g = newGame(7);
  act(g, { verb: 'use', cells: [idx(18, SURF + 3), idx(19, SURF + 3)], use: 'beds' });
  act(g, { verb: 'bell' });
  await page.evaluate(
    `(async () => { const {put} = await import('/src/ui/store.ts'); await put('hill', ${JSON.stringify(save(g))}); })()`,
  );
  await page.reload();
  await page.locator('#cont').click();
  await page.clock.runFor(250);
  return page;
}
async function point(page: Page, x: number, y: number) {
  return page.evaluate<{ x: number; y: number }>(`(() => {
    const v = window.__warren.view;
    const box = document.querySelector('#cv').getBoundingClientRect();
    return {x: box.x + (${x} + 0.5 - v.x) * v.cs, y: box.y + (${y} + 0.5 - v.y) * v.cs};
  })()`);
}

describe('round four shelter clarity', () => {
  for (const [width, height] of [
    [360, 690],
    [1280, 800],
  ] as const) {
    it(`opens a live shelter check and returns to its person at ${width}×${height}`, {
      timeout: 20000,
    }, async () => {
      const page = await enter(width, height);
      try {
        const check = page.locator('#shelter-check');
        expect(await check.isVisible()).toBe(true);
        const box = await check.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(height);
        await check.click();
        expect(await page.locator('#shelter-summary').innerText()).toContain(
          'Riders can reach 6 sleeping places',
        );
        const rows = page.locator('[data-shelter-person]');
        expect(await rows.count()).toBe(6);
        expect(await rows.allTextContents()).toEqual(
          // People can reach the shallow beds while this live sheet opens.
          expect.arrayContaining([expect.stringMatching(/is (above ground|near an entrance)/)]),
        );
        const person = page.locator('[data-who]').first();
        await person.click();
        expect(await page.locator('#person-help').isVisible()).toBe(true);
        await page.locator('#card details summary').click();
        expect(await page.locator('#card .shelter-person').innerText()).toMatch(
          /above ground|near an entrance|beyond|hiding/,
        );
        await page.locator('#cardx').click();
        expect(await page.locator('#drawer').isVisible()).toBe(true);
        expect(await person.evaluate((el) => el === document.activeElement)).toBe(true);
        const before = await page.evaluate<number>('window.__warren.game.s.minute');
        await page.clock.runFor(5000);
        const after = await page.evaluate<number>('window.__warren.game.s.minute');
        expect(after).toBe(before);
        await page.locator('#bookx').click();
        expect(await check.evaluate((el) => el === document.activeElement)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      } finally {
        await page.close();
      }
    });
  }
  it('keeps raid guidance above capacity and does not present an older bell answer as current', {
    timeout: 20000,
  }, async () => {
    const page = await enter(360, 690);
    try {
      await page.evaluate(`(() => {
        const s = window.__warren.game.s;
        s.raids[0].stage = 'smoke';
        s.bell = null;
        s.answers.push({who:s.people[0].id,at:s.minute-30,verdict:'refused',says:'An old refusal.'});
      })()`);
      await page.clock.runFor(300);
      await page.locator('#raid-bell').click();
      await page.clock.runFor(300);
      expect(await page.locator('#goal').isVisible()).toBe(true);
      expect(await page.locator('#goal').innerText()).toContain('Tap the people count');
      await page.locator('#shelter-check').click();
      await page.locator('[data-who]').first().click();
      expect(await page.locator('#card').innerText()).not.toContain('An old refusal');
    } finally {
      await page.close();
    }
  });
  it('acknowledges bed marking with approximate room and village capacity, and chalk as a planned dig', {
    timeout: 20000,
  }, async () => {
    const page = await enter(360, 690);
    try {
      await page.locator('#furnish').click();
      await page.locator('[data-tool="beds"]').click();
      const bed = await point(page, 18, SURF + 3);
      await page.mouse.click(bed.x, bed.y);
      await page.clock.runFor(300);
      expect(await page.locator('#cell-words').innerText()).toContain('This room has about six');
      expect(await page.locator('#cell-words').innerText()).toContain('There is space for everyone');
      await page.locator('[data-tool="chalk"]').click();
      const chalk = await point(page, 20, SURF + 3);
      await page.mouse.click(chalk.x, chalk.y);
      await page.clock.runFor(300);
      expect(await page.locator('#cell-words').innerText()).toContain('The dig is marked');
      expect(await page.locator('[data-tool="chalk"]').innerText()).not.toBe('✕');
    } finally {
      await page.close();
    }
  });
});
