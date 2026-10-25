import { type Person, readBody } from '@adam0white/human-framework';
import { SURF, yOf } from '../sim/grid.ts';
import { activeRaid, positionAt, riderCells, type WarrenState } from '../sim/warren.ts';

import { personWords } from './words.ts';

/** Current bodily needs and raid exposure, without diagnosing a cause or promising safety. */
export function personHelpWords(s: WarrenState, p: Person): string {
  if (!p.body.alive) return 'This person has died. See the journal.';
  const { subject } = personWords(p);
  const body = p.body;
  const felt = readBody(p).perceived;
  const words: string[] = [];
  if (body.downed) words.push(`${subject} cannot get up and needs help.`);
  if (body.health < 0.5) words.push(`${subject} is in poor health and needs care.`);
  if (body.illnesses.some((ill) => ill.severity > 0 || ill.trendPerDay > 0 || ill.chronic))
    words.push(`${subject} is living with an illness.`);
  if (body.injuries.some((injury) => (injury.bleeding ?? 0) > 0))
    words.push(`${subject} is bleeding and needs care.`);
  else if (body.injuries.some((injury) => injury.severity > 0)) words.push(`${subject} has an injury.`);
  else if (felt.pain > 0.5) words.push(`${subject} appears to be in pain.`);
  if (felt.hunger > 0.5) words.push(`${subject} needs food.`);
  if (felt.thirst > 0.6) words.push(`${subject} needs water.`);
  if (felt.sleepiness > 0.75 || felt.fatigue > 0.65) words.push(`${subject} needs rest.`);
  if (!words.length) words.push(`${subject} does not seem to need food, water, rest or care right now.`);

  if (activeRaid(s)) {
    const cell = positionAt(s, p.id, s.minute);
    const above = yOf(cell) < SURF;
    if (p.activity?.action === 'hide') {
      if (above || riderCells(s).has(cell)) words.push(`${subject} is hiding and out of sight for now.`);
    } else if (above) words.push(`${subject} is exposed above ground during the raid.`);
    else if (riderCells(s).has(cell)) words.push('Riders can reach this passage.');
  }
  return words.join(' ');
}
