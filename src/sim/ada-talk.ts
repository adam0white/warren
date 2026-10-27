/** SCOPE: one keeper-requested Kian/Tamar conversation about Ada. The host owns
 * these finite words and travel/work receipts. Published HF owns every choice,
 * assent and attended percept. Speech never changes Ada's care or return duty.
 * No request means no new fields, offers, percepts or simulation changes. */
import type {
  Activity,
  Affordance,
  DecisionRecord,
  Outcome,
  Person,
  Suggestion,
  SuggestionResolution,
} from '@adam0white/human-framework';
import { cellsWithUse, USE } from './grid.ts';
import { note, positionAt, type WarrenState } from './warren.ts';

export interface AdaTalk {
  at: number;
  answers: {
    at: number;
    who: string;
    verdict: SuggestionResolution['verdict'];
    says: string;
    reason: string;
    action: string;
    label: string;
  }[];
  statements: {
    who: string;
    listener: string;
    startedAt: number;
    workFrom: number;
    at: number;
    words: string;
    text: string;
    heard: boolean;
  }[];
  failures: { who: string; at: number; startedAt: number; workFrom: number; reason: string }[];
  endedAt?: number;
  withdrawn?: boolean;
}
const VOICE = 'keeper-ada-talk';
const ids = ['kian', 'tamar'];
const latest = (s: WarrenState) => s.adaTalks?.at(-1);
const quiet = (s: WarrenState) =>
  !s.bell && !s.raids.some((r) => r.stage === 'smoke' || r.stage === 'riders');
