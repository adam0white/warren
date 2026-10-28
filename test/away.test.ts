import { expect, it } from 'vitest';
import {
  act,
  advance,
  catchUp,
  fingerprint,
  load,
  newGame,
  replay,
  save,
  stateJson,
} from '../src/sim/game.ts';
import { advanceFrame, QUANTUM } from '../src/sim/warren.ts';

/** Authored physical raid schedule, not skipped play or a changed Person. */
function eventHill() {
  const opening = newGame(7, '0.7.0', undefined, 'warren-rest/1');
  const raid = opening.s.raids[0]!;
  raid.smoke = opening.s.minute + 60;
  raid.riders = raid.smoke + 60;
  raid.leave = raid.riders + 60;
  return newGame(
    7,
    '0.7.0',
    { version: 'warren-hf4-cast/1', inputs: [], claims: [], initial: stateJson(opening.s) },
    'warren-rest/1',
  );
}
it('leaves a current hill without away configuration unchanged while absent', () => {
  {
    const g = newGame(7, '0.7.0');
    advanceFrame(g.s, 0);
    const before = save(g);
    expect(catchUp(g, 60 * 60_000)).toBe(false);
    expect(save(g)).toEqual(before);
  }
});
it('pins actual away duration and real world steps, then replays and resumes exactly', () => {
  const g = eventHill();
  const before = save(g);
  expect(catchUp(g, 24 * 60 * 60_000, () => false)).toBe(true);
  const record = g.s.next!.away!;
  expect(record.simulatedMinutes).toBeGreaterThan(0);
  expect(record.remainderMs).toBe(24 * 60 * 60_000 - record.simulatedMinutes * 60_000);
  const ordinary = load(before);
  advance(ordinary, g.s.minute);
  // The new record itself is the only additional host effect of being away.
  ordinary.s.next!.away = structuredClone(record);
  expect(fingerprint(ordinary.s)).toBe(fingerprint(g.s));
  expect(record.stopReason).toBe('event');
  expect(record.events.length).toBeGreaterThan(0);
  const s = save(g);
  expect(fingerprint(replay(s.seed, s.inputs, s.minute, s.game, s.chapter, s.config, s.phase).s)).toBe(
    s.fingerprint,
  );
  const restored = load(s);
  advance(g, g.s.minute + QUANTUM);
  advance(restored, restored.s.minute + QUANTUM);
  expect(fingerprint(restored.s)).toBe(fingerprint(g.s));
});
it('stops at the existing bell and records computational remainder without a gameplay cap', () => {
  const g = newGame(7, '0.7.0', undefined, 'warren-rest/1');
  const at = g.s.minute;
  catchUp(g, Number.MAX_SAFE_INTEGER, () => true);
  expect(g.s.minute).toBe(at + QUANTUM);
  expect(g.s.next!.away!.stopReason).toBe('computation');
  act(g, { verb: 'bell' });
  const bellAt = g.s.minute;
  catchUp(g, 24 * 60 * 60_000, () => false);
  expect(g.s.minute).toBe(bellAt);
  expect(g.s.next!.away!.stopReason).toBe('attention');
  expect(g.s.next!.away!.simulatedMinutes).toBe(0);
});
it('rejects invalid elapsed input and does not let a replay request spend more time than elapsed', () => {
  const g = newGame(7, '0.7.0', undefined, 'warren-rest/1');
  const before = save(g);
  for (const elapsedMs of [-1, NaN, Infinity]) expect(catchUp(g, elapsedMs)).toBe(false);
  expect(act(g, { verb: 'away', elapsedMs: 1, quanta: 1 })).toBe(false);
  expect(save(g)).toEqual(before);
});
it('cannot pass an unread return event by reopening the hill again', () => {
  const g = eventHill();
  catchUp(g, 24 * 60 * 60_000, () => false);
  const minute = g.s.minute;
  const words = g.s.next!.away!.events;
  const loaded = load(save(g));
  catchUp(loaded, 24 * 60 * 60_000, () => false);
  expect(loaded.s.minute).toBe(minute);
  expect(loaded.s.next!.attention).toEqual(words);
  act(loaded, { verb: 'acknowledge' });
  catchUp(loaded, 60 * 60_000, () => false);
  expect(loaded.s.minute).toBe(minute); // Closing a reading does not erase actual danger.
  advance(loaded, loaded.s.raids[0]!.leave + QUANTUM);
  act(loaded, { verb: 'acknowledge' });
  const quietAt = loaded.s.minute;
  catchUp(loaded, 30 * 60_000, () => false);
  expect(loaded.s.minute).toBeGreaterThan(quietAt);
});
it('keeps event attention independent of how many quanta an advance call groups', () => {
  const single = newGame(7, '0.7.0', undefined, 'warren-rest/1');
  const grouped = newGame(7, '0.7.0', undefined, 'warren-rest/1');
  const end = single.s.minute + 180;
  while (single.s.minute < end) advance(single, single.s.minute + QUANTUM);
  advance(grouped, end);
  expect(save(single)).toEqual(save(grouped));
});
