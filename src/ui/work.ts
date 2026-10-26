import type { WarrenState } from '../sim/warren.ts';
import { FIRST_CHALK } from './guidance.ts';
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

/** Collapse exact routine repeats in this display only; new locations and consequences remain separate. */
export function journalEntries(
  notes: readonly import('../sim/warren.ts').Note[],
): import('../sim/warren.ts').Note[] {
  const out: (import('../sim/warren.ts').Note | null)[] = [];
  const seen = new Map<string, { index: number; repeats: number }>();
  for (const n of notes) {
    if (n.kind !== 'story' || !n.who || n.cell !== undefined || n.weight > 1) {
      out.push(n);
      continue;
    }
    const key = JSON.stringify([n.kind, n.who, n.text]);
    const old = seen.get(key);
    const index = out.length;
    if (old) out[old.index] = null;
    out.push(old ? { ...n, text: `${n.text} (Repeated ${old.repeats + 1} times; latest entry.)` } : n);
    seen.set(key, { index, repeats: (old?.repeats ?? 0) + 1 });
  }
  return out.filter((n): n is import('../sim/warren.ts').Note => n !== null);
}
