/** Actual App, disposable browser, production services blocked. No screenshots. */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { expect, it } from 'vitest';
import { advance, load, newGame, replay, type Saved, save } from '../src/sim/game.ts';

it('phone and wide public controls create a real exercise, download complete native data and open it read-only', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  const browser = await chromium.launch({ headless: true });
  try {
    await server.listen();
    const url = server.resolvedUrls!.local[0]!;
    for (const [width, height] of [
      [360, 690],
      [1280, 800],
    ]) {
      const context = await browser.newContext({
        viewport: { width: width!, height: height! },
        serviceWorkers: 'block',
      });
      try {
        await context.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
        const page = await context.newPage();
        await page.clock.install();
        await page.goto(url);
        const g = newGame(7, '0.7.0', undefined, 'warren-rest/2');
        await page.evaluate(
          `(async()=>{const {put}=await import('/src/ui/store.ts');return put('hill',${JSON.stringify(save(g))});})()`,
        );
        await page.reload();
        await page.locator('#cont').click();
        await page.locator('#shelter-check').click();
        await page.locator('[data-who="maryam"]').click();
        expect(await page.locator('#maryam-puzzle-loosen').isEnabled()).toBe(false);
        await page.locator('#visit-person').click();
        await page.clock.runFor(300);
        expect(await page.locator('#event-sentence').innerText()).toContain('invitation note');
        const control = page.locator('#maryam-puzzle-loosen');
        expect(await control.isVisible()).toBe(true);
        expect(await control.isEnabled()).toBe(true);
        const box = await control.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await control.click();
        expect(await page.evaluate('window.__warren.game.inputs.at(-1).verb')).toBe('try-maryam-puzzle');
        await page.evaluate(
          `(async()=>{const {advance}=await import('/src/sim/game.ts');const g=window.__warren.game;for(let n=0;n<12&&!g.s.maryamPuzzle.result;n++)advance(g,g.s.minute+30);advance(g,g.s.minute+30);})()`,
        );
        await page.clock.runFor(300);
        expect(await page.locator('#maryam-puzzle-status').innerText()).toContain('slack');
        expect(await page.locator('#maryam-puzzle-status').innerText()).toContain('observed');
        await page.locator('#cardx').click();
        await page.locator('#book').click();
        const downloading = page.waitForEvent('download');
        await page.locator('#download-run').click();
        const full: Saved & { exportedAt: string } = JSON.parse(
          readFileSync((await (await downloading).path())!, 'utf8'),
        );
        const restored = load(full);
        const recreated = replay(
          full.seed,
          full.inputs,
          full.minute,
          full.game,
          full.chapter,
          full.config,
          full.phase,
        );
        expect({ ...save(recreated), exportedAt: full.exportedAt }).toEqual(full);
        for (const run of [restored, recreated]) advance(run, full.minute + 60);
        expect(save(restored)).toEqual(save(recreated));
        await page.goto(`${url}file/`);
        await page.locator('#hill-file').setInputFiles({
          name: 'complete-hill.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(full)),
        });
        await page.waitForSelector('#cv');
        expect(await page.evaluate('window.__warren.game.fileOrigin')).toBe(true);
        expect(await page.evaluate('window.__warren.game.ownedHeads')).toBeUndefined();
        expect(await page.evaluate('document.documentElement.scrollWidth')).toBe(width);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
}, 60000);
