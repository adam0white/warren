import { expect, it } from 'vitest';
import { act, advance, newGame, save, stateJson } from '../src/sim/game.ts';
import { idx, SURF, USE } from '../src/sim/grid.ts';
import { eventHistory, historyTime } from '../src/ui/event-history.ts';

it('projects an actual door close, pending reopening and a separate bell outcome without changing history', () => {
  const g = newGame(7);
  const cell = idx(18, SURF + 1);
  // Authored finished door. The test and bell remain actual public inputs.
  g.s.hill.use[cell] = USE.door;
  g.s.hill.doorWork[cell] = 0;
  g.chapter = { version: 'warren-hf4-cast/1', inputs: [], claims: [], initial: stateJson(g.s) };
  expect(act(g, { verb: 'test-door', who: 'yusuf', cell })).toBe(true);
  for (let n = 0; n < 12 && !g.s.next!.requests!.door!.results.length; n++) advance(g, g.s.minute + 30);
  const r = g.s.next!.requests!.door!;
  expect(r.results.map((x) => x.shut)).toEqual([true]);
  expect(r.phase).toBe('open');
  expect(r.opened).toBeUndefined();
  expect(r.endedAt).toBeUndefined();
  expect(r.answers.length).toBeGreaterThan(0);
  expect(eventHistory(g).some((e) => e.kind === 'door' && e.text.includes('reopened'))).toBe(false);
  expect(act(g, { verb: 'bell' })).toBe(true);
  advance(g, g.s.minute + 360);
  const raw = JSON.stringify(save(g));
  const notes = JSON.stringify(g.s.notes);
  const rows = eventHistory(g);
  expect(rows.some((e) => e.kind === 'request' && e.at === r.at)).toBe(true);
  const answer = r.answers[0]!;
  expect(rows.some((e) => e.kind === 'reply' && e.at === answer.at && e.text.includes(answer.says))).toBe(
    true,
  );
  const shut = rows.find((e) => e.kind === 'door' && e.at === r.results[0]!.at)!;
  expect(shut.text).toContain('Completed door test: shut');
  expect(shut.text).toContain(historyTime(r.results[0]!.workFrom));
  expect(rows.some((e) => e.kind === 'bell' && e.at === g.inputs.find((i) => i.verb === 'bell')!.at)).toBe(
    true,
  );
  for (const answer of g.s.answers)
    expect(rows.some((e) => e.kind === 'reply' && e.at === answer.at && e.text.includes(answer.says))).toBe(
      true,
    );
  expect(rows.some((e) => e.text.includes('No riders came.'))).toBe(true);
  // The quiet test predates the bell. No current open door, agreement or ended call
  // supplies a historical closure during that later call.
  expect(rows.some((e) => e.kind === 'unknown' && e.text.includes('unknown'))).toBe(true);
  expect(JSON.stringify(save(g))).toBe(raw);
  expect(JSON.stringify(g.s.notes)).toBe(notes);
  expect(rows.map((e) => e.at)).toEqual(rows.map((e) => e.at).toSorted((a, b) => a - b));
  // Missing old receipts never turn into a completion from today's physical state.
  const old = newGame(7);
  act(old, { verb: 'bell' });
  old.s.hill.shut[cell] = 1;
  expect(eventHistory(old).some((e) => e.kind === 'door')).toBe(false);
  expect(eventHistory(old).some((e) => e.kind === 'unknown')).toBe(true);
});
