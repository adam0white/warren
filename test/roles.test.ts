import { ENGINE_VERSION } from '@adam0white/human-framework';
import { createPersona, initialPersonaLife, preparePersonaLife } from '@adam0white/lab-client';
import { describe, expect, it } from 'vitest';
import { applyLife } from '../src/sim/cast.ts';
import { advance, newGame } from '../src/sim/game.ts';
import { idx, SURF, USE } from '../src/sim/grid.ts';
import { CAST_IDS } from '../src/sim/people.ts';
import { advanceTo, makeWorld, offersFor } from '../src/sim/warren.ts';

async function life(id: string, assignment: number) {
  const castId = CAST_IDS[id]!;
  const envelope = await createPersona({
    format: 'hf-persona/1',
    castId,
    castRevision: '1',
    branchId: 'role-control',
    parentRevision: null,
    source: { game: 'warren', build: 'control', engine: ENGINE_VERSION, rules: 'warren-0.5.0' },
    transfer: { life: initialPersonaLife(castId, 'role-control', 0) },
    limitations: [],
  });
  const input = preparePersonaLife(envelope, 0);
  input.life.assignment = assignment;
  return input;
}
describe('scoped canonical role work', () => {
  it('lets all six actually finish their scoped work through ordinary autonomous actions', () => {
    const g = newGame(7);
    advance(g, 3 * 1440);
    for (const id of Object.keys(CAST_IDS)) expect(g.s.flags[`role-work:${id}`] ?? 0).toBeGreaterThan(0);
  });
  it('changes real Meryem offers and never counts rest as a survey', async () => {
    const a = newGame(7),
      b = newGame(7);
    a.s.minute = b.s.minute = 12 * 60;
    applyLife(a.s, await life('meryem', 0));
    applyLife(b.s, await life('meryem', 1));
    const p = a.s.people.find((p) => p.id === 'meryem')!,
      q = b.s.people.find((p) => p.id === 'meryem')!;
    expect(
      p.agenda.goals.find((g) => g.id === 'between-games-assignment')!.advancedBy.map((x) => x.action),
    ).toEqual(['survey-route']);
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
    for (const p of g.s.people) if (p.id === 'yusuf') p.body.alive = false;
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
    s.people = [];
    advanceTo(s, s.minute + 5);
    expect(s.houses.every((h) => h.prepared === 0)).toBe(true);
    expect(raid.took).toBeGreaterThanOrEqual(s.houses.length * 4);
  });
});
