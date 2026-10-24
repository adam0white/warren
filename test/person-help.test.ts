import { injure, sicken } from '@adam0white/human-framework';
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/game.ts';
import { idx, SURF, USE } from '../src/sim/grid.ts';
import { personHelpWords } from '../src/ui/person-help.ts';

function fixture() {
  const s = newGame(7).s;
  const p = s.people[0];
  if (!p) throw new Error('Missing founder');
  delete s.trips[p.id];
  Object.assign(p.body, {
    satiety: 1,
    hydration: 1,
    health: 1,
    sleepPressure: 0,
    sleepDebt: 0,
    exertion: 0,
    pain: 0,
    injuries: [],
    illnesses: [],
  });
  return { s, p };
}

describe('plain person help', () => {
  it('does not call an ill or weak person well because they have no perceived pain', () => {
    const { s, p } = fixture();
    sicken(p, { kind: 'fever', severity: 0.4, trendPerDay: 0.1, contagious: false });
    expect(personHelpWords(s, p)).toContain('ill');
    expect(personHelpWords(s, p)).not.toContain('No immediate bodily need');
    p.body.illnesses = [];
    p.body.health = 0.4;
    expect(personHelpWords(s, p)).toContain('poor health');
  });

  it('reports deprivation, exhaustion and an actual injury without meters', () => {
    const { s, p } = fixture();
    Object.assign(p.body, { satiety: 0.1, hydration: 0.1, sleepPressure: 1, exertion: 1 });
    injure(p, { part: 'leg', severity: 0.4, healRatePerDay: 0.1, bleeding: 0.1 });
    const words = personHelpWords(s, p);
    expect(words).toContain('food');
    expect(words).toContain('water');
    expect(words).toContain('rest');
    expect(words).toMatch(/bleeding/i);
    expect(words).not.toMatch(/\d|%/);
  });

  it('does not turn ordinary above-ground work into a rescue alert', () => {
    const { s, p } = fixture();
    s.pos[p.id] = idx(17, SURF - 1);
    expect(personHelpWords(s, p)).toBe('No immediate bodily need is showing.');
    const raid = s.raids[0];
    if (!raid) throw new Error('Missing raid');
    raid.stage = 'riders';
    expect(personHelpWords(s, p)).toContain('They are exposed above ground during the raid.');
  });

  it('does not promise safety behind a shut door, and leaves the whole run unchanged', () => {
    const { s, p } = fixture();
    const raid = s.raids[0];
    if (!raid) throw new Error('Missing raid');
    raid.stage = 'riders';
    s.hill.use[idx(18, SURF + 1)] = USE.door;
    s.hill.shut[idx(18, SURF + 1)] = 1;
    s.pos[p.id] = idx(17, SURF + 3);
    const before = JSON.stringify(s);
    expect(personHelpWords(s, p)).toBe('No immediate bodily need is showing.');
    expect(personHelpWords(s, p)).not.toMatch(/safe|guarantee/i);
    expect(JSON.stringify(s)).toBe(before);
  });
});
