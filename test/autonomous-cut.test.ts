import { expect, it } from 'vitest';
import { canInviteCutDiscussion, cutSuggestion } from '../src/sim/cut-discussion.ts';
import { act, advance, load, newGame, replay, save, stateJson } from '../src/sim/game.ts';
import { idx, K, SURF } from '../src/sim/grid.ts';
import { heard } from '../src/sim/hf4.ts';

function opening() {
  const original = newGame(7, '0.7.0', undefined, 'warren-rest/2');
  const face = idx(15, SURF + 3);
  original.s.hill.kind[face] = K.loose;
  original.s.hill.known[face] = 1;
  const g = newGame(
    7,
    '0.7.0',
    { version: 'warren-hf4-cast/1', inputs: [], claims: [], initial: stateJson(original.s) },
    'warren-rest/2',
  );
  return { g, face };
}
// Each restoration control includes the complete actual setup and encounter inside
// its original deadline. Native restoration and file replay have separate costs.
function completedEncounter(restore: 'native' | 'file') {
  const { g, face } = opening();
  advance(g, g.s.minute + 30);
  expect(g.s.next!.discussion).toBeUndefined();
  expect(act(g, { verb: 'chalk', cells: [face], on: true })).toBe(true);
  for (let n = 0; n < 24 && !g.s.next!.discussion; n++) advance(g, g.s.minute + 30);
  let d = g.s.next!.discussion!;
  expect(d, JSON.stringify(g.s.people.map((p) => ({ id: p.id, activity: p.activity })))).toBeDefined();
  expect(d.origin!.kind).toBe('marked-cut');
  expect(d.face).toBe(face);
  expect(g.inputs.some((i) => i.verb === 'discuss-cut')).toBe(false);
  expect(g.s.people).toHaveLength(6);
  for (const p of g.s.people) expect(cutSuggestion(g.s, p)).toBeUndefined();
  advance(g, d.requestedAt + 390);
  d = g.s.next!.discussion!;
  expect(d.endedAt, JSON.stringify({ minute: g.s.minute, d, current: g.s.next!.discussion })).toBeDefined();
  expect(
    d.statements.some((r) => r.heard),
    JSON.stringify(d),
  ).toBe(true);
  for (const r of d.statements) {
    expect(r.at - r.workFrom).toBeGreaterThanOrEqual(30);
    if (r.heard) expect(heard(g.s.people.find((p) => p.id === r.listener)!, r.text, r.at)).toBe(true);
  }
  expect(d.exchange).toBe(
    d.statements.length === 2 &&
      d.statements.every((r) => r.heard) &&
      d.statements[0]!.stance !== d.statements[1]!.stance,
  );
  const earlier = structuredClone(d);
  expect(act(g, { verb: 'discuss-cut' })).toBe(true);
  expect(g.s.cutDiscussionHistory).toEqual([earlier]);
  expect(g.s.next!.discussion!.origin).toBeUndefined();
  const full = JSON.parse(JSON.stringify(save(g)));
  const restored =
    restore === 'native'
      ? load(full)
      : replay(full.seed, full.inputs, full.minute, full.game, full.chapter, full.config, full.phase);
  expect(save(restored)).toEqual(full);
  advance(g, full.minute + 60);
  advance(restored, full.minute + 60);
  expect(save(restored)).toEqual(save(g));
}
it('restores the complete autonomous encounter natively and continues useful work', () =>
  completedEncounter('native'));
it('replays the complete autonomous encounter from its file and continues useful work', () =>
  completedEncounter('file'));

it('ends an unspoken autonomous opportunity when an actual bell interrupts it', () => {
  const { g, face } = opening();
  expect(act(g, { verb: 'chalk', cells: [face], on: true })).toBe(true);
  advance(g, 330);
  expect(g.s.next!.discussion!.origin!.kind).toBe('marked-cut');
  expect(act(g, { verb: 'bell' })).toBe(true);
  advance(g, 390);
  const d = g.s.next!.discussion!;
  expect(d.endedAt).toBeDefined();
  expect(d.statements).toEqual([]);
  expect(d.exchange).toBe(false);
  expect(g.s.hill.chalk[face]).toBe(1);
});

// SCOPE: a labelled public opening makes both adults available for a causal guard
// control. Run still chooses the opposed offers and records real travel, work and
// hearing. No actor choice, assent, current activity or historical event is assigned.
it('blocks a new invitation during an actual rest/2 reply and permits it after withdrawal', () => {
  const original = newGame(7, '0.7.0', undefined, 'warren-rest/2', (p) =>
    p.id === 'yusuf'
      ? {
          ...p,
          state: {
            ...p.state,
            body: { ...p.state.body, satiety: 1, hydration: 1, sleepPressure: 0 },
            needs: { ...p.state.needs, safety: 0, belonging: 0, competence: 1, meaning: 1, autonomy: 1 },
          },
        }
      : p.id === 'meryem'
        ? {
            ...p,
            state: {
              ...p.state,
              values: { ...p.state.values, security: 0, achievement: 1, selfDirection: 1 },
              needs: { ...p.state.needs, safety: 1, competence: 0, meaning: 0, autonomy: 0 },
            },
          }
        : p,
  );
  const face = idx(15, SURF + 3);
  original.s.hill.kind[face] = K.loose;
  original.s.hill.known[face] = 1;
  const g = newGame(
    7,
    '0.7.0',
    { version: 'warren-hf4-cast/1', inputs: [], claims: [], initial: stateJson(original.s) },
    'warren-rest/2',
  );
  expect(act(g, { verb: 'chalk', cells: [face], on: true })).toBe(true);
  for (let n = 0; n < 24 && !g.s.next!.discussion?.endedAt; n++) advance(g, g.s.minute + 30);
  const d = g.s.next!.discussion!;
  expect(d.origin?.kind).toBe('marked-cut');
  expect(d.exchange).toBe(true);
  expect(d.statements.map((r) => r.stance).sort()).toEqual(['continue', 'pause']);
  for (const r of d.statements) {
    expect(r.at - r.workFrom).toBeGreaterThanOrEqual(30);
    expect(heard(g.s.people.find((p) => p.id === r.listener)!, r.text, r.at)).toBe(true);
  }
  expect(canInviteCutDiscussion(g.s)).toBe(true);
  expect(act(g, { verb: 'reply-refusal', who: d.statements[0]!.listener })).toBe(true);
  expect(g.s.refusalReply?.endedAt).toBeUndefined();
  expect(canInviteCutDiscussion(g.s)).toBe(false);
  const full = save(g);
  expect(act(g, { verb: 'discuss-cut' })).toBe(false);
  expect(save(g)).toEqual(full);
  const native = load(full);
  const file = replay(full.seed, full.inputs, full.minute, full.game, full.chapter, full.config, full.phase);
  expect(save(native)).toEqual(full);
  expect(save(file)).toEqual(full);
  expect(act(g, { verb: 'withdraw-refusal-reply' })).toBe(true);
  expect(canInviteCutDiscussion(g.s)).toBe(true);
  expect(act(g, { verb: 'discuss-cut' })).toBe(true);
  expect(g.s.cutDiscussionHistory).toEqual([d]);
  expect(g.s.next!.discussion!.origin).toBeUndefined();
  for (const restored of [native, file]) advance(restored, full.minute + 60);
  expect(save(native)).toEqual(save(file));
  expect(native.s.people).toHaveLength(6);
});
