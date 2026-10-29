/** Authored openings admitted by HF, then read through the production inspect bridge. */
import { createPerson, createRun, exportRun, type PersonAuthoring } from '@adam0white/human-framework';
import { newGame } from '../src/sim/game.ts';
import { need, syncReadings } from '../src/sim/hf4.ts';

export function conditionFixture(change: (body: PersonAuthoring['state']['body']) => void = () => {}) {
  const s = structuredClone(newGame(7).s);
  const opening = structuredClone(s.hf.initial);
  const person = opening.people[0];
  if (!person) throw new Error('Missing authored founder');
  change(person.state.body);
  const run = need(createRun(opening.spec));
  for (const p of opening.people) need(createPerson(run, p));
  s.hf = JSON.parse(JSON.stringify(exportRun(run)));
  syncReadings(s);
  const p = s.people.find((p) => p.id === person.id);
  if (!p) throw new Error('Missing inspected founder');
  delete s.trips[p.id];
  return { s, p };
}
