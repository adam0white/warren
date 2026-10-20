import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { advance, fingerprint, type Input, load, replay, save } from '../src/sim/game.ts';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/edition-ui-before-c.json', import.meta.url), 'utf8'),
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

describe('follow-up c preserves the live editions', () => {
  it('records the unchanged live source before the UI follow-up', () => {
    expect(fixture.release).toMatchObject({
      app: '0.3.0',
      commit: '96e84baf97952412987d11e7d9618238c6867e95',
      dirty: false,
    });
    expect(fixture.sha256).toBe('3ca08574962b3a4cdf21f230fb9591e6d83147b2b70cc314814efb0ca9a0730e');
    expect(fixture.runs).toHaveLength(12);
  });
  for (const run of fixture.runs) {
    it(`${run.edition} seed ${run.seed} ${run.policy}: live exports and checkpoint continuation stay exact`, {
      timeout: 180000,
    }, () => {
      const checkpoint = run.stages.find((stage) => stage.kind === 'checkpoint');
      if (!checkpoint) throw new Error('Missing checkpoint');
      for (const stage of run.stages) {
        const game =
          stage.kind === 'continuation'
            ? load(
                JSON.parse(
                  JSON.stringify(save(replay(run.seed, checkpoint.inputs, checkpoint.minute, run.edition))),
                ),
              )
            : replay(run.seed, stage.inputs, stage.minute, run.edition);
        if (stage.kind === 'continuation') advance(game, stage.minute);
        expect(fingerprint(game.s)).toBe(stage.fingerprint);
        const exported = save(game);
        expect(exported.game).toBe(run.edition);
        expect(exported.inputs).toEqual(stage.inputs);
        expect(fingerprint(load(JSON.parse(JSON.stringify(exported))).s)).toBe(stage.fingerprint);
      }
    });
  }
});
