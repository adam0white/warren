import { type Affordance, rememberedTerms } from '@adam0white/human-framework';
import { expect, it } from 'vitest';
import { botStep, newBot } from '../src/sim/bot.ts';
import { discussionWords } from '../src/sim/cut-discussion.ts';
import { act, advance, fingerprint, load, newGame, replay, save } from '../src/sim/game.ts';
import { faces, idx, K, SURF } from '../src/sim/grid.ts';
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
  for (let step = 0; step < 96 && g.s.next?.discussion?.endedAt === undefined; step++)
    advance(g, g.s.minute + QUANTUM);
  const d = g.s.next!.discussion!;
  expect(d.statements.length, JSON.stringify(d)).toBe(2);
  expect(d.statements.map((row) => row.stance)).toEqual(['pause', 'pause']);
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
  const term = (id: string, action: string) =>
    rememberedTerms(
      listener,
      { id, action, label: id, duration: 30, effort: 0, advertises: {} } as Affordance,
      listener.now,
    ).filter((t) => t.source === `suggestion:remembered:${row.speaker}`);
  const intended = row.stance === 'continue' ? `dig-${face}` : `cut-pause-${face}`;
  expect(term(intended, row.stance === 'continue' ? 'dig' : 'discuss-cut').length).toBe(1);
  expect(term(`dig-${face + 1}`, 'dig')).toEqual([]);
  expect(term(`cut-pause-${face + 1}`, 'discuss-cut')).toEqual([]);
  expect(term('rest', 'rest')).toEqual([]);
}

it('keeps actually heard continued-digging advice on the marked face in the seeded encounter', () => {
  const g = newGame(7, '0.7.0', undefined, 'warren-next/1');
  const bot = newBot();
  for (let i = 0; i < 2880; i++) {
    botStep(g, bot);
    if (
      !g.s.next!.discussion &&
      faces(g.s.hill).some((f) => g.s.hill.kind[f.face] === K.loose && g.s.hill.known[f.face])
    )
      act(g, { verb: 'discuss-cut' });
    advance(g, g.s.minute + QUANTUM);
    if (g.s.next!.discussion?.endedAt !== undefined) break;
  }
  const d = g.s.next!.discussion!;
  expect(d.statements.map((row) => row.stance)).toEqual(['continue', 'continue']);
  expect(d.statements.every((row) => row.heard)).toBe(true);
  expect(d.exchange).toBe(false);
  checkLocalAdvice(g, d.statements.at(-1)!);
  const s = save(g);
  expect(fingerprint(replay(s.seed, s.inputs, s.minute, s.game, s.chapter, s.config).s)).toBe(s.fingerprint);
});
