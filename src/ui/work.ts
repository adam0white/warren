import { cellsWithUse, K, USE } from '../sim/grid.ts';
import type { WarrenState } from '../sim/warren.ts';
import { FIRST_CHALK } from './guidance.ts';
import { cellLocationWords } from './known-work.ts';
import { displayWords } from './words.ts';

/** Read the latest work note without changing saved history. */
export function latestWorkWords(s: WarrenState): string {
  const work = [...s.notes]
    .reverse()
    .find(
      (n) =>
        (n.kind === 'dig' && n.who) ||
        n.kind === 'find' ||
        (n.kind === 'story' && n.who) ||
        n.kind === 'arrival' ||
        n.kind === 'raid' ||
        n.kind === 'hurt',
    );
  return work ? displayWords(work.text) : FIRST_CHALK;
}

const ROUTINE_ENDINGS = [
  ' checked the route.',
  ' checked the approach.',
  ' walked a visible route and marked what could be seen.',
  ' checked the household seed jars. No supplies were added or moved.',
  ' checked the nearby route to the village in daylight. Riders may use a different route next time.',
  ' checked the agreed signals and personal equipment. No equipment was added.',
  // Role lines that report no result; a cooked meal is a result and stays separate.
  ' discussed the visible digging marks with the workers. Some stone may still be loose.',
  ' discussed a limited search for water. The search may find no water.',
  ' checked the household’s food and supplies without taking another house’s grain.',
  ' prepared light materials under Yusuf Usta’s supervision.',
  ' completed a limited check with Yusuf Usta. He is still learning building work.',
  ' practised carrying a message along a short route with Tamar. He still needs to care for his sister Ada.',
  ' checked the guest stores with Tamar. He still needs to care for his sister Ada.',
];

/** A light line about one person and no particular place. */
const routineNote = (n: import('../sim/warren.ts').Note) =>
  n.kind === 'story' && !!n.who && n.cell === undefined && n.weight <= 1;

/** Collapse exact routine repeats in this display only; new locations and consequences remain separate. */
export function journalEntries(
  notes: readonly import('../sim/warren.ts').Note[],
): import('../sim/warren.ts').Note[] {
  return journalView(notes).all;
}

/**
 * Display only. `fresh` keeps every line that is not a repeated routine, in order; `routine` keeps one latest
 * entry per exactly repeated routine line, with its count. Saved notes are never changed.
 */
export function journalView(notes: readonly import('../sim/warren.ts').Note[]): {
  all: import('../sim/warren.ts').Note[];
  fresh: import('../sim/warren.ts').Note[];
  routine: import('../sim/warren.ts').Note[];
} {
  const out: (import('../sim/warren.ts').Note | null)[] = [];
  const seen = new Map<string, { index: number; repeats: number }>();
  const repeated = new Set<number>();
  for (const n of notes) {
    if (!routineNote(n) || !ROUTINE_ENDINGS.some((ending) => n.text.endsWith(ending))) {
      out.push(n);
      continue;
    }
    const key = JSON.stringify([n.kind, n.who, n.text, n.weight]);
    const old = seen.get(key);
    const index = out.length;
    if (old) {
      out[old.index] = null;
      repeated.delete(old.index);
    }
    out.push(old ? { ...n, text: `${n.text} (Repeated ${old.repeats + 1} times; latest entry.)` } : n);
    if (old) repeated.add(index);
    seen.set(key, { index, repeats: (old?.repeats ?? 0) + 1 });
  }
  const all: import('../sim/warren.ts').Note[] = [];
  const fresh: import('../sim/warren.ts').Note[] = [];
  const routine: import('../sim/warren.ts').Note[] = [];
  out.forEach((n, i) => {
    if (!n) return;
    all.push(n);
    (repeated.has(i) ? routine : fresh).push(n);
  });
  return { all, fresh, routine };
}

export interface WorkObservation {
  marked: number[];
  completed: number[];
}

/** Only transitions actually seen in this sitting; no reconstruction of unobserved history. */
export function observeMarkedWork(s: WarrenState, previous?: WorkObservation): WorkObservation {
  const completed = [...(previous?.completed ?? [])];
  for (const c of previous?.marked ?? [])
    if (s.hill.known[c] && s.hill.kind[c] === K.open && !completed.includes(c)) completed.push(c);
  return {
    marked: Array.from(s.hill.chalk.keys()).filter((c) => !!s.hill.chalk[c]),
    completed,
  };
}

