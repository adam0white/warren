/** Scoped guest work, not new trade qualifications. Physical outcomes stay in the host;
 * HF chooses and completes these ordinary affordances. No care/travel duty is settled here. */

import { DAY } from './calendar.ts';
import { xOf, yOf } from './grid.ts';
import type { Person } from './hf4.ts';
import type { WarrenState } from './warren.ts';
export const ROLE_TASKS: Record<string, readonly { action: string; label: string; minutes: number }[]> = {
  yusuf: [
    { action: 'digging-advice', label: 'discuss the visible digging marks with the workers', minutes: 90 },
    { action: 'well-advice', label: 'discuss a limited search for water', minutes: 90 },
  ],
  meryem: [
    { action: 'survey-route', label: 'walk and label an already visible route', minutes: 45 },
    { action: 'household-work', label: 'check the guest household’s food and supplies', minutes: 30 },
  ],
  maryam: [
    { action: 'cook', label: 'cook a household meal from its own grain', minutes: 60 },
    { action: 'store-check', label: 'check the household seed jars', minutes: 30 },
  ],
  tariq: [
    {
      action: 'building-preparation',
      label: 'prepare light building materials with Yusuf Usta',
      minutes: 30,
    },
    { action: 'building-assistance', label: 'help Yusuf Usta with a limited building check', minutes: 30 },
  ],
  tamar: [
    { action: 'perimeter-watch', label: 'check the nearby route to the village in daylight', minutes: 45 },
    {
      action: 'equipment-check',
      label: 'check the agreed watch signals and personal equipment',
      minutes: 30,
    },
  ],
  kian: [
    {
      action: 'watch-running',
      label: 'practise carrying a message along a short route with Tamar',
      minutes: 20,
    },
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
// Goal labels also become memory-retrieval tags in HF. Preserve their stored identity.
// These labels are not used to render the current activity; ROLE_TASKS supplies that prose.
export const ROLE_GOAL_LABELS: Record<string, string> = {
  yusuf: 'compare a visible digging line with the workers',
  meryem: 'walk and label an already visible route',
  maryam: 'prepare a household pot from its own grain',
  tariq: 'prepare light building materials with Yusuf Usta',
  tamar: 'check the near approach in daylight',
  kian: 'rehearse a short message route with Tamar',
};
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
      'digging-advice': 'discussed the visible digging marks with the workers. Some stone may still be loose',
      'well-advice': 'discussed a limited search for water. The search may find no water',
      'survey-route': 'walked a visible route and marked what could be seen',
      'household-work': 'checked the household’s food and supplies without taking another house’s grain',
      cook: 'cooked a meal for her household. The cooked grain is in the household jars',
      'store-check': 'checked the household seed jars. No supplies were added or moved',
      'building-preparation': 'prepared light materials under Yusuf Usta’s supervision',
      'building-assistance': 'completed a limited check with Yusuf Usta. He is still learning building work',
      'perimeter-watch':
        'checked the nearby route to the village in daylight. Riders may use a different route next time',
      'equipment-check': 'checked the agreed signals and personal equipment. No equipment was added',
      'watch-running':
        'practised carrying a message along a short route with Tamar. He still needs to care for his sister Ada',
      'stores-assistance': 'checked the guest stores with Tamar. He still needs to care for his sister Ada',
    };
    s.notes.push({
      at: s.minute,
      kind: 'story',
      who: p.id,
      text: `${p.name} ${words[action] ?? 'finished the limited task'}.`,
      weight: 1,
    });
    s.flags[`role-note:${p.id}`] = day + 1;
  }
  s.flags[`role-work:${p.id}`] = (s.flags[`role-work:${p.id}`] ?? 0) + 1;
  return true;
}
