import { describe, expect, it } from 'vitest';
import { HOUR } from '../src/sim/calendar.ts';
import { newGame } from '../src/sim/game.ts';
import { idx, K, SURF, USE } from '../src/sim/grid.ts';
import { colonyWords } from '../src/ui/guidance.ts';

describe('the keeper’s next line', () => {
  it('explains the first mark and the wait for someone to choose it', () => {
    const s = newGame(7).s;
    expect(colonyWords(s)).toMatch(/Choose chalk.*drag.*cellar/);
    s.hill.chalk[idx(15, SURF + 3)] = 1;
    s.goals.chalk = s.minute;
    expect(colonyWords(s)).toMatch(/choose.*pick/);
  });

  it('keeps a useful next step between early goals and the first riders', () => {
    const s = newGame(7).s;
    s.stats.dug = 8;
    for (const goal of ['chalk', 'first', 'store', 'lamp']) s.goals[goal] = s.minute;
    s.hill.grain[idx(16, SURF + 3)] = 60;
    expect(colonyWords(s)).toMatch(/[Jj]ars.*[Bb]eds|[Jj]ars.*sleep/);
    // An achievement is history: empty jars now must not be described as a harvest below.
    s.hill.grain.fill(0);
    expect(colonyWords(s)).toMatch(/store|harvest/);
    expect(colonyWords(s)).not.toMatch(/[Jj]ars are filling/);
    s.hill.grain[idx(16, SURF + 3)] = 60;
    for (let x = 16; x <= 19; x++) s.hill.use[idx(x, SURF + 3)] = USE.beds;
    expect(colonyWords(s)).toMatch(/room|door/);
    expect(colonyWords(s)).not.toMatch(/safe|secure|everyone.*shelter/);
  });

  it('distinguishes empty stores from a lack of storage space', () => {
    const s = newGame(7).s;
    s.stats.dug = 8;
    s.hill.grain.fill(0);
    for (let x = 16; x <= 19; x++) s.hill.use[idx(x, SURF + 3)] = USE.store;
    expect(colonyWords(s)).toMatch(/empty.*harvest/);
    expect(colonyWords(s)).not.toMatch(/[Mm]ark/);
  });

  it('puts smoke and riders ahead of unfinished digging goals', () => {
    const s = newGame(7).s;
    const raid = s.raids[0];
    if (!raid) throw new Error('Missing first raid');
    raid.stage = 'smoke';
    expect(colonyWords(s)).toMatch(/[Ss]moke.*bell/);
    raid.stage = 'riders';
    expect(colonyWords(s)).toMatch(/[Rr]iders.*hill/);
    expect(colonyWords(s)).not.toMatch(/[Cc]halk/);
  });

  it('describes dark faces only when all available faces lack light or air', () => {
    const s = newGame(7).s;
    s.minute = 10 * HOUR;
    s.hill.lamp.fill(0);
    s.hill.kind[idx(15, SURF + 3)] = K.open;
    s.hill.chalk[idx(14, SURF + 3)] = 1;
    s.goals.chalk = s.minute;
    expect(colonyWords(s)).toMatch(/dark.*lamp/);
    s.hill.chalk[idx(17, SURF)] = 1;
    s.version++;
    expect(colonyWords(s)).not.toMatch(/faces.*dark/);
  });

  it('derives the same words from state without changing the run', () => {
    const s = newGame(7).s;
    const before = JSON.stringify(s);
    const words = colonyWords(s);
    expect(colonyWords(s)).toBe(words);
    expect(JSON.stringify(s)).toBe(before);
    expect(words).not.toMatch(/\d/);
  });
});
