import { expect, it } from 'vitest';
import { act, newGame, save } from '../src/sim/game.ts';
import { idx, K, SURF, USE } from '../src/sim/grid.ts';
import { receivedVisit } from '../src/sim/visits.ts';
import { historyTime } from '../src/ui/event-history.ts';
import { chalkFeedback, selectedPlan, yusufPlanWords } from '../src/ui/selected-plan.ts';
import { authoredGame } from './authored-opening.ts';

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

it('binds the actual public Yusuf invitation note to current chalk without inventing endpoints or changing raw state', () => {
  // A new 06:00 opening, not an elapsed journey or a fabricated HF receipt.
  const g = authoredGame(7, 360, 'warren-rest/2');
  expect(act(g, { verb: 'visit', who: 'yusuf' })).toBe(true);
  expect(g.s.flags['visit:yusuf']).toBe(361);
  const receipt = receivedVisit(g.s, 'yusuf')!;
  expect(receipt.text).toContain('A mark must show others when they can stop me.');
  expect(receipt.at).toBe(360);
  const cell = idx(15, SURF + 3);
  expect(act(g, { verb: 'chalk', cells: [cell], on: true })).toBe(true);
  const before = JSON.stringify(save(g));
  const words = yusufPlanWords(g.s, cell);
  expect(words).toContain(receipt.text);
  expect(words).toContain(historyTime(receipt.at));
  expect(words).toContain('Current chalk selection:');
  expect(words).toContain('No endpoints');
  expect(words).toContain('do not establish that line or an agreement');
  expect(words).toContain('Use Rub out');
  expect(JSON.stringify(save(g))).toBe(before);
  // Ordinary public refusal: a second invitation cannot rewrite the retained invitation note.
  expect(act(g, { verb: 'visit', who: 'yusuf' })).toBe(false);
  expect(JSON.stringify(save(g))).toBe(before);
  // Declared historical omission control: the trim can retain the flag without the note.
  g.s.notes = g.s.notes.filter((n) => n !== receipt);
  const omitted = JSON.stringify(save(g));
  expect(g.s.flags['visit:yusuf']).toBe(361);
  expect(yusufPlanWords(g.s, cell)).toContain('words and date are unknown');
  expect(yusufPlanWords(g.s, cell)).not.toContain(receipt.text);
  // A different story at the same minute is not the original invitation note.
  g.s.notes.push({ ...receipt, text: 'An unrelated retained story.' });
  expect(yusufPlanWords(g.s, cell)).toContain('words and date are unknown');
  g.s.notes.pop();
  expect(JSON.stringify(save(g))).toBe(omitted);
});
