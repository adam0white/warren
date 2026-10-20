import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/game.ts';
import { idx, K, SURF, USE } from '../src/sim/grid.ts';
import { sleepingCapacity, sleepingCapacityWords, sleepingRoomWords } from '../src/ui/shelter.ts';

function withBeds(xs: number[]) {
  const s = newGame(7).s;
  s.hill.use.fill(USE.none);
  for (const x of xs) {
    const cell = idx(x, SURF + 3);
    s.hill.kind[cell] = K.open;
    s.hill.use[cell] = USE.beds;
  }
  return s;
}

describe('sleeping capacity words', () => {
  it('describes only the connected sleeping room under the pointer', () => {
    const s = withBeds([16, 17, 20]);
    const words = sleepingRoomWords(s, idx(16, SURF + 3));
    expect(words).toMatch(/room for about six people/i);
    expect(words).not.toMatch(/nine|\d/);
    expect(sleepingRoomWords(s, idx(20, SURF + 3))).toMatch(/about three/);
    expect(sleepingRoomWords(s, idx(19, SURF + 3))).toBe('');
  });

  it('compares all open sleeping marks with the people still alive', () => {
    const s = withBeds([16]);
    s.people = s.people.slice(0, 4);
    expect(sleepingCapacity(s)).toEqual({ places: 3, people: 4, enough: false });
    expect(sleepingCapacityWords(s)).toMatch(/more sleeping places/);
    expect(sleepingRoomWords(s, idx(16, SURF + 3))).toMatch(/cannot hold the whole village/);
    const person = s.people[0];
    if (!person) throw new Error('Missing villager');
    person.body.alive = false;
    expect(sleepingCapacity(s)).toEqual({ places: 3, people: 3, enough: true });
    expect(sleepingCapacityWords(s)).toMatch(/enough.*village/i);
    expect(sleepingRoomWords(s, idx(16, SURF + 3))).toMatch(/Enough sleeping space for the village/);
  });

  it('does not count beds marked on unopened ground or other room uses', () => {
    const s = withBeds([16, 17]);
    s.hill.kind[idx(16, SURF + 3)] = K.rock;
    s.hill.use[idx(17, SURF + 3)] = USE.store;
    expect(sleepingCapacity(s).places).toBe(0);
    expect(sleepingCapacityWords(s)).toMatch(/No sleeping places/);
    expect(sleepingRoomWords(s, idx(16, SURF + 3))).toBe('');
    expect(sleepingRoomWords(s, idx(17, SURF + 3))).toBe('');
  });

  it('uses approximate words without claiming safety or changing state', () => {
    const s = withBeds([16, 17, 18, 19, 20, 21, 22, 23]);
    const before = JSON.stringify(s);
    const words = `${sleepingRoomWords(s, idx(16, SURF + 3))} ${sleepingCapacityWords(s)}`;
    expect(words).toMatch(/about twenty-four/);
    expect(words).not.toMatch(/\d|safe|secure/);
    expect(JSON.stringify(s)).toBe(before);
  });
});
