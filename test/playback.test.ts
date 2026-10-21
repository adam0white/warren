import { expect, it } from 'vitest';
import { newGame } from '../src/sim/game.ts';
import { eventStamp, playbackRate } from '../src/ui/playback.ts';

it('holds inspections, bell decisions and reading, then runs quiet time briskly', () => {
  expect(playbackRate(true, false, false)).toBe(0);
  expect(playbackRate(false, true, false)).toBe(0);
  expect(playbackRate(false, false, true)).toBe(0);
  expect(playbackRate(false, false, false)).toBe(72);
});
it('detects an arrival and a new note even after the bounded log fills', () => {
  const s = newGame(7).s;
  const first = eventStamp(s);
  const person = s.people[0];
  if (!person) throw new Error('Opening person missing');
  s.people.push({ ...person, id: 'new-arrival' });
  expect(eventStamp(s)).not.toBe(first);
  const note = s.notes[0];
  if (!note) throw new Error('Opening note missing');
  s.notes = Array.from({ length: 400 }, () => ({ ...note }));
  const full = eventStamp(s);
  s.notes.shift();
  s.notes.push({ ...note, at: note.at + 30, text: 'A new reply.' });
  expect(eventStamp(s)).not.toBe(full);
});
