import {
  createPerson,
  createRun,
  exportRun,
  inspect,
  replay as replayHF,
  step,
  validatePortablePerson,
} from '@adam0white/human-framework';
import { canonicalCast, createPersona } from '@adam0white/lab-client';
import { describe, expect, it } from 'vitest';
import { authoringFor, portableOf, project } from '../src/sim/cast.ts';
import { act, advance, fingerprint, load, newGame, replay, save, stateJson } from '../src/sim/game.ts';
import { archiveOf, FRAMEWORK_VERSION, need } from '../src/sim/hf4.ts';

async function source() {
  // Actual public release ends optional local goals through admitted HF inputs.
  // Projection must refuse the still-active ordinary opening without dropping history.
  const game = newGame(7, '0.7.0', undefined, 'warren-rest/2');
  await expect(project(game.s, 'meryem')).rejects.toThrow();
  expect(act(game, { verb: 'release', who: 'meryem' })).toBe(true);
  advance(game, 330);
  expect(
    game.s.people
      .find((person) => person.id === 'meryem')
      ?.agenda.goals.some((goal) => goal.status === 'active'),
  ).toBe(false);
  const captured = await project(game.s, 'meryem');
  const castId = 'hf.cast.meryem.warren';
  const envelope = await createPersona({
    format: 'hf-persona/1',
    castId,
    castRevision: canonicalCast(castId).revision,
    branchId: 'test-hf4',
    parentRevision: null,
    source: { game: 'warren', build: 'test', engine: FRAMEWORK_VERSION, rules: 'warren-hf4-1' },
    transfer: captured.transfer,
    limitations: [],
  });
  return { game, captured, envelope };
}
describe('HF4 retained cast', () => {
  it('projects through public inspect without changing the live archive', async () => {
    const { game, captured, envelope } = await source();
    const before = archiveOf(game.s);
    expect(portableOf(envelope).version).toBe(2);
    expect(captured.raw).toEqual(before);
    await project(game.s, 'meryem');
    expect(archiveOf(game.s)).toEqual(before);
    const replayed = replayHF(captured.raw);
    expect(replayed.ok).toBe(true);
    if (replayed.ok) expect(replayed.value.fullHash).toBe(before.hashes.full);
  });
  it('retains admission inputs and exact opening state in export replay', async () => {
    const { envelope } = await source();
    const base = newGame(8, '0.7.0', undefined, 'warren-rest/2');
    const target = newGame(
      8,
      '0.7.0',
      undefined,
      'warren-rest/2',
      authoringFor([envelope], archiveOf(base.s).initial.spec.start),
    );
    expect(
      target.s.hfQueue.some(
        (input) =>
          input.kind === 'agenda.requested' &&
          input.payload.person === 'meryem' &&
          input.payload.request.type === 'goal' &&
          input.payload.request.goal.id === 'refuge',
      ),
    ).toBe(true);
    const chapter = {
      version: 'warren-hf4-cast/1' as const,
      inputs: [envelope],
      claims: [],
      initial: stateJson(target.s),
    };
    const run = newGame(8, '0.7.0', chapter, 'warren-rest/2');
    const saved = save(run);
    expect(fingerprint(load(saved).s)).toBe(saved.fingerprint);
    expect(
      fingerprint(replay(8, saved.inputs, saved.minute, saved.game, saved.chapter, saved.config).s),
    ).toBe(saved.fingerprint);
  });
  it('refuses wrong identity and active ownership instead of silently replacing history', async () => {
    const { envelope } = await source();
    expect(() => portableOf({ ...envelope, castId: 'hf.cast.yusuf.warren' })).toThrow(/cannot continue/);
    const portable = envelope.transfer.portable as import('@adam0white/human-framework').PortablePerson;
    if (portable.version !== 2) throw Error('Expected retained source');
    const { retained: _retained, ...profile } = portable;
    const profileOnly = { ...profile, version: 1 as const };
    expect(validatePortablePerson(profileOnly).version).toBe(1);
    expect(() =>
      portableOf({
        ...envelope,
        transfer: { ...envelope.transfer, castPassport: 'hf-portable-person/1', portable: profileOnly },
      }),
    ).toThrow(/cannot continue/);

    expect(() =>
      portableOf({ ...envelope, transfer: { ...envelope.transfer, portableClaim: { game: 'warren' } } }),
    ).toThrow(/belongs/);
  });
});

