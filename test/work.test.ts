import { expect, it } from 'vitest';
import { newGame } from '../src/sim/game.ts';
import { latestWorkWords } from '../src/ui/work.ts';

it('keeps the completed door outcome visible instead of only naming its tester', () => {
  const s = newGame(7).s;
  const p = s.people.find((p) => p.id === 'meryem');
  if (!p) throw new Error('Missing Meryem');
  s.notes.push({
    at: s.minute,
    kind: 'dig',
    who: p.id,
    text: `The stone door was ready in its groove. ${p.name} rolled it once to test it.`,
    weight: 1.5,
  });
  expect(latestWorkWords(s)).toContain('The stone door was ready in its groove.');
});

it('shows a newly hung lamp instead of stale digging news without changing saved notes', () => {
  const s = newGame(7).s;
  s.notes.push({
    at: s.minute,
    kind: 'story',
    who: 'meryem',
    cell: 100,
    text: 'Meryem baked a clay lamp in a fire and hung it where you had marked.',
    weight: 1,
  });
  const before = JSON.stringify(s);
  expect(latestWorkWords(s)).toContain('hung it where you had marked');
  expect(JSON.stringify(s)).toBe(before);
});
