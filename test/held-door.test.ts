import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { expect, it } from 'vitest';
import { act, advance, load, newGame, replay, type Saved, save } from '../src/sim/game.ts';
import { idx, SURF } from '../src/sim/grid.ts';
import { requestWords } from '../src/sim/resident-requests.ts';
import type { _debug } from '../src/ui/app.ts';

declare global {
  interface Window {
    __warren: typeof _debug;
  }
}

const cell = idx(18, SURF + 1);
function heldHill() {
  const g = newGame(7);
  expect(act(g, { verb: 'door', cell })).toBe(true);
  while (g.s.hill.doorWork[cell] && g.s.minute < 6000) advance(g, g.s.minute + 30);
  expect(g.s.hill.doorWork[cell]).toBe(0);
  return g;
}
/** Full native body and compact replay descriptor retain every actor/RNG/clock/history field.
 * Compact here means the native envelope without its redundant state, not a new UI format. */
function exactReplay(g: ReturnType<typeof newGame>) {
  const full: Saved = JSON.parse(JSON.stringify(save(g)));
  const { state: _state, ...compact } = full;
  const restored = load(full);
  const replayed = replay(
    compact.seed,
    compact.inputs,
    compact.minute,
    compact.game,
    compact.chapter,
    compact.config,
  );
  expect(save(replayed)).toEqual(full);
  expect(save(restored)).toEqual(full);
  for (const run of [g, restored, replayed]) advance(run, full.minute + 180);
  expect(save(restored)).toEqual(save(g));
  expect(save(replayed)).toEqual(save(g));
}
it('tests the held hill through costed HF choices, keeping old input semantics and every trial result', () => {
  const g = heldHill();
  const before = save(g);
  expect(act(g, { verb: 'test-door', who: 'meryem', cell })).toBe(false);
  expect(save(g)).toEqual(before);
  expect(act(g, { verb: 'try-door', who: 'yusuf', cell })).toBe(true);
  expect(g.s.next).toBeUndefined();
  expect(g.s.edition).toBe('0.6.0');
  expect(g.s.hill.shut[cell]).toBe(0);
  for (let n = 0; n < 160 && !g.s.doorTrials![0]!.endedAt; n++) advance(g, g.s.minute + 30);
  const r = g.s.doorTrials![0]!;
  expect(r.results.map((x) => x.shut)).toEqual([true, false]);
  for (const result of r.results) {
    expect(result.at - result.workFrom).toBeGreaterThanOrEqual(8);
    expect(result.workFrom).toBeGreaterThanOrEqual(result.startedAt);
  }
  expect(r.answers.some((a) => a.verdict === 'assented')).toBe(true);
  // Endogenous sleep refusal, with no Person edits, forced choice or skipped night.
  expect(r.answers.some((a) => a.verdict === 'refused' && a.reason === 'asleep')).toBe(true);
  expect(g.s.notes.some((n) => n.text.includes('rolled the door shut for the test'))).toBe(true);
  expect(g.s.notes.some((n) => n.text.includes('reopened the tested door'))).toBe(true);
  expect(g.s.stats.bell).toEqual(before.state.stats.bell);
  expect(g.s.bell).toBeNull();
  const finished = structuredClone(r);
  expect(act(g, { verb: 'try-door', who: 'meryem', cell })).toBe(true);
  expect(act(g, { verb: 'withdraw-door-trial' })).toBe(true);
  expect(g.s.doorTrials![0]).toEqual(finished);
  expect(g.s.doorTrials).toHaveLength(2);
  expect(requestWords(g.s, 'door')).toContain('withdrawn');
  exactReplay(g);
});
it('keeps unavailable work unchanged and does not award an alarm-interrupted trial or withdrawn reopening', () => {
  const g = heldHill();
  const before = save(g);
  expect(act(g, { verb: 'try-door', who: 'kian', cell })).toBe(false);
  expect(save(g)).toEqual(before);
  expect(act(g, { verb: 'try-door', who: 'maryam', cell })).toBe(true);
  while (!g.s.doorTrials![0]!.results.length && g.s.minute < 3000) advance(g, g.s.minute + 30);
  const trial = g.s.doorTrials![0]!;
  expect(trial.phase).toBe('open');
  expect(trial.endedAt).toBeUndefined();
  expect(g.s.hill.shut[cell]).toBe(1);
  expect(act(g, { verb: 'bell' })).toBe(true);
  advance(g, g.s.minute + 30);
  expect(trial.phase).toBe('open');
  expect(trial.endedAt).toBeUndefined();
  expect(trial.results.map((r) => r.shut)).toEqual([true]);
  expect(act(g, { verb: 'withdraw-door-trial' })).toBe(true);
  const alarm = structuredClone(g.s.bell);
  const stats = structuredClone(g.s.stats.bell);
  const refused = save(g);
  expect(act(g, { verb: 'try-door', who: 'meryem', cell })).toBe(false);
  expect(save(g)).toEqual(refused);
  expect(g.s.bell).toEqual(alarm);
  expect(g.s.stats.bell).toEqual(stats);
  expect(requestWords(g.s, 'door')).toContain('withdrawn');
  expect(requestWords(g.s, 'door')).not.toContain('work finished');
  exactReplay(g);
});
it('interrupts an in-progress close without a completed roll', () => {
  const g = heldHill();
  expect(act(g, { verb: 'try-door', who: 'yusuf', cell })).toBe(true);
  while (g.s.minute < 3000 && !g.s.people.some((p) => p.activity?.action === 'test-close'))
    advance(g, g.s.minute + 30);
  expect(g.s.people.some((p) => p.activity?.action === 'test-close')).toBe(true);
  expect(act(g, { verb: 'bell' })).toBe(true);
  advance(g, g.s.minute + 30);
  const r = g.s.doorTrials![0]!;
  expect(r.results).toEqual([]);
  expect(r.endedAt).toBeUndefined();
  expect(g.s.hill.shut[cell]).toBe(0);
  expect(act(g, { verb: 'withdraw-door-trial' })).toBe(true);
  exactReplay(g);
});
it('headless actual-app control: resumes an older hill and publicly requests a completed quiet test', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await server.listen();
    const url = server.resolvedUrls!.local[0]!;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
    await page.clock.install();
    await page.goto(url);
    const stored = await page.evaluate(`(async () => {
      const { put } = await import('/src/ui/store.ts');
      return put('hill', ${JSON.stringify(save(heldHill()))});
    })()`);
    expect(stored).toBe(true);
    await page.reload();
    await page.locator('#cont').click();
    if (await page.locator('#cellx').isVisible()) await page.locator('#cellx').click();
    await page.locator('[data-tool="look"]').click();
    const point = await page.evaluate(() => {
      const v = window.__warren.view;
      const r = document.querySelector('#cv')!.getBoundingClientRect();
      return { x: r.x + (18.5 - v.x) * v.cs, y: r.y + (9.5 - v.y) * v.cs };
    });
    await page.mouse.click(point.x, point.y);
    expect(await page.locator('#test-door').isVisible()).toBe(true);
    await page.locator('#door-tester').selectOption('yusuf');
    await page.locator('#test-door').click();
    expect(await page.evaluate(() => window.__warren.game!.inputs.at(-1)?.verb)).toBe('try-door');
    // Only the ordinary simulation clock advances; no state/Person edits or forced resolution.
    await page.evaluate(`(async () => {
      const { advance } = await import('/src/sim/game.ts');
      const g = window.__warren.game;
      for (let n = 0; n < 160 && !g.s.doorTrials?.[0]?.endedAt; n++) advance(g, g.s.minute + 30);
    })()`);
    await page.clock.runFor(300);
    expect(await page.locator('#resident-door-controls').textContent()).toContain('reopened the tested door');
    await page.locator('#cellx').click();
    await page.locator('#book').click();
    await page.locator('summary').filter({ hasText: 'Debug' }).click();
    const download = page.waitForEvent('download');
    await page.locator('#download-run').click();
    const native: Saved = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
    expect(native.state.doorTrials![0]!.phase).toBe('done');
    expect(native.state.next).toBeUndefined();
    expect(native.state.stats.bell).toEqual({});
    expect(native.state.hill.shut[cell]).toBe(0);
    const replayed = replay(
      native.seed,
      native.inputs,
      native.minute,
      native.game,
      native.chapter,
      native.config,
    );
    expect(save(replayed)).toEqual(save(load(native)));
    exactReplay(replayed);
  } finally {
    await browser?.close();
    await server.close();
  }
});