it('admits an actual lived Warren passport with remembered world references and replays the receiving run', async () => {
  const game = newGame(7, '0.7.0', undefined, 'warren-rest/2');
  advance(game, 900);
  expect(act(game, { verb: 'release', who: 'meryem' })).toBe(true);
  advance(game, 930);
  let captured: Awaited<ReturnType<typeof project>> | undefined;
  for (let n = 0; n < 12 && !captured; n++) {
    try {
      captured = await project(game.s, 'meryem');
    } catch {
      advance(game, game.s.minute + 30);
    }
  }
  if (!captured) throw Error('The lived person did not reach an eligible quiet boundary');
  const portable = captured.transfer.portable;
  expect(portable.version).toBe(2);
  if (portable.version !== 2) throw Error('Expected retained memory');
  expect(portable.retained.memory.episodes.some((e) => e.placeId || e.actorId === 'travellers')).toBe(true);
  const envelope = await createPersona({
    format: 'hf-persona/1',
    castId: portable.castId,
    castRevision: portable.castRevision,
    branchId: 'lived-world',
    parentRevision: null,
    source: { game: 'warren', build: 'test', engine: FRAMEWORK_VERSION, rules: 'warren-hf4-1' },
    transfer: captured.transfer,
    limitations: [],
  });
  const before = archiveOf(game.s);
  const target = newGame(8, '0.7.0', undefined, 'warren-rest/2', authoringFor([envelope], 300 * 60000));
  const received = archiveOf(target.s);
  expect(received.initial.spec.world.facts.some((f) => f.subject === 'travellers')).toBe(true);
  expect(archiveOf(game.s)).toEqual(before);
  const verified = replayHF(received);
  expect(verified.ok).toBe(true);
  if (verified.ok) expect(verified.value.fullHash).toBe(received.hashes.full);
  const saved = save(target);
  expect(save(load(saved))).toEqual(saved);
});

