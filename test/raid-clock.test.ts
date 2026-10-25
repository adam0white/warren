import { readFileSync } from 'node:fs';
import { type Browser, chromium, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  advance,
  fingerprint,
  GAME_VERSION,
  load,
  newGame,
  replay,
  type Saved,
  save,
} from '../src/sim/game.ts';
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
  await page.goto(`${url}?lab=1`);
  await page.locator('#new').waitFor();
  await page.evaluate(`(async () => {
    const { put } = await import('/src/ui/store.ts');
    await put('hill', ${JSON.stringify(saved)});
  })()`);
  await page.reload();
  await page.locator('#cont').click();
  await page.clock.runFor(7000);
  return page;
}
async function exported(page: Page): Promise<Saved> {
  await page.locator('#book').click();
  await page.locator('#send').click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Keep a copy of this run', exact: true }).click();
  const stream = await (await pending).createReadStream();
  let json = '';
  for await (const chunk of stream) json += chunk.toString();
  return JSON.parse(json);
}

describe('F-233 raid playback', () => {
  it('replays the historical raid inputs on the current cast and continues with identical fingerprints', () => {
    const baseline = JSON.parse(
      readFileSync(new URL('./fixtures/raid-export-baseline.json', import.meta.url), 'utf8'),
    );
    const oldRun = replay(baseline.seed, baseline.inputs, baseline.minute, GAME_VERSION);
    const restored = load(save(oldRun));
    expect(fingerprint(restored.s)).toBe(fingerprint(oldRun.s));
    advance(oldRun, baseline.continuationMinute);
    advance(restored, baseline.continuationMinute);
    expect(fingerprint(oldRun.s)).toBe(fingerprint(restored.s));
  });
  it('catches smoke within a fast frame, leaves time to inspect and restores Fast on ringing', async () => {
    const page = await enter();
    try {
      await page.evaluate('window.__warren.setSpeed(2)');
      expect(await page.locator('#clock-rate').innerText()).toBe('Time is paused for your choice.');
      expect(await page.locator('#raid-warning').innerText()).toContain('Smoke');
      expect(await page.locator('[data-speed]').count()).toBe(3);
      expect(await page.locator('.speed').isVisible()).toBe(false);
      expect(await page.locator('[data-speed="2"]').getAttribute('aria-pressed')).toBe('true');
      await page.locator('#shelter-check').click();
      await page.locator('[data-who]').first().click();
      await page.clock.runFor(45000);
      await page.locator('#cardx').click();
      await page.locator('#bookx').click();
      expect(await page.locator('#raid-warning').innerText()).toContain('Smoke');
      await page.locator('#raid-bell').click();
      expect(await page.locator('#cell-title').innerText()).toBe('Bell call');
      expect(await page.locator('#clock-rate').innerText()).toBe('Time is paused for reading.');
      const minuteAtBell = await page.evaluate('window.__warren.game.s.minute');
      await page.clock.runFor(6000);
      expect(await page.evaluate('window.__warren.game.s.minute')).toBe(minuteAtBell);
      expect(await page.locator('#clock-rate').innerText()).toBe('Time is paused for reading.');
      await page.locator('#cellx').click();
      expect(await page.locator('#clock-rate').innerText()).toBe('Time slows for new text.');
      // chrome refreshes the clock label at 250ms boundaries.
      await page.clock.runFor(250);
      expect(await page.locator('#clock-rate').innerText()).toBe('Time slows for new text.');
      expect(await page.locator('#raid-warning').isVisible()).toBe(false);
      expect(await page.locator('#raid-bell, #watch-raid').count()).toBe(0);
      expect(await page.locator('.speed').isVisible()).toBe(true);
      expect(await page.locator('[data-speed="2"]').getAttribute('aria-pressed')).toBe('true');
      const run = await exported(page);
      expect(run.minute).toBe(saved.state.raids[0]?.smoke);
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
      await page.clock.runFor(500);
      expect(await page.locator('#clock-rate').innerText()).toContain('Time is paused for your choice.');
      expect(await page.locator('.speed').isVisible()).toBe(false);
      expect(await page.locator('[data-speed="1"]').getAttribute('aria-pressed')).toBe('true');
      await page.locator('#watch-raid').click();
      expect(await page.locator('#watch-raid').count()).toBe(0);
      expect(await page.locator('.speed').isVisible()).toBe(true);
      expect(await page.locator('[data-speed="1"]').getAttribute('aria-pressed')).toBe('true');
      expect(await page.locator('#clock-rate').innerText()).toBe('Time slows for new text.');
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
        const before = await page.locator('#raid-bell').boundingBox();
        for (const selector of ['#raid-warning', '#clock-rate', '#raid-bell', '#watch-raid', '#book']) {
          const box = await page.locator(selector).boundingBox();
          expect(box, selector).not.toBeNull();
          expect((box?.y ?? 0) + (box?.height ?? 0), selector).toBeLessThanOrEqual(height);
          expect((box?.x ?? 0) + (box?.width ?? 0), selector).toBeLessThanOrEqual(width);
          if (selector === '#raid-bell' || selector === '#watch-raid' || selector === '#book') {
            expect(box?.height).toBeGreaterThanOrEqual(44);
            expect(box?.width).toBeGreaterThanOrEqual(44);
          }
        }
        await page.locator('#watch-raid').click();
        expect(before?.height).toBeGreaterThanOrEqual(44);
        expect(await page.locator('#bell').isVisible()).toBe(true);
        expect(await page.locator('#watch-raid').count()).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      } finally {
        await page.close();
      }
    });
  }
});
