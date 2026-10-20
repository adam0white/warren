import { describe, expect, it } from 'vitest';
import { botStep, newBot } from '../src/sim/bot.ts';
import { DAY, HOUR } from '../src/sim/calendar.ts';
import { act, advance, fingerprint, load, newGame, replay, save } from '../src/sim/game.ts';
import { faces, idx, K, SURF } from '../src/sim/grid.ts';

function run(seed: number, days: number) {
  const g = newGame(seed);
  const bot = newBot();
  for (let h = 0; h < days * 24; h++) {
    botStep(g, bot);
    advance(g, g.s.minute + HOUR);
  }
  return g;
}

describe('the warren', () => {
  it('is deterministic for a seed and its inputs', () => {
    const a = run(7, 4);
    const b = run(7, 4);
    expect(fingerprint(a.s)).toBe(fingerprint(b.s));
    expect(a.inputs.length).toBeGreaterThan(0);
  });

  it('replays a run from seed and input log', () => {
    const a = run(3, 5);
    const r = replay(3, a.inputs, a.s.minute, a.s.edition);
    expect(fingerprint(r.s)).toBe(fingerprint(a.s));
  });

  it('continues identically after save and load', () => {
    const a = run(5, 3);
    const b = load(JSON.parse(JSON.stringify(save(a))));
    advance(a, a.s.minute + DAY);
    advance(b, b.s.minute + DAY);
    expect(fingerprint(b.s)).toBe(fingerprint(a.s));
  });

  it('someone takes up a pick soon after chalk in daylight', () => {
    const g = newGame(11);
    advance(g, 9 * HOUR);
    const cells = [idx(15, SURF + 3), idx(14, SURF + 3)];
    expect(act(g, { verb: 'chalk', cells, on: true })).toBe(true);
    expect(faces(g.s.hill).length).toBeGreaterThan(0);
    advance(g, g.s.minute + 3 * HOUR);
    const started =
      g.s.people.some((p) => p.activity?.action === 'dig') ||
      g.s.stats.dug > 0 ||
      (g.s.hill.dig[cells[0] ?? 0] ?? 0) > 0;
    expect(started).toBe(true);
  });

  it('a bot keeper gets the harvest below and lives through the first raid', { timeout: 60000 }, () => {
    const g = run(1, 16);
    const s = g.s;
    expect(s.stats.dug).toBeGreaterThan(10);
    expect(s.raids[0]?.stage).toBe('gone');
    expect(s.people.filter((p) => p.body.alive).length).toBeGreaterThanOrEqual(9);
    expect(s.hill.kind.filter((k) => k === K.open).length).toBeGreaterThan(15);
  });
});
