import { ENGINE_VERSION, FRAMEWORK_VERSION } from '@adam0white/human-framework';
import { expect, it } from 'vitest';
import { advance, fingerprint, load, newGame, replay, save, stateJson } from '../src/sim/game.ts';
import { makePerson } from '../src/sim/people.ts';

it('persists plain narration for fresh founders, arrivals and canonical chapters', () => {
  expect(FRAMEWORK_VERSION).toBe('3.0.0');
  expect(ENGINE_VERSION).toBe('2.23.0');
  const game = newGame(7);
  expect(game.s.people.every((p) => p.lexicon?.plainEnglish === true)).toBe(true);
  expect(
    makePerson({ id: 'arrival', name: 'Arrival', age: 20, sex: 'female' }, 7, 300, 'arrival').lexicon
      ?.plainEnglish,
  ).toBe(true);
  const chapter = { version: 'warren-cast/2' as const, inputs: [], claims: [], initial: stateJson(game.s) };
  const canonical = newGame(7, '0.6.0', chapter);
  advance(canonical, 600);
  const exported = save(canonical);
  expect(fingerprint(load(exported).s)).toBe(exported.fingerprint);
  expect(fingerprint(replay(7, exported.inputs, exported.minute, exported.game, exported.chapter).s)).toBe(
    exported.fingerprint,
  );
  canonical.s.people[0]!.lexicon = { ...canonical.s.people[0]!.lexicon, plainEnglish: false };
  expect(load(save(canonical)).s.people[0]!.lexicon?.plainEnglish).toBe(false);
  delete canonical.s.people[0]!.lexicon;
  expect(load(save(canonical)).s.people[0]!.lexicon).toBeUndefined();
});
