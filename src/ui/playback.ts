import { INVITATIONS, receivedVisit } from '../sim/visits.ts';
import type { WarrenState } from '../sim/warren.ts';

export type InvitationObservation = Record<
  string,
  { pending: boolean; visit?: number; alive: boolean; released?: number }
>;

/** A snapshot for notices in this sitting, not a reconstruction of unseen events. */
export function invitationObservation(s: WarrenState): InvitationObservation {
  return Object.fromEntries(
    Object.keys(INVITATIONS).map((id) => [
      id,
      {
        pending: !!s.flags[`invitation-pending:${id}`],
        visit: s.flags[`visit:${id}`],
        alive: !!s.people.find((p) => p.id === id)?.body.alive,
        released: s.flags[`released:${id}`],
      },
    ]),
  );
}

/** Notes are authored host records; they are not evidence of HF speech or hearing. */
export function invitationNotices(s: WarrenState, previous?: InvitationObservation): string[] {
  if (!previous) return [];
  const current = invitationObservation(s);
  const notices: string[] = [];
  for (const [id, next] of Object.entries(current)) {
    const before = previous[id];
    if (!before) continue;
    const name = s.people.find((p) => p.id === id)?.name ?? id;
    if (next.visit && next.visit !== before.visit) {
      const note = receivedVisit(s, id);
      notices.push(
        note
          ? `${name}'s invitation note is in the journal: ${note.text}`
          : `${name}'s invitation was recorded. Its note is no longer available.`,
      );
    } else if (before.pending && before.alive && !next.alive) {
      notices.push(`${name} died while the invitation was pending.`);
    }
    if (before.pending && next.released && next.released !== before.released)
      notices.push(
        `${name} has stopped optional refuge work. The invitation is ${next.pending ? 'still pending' : 'no longer shown as pending'}.`,
      );
  }
  return notices;
}

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
    invitationObservation(s),
    s.maryamPuzzle,
    s.refusalReply,
    [s.next?.requests?.rest, s.next?.requests?.disagreement].map(
      (r) => r && [r.at, r.answers.at(-1), r.speech, r.heard, r.endedAt, r.withdrawn],
    ),
    s.next?.discussion && [s.next.discussion.statements, s.next.discussion.endedAt],
    s.adaTalks?.map((r) => [r.at, r.answers.at(-1), r.statements, r.failures.at(-1), r.endedAt, r.withdrawn]),
    s.people
      .filter((p) => p.activity?.action === 'dig' && s.hill.chalk[Number(p.activity.targetId)])
      .map((p) => [p.id, p.activity?.targetId]),
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
