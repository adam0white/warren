import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/game.ts';
import { idx, K, SURF, USE } from '../src/sim/grid.ts';
import { exposureWords } from '../src/ui/exposure.ts';

describe('the keeper’s shelter check', () => {
  it('distinguishes above ground, searchable passages and deeper shelter without a safety promise', () => {
    const s = newGame(7).s;
    const p = s.people[0];
    if (!p) throw new Error('Missing person');
    delete s.trips[p.id];
    s.pos[p.id] = idx(17, SURF - 1);
    expect(exposureWords(s, p)).toContain('Yusuf Usta is above ground');
    expect(exposureWords(s, p)).toContain('You do not know why he is there');
    s.pos[p.id] = idx(18, SURF + 1);
    expect(exposureWords(s, p)).toMatch(/Yusuf Usta is near.*entrance.*Riders can reach/);
    for (let y = SURF; y < SURF + 12; y++) s.hill.kind[idx(17, y)] = K.open;
    s.pos[p.id] = idx(17, SURF + 11);
    expect(exposureWords(s, p)).toContain('Yusuf Usta is beyond the passages riders search');
    expect(exposureWords(s, p)).not.toMatch(/safe|guarantee/i);
  });

  it('uses current journey position and quotes only answers to the latest bell', () => {
    const s = newGame(7).s;
    const p = s.people[0];
    if (!p) throw new Error('Missing person');
    const above = idx(17, SURF - 1);
    const below = idx(17, SURF + 3);
    s.bell = { at: s.minute, until: s.minute + 360, real: true };
    s.answers.push({ at: s.minute - 30, who: p.id, verdict: 'refused', says: 'An old answer.' });
    s.trips[p.id] = {
      action: 'shelter',
      cells: [above, below],
      times: [s.minute, s.minute + 60],
      workFrom: s.minute + 60,
      end: below,
    };
    expect(exposureWords(s, p)).toMatch(/Yusuf Usta is above ground.*He is still travelling below/);
    expect(exposureWords(s, p)).not.toContain('An old answer');
    s.answers.push({ at: s.minute, who: p.id, verdict: 'deferred', says: 'I will follow.' });
    expect(exposureWords(s, p)).toContain('When the bell rang, he said: “I will follow.”');
    s.minute += 60;
    expect(exposureWords(s, p)).toContain('Yusuf Usta is near');
    expect(exposureWords(s, p)).not.toContain('He is still travelling below');
  });

  it('reads a shut door and leaves the entire run unchanged', () => {
    const s = newGame(7).s;
    const p = s.people[0];
    if (!p) throw new Error('Missing person');
    delete s.trips[p.id];
    s.hill.use[idx(18, SURF + 1)] = USE.door;
    s.hill.shut[idx(18, SURF + 1)] = 1;
    s.pos[p.id] = idx(17, SURF + 3);
    const before = JSON.stringify(s);
    expect(exposureWords(s, p)).toContain('Yusuf Usta is beyond the passages riders search');
    expect(exposureWords(s, p)).not.toMatch(/\d/);
    expect(JSON.stringify(s)).toBe(before);
  });
});
