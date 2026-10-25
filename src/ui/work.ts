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
        (n.kind === 'story' && n.who && n.cell !== undefined) ||
        n.kind === 'arrival' ||
        n.kind === 'raid',
    );
  return work ? displayWords(work.text) : FIRST_CHALK;
}
