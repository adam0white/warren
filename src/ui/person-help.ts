import { SURF, yOf } from '../sim/grid.ts';
import { type PersonReading as Person, readBody } from '../sim/hf4.ts';
import { activeRaid, positionAt, riderCells, type WarrenState } from '../sim/warren.ts';

import { personWords } from './words.ts';

/** Current bodily needs and raid exposure, without diagnosing a cause or promising safety. */
export function personHelpWords(s: WarrenState, p: Person): string {
  if (!p.body.alive) return 'This person has died. See the journal.';
  const { subject } = personWords(p);
  const body = p.body;
  const felt = readBody(p).perceived;
  const words: string[] = ['This is an approximate reading of current condition.'];
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
  if (words.length === 1) words.push(`${subject} does not seem to need food, water, rest or care right now.`);

  const injury = s.notes.findLast((note) => note.kind === 'hurt' && note.who === p.id);
  if (injury) words.push(`The journal records an earlier injury: ${injury.text}`);

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

/** Pending is a recorded invitation, not a refusal or a promise to answer by a time. */
export function invitationWords(s: WarrenState, p: Person): string {
  const answered = s.flags[`visit:${p.id}`];
  if (answered) {
    const reply = s.notes.findLast((n) => n.who === p.id && n.at === answered - 1 && n.weight === 2);
    return `This invitation was answered.${reply ? ` ${reply.text}` : ' The earlier reply is no longer in the short journal.'}`;
  }
  if (s.flags[`invitation-pending:${p.id}`])
    return `This invitation is pending. ${p.activity ? `${p.name} is still doing the current task.` : 'No reply is recorded yet.'} ${s.raids.some((r) => r.stage === 'riders') ? 'Riders are here; the invitation waits.' : 'The invitation waits for a quiet moment between activities.'}`;
  return 'You can offer this invitation. It does not order work or rest. A reply may wait until the current task ends.';
}
