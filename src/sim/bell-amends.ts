/** SCOPE: one keeper apology after an actual retained false bell and this
 * person's actual response. HF chooses whether to attend a costed hearing.
 * Public attention, not completion alone, establishes receipt. No forgiveness,
 * trust refund, promise, private feeling or changed past is inferred. */
import { cellsWithUse, USE } from './grid.ts';
import {
  type Activity,
  type Affordance,
  ageYears,
  type DecisionRecord,
  heard,
  type Outcome,
  type Person,
  residentReply,
  type Suggestion,
} from './hf4.ts';
import { doorRequest } from './resident-requests.ts';
import { note, positionAt, V, type WarrenState } from './warren.ts';

export interface BellAmends {
  at: number;
  who: string;
  source: { at: number; text: string; answer: { at: number; says: string } };
  answers: { at: number; says: string; action: string; label: string; verdict?: string; eventId?: string }[];
  speech?: { at: number; startedAt: number; workFrom: number; text: string; heard: boolean };
  endedAt?: number;
  withdrawn?: boolean;
  reason?: string;
}
const quiet = (s: WarrenState) =>
  !s.bell && !s.raids.some((r) => r.stage === 'smoke' || r.stage === 'riders');
const person = (s: WarrenState, who: string) =>
  s.people.find((p) => p.id === who && p.body.alive && ageYears(p) >= 18 && !s.flags[`released:${who}`]);
function source(s: WarrenState, who: string) {
  const call = s.notes.findLast((n) => n.text === 'You rang the bell, though no one had seen smoke.');
  if (!call) return;
  const next = s.notes.find((n) => n.at > call.at && n.text === 'You rang the bell.');
  const answer = s.answers.find(
    (a) =>
      a.who === who && a.at >= call.at && a.at < Math.min(next?.at ?? Infinity, call.at + V.bellHours * 60),
  );
  return answer ? { at: call.at, text: call.text, answer: { at: answer.at, says: answer.says } } : undefined;
}
export function amendsUnavailable(s: WarrenState, who: string): string | undefined {
  if (s.edition !== '0.7.0' || s.bellAmends) return 'This hill offers one apology for a false bell.';
  if (!quiet(s)) return 'Wait until the bell call and danger have ended.';
  if (!person(s, who) || !source(s, who))
    return 'No retained response from this person to a false bell is available.';
  if (
    [...Object.values(s.next?.requests ?? {}), doorRequest(s)].some(
      (r) => r?.who === who && r.endedAt === undefined,
    ) ||
    (who === 'tariq' && s.tariqTrial?.endedAt === undefined && s.tariqTrial) ||
    (who === 'maryam' && s.maryamPuzzle?.endedAt === undefined && s.maryamPuzzle) ||
    s.newcomerExchanges?.some((r) => r.who === who && r.endedAt === undefined) ||
    (s.refusalReply?.who === who && s.refusalReply.endedAt === undefined)
  )
    return 'Finish or withdraw the other request to this person first.';
  if (
    person(s, who)?.activity?.affordanceId.match(
      /^(resident-|newcomer-|maryam-puzzle-|tariq-trial-|contextual-refusal-)/,
    )
  )
    return 'This person is still finishing another request.';
}
export function requestAmends(s: WarrenState, who: string): boolean {
  if (amendsUnavailable(s, who)) return false;
  s.bellAmends = { at: s.minute, who, source: source(s, who)!, answers: [] };
  note(s, {
    kind: 'story',
    who,
    weight: 1,
    text: `You ask ${person(s, who)!.name} to hear an apology at the hearth for your false bell. Travel and half an hour are needed; work and rest may come first.`,
  });
  return true;
}
export function withdrawAmends(s: WarrenState): boolean {
  const r = s.bellAmends;
  if (!r || r.endedAt !== undefined) return false;
  r.withdrawn = true;
  r.endedAt = s.minute;
  r.reason = 'You stop waiting to speak about the false bell. Earlier events and time spent remain.';
  note(s, { kind: 'story', who: r.who, weight: 1, text: r.reason });
  return true;
}
const id = (r: BellAmends) => `bell-amends-${r.at}-${r.who}`;
const pending = (s: WarrenState, p: Person) =>
  s.bellAmends?.who === p.id && s.bellAmends.endedAt === undefined && !!person(s, p.id) && quiet(s);
