import { describe, expect, it } from 'vitest';
import { botStep, newBot } from '../src/sim/bot.ts';
import { HOUR } from '../src/sim/calendar.ts';
import { act, advance, fingerprint, newGame, replay } from '../src/sim/game.ts';
import { rallyBlock, refugeGoal } from '../src/sim/rally.ts';
import { diggingAdults } from '../src/sim/warren.ts';
import { markedWorkWords } from '../src/ui/known-work.ts';

// The R2 prepared hill: canonical cast, rules 0.6.0, seed 1476719286, resumed at minute 300.
const R2_SEED = 1476719286;

function playDays(days: number, rally: boolean) {
  const g = newGame(R2_SEED, '0.6.0');
  advance(g, 300);
  const bot = newBot();
  for (let h = 0; h < days * 24; h++) {
    botStep(g, bot);
    if (rally && !rallyBlock(g.s)) act(g, { verb: 'rally' });
    advance(g, g.s.minute + HOUR);
  }
  return g;
}

describe('rallying the diggers to a faded refuge goal', () => {
  it('explains the stall, re-engages the goal once per three days, and replays exactly', () => {
    const g = playDays(9, false);
    const s = g.s;
    const meryem = s.people.find((p) => p.id === 'meryem');
    const goal = meryem && refugeGoal(meryem);
    expect(goal?.status).toBe('active');
    expect(goal?.importance).toBeLessThan(goal?.baseImportance ?? 0);
    expect(diggingAdults(s).map((p) => p.id)).toEqual(['meryem', 'tamar']);

    const why = markedWorkWords(s);
    expect(why).toContain('available for work');
    expect(why).toMatch(/Only Meryem and Tamar of the Wall take digging work/);
    expect(why).toMatch(/has not worked on the refuge for \d+ days/);
    expect(why).toContain('You can ask Yusuf Usta to walk the marks with them.');

    expect(act(g, { verb: 'rally' })).toBe(true);
    expect(goal?.importance).toBe(goal?.baseImportance);
    expect(s.notes.at(-1)?.text).toMatch(/^Yusuf Usta walked the chalk marks with Meryem and Tamar/);
    expect(rallyBlock(s)).toMatch(/three days/);
    expect(act(g, { verb: 'rally' })).toBe(false);

    advance(g, s.minute + 2 * HOUR);
    expect(fingerprint(replay(R2_SEED, g.inputs, g.s.minute, '0.6.0').s)).toBe(fingerprint(g.s));
  });

  // Headless control: the same keeper with and without the ask; people still choose every cut.
  it('lets the marked plan get dug when the keeper asks', () => {
    const without = playDays(20, false).s.stats.dug;
    const withAsk = playDays(20, true).s.stats.dug;
    expect(without).toBeLessThanOrEqual(6);
    expect(withAsk).toBeGreaterThan(without * 3);
  });
});
