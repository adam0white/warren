import { activeRaid, type WarrenState } from '../sim/warren.ts';

/** Explain the existing door choices; the keeper cannot roll the stone directly. */
export function doorWords(s: WarrenState, cell: number, lit: boolean): string {
  if (s.hill.doorWork[cell])
    return lit
      ? 'A door being carved. People can choose to carve it as they find the time. The stone must be finished before anyone can roll it shut.'
      : 'A door marked, in the dark. Hang a lamp near so people can choose to carve it. The stone must be finished before anyone can roll it shut.';
  if (s.hill.shut[cell])
    return 'The stone door, rolled shut. When there is no smoke, no riders and no sounding bell, an adult can choose to roll it back.';
  const raid = activeRaid(s);
  const ringing = !!s.bell && s.bell.until > s.minute;
  if (raid || ringing)
    return `The stone door, rolled back. ${raid ? 'With smoke or riders at the hill' : 'While the bell is sounding'}, an adult with the door nearby and reachable can choose to roll it shut. The choice is theirs.`;
  return 'The stone door, rolled back. Ring the bell so an adult with the door nearby and reachable can choose to shut it. Smoke or riders also make that choice available. People may choose other work; the bell does not shut the door itself.';
}
