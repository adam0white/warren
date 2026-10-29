import { exportRun, preview, replay as replayHF, restoreRun, step } from '@adam0white/human-framework';
import { expect, it } from 'vitest';
import { act, advance, load, newGame, replay, save } from '../src/sim/game.ts';
import { hfRunOf, need } from '../src/sim/hf4.ts';
import { advanceFrame } from '../src/sim/warren.ts';

it('keeps a pending actual game request across JSON restore and exact game-log replay', () => {
  const original = newGame(7);
  advanceFrame(original.s, 0);
  const checkpoint = JSON.parse(JSON.stringify(save(original)));
  expect(checkpoint.state.hfPhase.result.boundary.type).toBe('world-required');
  const run = need(restoreRun(checkpoint.state.hf));
  const pending = need(step(run, { until: checkpoint.state.hfPhase.target, inputs: [] }));
  expect(pending.boundary).toEqual(checkpoint.state.hfPhase.result.boundary);
  const resumed = load(checkpoint);
  const reconstructed = replay(
    checkpoint.seed,
    checkpoint.inputs,
    checkpoint.minute,
    checkpoint.game,
    checkpoint.chapter,
    checkpoint.config,
    checkpoint.phase,
  );
  expect(save(reconstructed)).toEqual(checkpoint);
  for (const game of [original, resumed, reconstructed]) advance(game, 330);
  expect(save(resumed)).toEqual(save(original));
  expect(save(reconstructed)).toEqual(save(original));
});

it('restores accepted active work and keeps self preview read-only', () => {
  const original = newGame(7);
  advance(original, 330);
  expect(original.s.people.some((person) => person.activity)).toBe(true);
  // Exact 4.10.0 engine plus the phrasebook and declared world-entity registry are replay identity.
  expect(save(original).state.hf.hashes.full).toBe(
    '964e4648511d579516caf06e061d7585e7590978dc55598911a57dc57de18ef1',
  );
  const checkpoint = JSON.parse(JSON.stringify(save(original))),
    resumed = load(checkpoint);
  const run = hfRunOf(original.s),
    before = JSON.stringify(exportRun(run));
  need(
    preview(run, {
      perspective: { kind: 'person', observer: 'meryem' },
      person: 'meryem',
      until: checkpoint.state.hf.current.at + 60000,
      inputs: [],
    }),
  );
  expect(JSON.stringify(exportRun(run))).toBe(before);
  advance(original, 360);
  advance(resumed, 360);
  expect(save(resumed)).toEqual(save(original));
  const replayed = need(replayHF(save(original).state.hf));
  expect(replayed.verified).toBe(true);
  expect(replayed.fullHash).toBe(save(original).state.hf.hashes.full);
});

it('finishes an in-flight quantum before logging a player input, then exports exact replay', () => {
  const original = newGame(7, '0.7.0', undefined, 'warren-rest/1');
  for (let n = 0; n < 13; n++) advanceFrame(original.s, 0);
  expect(original.s.hfPhase).toBeDefined();
  expect(act(original, { verb: 'bell' })).toBe(true);
  expect(original.s.hfPhase).toBeUndefined();
  expect(original.inputs.at(-1)?.at).toBe(330);
  const checkpoint = save(original);
  const reconstructed = replay(
    checkpoint.seed,
    checkpoint.inputs,
    checkpoint.minute,
    checkpoint.game,
    checkpoint.chapter,
    checkpoint.config,
    checkpoint.phase,
  );
  expect(save(reconstructed)).toEqual(checkpoint);
  expect(checkpoint.state.hf.engine.package).toBe('@adam0white/human-framework@4.10.0');
});
