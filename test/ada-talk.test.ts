import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { act, advance, load, newGame, replay, save, stateJson } from '../src/sim/game.ts';

it('headless causal control: Kian and Tamar choose costed, actually heard words about Ada', () => {
  const g = newGame(7);
  const care = structuredClone(g.s.adaVisit);
  expect(act(g, { verb: 'ask-ada' })).toBe(true);
  for (let n = 0; n < 160 && !g.s.adaTalks?.[0]?.endedAt; n++) advance(g, g.s.minute + 30);
  const r = g.s.adaTalks![0]!;
  expect(
    r.statements.map((x) => x.who),
    JSON.stringify(r),
  ).toEqual(['kian', 'tamar']);
  expect(r.statements.every((x) => x.heard)).toBe(true);
  expect(r.endedAt).toBeDefined();
  for (const row of r.statements) {
    expect(row.at - row.workFrom).toBeGreaterThanOrEqual(30);
    expect(row.workFrom).toBeGreaterThanOrEqual(row.startedAt);
    expect(
      g.s.people.find((p) => p.id === row.listener)!.memory.episodes.some((e) => e.summary === row.text),
    ).toBe(true);
  }
  expect(r.statements[1]!.text).toContain(r.statements[0]!.words);
  expect(r.answers.length).toBeGreaterThan(0);
  expect(r.statements[0]!.words).toContain('I cannot tell you how hungry, thirsty or tired she is now');
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
  );
  expect(JSON.stringify(save(replayed))).toBe(JSON.stringify(full));
  for (const run of [g, restored, replayed]) advance(run, full.minute + 1440);
  expect(JSON.stringify(save(restored))).toBe(JSON.stringify(save(g)));
  expect(JSON.stringify(save(replayed))).toBe(JSON.stringify(save(g)));
});

it('refuses unavailable requests without changing old state and retains words after an alarm and withdrawal', () => {
  const old = newGame(7, '0.4.0');
  const before = JSON.stringify(save(old));
  expect(act(old, { verb: 'ask-ada' })).toBe(false);
  expect(JSON.stringify(save(old))).toBe(before);
  const g = newGame(7);
  expect(act(g, { verb: 'ask-ada' })).toBe(true);
  const pending = JSON.stringify(save(g));
  expect(act(g, { verb: 'ask-ada' })).toBe(false);
  expect(JSON.stringify(save(g))).toBe(pending);
  while (!g.s.adaTalks![0]!.statements.length && g.s.minute < 5000) advance(g, g.s.minute + 30);
  const spoken = structuredClone(g.s.adaTalks![0]!.statements);
  expect(spoken).toHaveLength(1);
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
  const replayed = replay(after.seed, after.inputs, after.minute, after.game, after.chapter, after.config);
  // Intermediate saves may insert the existing community property before why.
  // Compare all native values directly; no field is removed or rounded.
  expect(save(replayed)).toEqual(after);
});

it('keeps endogenous sleep ahead of a pending request without removing earned history', () => {
  const g = newGame(7);
  advance(g, 1440);
  const kian = g.s.people.find((p) => p.id === 'kian')!;
  expect(kian.body.asleep || kian.activity?.action === 'sleep').toBe(true);
  expect(act(g, { verb: 'ask-ada' })).toBe(true);
  advance(g, 1620);
  expect(g.s.adaTalks![0]!.statements).toEqual([]);
  expect(kian.body.asleep || kian.activity?.action === 'sleep').toBe(true);
  expect(g.s.adaTalks![0]!.endedAt).toBeUndefined();
  const earned = structuredClone(g.s.notes);
  expect(act(g, { verb: 'withdraw-ada-talk' })).toBe(true);
  expect(g.s.notes.slice(0, earned.length)).toEqual(earned);
  expect(g.s.adaTalks![0]!.statements).toEqual([]);
});

