import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/game.ts';
import { idx, K, SURF } from '../src/sim/grid.ts';
import { baseView, easeView } from '../src/ui/camera.ts';

describe('the growing refuge camera', () => {
  it('starts close and fits the excavated base as it grows, independently of marks and hidden chambers', () => {
    const s = newGame(7).s;
    const early = baseView(s, 360, 500);
    expect(early.cs).toBeGreaterThan(30);
    const rngBefore = JSON.stringify(s);
    expect(baseView(s, 360, 500)).toEqual(early);
    expect(JSON.stringify(s)).toBe(rngBefore);
    s.hill.chalk[idx(2, SURF + 30)] = 1;
    expect(baseView(s, 360, 500)).toEqual(early);
    for (let y = SURF + 4; y <= SURF + 28; y++) s.hill.kind[idx(18, y)] = K.open;
    s.hill.kind[idx(5, SURF + 10)] = K.open;
    const grown = baseView(s, 360, 500);
    expect(grown.cs).toBeLessThan(early.cs);
    expect(grown.x).toBeLessThanOrEqual(5);
    expect(grown.x + grown.w / grown.cs).toBeGreaterThan(19);
    expect(grown.y).toBeLessThan(SURF);
    expect(grown.y + grown.h / grown.cs).toBeGreaterThan(SURF + 29);
  });

  it('moves smoothly toward the state-derived target without overshoot', () => {
    const from = { cs: 40, x: 12, y: 5, w: 360, h: 500 };
    const to = { ...from, cs: 20, x: 6, y: 3 };
    const next = easeView(from, to, 16);
    expect(next.cs).toBeGreaterThan(to.cs);
    expect(next.cs).toBeLessThan(from.cs);
    expect(next.x).toBeGreaterThan(to.x);
    expect(next.x).toBeLessThan(from.x);
    expect(easeView(from, to, 0)).toEqual(from);
    const halves = easeView(easeView(from, to, 8), to, 8);
    expect(halves.cs).toBeCloseTo(next.cs, 10);
  });
});
