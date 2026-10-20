import { mkdirSync } from 'node:fs';
import { type Browser, chromium, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newGame, save } from '../src/sim/game.ts';

type Debug = typeof import('../src/ui/app.ts')['_debug'];
let server: ViteDevServer;
let browser: Browser;
let url: string;
const shots = 'scratch/owner-2026-10-20';

beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? '';
  browser = await chromium.launch();
  mkdirSync(shots, { recursive: true });
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function expectViewportFit(page: Page, height: number) {
  const size = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(size.height).toBeLessThanOrEqual(height);
  expect(size.width).toBeLessThanOrEqual(size.viewport);
  for (const selector of ['#book', '.lab-controls summary']) {
    const box = await page.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(height);
    expect(box?.height).toBeGreaterThanOrEqual(24);
  }
}

async function enter(page: Page) {
  await page.goto(url);
  await page.clock.install();
  await page.evaluate(`(async () => {
    const { put } = await import('/src/ui/store.ts');
    await put('hill', ${JSON.stringify(save(newGame(7)))});
  })()`);
  await page.reload();
  await page.locator('#cont').click();
  await page.evaluate(() => (window as unknown as { __warren: Debug }).__warren.setSpeed(0));
  await page.clock.runFor(1000);
}

describe('owner viewport regression', () => {
  for (const [width, height] of [
    [360, 780],
    [412, 891],
    [1440, 900],
  ] as const) {
    it(`fits play and open privacy controls at ${width}×${height}`, async () => {
      const page = await browser.newPage({ viewport: { width, height } });
      try {
        await enter(page);
        await expectViewportFit(page, height);
        expect(await page.locator('#purpose').innerText()).toContain('refuge');
        expect(await page.locator('#goal').innerText()).not.toBe('');
        await page.screenshot({ path: `${shots}/after-early-${width}.png` });
        await page.locator('.lab-controls summary').click();
        await page.clock.runFor(300);
        await expectViewportFit(page, height);
        expect(await page.locator('.lab-controls input').isVisible()).toBe(true);
        await page.screenshot({ path: `${shots}/after-privacy-${width}.png` });
      } finally {
        await page.close();
      }
    });
  }

  it('widens smoothly as rooms open and respects manual zoom and pan afterwards', async () => {
    const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
    try {
      await enter(page);
      const early = await page.evaluate(() => (window as unknown as { __warren: Debug }).__warren.view.cs);
      await page.evaluate(() => {
        const { game } = (window as unknown as { __warren: Debug }).__warren;
        if (!game) throw new Error('No game');
        for (let y = 12; y <= 30; y++) game.s.hill.kind[y * 34 + 18] = 6;
        game.s.version++;
      });
      await page.clock.runFor(100);
      const mid = await page.evaluate(() => (window as unknown as { __warren: Debug }).__warren.view.cs);
      expect(mid).toBeLessThan(early);
      await page.clock.runFor(2000);
      const wide = await page.evaluate(() => (window as unknown as { __warren: Debug }).__warren.view.cs);
      expect(wide).toBeLessThan(mid);
      await page.screenshot({ path: `${shots}/after-grown-360.png` });
      await page.mouse.move(180, 320);
      await page.mouse.down();
      await page.mouse.move(220, 350, { steps: 4 });
      await page.mouse.up();
      const panned = await page.evaluate(() => ({
        ...(window as unknown as { __warren: Debug }).__warren.view,
      }));
      await page.clock.runFor(1000);
      expect(
        await page.evaluate(() => ({
          ...(window as unknown as { __warren: Debug }).__warren.view,
        })),
      ).toEqual(panned);
      await page.locator('#cv').dispatchEvent('wheel', {
        ctrlKey: true,
        deltaY: -20,
        clientX: 180,
        clientY: 300,
      });
      const manual = await page.evaluate(() => ({
        ...(window as unknown as { __warren: Debug }).__warren.view,
      }));
      expect(manual.cs).toBeGreaterThan(wide);
      await page.clock.runFor(1000);
      expect(
        await page.evaluate(() => ({
          ...(window as unknown as { __warren: Debug }).__warren.view,
        })),
      ).toEqual(manual);
    } finally {
      await page.close();
    }
  });
});
