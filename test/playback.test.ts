import { expect, it } from 'vitest';
import { newGame } from '../src/sim/game.ts';
import { visit } from '../src/sim/visits.ts';
import { eventStamp, invitationNotices, invitationObservation, playbackRate } from '../src/ui/playback.ts';

it('holds inspections, bell decisions and reading, then runs quiet time briskly', () => {
  expect(playbackRate(true, false, false)).toBe(0);
  expect(playbackRate(false, true, false)).toBe(0);
  expect(playbackRate(false, false, true)).toBe(0);
  expect(playbackRate(false, false, false)).toBe(72);
  expect(playbackRate(false, false, false, 1152)).toBe(1152);
  expect(playbackRate(false, true, false, 1152)).toBe(0);
});
it('notices an invitation note without calling it an HF answer or inventing an expiry', () => {
  const s = newGame(7, '0.7.0').s;
  const p = s.people.find((person) => person.id === 'yusuf');
  if (!p) throw new Error('Yusuf missing');
  s.flags['invitation-pending:yusuf'] = s.minute + 1;
  const before = invitationObservation(s);
  const stamp = eventStamp(s);
  expect(visit(s, 'yusuf')).toBe(true);
  expect(eventStamp(s)).not.toBe(stamp);
  expect(invitationNotices(s, before).join(' ')).toContain('invitation note');
  expect(invitationNotices(s, before).join(' ')).not.toMatch(/expired|heard the invitation/i);
  const received = invitationObservation(s);
  const at = s.flags['visit:yusuf'];
  if (!at) throw new Error('Invitation missing');
  s.notes = s.notes.filter((n) => !(n.who === p.id && n.at === at - 1));
  expect(invitationNotices(s, received)).toEqual([]);
});
it('stamps actual request speech and hearing even if unrelated notes hide them', () => {
  const s = newGame(7, '0.7.0').s;
  s.next = {
    config: 'warren-rest/1',
    requests: { rest: { who: 'yusuf', listener: 'meryem', at: 1, answers: [], heard: false } },
  };
  const rest = s.next.requests?.rest;
  if (!rest) throw new Error('Request missing');
  const before = eventStamp(s);
  rest.speech = { at: 30, startedAt: 1, workFrom: 10, text: 'A real statement.' };
  expect(eventStamp(s)).not.toBe(before);
  const spoken = eventStamp(s);
  rest.heard = true;
  expect(eventStamp(s)).not.toBe(spoken);
});
it('reports a death or release during a pending invitation without inventing its outcome', () => {
  const s = newGame(7, '0.7.0').s;
  const p = s.people.find((person) => person.id === 'yusuf');
  if (!p) throw new Error('Yusuf missing');
  s.flags['invitation-pending:yusuf'] = s.minute + 1;
  const before = invitationObservation(s);
  s.flags['released:yusuf'] = s.minute + 1;
  expect(invitationNotices(s, before).join(' ')).toContain('still pending');
  const released = invitationObservation(s);
  p.body.alive = false;
  expect(invitationNotices(s, released).join(' ')).toContain('died while the invitation was pending');
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
it('slows opted play for readings and danger without stopping the simulation clock', () => {
  expect(playbackRate(true, false, false, 1152, true)).toBe(18);
  expect(playbackRate(false, true, false, 1152, true)).toBe(18);
  expect(playbackRate(false, false, true, 72, true)).toBe(18);
  expect(playbackRate(false, false, false, 1152, true)).toBe(1152);
  expect(playbackRate(true, false, false, 9, true)).toBe(9);
});
