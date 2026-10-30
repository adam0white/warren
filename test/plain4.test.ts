import { expect, it } from 'vitest';
import { act, advance, fingerprint, load, newGame, replay, save } from '../src/sim/game.ts';
import { idx, K, SURF } from '../src/sim/grid.ts';
import { VISIT_TERMS } from '../src/sim/people.ts';
import { bellStateWords } from '../src/ui/room-safety.ts';
import { displayWords } from '../src/ui/words.ts';
import { latestWorkWords } from '../src/ui/work.ts';

it('projects a labeled grouped bell reply without changing it, and retains exact replay', () => {
  const g = newGame(7);
  act(g, { verb: 'bell' });
  advance(g, g.s.minute + 60);
  const raw =
    'Meryem and others gave the same reply. Meryem said: “I cannot do it now. After I finish this task (eat at the hearth), I will do it.”';
  const before = JSON.stringify(g.s);
  expect(displayWords(raw)).toMatch(/Meryem and the others said:/);
  expect(JSON.stringify(g.s)).toBe(before);
  const exported = save(g);
  expect(fingerprint(load(exported).s)).toBe(exported.fingerprint);
  expect(
    fingerprint(
      replay(7, exported.inputs, exported.minute, exported.game, exported.chapter, exported.config).s,
    ),
  ).toBe(exported.fingerprint);
});

it('projects only matching grouped promises and keeps distinct answers and unfinished phrases intact', () => {
  const raw =
    'Tamar of the Wall and others gave the same reply. Tamar of the Wall said: “I cannot do it now. After I finish this task (eat at the hearth), I will do it.”';
  expect(displayWords(raw)).toBe(
    'Tamar of the Wall and the others said: “I cannot do it now. After I finish this task (eat at the hearth), I will do it.”',
  );
  expect(
    displayWords(
      'Tamar of the Wall and others gave the same reply. Tamar of the Wall said: “I will not come.”',
    ),
  ).toBe('Tamar of the Wall and the others said: “I will not come.”');
  for (const text of [
    'Tamar of the Wall: “I cannot do it now. After I finish this task (eat at the hearth), I will do it.”',
    'Tamar of the Wall and others gave the same reply. Kian said: “After I eat, I will do it.”',
    'Kian was sleeping there.',
    'Air will come down this shaft now.',
  ])
    expect(displayWords(text)).toBe(text);
});

it('keeps visit facts while cutting system disclaimers and explaining the well settlement', () => {
  expect(displayWords(VISIT_TERMS.kian!)).toContain(
    'Ada comes with him for the visit. He looks after her, and they go back together.',
  );
  expect(displayWords(VISIT_TERMS.kian!)).not.toContain('Watch');
  expect(displayWords(VISIT_TERMS.tamar!)).toContain('She teaches Kian, who is not her child.');
  expect(displayWords(VISIT_TERMS.tamar!)).not.toContain('guardian');
  expect(displayWords(VISIT_TERMS.maryam!)).toContain('Her son Yusuf stayed behind at the well settlement.');
});

it('projects actual scout notes and a supplied Havva shaft note without changing history', () => {
  const g = newGame(7);
  const cell = idx(5, SURF);
  g.s.hill.kind[cell] = K.open;
  const raid = g.s.raids[0]!;
  raid.smoke = g.s.minute + 30;
  raid.riders = g.s.minute + 60;
  raid.leave = g.s.minute + 120;
  advance(g, raid.riders);
  const scout = g.s.notes.find((n) => n.text.includes('was still in view there.'));
  expect(scout).toBeDefined();
  expect(displayWords(scout!.text)).toContain('could still be seen from there.');
  const text =
    'Havva came up under the open sky. Air will come down this shaft now, and so could riders. A door below would close it.';
  g.s.notes.push({ at: g.s.minute, kind: 'dig', text, who: 'fixture-havva', cell, weight: 2 });
  const before = JSON.stringify(g.s);
  expect(latestWorkWords(g.s)).toBe(
    'Havva dug through to the surface. Air can now come down this shaft, but riders could too. A door below would close it.',
  );
  expect(JSON.stringify(g.s)).toBe(before);
});

it('names the ringing bell only for an active real call', () => {
  const g = newGame(7);
  const raid = g.s.raids[0]!;
  raid.smoke = g.s.minute + 30;
  raid.riders = g.s.minute + 60;
  raid.leave = g.s.minute + 120;
  advance(g, raid.smoke);
  act(g, { verb: 'bell' });
  expect(bellStateWords(g.s)).toContain('The bell keeps ringing until the riders leave.');
  g.s.bell!.until = g.s.minute;
  expect(bellStateWords(g.s)).not.toContain('keeps ringing');
  const quiet = newGame(7);
  act(quiet, { verb: 'bell' });
  expect(bellStateWords(quiet.s)).toContain('six game hours');
});
