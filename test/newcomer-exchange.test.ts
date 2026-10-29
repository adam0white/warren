import { writeFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import { act, advance, load, newGame, replay, type Saved, save, stateJson } from '../src/sim/game.ts';
import { K, surfaceCell, USE } from '../src/sim/grid.ts';
import { enqueue, enqueueHouseholdArrival } from '../src/sim/hf4.ts';
import { newcomerWords } from '../src/sim/newcomer-exchange.ts';
import { arrivingFamily } from '../src/sim/people.ts';
import { newWarren, note, offersFor } from '../src/sim/warren.ts';

/** Generated household at a declared opening; all admission inputs remain in the chapter. */
function opening(seed = 7, declared = true) {
  const s = newWarren(seed, true, undefined, 1740);
  s.edition = '0.7.0';
  s.refuge = { slept: {}, raids: {}, forage: { day: -1, gathered: 0 } };
  s.next = { config: 'warren-rest/2' };
  const used = new Set(s.usedNames);
  const family = arrivingFamily(seed, 1, s.minute, 8, used);
  s.arrivals = 1;
  s.usedNames = [...used];
  s.houses.push(family.house);
  for (const person of family.people) s.pos[person.id] = surfaceCell(8);
  if (declared) enqueueHouseholdArrival(s, family.people);
  else
    for (const authored of family.people)
      enqueue(s, 'person.arrived', { authored, arrivalEvidenceId: `arrival:${authored.id}` });
  note(s, {
    kind: 'arrival',
    who: family.people[0]!.id,
    text: 'The family came up the road with a donkey.',
    weight: 2,
    cell: surfaceCell(8),
  });
  const chapter = { version: 'warren-hf4-cast/1' as const, inputs: [], claims: [], initial: stateJson(s) };
  const g = newGame(seed, '0.7.0', chapter, 'warren-rest/2');
  return { g, family, who: family.people[0]!.id };
}
function admitted(seed = 7) {
  const fixture = opening(seed);
  advance(fixture.g, 1770);
  for (const person of fixture.family.people)
    expect(fixture.g.s.people.some((p) => p.id === person.id)).toBe(true);
  return fixture;
}
function exactReplay(g: ReturnType<typeof opening>['g']) {
  const full = JSON.parse(JSON.stringify(save(g)));
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
  expect(save(restored)).toEqual(full);
  expect(save(replayed)).toEqual(full);
  return { full, restored, replayed };
}
it('requires public identity declarations before admitting the generated household', () => {
  const negative = opening(7, false);
  expect(() => advance(negative.g, 1770)).toThrow(/invalid-admission/);
  admitted();
});
it('records actual travel and work, then retains the selected place and withdrawal', () => {
  const { g, who } = admitted();
  if (process.env.WARREN_NEWCOMER_PROOF)
    writeFileSync(process.env.WARREN_NEWCOMER_PROOF, JSON.stringify(save(g)));
  expect(act(g, { verb: 'invite-newcomer', who })).toBe(true);
  expect(act(g, { verb: 'talk-rest', who })).toBe(false);
  for (let n = 0; n < 20 && g.s.newcomerExchanges![0]!.phase === 'visit'; n++) advance(g, g.s.minute + 30);
  const r = g.s.newcomerExchanges![0]!;
  expect(r.phase, JSON.stringify(r)).toBe('choose');
  expect(r.answers.some((a) => a.action === 'play' && a.verdict === 'assented')).toBe(true);
  expect(r.visit!.workFrom).toBeGreaterThan(r.visit!.startedAt);
  expect(r.visit!.at - r.visit!.workFrom).toBeGreaterThanOrEqual(30);
  expect(r.visit!.authoredBy).toBe('Warren');
  expect(r.visit!.text).toContain(`${r.name} says`);
  expect(newcomerWords(g.s, who)).not.toMatch(
    /HF|Warren|at square \d|minute \d|Chosen activity|recorded members/,
  );
  expect(r.source.arrival!.text).toContain('donkey');
  const hearth = g.s.hill.use.findIndex((use) => use === USE.hearth);
  const cell = hearth + 1;
  expect(g.s.hill.kind[cell]).toBe(K.open);
  expect(act(g, { verb: 'walk-newcomer', who, cell })).toBe(true);
  expect(
    offersFor(g.s, g.s.people.find((p) => p.id === who)!).some((o) => o.id.startsWith('newcomer-walk-')),
  ).toBe(true);
  expect(act(g, { verb: 'use', cells: [cell], use: 'beds' })).toBe(true);
  expect(act(g, { verb: 'withdraw-newcomer', who })).toBe(true);
  const ended = g.s.newcomerExchanges![0]!;
  expect(ended.walk!.ground.use).toBe(USE.none);
  expect(ended.walk!.terminal!.use).toBe(USE.beds);
  expect(ended.withdrawn).toBe(true);
  expect(ended.phase).toBe('done');
  expect(act(g, { verb: 'invite-newcomer', who })).toBe(false);
  expect(act(g, { verb: 'walk-newcomer', who, cell })).toBe(false);
  exactReplay(g);
});

it('ends an invitation on the bell without inventing completed words', () => {
  const { g, who } = admitted();
  expect(act(g, { verb: 'invite-newcomer', who })).toBe(true);
  expect(act(g, { verb: 'bell' })).toBe(true);
  advance(g, g.s.minute + 30);
  const r = g.s.newcomerExchanges![0]!;
  expect(r.phase).toBe('done');
  expect(r.interrupted?.reason).toMatch(/bell|danger/i);
  expect(r.visit).toBeUndefined();
  expect(act(g, { verb: 'invite-newcomer', who })).toBe(false);
  exactReplay(g);
});

it('refuses an invitation while the same person has a resident request', () => {
  const { g, who } = admitted();
  expect(act(g, { verb: 'talk-rest', who })).toBe(true);
  const before = save(g);
  expect(act(g, { verb: 'invite-newcomer', who })).toBe(false);
  expect(save(g)).toEqual(before);
});

let complete: Saved;
let continuation: Saved;
beforeAll(() => {
  const { g, who } = admitted();
  expect(act(g, { verb: 'invite-newcomer', who })).toBe(true);
  for (let n = 0; n < 20 && g.s.newcomerExchanges![0]!.phase === 'visit'; n++) advance(g, g.s.minute + 30);
  expect(g.s.newcomerExchanges![0]!.visit).toBeDefined();
  expect(act(g, { verb: 'withdraw-newcomer', who })).toBe(true);
  complete = JSON.parse(JSON.stringify(save(g)));
  advance(g, complete.minute + 1440);
  continuation = save(g);
}, 60000);

it.each(['native', 'replay'] as const)(
  'continues all actors and RNG for 1440 minutes from %s',
  (mode) => {
    const g =
      mode === 'native'
        ? load(complete)
        : replay(
            complete.seed,
            complete.inputs,
            complete.minute,
            complete.game,
            complete.chapter,
            complete.config,
            complete.phase,
          );
    expect(save(g)).toEqual(complete);
    advance(g, complete.minute + 1440);
    expect(save(g)).toEqual(continuation);
  },
  60000,
);

it('records the actual answer to a second invitation while ordinary work is in progress', () => {
  const { g, who } = admitted();
  expect(act(g, { verb: 'invite-newcomer', who })).toBe(true);
  for (let n = 0; n < 20 && g.s.newcomerExchanges![0]!.phase === 'visit'; n++) advance(g, g.s.minute + 30);
  expect(g.s.newcomerExchanges![0]!.visit).toBeDefined();
  const cell = g.s.hill.use.findIndex((use) => use === USE.hearth);
  expect(act(g, { verb: 'walk-newcomer', who, cell })).toBe(true);
  for (let n = 0; n < 16 && g.s.newcomerExchanges![0]!.phase === 'walk'; n++) advance(g, g.s.minute + 30);
  const r = g.s.newcomerExchanges![0]!;
  expect(r.phase, JSON.stringify(r)).toBe('done');
  const answers = r.answers.filter((a) => a.phase === 'walk');
  expect(answers[0]?.verdict).toBe('assented');
  expect(answers.at(-1)?.action).toBe('reap');
  expect(answers.at(-1)?.verdict).toBeUndefined();
  expect(r.walk!.result, JSON.stringify(r)).toBeUndefined();
  expect(r.interrupted, JSON.stringify(r)).toBeDefined();
  exactReplay(g);
});

it('distinguishes generated young children from older children', () => {
  const { g, family } = admitted();
  const young = family.people.find((p) => (1740 * 60000 - p.identity.birthAt) / (365.25 * 86400000) < 6)!;
  expect(young).toBeDefined();
  expect(act(g, { verb: 'invite-newcomer', who: young.id })).toBe(false);
  expect(newcomerWords(g.s, young.id)).toMatch(/too young/i);
  const seed = Array.from({ length: 40 }, (_, i) => i + 1).find((n) =>
    arrivingFamily(n, 1, 1740, 8, new Set()).people.some((p) => {
      const age = (1740 * 60000 - p.identity.birthAt) / (365.25 * 86400000);
      return age >= 6 && age < 18;
    }),
  )!;
  expect(seed).toBeDefined();
  const olderOpening = admitted(seed);
  const older = olderOpening.family.people.find((p) => {
    const age = (1740 * 60000 - p.identity.birthAt) / (365.25 * 86400000);
    return age >= 6 && age < 18;
  })!;
  expect(act(olderOpening.g, { verb: 'invite-newcomer', who: older.id })).toBe(true);
  expect(olderOpening.g.s.newcomerExchanges![0]!.child).toBe(true);
  expect(olderOpening.g.s.notes.at(-1)!.text).toMatch(/No work is assigned/i);
});

// Each restoration path includes the complete live journey inside its own 60s
// deadline. Check cold HF restoration and host-input replay separately, with
// full save equality for each. Keep the actual setup inside both timed controls.
it.each(['native', 'replay'] as const)(
  'completes one optional walk after a real visit and retains the current ground through %s',
  (mode) => {
    const { g } = admitted(3);
    const who = 'kadir1';
    expect(act(g, { verb: 'invite-newcomer', who })).toBe(true);
    for (let n = 0; n < 20 && g.s.newcomerExchanges![0]!.phase === 'visit'; n++) advance(g, g.s.minute + 30);
    expect(g.s.newcomerExchanges![0]!.phase).toBe('choose');
    advance(g, 2400);
    if (process.env.WARREN_NEWCOMER_WALK_PROOF)
      writeFileSync(process.env.WARREN_NEWCOMER_WALK_PROOF, JSON.stringify(save(g)));
    const cell = g.s.hill.use.indexOf(USE.hearth);
    expect(act(g, { verb: 'walk-newcomer', who, cell })).toBe(true);
    for (let n = 0; n < 16 && g.s.newcomerExchanges![0]!.phase === 'walk'; n++) advance(g, g.s.minute + 30);
    const r = g.s.newcomerExchanges![0]!;
    expect(r.phase, JSON.stringify(r)).toBe('done');
    expect(r.walk?.result, JSON.stringify(r)).toBeDefined();
    expect(r.walk!.result!.at - r.walk!.result!.workFrom).toBeGreaterThanOrEqual(30);
    expect(r.walk!.result!.ground.use).toBe(g.s.hill.use[cell]);
    expect(r.walk!.result!.ground.cell).toBe(cell);
    expect(act(g, { verb: 'walk-newcomer', who, cell })).toBe(false);
    expect(act(g, { verb: 'invite-newcomer', who })).toBe(false);
    const full = JSON.parse(JSON.stringify(save(g)));
    const restored =
      mode === 'native'
        ? load(full)
        : replay(full.seed, full.inputs, full.minute, full.game, full.chapter, full.config, full.phase);
    expect(save(restored)).toEqual(full);
  },
  60000,
);
