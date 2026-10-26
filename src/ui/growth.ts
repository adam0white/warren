import type { WarrenState } from '../sim/warren.ts';
import { numberWords } from './shelter.ts';

export function awayWords(s: WarrenState): string {
  const a = s.next?.away;
  if (!a) return '';
  const why = {
    event: 'A new event needs your attention.',
    attention: 'A call, danger or pending choice needs your attention.',
    computation: 'This device stopped catch-up at its computation budget.',
    elapsed: 'The elapsed time has been played through complete half-hour steps.',
  }[a.stopReason];
  return `While you were away, the hill played ${numberWords(a.simulatedMinutes)} game minutes. ${why} ${(s.next?.attention ?? a.events).join(' ')} ${Math.ceil(a.remainderMs / 60_000)} real minutes remain unplayed. Time away runs at one game minute per real minute. Unplayed time is not saved for later.`;
}

/** Saved lifetime observations; completed visits do not establish a successful refuge. */
export function growthWords(s: WarrenState): string {
  const visits = s.raids.filter((raid) => raid.stage === 'gone').length;
  const riders = visits
    ? `Riders have come and gone ${visits === 1 ? 'once' : `${numberWords(visits)} times`}.`
    : 'Riders have not yet come and gone.';
  const recent =
    s.edition === '0.7.0'
      ? s.notes
          .filter(
            (n) =>
              ['find', 'dig', 'arrival', 'raid', 'hurt'].includes(n.kind) ||
              (n.kind === 'story' && n.cell !== undefined),
          )
          .slice(-3)
          .map((n) => n.text)
          .join(' ')
      : '';
  return `${recent ? `During simulated play: ${recent} ` : ''}Since this hill began, people have dug ${numberWords(s.stats.dug)} ${s.stats.dug === 1 ? 'cell' : 'cells'}. ${numberWords(s.arrivals).replace(/^./, (c) => c.toUpperCase())} ${s.arrivals === 1 ? 'family has' : 'families have'} arrived. ${riders} These are past events. Open The village to check who riders can reach now. ${s.next ? awayWords(s) || 'This hill can play quietly while you are away, until an event needs your attention.' : 'The saved hill waits while you are away.'}`;
}
