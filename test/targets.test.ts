import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Browser, chromium, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let server: ViteDevServer;
let browser: Browser;
let url: string;
const evidence =
  process.platform === 'darwin'
    ? '/Users/abdul/code/.lab-scratch/patterns/warren-shots/regression/targets'
    : join(tmpdir(), 'warren-target-shots');

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

async function boxes(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return {
        name: element.getAttribute('aria-label') || element.textContent?.trim(),
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      };
    }),
  );
}

function expectTargets(targets: Awaited<ReturnType<typeof boxes>>, width: number, height: number) {
  for (const target of targets) {
    expect.soft(target.width, `${target.name} width`).toBeGreaterThanOrEqual(44);
    expect.soft(target.height, `${target.name} height`).toBeGreaterThanOrEqual(44);
    expect.soft(target.x, `${target.name} left edge`).toBeGreaterThanOrEqual(0);
    expect.soft(target.x + target.width, `${target.name} right edge`).toBeLessThanOrEqual(width);
    expect.soft(target.y + target.height, `${target.name} bottom edge`).toBeLessThanOrEqual(height);
  }
}

describe('DL-23 actual control targets', () => {
  for (const [width, height] of [
    [320, 690],
    [360, 690],
    [1280, 800],
  ] as const) {
    it(`keeps controls at least 44×44 and the scene usable at ${width}×${height}`, async () => {
      const page = await browser.newPage({ viewport: { width, height } });
      try {
        await page.clock.install();
        await page.goto(url);
        await page.locator('#new').click();
        await page.locator('#cv').waitFor();
        await page.clock.runFor(500);
        const play = await boxes(
          page,
          '[data-speed], [data-tool], #bell, #book, #ticker, .lab-controls summary',
        );
        const scene = await page.locator('#cv').boundingBox();
        await page.screenshot({ path: `${evidence}/${width}-play.png` });
        await page.locator('.lab-controls summary').click();
        await page.clock.runFor(300);
        const privacyScene = await page.locator('#cv').boundingBox();
        await page.screenshot({ path: `${evidence}/${width}-privacy.png` });
        await page.locator('.lab-controls summary').click();
        await page.locator('#book').click();
        const notebook = await boxes(page, '[data-tab], #bookx');
        await page.screenshot({ path: `${evidence}/${width}-notebook.png` });
        await page.locator('[data-tab="p"]').click();
        await page.locator('[data-who]').first().click();
        await page.clock.runFor(100);
        const card = await boxes(page, '#cardx');
        writeFileSync(
          `${evidence}/${width}.json`,
          JSON.stringify({ play, notebook, card, scene, privacyScene }, null, 2),
        );
        expect(play).toHaveLength(15);
        expect(notebook).toHaveLength(4);
        expect(card).toHaveLength(1);
        expectTargets([...play, ...notebook, ...card], width, height);
        expect(scene?.height).toBeGreaterThanOrEqual(width === 320 ? 100 : 200);
        expect(privacyScene?.height).toBeGreaterThanOrEqual(width === 320 ? 70 : 150);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      } finally {
        await page.close();
      }
    });
  }
});
