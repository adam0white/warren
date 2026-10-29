import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { load, newGame, replay, type Saved, save } from '../src/sim/game.ts';

it('refuses the genuine served rest/1 save without changing it', () => {
  const bytes = readFileSync(new URL('./fixtures/f4-rest1/marked-native.json.gz', import.meta.url));
  const saved = JSON.parse(gunzipSync(bytes).toString()) as Saved;
  const before = JSON.stringify(saved);
  expect(() => load(saved)).toThrow(/keep.*start fresh/i);
  expect(JSON.stringify(saved)).toBe(before);
});

it('defaults to the only current configuration and refuses alternate constructors', () => {
  expect(newGame(7).s.next?.config).toBe('warren-rest/2');
  expect(() => newGame(7, '0.7.0', undefined, 'warren-rest/1')).toThrow();
});

it('refuses noncurrent and missing recorded configurations without changing the saved object', () => {
  const current = save(newGame(7));
  for (const config of ['warren-next/1', 'warren-next/2', 'unknown', undefined]) {
    const saved = structuredClone(current);
    (saved as { config?: string }).config = config;
    if (saved.state.next) (saved.state.next as { config?: string }).config = config;
    const before = JSON.stringify(saved);
    expect(() => load(saved)).toThrow(/keep.*start fresh/i);
    expect(() =>
      replay(saved.seed, saved.inputs, saved.minute, saved.game, saved.chapter, config as never),
    ).toThrow(/keep.*start fresh/i);
    expect(JSON.stringify(saved)).toBe(before);
  }
});
