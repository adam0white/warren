/** Voluntary bounded disclosures. An invitation reveals a clue, never the larger biography outcome. */
import { CAST_IDS } from './people.ts';
import type { WarrenState } from './warren.ts';
export const INVITATIONS: Record<string, string> = {
  yusuf: 'Ask to compare the old map with today’s stop line',
  meryem: 'Invite her to label a short survey together',
  maryam: 'Offer a smooth scrap during the kitchen wait',
  tariq: 'Offer a spare offcut for his own experiment',
  kian: 'Ask whether he would like to share a road story',
  tamar: 'Invite her to check the perimeter by daylight',
};
const CLUES: Record<string, string> = {
  yusuf:
    'Yusuf Usta chooses to show a crossed-out passage. “The ground was unstable. I also kept a shift past its agreed stop. A mark must let somebody stop me.” The injured worker’s response remains their own.',
  meryem:
    'Meryem agrees to show only the short section she walked. Two ink marks distinguish observed ground from inherited lines. “I left those marks off the clean map. I need to put them back.”',
  maryam:
    'Maryam accepts the smooth scrap and brings out a wooden ring and string. “Some are impossible knots. I keep the mistakes too.” She offers a puzzle, not the contents of her private notebook.',
  tariq:
    'Tariq accepts an offcut for a tiny boat. He shows one drawing of a failed sail. “Away from drinking water, and after the work is put away.” This is an experiment, not boatbuilding qualification.',
  kian: 'Kian chooses to unfold a story map. “The Very Small King admits nobody taller than the proprietor. Ada invented that one.” He keeps the map; sharing the joke does not settle his care duty.',
  tamar:
    'Tamar agrees to a daylight check. She demonstrates a hand signal twice. “I once changed a gesture without checking everyone understood. A younger watcher took the blame.” She asks Kian to demonstrate it back. The public correction remains unfinished.',
};
export function visit(s: WarrenState, id: string): boolean {
  const p = s.people.find((p) => p.id === id);
  if (
    (s.edition !== '0.5.0' && s.edition !== '0.6.0') ||
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
      text: `${p.name} leaves the invitation for a quieter moment.`,
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
    (s.edition !== '0.5.0' && s.edition !== '0.6.0') ||
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
    text: `${p.name} agrees to end this optional refuge assignment at a quiet boundary. Optional refuge work is withdrawn after the current activity. All promises and household duties remain in force; this is not a travel or duty-completion receipt.`,
    weight: 2,
  });
  return true;
}
