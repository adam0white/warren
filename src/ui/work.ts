import { K } from '../sim/grid.ts';
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
];

/** Collapse exact routine repeats in this display only; new locations and consequences remain separate. */
export function journalEntries(
  notes: readonly import('../sim/warren.ts').Note[],
): import('../sim/warren.ts').Note[] {
  const out: (import('../sim/warren.ts').Note | null)[] = [];
  const seen = new Map<string, { index: number; repeats: number }>();
  for (const n of notes) {
    if (
      n.kind !== 'story' ||
      !n.who ||
      n.cell !== undefined ||
      n.weight > 1 ||
      !ROUTINE_ENDINGS.some((ending) => n.text.endsWith(ending))
    ) {
      out.push(n);
      continue;
    }
    const key = JSON.stringify([n.kind, n.who, n.text, n.weight]);
    const old = seen.get(key);
    const index = out.length;
    if (old) out[old.index] = null;
    out.push(old ? { ...n, text: `${n.text} (Repeated ${old.repeats + 1} times; latest entry.)` } : n);
    seen.set(key, { index, repeats: (old?.repeats ?? 0) + 1 });
  }
  return out.filter((n): n is import('../sim/warren.ts').Note => n !== null);
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
      (n.who && (n.kind === 'dig' || n.cell !== undefined)),
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
