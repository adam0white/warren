import { faces, grainBelow } from '../sim/grid.ts';
import {
  activeRaid,
  airAndLight,
  bedsBelow,
  currentGoal,
  faceState,
  type WarrenState,
} from '../sim/warren.ts';
import { grainHelpWords } from './known-work.ts';
import { bellStateWords, bellThreatWords, hadBellCall } from './room-safety.ts';
import { sleepingCapacityWords } from './shelter.ts';
import { activityWords, settingWords } from './words.ts';

export const PURPOSE = 'Dig a shelter where the village can survive attacks by riders.';
export const FIRST_CHALK = 'Choose chalk, then drag across stone beside the cellar.';

/** The keeper reads present conditions, rather than treating past achievements as present safety. */
export function colonyWords(s: WarrenState): string {
  const raid = activeRaid(s);
  const ringing = s.bell && s.bell.until > s.minute;
  const renew =
    hadBellCall(s) ||
    s.edition === '0.4.0' ||
    s.edition === '0.5.0' ||
    s.edition === '0.6.0' ||
    s.edition === '0.7.0'
      ? bellStateWords(s)
      : 'Ring the bell to call the village below. Each call lasts six game hours.';
  if (raid?.stage === 'riders')
    return ringing
      ? `Riders are at the hill. ${bellStateWords(s)} Tap the people count above to see who riders can reach.`
      : `Riders are at the hill. ${renew}`;
  if (raid?.stage === 'smoke')
    return ringing
      ? `${bellThreatWords(s)} ${bellStateWords(s)} Tap the people count above to see who riders can reach.`
      : `${bellThreatWords(s)} ${renew}`;

  const fs = faces(s.hill);
  if (fs.length) {
    const { air, lit } = airAndLight(s);
    const states = fs.map((f) => faceState(s, f.face, f.stand, lit, air));
    if (states.every((x) => x === 'stale'))
      return 'The marked walls do not have enough fresh air. A shaft to the sky would bring air down.';
    if (states.every((x) => x === 'dark'))
      return 'The marked walls are dark. Hang a lamp beside open ground near the chalk.';
    if (states.every((x) => x === 'dark' || x === 'stale'))
      return 'The marked walls need light or fresh air. Look where the lamps go out.';
    if (states.every((x) => x === 'spoil'))
      return 'Loose rock blocks the marked walls. People must carry it above ground before anyone can dig.';
  } else if (s.hill.chalk.some(Boolean)) {
    return 'The chalk marks are beyond the dug space. Mark a path to them from the cellar with chalk.';
  }

  const worker = s.people.find(
    (p) =>
      p.body.alive &&
      p.activity &&
      p.activity.endsAt > s.minute &&
      ['dig', 'carve-door', 'make-lamp'].includes(p.activity.action),
  );
  const trip = worker && s.trips[worker.id];
  const task = worker?.activity
    ? activityWords(
        worker.activity.affordance.label,
        !!trip && trip.cells.length > 1 && s.minute < trip.workFrom,
        settingWords(worker.name),
      )
    : undefined;
  if (!s.stats.dug)
    return s.hill.chalk.some(Boolean)
      ? (task ?? 'The digging plan is marked. People decide when to start digging.')
      : FIRST_CHALK;
  if (grainBelow(s.hill) < 45) return grainHelpWords(s);
  if (bedsBelow(s) < s.people.filter((p) => p.body.alive).length)
    return `People are filling the jars in the cellar. ${sleepingCapacityWords(s)}`;
  const goal = currentGoal(s);
  if (goal?.id === 'grow') return 'Make room below for families who hear of the hill.';
  if (goal && !['chalk', 'first', 'store', 'lamp', 'beds'].includes(goal.id)) return goal.text;
  return task ?? 'There is room to sleep below. No smoke is visible. You cannot tell when riders will come.';
}
