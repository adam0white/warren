import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createPerson, createRun, inspect, replay, restoreRun } from '@adam0white/human-framework';

const read = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const need = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
};
const source = JSON.parse(gunzipSync(readFileSync(new URL('source.hf.json.gz', import.meta.url))));
assert.equal(source.engine.package, '@adam0white/human-framework@4.5.2');
const verified = need(replay(source));
assert.equal(verified.verified, true);
assert.equal(verified.fullHash, source.hashes.full);
const restored = need(restoreRun(source));
const reading = need(
  inspect(restored, {
    perspective: { kind: 'host' },
    people: ['meryem'],
    select: ['persona'],
    portable: { person: 'meryem', castId: 'hf.cast.meryem.warren', castRevision: '1' },
  }),
);
const projected = reading.people[0].parts.find((part) => part.select === 'persona').value;
const authored = read('target-person.json');
assert.deepEqual(projected, authored.portable.person);
const run = need(createRun(read('target-spec.json')));
const admission = createPerson(run, authored);
assert.equal(admission.ok, false);
assert.equal(admission.error.code, 'invalid-admission');
assert.equal(admission.error.path, '$.portable');
console.log(
  JSON.stringify(
    {
      scope: 'actual lived Warren history; public HF calls only; admission refusal is the blocker',
      engine: source.engine,
      sourceReplayExact: true,
      sourceHash: verified.fullHash,
      sourceProjectionMatchesTarget: true,
      rememberedActors: [
        ...new Set(projected.retained.memory.episodes.map((e) => e.actorId).filter(Boolean)),
      ],
      rememberedPlaces: [
        ...new Set(projected.retained.memory.episodes.map((e) => e.placeId).filter(Boolean)),
      ],
      admission,
    },
    null,
    2,
  ),
);
