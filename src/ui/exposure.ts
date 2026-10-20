import type { Person } from '@adam0white/human-framework';
import { SURF, yOf } from '../sim/grid.ts';
import { positionAt, riderCells, type WarrenState } from '../sim/warren.ts';
import { gameTimeWords } from './room-safety.ts';

/** Visible whereabouts and recorded words, never an inferred motive or a promise of safety. */
export function exposureWords(s: WarrenState, p: Person): string {
  const cell = positionAt(s, p.id, s.minute);
  const above = yOf(cell) < SURF;
  const reached = above || riderCells(s).has(cell);
  const hiding = p.activity?.action === 'hide';
  const where = hiding
    ? `Hiding ${above ? 'above ground' : reached ? 'near an entrance' : 'deeper below'}; out of sight for now.`
    : above
      ? 'Exposed above ground.'
      : reached
        ? 'Exposed near an entrance; riders can reach this passage.'
        : 'Beyond the passages riders search; deeper stone or a shut door stands between.';
  const trip = s.trips[p.id];
  const walking = trip && s.minute < trip.workFrom && trip.cells.length > 1;
  const action = p.activity?.affordance.label;
  const doing = walking
    ? trip.action === 'shelter'
      ? 'On the way below; still travelling to shelter.'
      : action
        ? `On the way to ${action}.`
        : 'Still on the path.'
    : action
      ? `Now: ${action}.`
      : 'Their reason is not known to the keeper.';
  // A historical answer is not an explanation of a later bell or a present choice.
  const bellAt = s.bell?.at ?? s.notes.findLast((n) => /^You rang the bell[.,]/.test(n.text))?.at;
  const answer =
    bellAt === undefined ? undefined : s.answers.findLast((a) => a.who === p.id && a.at >= bellAt && a.says);
  let response = '';
  if (
    answer?.verdict === 'assented' &&
    !(walking && trip.action === 'shelter') &&
    p.activity?.action !== 'shelter'
  ) {
    const current = p.activity;
    response = current
      ? current.startedAt > answer.at
        ? ' Since that reply, chose a different task.'
        : ' Still on the current task; no journey below recorded.'
      : ' No journey below recorded; no current task recorded.';
    // Faith stays a quiet activity, never a countdown.
    if (current && current.action !== 'pray') {
      const due = Math.min(current.reviewAt, current.endsAt);
      response +=
        due <= s.minute
          ? ' Next choice due now.'
          : ` Next choice due in ${gameTimeWords(due - s.minute)}; they may choose again sooner.`;
    }
  }
  return `${where} ${doing}${answer ? ` At the bell: “${answer.says}”` : ''}${response}`;
}
