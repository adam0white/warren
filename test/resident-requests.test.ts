import { type Activity, stepCommunity } from '@adam0white/human-framework';
import { expect, it } from 'vitest';
import { act, advance, load, newGame, replay, save, stateJson } from '../src/sim/game.ts';
import { idx, K, SURF, USE } from '../src/sim/grid.ts';
import { requestWords, residentOffers, residentSuggestion } from '../src/sim/resident-requests.ts';
import { communityOf, makeWorld } from '../src/sim/warren.ts';

const config = 'warren-rest/1' as const;
function fixture(door = false, condition?: 'alarm' | 'blocked-route') {
  const opening = newGame(7, '0.7.0', undefined, config);
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
      version: 'warren-cast/2',
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
it('keeps new resident requests outside every retained configuration', () => {
  for (const config of [undefined, 'warren-next/1', 'warren-next/2'] as const) {
    const g = newGame(7, '0.7.0', undefined, config);
    const before = save(g);
    expect(act(g, { verb: 'talk-rest', who: 'meryem' })).toBe(false);
    expect(act(g, { verb: 'test-door', who: 'meryem', cell: idx(18, SURF + 1) })).toBe(false);
    expect(act(g, { verb: 'talk-disagreement', who: 'meryem' })).toBe(false);
    expect(save(g)).toEqual(before);
  }
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
  expect(listener.memory.episodes.some((e) => e.summary === r.speech!.text)).toBe(true);
  expect(listener.will.advice?.some((a) => a.sourceId === r.who && a.action === 'rest')).toBe(true);
  expect(r.answers.length).toBeGreaterThan(0);
  const meryem = g.s.people.find((p) => p.id === 'meryem')!;
  expect(
    makeWorld(g.s)
      .affordancesFor(meryem)
      .some((a) => a.action === 'rest'),
  ).toBe(true);
  exactReplay(g);
});
it('requires an actually heard disagreement before a voluntary follow-up, with no reconciliation claim', () => {
  const g = fixture();
  expect(act(g, { verb: 'talk-disagreement', who: 'meryem' })).toBe(false);
  act(g, { verb: 'chalk', cells: [idx(15, SURF + 3)], on: true });
  act(g, { verb: 'discuss-cut' });
  for (let n = 0; n < 96 && !g.s.next!.discussion?.exchange; n++) advance(g, g.s.minute + 30);
  expect(g.s.next!.discussion!.exchange).toBe(true);
  expect(act(g, { verb: 'talk-disagreement', who: 'meryem' })).toBe(true);
  for (let n = 0; n < 160 && !g.s.next!.requests?.disagreement?.heard; n++) advance(g, g.s.minute + 30);
  const r = g.s.next!.requests!.disagreement!;
  expect(r.heard, JSON.stringify(r)).toBe(true);
  expect(r.speech!.text).toMatch(/disagree/);
  expect(g.s.next!.discussion!.exchange).toBe(true);
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
  ).toEqual([true, false]);
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

// Completion-race control at the public HF/world boundary. These two voluntary HF
// suggestions are harness inputs, not Warren keeper inputs or a compact game replay.
it('reconciles an ordinary reopening before competing requested work can claim it', () => {
  const g = fixture(true);
  const cell = idx(18, SURF + 1);
  expect(act(g, { verb: 'test-door', who: 'maryam', cell })).toBe(true);
  advance(g, 330);
  const r = g.s.next!.requests!.door!;
  expect(r.phase).toBe('open');
  const pending = save(g);
  const requested = g.s.people.find((p) => p.id === 'maryam')!;
  const offered = residentOffers(g.s, requested)[0]!.offer;
  // Keep the offered activity snapshot to exercise a late completion callback.
  const stale: Activity = {
    ...requested.activity!,
    affordance: offered,
    affordanceId: offered.id,
    action: offered.action,
    targetId: offered.targetId,
  };
  const world = makeWorld(g.s);
  const completed: { who: string; action: string; at: number; reward: number }[] = [];
  stepCommunity(
    communityOf(g.s),
    {
      ...world,
      resolve(p, activity, reason) {
        const outcome = world.resolve(p, activity, reason);
        if (reason === 'ended' && ['open-door', 'test-open'].includes(activity.action))
          completed.push({
            who: p.id,
            action: activity.action,
            at: p.now,
            reward: outcome.needs?.competence ?? 0,
          });
        return outcome;
      },
    },
    450,
    {
      suggestions: {
        yusuf: { voiceId: 'race-control', action: 'open-door', strength: 0.7, since: 330 },
        maryam: { voiceId: 'keeper-resident', action: 'test-open', strength: 0.7, since: 317 },
      },
      lifecourse: { mortality: true },
      maxEvents: 2000,
      contagion: false,
    },
  );
  expect(completed.find((x) => x.action === 'open-door')?.who).toBe('yusuf');
  expect(g.s.hill.shut[cell]).toBe(0);
  expect(r.results.map((x) => x.shut)).toEqual([true]);
  expect(completed.filter((x) => x.action === 'test-open').every((x) => x.reward === 0)).toBe(true);
  expect(r.phase).toBe('done');
  expect(r.opened?.who).toBe('yusuf');
  expect(r.opened?.at).toBe(completed.find((x) => x.action === 'open-door')?.at);
  expect(requestWords(g.s, 'door')).toContain('Yusuf Usta reopened');
  const maryam = g.s.people.find((p) => p.id === 'maryam')!;
  expect(residentOffers(g.s, maryam)).toEqual([]);
  expect(residentSuggestion(g.s, maryam)).toBeUndefined();
  const late = world.resolve(maryam, stale, 'ended');
  expect(late.status).toBe('interrupted');
  expect(late.needs).toBeUndefined();
  expect(r.results.map((x) => x.shut)).toEqual([true]);

  // A separate, explicitly pinned already-open physical fixture has no attributed
  // reopening receipt. This is not a postpin edit or a continuation of the HF harness.
  const opening = load(pending);
  opening.s.hill.shut[cell] = 0;
  const alreadyOpen = newGame(
    7,
    '0.7.0',
    {
      version: 'warren-cast/2',
      inputs: [],
      claims: [],
      initial: stateJson(opening.s),
    },
    config,
  );
  const adult = alreadyOpen.s.people.find((p) => p.id === 'maryam')!;
  const unattributed = makeWorld(alreadyOpen.s).resolve(adult, stale, 'ended');
  expect(unattributed.status).toBe('interrupted');
  expect(unattributed.needs).toBeUndefined();
  expect(residentOffers(alreadyOpen.s, adult)).toEqual([]);
  expect(alreadyOpen.s.next!.requests!.door!.results.map((x) => x.shut)).toEqual([true]);
  expect(alreadyOpen.s.next!.requests!.door!.opened?.who).toBeUndefined();
  expect(requestWords(alreadyOpen.s, 'door')).toContain('already open');
});
