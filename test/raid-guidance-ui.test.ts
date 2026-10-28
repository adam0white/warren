import { type Browser, chromium } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { act, advance, newGame, type Saved, save, stateJson } from '../src/sim/game.ts';

let server: ViteDevServer;
let browser: Browser;
let url: string;
let saved: Saved;
beforeAll(async () => {
  const game = newGame(7);
  const raid = game.s.raids[0];
  if (!raid) throw new Error('Missing raid');
  raid.smoke = game.s.minute + 30;
  raid.riders = game.s.minute + 60;
  raid.leave = game.s.minute + 120;
  game.chapter = { version: 'warren-hf4-cast/1', inputs: [], claims: [], initial: stateJson(game.s) };
  advance(game, raid.riders);
  act(game, { verb: 'bell' });
  saved = save(game);
  server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? '';
  browser = await chromium.launch();
}, 60000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

for (const [width, height] of [
  [1280, 800],
  [360, 690],
] as const) {
  it(`keeps the full active raid call clear of the journal at ${width}`, async () => {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await page.route('**/*', (route) =>
        ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort(),
      );
      await page.clock.install();
      await page.goto(url);
      await page.locator('#new').waitFor();
      await page.evaluate(`(async () => {
        const { put } = await import('/src/ui/store.ts');
        await put('hill', ${JSON.stringify(saved)});
      })()`);
      await page.reload();
      await page.locator('#cont').click();
      await page.locator('#cv').waitFor();
      await page.clock.runFor(500);
      const goal = page.locator('#goal');
      expect(await goal.innerText()).toBe(
        'Riders are at the hill. The bell keeps ringing until the riders leave. People decide whether to come below. They can refuse at any time. Tap the people count above to see who riders can reach.',
      );
      const goalBox = await goal.boundingBox();
      const bodyBox = await page.locator('#inspection-body').boundingBox();
      const slotBox = await page.locator('.game > .goal-slot').boundingBox();
      if (!goalBox || !slotBox) throw new Error('Missing guidance');
      if (width >= 900) {
        if (!bodyBox) throw new Error('Missing journal');
        expect(goalBox.y + goalBox.height).toBeLessThanOrEqual(bodyBox.y);
        expect(goalBox.y + goalBox.height).toBeLessThanOrEqual(slotBox.y + slotBox.height);
      }
      expect(await goal.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      for (const selector of ['#book', '#bell', '#shelter-check']) {
        const box = await page.locator(selector).boundingBox();
        if (!box) throw new Error(`Missing ${selector}`);
        expect(box.y + box.height).toBeLessThanOrEqual(height);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      await page.locator('#shelter-check').click();
      expect(await page.locator('#shelter-summary').innerText()).toContain('people');
      await page.locator('#bookx').click();
      await page.locator('#book').click();
      await page.locator('#resume').click();
      expect(await page.locator('#cv').isVisible()).toBe(true);
      if (width >= 900) {
        await page.evaluate(`(() => {
          const s = window.__warren.game.s;
          s.raids[0].stage = 'gone';
          s.bell = null;
        })()`);
        await page.clock.runFor(500);
        const shorterGoal = await goal.boundingBox();
        const shorterBody = await page.locator('#inspection-body').boundingBox();
        if (!shorterGoal || !shorterBody || !bodyBox) throw new Error('Missing updated guidance');
        expect(shorterBody.y).toBeLessThan(bodyBox.y);
        expect(shorterGoal.y + shorterGoal.height).toBeLessThanOrEqual(shorterBody.y);
      }
    } finally {
      await page.close();
    }
  });
}
