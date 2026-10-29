import { readRunHistory } from '@adam0white/human-framework';
import { expect, it } from 'vitest';
import { discussionWords } from '../src/sim/cut-discussion.ts';
import { act, advance, fingerprint, load, newGame, replay, save, stateJson } from '../src/sim/game.ts';
import { faces, idx, K, SURF } from '../src/sim/grid.ts';
import { archiveOf, heard } from '../src/sim/hf4.ts';
import { QUANTUM } from '../src/sim/warren.ts';

it('scopes actually chosen and attended loose-cut advice to its intended alternative', () => {
  const g = newGame(7, '0.7.0', undefined, 'warren-next/1');
  // World-only setup: an exposed loose face beside the original cellar. No Person edits.
  const face = idx(15, SURF + 3);
  g.s.hill.kind[face] = K.loose;
  g.s.hill.known[face] = 1;
  expect(act(g, { verb: 'chalk', cells: [face], on: true })).toBe(true);
  expect(faces(g.s.hill).some((row) => row.face === face)).toBe(true);
  expect(act(g, { verb: 'discuss-cut' })).toBe(true);
  const before = g.s.minute;
  for (let step = 0; step < 24 && !g.s.next?.discussion?.statements.some((row) => row.heard); step++)
    advance(g, g.s.minute + QUANTUM);
  const d = g.s.next!.discussion!;
  expect(d.statements.length, JSON.stringify(d)).toBeGreaterThan(0);
  expect(d.statements.every((row) => row.stance === 'pause')).toBe(true);
  expect(d.statements.every((row) => row.heard)).toBe(true);
  expect(d.exchange).toBe(false);
  for (const row of d.statements) {
    expect(row.at - row.workFrom).toBeCloseTo(30);
    expect(row.workFrom).toBeGreaterThanOrEqual(row.startedAt);
  }
  // The last speaker's advice remains. The first advice can be discharged by the
  // listener actually choosing that local pause alternative; do not rewrite it.
  checkLocalAdvice(g, d.statements.at(-1)!);
  expect(g.s.minute).toBeGreaterThan(before);
  expect(discussionWords(g.s)).toMatch(/not a quarrel/);
  // This terrain fixture proves the encounter, not a standard seeded input-log export.
  // Ordinary seeded replay is covered separately by away.test.ts and the natural control.
  const saved = save(g);
  const resumed = load(saved);
  advance(g, g.s.minute + QUANTUM);
  advance(resumed, resumed.s.minute + QUANTUM);
  expect(fingerprint(resumed.s)).toBe(fingerprint(g.s));
});
it('does not offer an invented quarrel on a normal legacy hill or without a marked known loose cut', () => {
  for (const config of [undefined, 'warren-next/1'] as const) {
    const g = newGame(7, '0.7.0', undefined, config);
    const before = save(g);
    expect(act(g, { verb: 'discuss-cut' })).toBe(false);
    expect(save(g)).toEqual(before);
  }
});

function checkLocalAdvice(
  g: ReturnType<typeof newGame>,
  row: NonNullable<NonNullable<ReturnType<typeof newGame>['s']['next']>['discussion']>['statements'][number],
) {
  const face = g.s.next!.discussion!.face;
  const listener = g.s.people.find((p) => p.id === row.listener)!;
  expect(heard(listener, row.text, row.at)).toBe(true);
  const observations = readRunHistory(archiveOf(g.s))
    .flatMap((transaction) => transaction.inputs)
    .filter((input) => input.kind === 'observation.received');
  expect(
    observations.some(
      (input) =>
        input.kind === 'observation.received' &&
        input.payload.person === row.listener &&
        input.payload.percepts.some((percept) =>
          percept.claims.some((claim) => claim.prop === `warren-cut:${face}:advice:${row.stance}`),
        ),
    ),
  ).toBe(true);
}

it('replays a bounded public loose-cut encounter without inventing agreement or disagreement', () => {
  const opening = newGame(7, '0.7.0', undefined, 'warren-next/1');
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
    'warren-next/1',
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
    checkLocalAdvice(g, row);
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
