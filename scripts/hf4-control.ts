/** Actual Warren HF4 host control. No player or panel run, external service, or private actor write. */
import assert from 'node:assert/strict';
import {
  exportRun,
  inspect,
  preview,
  replay as replayHF,
  restoreRun,
  step,
} from '@adam0white/human-framework';
import { act, advance, load, newGame, replay, save } from '../src/sim/game.ts';
import { idx, SURF } from '../src/sim/grid.ts';
import { hfRunOf, need, observeSteps, type StepTiming } from '../src/sim/hf4.ts';
import { advanceFrame } from '../src/sim/warren.ts';

const metrics: StepTiming[] = [];
const stop = observeSteps((sample) => metrics.push(sample));
const face = idx(15, SURF + 3);
const work = newGame(11, '0.7.0', undefined, 'warren-rest/1');
const control = newGame(11, '0.7.0', undefined, 'warren-rest/1');
assert.equal(act(work, { verb: 'chalk', cells: [face], on: true }), true);
advance(work, 900);
advance(control, 900);
assert.ok((work.s.hill.dig[face] ?? 0) > 0, 'an actual chosen pick stroke must cut marked stone');
assert.equal(control.s.hill.dig[face] ?? 0, 0, 'unmarked stone must remain untouched');
const current = save(work);
const reconstructed = replay(
  current.seed,
  current.inputs,
  current.minute,
  current.game,
  current.chapter,
  current.config,
  current.phase,
);
assert.deepEqual(save(reconstructed), current);
const hfReplay = need(replayHF(JSON.parse(JSON.stringify(current.state.hf))));
assert.equal(hfReplay.verified, true);
assert.equal(hfReplay.fullHash, current.state.hf.hashes.full);

const pending = newGame(7);
advanceFrame(pending.s, 0);
assert.equal(pending.s.hfPhase?.result?.boundary.type, 'world-required');
const pendingSave = JSON.parse(JSON.stringify(save(pending)));
const restoredPending = need(restoreRun(pendingSave.state.hf));
const pendingAgain = need(step(restoredPending, { until: pendingSave.state.hfPhase.target, inputs: [] }));
assert.deepEqual(pendingAgain.boundary, pendingSave.state.hfPhase.result.boundary);
const pendingResumed = load(pendingSave);
const pendingRebuilt = replay(
  pendingSave.seed,
  pendingSave.inputs,
  pendingSave.minute,
  pendingSave.game,
  pendingSave.chapter,
  pendingSave.config,
  pendingSave.phase,
);
assert.deepEqual(save(pendingRebuilt), pendingSave);
advance(pending, 330);
advance(pendingResumed, 330);
advance(pendingRebuilt, 330);
assert.deepEqual(save(pendingResumed), save(pending));
assert.deepEqual(save(pendingRebuilt), save(pending));
assert.ok(
  pending.s.people.some((p) => p.activity),
  'a completed accepted start must retain active work',
);
const active = JSON.parse(JSON.stringify(save(pending)));
const activeResumed = load(active);
const run = hfRunOf(pending.s),
  before = JSON.stringify(exportRun(run));
need(
  inspect(run, {
    perspective: { kind: 'person', observer: 'meryem' },
    people: ['meryem'],
    select: ['body', 'events'],
  }),
);
need(
  preview(run, {
    perspective: { kind: 'person', observer: 'meryem' },
    person: 'meryem',
    until: active.state.hf.current.at + 60000,
    inputs: [],
  }),
);
assert.equal(JSON.stringify(exportRun(run)), before);
advance(pending, 360);
advance(activeResumed, 360);
assert.deepEqual(save(activeResumed), save(pending));
stop();
const samples = metrics.slice(30),
  percentile = (key: keyof StepTiming) =>
    samples.map((v) => v[key]).sort((a, b) => a - b)[Math.floor(samples.length * 0.95)];
console.log(
  JSON.stringify(
    {
      scope: 'actual Warren public host control, no player acceptance',
      engine: current.state.hf.engine,
      normalMarkedCut: work.s.hill.dig[face],
      unmarkedControl: control.s.hill.dig[face],
      gameReplayExact: true,
      hfReplayExact: true,
      pendingBoundaryIdentityExact: true,
      pendingGameContinuationExact: true,
      partialGameLogReplayExact: true,
      activeContinuationExact: true,
      inspectionAndPreviewReadOnly: true,
      gameFingerprint: current.fingerprint,
      hfFullHash: current.state.hf.hashes.full,
      active330Hash: active.state.hf.hashes.full,
      exportBytes: Buffer.byteLength(JSON.stringify(current)),
      frameWorkload: {
        people: 6,
        physicalQuantumMinutes: 30,
        hfSliceMinutes: 1,
        samples: samples.length,
        discardedWarmupCalls: 30,
        wallP95Ms: percentile('wallMs'),
        cpuP95Ms: percentile('cpuMs'),
        wallMaxMs: Math.max(...samples.map((v) => v.wallMs)),
        cpuMaxMs: Math.max(...samples.map((v) => v.cpuMs)),
      },
    },
    null,
    2,
  ),
);
