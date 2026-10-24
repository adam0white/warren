import { describe, expect, it } from 'vitest';
import { fingerprint, newGame } from '../src/sim/game.ts';
import { idx, K, SURF, USE } from '../src/sim/grid.ts';
import { planSafety } from '../src/ui/plan-safety.ts';

function layout() {
  const s = newGame(7).s;
  s.hill.kind.fill(K.rock);
  s.hill.use.fill(USE.none);
  s.hill.chalk.fill(0);
  const x = s.hill.surface.entrance;
  for (let y = SURF; y <= SURF + 2; y++) s.hill.kind[idx(x, y)] = K.open;
  return { s, x };
}

describe('plan safety preview', () => {
  it('opens all connected committed chalk and the live stroke without changing state', () => {
    const { s, x } = layout();
    const committed = Array.from({ length: 9 }, (_, n) => idx(x, SURF + 3 + n));
    for (const i of committed) s.hill.chalk[i] = 1;
    const stroke = idx(x, SURF + 12);
    const before = fingerprint(s);
    const p = planSafety(s, [stroke], 'chalk');
    expect(p.cells).toHaveLength(10);
    expect(p.capacity).toBe(30);
    expect(p.exposedCapacity).toBe(21);
    expect(p.protectedCapacity).toBe(9);
    expect(p.words).toContain('If dug');
    expect(p.words).toContain('about thirty');
    expect(p.words).toContain('twenty-one are exposed');
    expect(fingerprint(s)).toBe(before);
  });
  it('reports disconnected plans as unreachable rather than protected', () => {
    const { s } = layout();
    const p = planSafety(s, [idx(20, SURF + 12)], 'chalk');
    expect(p.unreachableCapacity).toBe(3);
    expect(p.protectedCapacity).toBe(0);
    expect(p.words).toContain('cannot be reached');
    expect(p.words).not.toContain('can sleep here');
  });
  it('reads a beds stroke only on actual open cells and includes its connected bed room', () => {
    const { s, x } = layout();
    const bed = idx(x, SURF + 2);
    s.hill.use[bed] = USE.beds;
    const p = planSafety(s, [idx(x, SURF + 1), idx(x + 1, SURF + 1)], 'beds');
    expect(p.capacity).toBe(6);
    expect(p.cells.sort()).toEqual([idx(x, SURF + 1), bed].sort());
  });
  it('uses a newly chalked shaft as a rider entry through the whole hypothetical plan', () => {
    const { s, x } = layout();
    for (let y = SURF + 3; y <= SURF + 12; y++) s.hill.kind[idx(x, y)] = K.open;
    for (let y = SURF + 1; y <= SURF + 12; y++) s.hill.kind[idx(x + 1, y)] = K.open;
    s.hill.use[idx(x, SURF + 2)] = USE.door;
    s.hill.shut[idx(x, SURF + 2)] = 1;
    s.hill.use[idx(x + 1, SURF + 12)] = USE.beds;
    s.hill.chalk[idx(x + 1, SURF)] = 1;
    const p = planSafety(s, [idx(x + 1, SURF + 12)], 'beds');
    // This target is beyond the rider limit even with the short shaft.
    expect(p.protectedCapacity).toBe(3);
    const q = planSafety(s, [idx(x + 1, SURF + 5)], 'beds');
    expect(q.exposedCapacity).toBe(3);
    expect(q.words).toContain('shaft');
  });
  it('states door protection as conditional and detects a shaft bypass', () => {
    const { s, x } = layout();
    const door = idx(x, SURF + 1);
    s.hill.use[door] = USE.door;
    s.hill.shut[door] = 1;
    const p = planSafety(s, [idx(x, SURF + 2)], 'beds');
    expect(p.protectedCapacity).toBe(3);
    expect(p.words).toContain('about three');
    expect(p.words).toContain('shut');
    s.hill.chalk[idx(x + 1, SURF)] = 1;
    s.hill.chalk[idx(x + 1, SURF + 1)] = 1;
    s.hill.chalk[idx(x + 1, SURF + 2)] = 1;
    const q = planSafety(s, [idx(x, SURF + 2)], 'beds');
    expect(q.exposedCapacity).toBe(3);
    expect(q.words).toContain('shaft');
  });
});

it('matches bed marking on empty stores and preserves occupied stores and fixtures', () => {
  const { s, x } = layout();
  const a = idx(x, SURF);
  const b = idx(x, SURF + 1);
  const c = idx(x, SURF + 2);
  s.hill.use[a] = s.hill.use[b] = USE.store;
  s.hill.grain[a] = 0;
  s.hill.grain[b] = 1;
  s.hill.use[c] = USE.door;
  expect(planSafety(s, [a, b, c], 'beds').cells).toEqual([a]);
});
it('names a rolled-back door without promising one door closes every route', () => {
  const { s, x } = layout();
  const door = idx(x, SURF + 1);
  s.hill.use[door] = USE.door;
  s.hill.shut[door] = 0;
  expect(planSafety(s, [idx(x, SURF + 2)], 'beds').words).toContain('open stone doors');
});

it('keeps mixed protection and an open-door remedy compact without hiding capacity', () => {
  const { s, x } = layout();
  const door = idx(x, SURF + 1);
  s.hill.use[door] = USE.door;
  s.hill.doorWork[door] = 0;
  for (let y = SURF + 3; y <= SURF + 12; y++) s.hill.chalk[idx(x, y)] = 1;
  const p = planSafety(s, [idx(x, SURF + 3)], 'chalk');
  expect(p.protectedCapacity).toBeGreaterThan(0);
  expect(p.exposedCapacity).toBeGreaterThan(0);
  expect(p.words).toContain('beyond riders’ reach');
  expect(p.words).toContain('exposed');
  expect(p.words).toContain(
    'Ring the bell so a nearby adult can choose to shut open stone doors. Check other routes.',
  );
  expect(p.words).toContain('People choose when to dig.');
  expect(p.words.split(/\s+/).length).toBeLessThanOrEqual(60);
});

it('keeps compound route conditions and unreachable capacity essential, with full context', () => {
  const { s, x } = layout();
  s.hill.kind.fill(K.rock);
  const selected: number[] = [];
  for (const column of [x, x + 4]) {
    for (let y = SURF; y <= SURF + 1; y++) s.hill.kind[idx(column, y)] = K.open;
    s.hill.use[idx(column, SURF + 1)] = USE.door;
    s.hill.doorWork[idx(column, SURF + 1)] = 0;
    for (let y = SURF + 2; y <= SURF + 8; y++) {
      s.hill.chalk[idx(column, y)] = 1;
      selected.push(idx(column, y));
    }
  }
  s.hill.shut[idx(x + 4, SURF + 1)] = 1;
  const isolated = idx(5, SURF + 20);
  s.hill.chalk[isolated] = 1;
  selected.push(isolated);
  const p = planSafety(s, selected, 'chalk');
  expect(p.words).toBe(
    'If dug, this space would have about 45 places. 21 places are protected, 21 are exposed, and 3 cannot be reached. Dig deeper or shut route doors. Keep protective doors shut. Connect unreachable space. People choose when to dig.',
  );
  expect(p.words.length).toBeLessThanOrEqual(300);
  expect(p.context).toContain('The entrance admits riders.');
  expect(p.context).toContain('Check other routes');
  expect(p.context).toContain('keep protective stone doors shut');
  expect(p.context).toContain('three places cannot be reached. Connect a passage');
});
