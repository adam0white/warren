import type { Person } from '@adam0white/human-framework';
import { SURF, yOf } from '../sim/grid.ts';
import { positionAt, riderCells, type WarrenState } from '../sim/warren.ts';
import { gameTimeWords } from './room-safety.ts';
import { displayWords, personWords, speechWords } from './words.ts';

/** Visible whereabouts and recorded words, never an inferred motive or a promise of safety. */
export function exposureWords(s: WarrenState, p: Person): string {
  const { subject, lower, possessive } = personWords(p);
  const cell = positionAt(s, p.id, s.minute);
  const above = yOf(cell) < SURF;
  const reached = above || riderCells(s).has(cell);
  const hiding = p.activity?.action === 'hide';
  const where = hiding
    ? `${p.name} is hiding ${above ? 'above ground' : reached ? 'near an entrance' : 'deeper below'}. ${subject} is out of sight for now.`
    : above
      ? `${p.name} is above ground, where riders can reach ${p.life.sex === 'female' ? 'her' : p.life.sex === 'male' ? 'him' : p.name}.`
      : reached
        ? `${p.name} is near an entrance. Riders can reach this passage.`
        : `${p.name} is beyond the passages riders search. Deeper stone or a shut door blocks the route.`;
  const trip = s.trips[p.id];
  const walking = trip && s.minute < trip.workFrom && trip.cells.length > 1;
  const action = p.activity ? displayWords(p.activity.affordance.label) : undefined;
  const doing = walking
    ? trip.action === 'shelter'
      ? `${subject} is still travelling below to shelter.`
      : action
        ? `${subject} is on the way to ${action}.`
        : `${subject} is still on the path.`
    : action
      ? `${possessive} current task is to ${action}.`
      : `You do not know why ${lower} is there.`;
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
        ? ` Since that reply, ${lower} chose a different task.`
        : ` ${subject} is still doing the current task. No journey below is recorded.`
      : ' No journey below or current task is recorded.';
    // Faith stays a quiet activity, never a countdown.
    if (current && current.action !== 'pray') {
      const due = Math.min(current.reviewAt, current.endsAt);
      response +=
        due <= s.minute
          ? ` ${possessive} next choice is due now.`
          : ` ${possessive} next choice is due in ${gameTimeWords(due - s.minute)}. ${subject} may choose again sooner.`;
    }
  }
  return `${where} ${doing}${answer ? ` When the bell rang, ${lower} said: “${speechWords(answer.says)}”` : ''}${response}`;
}
