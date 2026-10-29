import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { replay as replayHF } from '@adam0white/human-framework';
import { expect, it } from 'vitest';
import { load, replay, type Saved } from '../src/sim/game.ts';
import binding from './fixtures/f4-rest1/binding.json';

// Historical source evidence is verified but cannot be played in current Warren.
for (const row of binding.fixtures) {
  it(`preserves and refuses ${row.file}`, () => {
    const bytes = readFileSync(new URL(`./fixtures/f4-rest1/${row.file}`, import.meta.url));
    const body = gunzipSync(bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.gzipSha256);
    expect(createHash('sha256').update(body).digest('hex')).toBe(row.bodySha256);
    const saved = JSON.parse(body.toString()) as Saved;
    const original = JSON.stringify(saved);
    const verified = replayHF(saved.state.hf);
    expect(verified.ok && verified.value.verified).toBe(true);
    if (verified.ok) expect(verified.value.fullHash).toBe(saved.state.hf.hashes.full);
    expect(() => load(saved)).toThrow(/keep.*start fresh/i);
    expect(() =>
      replay(saved.seed, saved.inputs, saved.minute, saved.game, saved.chapter, saved.config, saved.phase),
    ).toThrow(/keep.*start fresh/i);
    expect(JSON.stringify(saved)).toBe(original);
  });
}
