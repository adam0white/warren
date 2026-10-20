import { readFileSync } from 'node:fs';
import { type Browser, chromium, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { advance, fingerprint, load, newGame, replay, type Saved, save } from '../src/sim/game.ts';
import { QUANTUM } from '../src/sim/warren.ts';

let server: ViteDevServer;
let browser: Browser;
let url: string;
let saved: Saved;
beforeAll(async () => {
  const g = newGame(7);
  advance(g, (g.s.raids[0]?.smoke ?? 0) - QUANTUM);
  saved = save(g);
  server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? '';
  browser = await chromium.launch();
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
  await page.evaluate(`(async () => {
    const { put } = await import('/src/ui/store.ts');
    await put('hill', ${JSON.stringify(saved)});
  })()`);
  await page.reload();
  await page.locator('#cont').click();
  await page.locator('[data-speed="3"]').click();
  await page.clock.runFor(250);
  return page;
}
async function exported(page: Page): Promise<Saved> {
  await page.locator('#book').click();
  await page.locator('[data-tab="s"]').click();
  const pending = page.waitForEvent('download');
  await page.locator('#export').click();
  const stream = await (await pending).createReadStream();
  let json = '';
  for await (const chunk of stream) json += chunk.toString();
  return JSON.parse(json);
}

describe('F-233 raid playback', () => {
  it('replays the pre-fix exported raid and continues with identical fingerprints', () => {
    const baseline = JSON.parse(
      readFileSync(new URL('./fixtures/raid-export-baseline.json', import.meta.url), 'utf8'),
    );
    const oldRun = replay(baseline.seed, baseline.inputs, baseline.minute);
    expect(fingerprint(oldRun.s)).toBe(baseline.fingerprint);
    advance(oldRun, baseline.continuationMinute);
    expect(fingerprint(oldRun.s)).toBe(baseline.continuationFingerprint);
  });
  it('catches smoke within a fast frame, leaves time to inspect and restores gallop on ringing', async () => {
    const page = await enter();
    try {
      expect(await page.locator('#clock-rate').innerText()).toBe('Slow · 1 min/s · raid warning');
      expect(await page.locator('#raid-warning').innerText()).toContain('Smoke');
      expect(await page.locator('[data-speed="3"]').getAttribute('class')).toContain('on');
      await page.locator('#book').click();
      await page.locator('[data-tab="p"]').click();
      await page.locator('[data-who]').first().click();
      await page.clock.runFor(45000);
      await page.locator('#cardx').click();
      await page.locator('#bookx').click();
      expect(await page.locator('#raid-warning').innerText()).toContain('Smoke');
      await page.locator('#bell').click();
      expect(await page.locator('#clock-rate').innerText()).toBe('Gallop · 1152 min/s');
      expect(await page.locator('#raid-warning').isVisible()).toBe(false);
      const run = await exported(page);
      expect(run.minute).toBeGreaterThanOrEqual((saved.state.raids[0]?.smoke ?? 0) + QUANTUM);
      expect(run.inputs.at(-1)?.verb).toBe('bell');
      expect(run.inputs.at(-1)?.at).toBeLessThan(run.state.raids[0]?.riders ?? 0);
      expect(fingerprint(replay(run.seed, run.inputs, run.minute, run.game).s)).toBe(run.fingerprint);
      const continued = load(run);
      advance(continued, run.minute + 2 * QUANTUM);
      expect(fingerprint(continued.s)).toBe(
        fingerprint(replay(run.seed, run.inputs, continued.s.minute, run.game).s),
      );
    } finally {
      await page.close();
    }
  });

  it('keeps selected speed while pending and restores it when choosing to watch', async () => {
    const page = await enter();
    try {
      await page.locator('[data-speed="2"]').click();
      await page.clock.runFor(500);
      expect(await page.locator('#clock-rate').innerText()).toContain('1 min/s · raid warning');
      await page.locator('#watch-raid').click();
      expect(await page.locator('#clock-rate').innerText()).toBe('Trot · 288 min/s');
      const run = await exported(page);
      expect(run.inputs).toEqual(saved.inputs);
    } finally {
      await page.close();
    }
  });

  for (const [width, height] of [
    [360, 690],
    [1280, 800],
  ] as const) {
    it(`keeps raid context, responses and stable touch targets on screen at ${width}×${height}`, async () => {
      const page = await enter(width, height);
      try {
        const before = await page.locator('#bell').boundingBox();
        for (const selector of ['#raid-warning', '#clock-rate', '#bell', '#watch-raid', '#book']) {
          const box = await page.locator(selector).boundingBox();
          expect(box, selector).not.toBeNull();
          expect((box?.y ?? 0) + (box?.height ?? 0), selector).toBeLessThanOrEqual(height);
          expect((box?.x ?? 0) + (box?.width ?? 0), selector).toBeLessThanOrEqual(width);
          if (selector === '#bell' || selector === '#watch-raid' || selector === '#book') {
            expect(box?.height).toBeGreaterThanOrEqual(44);
            expect(box?.width).toBeGreaterThanOrEqual(44);
          }
        }
        await page.locator('#watch-raid').click();
        expect(await page.locator('#bell').boundingBox()).toEqual(before);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      } finally {
        await page.close();
      }
    });
  }
});
