import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { expect, it } from 'vitest';
import { advance, load, newGame, replay, type Saved, save, stateJson } from '../src/sim/game.ts';
import { cellsWithUse, USE } from '../src/sim/grid.ts';
import { newWarren } from '../src/sim/warren.ts';
import type { _debug } from '../src/ui/app.ts';

declare global {
  interface Window {
    __warren: typeof _debug;
  }
}

it('actual App synthetic control: publicly asks Kian, sees heard speech, downloads and continues the native run', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await server.listen();
    const url = server.resolvedUrls!.local[0]!;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
    await page.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
    await page.clock.install();
    await page.goto(url);
    // Fresh authored, rested and fed opening; choices and hearing remain HF outcomes.
    const state = newWarren(
      7,
      true,
      (person) => ({
        ...person,
        state: {
          ...person.state,
          body: { ...person.state.body, satiety: 1, hydration: 1, sleepPressure: 0 },
        },
      }),
      720,
    );
    const hearth = cellsWithUse(state.hill, USE.hearth)[0]!;
    state.pos.kian = hearth;
    state.pos.tamar = hearth;
    const chapter = {
      version: 'warren-hf4-cast/1' as const,
      inputs: [],
      claims: [],
      initial: stateJson(state),
    };
    const opening = newGame(7, '0.7.0', chapter);
    const stored = await page.evaluate(`(async () => {
      const { put } = await import('/src/ui/store.ts');
      return put('hill', ${JSON.stringify(save(opening))});
    })()`);
    expect(stored).toBe(true);
    await page.reload();
    await page.locator('#cont').click();
    if (await page.locator('#cellx').isVisible()) await page.locator('#cellx').click();
    await page.locator('#shelter-check').click();
    await page.locator('[data-who="kian"]').click();
    expect(await page.locator('#ask-ada').isVisible()).toBe(true);
    expect(await page.locator('#person-help').isVisible()).toBe(true);
    await page.locator('#ask-ada').click();
    expect(await page.locator('#ada-talk-status').textContent()).toContain('still pending');
    expect(await page.evaluate(() => window.__warren.game!.inputs.at(-1)?.verb)).toBe('ask-ada');
    await page.evaluate(`(async () => {
      const { advance } = await import('/src/sim/game.ts');
      const g = window.__warren.game;
      for (let n = 0; n < 160 && !g.s.adaTalks?.[0]?.endedAt; n++) advance(g, g.s.minute + 30);
    })()`);
    await page.clock.runFor(300);
    const words = await page.locator('#ada-talk-status').textContent();
    expect(words).toContain('Both people heard the conversation');
    expect(words).toContain('Ada is my sister');
    expect(words).toContain('There is grain in your household jars');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
    await page.locator('#cardx').click();
    await page.locator('#book').click();
    await page.locator('summary').filter({ hasText: 'Debug' }).click();
    const download = page.waitForEvent('download');
    await page.locator('#download-run').click();
    const full: Saved = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
    expect(full.state.adaTalks![0]!.statements.every((x) => x.heard)).toBe(true);
    expect(full.state.adaVisit).toBeUndefined();
    const { state: _state, ...compact } = full;
    const restored = load(full);
    const replayed = replay(
      compact.seed,
      compact.inputs,
      compact.minute,
      compact.game,
      compact.chapter,
      compact.config,
      compact.phase,
    );
    // The downloaded file also carries the UI export wall-clock stamp.
    // Preserve that file unchanged; the deterministic native body comes from load/save.
    expect(typeof (full as Saved & { exportedAt: string }).exportedAt).toBe('string');
    expect(save(replayed)).toEqual(save(restored));
    for (const g of [restored, replayed]) advance(g, full.minute + 30);
    expect(save(restored)).toEqual(save(replayed));
  } finally {
    await browser?.close();
    await server.close();
  }
  // This bounded control includes browser simulation, archive download, full replay
  // and two continuations. Allow loaded full-suite runs time for all assertions.
}, 120000);
