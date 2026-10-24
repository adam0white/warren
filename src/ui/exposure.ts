import type { Person } from '@adam0white/human-framework';
import { SURF, yOf } from '../sim/grid.ts';
import { positionAt, riderCells, type WarrenState } from '../sim/warren.ts';
import { gameTimeWords } from './room-safety.ts';
import { displayWords, speechWords } from './words.ts';

/** Visible whereabouts and recorded words, never an inferred motive or a promise of safety. */
export function exposureWords(s: WarrenState, p: Person): string {
  const cell = positionAt(s, p.id, s.minute);
  const above = yOf(cell) < SURF;
  const reached = above || riderCells(s).has(cell);
  const hiding = p.activity?.action === 'hide';
  const where = hiding
    ? `They are hiding ${above ? 'above ground' : reached ? 'near an entrance' : 'deeper below'}; they are out of sight for now.`
    : above
      ? 'They are exposed above ground.'
      : reached
        ? 'They are exposed near an entrance. Riders can reach this passage.'
        : 'They are beyond the passages riders search. Deeper stone or a shut door blocks the route.';
  const trip = s.trips[p.id];
  const walking = trip && s.minute < trip.workFrom && trip.cells.length > 1;
  const action = p.activity ? displayWords(p.activity.affordance.label) : undefined;
  const doing = walking
    ? trip.action === 'shelter'
      ? 'They are still travelling below to shelter.'
      : action
        ? `They are on their way to ${action}.`
        : 'They are still on the path.'
    : action
      ? `Their current task is to ${action}.`
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
        ? ' Since that reply, they chose a different task.'
        : ' They are still doing their current task. No journey below is recorded.'
      : ' No journey below or current task is recorded.';
    // Faith stays a quiet activity, never a countdown.
    if (current && current.action !== 'pray') {
      const due = Math.min(current.reviewAt, current.endsAt);
      response +=
        due <= s.minute
          ? ' Their next choice is due now.'
          : ` Their next choice is due in ${gameTimeWords(due - s.minute)}; they may choose again sooner.`;
    }
  }
  return `${where} ${doing}${answer ? ` At the bell: “${speechWords(answer.says)}”` : ''}${response}`;
}
