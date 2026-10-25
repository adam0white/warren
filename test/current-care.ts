/** Keep the genuine run and source actors. Regenerate only host narration for this text version. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { admit, applyLife } from '../src/sim/cast.ts';
import { newGame, replay, type Saved, save, stateJson } from '../src/sim/game.ts';
import { CAST_IDS } from '../src/sim/people.ts';

export function currentCareSaved(): Saved & { ownedHeads: NonNullable<Saved['ownedHeads']> } {
  const old = JSON.parse(
    readFileSync(new URL('./fixtures/genuine-care-ended.json', import.meta.url), 'utf8'),
  ) as Saved;
  assert.ok(old.chapter);
  assert.ok(old.ownedHeads);
  const opening = newGame(old.seed, old.game);
  for (const input of old.chapter.inputs) {
    const index = opening.s.people.findIndex((p) => CAST_IDS[p.id] === input.parent.castId);
    assert.ok(index >= 0);
    opening.s.people[index] = admit(input, opening.s.people[index]!);
    applyLife(opening.s, input);
  }
  const initial = stateJson(opening.s);
  const { notes: oldNotes, ...oldRules } = old.chapter.initial;
  const { notes: newNotes, ...newRules } = initial;
  // The source envelopes and inputs are retained verbatim. The host supplies this
  // opening rumour; compare its queued structure while allowing its prose to change.
  const rules = (s: typeof oldRules) => {
    const copy = structuredClone(s);
    // Engine stamps and the explicit host narration opt-in are the only new metadata.
    for (const person of copy.people) {
      if (person.lexicon?.plainEnglish === true) {
        delete person.lexicon.plainEnglish;
        if (!Object.keys(person.lexicon).length) delete person.lexicon;
      }
      person.engine = '2.21.0';
    }
    for (const events of Object.values(copy.queued)) {
      for (const event of events) event.summary = '';
    }
    return copy;
  };
  assert.deepEqual(rules(newRules), rules(oldRules));
  assert.deepEqual(
    newNotes.map(({ text: _, ...n }) => n),
    oldNotes.map(({ text: _, ...n }) => n),
  );
  const chapter = { ...old.chapter, initial };
  return {
    ...old,
    ...save(replay(old.seed, old.inputs, old.minute, old.game, chapter)),
    ownedHeads: old.ownedHeads,
  };
}
