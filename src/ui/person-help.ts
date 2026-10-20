import { type Person, readBody } from '@adam0white/human-framework';
import { SURF, yOf } from '../sim/grid.ts';
import { activeRaid, positionAt, riderCells, type WarrenState } from '../sim/warren.ts';

/** Current bodily needs and raid exposure, without diagnosing a cause or promising safety. */
export function personHelpWords(s: WarrenState, p: Person): string {
  if (!p.body.alive) return 'No longer living; see the journal.';
  const body = p.body;
  const felt = readBody(p).perceived;
  const words: string[] = [];
  if (body.downed) words.push('Cannot get up; needs help.');
  if (body.health < 0.5) words.push('In poor health; needs care.');
  if (body.illnesses.some((ill) => ill.severity > 0 || ill.trendPerDay > 0 || ill.chronic))
    words.push('Living with an illness.');
  if (body.injuries.some((injury) => (injury.bleeding ?? 0) > 0)) words.push('Bleeding; needs care.');
  else if (body.injuries.some((injury) => injury.severity > 0)) words.push('Nursing an injury.');
  else if (felt.pain > 0.5) words.push('In pain.');
  if (felt.hunger > 0.5) words.push('Needs food.');
  if (felt.thirst > 0.6) words.push('Needs water.');
  if (felt.sleepiness > 0.75 || felt.fatigue > 0.65) words.push('Needs rest.');
  if (!words.length) words.push('No immediate bodily need is showing.');

  if (activeRaid(s)) {
    const cell = positionAt(s, p.id, s.minute);
    const above = yOf(cell) < SURF;
    if (p.activity?.action === 'hide') {
      if (above || riderCells(s).has(cell)) words.push('Hiding; out of sight for now.');
    } else if (above) words.push('Exposed above ground during the raid.');
    else if (riderCells(s).has(cell)) words.push('Riders can reach this passage.');
  }
  return words.join(' ');
}
