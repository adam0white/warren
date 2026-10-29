import { expect, it } from 'vitest';
import { project } from '../src/sim/cast.ts';
import { act, advance, fingerprintJson, load, newGame, replay, save } from '../src/sim/game.ts';
import { observePuzzle, puzzleUnavailable } from '../src/sim/maryam-puzzle.ts';
import { receivedVisit } from '../src/sim/visits.ts';
import { advanceFrame } from '../src/sim/warren.ts';

function offer() {
  const g = newGame(7, '0.7.0', undefined, 'warren-rest/1');
  expect(act(g, { verb: 'visit', who: 'maryam' })).toBe(true);
  expect(receivedVisit(g.s, 'maryam')).toBeDefined();
  return g;
}
it('real Run chooses, travels and pays for one observed crossing; complete native replay continues', async () => {
  const g = offer();
  const before = save(g);
  expect(act(g, { verb: 'try-maryam-puzzle', handling: 'loosen' })).toBe(true);
  expect(save(g).state.people).toEqual(before.state.people);
  expect(g.s.maryamPuzzle!.fixture.crossing).toBe('loose');
  for (let n = 0; n < 80 && !g.s.maryamPuzzle?.result; n++) advance(g, g.s.minute + 30);
  const r = g.s.maryamPuzzle!;
  expect(r.result, JSON.stringify(r)).toBeDefined();
  expect(r.answers.some((a) => a.action === 'play')).toBe(true);
  expect(r.result!.workFrom).toBeGreaterThan(r.result!.startedAt);
  expect(r.result!.at - r.result!.workFrom).toBeGreaterThanOrEqual(30);
  expect(r.fixture).toEqual({ ring: 'threaded', loop: 'closed', crossing: 'slack' });
  // The public attended event, not the host's story note, establishes observation.
  advance(g, g.s.minute + 30);
  expect(g.s.maryamPuzzle!.result!.observed).toBe(true);
  const full = JSON.parse(JSON.stringify(save(g)));
  for (const corruption of ['source', 'cost', 'choice', 'fixture', 'stripped'] as const) {
    const bad = structuredClone(full);
    if (corruption === 'source') bad.state.maryamPuzzle.source.text = 'A solved ring';
    if (corruption === 'cost') bad.state.maryamPuzzle.result.workFrom -= 30;
    if (corruption === 'choice') bad.state.maryamPuzzle.answers = [];
    if (corruption === 'fixture') bad.state.maryamPuzzle.fixture.crossing = 'cinched';
    if (corruption === 'stripped') {
      delete bad.state.maryamPuzzle;
      bad.inputs = bad.inputs.filter((i: { verb: string }) => i.verb !== 'try-maryam-puzzle');
    }
    bad.fingerprint = fingerprintJson(bad.state);
    let error: unknown;
    try {
      load(bad);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/cannot be opened/);
    expect(String((error as Error).cause)).toMatch(/physical exercise history/);
  }
  const restored = load(full);
  const replayed = replay(
    full.seed,
    full.inputs,
    full.minute,
    full.game,
    full.chapter,
    full.config,
    full.phase,
  );
  expect(save(replayed)).toEqual(full);
  for (const run of [g, restored, replayed]) advance(run, full.minute + 1440);
  expect(save(restored)).toEqual(save(g));
  expect(save(replayed)).toEqual(save(g));
  await expect(project(g.s, 'maryam')).rejects.toThrow(/shared history cannot carry/);
});
it('host result alone does not establish attendance; alarm interrupts real work without changing the crossing', () => {
  const g = offer();
  expect(act(g, { verb: 'try-maryam-puzzle', handling: 'draw' })).toBe(true);
  let n = 0;
  while (!g.s.hfActive.maryam?.affordanceId.startsWith('maryam-puzzle-') && n++ < 15000) advanceFrame(g.s, 0);
  expect(g.s.hfActive.maryam?.affordanceId).toMatch(/^maryam-puzzle-/);
  expect(act(g, { verb: 'bell' })).toBe(true);
  advance(g, g.s.minute + 90);
  expect(g.s.maryamPuzzle!.result).toBeUndefined();
  expect(g.s.maryamPuzzle!.fixture.crossing).toBe('loose');
  expect(g.s.maryamPuzzle!.failures.length).toBeGreaterThan(0);
  // A complete physical receipt remains unattended without a matching public event.
  const control = offer();
  expect(act(control, { verb: 'try-maryam-puzzle', handling: 'draw' })).toBe(true);
  let frames = 0;
  while (!control.s.maryamPuzzle!.result && frames++ < 15000) advanceFrame(control.s, 0);
  const result = control.s.maryamPuzzle!.result!;
  expect(result).toBeDefined();
  expect(result.observed).toBe(false);
  expect(control.s.queued.maryam?.some((p) => p.summary === result.text)).toBe(true);
  // Counterfactual host transport: withhold only the queued result observation.
  // Actual HF choice/body/time/RNG are preserved. The host result and note survive.
  control.s.queued.maryam = control.s.queued.maryam!.filter((p) => p.summary !== result.text);
  advance(control, Math.floor(control.s.minute / 30) * 30 + 60);
  observePuzzle(control.s);
  expect(control.s.maryamPuzzle!.result!.observed).toBe(false);
  expect(control.s.maryamPuzzle!.fixture.crossing).toBe('cinched');
  expect(control.s.notes.some((n) => n.text.includes(result.text))).toBe(true);
});
it('requires the exact retained offer and keeps withdrawal finite and replayable', () => {
  const g = newGame(7);
  advanceFrame(g.s, 0);
  const partial = save(g);
  expect(act(g, { verb: 'prepare-native-return', who: 'kian' })).toBe(false);
  expect(save(g)).toEqual(partial);
  // Settle the partial quantum for the unrelated absent-offer refusal.
  advance(g, 330);
  const before = save(g);
  expect(act(g, { verb: 'try-maryam-puzzle', handling: 'loosen' })).toBe(false);
  expect(save(g)).toEqual(before);
  const offered = offer();
  expect(act(offered, { verb: 'try-maryam-puzzle', handling: 'draw' })).toBe(true);
  expect(act(offered, { verb: 'withdraw-maryam-puzzle' })).toBe(true);
  expect(offered.s.maryamPuzzle!.withdrawn).toBe(true);
  expect(offered.s.maryamPuzzle!.fixture.crossing).toBe('loose');
  const full = save(offered);
  expect(save(replay(full.seed, full.inputs, full.minute, full.game, full.chapter, full.config))).toEqual(
    full,
  );
  const trimmed = offer();
  trimmed.s.notes = trimmed.s.notes.filter((n) => n !== receivedVisit(trimmed.s, 'maryam'));
  expect(puzzleUnavailable(trimmed.s)).toContain('not retained');
});
