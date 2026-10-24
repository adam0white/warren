import { ENGINE_VERSION, snapshot } from '@adam0white/human-framework';
import { createPersona, initialPersonaLife, preparePersonaLife } from '@adam0white/lab-client';
import { describe, expect, it } from 'vitest';
import { admit, applyLife, project } from '../src/sim/cast.ts';
import { act, fingerprint, load, newGame, replay, save, stateJson } from '../src/sim/game.ts';
import { CAST_IDS } from '../src/sim/people.ts';

async function source(id = 'meryem') {
  const g = newGame(7),
    p = g.s.people.find((p) => p.id === id)!;
  if (id !== 'kian') expect(act(g, { verb: 'release', who: id })).toBe(true);
  else for (const goal of p.agenda.goals) goal.status = 'achieved'; // declared refusal control only
  const captured = await project(p);
  const castId = CAST_IDS[id]!;
  const envelope = await createPersona({
    format: 'hf-persona/1',
    castId,
    castRevision: '1',
    branchId: 'test-native',
    parentRevision: null,
    source: { game: 'warren', build: 'test', engine: ENGINE_VERSION, rules: 'warren-0.5.0' },
    transfer: { ...captured.transfer, life: initialPersonaLife(castId, 'test-native', 0) },
    limitations: [],
  });
  return { g, p, envelope, captured };
}
describe('bounded Warren calendar mapping', () => {
  it('pins real portable state and coarse outcomes in complete replay initial state', async () => {
    const { g, p, envelope } = await source();
    const input = preparePersonaLife(envelope, 12 * 3600000);
    const target = newGame(8);
    const i = target.s.people.findIndex((p) => p.id === 'meryem');
    target.s.people[i] = admit(input, target.s.people[i]!);
    applyLife(target.s, input);
    expect(target.s.people[i]!.rng).toEqual(p.rng);
    expect(target.s.people[i]!.agenda.goals.some((g) => g.id === 'between-games-assignment')).toBe(true);
    const chapter = {
      version: 'warren-cast/1' as const,
      inputs: [input],
      claims: [],
      initial: stateJson(target.s),
    };
    const run = newGame(8, '0.5.0', chapter),
      saved = save(run);
    expect(fingerprint(load(saved).s)).toBe(saved.fingerprint);
    expect(fingerprint(replay(8, saved.inputs, saved.minute, saved.game, saved.chapter).s)).toBe(
      saved.fingerprint,
    );
    expect(fingerprint(g.s)).not.toBe(saved.fingerprint);
  });
  it('refuses Kian care, unsupported norms and fabricated life rather than resetting', async () => {
    const { envelope } = await source();
    const input = preparePersonaLife(envelope, 0);
    input.life.assignment = (input.life.assignment + 1) % 2;
    expect(() => admit(input, newGame(8).s.people.find((p) => p.id === 'meryem')!)).toThrow(/Life differs/);
    const kian = await source('kian');
    expect(() =>
      admit(preparePersonaLife(kian.envelope, 0), newGame(8).s.people.find((p) => p.id === 'kian')!),
    ).toThrow(/Ada-care/);
  });
  it('keeps actual source checkpoint separate from the shelf projection', async () => {
    const { p, envelope, captured } = await source();
    expect(captured.raw).toEqual(snapshot(p));
    expect(envelope.transfer).not.toHaveProperty('raw');
    expect(captured.transfer.checkpoint.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('preserves a trusted imported Valley norm and captures receipt metadata before hashing', async () => {
    const { g, p } = await source();
    p.conscience.norms.push({ normId: 'dues', standing: 'obligatory', conviction: 0.8 });
    const pending = project(p);
    const now = p.now;
    p.now += 5;
    const captured = await pending;
    expect(captured.transfer.checkpoint.sourceMinute).toBe(now);
    expect(captured.transfer.checkpoint.rng).toEqual(captured.raw.rng);
    expect(captured.transfer.person.calendar.heldNorms.some((n) => n.normId === 'dues')).toBe(true);
    expect(g.s.people).toContain(p);
  });
});
