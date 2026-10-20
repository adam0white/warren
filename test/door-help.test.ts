import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/game.ts';
import { idx, K, SURF, USE } from '../src/sim/grid.ts';
import { offersFor } from '../src/sim/warren.ts';
import { doorWords } from '../src/ui/door-help.ts';

const door = idx(17, SURF + 2);
function state() {
  const s = newGame(7).s;
  s.hill.use[door] = USE.door;
  s.hill.doorWork[door] = 0;
  return s;
}

describe('door responses', () => {
  it('agrees with actual shut-door offers for alarm, age, reach and carving prerequisites', () => {
    const s = state();
    const adult = s.people.find((p) => p.id === 'hasan');
    const child = s.people.find((p) => p.id === 'zehra');
    if (!adult || !child) throw new Error('Missing founder fixtures');
    // A short open shaft makes the finished door reachable from either person.
    for (let y = SURF; y <= SURF + 2; y++) s.hill.kind[idx(17, y)] = K.open;
    s.pos[adult.id] = s.pos[child.id] = idx(17, SURF + 1);
    const canShut = (p: typeof adult) =>
      offersFor(s, p).some((a) => a.action === 'shut-door' && a.targetId === String(door));

    expect(doorWords(s, door, true)).toContain('Ring the bell');
    expect(canShut(adult)).toBe(false);
    s.bell = { at: s.minute, until: s.minute + 60, real: false };
    expect(doorWords(s, door, true)).toContain('bell is sounding');
    expect(canShut(adult)).toBe(true);
    expect(canShut(child)).toBe(false);

    const isolated = idx(2, SURF + 20);
    s.hill.kind[isolated] = K.open;
    s.pos[adult.id] = isolated;
    expect(canShut(adult)).toBe(false);
    s.pos[adult.id] = idx(17, SURF + 1);
    s.hill.doorWork[door] = 14;
    expect(doorWords(s, door, true)).toContain('must be finished');
    expect(canShut(adult)).toBe(false);
    s.hill.doorWork[door] = 0;
    expect(canShut(adult)).toBe(true);

    s.minute = s.bell.until;
    expect(doorWords(s, door, true)).toContain('Ring the bell');
    expect(canShut(adult)).toBe(false);
  });

  it('explains how the keeper can suggest shutting a rolled-back door', () => {
    const s = state();
    const words = doorWords(s, door, true);
    expect(words).toContain('rolled back');
    expect(words).toContain('Ring the bell');
    expect(words).toContain('adult');
    expect(words).toContain('reachable');
    expect(words).toContain('choose');
    expect(words.indexOf('false alarm')).toBeLessThan(words.indexOf('Ring the bell'));
    expect(words).not.toMatch(/will shut|tap.*shut/i);
  });

  it('says when a shut-door offer is already available without asking for another bell', () => {
    const s = state();
    const raid = s.raids[0];
    if (!raid) throw new Error('Missing first raid');
    for (const stage of ['smoke', 'riders'] as const) {
      raid.stage = stage;
      expect(doorWords(s, door, true)).toContain('can choose to roll it shut');
      expect(doorWords(s, door, true)).not.toContain('Ring the bell');
    }
    raid.stage = 'gone';
    s.bell = { at: s.minute, until: s.minute + 60, real: false };
    expect(doorWords(s, door, true)).toContain('bell is sounding');
    s.minute += 60;
    expect(doorWords(s, door, true)).toContain('Ring the bell');
  });

  it('distinguishes carving prerequisites and a finished shut door', () => {
    const s = state();
    s.hill.doorWork[door] = 14;
    expect(doorWords(s, door, false)).toContain('lamp near');
    expect(doorWords(s, door, true)).toContain('choose to carve');
    expect(doorWords(s, door, true)).not.toContain('Ring the bell');
    s.hill.doorWork[door] = 0;
    s.hill.shut[door] = 1;
    expect(doorWords(s, door, true)).toContain('rolled shut');
    expect(doorWords(s, door, true)).not.toContain('Ring the bell');
  });

  it('keeps the door explanation within sixty words before the live adult list', () => {
    const s = state();
    const variants = [doorWords(s, door, true)];
    s.bell = { at: s.minute, until: s.minute + 60, real: false };
    variants.push(doorWords(s, door, true));
    const raid = s.raids[0];
    if (!raid) throw new Error('Missing first raid');
    raid.stage = 'smoke';
    variants.push(doorWords(s, door, true));
    s.hill.shut[door] = 1;
    variants.push(doorWords(s, door, true));
    s.hill.doorWork[door] = 14;
    variants.push(doorWords(s, door, true), doorWords(s, door, false));
    for (const words of variants)
      expect((words.split('Nearby adults:')[0] ?? '').split(/\s+/).length).toBeLessThanOrEqual(60);
  });

  it('reads the same state without changing it', () => {
    const s = state();
    const before = JSON.stringify(s);
    expect(doorWords(s, door, true)).toBe(doorWords(s, door, true));
    expect(JSON.stringify(s)).toBe(before);
  });
});
