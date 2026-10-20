import { type Browser, chromium, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DAY } from '../src/sim/calendar.ts';
import { newGame, save } from '../src/sim/game.ts';

let server: ViteDevServer;
let browser: Browser;
let url: string;

beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? '';
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function fresh() {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  await page.clock.install();
  await page.goto(url);
  await page.locator('#new').waitFor();
  return page;
}

async function begin(page: Page) {
  await page.locator('#new').click();
  await page.clock.runFor(500);
}

const words = (text: string) => text.trim().split(/\s+/).length;

describe('F-213 first-minute clarity', () => {
  it('offers the refuge goal and chalk instruction within 40 story words across both opening screens', async () => {
    const page = await fresh();
    try {
      const title = (await page.locator('.page > p').allTextContents()).join(' ');
      expect(title).toContain('Dig a refuge');
      expect(title).toContain('Choose chalk');
      await begin(page);
      const play = await page.locator('.purpose, .goal, .hint').allTextContents();
      expect(words([title, ...play].join(' '))).toBeLessThanOrEqual(40);
      const chalk = await page.locator('[data-tool="chalk"]').boundingBox();
      expect(chalk && chalk.y + chalk.height <= 690).toBe(true);
    } finally {
      await page.close();
    }
  });

  it('keeps the cut introduction reachable on request before and during play', async () => {
    const page = await fresh();
    try {
      const about = page.getByText('More about the hill', { exact: true });
      await about.click();
      expect(await page.locator('details[open]').innerText()).toContain('Ring the bell when there is smoke.');
      expect(await page.locator('details[open]').innerText()).toContain('Nobody obeys.');
      await begin(page);
      await page.locator('#book').click();
      await page.locator('[data-tab="s"]').click();
      await page.getByText('More about the hill', { exact: true }).click();
      expect(await page.locator('details[open]').innerText()).toContain('Two fingers move the page.');
    } finally {
      await page.close();
    }
  });

  it('makes the journal entry a bordered control with a visible action label', async () => {
    const page = await fresh();
    try {
      await begin(page);
      const ticker = page.locator('#ticker');
      expect(await ticker.innerText()).toContain('Open journal');
      expect(await ticker.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth))).toBeGreaterThan(
        0,
      );
      const box = await ticker.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box && box.y + box.height <= 690).toBe(true);
      await ticker.click();
      expect(await page.locator('[data-pane="j"]').isVisible()).toBe(true);
      expect(await page.locator('[data-pane="j"]').innerText()).toContain('The barley stood ripe.');
    } finally {
      await page.close();
    }
  });

  it('shows an English date on the clock, journal and returning-player control', async () => {
    const page = await fresh();
    try {
      await begin(page);
      expect(await page.locator('#when').innerText()).toContain('19 August');
      expect(await page.locator('#when').innerText()).toContain('Year 1');
      await page.locator('#book').click();
      expect(await page.locator('[data-pane="j"]').innerText()).toContain('19 August');
      // Use the normal save envelope to exercise Continue across a month and anniversary.
      for (const [day, expected] of [
        [13, '1 September'],
        [365, '19 August'],
      ] as const) {
        const saved = save(newGame(7));
        saved.minute = day * DAY;
        saved.state.minute = saved.minute;
        await page.evaluate(`(async () => {
          const { put } = await import('/src/ui/store.ts');
          await put('hill', ${JSON.stringify(saved)});
        })()`);
        await page.reload();
        expect(await page.locator('#cont').innerText()).toContain(expected);
        expect(await page.locator('#cont').innerText()).toContain(day === 365 ? 'Year 2' : 'Year 1');
      }
    } finally {
      await page.close();
    }
  });

  it('reserves the accent for the instruction while selection uses an ink outline', async () => {
    const page = await fresh();
    try {
      await begin(page);
      await page.locator('[data-tool="chalk"]').click();
      for (const selector of ['[data-tool="chalk"]', '[data-speed].on', '#bell']) {
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
        if (selector !== '#bell') expect(colors.width).toBeGreaterThanOrEqual(2);
      }
      expect(await page.locator('#goal').evaluate((el) => getComputedStyle(el).color)).not.toBe(
        await page.locator('#book').evaluate((el) => getComputedStyle(el).color),
      );
    } finally {
      await page.close();
    }
  });
});
