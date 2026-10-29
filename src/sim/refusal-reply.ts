/** One deliberate reply to an attended, opposed cut statement. HF owns the choice and hearing. */
import { cellsWithUse, K, USE } from './grid.ts';
import {
  type Activity,
  type Affordance,
  ageYears,
  type DecisionRecord,
  heard,
  type Outcome,
  type Person,
  type Suggestion,
  type SuggestionResolution,
} from './hf4.ts';
import { RESIDENT_VOICE } from './resident-requests.ts';
import { note, positionAt, type WarrenState } from './warren.ts';

export interface RefusalReply {
  who: string;
  listener: string;
  face: number;
  at: number;
  source: { text: string; at: number; stance: 'pause' | 'continue' };
  answers: {
    at: number;
    action: string;
    label: string;
    verdict?: SuggestionResolution['verdict'];
    says: string;
    reason: string;
  }[];
  speech?: { at: number; startedAt: number; workFrom: number; text: string };
  heard: boolean;
  interrupted?: { at: number; startedAt: number; workFrom: number; reason: string };
  endedAt?: number;
  withdrawn?: boolean;
}
const quiet = (s: WarrenState) =>
  !s.bell && !s.raids.some((r) => r.stage === 'smoke' || r.stage === 'riders');
const adult = (s: WarrenState, id: string) =>
  s.people.find((p) => p.id === id && p.body.alive && ageYears(p) >= 18 && !s.flags[`released:${id}`]);
