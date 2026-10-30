import { expect, it } from 'vitest';
import { amendsUnavailable, observeAmends } from '../src/sim/bell-amends.ts';
import { act, advance, fingerprintJson, load, newGame, replay, save } from '../src/sim/game.ts';
import { heard, residentReply } from '../src/sim/hf4.ts';
import { exposureWords } from '../src/ui/exposure.ts';

function falseCall(seed = 7, at = 660) {
  const g = newGame(seed, '0.7.0', undefined, 'warren-rest/2');
  expect(act(g, { verb: 'ask-bell-amends', who: 'maryam' })).toBe(false);
  expect(act(g, { verb: 'bell' })).toBe(true);
  advance(g, at);
  expect(g.s.bell).toBeNull();
  return g;
}
function exact(g: ReturnType<typeof newGame>) {
  const full = JSON.parse(JSON.stringify(save(g)));
  const n = load(full),
    f = replay(full.seed, full.inputs, full.minute, full.game, full.chapter, full.config, full.phase);
  expect(save(n)).toEqual(full);
  expect(save(f)).toEqual(full);
  for (const run of [g, n, f]) advance(run, full.minute + 60);
  expect(save(n)).toEqual(save(g));
  expect(save(f)).toEqual(save(g));
}
// Full live setup and all hearing/choice/history assertions run inside every
// deadline. Native and file journeys each retain full equality and continuation.
function completedApology() {
  const g = falseCall(3, 960);
  const oldAnswers = structuredClone(g.s.answers);
  expect(amendsUnavailable(g.s, 'yusuf')).toBeUndefined();
  expect(act(g, { verb: 'ask-bell-amends', who: 'yusuf' })).toBe(true);
  expect(act(g, { verb: 'talk-rest', who: 'yusuf' })).toBe(false);
  for (let n = 0; n < 8 && !g.s.bellAmends!.speech; n++) advance(g, g.s.minute + 30);
  const r = g.s.bellAmends!;
  // Reaction wording must come from this actual HF event and its recorded variant.
  for (const answer of r.answers.filter((a) => a.eventId)) {
    const actor = g.s.people.find((p) => p.id === r.who)!;
    const event = actor.events.find((e) => e.id === answer.eventId)!;
    expect(answer.says).toBe(residentReply(actor, event));
  }
  expect(r.speech, JSON.stringify(r)).toBeDefined();
  expect(r.speech!.at - r.speech!.workFrom).toBeGreaterThanOrEqual(30);
  advance(g, g.s.minute + 30);
  expect(g.s.bellAmends!.speech!.heard).toBe(true);
  const p = g.s.people.find((p) => p.id === 'yusuf')!;
  expect(heard(p, r.speech!.text, r.speech!.at)).toBe(true);
  expect(g.s.answers).toEqual(oldAnswers);
  expect(exposureWords(g.s, p)).not.toContain('When the bell rang');
  expect(g.s.notes.some((n) => n.at === 300 && n.text.includes('though no one had seen smoke'))).toBe(true);
  expect(act(g, { verb: 'ask-bell-amends', who: 'yusuf' })).toBe(false);
  return g;
}
function restoredApology(restore: 'native' | 'file') {
  const g = completedApology();
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
it('restores an actual completed apology natively without forgiving or refunding history', () =>
  restoredApology('native'));
it('replays an actual completed apology file without forgiving or refunding history', () =>
  restoredApology('file'));
it('rejects stripped apology history after the complete actual hearing', () => {
  const g = completedApology();
  const before = save(g);
  const stripped = JSON.parse(JSON.stringify(save(g)));
  delete stripped.state.bellAmends;
  stripped.fingerprint = fingerprintJson(stripped.state);
  let error: unknown;
  try {
    load(stripped);
  } catch (caught) {
    error = caught;
  }
  expect(String((error as Error).cause)).toContain('history does not match its complete replay');
  expect(save(g)).toEqual(before);
});
it('preserves withdrawal and does not infer attendance from an apology flag', () => {
  const g = falseCall();
  expect(act(g, { verb: 'ask-bell-amends', who: 'maryam' })).toBe(true);
  expect(act(g, { verb: 'withdraw-bell-amends' })).toBe(true);
  advance(g, 900);
  expect(g.s.bellAmends!.speech).toBeUndefined();
  const r = g.s.bellAmends!;
  const retained = structuredClone(r);
  r.speech = {
    at: g.s.minute,
    startedAt: g.s.minute,
    workFrom: g.s.minute,
    text: 'Unattended apology flag',
    heard: false,
  };
  observeAmends(g.s);
  expect(r.speech.heard).toBe(false);
  g.s.bellAmends = retained;
  exact(g);
});

it('retains review assent followed by actual ordinary work as an unheard apology', () => {
  const g = falseCall();
  expect(act(g, { verb: 'ask-bell-amends', who: 'maryam' })).toBe(true);
  advance(g, 900);
  const r = g.s.bellAmends!;
  expect(r.answers[0]!.verdict).toBe('assented');
  expect(r.answers.at(-1)!.action).toBe('cook');
  expect(r.answers.at(-1)!.verdict).toBeUndefined();
  expect(r.speech).toBeUndefined();
  expect(r.endedAt).toBeDefined();
  exact(g);
});
