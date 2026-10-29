/** Real current public HF producers; these controls establish no deployed peer. */
import { canonicalCast, createPersona } from '@adam0white/lab-client';
import { describe, expect, it } from 'vitest';
import { authoringFor, project } from '../src/sim/cast.ts';
import { act, advance, load, newGame, save, stateJson } from '../src/sim/game.ts';
import { archiveOf, FRAMEWORK_VERSION } from '../src/sim/hf4.ts';
import { assertHistory, assertReplay, sourceReceipt, validateSource } from '../src/sim/source-history.ts';
import { advanceFrame } from '../src/sim/warren.ts';

const castId = 'hf.cast.meryem.warren';
const source = {
  game: 'warren',
  build: 'test-current-source',
  engine: FRAMEWORK_VERSION,
  rules: 'warren-hf4-1',
};
async function genuineArrival() {
  const producer = newGame(7);
  act(producer, { verb: 'release', who: 'meryem' });
  advance(producer, 330);
  const captured = await project(producer.s, 'meryem');
  const input = await createPersona({
    format: 'hf-persona/1',
    castId,
    castRevision: canonicalCast(castId).revision,
    branchId: 'real-current-producer',
    parentRevision: null,
    source,
    transfer: captured.transfer,
    limitations: [],
  });
  const { revision, ...body } = input;
  const claim = await createPersona({
    ...body,
    parentRevision: revision,
    transfer: { ...input.transfer, portableClaim: { game: 'warren' } },
  });
  const opening = newGame(8);
  const game = newGame(
    8,
    '0.7.0',
    undefined,
    undefined,
    authoringFor([input], archiveOf(opening.s).initial.spec.start),
  );
  game.chapter = {
    version: 'warren-hf4-cast/1',
    inputs: [input],
    claims: [claim],
    initial: stateJson(game.s),
  };
  game.ownedHeads = { [castId]: claim };
  return game;
}

