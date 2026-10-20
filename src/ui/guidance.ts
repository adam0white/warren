import { cellsWithUse, faces, grainBelow, STORE_CAP, USE } from '../sim/grid.ts';
import {
  activeRaid,
  airAndLight,
  bedsBelow,
  currentGoal,
  faceState,
  type WarrenState,
} from '../sim/warren.ts';
import { bellStateWords, hadBellCall } from './room-safety.ts';
import { sleepingCapacityWords } from './shelter.ts';

export const PURPOSE = 'Dig a refuge where the village can outlast the riders.';
export const FIRST_CHALK = 'Choose chalk, then drag across stone beside the cellar.';

/** The keeper reads present conditions, rather than treating past achievements as present safety. */
export function colonyWords(s: WarrenState): string {
  const raid = activeRaid(s);
  const ringing = s.bell && s.bell.until > s.minute;
  const renew =
    hadBellCall(s) || s.edition === '0.4.0'
      ? bellStateWords(s)
      : 'Ring the bell to call the village below. Each call lasts six game hours.';
  if (raid?.stage === 'riders')
    return ringing
      ? `Riders are at the hill. ${bellStateWords(s)} Check shelter to see who is still exposed.`
      : `Riders are at the hill. ${renew}`;
  if (raid?.stage === 'smoke')
    return ringing
      ? `Smoke rises in the south. ${bellStateWords(s)} Check shelter to see who is still exposed.`
      : `Smoke rises in the south. ${renew}`;

  const fs = faces(s.hill);
  if (fs.length) {
    const { air, lit } = airAndLight(s);
    const states = fs.map((f) => faceState(s, f.face, f.stand, lit, air));
    if (states.every((x) => x === 'stale'))
      return 'The chalked faces lack fresh air. A shaft to the sky would bring air down.';
    if (states.every((x) => x === 'dark'))
      return 'The chalked faces are dark. Hang a lamp beside open ground near the chalk.';
    if (states.every((x) => x === 'dark' || x === 'stale'))
      return 'The chalked faces need light or fresh air. Look where the lamps gutter.';
    if (states.every((x) => x === 'spoil'))
      return 'Spoil blocks the chalked faces. People must carry it up before picks can work.';
  } else if (s.hill.chalk.some(Boolean)) {
    return 'The chalk is beyond open ground. Chalk a way to it from the cellar.';
  }

  if (!s.stats.dug)
    return s.hill.chalk.some(Boolean) ? 'Dig planned. People choose when to take up a pick.' : FIRST_CHALK;
  if (grainBelow(s.hill) < 45)
    return cellsWithUse(s.hill, USE.store).length * STORE_CAP >= 45
      ? 'Jars stand empty below. People must bring the harvest down.'
      : 'The harvest needs more room below. Mark open ground as a store for the jars.';
  if (bedsBelow(s) < s.people.filter((p) => p.body.alive).length)
    return `Jars are filling the cellar. ${sleepingCapacityWords(s)}`;
  const goal = currentGoal(s);
  if (goal?.id === 'grow') return 'Make room below for families who hear of the hill.';
  if (goal && !['chalk', 'first', 'store', 'lamp', 'beds'].includes(goal.id)) return goal.text;
  return 'There is room to sleep below. Keep the lamps lit and watch the road for smoke.';
}
