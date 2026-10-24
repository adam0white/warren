import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/game.ts';
import { idx, K, SURF, USE } from '../src/sim/grid.ts';
import {
  compactShelterWords,
  sleepingCapacity,
  sleepingCapacityWords,
  sleepingRoomWords,
} from '../src/ui/shelter.ts';

function withBeds(xs: number[]) {
  const s = newGame(7, '0.4.0').s;
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
    expect(words).toMatch(/room has about six/i);
    expect(words).toContain('All rooms have about nine.');
    expect(words).not.toMatch(/\d/);
    expect(sleepingRoomWords(s, idx(20, SURF + 3))).toMatch(/about three/);
    expect(sleepingRoomWords(s, idx(19, SURF + 3))).toBe('');
  });

  it('labels room capacity but compares the village with all marked beds', () => {
    const s = withBeds([16, 17, 20]);
    expect(sleepingCapacity(s)).toEqual({ places: 9, people: 9, enough: true });
    const words = sleepingRoomWords(s, idx(16, SURF + 3));
    expect(words).toContain('This room has about six sleeping places.');
    expect(words).toContain('All rooms have about nine. There is space for everyone.');
    expect(words).not.toContain('The village needs more sleeping places');
    const person = s.people[0];
    if (!person) throw new Error('Missing villager');
    s.people.push({ ...person, id: 'extra' });
    expect(sleepingRoomWords(s, idx(16, SURF + 3))).toContain('The village needs more sleeping places');
  });

  it('puts the bed remedy before capacity in a short phone response', () => {
    const s = withBeds([18]);
    const words = sleepingRoomWords(s, idx(18, SURF + 3));
    expect(words.startsWith('Dig deeper, or shut stone doors')).toBe(true);
    expect(words.indexOf('shut stone doors')).toBeLessThan(words.indexOf('This room has about'));
    expect(words.split(/\s+/).length).toBeLessThanOrEqual(50);
  });

  it('compares all open sleeping marks with the people still alive', () => {
    const s = withBeds([16]);
    s.people = s.people.slice(0, 4);
    expect(sleepingCapacity(s)).toEqual({ places: 3, people: 4, enough: false });
    expect(sleepingCapacityWords(s)).toMatch(/more sleeping places/);
    expect(sleepingRoomWords(s, idx(16, SURF + 3))).toMatch(/The village needs more sleeping places/);
    const person = s.people[0];
    if (!person) throw new Error('Missing villager');
    person.body.alive = false;
    expect(sleepingCapacity(s)).toEqual({ places: 3, people: 3, enough: true });
    expect(sleepingCapacityWords(s)).toMatch(/space for everyone/i);
    expect(sleepingRoomWords(s, idx(16, SURF + 3))).toMatch(/There is space for everyone/);
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

describe('compact shelter words', () => {
  it('reports zero capacity and zero exposed people without a safety claim', () => {
    const s = withBeds([]);
    s.people = [];
    expect(compactShelterWords(s)).toBe('Sleeping room for about zero · zero exposed');
  });

  it('keeps sleeping capacity separate from exposure and counts hiding separately', () => {
    const s = withBeds([16, 17]);
    s.people = s.people.slice(0, 4);
    const [above, near, deep, hiding] = s.people;
    if (!above || !near || !deep || !hiding) throw new Error('Missing people');
    s.trips = {};
    for (let y = SURF; y < SURF + 12; y++) s.hill.kind[idx(17, y)] = K.open;
    s.pos[above.id] = idx(17, SURF - 1);
    s.pos[near.id] = idx(18, SURF + 1);
    s.pos[deep.id] = idx(17, SURF + 11);
    s.pos[hiding.id] = idx(17, SURF - 1);
    hiding.activity = { ...hiding.activity, action: 'hide' } as NonNullable<typeof hiding.activity>;
    const words = compactShelterWords(s);
    expect(words).toBe('Sleeping room for about six · two exposed · one hiding');
    expect(words).not.toMatch(/safe|secure/);
  });

  it('uses current trip position, ignores dead people and leaves state unchanged', () => {
    const s = withBeds([]);
    s.people = s.people.slice(0, 2);
    const [traveller, dead] = s.people;
    if (!traveller || !dead) throw new Error('Missing people');
    dead.body.alive = false;
    s.trips[traveller.id] = {
      action: 'shelter',
      cells: [idx(17, SURF - 1), idx(17, SURF + 11)],
      times: [s.minute, s.minute + 60],
      workFrom: s.minute + 60,
      end: idx(17, SURF + 11),
    };
    s.pos[traveller.id] = idx(17, SURF + 11);
    const before = JSON.stringify(s);
    expect(compactShelterWords(s)).toContain('one exposed');
    expect(JSON.stringify(s)).toBe(before);
  });
});
