import { expect, it } from 'vitest';
import { act, advance, load, newGame, replay, save, stateJson } from '../src/sim/game.ts';
import { idx, K, SURF } from '../src/sim/grid.ts';
import { archiveOf, heard } from '../src/sim/hf4.ts';
import { canReplyToRefusal, refusalReplyOffers, refusalReplySuggestion } from '../src/sim/refusal-reply.ts';

const face = idx(15, SURF + 3);
function fixture(seed = 7) {
  const opening = newGame(seed, '0.7.0', undefined, 'warren-rest/1', (p) =>
    p.id !== 'meryem'
      ? p
      : {
          ...p,
          // Public initial authoring for a labelled cautious/adventurous encounter control.
          state: {
            ...p.state,
            values: { ...p.state.values, security: 0, achievement: 1, selfDirection: 1 },
            needs: { ...p.state.needs, safety: 1, competence: 0, meaning: 0, autonomy: 0 },
          },
        },
  );
  opening.s.hill.kind[face] = K.loose;
  opening.s.hill.known[face] = 1;
  return newGame(
    seed,
    '0.7.0',
    { version: 'warren-hf4-cast/1', inputs: [], claims: [], initial: stateJson(opening.s) },
    'warren-rest/1',
  );
}
function exchange(g: ReturnType<typeof newGame>) {
  expect(act(g, { verb: 'chalk', cells: [face], on: true })).toBe(true);
  expect(act(g, { verb: 'discuss-cut' })).toBe(true);
  for (let n = 0; n < 32 && !g.s.next!.discussion!.exchange; n++) advance(g, g.s.minute + 30);
  const d = g.s.next!.discussion!;
  expect(d.exchange, JSON.stringify(d)).toBe(true);
  return d;
}
it('offers nothing and writes nothing without an actually heard disagreement', () => {
  const g = fixture();
  const before = save(g);
  for (const p of g.s.people) {
    expect(canReplyToRefusal(g.s, p.id)).toBe(false);
    expect(refusalReplyOffers(g.s, p)).toEqual([]);
    expect(refusalReplySuggestion(g.s, p)).toBeUndefined();
  }
  expect(act(g, { verb: 'reply-refusal', who: 'meryem' })).toBe(false);
  expect(save(g)).toEqual(before);
  expect(g.s.refusalReply).toBeUndefined();
});
it('costs an actual contextual reply, records HF choice and public hearing, and replays it', () => {
  const g = fixture();
  const d = exchange(g);
  const source = d.statements[0]!;
  const who = source.listener;
  const p = g.s.people.find((p) => p.id === who)!;
  expect(heard(p, source.text, source.at)).toBe(true);
  expect(act(g, { verb: 'reply-refusal', who: 'kian' })).toBe(false);
  expect(act(g, { verb: 'reply-refusal', who })).toBe(true);
  const pendingReply = save(g);
  expect(act(g, { verb: 'talk-rest', who })).toBe(false);
  expect(save(g)).toEqual(pendingReply);
  expect(g.s.next?.requests?.rest).toBeUndefined();
  expect(act(g, { verb: 'reply-refusal', who })).toBe(false);
  for (let n = 0; n < 12 && !g.s.refusalReply!.heard; n++) advance(g, g.s.minute + 30);
  const r = g.s.refusalReply!;
  expect(r.source.text).toBe(source.text);
  expect(r.listener).toBe(source.speaker);
  expect(r.speech, JSON.stringify(r)).toBeDefined();
  expect(r.speech!.text).toContain(source.text);
  expect(r.speech!.text).toMatch(/still marked|no longer marked|no longer contains/);
  expect(r.speech!.at - r.speech!.workFrom).toBeGreaterThanOrEqual(30);
  expect(r.heard).toBe(true);
  expect(r.answers.length).toBeGreaterThan(0);
  expect(heard(g.s.people.find((p) => p.id === r.listener)!, r.speech!.text, r.speech!.at)).toBe(true);
  const inputs = archiveOf(g.s).history.flatMap((t) => t.inputs);
  expect(
    inputs.some(
      (i) =>
        i.kind === 'suggestion.received' &&
        i.payload.person === who &&
        i.payload.received.kind === 'ordinary' &&
        i.payload.received.suggestion.action === 'talk-disagreement',
    ),
  ).toBe(true);
  const full = save(g);
  expect(
    save(replay(full.seed, full.inputs, full.minute, full.game, full.chapter, full.config, full.phase)),
  ).toEqual(full);
  const restored = load(full);
  advance(g, g.s.minute + 30);
  advance(restored, restored.s.minute + 30);
  expect(save(restored)).toEqual(save(g));
});
it('refuses an unheard source even if a historical exchange flag claims hearing', () => {
  const g = fixture();
  // Negative control only: a fabricated historical flag has no public attended event.
  g.s.next!.discussion = {
    face,
    requestedAt: g.s.minute,
    exchange: true,
    statements: [
      {
        speaker: 'yusuf',
        listener: 'meryem',
        stance: 'pause',
        at: 300,
        startedAt: 300,
        workFrom: 300,
        offerId: 'cut-pause',
        text: 'Unheard source words.',
        heard: true,
      },
      {
        speaker: 'meryem',
        listener: 'yusuf',
        stance: 'continue',
        at: 300,
        startedAt: 300,
        workFrom: 300,
        offerId: 'cut-continue',
        text: 'Unheard answer.',
        heard: true,
      },
    ],
  };
  const before = save(g);
  expect(act(g, { verb: 'reply-refusal', who: 'meryem' })).toBe(false);
  expect(save(g)).toEqual(before);
});
it('withdraws a finite reply without claiming speech or spending future work', () => {
  const g = fixture();
  const source = exchange(g).statements.at(-1)!;
  expect(act(g, { verb: 'reply-refusal', who: source.listener })).toBe(true);
  expect(act(g, { verb: 'withdraw-refusal-reply' })).toBe(true);
  const r = g.s.refusalReply!;
  expect(r.withdrawn).toBe(true);
  expect(r.speech).toBeUndefined();
  expect(r.heard).toBe(false);
  expect(act(g, { verb: 'reply-refusal', who: source.listener })).toBe(false);
  const p = g.s.people.find((p) => p.id === source.listener)!;
  expect(refusalReplyOffers(g.s, p)).toEqual([]);
  expect(refusalReplySuggestion(g.s, p)).toBeUndefined();
  advance(g, g.s.minute + 60);
  expect(g.s.refusalReply!.speech).toBeUndefined();
});
it('preserves an active reply across loading and refuses its completion after withdrawal', () => {
  const g = fixture();
  const source = exchange(g).statements[0]!;
  const who = source.listener;
  expect(act(g, { verb: 'reply-refusal', who })).toBe(true);
  for (
    let n = 0;
    n < 12 && !g.s.people.find((p) => p.id === who)?.activity?.affordanceId.startsWith('contextual-refusal-');
    n++
  )
    advance(g, g.s.minute + 30);
  expect(g.s.people.find((p) => p.id === who)?.activity?.affordanceId).toMatch(/^contextual-refusal-/);
  expect(g.s.refusalReply!.speech).toBeUndefined();
  const active = save(g);
  const restored = load(active);
  expect(save(restored)).toEqual(active);
  for (const branch of [g, restored]) {
    expect(act(branch, { verb: 'withdraw-refusal-reply' })).toBe(true);
    advance(branch, branch.s.minute + 90);
    expect(branch.s.refusalReply!.speech).toBeUndefined();
    expect(branch.s.refusalReply!.heard).toBe(false);
    expect(branch.s.refusalReply!.withdrawn).toBe(true);
  }
  expect(save(restored)).toEqual(save(g));
});
it('ends one unsuccessful reply with a retained reason and one failure note', () => {
  const g = fixture();
  const source = exchange(g).statements[0]!;
  const who = source.listener;
  expect(act(g, { verb: 'reply-refusal', who })).toBe(true);
  // This public change lets the listener choose different work. It does not hold either person at the hearth.
  expect(act(g, { verb: 'chalk', cells: [face], on: false })).toBe(true);
  for (let n = 0; n < 12 && g.s.refusalReply!.endedAt === undefined; n++) advance(g, g.s.minute + 30);
  const r = g.s.refusalReply!;
  expect(r.interrupted, JSON.stringify(r)).toBeDefined();
  expect(r.endedAt).toBe(r.interrupted!.at);
  expect(r.speech).toBeUndefined();
  expect(r.heard).toBe(false);
  expect(r.withdrawn).toBeUndefined();
  const failure = structuredClone(r.interrupted!);
  const count = () => g.s.notes.filter((n) => n.text === failure.reason).length;
  expect(count()).toBe(1);
  advance(g, g.s.minute + 90);
  expect(g.s.refusalReply!.interrupted).toEqual(failure);
  expect(count()).toBe(1);
  const p = g.s.people.find((p) => p.id === who)!;
  expect(refusalReplyOffers(g.s, p)).toEqual([]);
  expect(refusalReplySuggestion(g.s, p)).toBeUndefined();
  expect(act(g, { verb: 'reply-refusal', who })).toBe(false);
});
