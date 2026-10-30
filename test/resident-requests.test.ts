import { expect, it } from 'vitest';
import { act, advance, load, newGame, replay, save, stateJson } from '../src/sim/game.ts';
import { idx, K, SURF, USE } from '../src/sim/grid.ts';
import type { Activity } from '../src/sim/hf4.ts';
import { heard } from '../src/sim/hf4.ts';
import { requestWords, residentOffers, residentSuggestion } from '../src/sim/resident-requests.ts';
import { makeWorld } from '../src/sim/warren.ts';

const config = 'warren-rest/2' as const;
function fixture(door = false, condition?: 'alarm' | 'blocked-route') {
  const opening = newGame(
    7,
    '0.7.0',
    undefined,
    config,
    door
      ? undefined
      : (person) => ({
          ...person,
          state: {
            ...person.state,
            body: { ...person.state.body, satiety: 1, hydration: 1, sleepPressure: 0 },
          },
        }),
  );
  const face = idx(15, SURF + 3);
  opening.s.hill.kind[face] = K.loose;
  opening.s.hill.known[face] = 1;
  if (door) {
    const cell = idx(18, SURF + 1);
    opening.s.hill.use[cell] = USE.door;
    opening.s.hill.doorWork[cell] = 0;
  }
  // Labelled physical conditions belong to the chapter, before any recorded input.
  if (condition === 'alarm') opening.s.raids[0]!.stage = 'smoke';
  if (condition === 'blocked-route') opening.s.hill.shut[idx(18, SURF + 1)] = 1;
  // A pinned world fixture, never a Person edit or a canonical admission claim.
  return newGame(
    7,
    '0.7.0',
    {
      version: 'warren-hf4-cast/1',
      inputs: [],
      claims: [],
      initial: stateJson(opening.s),
    },
    config,
  );
}
function exactReplay(g: ReturnType<typeof newGame>) {
  const full = save(g);
  const replayed = replay(full.seed, full.inputs, full.minute, full.game, full.chapter, full.config);
  expect(save(replayed)).toEqual(full);
  const restored = load(full);
  advance(g, g.s.minute + 180);
  advance(restored, restored.s.minute + 180);
  advance(replayed, replayed.s.minute + 180);
  expect(save(restored)).toEqual(save(g));
  expect(save(replayed)).toEqual(save(g));
}
it('refuses obsolete resident configurations before any request can play', () => {
  for (const config of ['warren-next/1', 'warren-next/2', 'warren-rest/1'] as const)
    expect(() => newGame(7, '0.7.0', undefined, config)).toThrow(/start fresh/i);
});
it('headless control: gives a real rest conversation time, hearing and an HF choice', () => {
  const g = fixture();
  expect(act(g, { verb: 'talk-rest', who: 'meryem' })).toBe(true);
  expect(act(g, { verb: 'talk-rest', who: 'meryem' })).toBe(false);
  for (let n = 0; n < 160 && !g.s.next!.requests?.rest?.heard; n++) advance(g, g.s.minute + 30);
  const r = g.s.next!.requests!.rest!;
  expect(r.speech, JSON.stringify(r)).toBeDefined();
  expect(r.heard).toBe(true);
  expect(r.speech!.at - r.speech!.workFrom).toBeCloseTo(30, 0);
  const listener = g.s.people.find((p) => p.id === r.listener)!;
  expect(heard(listener, r.speech!.text, r.speech!.at)).toBe(true);
  expect(r.answers.length).toBeGreaterThan(0);
  const meryem = g.s.people.find((p) => p.id === 'meryem')!;
  expect(
    makeWorld(g.s)
      .affordancesFor(meryem)
      .some((a) => a.action === 'rest'),
  ).toBe(true);
  exactReplay(g);
});
it('refuses a follow-up without an actually heard disagreement', () => {
  const g = fixture();
  expect(act(g, { verb: 'talk-disagreement', who: 'meryem' })).toBe(false);
  act(g, { verb: 'chalk', cells: [idx(15, SURF + 3)], on: true });
  expect(act(g, { verb: 'discuss-cut' })).toBe(true);
  for (let n = 0; n < 12 && !g.s.next!.discussion?.exchange; n++) advance(g, g.s.minute + 30);
  const discussion = g.s.next!.discussion!;
  if (!discussion.exchange) {
    expect(act(g, { verb: 'talk-disagreement', who: 'meryem' })).toBe(false);
    expect(g.s.next!.requests?.disagreement).toBeUndefined();
  } else {
    expect(discussion.statements.every((row) => row.heard)).toBe(true);
    expect(act(g, { verb: 'talk-disagreement', who: 'meryem' })).toBe(true);
    for (let n = 0; n < 160 && !g.s.next!.requests?.disagreement?.heard; n++) advance(g, g.s.minute + 30);
    const r = g.s.next!.requests!.disagreement!;
    if (r.heard) expect(r.speech!.text).toMatch(/disagree/);
    expect(discussion.exchange).toBe(true);
  }
  exactReplay(g);
});
it('tests a quiet door through real HF work and records the actual shut/open consequences', () => {
  const g = fixture(true);
  const cell = idx(18, SURF + 1);
  expect(act(g, { verb: 'test-door', who: 'meryem', cell })).toBe(true);
  expect(g.s.hill.shut[cell]).toBe(0);
  for (let n = 0; n < 160 && !g.s.next!.requests?.door?.endedAt; n++) advance(g, g.s.minute + 30);
  const r = g.s.next!.requests!.door!;
  expect(
    r.results.map((x) => x.shut),
    JSON.stringify(r),
  ).toEqual([true]);
  expect(r.opened?.who).toBeDefined();
  expect(r.opened?.who).not.toBe(r.who);
  expect(g.s.hill.shut[cell]).toBe(0);
  for (const result of r.results) expect(result.at - result.workFrom).toBeGreaterThanOrEqual(7);
  expect(r.answers.length).toBeGreaterThan(0);
  expect(g.s.stats.bell).toEqual({});
  expect(g.s.bell).toBeNull();
  exactReplay(g);
});

