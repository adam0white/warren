import { readFileSync } from 'node:fs';
import { replay as replayHF, step } from '@adam0white/human-framework';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { expect, it } from 'vitest';
import { act, advance, load, newGame, replay, type Saved, save, stateJson } from '../src/sim/game.ts';
import { idx, SURF, USE } from '../src/sim/grid.ts';
import { archiveOf, hfRunOf, need } from '../src/sim/hf4.ts';
import { requestWords } from '../src/sim/resident-requests.ts';
import { advanceFrame, newWarren } from '../src/sim/warren.ts';
import type { _debug } from '../src/ui/app.ts';

declare global {
  interface Window {
    __warren: typeof _debug;
  }
}

const cell = idx(18, SURF + 1);
/** An authored finished-door opening, not invented construction or skipped living time. */
function heldHill(nourished = false) {
  const s = nourished
    ? newWarren(
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
      )
    : newGame(7).s;
  s.edition = '0.7.0';
  s.next = { config: 'warren-rest/2' };
  s.refuge = { slept: {}, raids: {}, forage: { day: -1, gathered: 0 } };
  s.hill.use[cell] = USE.door;
  s.hill.doorWork[cell] = 0;
  return newGame(7, '0.7.0', { version: 'warren-hf4-cast/1', inputs: [], claims: [], initial: stateJson(s) });
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
    compact.phase,
  );
  expect(save(replayed)).toEqual(full);
  expect(save(restored)).toEqual(full);
  for (const run of [g, restored, replayed]) advance(run, full.minute + 180);
  expect(save(restored)).toEqual(save(g));
  expect(save(replayed)).toEqual(save(g));
}
it('records a costed completed close and keeps reopening pending until an actual choice', () => {
  const g = heldHill();
  const before = save(g);
  expect(act(g, { verb: 'try-door', who: 'yusuf', cell })).toBe(false);
  expect(save(g)).toEqual(before);
  expect(act(g, { verb: 'test-door', who: 'yusuf', cell })).toBe(true);
  expect(g.s.edition).toBe('0.7.0');
  expect(g.s.hill.shut[cell]).toBe(0);
  for (let n = 0; n < 12 && !g.s.next!.requests!.door!.results.length; n++) advance(g, g.s.minute + 30);
  const r = g.s.next!.requests!.door!;
  expect(r.results[0]?.shut, JSON.stringify(r)).toBe(true);
  expect(r.phase).toBe('open');
  expect(r.opened).toBeUndefined();
  expect(g.s.hill.shut[cell]).toBe(1);
  for (const result of r.results) {
    expect(result.at - result.workFrom).toBeGreaterThanOrEqual(8);
    expect(result.workFrom).toBeGreaterThanOrEqual(result.startedAt);
  }
  expect(r.answers.some((a) => a.verdict === 'assented')).toBe(true);
  expect(g.s.notes.some((n) => n.text.includes('rolled the door shut for the test'))).toBe(true);
  expect(g.s.notes.some((n) => n.text.includes('reopened the tested door'))).toBe(false);
  expect(requestWords(g.s, 'door')).toContain('Reopening still needs a real choice');
  expect(g.s.stats.bell).toEqual(before.state.stats.bell);
  expect(g.s.bell).toBeNull();
  const pending = save(g);
  expect(act(g, { verb: 'test-door', who: 'yusuf', cell })).toBe(false);
  expect(save(g)).toEqual(pending);
  expect(act(g, { verb: 'withdraw-request', kind: 'door' })).toBe(true);
  expect(g.s.next!.requests!.door!.results).toEqual(r.results);
  expect(g.s.next!.requests!.door).toBeDefined();
  expect(requestWords(g.s, 'door')).toContain('withdrawn');
  exactReplay(g);
});
it('refuses unqualified work and preserves a withdrawn request without a completed roll', () => {
  const g = heldHill(),
    before = save(g);
  expect(act(g, { verb: 'test-door', who: 'kian', cell })).toBe(false);
  expect(save(g)).toEqual(before);
  expect(act(g, { verb: 'test-door', who: 'maryam', cell })).toBe(true);
  expect(act(g, { verb: 'withdraw-request', kind: 'door' })).toBe(true);
  expect(g.s.next!.requests!.door!.results).toEqual([]);
  expect(g.s.hill.shut[cell]).toBe(0);
  expect(requestWords(g.s, 'door')).toContain('withdrawn');
  exactReplay(g);
});
it('settles a real HF interruption of an active close without awarding a roll', () => {
  const g = heldHill(true);
  expect(act(g, { verb: 'test-door', who: 'meryem', cell })).toBe(true);
  let actor = g.s.people.find((p) => p.activity?.action === 'test-close');
  while (!actor && g.s.minute < 1200) {
    advanceFrame(g.s, 0);
    actor = g.s.people.find((p) => p.activity?.action === 'test-close');
  }
  expect(actor).toBeDefined();
  const archive = archiveOf(g.s),
    activity = actor!.activity!;
  // Protocol control: actual host evidence interrupts the admitted activity at its next millisecond.
  need(
    step(hfRunOf(g.s), {
      until: archive.current.at + 1,
      inputs: [
        {
          id: 'held-door-interrupt-control',
          at: archive.current.at + 1,
          source: { type: 'host', id: 'warren' },
          kind: 'activity.interrupted',
          payload: { person: actor!.id, activityId: activity.id, reason: 'control alarm' },
        },
      ],
    }),
  );
  advance(g, (g.s.hfPhase?.to ?? g.s.minute) + 30);
  expect(g.s.next!.requests!.door!.results).toEqual([]);
  expect(g.s.hill.shut[cell]).toBe(0);
  const final = archiveOf(g.s),
    verified = need(replayHF(final));
  expect(verified.fullHash).toBe(final.hashes.full);
});
it('headless actual-app control: resumes an authored current hill and publicly records a completed close and pending reopening', async () => {
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
    expect(await page.evaluate(() => window.__warren.game!.inputs.at(-1)?.verb)).toBe('test-door');
    // Only the ordinary simulation clock advances; no state/Person edits or forced resolution.
    await page.evaluate(`(async () => {
      const { advance } = await import('/src/sim/game.ts');
      const g = window.__warren.game;
      for (let n = 0; n < 12 && !g.s.next?.requests?.door?.results.length; n++) advance(g, g.s.minute + 30);
    })()`);
    await page.clock.runFor(300);
    expect(await page.locator('#resident-door-controls').textContent()).toContain(
      'Reopening still needs a real choice',
    );
    await page.locator('#cellx').click();
    await page.locator('#book').click();
    await page.locator('summary').filter({ hasText: 'Debug' }).click();
    const download = page.waitForEvent('download');
    await page.locator('#download-run').click();
    const native: Saved = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
    expect(native.state.next!.requests!.door!.phase).toBe('open');
    expect(native.state.next!.requests!.door!.results.map((r) => r.shut)).toEqual([true]);
    expect(native.state.next!.requests!.door!.opened).toBeUndefined();
    expect(native.state.next?.config).toBe('warren-rest/2');
    expect(native.state.stats.bell).toEqual({});
    expect(native.state.hill.shut[cell]).toBe(1);
    const replayed = replay(
      native.seed,
      native.inputs,
      native.minute,
      native.game,
      native.chapter,
      native.config,
      native.phase,
    );
    expect(save(replayed)).toEqual(save(load(native)));
    exactReplay(replayed);
  } finally {
    await browser?.close();
    await server.close();
  }
});
