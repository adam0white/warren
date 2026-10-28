/** Voluntary bounded disclosures. An invitation reveals a clue, never the larger biography outcome. */
import { CAST_IDS } from './people.ts';
import type { WarrenState } from './warren.ts';
export const INVITATIONS: Record<string, string> = {
  yusuf: 'Ask to compare the old map with the line where work must stop today',
  meryem: 'Invite her to mark a short route you have examined together',
  maryam: 'Offer a smooth leftover piece of material while she waits in the kitchen',
  tariq: 'Offer a spare piece of leftover material for his own experiment',
  kian: 'Ask whether he would like to share a road story',
  tamar: 'Invite her to check the village boundary by daylight',
};
const CLUES: Record<string, string> = {
  yusuf:
    'Yusuf Usta chooses to show a crossed-out passage. “The ground was unstable. I also kept people working past the agreed time. A mark must show others when they can stop me.” The injured worker decides how to respond.',
  meryem:
    'Meryem agrees to show only the short section she walked. Two ink marks show which ground she saw herself and which lines came from older maps. “I left those marks off the clean map. I need to put them back.”',
  maryam:
    'Maryam accepts the smooth leftover piece and brings out a wooden ring and string. “Some are impossible knots. I keep the mistakes too.” She offers a puzzle, not the contents of her private notebook.',
  tariq:
    'Tariq accepts the leftover piece to make a tiny boat. He shows one drawing of a failed sail. “I will test it away from drinking water, after I put the work away.” This experiment does not qualify him to build boats.',
  kian: 'Kian chooses to unfold a story map. “The Very Small King lets nobody in who is taller than the owner. Ada invented that one.” He keeps the map; sharing the joke does not settle his care duty.',
  tamar:
    'Tamar agrees to a daylight check. She demonstrates a hand signal twice. “I once changed a gesture without checking everyone understood. A younger watcher took the blame.” She asks Kian to demonstrate it back. The public correction remains unfinished.',
};
/** Read the retained authored invitation note only. A visit flag cannot recover trimmed words. */
export function receivedVisit(s: WarrenState, id: string) {
  const at = s.flags[`visit:${id}`];
  if (!at || !CLUES[id]) return undefined;
  return s.notes.find((n) => n.kind === 'story' && n.who === id && n.at === at - 1 && n.text === CLUES[id]);
}

export function visit(s: WarrenState, id: string): boolean {
  const p = s.people.find((p) => p.id === id);
  if (
    (s.edition !== '0.5.0' && s.edition !== '0.6.0' && s.edition !== '0.7.0') ||
    !CAST_IDS[id] ||
    !p?.body.alive ||
    s.flags[`visit:${id}`]
  )
    return false;
  if (p.activity || s.raids.some((r) => r.stage === 'riders')) {
    s.flags[`invitation-pending:${id}`] = s.minute + 1;
    s.notes.push({
      at: s.minute,
      kind: 'story',
      who: id,
      text: `${p.name} waits for a quieter moment to answer the invitation.`,
      weight: 1,
    });
    return true;
  }
  delete s.flags[`invitation-pending:${id}`];
  s.flags[`visit:${id}`] = s.minute + 1;
  s.notes.push({ at: s.minute, kind: 'story', who: id, text: CLUES[id]!, weight: 2 });
  return true;
}

/** A real local chapter release. Only the optional refuge assignment can be withdrawn. */
export function releaseVisit(s: WarrenState, id: string): boolean {
  const p = s.people.find((p) => p.id === id);
  if (
    (s.edition !== '0.5.0' && s.edition !== '0.6.0' && s.edition !== '0.7.0') ||
    !CAST_IDS[id] ||
    !p?.body.alive ||
    p.projects?.currentGoalId ||
    s.raids.some((r) => r.stage === 'riders')
  )
    return false;
  if (id === 'kian') return false; // Use the finite Ada end choice; generic release must not abandon care or return.
  if (
    p.agenda.goals.some(
      (g) =>
        g.status === 'active' && !['refuge', 'between-games-assignment', 'canonical-role'].includes(g.id),
    )
  )
    return false;
  if (p.activity) {
    s.flags[`release-pending:${id}`] = s.minute + 1;
    return true;
  }
  delete s.flags[`release-pending:${id}`];
  for (const goal of p.agenda.goals)
    if (
      goal.status === 'active' &&
      ['refuge', 'between-games-assignment', 'canonical-role'].includes(goal.id)
    )
      goal.status = 'abandoned';
  s.flags[`released:${id}`] = s.minute + 1;
  s.notes.push({
    at: s.minute,
    kind: 'story',
    who: id,
    text: `${p.name} agrees to stop optional work on the refuge after the current activity. All promises and household duties still apply. This does not record a journey or a completed duty.`,
    weight: 2,
  });
  return true;
}