/** Keep completed marked ground and distinct developments beside routine words. */
export function workDigestWords(s: WarrenState, observation?: WorkObservation): string {
  const completed = observation?.completed.at(-1);
  const important = journalEntries(s.notes).filter(
    (n) =>
      n.kind === 'arrival' ||
      n.kind === 'hurt' ||
      n.kind === 'raid' ||
      n.kind === 'find' ||
      (n.who && (n.kind === 'dig' || n.cell !== undefined)) ||
      // Heavy words from one person, such as an answered invitation, show without reopening them.
      (n.kind === 'story' && !!n.who && n.weight >= 2),
  );
  const latest = important.at(-1);
  const work = [...important]
    .reverse()
    .find(
      (n) =>
        n.kind === 'dig' ||
        n.kind === 'find' ||
        (n.kind === 'story' &&
          n.cell !== undefined &&
          n.text.includes('baked a clay lamp in a fire and hung it where you had marked.')),
    );
  const words =
    completed === undefined
      ? work
        ? displayWords(work.text)
        : latestWorkWords(s)
      : `Marked digging is complete: ground is open ${cellLocationWords(s, completed)}. Use Look to inspect it; furnishings need their own marks.`;
  return latest && (completed !== undefined || latest !== work)
    ? `${words} ${displayWords(latest.text)}`
    : words;
}

export interface SetupObservation {
  shut: number[];
  digging: number[];
  bell?: { at: number; doors: boolean; shut: boolean; partial?: boolean };
}

/**
 * Display only: changes to what the keeper set up, seen between two readings in this sitting. A finished door
 * rolled shut or open, a marked wall someone starts to cut, and, for a bell call watched from its start, whether
 * any door was shut during it. Nothing is reconstructed from before the first reading.
 */
export function observeSetups(
  s: WarrenState,
  previous?: SetupObservation,
): { observation: SetupObservation; seen: string[] } {
  const h = s.hill;
  const doors = cellsWithUse(h, USE.door).filter((d) => !(h.doorWork[d] ?? 0));
  const shut = doors.filter((d) => !!h.shut[d]);
  const digging = [
    ...new Set(
      s.people
        .filter((p) => p.body.alive && p.activity?.action === 'dig')
        .map((p) => Number(p.activity?.targetId)),
    ),
  ].sort((a, b) => a - b);
  const ringing = !!s.bell && s.minute < s.bell.until;
  const seen: string[] = [];
  let bell: SetupObservation['bell'];
  if (!previous && ringing && s.bell)
    bell = { at: s.bell.at, doors: doors.length > 0, shut: false, partial: true };
  if (previous) {
    for (const d of shut)
      if (!previous.shut.includes(d)) seen.push(`The stone door ${cellLocationWords(s, d)} is shut now.`);
    for (const d of previous.shut)
      if (doors.includes(d) && !shut.includes(d))
        seen.push(`The stone door ${cellLocationWords(s, d)} is open again.`);
    for (const c of digging)
      if (!previous.digging.includes(c) && h.chalk[c]) {
        const who = s.people.find((p) => p.activity?.action === 'dig' && Number(p.activity.targetId) === c);
        seen.push(`${who?.name ?? 'Someone'} started cutting your mark ${cellLocationWords(s, c)}.`);
      }
    const before = previous.bell;
    if (ringing && s.bell)
      bell =
        before && before.at === s.bell.at
          ? { ...before, shut: before.shut || shut.some((d) => !previous.shut.includes(d)) }
          : !before
            ? { at: s.bell.at, doors: doors.length > 0, shut: false }
            : undefined;
    else if (before?.doors && !before.partial)
      seen.push(
        before.shut
          ? 'During the bell call, someone shut a stone door.'
          : shut.length
            ? 'During the bell call, nobody shut another stone door; the shut doors stayed shut.'
            : 'During the bell call, nobody shut a stone door.',
      );
  }
  return { observation: { shut, digging, ...(bell ? { bell } : {}) }, seen };
}