function sourceFor(s: WarrenState, who: string) {
  const d = s.next?.discussion;
  const p = adult(s, who);
  if (!d?.exchange || !p || d.statements.length !== 2 || !d.statements.every((r) => r.heard)) return;
  const row = d.statements.find((r) => r.listener === who && r.speaker !== who);
  const own = d.statements.find((r) => r.speaker === who && r.listener === row?.speaker);
  if (!row || !own || row.stance === own.stance || !adult(s, row.speaker)) return;
  // A historical claim that a speech was heard cannot replace public attendance evidence.
  if (!heard(p, row.text, row.at)) return;
  return row;
}
export function canReplyToRefusal(s: WarrenState, who: string): boolean {
  if (s.edition !== '0.7.0' || !quiet(s) || s.refusalReply || !sourceFor(s, who)) return false;
  if (s.bellAmends?.who === who && s.bellAmends.endedAt === undefined) return false;
  if (adult(s, who)?.activity?.affordanceId.startsWith('bell-amends-')) return false;
  const r = s.next?.requests;
  if (r?.disagreement && r.disagreement.endedAt === undefined) return false;
  if ([r?.rest, r?.door, s.doorTrials?.at(-1)].some((x) => x?.who === who && x.endedAt === undefined))
    return false;
  return !adult(s, who)?.activity?.affordanceId.startsWith('resident-');
}
export function requestRefusalReply(s: WarrenState, who: string): boolean {
  if (!canReplyToRefusal(s, who)) return false;
  const row = sourceFor(s, who)!;
  s.refusalReply = {
    who,
    listener: row.speaker,
    face: s.next!.discussion!.face,
    at: s.minute,
    source: { text: row.text, at: row.at, stance: row.stance },
    answers: [],
    heard: false,
  };
  note(s, {
    kind: 'story',
    who,
    cell: s.refusalReply.face,
    weight: 1,
    text: `You invite ${adult(s, who)!.name} to answer ${adult(s, row.speaker)!.name}'s words about the loose cut at the hearth. The reply takes travel and thirty minutes of work. Neither person has agreed to change the chalk.`,
  });
  return true;
}
const offerId = (r: RefusalReply) => `contextual-refusal-${r.at}-${r.who}`;
function pending(s: WarrenState, p: Person): RefusalReply | undefined {
  const r = s.refusalReply;
  return r?.who === p.id && r.endedAt === undefined && !r.speech ? r : undefined;
}
export function refusalReplySuggestion(s: WarrenState, p: Person): Suggestion | undefined {
  const r = pending(s, p);
  return r && quiet(s) && adult(s, p.id)
    ? {
        voiceId: RESIDENT_VOICE,
        action: 'talk-disagreement',
        strength: 0.7,
        since: r.at,
      }
    : undefined;
}
export function refusalReplyOffers(
  s: WarrenState,
  p: Person,
): { offer: Affordance; cell: number; minutes: number }[] {
  const r = pending(s, p);
  const hearth = cellsWithUse(s.hill, USE.hearth)[0];
  if (!r || !quiet(s) || !adult(s, p.id) || !adult(s, r.listener) || hearth === undefined) return [];
  return [
    {
      cell: hearth,
      minutes: 30,
      offer: {
        id: offerId(r),
        action: 'talk-disagreement',
        label: 'answer the heard words about the loose cut at the hearth',
        duration: 0,
        effort: 0.05,
        advertises: { belonging: 0.2, autonomy: 0.1 },
        tags: ['social', 'conversation'],
        targetId: r.listener,
        placeId: 'hearth',
      },
    },
  ];
}
export function captureRefusalReplyAnswer(
  s: WarrenState,
  p: Person,
  offer: Affordance,
  record: DecisionRecord,
): void {
  const r = pending(s, p);
  if (!r) return;
  const result =
    record.suggestion?.voiceId === RESIDENT_VOICE
      ? record.suggestion
      : record.suggestions?.find((x) => x.voiceId === RESIDENT_VOICE);
  if (!result && offer.id !== offerId(r)) return;
  const says = result?.says ?? record.narration ?? `The chosen activity is to ${offer.label}.`;
  const previous = r.answers.at(-1);
  if (
    previous &&
    previous.verdict === result?.verdict &&
    previous.says === says &&
    previous.action === offer.action
  )
    return;
  r.answers.push({
    at: p.now,
    action: offer.action,
    label: offer.label,
    ...(result ? { verdict: result.verdict } : {}),
    says,
    reason: result?.reason ?? 'HF recorded this activity choice.',
  });
  note(s, {
    at: p.now,
    kind: 'answer',
    who: p.id,
    weight: 1,
    text: `${p.name} chose to ${offer.label}. ${says}`,
  });
}
function stoneWords(s: WarrenState, face: number): string {
  if (s.hill.kind[face] !== K.loose) return 'That square no longer contains the loose stone we discussed.';
  return s.hill.chalk[face]
    ? 'The loose stone is still marked for digging.'
    : 'The loose stone is no longer marked for digging.';
}
export function finishRefusalReply(
  s: WarrenState,
  p: Person,
  activity: Activity,
  done: boolean,
): Partial<Outcome> | undefined {
  if (!activity.affordanceId.startsWith('contextual-refusal-')) return;
  const r = pending(s, p);
  const workFrom = s.trips[p.id]?.workFrom ?? activity.startedAt;
  // A stale or unrelated receipt cannot close another request or write a second note.
  if (
    !r ||
    activity.action !== 'talk-disagreement' ||
    activity.affordanceId !== offerId(r) ||
    activity.targetId !== r.listener ||
    activity.startedAt < r.at
  )
    return { status: 'interrupted', summary: 'This reply is no longer pending.' };
  const q = adult(s, r.listener);
  const hearth = cellsWithUse(s.hill, USE.hearth)[0];
  const failure = !done
    ? 'The reply stopped before the work finished.'
    : !adult(s, p.id)
      ? 'The person invited to reply is no longer present as an adult on the hill.'
      : !q
        ? 'The intended listener is no longer present as an adult on the hill.'
        : !quiet(s)
          ? 'The bell call or danger interrupted the reply.'
          : p.body.asleep || q.body.asleep
            ? 'The reply did not reach an awake speaker and listener.'
            : p.now - workFrom < 30 - 1e-6
              ? 'The reply did not receive thirty minutes of work at the hearth.'
              : positionAt(s, p.id, p.now) !== hearth || positionAt(s, q.id, p.now) !== hearth
                ? 'The speaker and listener were not together at the hearth when the reply finished.'
                : undefined;
  if (failure) {
    r.interrupted = { at: p.now, startedAt: activity.startedAt, workFrom, reason: failure };
    r.endedAt = p.now;
    note(s, { at: p.now, kind: 'story', who: p.id, cell: r.face, weight: 1, text: failure });
    return { status: 'interrupted', summary: failure };
  }
  if (!q) return { status: 'interrupted' };
  const text = `${p.name} tells ${q.name}, “I heard these words: ${r.source.text} ${stoneWords(s, r.face)} I am answering you here. This reply does not settle what we should do.”`;
  r.speech = { at: p.now, startedAt: activity.startedAt, workFrom, text };
  const queued = s.queued[q.id] ?? [];
  s.queued[q.id] = queued;
  queued.push({
    at: p.now,
    channel: 'told',
    kind: 'contextual-refusal-reply',
    actorId: p.id,
    targetId: q.id,
    placeId: 'hearth',
    salience: 0.8,
    summary: text,
  });
  note(s, { at: p.now, kind: 'story', who: p.id, cell: r.face, weight: 1, text });
  return { summary: text, needs: { belonging: 0.1 } };
}
export function observeRefusalReply(s: WarrenState): void {
  const r = s.refusalReply;
  if (!r?.speech || r.heard || r.withdrawn) return;
  const listener = s.people.find((p) => p.id === r.listener);
  if (listener && heard(listener, r.speech.text, r.speech.at)) {
    r.heard = true;
    r.endedAt = s.minute;
  }
}
export function withdrawRefusalReply(s: WarrenState): boolean {
  const r = s.refusalReply;
  if (!r || r.endedAt !== undefined) return false;
  r.endedAt = s.minute;
  r.withdrawn = true;
  note(s, {
    kind: 'story',
    who: r.who,
    cell: r.face,
    weight: 1,
    text: 'You withdraw the invitation to reply. Time spent and any words already spoken remain.',
  });
  return true;
}
export function refusalReplyWords(s: WarrenState): string {
  const r = s.refusalReply;
  if (!r) return 'A reply requires words the person actually heard about the loose cut.';
  const answer = r.answers.at(-1);
  return [
    r.withdrawn
      ? 'The invitation was withdrawn.'
      : r.interrupted
        ? r.interrupted.reason
        : r.heard
          ? 'The companion heard the reply.'
          : r.speech
            ? 'The reply was spoken. Hearing has not been recorded yet.'
            : 'The invitation to reply is pending.',
    `Heard words: ${r.source.text}`,
    answer
      ? `Latest answer: “${answer.says}” Chosen activity: ${answer.label}.`
      : 'No answer has been recorded yet.',
    r.speech?.text ?? '',
  ].join(' ');
}
