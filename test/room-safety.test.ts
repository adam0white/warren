import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/game.ts';
import { idx, K, SURF, USE } from '../src/sim/grid.ts';
import { offersFor } from '../src/sim/warren.ts';
import { doorCandidates, doorDetailWords } from '../src/ui/door-help.ts';
import {
  bedSafety,
  bellShelterWords,
  bellStateWords,
  roomSafetyWords,
  scoutedCells,
} from '../src/ui/room-safety.ts';

function layout() {
  const s = newGame(7).s;
  s.hill.kind.fill(K.rock);
  s.hill.use.fill(USE.none);
  const x = s.hill.surface.entrance;
  for (let y = SURF; y <= SURF + 12; y++) s.hill.kind[idx(x, y)] = K.open;
  const near = idx(x, SURF + 5);
  const deep = idx(x, SURF + 12);
  s.hill.use[near] = s.hill.use[deep] = USE.beds;
  return { s, x, near, deep };
}

describe('room safety from the actual rider layout', () => {
  it('separates shallow beds from deep beds and changes only the door flags in its counterfactual', () => {
    const { s, x, near, deep } = layout();
    expect(roomSafetyWords(s, near)).toMatch(/^Dig deeper, or shut stone doors on every open route\./);
    expect(roomSafetyWords(s, deep)).toContain('Deep enough');
    expect(bedSafety(s)).toEqual({ safe: 3, exposed: 3 });
    const door = idx(x, SURF + 2);
    s.hill.use[door] = USE.door;
    s.hill.doorWork[door] = 0;
    const before = JSON.stringify(s);
    expect(roomSafetyWords(s, near)).toContain('open stone door');
    expect(JSON.stringify(s)).toBe(before);
    s.hill.shut[door] = 1;
    expect(roomSafetyWords(s, near)).toMatch(/while the stone door .* stays shut/);
    expect(bedSafety(s)).toEqual({ safe: 6, exposed: 0 });
  });
  it('names a shaft bypass rather than blaming a door on a different route', () => {
    const { s, x, near } = layout();
    s.hill.use[idx(x, SURF + 2)] = USE.door;
    s.hill.shut[idx(x, SURF + 2)] = 1;
    for (let y = SURF; y <= SURF + 5; y++) s.hill.kind[idx(x + 2, y)] = K.open;
    s.hill.kind[idx(x + 1, SURF + 5)] = K.open;
    expect(roomSafetyWords(s, near)).toContain('open shaft');
    expect(bedSafety(s).exposed).toBe(3);
  });
  it('does not claim one door blocks two parallel entrance routes', () => {
    const { s, x, near } = layout();
    const first = idx(x, SURF + 2);
    const second = idx(x + 2, SURF + 2);
    for (let y = SURF; y <= SURF + 5; y++) s.hill.kind[idx(x + 2, y)] = K.open;
    s.hill.kind[idx(x + 1, SURF + 5)] = K.open;
    s.hill.use[first] = s.hill.use[second] = USE.door;
    s.hill.doorWork[first] = s.hill.doorWork[second] = 0;
    const words = roomSafetyWords(s, near);
    expect(words).toContain('Every open route');
    expect(words).not.toMatch(/open stone door.*blocking riders/);
    s.hill.shut[first] = 1;
    expect(roomSafetyWords(s, near)).toMatch(/open stone door.*blocking riders/);
    expect(bedSafety(s).exposed).toBeGreaterThan(0);
    s.hill.shut[second] = 1;
    expect(bedSafety(s).exposed).toBe(0);
  });
  it('checks every sleeping place before promising a single door can protect a long room', () => {
    const { s } = layout();
    s.hill.kind.fill(K.rock);
    s.hill.use.fill(USE.none);
    for (const x of [3, 17]) {
      for (let y = SURF; y <= SURF + 5; y++) s.hill.kind[idx(x, y)] = K.open;
      s.hill.use[idx(x, SURF + 2)] = USE.door;
    }
    for (let x = 3; x <= 17; x++) {
      s.hill.kind[idx(x, SURF + 5)] = K.open;
      s.hill.use[idx(x, SURF + 5)] = USE.beds;
    }
    expect(roomSafetyWords(s, idx(3, SURF + 5))).toContain('Every open route');
    expect(roomSafetyWords(s, idx(3, SURF + 5))).not.toMatch(/open stone door.*blocking riders/);
    for (const x of [3, 17]) s.hill.shut[idx(x, SURF + 2)] = 1;
    expect(roomSafetyWords(s, idx(3, SURF + 5))).toMatch(/while the stone doors .* stay shut/);
  });
  it('reports legacy active, ended and renew-call states without an inferred response', () => {
    const { s } = layout();
    s.edition = '0.3.0';
    expect(bellShelterWords(s)).toContain('Sleeping places: 3');
    expect(bellStateWords(s)).toContain('Bell quiet');
    s.bell = { at: s.minute, until: s.minute + 60, real: false };
    expect(bellStateWords(s)).toContain('Call active');
    s.minute += 60;
    expect(bellStateWords(s)).toContain('Call ended');
    const person = s.people[0];
    if (!person) throw new Error('Missing person');
    s.trips[person.id] = { action: 'shelter', workFrom: s.minute + 60 } as (typeof s.trips)[string];
    expect(bellStateWords(s)).toContain('still on the way below');
    const raid = s.raids[0];
    if (!raid) throw new Error('No raid');
    raid.stage = 'smoke';
    expect(bellStateWords(s)).toContain('renew');
    s.bell = null;
    s.notes = [];
    s.stats.bell.assented = 1;
    expect(bellStateWords(s)).toContain('Call ended');
    expect(bellStateWords(s)).not.toContain('no call yet');
    Object.assign(raid, { scouted: [42, 43] });
    expect([...scoutedCells(s)]).toEqual([42, 43]);
  });
  it('names exactly the nearby adults who get the shut-door offer and their recorded task', () => {
    const { s, x } = layout();
    const cell = idx(x, SURF + 2);
    s.hill.use[cell] = USE.door;
    s.hill.doorWork[cell] = 0;
    s.bell = { at: s.minute, until: s.minute + 60, real: false };
    s.trips = {};
    for (const p of s.people) s.pos[p.id] = idx(x, SURF + 1);
    expect(doorCandidates(s, cell).map((p) => p.id)).toEqual(
      s.people.filter((p) => offersFor(s, p).some((a) => a.action === 'shut-door')).map((p) => p.id),
    );
    const words = doorDetailWords(s, cell);
    for (const p of doorCandidates(s, cell)) expect(words).toContain(`${p.name}:`);
    expect(words).not.toContain('Zehra:');
  });
});
