import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { expect, it } from 'vitest';
import { act, advance, newGame, save } from '../src/sim/game.ts';
import { idx, SURF } from '../src/sim/grid.ts';
import type { _debug } from '../src/ui/app.ts';

declare global {
  interface Window {
    __warren: typeof _debug;
  }
}

it('actual App synthetic phone/wide route shows real request and alarm records while the working map stays fixed', async () => {
  const g = newGame(7, '0.7.0');
  const cell = idx(18, SURF + 1);
  expect(act(g, { verb: 'door', cell })).toBe(true);
  while (g.s.hill.doorWork[cell] && g.s.minute < 6000) advance(g, g.s.minute + 30);
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await server.listen();
    const url = server.resolvedUrls!.local[0]!;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 360, height: 690 }, hasTouch: true });
    await page.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
    await page.clock.install();
    await page.goto(url);
    expect(
      await page.evaluate(`(async () => {
      const { put } = await import('/src/ui/store.ts');
      return put('hill', ${JSON.stringify(save(g))});
    })()`),
    ).toBe(true);
    await page.reload();
    await page.locator('#cont').click();
    if (await page.locator('#cellx').isVisible()) await page.locator('#cellx').click();
    await page.locator('[data-tool="look"]').click();
    const point = await page.evaluate(() => {
      const v = window.__warren.view;
      const b = document.querySelector('#cv')!.getBoundingClientRect();
      return { x: b.x + (18.5 - v.x) * v.cs, y: b.y + (9.5 - v.y) * v.cs };
    });
    await page.mouse.click(point.x, point.y);
    await page.locator('#door-tester').selectOption('yusuf');
    await page.locator('#test-door').click();
    expect(await page.evaluate(() => window.__warren.game!.inputs.at(-1)?.verb)).toBe('try-door');
    await page.evaluate(`(async () => {
      const { advance } = await import('/src/sim/game.ts');
      const g = window.__warren.game;
      for (let n=0; n<160 && !g.s.doorTrials?.[0]?.endedAt; n++) advance(g, g.s.minute+30);
    })()`);
    await page.clock.runFor(300);
    await page.locator('#cellx').click();
    // The existing public Bell button records a real call, not a synthetic history row.
    await page.locator('#bell').click();
    await page.evaluate(`(async () => {
      const { advance } = await import('/src/sim/game.ts');
      const g = window.__warren.game;
      advance(g,g.s.minute+360);
    })()`);
    await page.clock.runFor(300);
    if (await page.locator('#cellx').isVisible()) await page.locator('#cellx').click();
    const camera = () =>
      page.evaluate(() => {
        const r = document.querySelector('#cv')!.getBoundingClientRect();
        return { ...window.__warren.view, left: r.left, top: r.top, width: r.width, height: r.height };
      });
    for (const viewport of [
      { width: 360, height: 690 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await page.clock.runFor(300);
      const scaleBefore = (await camera()).cs;
      await page.locator('#zoom-in').click();
      expect((await camera()).cs).toBeGreaterThan(scaleBefore);
      const before = await camera();
      await page.locator('#ticker').click();
      await page.locator('#door-alarm-records > summary').click();
      const text = await page.locator('#door-alarm-history').innerText();
      expect(text).toContain('Completed door test: shut');
      expect(text).toContain('reopened');
      expect(text).toContain('refused');
      expect(text).toContain('Bell reply');
      expect(text).toContain('No riders came.');
      expect(text).toContain('unknown');
      expect(text).toContain('Year 1');
      expect(text).toMatch(/\d\d:\d\d/);
      await page.locator('#sheet-body').evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await page.clock.runFor(300);
      expect(await camera()).toEqual(before);
      await page.locator('#bookx').click();
      await page.locator('#shelter-check').click();
      const people = page.locator('[data-who]');
      for (const el of await people.all()) {
        expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      expect(await page.locator('[data-who="tamar"]').textContent()).toBe('Tamar of the Wall');
      await page.locator('[data-who="yusuf"]').click();
      const selected = await camera();
      // Public Look drag deliberately pans while the card stays open.
      const box = (await page.locator('#cv').boundingBox())!;
      await page.mouse.move(box.x + 12, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 12, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      const moved = await camera();
      expect(moved.x).not.toBe(selected.x);
      await page.clock.runFor(1000);
      expect(await camera()).toEqual(moved);
      await page.locator('#cardx').click();
      await page.locator('#bookx').click();
      expect((await camera()).x).toBe(moved.x);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    }
  } finally {
    await browser?.close();
    await server.close();
  }
}, 60000);
