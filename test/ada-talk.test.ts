import { expect, it } from 'vitest';
import { act, advance, load, newGame, replay, save, stateJson } from '../src/sim/game.ts';
import { USE } from '../src/sim/grid.ts';
import { advanceFrame, newWarren } from '../src/sim/warren.ts';

/** Declared opening conditions, not skipped play or a forced HF decision. */
function opening(at = 720, nourished = true) {
  const s = newWarren(
    7,
    true,
    nourished
      ? (person) => ({
          ...person,
          state: {
            ...person.state,
            body: { ...person.state.body, satiety: 1, hydration: 1, sleepPressure: 0 },
          },
        })
      : undefined,
    at,
  );
  s.edition = '0.7.0';
  s.refuge = { slept: {}, raids: {}, forage: { day: -1, gathered: 0 } };
  if (nourished) {
    const hearth = s.hill.use.findIndex((use) => use === USE.hearth);
    for (const p of s.people) s.pos[p.id] = hearth;
  }
  return newGame(7, '0.7.0', { version: 'warren-hf4-cast/1', inputs: [], claims: [], initial: stateJson(s) });
}
it('keeps Ada invitations voluntary and records only actual costed words and hearing', () => {
  const g = opening();
  const care = structuredClone(g.s.adaVisit);
  expect(act(g, { verb: 'ask-ada' })).toBe(true);
  for (let n = 0; n < 12 && !g.s.adaTalks?.[0]?.endedAt; n++) advance(g, g.s.minute + 30);
  const r = g.s.adaTalks![0]!;
  expect(r.answers.length + r.statements.length).toBeGreaterThan(0);
  expect(
    r.statements.map((row) => row.who).every((id, index) => id === (index === 0 ? 'kian' : 'tamar')),
  ).toBe(true);
  for (const row of r.statements) {
    expect(row.at - row.workFrom).toBeGreaterThanOrEqual(30);
    expect(row.workFrom).toBeGreaterThanOrEqual(row.startedAt);
    expect(row.words).not.toMatch(/Ada is healthy|Ada is safe/);
  }
  if (r.endedAt !== undefined) {
    expect(r.statements).toHaveLength(2);
    expect(r.statements.every((row) => row.heard)).toBe(true);
  }
  expect(g.s.adaVisit).toEqual(care);
  const full = JSON.parse(JSON.stringify(save(g)));
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
  for (const run of [g, restored, replayed]) advance(run, full.minute + 180);
  expect(save(restored)).toEqual(save(g));
  expect(save(replayed)).toEqual(save(g));
});

it('refuses unavailable requests without changing old state and retains words after an alarm and withdrawal', () => {
  expect(() => newGame(7, '0.4.0')).toThrow(/start fresh/i);
  const g = opening();
  expect(act(g, { verb: 'ask-ada' })).toBe(true);
  const pending = JSON.stringify(save(g));
  expect(act(g, { verb: 'ask-ada' })).toBe(false);
  expect(JSON.stringify(save(g))).toBe(pending);
  while (!g.s.adaTalks![0]!.statements.length && g.s.minute < 900) advance(g, g.s.minute + 30);
  const spoken = structuredClone(g.s.adaTalks![0]!.statements);
  expect(spoken.length).toBeLessThanOrEqual(1);
  expect(act(g, { verb: 'bell' })).toBe(true);
  advance(g, g.s.minute + 30);
  expect(g.s.adaTalks![0]!.statements).toEqual(spoken);
  expect(g.s.adaTalks![0]!.endedAt).toBeUndefined();
  const earned = save(g);
  expect(act(g, { verb: 'withdraw-ada-talk' })).toBe(true);
  const after = save(g);
  expect(after.state.people).toEqual(earned.state.people);
  expect(after.state.hill).toEqual(earned.state.hill);
  expect(after.state.adaVisit).toEqual(earned.state.adaVisit);
  expect(after.state.adaTalks![0]!.statements).toEqual(spoken);
  expect(after.state.adaTalks![0]!.withdrawn).toBe(true);
  const refused = JSON.stringify(save(g));
  expect(act(g, { verb: 'ask-ada' })).toBe(false);
  expect(JSON.stringify(save(g))).toBe(refused);
  const replayed = replay(
    after.seed,
    after.inputs,
    after.minute,
    after.game,
    after.chapter,
    after.config,
    after.phase,
  );
  // Intermediate saves may insert the existing community property before why.
  // Compare all native values directly; no field is removed or rounded.
  expect(save(replayed)).toEqual(after);
});

it('keeps endogenous sleep ahead of a pending request without removing earned history', () => {
  const g = opening(1410, false);
  advance(g, 1440);
  const kian = g.s.people.find((p) => p.id === 'kian')!;
  expect(kian.body.asleep || kian.activity?.action === 'sleep').toBe(true);
  expect(act(g, { verb: 'ask-ada' })).toBe(true);
  advance(g, 1500);
  expect(g.s.adaTalks![0]!.statements).toEqual([]);
  expect(kian.body.asleep || kian.activity?.action === 'sleep').toBe(true);
  expect(g.s.adaTalks![0]!.endedAt).toBeUndefined();
  const earned = structuredClone(g.s.notes);
  expect(act(g, { verb: 'withdraw-ada-talk' })).toBe(true);
  expect(g.s.notes.slice(0, earned.length)).toEqual(earned);
  expect(g.s.adaTalks![0]!.statements).toEqual([]);
});

it('does not complete interrupted speech or replace work still in progress after withdrawal', () => {
  const g = opening();
  expect(act(g, { verb: 'ask-ada' })).toBe(true);
  while (!g.s.people.some((p) => p.activity?.action === 'talk-ada') && g.s.minute < 1200)
    advanceFrame(g.s, 0);
  expect(g.s.people.some((p) => p.activity?.action === 'talk-ada')).toBe(true);
  expect(act(g, { verb: 'withdraw-ada-talk' })).toBe(true);
  const before = JSON.stringify(save(g));
  expect(act(g, { verb: 'ask-ada' })).toBe(false);
  expect(JSON.stringify(save(g))).toBe(before);
  advance(g, g.s.minute + 60);
  expect(g.s.adaTalks![0]!.statements).toEqual([]);
  expect(g.s.adaTalks![0]!.failures.length).toBeGreaterThan(0);
  expect(g.s.adaTalks![0]!.withdrawn).toBe(true);
});
