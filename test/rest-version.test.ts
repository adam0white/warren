import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { replay as replayHF } from '@adam0white/human-framework';
import { expect, it } from 'vitest';
import { act, advance, load, replay, type Saved, save } from '../src/sim/game.ts';
import binding from './fixtures/f4-rest1/binding.json';

function fixture(name: string): Saved {
  const bytes = readFileSync(new URL(`./fixtures/f4-rest1/${name}.json.gz`, import.meta.url));
  const body = gunzipSync(bytes);
  const row = binding.fixtures.find((r) => r.file === `${name}.json.gz`)!;
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.gzipSha256);
  expect(createHash('sha256').update(body).digest('hex')).toBe(row.bodySha256);
  return JSON.parse(body.toString());
}
// SCOPE: genuine served-f4 complete host/HF/RNG bodies, not current code wearing
// an old config. Each control cold-restores, fully replays and advances the old
// recorded hill by the same sixty minutes without editing any actor or history.
for (const mode of ['marked', 'refusal']) {
  it(`continues the exact served f4 rest/1 ${mode} hill natively and from its full file`, () => {
    const full = fixture(`${mode}-native`);
    const expected = fixture(`${mode}-next`);
    const native = load(full);
    const file = replay(
      full.seed,
      full.inputs,
      full.minute,
      full.game,
      full.chapter,
      full.config,
      full.phase,
    );
    expect(
      save(
        replay(
          expected.seed,
          expected.inputs,
          expected.minute,
          expected.game,
          expected.chapter,
          expected.config,
          expected.phase,
        ),
      ),
    ).toEqual(expected);
    expect(save(native)).toEqual(full);
    expect(save(file)).toEqual(full);
    for (const saved of [full, expected]) {
      const verified = replayHF(saved.state.hf);
      expect(verified.ok && verified.value.verified).toBe(true);
      if (verified.ok) expect(verified.value.fullHash).toBe(saved.state.hf.hashes.full);
    }
    if (mode === 'refusal') {
      expect(native.s.refusalReply?.endedAt).toBeUndefined();
      expect(native.s.next?.discussion?.exchange).toBe(true);
      expect(act(native, { verb: 'discuss-cut' })).toBe(false);
      expect(
        save(
          replay(
            expected.seed,
            expected.inputs,
            expected.minute,
            expected.game,
            expected.chapter,
            expected.config,
            expected.phase,
          ),
        ),
      ).toEqual(expected);
      expect(save(native)).toEqual(full);
    }
    for (const g of [native, file]) {
      advance(g, expected.minute);
      expect(save(g)).toEqual(expected);
    }
    expect(expected.state.people).toHaveLength(6);
    if (mode === 'marked') expect(native.s.next?.discussion).toBeUndefined();
  });
}