describe('current complete source authority', () => {
  it('accepts genuine seeded, partial and actual admitted current producers', async () => {
    const seeded = newGame(7, '0.7.0', undefined, 'warren-rest/2');
    expect((await validateSource(seeded))()).toBe(true);
    advanceFrame(seeded.s, 0);
    expect((await validateSource(load(save(seeded))))()).toBe(true);
    const admitted = await genuineArrival();
    advance(admitted, 310);
    expect((await validateSource(load(save(admitted))))()).toBe(true);
  });

  it('reads an untrusted self-consistent chapter without granting publication authority', async () => {
    const game = newGame(7);
    game.s.notes[0]!.text += ' custom authored opening';
    game.chapter = { version: 'warren-hf4-cast/1', inputs: [], claims: [], initial: stateJson(game.s) };
    advance(game, 310);
    expect(() => assertReplay(load(save(game)))).not.toThrow();
    await expect(validateSource(game, true)).rejects.toThrow(/complete creation/);
  });

  it('rejects modified complete state even after recomputing the save fingerprint', () => {
    const game = newGame(7);
    game.s.notes[0]!.text += ' forged';
    const saved = save(game);
    expect(() => assertHistory(load(saved))).toThrow(/complete creation/);
  });

  it('rejects a caller supplied chapter initial even when its own replay is consistent', async () => {
    const game = await genuineArrival();
    game.chapter!.initial.notes[0]!.text += ' forged opening';
    game.s.notes[0]!.text += ' forged opening';
    await expect(validateSource(game)).rejects.toThrow(/complete creation/);
  });

  it('rejects stripped claims and SDK-valid forged source or claim metadata', async () => {
    const original = await genuineArrival();
    for (const change of ['stripped', 'rules', 'parent', 'transfer'] as const) {
      const game = load(save(original));
      if (change === 'stripped') game.chapter!.claims = [];
      else {
        const claim = game.chapter!.claims[0]!;
        const { revision: _revision, ...body } = claim;
        const changed = await createPersona({
          ...body,
          ...(change === 'rules' ? { source: { ...source, rules: 'unsupported' } } : {}),
          ...(change === 'parent' ? { parentRevision: null } : {}),
          ...(change === 'transfer' ? { transfer: {} } : {}),
        });
        game.chapter!.claims = [changed];
        game.ownedHeads = { [castId]: changed };
      }
      await expect(validateSource(game)).rejects.toThrow(/complete creation/);
    }
  });

  it('rejects an SDK-valid unsupported producer even with a matching derived claim', async () => {
    const game = await genuineArrival();
    const { revision: _revision, ...body } = game.chapter!.inputs[0]!;
    const input = await createPersona({ ...body, source: { ...source, rules: 'unsupported' } });
    const { revision, ...claimBody } = input;
    const claim = await createPersona({
      ...claimBody,
      parentRevision: revision,
      transfer: { ...input.transfer, portableClaim: { game: 'warren' } },
    });
    game.chapter!.inputs = [input];
    game.chapter!.claims = [claim];
    game.ownedHeads = { [castId]: claim };
    await expect(validateSource(game)).rejects.toThrow(/complete creation/);
  });

  it('keeps the full producer and requires exact source, head and parent closure', async () => {
    const game = newGame(7);
    const claim = await createPersona({
      format: 'hf-persona/1',
      castId,
      castRevision: canonicalCast(castId).revision,
      branchId: 'current-local-producer',
      parentRevision: null,
      source,
      transfer: { castPassport: 'warren-hf4-active/1', portableClaim: { game: 'warren' } },
      limitations: [],
    });
    game.chapter = { version: 'warren-hf4-cast/1', inputs: [], claims: [claim], initial: stateJson(game.s) };
    game.ownedHeads = { [castId]: claim };
    act(game, { verb: 'release', who: 'meryem' });
    advance(game, 330);
    const parent = game.ownedHeads![castId]!;
    const captured = await project(game.s, 'meryem');
    const head = await createPersona({
      format: 'hf-persona/1',
      castId,
      castRevision: parent.castRevision,
      branchId: parent.branchId,
      parentRevision: parent.revision,
      source,
      transfer: captured.transfer,
      limitations: [],
    });
    game.sourceArchives = { [head.revision]: sourceReceipt(game, head) };
    game.ownedHeads![castId] = head;
    expect((await validateSource(load(save(game))))()).toBe(true);
    const retained = save(game);
    const receipt = retained.sourceArchives![head.revision] as ReturnType<typeof sourceReceipt>;
    expect(receipt.saved.state.hf).toEqual(save(game).state.hf);
    expect(receipt.saved.sourceArchives).toBeUndefined();
    delete retained.sourceArchives;
    await expect(validateSource(load(retained))).rejects.toThrow(/complete creation/);
  });

  it('cancels source changes during async validation and after preparation', async () => {
    const game = await genuineArrival();
    const pending = validateSource(game);
    game.s.notes[0]!.text += ' changed while awaiting';
    await expect(pending).rejects.toThrow(/complete creation/);
    const genuine = await genuineArrival();
    const unchanged = await validateSource(genuine);
    expect(unchanged()).toBe(true);
    delete genuine.ownedHeads;
    expect(unchanged()).toBe(false);
  });
});

it('refuses a real producer from another hill or another input prefix under a reused claim', async () => {
  for (const otherSeed of [8, 7]) {
    const claim = await createPersona({
      format: 'hf-persona/1',
      castId,
      castRevision: canonicalCast(castId).revision,
      branchId: 'retained-prefix-control',
      parentRevision: null,
      source,
      transfer: { castPassport: 'warren-hf4-active/1', portableClaim: { game: 'warren' } },
      limitations: [],
    });
    const claimed = (seed: number) => {
      const g = newGame(seed);
      g.chapter = { version: 'warren-hf4-cast/1', inputs: [], claims: [claim], initial: stateJson(g.s) };
      g.ownedHeads = { [castId]: claim };
      return g;
    };
    const current = claimed(7),
      other = claimed(otherSeed);
    expect(act(other, { verb: 'release', who: 'meryem' })).toBe(true);
    advance(other, 330);
    advance(current, 330);
    const captured = await project(other.s, 'meryem');
    const head = await createPersona({
      format: 'hf-persona/1',
      castId,
      castRevision: claim.castRevision,
      branchId: claim.branchId,
      parentRevision: claim.revision,
      source,
      transfer: captured.transfer,
      limitations: [],
    });
    current.sourceArchives = { [head.revision]: sourceReceipt(other, head) };
    current.ownedHeads![castId] = head;
    const before = save(current);
    await expect(validateSource(current, true)).rejects.toThrow(/complete creation/);
    expect(save(current)).toEqual(before);
  }
});