it('keeps quiet tests out of alarms and cannot turn an unheard invitation or withdrawal into completed work', () => {
  const alarmGame = fixture(true, 'alarm');
  const cell = idx(18, SURF + 1);
  const alarm = save(alarmGame);
  expect(act(alarmGame, { verb: 'test-door', who: 'meryem', cell })).toBe(false);
  expect(save(alarmGame)).toEqual(alarm);
  exactReplay(alarmGame);
  const g = fixture(true, 'blocked-route');
  expect(act(g, { verb: 'talk-rest', who: 'meryem' })).toBe(true);
  advance(g, g.s.minute + 30);
  expect(g.s.next?.requests?.rest?.speech).toBeUndefined();
  expect(g.s.next?.requests?.rest?.heard).toBe(false);
  const minute = g.s.minute;
  const person = structuredClone(stateJson(g.s).people.find((p) => p.id === 'meryem'));
  expect(act(g, { verb: 'withdraw-request', kind: 'rest' })).toBe(true);
  expect(g.s.minute).toBe(minute);
  expect(stateJson(g.s).people.find((p) => p.id === 'meryem')).toEqual(person);
  expect(g.s.next?.requests?.rest?.withdrawn).toBe(true);
  expect(g.s.hill.shut[cell]).toBe(1);
  exactReplay(g);
});

it('does not replace the request of a conversation that is still in progress after withdrawal', () => {
  const g = fixture();
  expect(act(g, { verb: 'talk-rest', who: 'meryem' })).toBe(true);
  advance(g, g.s.minute + 30);
  expect(g.s.people.find((p) => p.id === 'meryem')?.activity?.action).toBe('talk-rest');
  expect(act(g, { verb: 'withdraw-request', kind: 'rest' })).toBe(true);
  const before = save(g);
  expect(act(g, { verb: 'talk-rest', who: 'meryem' })).toBe(false);
  expect(save(g)).toEqual(before);
});

// Exercise a stale completion against a real, completed public door trial.
it('refuses a late duplicate reopening after the door trial has completed', () => {
  const opening = newGame(10, '0.7.0');
  const cell = idx(18, SURF + 1);
  // Authored finished door; both rolls remain actual public-input outcomes.
  opening.s.hill.use[cell] = USE.door;
  opening.s.hill.doorWork[cell] = 0;
  const g = newGame(10, '0.7.0', {
    version: 'warren-hf4-cast/1',
    inputs: [],
    claims: [],
    initial: stateJson(opening.s),
  });
  expect(act(g, { verb: 'test-door', who: 'yusuf', cell })).toBe(true);
  for (let n = 0; n < 12 && g.s.next?.requests?.door?.phase !== 'open'; n++) advance(g, g.s.minute + 30);
  expect(g.s.next!.requests!.door!.phase).toBe('open');
  const yusuf = g.s.people.find((p) => p.id === 'yusuf')!;
  const offer = residentOffers(g.s, yusuf)[0]!.offer;
  const stale: Activity = {
    ...yusuf.activity!,
    affordance: offer,
    affordanceId: offer.id,
    action: offer.action,
    targetId: offer.targetId,
  };
  for (let n = 0; n < 12 && !g.s.next?.requests?.door?.endedAt; n++) advance(g, g.s.minute + 30);
  const request = g.s.next!.requests!.door!;
  expect(request.opened?.who).toBeDefined();
  expect(g.s.hill.shut[cell]).toBe(0);
  expect(request.results.map((result) => result.shut)).toEqual([true]);
  const before = structuredClone(request.results);
  const worldBefore = JSON.stringify(stateJson(g.s));
  const late = makeWorld(g.s).resolve(g.s.people.find((p) => p.id === 'yusuf')!, stale, 'ended');
  expect(late.status).toBe('interrupted');
  expect(late.needs).toBeUndefined();
  expect(request.results).toEqual(before);
  expect(JSON.stringify(stateJson(g.s))).toBe(worldBefore);
});
