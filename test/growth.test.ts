import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/game.ts';
import { growthWords } from '../src/ui/growth.ts';

describe('the village growth record', () => {
  it('counts lifetime digging and arriving families rather than current population', () => {
    const s = newGame(7).s;
    s.stats.dug = 27;
    s.arrivals = 2;
    const words = growthWords(s);
    expect(words).toMatch(/twenty-seven cells/);
    expect(words).toMatch(/Two families/);
    expect(words).not.toMatch(/two people/);
  });

  it('counts only departed raids without inferring protection from a past scouting visit', () => {
    const s = newGame(7).s;
    const raid = s.raids[0];
    if (!raid) throw new Error('Missing first raid');
    raid.stage = 'gone';
    s.raids.push({ ...raid, stage: 'riders' }, { ...raid, stage: 'smoke' });
    s.heldAt = s.minute;
    const words = growthWords(s);
    expect(words).toMatch(/Riders have come and gone once/);
    expect(words).not.toMatch(/\b(safe|protected|held|survived)\b|two raids|three raids/);
    expect(words).toMatch(/past events.*check who riders can reach now/i);
  });

  it('keeps a fresh hill honest about zero growth and absence without changing the run', () => {
    const s = newGame(7).s;
    const before = JSON.stringify(s);
    const words = growthWords(s);
    expect(words).toMatch(/zero cells/);
    expect(words).toMatch(/Zero families/);
    expect(words).toMatch(/Riders have not yet come and gone/);
    expect(words).toMatch(/saved hill waits while you are away/i);
    expect(JSON.stringify(s)).toBe(before);
    expect(growthWords(s)).toBe(words);
  });
});
