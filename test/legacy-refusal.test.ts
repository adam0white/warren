import { describe, expect, it } from 'vitest';
import { fingerprint, load, newGame, replay, save } from '../src/sim/game.ts';
import { prepareNativeReturn, projectNativeReturn } from '../src/sim/native-return.ts';

describe('explicit old-save and old-link refusal', () => {
  it('keeps old HF3 notebooks distinguishable from fresh games', () => {
    const saved = save(newGame(7));
    saved.framework = '3.0.0';
    expect(() => load(saved)).toThrow(/Start fresh/);
    expect(() => newGame(7, '0.6.0')).toThrow(/Start|fresh|supported/i);
  });
  it('refuses damaged current host state and unsupported input records', () => {
    const saved = save(newGame(7));
    const changed = structuredClone(saved);
    changed.state.houses[0]!.jars += 1;
    expect(() => load(changed)).toThrow(/verification/);
    expect(() => load({ ...saved, seed: saved.seed + 1 })).toThrow(/invalid/);
    expect(() => load({ ...saved, inputs: [{ at: 300, verb: 'unknown' } as never] })).toThrow(/invalid/);
    expect(() => replay(7, [{ at: 300, verb: 'bell', extra: true } as never], 330)).toThrow(/invalid/);
  });
  it('refuses old Watch handoffs without changing the hill or marking a journey complete', async () => {
    const game = newGame(7);
    const before = fingerprint(game.s);
    expect(prepareNativeReturn(game.s, 'meryem')).toBe(false);
    await expect(projectNativeReturn(game.s, 'kian')).rejects.toThrow(/older Watch/);
    expect(fingerprint(game.s)).toBe(before);
  });
});
