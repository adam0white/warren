import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { act, advance, load, newGame, save } from '../src/sim/game.ts';
import { cellsWithUse, idx, K, STORE_CAP, SURF, USE } from '../src/sim/grid.ts';
import { grainHelpWords, waterHelpWords } from '../src/ui/known-work.ts';
import { journalEntries, observeMarkedWork, workDigestWords } from '../src/ui/work.ts';

it('projects supply and completed-mark readings without changing the authored run', () => {
  // The authored seed and normal chalk input used by the existing guidance control.
  const g = newGame(7);
  const cell = idx(15, SURF + 3);
  act(g, { verb: 'chalk', cells: [cell], on: true });
  const marked = observeMarkedWork(g.s);
  // Synthetic opened cell tests the projection, not an actual completed cut.
  const projection = structuredClone(g.s);
  projection.hill.kind[cell] = K.open;
  const completed = observeMarkedWork(projection, marked);
  expect(completed.completed).toContain(cell);
  expect(workDigestWords(projection, completed)).toContain('Marked digging is complete');
  projection.hill.use[cell] = USE.store;
  const original = save(g);
  const copied = structuredClone(projection);
  copied.hill.grain.fill(0);
  copied.fields.floor = 0;
  for (const home of copied.houses) home.jars = 0;
  copied.fields.standing = 10;
  expect(grainHelpWords(copied, cell)).toMatch(/store is empty.*standing.*no harvested grain/s);
  copied.fields.floor = 5;
  expect(grainHelpWords(copied, cell)).toContain('open route through known ground connects grain');
  copied.hill.grain[cell] = STORE_CAP;
  expect(grainHelpWords(copied, cell)).toContain('no room for another load');
  copied.hill.grain[cell] = 0;
  const entrance = idx(copied.hill.surface.entrance, SURF);
  copied.hill.kind[entrance] = K.rock;
  // A marked but disconnected copied store: no source/route success inferred.
  expect(grainHelpWords(copied, cell)).toContain('No open route through known ground');
  copied.hill.kind[entrance] = K.open;
  copied.hill.known[cell] = 0;
  expect(grainHelpWords(copied, cell)).not.toContain('connects grain to the store');
  const water = structuredClone(projection);
  expect(waterHelpWords(water)).toContain('spring');
  const raid = water.raids[0];
  if (!raid) throw Error('Missing authored raid');
  raid.stage = 'riders';
  expect(waterHelpWords(water)).toContain('unavailable while riders');
  water.hill.use[cell] = USE.well;
  water.hill.known[cell] = 1;
  expect(waterHelpWords(water)).toContain('discovered well');
  expect(waterHelpWords(water)).not.toContain('Fetching from the spring is unavailable');
  const notes = [
    { at: 300, kind: 'story' as const, who: 'meryem', text: 'Meryem checked the route.', weight: 1 },
    { at: 330, kind: 'arrival' as const, text: 'A family arrived.', weight: 2 },
    { at: 360, kind: 'story' as const, who: 'meryem', text: 'Meryem checked the route.', weight: 1 },
    { at: 390, kind: 'story' as const, who: 'meryem', cell, text: 'Meryem checked the route.', weight: 1 },
    { at: 420, kind: 'hurt' as const, who: 'meryem', text: 'Meryem was hurt.', weight: 2 },
  ];
  // Synthetic journal records exercise projection and grouping only.
  const routine = {
    at: 300,
    kind: 'story' as const,
    who: 'meryem',
    text: 'Meryem checked the nearby route to the village in daylight. Riders may use a different route next time.',
    weight: 1,
  };
  expect(journalEntries([routine, { ...routine, at: 330 }])).toHaveLength(1);
  const dig = { at: 300, kind: 'dig' as const, who: 'meryem', cell, text: 'A cut was completed.', weight: 2 };
  const locatedCheck = { ...routine, cell };
  const digest = workDigestWords({ ...projection, notes: [dig, locatedCheck] });
  expect(digest).toContain(dig.text);
  expect(digest).toContain(locatedCheck.text);
  const meal = { ...routine, text: 'Meryem cooked a meal for her household.' };
  expect(journalEntries([meal, { ...meal, at: 330 }])).toHaveLength(2);
  const rawNotes = structuredClone(notes);
  expect(journalEntries(notes)).toHaveLength(4);
  expect(
    journalEntries(notes).filter((n) => n.kind === 'arrival' || n.kind === 'hurt' || n.cell !== undefined),
  ).toHaveLength(3);
  expect(notes).toEqual(rawNotes);
  expect(cellsWithUse(projection.hill, USE.store)).toContain(cell);
  grainHelpWords(g.s, cell);
  waterHelpWords(g.s);
  workDigestWords(projection, completed);
  expect(save(g)).toEqual(original);
  const control = load(original);
  advance(g, g.s.minute + 180);
  advance(control, control.s.minute + 180);
  expect(save(g)).toEqual(save(control));
});

