import { type Browser, chromium, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DAY } from '../src/sim/calendar.ts';
import { act, advance, fingerprint, newGame, replay, save } from '../src/sim/game.ts';
import { localHill } from './local-hill.ts';

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

async function fresh() {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  await page.clock.install();
  await page.goto(`${url}?lab=1`);
  await page.locator('#new').waitFor();
  return page;
}

async function begin(page: Page) {
  await localHill(page);
  await page.locator('#cv').waitFor();
  await page.clock.runFor(500);
}

const words = (text: string) => text.trim().split(/\s+/).length;

describe('F-213 first-minute clarity', () => {
  it('offers the refuge goal and chalk instruction within 40 story words through chalk selection before the first mark', async () => {
    const page = await fresh();
    try {
      const title = await page.locator('.title-goal').evaluate((el) =>
        Array.from(el.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent)
          .join(' '),
      );
      expect(title).toContain('Dig a shelter');
      expect(title).not.toContain('Choose chalk');
      await begin(page);
      const play = await page.locator('.purpose, .goal').allTextContents();
      await page.locator('[data-tool="chalk"]').click();
      await page.clock.runFor(300);
      const hint = await page.locator('#event-sentence').innerText();
      expect(hint).toContain('A dashed outline marks where people can dig');
      expect(words([title, ...play, hint].join(' '))).toBeLessThanOrEqual(40);
      const chalk = await page.locator('[data-tool="chalk"]').boundingBox();
      expect(chalk && chalk.y + chalk.height <= 690).toBe(true);
    } finally {
      await page.close();
    }
  });

  it('keeps the cut introduction reachable on request before and during play', async () => {
    const page = await fresh();
    try {
      const about = page.getByRole('button', { name: 'Information', exact: true });
      await about.click();
      expect(await page.locator('#hill-info').innerText()).toContain('You have the chalk and the bell.');
      expect(await page.locator('#hill-info').innerText()).toContain('Each person chooses what to do.');
      await page.keyboard.press('Escape');
      await begin(page);
      await page.getByRole('button', { name: 'Information', exact: true }).click();
      expect(await page.locator('#hill-info').innerText()).toContain('People choose when to dig.');
    } finally {
      await page.close();
    }
  });

  it('makes the journal chip a visible action in the sheet peek row', async () => {
    const page = await fresh();
    try {
      await begin(page);
      const ticker = page.locator('#ticker');
      expect(await ticker.innerText()).toContain('Journal');
      expect(await ticker.innerText()).toContain('▸');
      const box = await ticker.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box && box.y + box.height <= 690).toBe(true);
      await ticker.click();
      expect(await page.locator('#drawer[data-kind="j"]').isVisible()).toBe(true);
      expect(await page.locator('#drawer[data-kind="j"]').innerText()).toContain('The barley was ripe.');
    } finally {
      await page.close();
    }
  });

  it('shows an English date on the clock, journal and returning-player control', async () => {
    const page = await fresh();
    try {
      await begin(page);
      expect(await page.locator('#when').innerText()).toContain('19 Aug');
      expect(await page.locator('#when').innerText()).toContain('year 1');
      await page.locator('#ticker').click();
      expect(await page.locator('#drawer[data-kind="j"]').innerText()).toContain('19 August');
      // Advance the simulation, save an accepted input, and restore through the real control.
      const game = newGame(7);
      advance(game, 13 * DAY);
      expect(act(game, { verb: 'bell' })).toBe(true);
      const saved = save(game);
      await page.evaluate(`(async () => {
        const { put } = await import('/src/ui/store.ts');
        await put('hill', ${JSON.stringify(saved)});
      })()`);
      await page.reload();
      expect(await page.locator('#cont').innerText()).toContain('1 September');
      await page.locator('#cont').click();
      expect(await page.locator('#when').innerText()).toContain('1 Sep');
      await page.clock.runFor(300);
      await page.locator('#book').click();
      await page.locator('#send').click();
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Keep a copy of this run', exact: true }).click();
      const stream = await (await pending).createReadStream();
      let json = '';
      for await (const chunk of stream) json += chunk.toString();
      const restored = JSON.parse(json);
      // Time keeps moving while the player reaches Download. Check the actual export boundary.
      expect(restored.minute).toBeGreaterThanOrEqual(saved.minute);
      expect(restored.inputs).toEqual(saved.inputs);
      expect(fingerprint(replay(restored.seed, restored.inputs, restored.minute, restored.game).s)).toBe(
        restored.fingerprint,
      );
    } finally {
      await page.close();
    }
  });

  it('restores the saved date and minute without invisible offline decisions', async () => {
    const page = await fresh();
    try {
      const game = newGame(7);
      advance(game, 13 * DAY);
      await page.evaluate(`(async () => {
        const { put } = await import('/src/ui/store.ts');
        await put('hill', ${JSON.stringify(save(game))});
      })()`);
      await page.clock.setSystemTime(await page.evaluate(() => Date.now() + 60000));
      await page.reload();
      expect(await page.locator('#cont').innerText()).toContain('1 September');
      await page.locator('#cont').click();
      await page.clock.runFor(300);
      await page.locator('#cv').waitFor();
      expect(await page.locator('#when').innerText()).toContain('1 Sep');
      expect(await page.evaluate('window.__warren.game.s.minute')).toBe(game.s.minute);
    } finally {
      await page.close();
    }
  });

  it('draws a selected person in ink with a distinct ring weight', async () => {
    const page = await fresh();
    try {
      await begin(page);
      // Record the real canvas command for the tall person-selection ellipse.
      await page.evaluate(() => {
        const proto = CanvasRenderingContext2D.prototype;
        const ellipse = proto.ellipse;
        const strokes: { color: string; width: number }[] = [];
        Object.assign(window, { selectionStrokes: strokes });
        proto.ellipse = function (...args) {
          if (args[3] > args[2]) strokes.push({ color: String(this.strokeStyle), width: this.lineWidth });
          return ellipse.apply(this, args);
        };
      });
      await page.locator('#shelter-check').click();
      await page.locator('[data-who]').first().click();
      await page.clock.runFor(50);
      const strokes = await page.evaluate(
        () =>
          (window as unknown as { selectionStrokes: { color: string; width: number }[] }).selectionStrokes,
      );
      expect(strokes.length).toBeGreaterThan(0);
      const ink = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(),
      );
      for (const stroke of strokes) {
        expect(stroke.color).toBe(ink);
        expect(stroke.width).toBeGreaterThanOrEqual(2);
      }
    } finally {
      await page.close();
    }
  });

  it('marks the selected tool as pressed while tools retain ink text', async () => {
    const page = await fresh();
    try {
      await begin(page);
      await page.locator('[data-tool="chalk"]').click();
      for (const selector of ['[data-tool="chalk"]', '#bell']) {
        const colors = await page.locator(selector).evaluate((el) => {
          const style = getComputedStyle(el);
          return {
            color: style.color,
            border: style.borderTopColor,
            width: parseFloat(style.borderTopWidth),
          };
        });
        const ink = await page.locator('#book').evaluate((el) => getComputedStyle(el).color);
        expect(colors.color).toBe(ink);
        if (selector !== '#bell') {
          expect(colors.width).toBeGreaterThanOrEqual(1);
          expect(await page.locator(selector).getAttribute('aria-pressed')).toBe('true');
        }
      }
    } finally {
      await page.close();
    }
  });
});
