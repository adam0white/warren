import { describe, expect, it } from 'vitest';
import { botStep, newBot } from '../src/sim/bot.ts';
import { act, advance, newGame } from '../src/sim/game.ts';
import { idx, SURF, USE } from '../src/sim/grid.ts';
import { CAST_IDS } from '../src/sim/people.ts';
import { assignmentFor } from '../src/sim/roles.ts';
import { advanceTo, makeWorld, offersFor } from '../src/sim/warren.ts';

describe('scoped canonical role work', () => {
  it('records scoped work that people actually finish through autonomous actions', () => {
    const g = newGame(7);
    const keeper = newBot();
    for (let hour = 0; hour < 12; hour++) {
      botStep(g, keeper);
      advance(g, g.s.minute + 60);
    }
    const completed = Object.entries(g.s.flags).filter(
      ([key, value]) => key.startsWith('role-work:') && value > 0,
    );
    expect(completed.length).toBeGreaterThan(0);
    expect(completed.every(([key]) => key.slice('role-work:'.length) in CAST_IDS)).toBe(true);
  });
  it('changes host-authored Meryem assignments and never credits an unsupervised survey', () => {
    const a = newGame(7),
      b = newGame(7);
    a.s.minute = b.s.minute = 12 * 60;
    // Explicit host assignment fixtures, independent of any old shelf history.
    a.s.flags['routine:meryem'] = 1;
    b.s.flags['routine:meryem'] = 2;
    const p = a.s.people.find((p) => p.id === 'meryem')!,
      q = b.s.people.find((p) => p.id === 'meryem')!;
    expect(assignmentFor(a.s, p.id)).toBe(0);
    expect(assignmentFor(b.s, q.id)).toBe(1);
    expect(offersFor(a.s, p).some((x) => x.action === 'survey-route')).toBe(false);
    const adviser = a.s.people.find((p) => p.id === 'yusuf')!;
    const advice = offersFor(a.s, adviser).find((x) => x.action === 'digging-advice')!;
    a.s.pos.yusuf = a.s.hill.use.findIndex((u) => u === USE.hearth);
    adviser.activity = { action: advice.action, affordance: advice, endsAt: a.s.minute + 60 } as never;
    const survey = offersFor(a.s, p).find((x) => x.action === 'survey-route');
    expect(survey).toBeDefined();
    adviser.activity = null;
    const outcome = makeWorld(a.s).resolve(
      p,
      {
        action: 'survey-route',
        affordance: survey,
        affordanceId: survey!.id,
        startedAt: p.now,
        endsAt: p.now + 45,
      } as never,
      'ended',
    );
    expect(outcome.status).toBe('interrupted');
    expect(a.s.flags['role-work:meryem']).toBeUndefined();
    expect(offersFor(b.s, q).some((x) => x.action === 'household-work')).toBe(true);
  });
  it('keeps a cooked household portion real and requires an actual supervisor for apprentices', () => {
    const g = newGame(7);
    g.s.minute = 12 * 60;
    const cook = g.s.people.find((p) => p.id === 'maryam')!,
      house = g.s.houses.find((h) => h.members.includes(cook.id))!;
    const offer = offersFor(g.s, cook).find((x) => x.action === 'cook');
    expect(offer).toBeDefined();
    const before = house.jars;
    makeWorld(g.s).resolve(
      cook,
      {
        ...offer,
        affordance: offer,
        affordanceId: offer!.id,
        action: 'cook',
        startedAt: cook.now,
        endsAt: cook.now + 60,
      } as never,
      'ended',
    );
    expect(house.jars).toBeLessThan(before);
    expect(house.prepared).toBeGreaterThan(0);
    const apprentice = g.s.people.find((p) => p.id === 'tariq')!;
    expect(act(g, { verb: 'release', who: 'yusuf' })).toBe(true);
    expect(offersFor(g.s, apprentice).some((x) => x.action === 'building-preparation')).toBe(false);
  });
  it('refuses completion credit when household grain was consumed before the pot finished', () => {
    const { s } = newGame(7);
    s.minute = 12 * 60;
    const cook = s.people.find((p) => p.id === 'maryam')!;
    const offer = offersFor(s, cook).find((x) => x.action === 'cook')!;
    s.houses.find((h) => h.members.includes(cook.id))!.jars = 0;
    const outcome = makeWorld(s).resolve(
      cook,
      {
        action: 'cook',
        affordance: offer,
        affordanceId: offer.id,
        startedAt: cook.now,
        endsAt: cook.now + 60,
      } as never,
      'ended',
    );
    expect(outcome.status).toBe('interrupted');
    expect(s.flags['role-work:maryam']).toBeUndefined();
  });
  it('does not offer unsupervised sacks to minors on a connected route', () => {
    const { s } = newGame(7);
    s.minute = 12 * 60;
    s.linked = true;
    const cell = idx(17, SURF + 3);
    s.hill.theirStore = [cell];
    s.hill.use[cell] = USE.store;
    s.hill.grain[cell] = 0;
    s.theirGrain = 30;
    for (const p of s.people) s.pos[p.id] = cell;
    expect(offersFor(s, s.people.find((p) => p.id === 'meryem')!).some((a) => a.action === 'take')).toBe(
      true,
    );
    for (const id of ['tariq', 'kian'])
      expect(offersFor(s, s.people.find((p) => p.id === id)!).some((a) => a.action === 'take')).toBe(false);
  });
  it('confiscates prepared household grain with raw surface grain in a real raid', () => {
    const { s } = newGame(7);
    const raid = s.raids[1]!;
    raid.stage = 'smoke';
    raid.riders = s.minute + 5;
    raid.leave = s.minute + 60;
    for (const h of s.houses) {
      h.jars = 0;
      h.prepared = 4;
    }
    advanceTo(s, s.minute + 5);
    expect(s.houses.every((h) => h.prepared === 0)).toBe(true);
    expect(s.raids[1]?.took).toBeGreaterThanOrEqual(s.houses.length * 4);
  });
});
