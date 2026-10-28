import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createPerson, createRun, exportRun, inspect, replay, restoreRun } from '@adam0white/human-framework';

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
const negativeBefore = exportRun(run);
const admission = createPerson(run, authored);
assert.deepEqual(exportRun(run), negativeBefore);
assert.equal(admission.ok, false);
assert.equal(admission.error.code, 'invalid-admission');
assert.equal(admission.error.path, '$.portable');
// Correction: world-fact subjects are registered lifecycle entities. Declare the
// actual receiving-world places/group, without changing the incoming passport.
const receiving = read('target-spec.json');
const declared = new Set(receiving.definitions.sources.filter((s) => s.type === 'person').map((s) => s.id));
declared.add(authored.id);
const remembered = new Set();
for (const e of [...projected.retained.memory.episodes, ...projected.retained.memory.gists])
  for (const key of ['actorId', 'targetId', 'placeId']) if (e[key]) remembered.add(e[key]);
receiving.world.facts.push(
  ...[...remembered]
    .filter((id) => !declared.has(id))
    .map((id) => ({
      id: `entity:${id}`,
      subject: id,
      predicate: 'kind',
      value: id === 'travellers' ? 'group' : 'place',
      at: receiving.start,
      provenance: { source: receiving.host.id, evidenceId: `warren-world:${id}` },
    })),
);
const corrected = need(createRun(receiving));
const admitted = need(createPerson(corrected, authored));
const target = exportRun(corrected);
const targetReplay = need(replay(target));
assert.equal(targetReplay.verified, true);
assert.equal(targetReplay.fullHash, target.hashes.full);
assert.deepEqual(projected, authored.portable.person);

console.log(
  JSON.stringify(
    {
      scope: 'corrected public receiving world; unchanged lived Warren passport admits',
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
      incompleteWorldAdmission: admission,
      correctedWorldAdmission: admitted,
      targetReplayExact: true,
      targetHash: target.hashes.full,
    },
    null,
    2,
  ),
);
