import { expect, it } from 'vitest';
import { project } from '../src/sim/cast.ts';
import { act, advance, fingerprintJson, load, newGame, replay, save } from '../src/sim/game.ts';
import { residentReply } from '../src/sim/hf4.ts';
import { observeTrial } from '../src/sim/tariq-trial.ts';

// Full current six-person Run: the keeper supplies only the new physical trial.
function opening(load: 'middle' | 'edge') {
  const g = newGame(7, '0.7.0', undefined, 'warren-rest/2');
  expect(act(g, { verb: 'visit', who: 'tariq' })).toBe(true);
  expect(act(g, { verb: 'try-tariq-trial', load })).toBe(true);
  return g;
}
function exact(g: ReturnType<typeof opening>) {
  const full = JSON.parse(JSON.stringify(save(g)));
  const native = load(full);
  const file = replay(full.seed, full.inputs, full.minute, full.game, full.chapter, full.config, full.phase);
  expect(save(native)).toEqual(full);
  expect(save(file)).toEqual(full);
  advance(g, full.minute + 60);
  advance(native, full.minute + 60);
  advance(file, full.minute + 60);
  expect(save(native)).toEqual(save(g));
  expect(save(file)).toEqual(save(g));
}
it('pays actual travel and terminal work for one observed dry balance result', async () => {
  const g = opening('middle');
  expect(act(g, { verb: 'talk-rest', who: 'tariq' })).toBe(false);
  for (let n = 0; n < 8 && !g.s.tariqTrial?.result; n++) advance(g, g.s.minute + 30);
  const r = g.s.tariqTrial!;
  // Reaction wording must come from this actual HF event and its recorded variant.
  for (const answer of r.answers.filter((a) => a.eventId)) {
    const actor = g.s.people.find((p) => p.id === 'tariq')!;
    const event = actor.events.find((e) => e.id === answer.eventId)!;
    expect(answer.says).toBe(residentReply(actor, event));
  }
  expect(r.result, JSON.stringify(r)).toBeDefined();
  expect(r.result!.at - r.result!.workFrom).toBeGreaterThanOrEqual(30);
  expect(r.result!.workFrom).toBeGreaterThan(r.result!.startedAt);
  expect(r.result!.state).toBe('upright');
  advance(g, g.s.minute + 30);
  expect(r.result!.observed).toBe(true);
  expect(act(g, { verb: 'try-tariq-trial', load: 'edge' })).toBe(false);
  const before = save(g);
  await expect(project(g.s, 'tariq')).rejects.toThrow(/boat trial/);
  expect(save(g)).toEqual(before);
  exact(g);
});
it('changes only the prospective load position and tips outside the support', () => {
  const g = opening('edge');
  for (let n = 0; n < 8 && !g.s.tariqTrial?.result; n++) advance(g, g.s.minute + 30);
  const r = g.s.tariqTrial!;
  expect(r.result, JSON.stringify(r)).toBeDefined();
  expect(r.result!.centerOfMassMm).toBeGreaterThan(r.fixture.supportHalfWidthMm);
  expect(r.result!.state).toBe('tipped');
  // A retained result flag alone cannot establish HF observation.
  const full = save(g);
  r.result!.observed = false;
  const p = g.s.people.find((p) => p.id === 'tariq')!;
  const original = r.result!.text;
  r.result!.text = 'Unattended unrelated balance result';
  observeTrial(g.s);
  expect(r.result!.observed).toBe(false);
  r.result!.text = original;
  r.result!.observed = full.state.tariqTrial!.result!.observed;
  expect(full.state.people).toHaveLength(6);
  exact(g);
});
it('retains withdrawal and danger without performing the trial', () => {
  const g = opening('middle');
  expect(act(g, { verb: 'withdraw-tariq-trial' })).toBe(true);
  advance(g, g.s.minute + 240);
  expect(g.s.tariqTrial!.result).toBeUndefined();
  expect(g.s.tariqTrial!.withdrawn).toBe(true);
  exact(g);
  const danger = opening('edge');
  expect(act(danger, { verb: 'bell' })).toBe(true);
  advance(danger, danger.s.minute + 30);
  expect(danger.s.tariqTrial!.result).toBeUndefined();
  expect(danger.s.tariqTrial!.endedAt).toBeDefined();
  exact(danger);
});

it('records an actual interrupted trial and refuses stripped prop history before publication', async () => {
  const g = opening('edge');
  // Use the frame boundary to interrupt work that Run really started, not a
  // fabricated activity or an unanswered invitation.
  const { advanceFrame } = await import('../src/sim/warren.ts');
  for (
    let n = 0;
    n < 10000 && !g.s.people.find((p) => p.id === 'tariq')?.activity?.affordanceId.startsWith('tariq-trial-');
    n++
  )
    advanceFrame(g.s, 0);
  expect(g.s.people.find((p) => p.id === 'tariq')?.activity?.affordanceId).toMatch(/^tariq-trial-/);
  expect(act(g, { verb: 'bell' })).toBe(true);
  advance(g, g.s.minute + 240);
  expect(g.s.tariqTrial!.result).toBeUndefined();
  expect(g.s.tariqTrial!.endedAt).toBeDefined();
  const saved = save(g);
  const stripped = structuredClone(saved.state);
  delete stripped.tariqTrial;
  await expect(project(stripped, 'tariq')).rejects.toThrow(/boat trial/);
  expect(save(g)).toEqual(saved);
  exact(g);
});

it('retains a real choice of other activity rather than inventing a completed trial', () => {
  const g = newGame(7, '0.7.0', undefined, 'warren-rest/2');
  expect(act(g, { verb: 'visit', who: 'tariq' })).toBe(true);
  advance(g, 330);
  expect(act(g, { verb: 'try-tariq-trial', load: 'middle' })).toBe(true);
  advance(g, 570);
  const r = g.s.tariqTrial!;
  expect(r.result, JSON.stringify(r)).toBeUndefined();
  expect(r.endedAt).toBeDefined();
  expect(
    r.answers.some((a) => a.action !== 'play'),
    JSON.stringify(r),
  ).toBe(true);
  exact(g);
});

it('rejects recomputed-fingerprint files with stripped or rewritten trial geometry', () => {
  const g = opening('edge');
  for (let n = 0; n < 8 && !g.s.tariqTrial!.result; n++) advance(g, g.s.minute + 30);
  const full = JSON.parse(JSON.stringify(save(g)));
  expect(full.state.tariqTrial.result).toBeDefined();
  const stripped = structuredClone(full);
  delete stripped.state.tariqTrial;
  stripped.fingerprint = fingerprintJson(stripped.state);
  let strippedError: unknown;
  try {
    load(stripped);
  } catch (error) {
    strippedError = error;
  }
  expect(String((strippedError as Error).cause)).toContain('history does not match its complete replay');
  const rewritten = structuredClone(full);
  rewritten.state.tariqTrial.fixture.loadOffsetMm = 0;
  rewritten.fingerprint = fingerprintJson(rewritten.state);
  let rewrittenError: unknown;
  try {
    load(rewritten);
  } catch (error) {
    rewrittenError = error;
  }
  expect(String((rewrittenError as Error).cause)).toContain('history does not match its complete replay');
  expect(save(g)).toEqual(full);
});
