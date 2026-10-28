import { describe, expect, it } from 'vitest';
import { botStep, newBot } from '../src/sim/bot.ts';
import { HOUR } from '../src/sim/calendar.ts';
import { act, advance, fingerprint, load, newGame, replay, save } from '../src/sim/game.ts';
import { faces, idx, SURF } from '../src/sim/grid.ts';

function run(seed: number, hours: number) {
  const g = newGame(seed);
  const bot = newBot();
  for (let h = 0; h < hours; h++) {
    botStep(g, bot);
    advance(g, g.s.minute + HOUR);
  }
  return g;
}

describe('the warren', () => {
  it('is deterministic for a seed and its inputs', () => {
    const a = run(7, 3);
    const b = run(7, 3);
    expect(fingerprint(a.s)).toBe(fingerprint(b.s));
    expect(a.inputs.length).toBeGreaterThan(0);
  });

  it('replays a run from seed and input log', () => {
    const a = run(3, 3);
    const r = replay(3, a.inputs, a.s.minute, a.s.edition);
    expect(fingerprint(r.s)).toBe(fingerprint(a.s));
  });

  it('continues identically after save and load', () => {
    const a = run(5, 3);
    const b = load(JSON.parse(JSON.stringify(save(a))));
    advance(a, a.s.minute + HOUR);
    advance(b, b.s.minute + HOUR);
    expect(fingerprint(b.s)).toBe(fingerprint(a.s));
  });

  it('public chalk earns actual cutting progress in the bounded HF4 control', () => {
    const g = newGame(11);
    const cells = [idx(15, SURF + 3), idx(14, SURF + 3)];
    expect(act(g, { verb: 'chalk', cells, on: true })).toBe(true);
    expect(faces(g.s.hill).length).toBeGreaterThan(0);
    advance(g, g.s.minute + 12 * HOUR);
    const started =
      g.s.people.some((p) => p.activity?.action === 'dig') ||
      g.s.stats.dug > 0 ||
      (g.s.hill.dig[cells[0] ?? 0] ?? 0) > 0;
    expect(started).toBe(true);
  });

  it('records accepted public bot inputs in a bounded current run', () => {
    // Whole-season HF3 harvest/survival assumptions remain in docs/history/hf3-tests.
    // This verifies actual current inputs, not a long-season performance or survival claim.
    const g = run(1, 3);
    expect(g.inputs.length).toBeGreaterThan(0);
    expect(g.s.minute).toBe(300 + 3 * HOUR);
    expect(g.s.hill.chalk.some(Boolean)).toBe(true);
    expect(load(save(g)).s.minute).toBe(g.s.minute);
  });
});