export function adaTalkUnavailable(s: WarrenState): string | undefined {
  if (s.edition !== '0.6.0' && s.edition !== '0.7.0')
    return 'This earlier hill keeps its original conversations.';
  if (latest(s)?.endedAt === undefined && latest(s)) return 'The conversation is still pending.';
  if (!quiet(s)) return 'Wait until the bell call and the danger have passed.';
  if (
    s.adaVisit &&
    (s.adaVisit.endedAt !== undefined || s.adaVisit.endRequested || s.minute >= s.adaVisit.returnBy)
  )
    return 'Kian’s optional refuge visit is ending or has ended. His duty to return with Ada remains.';
  if (ids.some((id) => !s.people.find((p) => p.id === id)?.body.alive || s.flags[`released:${id}`]))
    return 'Kian and Tamar must both be alive and still visiting the refuge.';
  if (ids.some((id) => s.people.find((p) => p.id === id)?.activity?.action === 'talk-ada'))
    return 'Earlier conversation work is still in progress.';
  return undefined;
}
export function askAda(s: WarrenState): boolean {
  if (adaTalkUnavailable(s)) return false;
  s.adaTalks ??= [];
  s.adaTalks.push({ at: s.minute, answers: [], statements: [], failures: [] });
  note(s, {
    kind: 'story',
    who: 'kian',
    weight: 1,
    text: 'You ask Kian to talk with Tamar about Ada at the hearth. Each speaker needs travel and half an hour. Care, food, sleep and work may come first.',
  });
  return true;
}
export function withdrawAdaTalk(s: WarrenState): boolean {
  const r = latest(s);
  if (!r || r.endedAt !== undefined) return false;
  r.withdrawn = true;
  r.endedAt = s.minute;
  note(s, {
    kind: 'story',
    who: 'kian',
    weight: 1,
    text: 'You stop waiting for the conversation about Ada. Earlier words, answers and time spent remain. Her care and the duty to return have not changed.',
  });
  return true;
}
function available(s: WarrenState, p: Person): boolean {
  const r = latest(s);
  if (!r || r.endedAt !== undefined || !quiet(s) || !p.body.alive || s.flags[`released:${p.id}`])
    return false;
  if (
    s.adaVisit &&
    (s.adaVisit.endedAt !== undefined ||
      s.adaVisit.endRequested ||
      Math.max(p.now, s.minute) >= s.adaVisit.returnBy)
  )
    return false;
  if (ids.some((id) => !s.people.find((q) => q.id === id)?.body.alive || s.flags[`released:${id}`]))
    return false;
  return r.statements.length === 0
    ? p.id === 'kian'
    : r.statements.length === 1 && r.statements[0]!.heard && p.id === 'tamar';
}
export function adaTalkSuggestion(s: WarrenState, p: Person): Suggestion | undefined {
  if (available(s, p)) return { voiceId: VOICE, action: 'talk-ada', strength: 0.7, since: latest(s)!.at };
}
export function adaTalkOffers(s: WarrenState, p: Person): Affordance[] {
  if (!available(s, p)) return [];
  const r = latest(s)!;
  const listener = s.people.find((q) => q.id === (p.id === 'kian' ? 'tamar' : 'kian'));
  const hearth = cellsWithUse(s.hill, USE.hearth)[0];
  if (
    !listener ||
    listener.body.asleep ||
    hearth === undefined ||
    positionAt(s, listener.id, Math.max(p.now, s.minute)) !== hearth
  )
    return [];
  return [
    {
      id: `ada-talk-${s.adaTalks!.length}-${r.at}-${p.id}`,
      action: 'talk-ada',
      label: p.id === 'kian' ? 'talk with Tamar about Ada' : 'answer Kian about Ada at the hearth',
      targetId: p.id === 'kian' ? 'tamar' : 'kian',
      placeId: 'hearth',
      duration: 0,
      effort: 0.05,
      advertises: { belonging: 0.2, autonomy: 0.1 },
      tags: ['social', 'conversation'],
    },
  ];
}
export function captureAdaTalkAnswer(
  s: WarrenState,
  p: Person,
  offer: Affordance,
  record: DecisionRecord,
): void {
  const r = latest(s);
  if (!r || r.endedAt !== undefined) return;
  const result =
    record.suggestion?.voiceId === VOICE
      ? record.suggestion
      : record.suggestions?.find((a) => a.voiceId === VOICE);
  if (!result) return;
  const previous = r.answers.at(-1);
  if (
    previous?.who === p.id &&
    previous.verdict === result.verdict &&
    previous.says === result.says &&
    previous.action === offer.action
  )
    return;
  r.answers.push({
    at: p.now,
    who: p.id,
    verdict: result.verdict,
    says: result.says,
    reason: result.reason,
    action: offer.action,
    label: offer.label,
  });
  note(s, {
    at: p.now,
    kind: 'answer',
    who: p.id,
    weight: 1,
    text: `${p.name} answers the invitation about Ada: “${result.says}” The chosen activity is to ${offer.label}.`,
  });
}
function kianWords(s: WarrenState, at: number): string {
  const v = s.adaVisit;
  if (!v)
    return 'Ada is my sister. She came here with me. I look after her. She invented the Very Small King, who lets nobody taller than himself come in. I cannot tell you how hungry, thirsty or tired she is now.';
  const food =
    v.dependent.satiety < 0.3 ? 'was hungry' : v.dependent.satiety < 0.6 ? 'could eat' : 'had eaten';
  const water =
    v.dependent.hydration < 0.3
      ? 'was thirsty'
      : v.dependent.hydration < 0.6
        ? 'could drink'
        : 'had had water';
  const rest =
    v.dependent.sleepPressure > 0.7
      ? 'was sleepy'
      : v.dependent.sleepPressure > 0.4
        ? 'was tired'
        : 'was rested';
  return `Ada is with me. The last care note is from ${Math.max(0, Math.round(at - v.dependent.sourceMinute))} game minutes ago. It recorded that she ${food}, ${water}, and ${rest}. I have no newer observation of her condition. ${v.careCount ? 'We have shared more food, water and rest here.' : 'We have not shared another meal here yet.'} We still have to return to the Watch together.`;
}
function tamarWords(s: WarrenState, words: string): string {
  const house = s.houses.find((h) => h.members.includes('kian'));
  const hearth = cellsWithUse(s.hill, USE.hearth)[0];
  const grain = (house?.jars ?? 0) >= 0.1;
  const water = hearth !== undefined && (s.hill.water[hearth] ?? 0) >= 0.1;
  return `You said, “${words}” ${grain ? 'There is grain in your household jars.' : 'Your household jars do not have enough grain for another shared meal.'} ${water ? 'There is water at the hearth.' : 'The hearth jars need more water before another shared meal.'} Talking here has not fed Ada or brought you home.`;
}
export function finishAdaTalk(
  s: WarrenState,
  p: Person,
  activity: Activity,
  done: boolean,
): Partial<Outcome> | undefined {
  if (activity.action !== 'talk-ada') return;
  const r = latest(s);
  const workFrom = s.trips[p.id]?.workFrom ?? activity.startedAt;
  const offered = adaTalkOffers(s, p)[0];
  const hearth = cellsWithUse(s.hill, USE.hearth)[0];
  const q = s.people.find((x) => x.id === activity.targetId);
  if (
    !r ||
    r.endedAt !== undefined ||
    !done ||
    offered?.id !== activity.affordanceId ||
    p.body.asleep ||
    !q?.body.alive ||
    q.body.asleep ||
    hearth === undefined ||
    positionAt(s, p.id, p.now) !== hearth ||
    positionAt(s, q.id, p.now) !== hearth ||
    p.now - workFrom < 30
  ) {
    if (r && activity.affordanceId === `ada-talk-${s.adaTalks!.length}-${r.at}-${p.id}`) {
      const reason = !done
        ? 'The conversation work was interrupted.'
        : 'The conversation did not reach an awake listener at the hearth while the visit was still open and quiet.';
      r.failures.push({ who: p.id, at: p.now, startedAt: activity.startedAt, workFrom, reason });
      note(s, { at: p.now, kind: 'story', who: p.id, text: reason, weight: 1 });
    }
    return { status: 'interrupted' };
  }
  const words = p.id === 'kian' ? kianWords(s, p.now) : tamarWords(s, r.statements[0]!.words);
  const text = `${p.name} tells ${q.name}, “${words}”`;
  r.statements.push({
    who: p.id,
    listener: q.id,
    startedAt: activity.startedAt,
    workFrom,
    at: p.now,
    words,
    text,
    heard: false,
  });
  s.queued[q.id] ??= [];
  s.queued[q.id]!.push({
    at: p.now,
    channel: 'told',
    kind: 'ada-talk',
    actorId: p.id,
    targetId: q.id,
    placeId: 'hearth',
    salience: 0.8,
    summary: text,
  });
  note(s, { at: p.now, kind: 'story', who: p.id, text, weight: 1 });
  return { summary: text, needs: { belonging: 0.1 } };
}
export function observeAdaTalk(s: WarrenState): void {
  for (const r of s.adaTalks ?? []) {
    for (const row of r.statements) {
      if (!row.heard)
        row.heard = !!s.people
          .find((p) => p.id === row.listener)
          ?.memory.episodes.some((e) => e.at >= row.at && e.summary === row.text);
    }
    if (r.endedAt === undefined && r.statements.length === 2 && r.statements.every((x) => x.heard)) {
      r.endedAt = s.minute;
      note(s, {
        kind: 'story',
        who: 'kian',
        weight: 1,
        text: 'Kian and Tamar heard each other’s words about Ada. No meal, rest or return was completed by this conversation.',
      });
    }
  }
}
export function adaTalkWords(s: WarrenState): string {
  const r = latest(s);
  if (!r)
    return 'You can ask Kian to talk with Tamar about Ada. Both may choose other work or rest. Each speaker needs travel and half an hour at the hearth.';
  const answer = r.answers.at(-1);
  const waiting =
    r.endedAt !== undefined
      ? ''
      : !quiet(s)
        ? 'The conversation must wait for the bell call and danger to pass.'
        : s.adaVisit &&
            (s.adaVisit.endRequested || s.adaVisit.endedAt !== undefined || s.minute >= s.adaVisit.returnBy)
          ? 'Kian’s optional visit is ending. The conversation cannot finish after that boundary.'
          : r.statements.length < 2
            ? 'An awake listener must be at the hearth when the speaker chooses and finishes.'
            : 'The last words have not yet been heard.';
  return `${r.withdrawn ? 'You stopped waiting.' : r.endedAt !== undefined ? 'Both people heard the conversation.' : 'The conversation is still pending.'} ${answer ? `Latest answer: “${answer.says}” Chosen activity: ${answer.label}.` : 'No answer has been recorded yet.'} ${r.statements.map((x) => `${x.text} ${x.heard ? 'These words were heard.' : 'Hearing has not been recorded.'}`).join(' ')} ${r.failures.at(-1)?.reason ?? ''} ${waiting}`.trim();
}
