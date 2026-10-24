/** Scoped guest work, not new trade qualifications. Physical outcomes stay in the host;
 * HF chooses and completes these ordinary affordances. No care/travel duty is settled here. */
import type { Person } from '@adam0white/human-framework';
import { DAY } from './calendar.ts';
import { xOf, yOf } from './grid.ts';
import type { WarrenState } from './warren.ts';
export const ROLE_TASKS: Record<string, readonly { action: string; label: string; minutes: number }[]> = {
  yusuf: [
    { action: 'digging-advice', label: 'compare a visible digging line with the workers', minutes: 90 },
    { action: 'well-advice', label: 'discuss a bounded water investigation', minutes: 90 },
  ],
  meryem: [
    { action: 'survey-route', label: 'walk and label an already visible route', minutes: 45 },
    { action: 'household-work', label: 'check the guest household’s provisions', minutes: 30 },
  ],
  maryam: [
    { action: 'cook', label: 'prepare a household pot from its own grain', minutes: 60 },
    { action: 'store-check', label: 'check the household seed jars', minutes: 30 },
  ],
  tariq: [
    {
      action: 'building-preparation',
      label: 'prepare light building materials with Yusuf Usta',
      minutes: 30,
    },
    { action: 'building-assistance', label: 'assist Yusuf Usta with a bounded building check', minutes: 30 },
  ],
  tamar: [
    { action: 'perimeter-watch', label: 'check the near approach in daylight', minutes: 45 },
    { action: 'equipment-check', label: 'check the agreed watch signals and personal kit', minutes: 30 },
  ],
  kian: [
    { action: 'watch-running', label: 'rehearse a short message route with Tamar', minutes: 20 },
    { action: 'stores-assistance', label: 'check the guest stores with Tamar', minutes: 25 },
  ],
};
export function roleTask(id: string, assignment: number) {
  return ROLE_TASKS[id]?.[assignment];
}
export function assignmentFor(s: WarrenState, id: string) {
  return Math.max(0, (s.flags[`routine:${id}`] ?? 1) - 1);
}
export function supervised(
  s: WarrenState,
  id: string,
  at: number,
  getPosition: (id: string) => number = (id) => s.pos[id] ?? -1,
): boolean {
  const supervisor =
    id === 'tariq' || (id === 'meryem' && assignmentFor(s, id) === 0)
      ? 'yusuf'
      : id === 'kian'
        ? 'tamar'
        : null;
  if (!supervisor) return true;
  const p = s.people.find((p) => p.id === supervisor);
  if (!p?.body.alive || s.flags[`released:${supervisor}`]) return false;
  const accepted =
    supervisor === 'yusuf' ? ['digging-advice', 'well-advice'] : ['perimeter-watch', 'equipment-check'];
  if (!p.activity || !accepted.includes(p.activity.action)) return false;
  const cell = getPosition(supervisor);
  return cell !== undefined && Math.abs(xOf(cell) - xOf(at)) + Math.abs(yOf(cell) - yOf(at)) <= 4;
}
export function seedRoleGoals(s: WarrenState) {
  for (const p of s.people) {
    const task = roleTask(p.id, 0);
    if (!task) continue;
    p.agenda.goals.push({
      id: 'canonical-role',
      label: task.label,
      serves: ['competence'],
      advancedBy: [{ action: task.action, amount: 0.1 }],
      importance: 0.35,
      progress: 0,
      status: 'active',
      adoptedAt: s.minute,
    });
  }
}
export function finishRoleWork(
  s: WarrenState,
  p: Person,
  action: string,
  done: boolean,
  ration: number,
): boolean {
  if (!ROLE_TASKS[p.id]?.some((task) => task.action === action)) return false;
  if (!done) return true;
  const house = s.houses.find((h) => h.members.includes(p.id));
  if (action === 'cook' && house) {
    const portion = Math.min(house.jars, ration * Math.max(1, house.members.length));
    house.jars -= portion;
    house.prepared = (house.prepared ?? 0) + portion;
  }
  const day = Math.floor(s.minute / DAY);
  if (s.flags[`role-note:${p.id}`] !== day + 1) {
    const words: Record<string, string> = {
      'digging-advice': 'compared the visible line with the workers; the ground remains uncertain',
      'well-advice': 'discussed a bounded water investigation; no water strike was promised',
      'survey-route': 'walked a visible route and labelled what was actually observed',
      'household-work': 'checked the household provisions without taking another house’s grain',
      cook: 'prepared a household portion; its grain remains real food in those jars',
      'store-check': 'checked the household seed jars; no stock was created or transferred',
      'building-preparation': 'prepared light materials under Yusuf Usta’s supervision',
      'building-assistance': 'completed a bounded check with Yusuf Usta; this grants no building licence',
      'perimeter-watch': 'checked the near approach in daylight without claiming future safety',
      'equipment-check': 'checked the agreed signals and personal kit without creating equipment',
      'watch-running': 'rehearsed a short message route with Tamar; Ada’s care remains Kian’s responsibility',
      'stores-assistance': 'checked the guest stores with Tamar; no care duty was waived',
    };
    s.notes.push({
      at: s.minute,
      kind: 'story',
      who: p.id,
      text: `${p.name} ${words[action] ?? 'finished the bounded task'}.`,
      weight: 1,
    });
    s.flags[`role-note:${p.id}`] = day + 1;
  }
  s.flags[`role-work:${p.id}`] = (s.flags[`role-work:${p.id}`] ?? 0) + 1;
  return true;
}
