import { expect, it } from 'vitest';
import { newGame } from '../src/sim/game.ts';
import { faces, idx, SPOIL_BLOCK, SURF } from '../src/sim/grid.ts';
import { airAndLight, faceState } from '../src/sim/warren.ts';
import { markedWorkWords } from '../src/ui/known-work.ts';
import { planSafety } from '../src/ui/plan-safety.ts';
import { latestWorkWords } from '../src/ui/work.ts';

it('distinguishes a chalked capacity from actual marked beds without changing the hill', () => {
  const { s } = newGame(7);
  const face = idx(15, SURF + 3);
  s.hill.chalk[face] = 1;
  const before = JSON.stringify(s);
  const p = planSafety(s, [face], 'chalk');
  expect(p.words).toMatch(/potential/i);
  expect(p.context).toMatch(/does not place beds/i);
  expect(JSON.stringify(s)).toBe(before);
});
it('shows a newer actual person report rather than an older breakthrough forever', () => {
  const { s } = newGame(7);
  s.notes.push({ at: 350, kind: 'dig', who: 'meryem', cell: 389, text: 'Meryem broke through.', weight: 1 });
  s.notes.push({ at: 400, kind: 'story', who: 'tamar', text: 'Tamar checked the approach.', weight: 1 });
  expect(latestWorkWords(s)).toBe('Tamar checked the approach.');
});

it('collapses exact routine repeats without hiding arrivals, injuries or new places', async () => {
  const { journalEntries } = await import('../src/ui/work.ts');
  const routine = {
    at: 300,
    kind: 'story' as const,
    who: 'meryem',
    text: 'Meryem checked the route.',
    weight: 1,
  };
  const notes = [
    routine,
    { at: 330, kind: 'arrival' as const, text: 'A family arrived.', weight: 1 },
    { ...routine, at: 360 },
    { ...routine, at: 390, cell: 389 },
    { at: 420, kind: 'hurt' as const, who: 'meryem', text: 'Meryem was hurt.', weight: 1 },
  ];
  const before = JSON.stringify(notes);
  const shown = journalEntries(notes);
  expect(shown).toHaveLength(4);
  expect(shown.some((n) => n.text.includes('Repeated 2 times'))).toBe(true);
  expect(shown.filter((n) => n.kind === 'arrival' || n.kind === 'hurt' || n.cell !== undefined)).toHaveLength(
    3,
  );
  expect(JSON.stringify(notes)).toBe(before);
});

// Synthetic WORLD helper counterexample, not ordinary-play or frequency evidence.
it('reports mixed digging blockers until a face is ready and retains the remaining blocker', () => {
  const { s } = newGame(7, '0.7.0');
  expect(s.minute).toBe(300);
  s.hill.chalk[idx(1, SURF)] = 1;
  s.hill.chalk[idx(15, SURF + 3)] = 1;
  s.hill.spoil[390] = SPOIL_BLOCK;
  const { lit, air } = airAndLight(s);
  expect(faces(s.hill).map((f) => [f.face, f.stand, faceState(s, f.face, f.stand, lit, air)])).toEqual([
    [273, 239, 'dark'],
    [389, 390, 'spoil'],
  ]);
  const blocked = markedWorkWords(s);
  expect(blocked).not.toContain('available for work');
  expect(blocked).toMatch(/dark.*lamp/i);
  expect(blocked).toMatch(/loose rock.*carry it away/i);

  s.hill.spoil[390] = 0;
  const partial = markedWorkWords(s);
  expect(partial).toContain('available for work');
  expect(partial).toMatch(/dark.*lamp/i);
});
