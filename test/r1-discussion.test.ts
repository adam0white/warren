import { expect, it } from 'vitest';
import { act, advance, fingerprint, load, newGame, replay, save, stateJson } from '../src/sim/game.ts';
import { idx, K, SURF } from '../src/sim/grid.ts';
import { heard } from '../src/sim/hf4.ts';

it('records only actually heard positions with real speech costs', () => {
  const opening = newGame(7, '0.7.0', undefined, 'warren-next/2', (person) => ({
    ...person,
    state: { ...person.state, body: { ...person.state.body, satiety: 1, hydration: 1, sleepPressure: 0 } },
  }));
  // PHYSICAL-WORLD FIXTURE: one known loose face beside the cellar. No Person edits.
  const face = idx(15, SURF + 3);
  opening.s.hill.kind[face] = K.loose;
  opening.s.hill.known[face] = 1;
  const g = newGame(
    7,
    '0.7.0',
    {
      version: 'warren-hf4-cast/1',
      inputs: [],
      claims: [],
      initial: stateJson(opening.s),
    },
    'warren-next/2',
  );
  act(g, { verb: 'chalk', cells: [face], on: true });
  expect(act(g, { verb: 'discuss-cut' })).toBe(true);
  for (let n = 0; n < 24 && !g.s.next!.discussion!.statements.some((row) => row.heard); n++)
    advance(g, g.s.minute + 30);
  const d = g.s.next!.discussion!;
  expect(d.statements.map((r) => r.stance)).toEqual(['pause']);
  expect(d.statements.every((r) => r.heard)).toBe(true);
  expect(d.exchange).toBe(false);
  for (const row of d.statements) {
    expect(row.at - row.workFrom).toBeCloseTo(30);
    expect(row.workFrom).toBeGreaterThanOrEqual(row.startedAt);
    const listener = g.s.people.find((p) => p.id === row.listener)!;
    expect(heard(listener, row.text, row.at)).toBe(true);
  }
  // The fixture is pinned in the chapter. It is not a normal seed-only export or an importable cast claim.
  const full = save(g);
  const compact = {
    seed: full.seed,
    inputs: full.inputs,
    minute: full.minute,
    game: full.game,
    chapter: full.chapter,
    config: full.config,
  };
  expect(
    fingerprint(
      replay(compact.seed, compact.inputs, compact.minute, compact.game, compact.chapter, compact.config).s,
    ),
  ).toBe(full.fingerprint);
  const restored = load(full);
  advance(g, g.s.minute + 30);
  advance(restored, restored.s.minute + 30);
  expect(save(restored)).toEqual(save(g));
});

it('replays a bounded public loose-cut encounter without inventing agreement or disagreement', () => {
  const opening = newGame(7, '0.7.0', undefined, 'warren-next/2');
  const face = idx(15, SURF + 3);
  // Authored physical terrain. Every answer and hearing still comes from the running HF actors.
  opening.s.hill.kind[face] = K.loose;
  opening.s.hill.known[face] = 1;
  const g = newGame(
    7,
    '0.7.0',
    {
      version: 'warren-hf4-cast/1',
      inputs: [],
      claims: [],
      initial: stateJson(opening.s),
    },
    'warren-next/2',
  );
  expect(act(g, { verb: 'chalk', cells: [face], on: true })).toBe(true);
  expect(act(g, { verb: 'discuss-cut' })).toBe(true);
  for (let n = 0; n < 24 && !g.s.next!.discussion!.statements.some((row) => row.heard); n++)
    advance(g, g.s.minute + 30);
  const d = g.s.next!.discussion!;
  expect(d.face).toBe(face);
  expect(d.exchange).toBe(false);
  for (const row of d.statements.filter((row) => row.heard)) {
    expect(row.at - row.workFrom).toBeCloseTo(30);
    expect(row.workFrom).toBeGreaterThanOrEqual(row.startedAt);
    expect(heard(g.s.people.find((p) => p.id === row.listener)!, row.text, row.at)).toBe(true);
  }
  const full = save(g);
  expect(
    save(replay(full.seed, full.inputs, full.minute, full.game, full.chapter, full.config, full.phase)),
  ).toEqual(full);
  const restored = load(full);
  advance(g, g.s.minute + 30);
  advance(restored, restored.s.minute + 30);
  expect(fingerprint(restored.s)).toBe(fingerprint(g.s));
});