it('preserves a current foreign chapter place as historical evidence without claiming local presence', async () => {
  const base = archiveOf(newGame(7).s);
  const spec = structuredClone(base.initial.spec);
  spec.id = 'watch-authored-port-control';
  spec.host.id = 'watch';
  spec.definitions.sources = [
    ...spec.definitions.sources.filter((source) => source.type !== 'host'),
    { type: 'host', id: 'watch' },
  ];
  spec.world.facts = spec.world.facts.map((f) => ({
    ...f,
    provenance: { ...f.provenance, source: 'watch' },
  }));
  spec.world.facts = [
    ...spec.world.facts,
    {
      id: 'watch-map:courtyard',
      subject: 'watch-courtyard',
      predicate: 'kind',
      value: 'place',
      at: spec.start,
      provenance: { source: 'watch', evidenceId: 'watch-authored-map' },
    },
  ];
  const run = need(createRun(spec));
  const person = base.initial.people.find((p) => p.id === 'meryem')!;
  need(createPerson(run, person));
  const inputs = person.state.agenda.goals.map((goal, n) => ({
    id: `release:${n}`,
    at: spec.start,
    source: { type: 'host' as const, id: 'watch' },
    kind: 'agenda.requested' as const,
    payload: { person: 'meryem', request: { type: 'abandon-goal' as const, goalId: goal.id } },
  }));
  need(
    step(run, {
      until: spec.start,
      inputs: [
        ...inputs,
        {
          id: 'courtyard-sighting',
          at: spec.start,
          source: { type: 'host', id: 'watch' },
          kind: 'observation.received',
          payload: {
            person: 'meryem',
            evidenceId: 'watch-courtyard-sighting',
            percepts: [
              {
                id: 'courtyard-percept',
                occurredAt: spec.start,
                channel: 'saw',
                kind: 'travellers',
                actorId: 'travellers',
                targetId: 'watch-courtyard',
                placeId: 'watch-courtyard',
                salience: 0.9,
                summary: 'Travellers crossed the Watch courtyard.',
                claims: [],
                norms: [],
                advice: [],
                consequences: [],
                withdrawConsequences: [],
                witnesses: [],
                reports: [],
                provenance: ['watch-authored-map'],
              },
            ],
          },
        },
      ],
    }),
  );
  const projection = need(
    inspect(run, {
      perspective: { kind: 'host' },
      people: ['meryem'],
      select: ['persona', 'calendar'],
      portable: { person: 'meryem', castId: 'hf.cast.meryem.warren', castRevision: '1' },
    }),
  );
  const view = projection.people[0]!;
  if (view.kind !== 'host') throw Error('Expected host projection');
  const part = view.parts.find((p) => p.select === 'persona');
  if (part?.select !== 'persona') throw Error('Expected portable projection');
  const portable = part.value;
  const envelope = await createPersona({
    format: 'hf-persona/1',
    castId: portable.castId,
    castRevision: portable.castRevision,
    branchId: 'foreign-world',
    parentRevision: null,
    source: { game: 'watch', build: 'authored-control', engine: FRAMEWORK_VERSION, rules: 'control' },
    transfer: { castPassport: 'hf-portable-person/2', portable },
    limitations: [],
  });
  const before = exportRun(run);
  const target = newGame(8, '0.7.0', undefined, 'warren-rest/2', authoringFor([envelope], spec.start));
  const received = archiveOf(target.s);
  expect(
    received.initial.spec.world.facts.find((f) => f.subject === 'history:watch:watch-courtyard')?.value,
  ).toBe('historical-entity:watch:watch-courtyard');
  const memory = received.current.people.meryem!.memory;
  expect(memory.episodes.some((e) => e.placeId === 'history:watch:watch-courtyard')).toBe(true);
  expect(exportRun(run)).toEqual(before);
  expect(replayHF(received).ok).toBe(true);
});

it('retains an unfamiliar duty without making it a local action', async () => {
  const { envelope } = await source();
  const portable = structuredClone(portableOf(envelope));
  if (portable.version !== 2) throw Error('Expected retained source');
  portable.retained.agenda.commitments.push({
    id: 'foreign-duty',
    kind: 'duty',
    actions: ['return-to-source', 'cook'],
    from: portable.retained.at,
    until: portable.retained.at + 60000,
    importance: 0.8,
    label: 'Return to the source',
    status: 'pending',
  });
  const foreignNorm = { ...structuredClone(portable.retained.calendar.norms[0]!), id: 'keep-watch' };
  (portable.retained.calendar.norms as (typeof foreignNorm)[]).push(foreignNorm);
  (
    portable.retained.heldNorms as {
      normId: string;
      standing: typeof foreignNorm.standing;
      conviction: number;
      provenance: typeof foreignNorm.provenance;
    }[]
  ).push({
    normId: foreignNorm.id,
    standing: foreignNorm.standing,
    conviction: 0.5,
    provenance: foreignNorm.provenance,
  });
  portable.retained.agenda.owed.push({
    ofId: 'old-duty',
    kind: 'duty',
    actions: ['return-to-source'],
    reason: 'missed',
    at: portable.retained.at,
  });
  const incoming = { ...envelope, transfer: { ...envelope.transfer, portable } };
  const target = newGame(8, '0.7.0', undefined, 'warren-rest/2', authoringFor([incoming], 300 * 60000));
  const archive = archiveOf(target.s);
  const duty = archive.current.people.meryem!.agenda.commitments.find((c) => c.id === 'foreign-duty');
  expect(duty?.actions).toEqual(['history:warren:return-to-source', 'cook']);
  expect(duty?.status).toBe('pending');
  expect(archive.initial.spec.definitions.norms.find((norm) => norm.id === 'keep-watch')).toEqual(
    foreignNorm,
  );
  expect(
    archive.current.people.meryem!.agenda.owed.find((owed) => owed.ofId === 'old-duty')?.actions,
  ).toEqual(['history:warren:return-to-source']);
  expect(replayHF(archive).ok).toBe(true);
});
