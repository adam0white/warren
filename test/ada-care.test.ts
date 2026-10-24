import { type Commitment, ENGINE_VERSION } from '@adam0white/human-framework';
import { createPersona, initialPersonaLife, preparePersonaLife } from '@adam0white/lab-client';
import { describe, expect, it } from 'vitest';
import { completeAdaCare, requestAdaEnd, shiftWatchCare, validateWatchCare } from '../src/sim/ada-care.ts';
import { admit, applyLife, project } from '../src/sim/cast.ts';
import { act, advance, fingerprint, load, newGame, replay, save, stateJson } from '../src/sim/game.ts';

function fixture() {
  const sourceMinute = 1800,
    returnBy = 3240;
  const duty = (id: string, action: string, status: string) => ({
    id,
    kind: 'duty',
    toId: 'ada',
    targetId: 'ada',
    actions: [action],
    from: sourceMinute,
    until: returnBy,
    status,
    importance: 0.8,
  });
  const returning = duty('return-1', 'return-with-ada', 'pending') as Commitment;
  const payload = {
    agreement: {
      version: 'watch-warren-ada/1',
      guardian: 'kian',
      dependent: 'ada',
      sourceMinute,
      returnBy,
      kianAssented: true,
      adaAssented: true,
      commitmentId: 'care-1',
      returnCommitmentId: 'return-1',
      careCompletedAt: 1900,
      status: 'agreed',
    },
    care: { commitment: duty('care-1', 'care-ada', 'kept'), completedAt: 1900 },
    dependent: {
      id: 'ada',
      guardian: 'kian',
      sourceMinute: 1951,
      ageMinutes: 8 * 525600,
      alive: true,
      satiety: 0.3,
      hydration: 0.4,
      sleepPressure: 0.2,
    },
  };
  return { payload, returning };
}
describe('finite Watch Ada contract (declared headless controls)', () => {
  it('admits the exact pending return map and replays actual further care without shelf reads', async () => {
    // Declared synthetic portable actor. Genuine Watch gameplay is a separate live receipt.
    const source = newGame(7),
      p = source.s.people.find((p) => p.id === 'kian')!;
    const { payload, returning } = fixture();
    p.now = 1950;
    p.activity = null;
    p.agenda.commitments = [returning];
    p.agenda.goals = [];
    const captured = await project(p);
    captured.transfer.person.person.mappingVersion = 'site-cast-calendar/1';
    const id = 'hf.cast.kian.watch';
    const envelope = await createPersona({
      format: 'hf-persona/1',
      castId: id,
      castRevision: '1',
      branchId: 'care-control',
      parentRevision: null,
      source: { game: 'watch', build: 'synthetic-control', engine: ENGINE_VERSION, rules: 'cast-1' },
      transfer: {
        ...captured.transfer,
        castPassport: 'site-cast/1',
        watchCare: payload,
        life: initialPersonaLife(id, 'care-control', 0),
      },
      limitations: [],
    });
    const input = preparePersonaLife(envelope, 0),
      target = newGame(8),
      index = target.s.people.findIndex((p) => p.id === 'kian');
    target.s.people[index] = admit(input, target.s.people[index]!);
    applyLife(target.s, input);
    const run = newGame(8, '0.6.0', {
      version: 'warren-cast/2',
      inputs: [input],
      claims: [],
      initial: stateJson(target.s),
    });
    expect(run.s.people[index]!.agenda.commitments.find((c) => c.id === 'return-1')?.status).toBe('pending');
    expect(act(run, { verb: 'care-ada' })).toBe(true);
    advance(run, run.s.minute + 600);
    expect(run.s.adaVisit!.careCount).toBeGreaterThan(0);
    const saved = save(run);
    expect(fingerprint(load(saved).s)).toBe(saved.fingerprint);
    expect(fingerprint(replay(saved.seed, saved.inputs, saved.minute, saved.game, saved.chapter).s)).toBe(
      saved.fingerprint,
    );
    expect(act(run, { verb: 'end-ada-visit' })).toBe(true);
    advance(run, run.s.minute + 180);
    expect(run.s.adaVisit!.endedAt).toBeDefined();
    expect(run.s.people[index]!.agenda.commitments.find((c) => c.id === 'return-1')?.status).toBe('pending');
  });
  it('preserves actual reservoirs and one offset without keeping the return', () => {
    const { payload, returning } = fixture();
    const source = validateWatchCare(payload, 1950, [returning]);
    const visit = shiftWatchCare(source, 300 - 1950);
    expect(visit.dependent.satiety).toBe(0.3);
    expect(visit.dependent.sourceMinute).toBe(301);
    expect(visit.returnBy).toBe(1590);
    expect(visit.agreement.sourceMinute).toBe(150);
    expect(visit.care.commitment.until).toBe(1590);
    expect(visit.care.completedAt).toBe(250);
    expect(visit.source.care.commitment.status).toBe('kept');
    expect(returning.status).toBe('pending');
  });
  it('refuses missing assent, forged meal outcome, extended deadline, wrong beneficiary and unrelated home duty', () => {
    for (const mutate of [
      (x: any) => {
        x.agreement.adaAssented = false;
      },
      (x: any) => {
        x.care.commitment.status = 'pending';
      },
      (x: any) => {
        x.agreement.returnBy++;
      },
      (x: any) => {
        x.dependent.guardian = 'tamar';
      },
      (x: any) => {
        x.care.completedAt = 2000;
      },
    ]) {
      const { payload, returning } = fixture();
      mutate(payload);
      expect(() => validateWatchCare(payload, 1950, [returning])).toThrow();
    }
    const { payload, returning } = fixture();
    expect(() =>
      validateWatchCare(payload, 1950, [
        returning,
        { ...returning, id: 'home', actions: ['go-home'], toId: 'home:west' },
      ]),
    ).toThrow();
  });
  it('spends real grain/water only for completed safe care and keeps provenance through an end choice', () => {
    const { s } = newGame(7),
      { payload, returning } = fixture();
    s.adaVisit = shiftWatchCare(validateWatchCare(payload, 1950, [returning]), s.minute - 1950);
    const p = s.people.find((p) => p.id === 'kian')!;
    p.activity = null;
    const h = s.houses.find((h) => h.members.includes('kian'))!;
    const water = Object.keys(s.hill.water)
      .map(Number)
      .find((i) => (s.hill.water[i] ?? 0) > 0.1)!;
    const grain = h.jars,
      amount = s.hill.water[water]!;
    expect(completeAdaCare(s, p, false, water)).toBe(false);
    expect(h.jars).toBe(grain);
    expect(completeAdaCare(s, p, true, water)).toBe(true);
    expect(h.jars).toBeCloseTo(grain - 0.1);
    expect(s.hill.water[water]).toBeCloseTo(amount - 0.1);
    expect(s.adaVisit.dependent.satiety).toBeCloseTo(0.65);
    expect(s.adaVisit.source.dependent.satiety).toBe(0.3);
    expect(requestAdaEnd(s)).toBe(true);
    expect(s.adaVisit.endedAt).toBe(s.minute);
    expect(returning.status).toBe('pending');
    expect(completeAdaCare(s, p, true, water)).toBe(false);
  });
});
