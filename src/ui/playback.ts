import type { WarrenState } from '../sim/warren.ts';

/** Playback only. Keep inspection and bell decisions still; give each new event reading time. */
export function playbackRate(
  inspecting: boolean,
  raid: boolean,
  reading: boolean,
  selectedRate = 72,
): number {
  return inspecting || raid || reading ? 0 : selectedRate;
}

/** Bounded notes may replace their first entry; population IDs also expose arrivals and departures. */
export function eventStamp(s: WarrenState): string {
  return JSON.stringify([s.notes.at(-1), s.people.map((p) => [p.id, p.body.alive])]);
}