it('keeps later door and Bell readings authoritative after inspecting a completion cue', () => {
  // Actual source registrations; synthetic DOM state, not a browser journey.
  const source = readFileSync(new URL('../src/ui/app.ts', import.meta.url), 'utf8');
  const handlers = new Map<string, () => void>();
  const calls: { title: string; cell?: number }[] = [];
  const nodes = new Map(
    ['last-reading', 'completed-work', 'event-sentence'].map((id) => [
      id,
      {
        dataset: { completed: '123' },
        textContent: 'Completed ground',
        addEventListener: (_event: string, handler: () => void) => handlers.set(id, handler),
      },
    ]),
  );
  type Reading = { title: string; words: string; cell?: number; context?: string };
  const context = {
    document: { getElementById: (id: string) => nodes.get(id) },
    g: { s: {} },
    performance: { now: () => 10000 },
    hintUntil: 0,
    lastReading: null as Reading | null,
    bellReading: false,
    observedWork: { completed: [123] },
    FIRST_CHALK: 'Choose chalk',
    workDigestWords: () => 'Completed ground',
    paint: { connectionCell: undefined as number | undefined },
    showReading: (title: string, words: string, _remember = true, _scroll = false, cell?: number) => {
      calls.push({ title, cell });
      context.paint.connectionCell = cell;
      context.lastReading = { title, words, cell };
    },
    readingContext: (_words: string) => {},
    showCurrentHelp: () => {
      throw Error('Unexpected help');
    },
    showBellReading: () => context.showReading('Bell call', 'Current bell answer'),
  };
  for (const id of ['last-reading', 'completed-work']) {
    const start = source.indexOf(`document.getElementById('${id}')?.addEventListener('click', () => {`);
    if (start < 0 && id === 'completed-work') continue; // Original P2 candidate has no separate cue.
    expect(start).toBeGreaterThanOrEqual(0);
    const end = source.indexOf('\n  });', start) + 6;
    runInNewContext(source.slice(start, end), context);
  }
  (handlers.get('completed-work') ?? handlers.get('last-reading'))?.();
  expect(calls).toEqual([{ title: 'Completed marked digging', cell: 123 }]);
  expect(context.paint.connectionCell).toBe(123);
  // A later public reading has its own remembered target and context.
  context.lastReading = {
    title: 'Stone door',
    words: 'Remember this door',
    cell: 456,
    context: 'This door route',
  };
  calls.length = 0;
  handlers.get('last-reading')?.();
  expect(calls).toEqual([{ title: 'Stone door', cell: 456 }]);
  expect(context.paint.connectionCell).toBe(456);
  expect(context.lastReading?.context).toBe('This door route');
  context.lastReading = { title: 'Bell call', words: 'Earlier bell answer' };
  calls.length = 0;
  handlers.get('last-reading')?.();
  expect(context.bellReading).toBe(true);
  expect(calls).toEqual([{ title: 'Bell call', cell: undefined }]);
  // The completion remains independently inspectable after both readings.
  calls.length = 0;
  handlers.get('completed-work')?.();
  expect(calls).toEqual([{ title: 'Completed marked digging', cell: 123 }]);
  expect(context.paint.connectionCell).toBe(123);
  context.observedWork.completed = [];
  calls.length = 0;
  handlers.get('completed-work')?.();
  expect(calls).toEqual([]);
});
