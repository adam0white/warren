import type { WarrenState } from '../sim/warren.ts';
import { numberWords } from './shelter.ts';

/** Saved lifetime observations; completed visits do not establish a successful refuge. */
export function growthWords(s: WarrenState): string {
  const visits = s.raids.filter((raid) => raid.stage === 'gone').length;
  const riders = visits
    ? `Riders have come and gone ${visits === 1 ? 'once' : `${numberWords(visits)} times`}.`
    : 'Riders have not yet come and gone.';
  return `Since this hill began: ${numberWords(s.stats.dug)} ${s.stats.dug === 1 ? 'cell' : 'cells'} dug; ${numberWords(s.arrivals)} ${s.arrivals === 1 ? 'family has' : 'families have'} arrived. ${riders} This is history; check The village for current safety. The saved hill waits while you are away.`;
}