it('does not complete interrupted speech or replace work still in progress after withdrawal', () => {
  const g = newGame(7);
  expect(act(g, { verb: 'ask-ada' })).toBe(true);
  while (!g.s.people.some((p) => p.activity?.action === 'talk-ada') && g.s.minute < 5000)
    advance(g, g.s.minute + 30);
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

it('uses the existing Ada care contract as context while real care and return still compete', () => {
  const old = JSON.parse(
    readFileSync(new URL('./fixtures/genuine-care-ended.json', import.meta.url), 'utf8'),
  );
  const opening = newGame(7);
  // Declared host fixture: retain the complete archived starting care record.
  // Persons are untouched. This does not claim a new canonical Watch admission.
  opening.s.adaVisit = structuredClone(old.chapter.initial.adaVisit);
  const g = newGame(7, '0.6.0', {
    version: 'warren-cast/2',
    inputs: [],
    claims: [],
    initial: stateJson(opening.s),
  });
  expect(act(g, { verb: 'care-ada' })).toBe(true);
  expect(act(g, { verb: 'ask-ada' })).toBe(true);
  while (g.s.minute < 1200 && !g.s.adaTalks![0]!.endedAt) advance(g, g.s.minute + 30);
  const r = g.s.adaTalks![0]!;
  expect(g.s.adaVisit!.careCount).toBeGreaterThan(0);
  expect(r.statements[0]?.words, JSON.stringify(r)).toContain(
    'We have shared more food, water and rest here',
  );
  expect(r.statements[0]?.words).toContain('return to the Watch together');
  expect(r.statements[0]!.at).toBeLessThan(g.s.adaVisit!.returnBy);
  const care = structuredClone(g.s.adaVisit);
  expect(r.statements.length).toBeGreaterThan(0);
  const full = JSON.parse(JSON.stringify(save(g)));
  const restored = load(full);
  const replayed = replay(full.seed, full.inputs, full.minute, full.game, full.chapter, full.config);
  expect(save(replayed)).toEqual(full);
  expect(g.s.adaVisit).toEqual(care);
  for (const run of [restored, replayed]) advance(run, full.minute + 1440);
  expect(save(restored)).toEqual(save(replayed));
  expect(restored.s.adaVisit!.returnBy).toBe(care!.returnBy);
  const before = JSON.stringify(save(restored));
  expect(act(restored, { verb: 'ask-ada' })).toBe(false);
  expect(JSON.stringify(save(restored))).toBe(before);
});

it('dates literal imported care facts without claiming a new observation or rewriting provenance', () => {
  const bytes = readFileSync(new URL('./fixtures/genuine-care-ended.json', import.meta.url), 'utf8');
  const source = JSON.parse(bytes);
  const control = newGame(source.seed, source.game, source.chapter);
  advance(control, 750);
  const g = newGame(source.seed, source.game, source.chapter);
  const care = structuredClone(g.s.adaVisit);
  expect(act(g, { verb: 'ask-ada' })).toBe(true);
  advance(g, 750);
  const r = g.s.adaTalks![0]!;
  expect(r.statements.length).toBe(2);
  const row = r.statements[0]!;
  expect(row.words).toContain(
    `The last care note is from ${row.at - care!.dependent.sourceMinute} game minutes ago`,
  );
  expect(row.words).toContain('It recorded that she had eaten');
  expect(row.words).toContain('I have no newer observation of her condition');
  expect(row.words).not.toContain('looks rested');
  expect(g.s.adaVisit).toEqual(control.s.adaVisit);
  expect(JSON.stringify(g.chapter)).toBe(JSON.stringify(source.chapter));
  expect(readFileSync(new URL('./fixtures/genuine-care-ended.json', import.meta.url), 'utf8')).toBe(bytes);
  const full = save(g);
  const replayed = replay(full.seed, full.inputs, full.minute, full.game, full.chapter, full.config);
  expect(save(replayed)).toEqual(full);
  const restored = load(full);
  for (const run of [restored, replayed]) advance(run, full.minute + 1440);
  expect(save(restored)).toEqual(save(replayed));
});