export function amendsSuggestion(s: WarrenState, p: Person): Suggestion | undefined {
  if (pending(s, p))
    return {
      voiceId: 'keeper-resident',
      affordanceId: id(s.bellAmends!),
      strength: 0.7,
      since: s.bellAmends!.at,
    };
}
export function amendsOffers(s: WarrenState, p: Person): Affordance[] {
  return pending(s, p)
    ? [
        {
          id: id(s.bellAmends!),
          action: 'play',
          label: 'hear the keeper’s apology for the false bell at the hearth',
          placeId: 'hearth',
          duration: 0,
          effort: 0.05,
          advertises: { autonomy: 0.1, belonging: 0.2 },
          tags: ['social'],
        },
      ]
    : [];
}
export function captureAmends(s: WarrenState, p: Person, o: Affordance, d: DecisionRecord) {
  const r = s.bellAmends;
  if (!r || !pending(s, p)) return;
  const a =
    d.suggestion?.voiceId === 'keeper-resident'
      ? d.suggestion
      : d.suggestions?.find((a) => a.voiceId === 'keeper-resident');
  if (!a && !r.answers.length) return;
  r.answers.push({
    at: p.now,
    says: a?.says ?? d.narration ?? '',
    action: o.action,
    label: o.label,
    ...(a ? { verdict: a.verdict } : {}),
  });
  if (o.id !== id(r)) {
    r.endedAt = p.now;
    r.reason = `${p.name} chose another activity. The apology has not been heard.`;
  }
}
export function finishAmends(
  s: WarrenState,
  p: Person,
  a: Activity,
  done: boolean,
): Partial<Outcome> | undefined {
  if (!a.affordanceId.startsWith('bell-amends-')) return;
  const r = s.bellAmends,
    cell = cellsWithUse(s.hill, USE.hearth)[0],
    workFrom = s.trips[p.id]?.workFrom ?? a.startedAt;
  if (
    !r ||
    !pending(s, p) ||
    a.affordanceId !== id(r) ||
    !done ||
    p.body.asleep ||
    cell === undefined ||
    positionAt(s, p.id, p.now) !== cell ||
    p.now - workFrom < 30
  ) {
    if (r) {
      r.endedAt ??= p.now;
      r.reason ??= 'The meeting stopped before the apology was spoken.';
    }
    return { status: 'interrupted' };
  }
  const text = 'The keeper says, “I rang the alarm when no smoke had been reported. I am sorry.”';
  r.speech = { at: p.now, startedAt: a.startedAt, workFrom, text, heard: false };
  r.endedAt = p.now;
  s.queued[p.id] ??= [];
  s.queued[p.id]!.push({
    at: p.now,
    channel: 'told',
    kind: 'false-bell-apology',
    placeId: 'hearth',
    targetId: p.id,
    salience: 0.8,
    summary: text,
  });
  note(s, { at: p.now, kind: 'story', who: p.id, cell, weight: 2, text });
  return { summary: text };
}
export function observeAmends(s: WarrenState) {
  const r = s.bellAmends;
  if (!r) return;
  const p = person(s, r.who);
  if (r.speech && !r.speech.heard) r.speech.heard = !!p && heard(p, r.speech.text, r.speech.at);
  if (p && r.endedAt === undefined) {
    for (const event of p.events) {
      const d = event.data;
      if (
        d.kind !== 'suggestion-resolved' ||
        d.adviceId !== `keeper-resident:${r.at}` ||
        r.answers.some((a) => a.eventId === event.id)
      )
        continue;
      const decision = p.events.find(
        (e) => e.data.kind === 'decision' && e.data.decision.id === d.decisionId,
      );
      if (!decision || decision.data.kind !== 'decision') continue;
      const chosenId =
        decision.data.decision.chosenAffordanceId ??
        (decision.data.decision.review ? p.activity?.affordanceId : undefined);
      const chosen =
        s.hfOffers[p.id]?.offers.find((o) => o.id === chosenId) ??
        (p.activity?.affordanceId === chosenId ? p.activity?.affordance : undefined);
      const says = residentReply(p, event);
      r.answers.push({
        at: event.at / 60000,
        says,
        action: chosen?.action ?? 'none',
        label: chosen?.label ?? 'continue the current activity',
        verdict: d.resolution.verdict,
        eventId: event.id,
      });
      note(s, {
        at: event.at / 60000,
        kind: 'answer',
        who: p.id,
        weight: 1,
        text: `${p.name} chooses to ${chosen?.label ?? 'continue the current activity'}.${says ? ` ${says}` : ''}`,
      });
      if (chosenId !== id(r)) {
        r.endedAt = event.at / 60000;
        r.reason = `${p.name} chose another activity. The apology has not been heard.`;
      }
      break;
    }
  }
  if (r.endedAt === undefined && (!p || !quiet(s) || s.minute >= r.at + 180)) {
    r.endedAt = s.minute;
    r.reason = 'The time for this apology has ended without a completed hearing.';
  }
}
export function amendsWords(s: WarrenState): string {
  const r = s.bellAmends;
  if (!r) return '';
  return r.speech
    ? `${r.speech.text} ${r.speech.heard ? `${person(s, r.who)?.name ?? 'The listener'} heard the apology.` : `It is not yet clear whether ${person(s, r.who)?.name ?? 'the listener'} heard the apology.`} The earlier bell and its consequences remain. The apology has no reply yet.`
    : (r.reason ?? 'The apology is waiting. This person may keep working or resting.');
}
