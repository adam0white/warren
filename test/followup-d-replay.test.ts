import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { advance, fingerprint, GAME_VERSION, type Input, load, replay, save } from '../src/sim/game.ts';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/edition-before-d.json', import.meta.url), 'utf8'),
) as {
  release: { app: string; commit: string; dirty: boolean };
  sha256: string;
  runs: {
    edition: string;
    seed: number;
    policy: string;
    stages: { kind: string; minute: number; fingerprint: string; inputs: Input[] }[];
  }[];
};

describe('historical inputs replay on the current cast edition', () => {
  it('records the unchanged live source before the design follow-up', () => {
    expect(fixture.release).toMatchObject({
      app: '0.3.0',
      commit: 'f9550e832be6447633086151010ca6c4110acd4a',
      dirty: false,
    });
    expect(fixture.sha256).toBe('4cf2d742aee6b5a850ecc88572cddc2fb93385b6207409e1d4c2c97b674d713a');
    expect(fixture.runs).toHaveLength(12);
  });
  for (const run of fixture.runs) {
    it(`${run.edition} seed ${run.seed} ${run.policy}: current exports and checkpoint continuation replay exactly`, {
      timeout: 180000,
    }, () => {
      const checkpoint = run.stages.find((stage) => stage.kind === 'checkpoint');
      if (!checkpoint) throw new Error('Missing checkpoint');
      for (const stage of run.stages) {
        const game =
          stage.kind === 'continuation'
            ? load(
                JSON.parse(
                  JSON.stringify(save(replay(run.seed, checkpoint.inputs, checkpoint.minute, GAME_VERSION))),
                ),
              )
            : replay(run.seed, stage.inputs, stage.minute, GAME_VERSION);
        if (stage.kind === 'continuation') advance(game, stage.minute);
        const currentFingerprint = fingerprint(replay(run.seed, stage.inputs, stage.minute, GAME_VERSION).s);
        expect(fingerprint(game.s)).toBe(currentFingerprint);
        const exported = save(game);
        expect(exported.game).toBe(GAME_VERSION);
        expect(exported.inputs).toEqual(stage.inputs);
        expect(fingerprint(load(JSON.parse(JSON.stringify(exported))).s)).toBe(currentFingerprint);
      }
    });
  }
});
