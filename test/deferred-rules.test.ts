import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { DAY, HOUR } from '../src/sim/calendar.ts';
import { act, advance, fingerprint, load, newGame, replay, save, stateJson } from '../src/sim/game.ts';
import { idx, K, SURF, USE } from '../src/sim/grid.ts';
import type { Activity } from '../src/sim/hf4.ts';
import { goalsFor, makeWorld, observeRefuge, QUANTUM, touch } from '../src/sim/warren.ts';

it('refuses historical HF3 editions without rewriting their retained replay fixtures', () => {
  const bytes = readFileSync(new URL('./fixtures/deferred-legacy.json', import.meta.url), 'utf8');
  for (const row of JSON.parse(bytes).rows)
    expect(() => replay(row.seed, row.inputs, row.at, row.edition)).toThrow(/start fresh/i);
  expect(readFileSync(new URL('./fixtures/deferred-legacy.json', import.meta.url), 'utf8')).toBe(bytes);
});
it('requires actual completed sleep in marked beds, not capacity or an interrupted sleep', () => {
  const { s } = newGame(7, '0.7.0');
  const bed = idx(s.hill.surface.entrance, SURF + 3);
  s.hill.kind[bed] = K.open;
  s.hill.use[bed] = USE.beds;
  for (const p of s.people) {
    s.pos[p.id] = bed;
    s.trips[p.id] = { action: 'sleep', end: bed, cells: [bed], times: [s.minute], workFrom: s.minute };
  }
  const goal = goalsFor(s).find((g) => g.id === 'beds')!;
  expect(goal.done(s)).toBe(false);
  for (const p of s.people) {
    const startedAt = p.now;
    p.now += 2 * HOUR;
    const activity = { action: 'sleep', affordanceId: 'sleep-below', startedAt, endsAt: p.now } as Activity;
    makeWorld(s).resolve(p, activity, 'interrupted');
    expect(goal.done(s)).toBe(false);
    makeWorld(s).resolve(p, activity, 'ended');
  }
  expect(goal.done(s)).toBe(true);
});
it('does not award a protected raid for scouts or for people caught above ground', () => {
  const g = newGame(7, '0.7.0');
  const goal = goalsFor(g.s).find((g) => g.id === 'raid')!;
  g.s.raids[0]!.stage = 'gone';
  expect(goal.done(g.s)).toBe(false);
  const raid = g.s.raids[1]!;
  raid.stage = 'riders';
  observeRefuge(g.s);
  raid.stage = 'gone';
  expect(goal.done(g.s)).toBe(false);
  expect(g.s.refuge?.raids[String(raid.riders)]?.exposed.length).toBeGreaterThan(0);
});
it('keeps forage finite and meals consume actual host grain with no food from empty jars', () => {
  const { s } = newGame(7, '0.7.0');
  const p = s.people.find((p) => p.id === 'meryem')!;
  const house = s.houses.find((h) => h.members.includes(p.id))!;
  house.jars = 0;
  house.prepared = 0;
  const startedAt = p.now;
  p.now += DAY;
  s.trips[p.id] = { action: 'forage', end: s.pos[p.id]!, cells: [], times: [], workFrom: startedAt };
  const forage = { action: 'forage', affordanceId: 'forage', startedAt, endsAt: p.now } as Activity;
  makeWorld(s).resolve(p, forage, 'ended');
  const first = house.jars;
  makeWorld(s).resolve(p, forage, 'ended');
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(0.1);
  expect(house.jars).toBe(first);
  const eat = { action: 'eat', affordanceId: 'eat-home', startedAt, endsAt: p.now } as Activity;
  const meal = makeWorld(s).resolve(p, eat, 'ended');
  expect(meal.needs?.food).toBeGreaterThan(0);
  expect(house.jars).toBeLessThan(first);
  house.jars = 0;
  expect(makeWorld(s).resolve(p, eat, 'ended').needs?.food).toBe(0);
});
it('replays the opted edition and continues its saved state exactly', () => {
  const g = newGame(19, '0.7.0');
  act(g, { verb: 'bell' });
  advance(g, g.s.minute + 6 * HOUR);
  const exported = save(g);
  expect(fingerprint(replay(exported.seed, exported.inputs, exported.minute, exported.game).s)).toBe(
    exported.fingerprint,
  );
  const loaded = load(exported);
  advance(g, g.s.minute + 3 * HOUR);
  advance(loaded, loaded.s.minute + 3 * HOUR);
  expect(fingerprint(loaded.s)).toBe(fingerprint(g.s));
  expect(newGame(19).s.edition).toBe('0.7.0');
});
it('warns about loose stone before a bounded collapse damages only adjacent furnishings', async () => {
  const { DRAW, hashUnit } = await import('../src/sim/rng.ts');
  for (const edition of ['0.7.0']) {
    const { s } = newGame(7, edition);
    const p = s.people.find((p) => p.id === 'meryem')!;
    const face = Array.from({ length: 100 }, (_, i) =>
      idx(10 + (i % 10), SURF + 4 + Math.floor(i / 10)),
    ).find((c) => hashUnit(s.seed, DRAW.collapse, c, Math.floor(s.minute / QUANTUM)) < 0.3)!;
    const stand = face - 1;
    const untouched = face + 1;
    s.hill.kind[face] = K.loose;
    s.hill.known[face] = 1;
    s.hill.kind[stand] = K.open;
    s.hill.use[stand] = USE.beds;
    s.hill.lamp[stand] = 1;
    s.hill.kind[untouched] = K.open;
    s.hill.lamp[untouched] = 1;
    act({ s, inputs: [] }, { verb: 'chalk', cells: [face], on: true });
    if (edition === '0.7.0') expect(s.notes.at(-1)?.text).toMatch(/loose stone.*lamp|Loose stone.*lamp/);
    s.hill.dig[face] = 0.99;
    s.trips[p.id] = { action: 'dig', end: stand, cells: [stand], times: [p.now], workFrom: p.now };
    const startedAt = p.now;
    p.now += HOUR;
    makeWorld(s).resolve(
      p,
      { action: 'dig', affordanceId: 'dig', targetId: String(face), startedAt, endsAt: p.now } as Activity,
      'ended',
    );
    expect(s.hill.lamp[stand]).toBe(edition === '0.7.0' ? 0 : 1);
    expect(s.hill.use[stand]).toBe(edition === '0.7.0' ? USE.none : USE.beds);
    expect(s.hill.lamp[untouched]).toBe(1);
    expect(s.hill.kind[stand]).toBe(K.open);
  }
});
it('records protected presence during a real raid without counting a construction mark', () => {
  const g = newGame(7, '0.7.0');
  const { s } = g;
  const x = s.hill.surface.entrance;
  const safe = idx(x, SURF + 11);
  for (let y = SURF; y <= SURF + 11; y++) s.hill.kind[idx(x, y)] = K.open;
  for (const p of s.people) s.pos[p.id] = safe;
  const raid = s.raids[1]!;
  s.raids[0]!.stage = 'gone';
  raid.stage = 'riders';
  touch(s);
  observeRefuge(s);
  raid.stage = 'gone';
  expect(
    goalsFor(s)
      .find((g) => g.id === 'raid')!
      .done(s),
  ).toBe(true);
});
it('shows a working cut before breakthrough without changing earned work or save bytes', async () => {
  const { digProgress } = await import('../src/sim/warren.ts');
  const { s } = newGame(7, '0.7.0');
  const p = s.people.find((p) => p.id === 'meryem')!;
  const face = idx(15, SURF + 3),
    stand = face - 1;
  s.hill.kind[face] = K.rock;
  s.hill.dig[face] = 0.1;
  s.trips[p.id] = { action: 'dig', end: stand, cells: [stand], times: [p.now], workFrom: p.now };
  p.activity = {
    action: 'dig',
    affordanceId: 'dig',
    targetId: String(face),
    startedAt: p.now,
    endsAt: p.now + 4 * HOUR,
  } as Activity;
  const before = fingerprint(s);
  expect(digProgress(s, face, s.minute + HOUR)).toBeGreaterThan(digProgress(s, face, s.minute));
  expect(fingerprint(s)).toBe(before);
  expect(s.hill.dig[face]).toBe(0.1);
});
it('offers an actual HF conversation only with an awake person at the hearth and refuses a distant exchange', async () => {
  const { offersFor } = await import('../src/sim/warren.ts');
  const { s } = newGame(7, '0.7.0');
  const p = s.people.find((p) => p.id === 'meryem')!,
    q = s.people.find((p) => p.id === 'yusuf')!;
  const hearth = s.hill.use.findIndex((u) => u === USE.hearth);
  s.minute = 12 * HOUR;
  for (const actor of s.people) s.pos[actor.id] = idx(2, SURF - 1);
  s.pos[p.id] = hearth;
  s.pos[q.id] = hearth;
  q.body.asleep = false;
  const chat = offersFor(s, p).find((o) => o.id === 'chat')!;
  expect(chat.targetId).toBe(q.id);
  expect(chat.tags).toContain('conversation');
  expect(makeWorld(s).converse?.(p, q)).not.toBe(false);
  s.pos[q.id] = idx(2, SURF - 1);
  expect(makeWorld(s).converse?.(p, q)).toBe(false);
});
it('explains opted raid calls through the all-clear and keeps adolescent door help honest', async () => {
  const { bellStateWords } = await import('../src/ui/room-safety.ts');
  const { doorCandidates } = await import('../src/ui/door-help.ts');
  const g = newGame(7, '0.7.0'),
    { s } = g;
  expect(bellStateWords(s)).toMatch(/raid.*until the riders leave/i);
  const raid = s.raids[0]!;
  // A short authored physical timeline; the bell, riders and all-clear are actual simulation events.
  raid.smoke = s.minute + QUANTUM;
  raid.riders = s.minute + 2 * QUANTUM;
  raid.leave = s.minute + 4 * QUANTUM;
  const cell = idx(s.hill.surface.entrance, SURF + 1);
  s.hill.kind[cell] = K.open;
  for (const p of s.people) s.pos[p.id] = cell;
  touch(s);
  g.chapter = { version: 'warren-hf4-cast/1', inputs: [], claims: [], initial: stateJson(s) };
  advance(g, raid.smoke);
  expect(act(g, { verb: 'bell' })).toBe(true);
  expect(bellStateWords(s)).toMatch(/until the riders leave/);
  expect(bellStateWords(s)).not.toMatch(/call lasts six/);
  expect(doorCandidates(s, cell).map((p) => p.id)).toContain('meryem');
  expect(doorCandidates(s, cell).map((p) => p.id)).not.toContain('tariq');
  expect(doorCandidates(s, cell).map((p) => p.id)).not.toContain('kian');
  advance(g, raid.leave + QUANTUM);
  expect(bellStateWords(s)).toMatch(/riders have gone/);
  expect(bellStateWords(s)).not.toMatch(/ended after six|renew/);
});
