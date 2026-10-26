import { expect, it } from 'vitest';
import { act, newGame, save } from '../src/sim/game.ts';
import { idx, K, SURF, USE } from '../src/sim/grid.ts';
import { chalkFeedback, selectedPlan } from '../src/ui/selected-plan.ts';

it('contrasts one copied known hill: first connection, shut door, shaft shortcut and second route', () => {
  const s = newGame(7).s;
  s.hill.kind.fill(K.rock);
  s.hill.known.fill(0);
  s.hill.chalk.fill(0);
  s.hill.use.fill(USE.none);
  s.hill.shut.fill(0);
  const x = s.hill.surface.entrance;
  for (let y = SURF; y <= SURF + 12; y++) {
    const c = idx(x, y);
    s.hill.known[c] = 1;
    s.hill.kind[c] = y <= SURF + 2 ? K.open : K.rock;
    if (y > SURF + 2) s.hill.chalk[c] = 1;
  }
  const target = idx(x, SURF + 12);
  const before = structuredClone(s);
  let p = selectedPlan(s, target);
  expect(p.firstFace).toBe(idx(x, SURF + 3));
  expect(p.current.accessible).toBe(false);
  expect(p.proposed.accessible).toBe(true);
  expect(p.proposed.exposed).toBe(false);
  expect(p.connection.at(-1)).toBe(target);
  expect(s).toEqual(before);
  s.hill.chalk[idx(x, SURF + 3)] = 0;
  expect(selectedPlan(s, target).firstFace).toBe(idx(x, SURF + 3));
  s.hill.chalk[idx(x, SURF + 3)] = 1;
  for (let y = SURF + 3; y <= SURF + 12; y++) s.hill.kind[idx(x, y)] = K.open;
  const door = idx(x, SURF + 1);
  s.hill.use[door] = USE.door;
  s.hill.shut[door] = 1;
  p = selectedPlan(s, target);
  expect(p.current.accessible).toBe(false);
  expect(p.words).toContain('shut door');
  for (let y = SURF; y <= SURF + 12; y++) {
    const c = idx(x + 1, y);
    s.hill.kind[c] = K.open;
    s.hill.known[c] = 1;
  }
  const near = idx(x + 1, SURF + 4);
  p = selectedPlan(s, near);
  expect(p.current.exposed).toBe(true);
  expect(p.current.accessible).toBe(true);
  expect(p.current.riskPath[0]).toBe(idx(x + 1, SURF));
  expect(p.words).toContain('another open route');
  s.hill.known[idx(x + 1, SURF + 2)] = 0;
  expect(selectedPlan(s, near).current.riskPath).toEqual([]);
});

it('reports only acknowledged actual chalk changes and keeps a refused command unchanged', () => {
  const g = newGame(7);
  const cells = [idx(15, SURF + 3)];
  const before = cells.map((c) => g.s.hill.chalk[c] ?? 0);
  const ok = act(g, { verb: 'chalk', cells, on: true });
  expect(
    chalkFeedback(
      ok,
      before,
      cells.map((c) => g.s.hill.chalk[c] ?? 0),
    ),
  ).toContain('1 square marked');
  const saved = save(g);
  const duplicate = act(g, { verb: 'chalk', cells, on: true });
  expect(
    chalkFeedback(
      duplicate,
      [1],
      cells.map((c) => g.s.hill.chalk[c] ?? 0),
    ),
  ).toBe('The chalk is unchanged.');
  expect(chalkFeedback(false, [1], [1])).toBe('The chalk is unchanged.');
  expect(chalkFeedback(false, [0], [1])).toBe('The chalk command was not accepted.');
  const removed = act(g, { verb: 'chalk', cells, on: false });
  expect(
    chalkFeedback(
      removed,
      [1],
      cells.map((c) => g.s.hill.chalk[c] ?? 0),
    ),
  ).toContain('1 chalk mark removed');
  expect(saved.inputs).toHaveLength(1);
  expect(g.inputs).toHaveLength(2);
});

it('keeps the complete known eight-step route unchanged by a hidden two-cell shortcut', () => {
  const s = newGame(7).s;
  const h = s.hill;
  h.kind.fill(K.rock);
  h.known.fill(0);
  h.chalk.fill(0);
  h.use.fill(USE.none);
  h.shut.fill(0);
  const route = [
    idx(10, SURF),
    idx(10, SURF + 1),
    idx(10, SURF + 2),
    idx(10, SURF + 3),
    idx(11, SURF + 3),
    idx(12, SURF + 3),
    idx(13, SURF + 3),
    idx(14, SURF + 3),
    idx(14, SURF + 2),
  ];
  for (const c of route) {
    h.kind[c] = K.open;
    h.known[c] = 1;
  }
  const target = route.at(-1)!;
  const before = selectedPlan(s, target);
  expect(before.current.riskPath).toEqual(route);
  expect(before.current.exposed).toBe(true);
  for (const c of [idx(14, SURF), idx(14, SURF + 1)]) h.kind[c] = K.open;
  const hidden = structuredClone(s);
  expect(selectedPlan(s, target)).toEqual(before);
  expect(s).toEqual(hidden);
  // The same public route must survive in the accepted-chalk proposal too.
  h.kind[target] = K.rock;
  h.chalk[target] = 1;
  const proposed = selectedPlan(s, target);
  expect(proposed.proposed.riskPath).toEqual(route);
  expect(proposed.proposed.exposed).toBe(true);
  expect(proposed.current.exposed).toBe(false);
});
