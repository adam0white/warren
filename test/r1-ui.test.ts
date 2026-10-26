import { type Browser, webkit } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';

let server: ViteDevServer;
let browser: Browser;
let url: string;
beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  url = server.resolvedUrls!.local[0]!;
  browser = await webkit.launch();
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
it('keeps a phone working view and makes the pending invitation visible beside current needs', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    await page.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
    await page.clock.install();
    await page.goto(`${url}?lab=1`);
    await page.evaluate(
      `(async()=>{const{newGame,save}=await import('/src/sim/game.ts');const{put}=await import('/src/ui/store.ts');await put('hill',save(newGame(7,'0.7.0')));})()`,
    );
    await page.reload();
    await page.locator('#cont').click();
    if (await page.locator('#cellx').isVisible()) await page.locator('#cellx').click();
    expect(await page.evaluate(() => [innerWidth, innerHeight])).toEqual([360, 690]);
    const scene = await page.locator('#scene').boundingBox();
    expect(scene!.height).toBeGreaterThanOrEqual(260);
    const help = await page.locator('#goal').boundingBox();
    const canvas = await page.locator('#cv').boundingBox();
    expect(help!.height).toBeGreaterThanOrEqual(44);
    expect(canvas!.y).toBeGreaterThanOrEqual(help!.y + help!.height);
    await page.locator('#shelter-check').click();
    await page.locator('[data-who="meryem"]').click();
    expect(await page.locator('#visit-person').isVisible()).toBe(true);
    await page.locator('#visit-person').click();
    expect(await page.locator('#invitation-status').textContent()).toMatch(/pending|answered/i);
    expect(await page.locator('#person-help').isVisible()).toBe(true);
    expect(await page.locator('#visit-person').isDisabled()).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  } finally {
    await page.close();
  }
});

it('recognizes a new chalk tap connected through an earlier mark to the cellar', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    await page.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
    await page.clock.install();
    await page.goto(`${url}?lab=1`);
    await page.evaluate(
      `(async()=>{const{newGame,save}=await import('/src/sim/game.ts');const{put}=await import('/src/ui/store.ts');await put('hill',save(newGame(7,'0.7.0')));})()`,
    );
    await page.reload();
    await page.locator('#cont').click();
    await page.locator('[data-tool="chalk"]').click();
    for (const x of [15, 14]) {
      const point = await page.evaluate((x) => {
        const v = (window as unknown as { __warren: { view: { x: number; y: number; cs: number } } }).__warren
          .view;
        const r = document.querySelector('#cv')!.getBoundingClientRect();
        return { x: r.x + (x + 0.5 - v.x) * v.cs, y: r.y + (11.5 - v.y) * v.cs };
      }, x);
      await page.mouse.click(point.x, point.y);
      await page.clock.runFor(100);
      const words = await page.locator('#cell-words').textContent();
      expect(words).toContain('1 new square');
      expect(words).not.toContain('nobody can reach');
      await page.locator('#cellx').click();
    }
  } finally {
    await page.close();
  }
});
