/**
 * SCOPE: the keeper's one lever over a refuge goal that has faded. HF lets a goal fade after three days without
 * progress and lets it go below a floor; the refuge goal also ends as "achieved" after enough digging, whatever the
 * plan still needs. The keeper may ask Yusuf Usta to walk the chalk marks with the people who dig. Each digger who
 * holds the refuge goal and has not been released takes it up again at its own importance, as if it had just been
 * advanced. Nobody is told to dig: people still choose. Once per three game days, never while riders are on the
 * hill, only while Yusuf Usta is alive and not released, only when a marked wall is ready to cut, and only once a
 * digger's goal has fallen below half its importance, been achieved, or been let go, so fading still costs days.
 * It is a new input, so older input logs replay unchanged. It does not model persuasion, disagreement, or anyone refusing.
 */
import { DAY } from './calendar.ts';
import { faces } from './grid.ts';
import { USTA_ID } from './people.ts';
import { airAndLight, diggingAdults, faceState, note, type WarrenState } from './warren.ts';

export const RALLY_WAIT = 3 * DAY;

type RefugeGoal = WarrenState['people'][number]['agenda']['goals'][number];

export function refugeGoal(p: WarrenState['people'][number]): RefugeGoal | undefined {
  return p.agenda.goals.find((g) => g.id === 'refuge');
}

/** True when the refuge goal pulls at its full importance. */
function fresh(g: RefugeGoal | undefined): boolean {
  return !!g && g.status === 'active' && g.importance >= (g.baseImportance ?? g.importance) - 1e-9;
}

/** The ask waits until fading matters: the goal is below half its importance, achieved, or let go. */
export function faded(g: RefugeGoal | undefined): boolean {
  return !!g && (g.status !== 'active' || g.importance <= (g.baseImportance ?? g.importance) * 0.5);
}

/** Why the keeper cannot ask now, in plain words; undefined when the ask is available. */
export function rallyBlock(s: WarrenState): string | undefined {
  if (s.edition !== '0.5.0' && s.edition !== '0.6.0' && s.edition !== '0.7.0')
    return 'This hill has no master digger.';
  const usta = s.people.find((p) => p.id === USTA_ID);
  if (!usta?.body.alive || s.flags[`released:${USTA_ID}`]) return 'Yusuf Usta cannot walk the marks now.';
  if (s.raids.some((r) => r.stage === 'riders')) return 'Nobody walks the marks while riders are here.';
  const last = s.flags.rally;
  if (last !== undefined && s.minute < last - 1 + RALLY_WAIT)
    return 'Yusuf Usta walked the marks recently. He can ask again three days after that walk.';
  const { lit, air } = airAndLight(s);
  if (!faces(s.hill).some((f) => faceState(s, f.face, f.stand, lit, air) === 'ready'))
    return 'No marked wall is ready to cut.';
  if (!diggingAdults(s).some((p) => faded(refugeGoal(p))))
    return 'Yusuf Usta can ask once the refuge matters much less to someone who digs.';
  return undefined;
}

export function rally(s: WarrenState): boolean {
  if (rallyBlock(s)) return false;
  const joined: string[] = [];
  for (const p of diggingAdults(s)) {
    const g = refugeGoal(p);
    if (!g || fresh(g)) continue;
    if (g.status === 'achieved') g.progress = 0;
    g.status = 'active';
    g.importance = g.baseImportance ?? g.importance;
    g.lastAdvancedAt = s.minute;
    joined.push(p.name);
  }
  s.flags.rally = s.minute + 1;
  const names = joined.length > 1 ? `${joined.slice(0, -1).join(', ')} and ${joined.at(-1)}` : joined[0];
  note(s, {
    kind: 'story',
    who: USTA_ID,
    text: `Yusuf Usta walked the chalk marks with ${names} and talked about who the refuge is for. The refuge matters to them again. Each still chooses when to dig.`,
    weight: 2,
  });
  return true;
}
