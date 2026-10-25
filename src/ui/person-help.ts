import { type Person, readBody } from '@adam0white/human-framework';
import { SURF, yOf } from '../sim/grid.ts';
import { activeRaid, positionAt, riderCells, type WarrenState } from '../sim/warren.ts';

/** Current bodily needs and raid exposure, without diagnosing a cause or promising safety. */
export function personHelpWords(s: WarrenState, p: Person): string {
  if (!p.body.alive) return 'This person has died. See the journal.';
  const body = p.body;
  const felt = readBody(p).perceived;
  const words: string[] = [];
  if (body.downed) words.push('They cannot get up and need help.');
  if (body.health < 0.5) words.push('They are in poor health and need care.');
  if (body.illnesses.some((ill) => ill.severity > 0 || ill.trendPerDay > 0 || ill.chronic))
    words.push('They are living with an illness.');
  if (body.injuries.some((injury) => (injury.bleeding ?? 0) > 0))
    words.push('They are bleeding and need care.');
  else if (body.injuries.some((injury) => injury.severity > 0)) words.push('They have an injury.');
  else if (felt.pain > 0.5) words.push('They appear to be in pain.');
  if (felt.hunger > 0.5) words.push('They need food.');
  if (felt.thirst > 0.6) words.push('They need water.');
  if (felt.sleepiness > 0.75 || felt.fatigue > 0.65) words.push('They need rest.');
  if (!words.length) words.push('They show no sign of an immediate need for food, water, rest or care.');

  if (activeRaid(s)) {
    const cell = positionAt(s, p.id, s.minute);
    const above = yOf(cell) < SURF;
    if (p.activity?.action === 'hide') {
      if (above || riderCells(s).has(cell)) words.push('They are hiding and out of sight for now.');
    } else if (above) words.push('They are exposed above ground during the raid.');
    else if (riderCells(s).has(cell)) words.push('Riders can reach this passage.');
  }
  return words.join(' ');
}
