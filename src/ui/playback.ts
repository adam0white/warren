import type { WarrenState } from '../sim/warren.ts';

/** Playback only. Legacy play holds readings. The opted edition slows readings and danger. Menus hold playback in the host. */
export function playbackRate(
  inspecting: boolean,
  raid: boolean,
  reading: boolean,
  selectedRate = 72,
  slowPlay = false,
): number {
  return inspecting || raid || reading ? (slowPlay ? Math.min(18, selectedRate) : 0) : selectedRate;
}

/** Bounded notes may replace their first entry; population IDs also expose arrivals and departures. */
export function eventStamp(s: WarrenState): string {
  return JSON.stringify([
    // Grouped old replies can change without replacing the last note. Request
    // refusals can also be retained without a new note (for example, sleep).
    s.notes.filter((n) => n.kind === 'answer'),
    s.notes.at(-1),
    s.answers.at(-1),
    [...(s.doorTrials ?? []), ...(s.next?.requests?.door ? [s.next.requests.door] : [])].map((r) => [
      r.at,
      r.answers.at(-1),
      r.results.at(-1),
      r.opened,
      r.endedAt,
      r.withdrawn,
    ]),
    s.people.map((p) => [p.id, p.body.alive]),
  ]);
}
