import { expect, it } from 'vitest';
import { botStep, newBot } from '../src/sim/bot.ts';
import { act, advance, fingerprint, load, newGame, replay, save, stateJson } from '../src/sim/game.ts';
import { faces, idx, K, SURF } from '../src/sim/grid.ts';

it('elicits two actually heard positions with real speech costs, without advice to repeat an answer', () => {
  const opening = newGame(7, '0.7.0', undefined, 'warren-next/2');
  // PHYSICAL-WORLD FIXTURE: one known loose face beside the cellar. No Person edits.
  const face = idx(15, SURF + 3);
  opening.s.hill.kind[face] = K.loose;
  opening.s.hill.known[face] = 1;
  const g = newGame(
    7,
    '0.7.0',
    {
      version: 'warren-cast/2',
      inputs: [],
      claims: [],
      initial: stateJson(opening.s),
    },
    'warren-next/2',
  );
  act(g, { verb: 'chalk', cells: [face], on: true });
  expect(act(g, { verb: 'discuss-cut' })).toBe(true);
  for (let n = 0; n < 96 && g.s.next!.discussion!.endedAt === undefined; n++) advance(g, g.s.minute + 30);
  const d = g.s.next!.discussion!;
  expect(d.statements.map((r) => r.stance)).toEqual(['pause', 'continue']);
  expect(d.statements.every((r) => r.heard)).toBe(true);
  expect(d.exchange).toBe(true);
  for (const row of d.statements) {
    expect(row.at - row.workFrom).toBeCloseTo(30);
    expect(row.workFrom).toBeGreaterThanOrEqual(row.startedAt);
    const listener = g.s.people.find((p) => p.id === row.listener)!;
    expect(listener.memory.episodes.some((e) => e.summary === row.text)).toBe(true);
    expect(listener.will.advice?.some((a) => a.sourceId === row.speaker)).not.toBe(true);
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
  advance(g, g.s.minute + 1440);
  advance(restored, restored.s.minute + 1440);
  expect(save(restored)).toEqual(save(g));
});

it('retains ordinary seeded agreement as negative evidence and replays its complete history', () => {
  const g = newGame(7, '0.7.0', undefined, 'warren-next/2');
  const bot = newBot();
  for (let n = 0; n < 2880; n++) {
    botStep(g, bot);
    if (
      !g.s.next!.discussion &&
      faces(g.s.hill).some((f) => g.s.hill.kind[f.face] === K.loose && g.s.hill.known[f.face])
    )
      act(g, { verb: 'discuss-cut' });
    advance(g, g.s.minute + 30);
    if (g.s.next!.discussion?.endedAt !== undefined) break;
  }
  const d = g.s.next!.discussion!;
  expect(d.statements.map((r) => r.stance)).toEqual(['continue', 'continue']);
  expect(d.statements.every((r) => r.heard)).toBe(true);
  expect(d.exchange).toBe(false);
  const s = save(g);
  expect(save(replay(s.seed, s.inputs, s.minute, s.game, s.chapter, s.config))).toEqual(s);
});
