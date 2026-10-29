/** A finite household visit and optional walk. HF owns participation. Warren authors
 * the situated keeper-facing words after actual work; the keeper is not an HF actor. */
import { cellsWithUse, K, SURF, USE, yOf } from './grid.ts';
import {
  type Activity,
  type Affordance,
  ageYears,
  type DecisionRecord,
  type Outcome,
  type Person,
  residentReply,
  type Suggestion,
  type SuggestionResolution,
} from './hf4.ts';
import { doorRequest, RESIDENT_VOICE } from './resident-requests.ts';
import { type Note, note, positionAt, type WarrenState } from './warren.ts';

type Ground = {
  at: number;
  cell: number;
  kind: number;
  use: number;
  chalk: number;
  shut: number;
  lamp: number;
  doorWork: number;
};
type Beginning = {
  at: number;
  cell: number;
  place: string;
  activity?: { action: string; label: string; affordanceId: string; startedAt: number; endsAt: number };
};
type Result = {
  authoredBy: 'Warren';
  at: number;
  startedAt: number;
  workFrom: number;
  cell: number;
  text: string;
  ground: Ground;
};
export interface NewcomerExchange {
  who: string;
  at: number;
  name: string;
  child: boolean;
  household: {
    id: string;
    name: string;
    came: number;
    members: string[];
    memberNames: { id: string; name?: string }[];
  };
  source: { arrival?: Note; dig?: Note; path?: Note };
  initial: Beginning;
  phase: 'visit' | 'choose' | 'walk' | 'done';
  answers: {
    at: number;
    eventId?: string;
    phase: 'visit' | 'walk';
    action: string;
    label: string;
    verdict?: SuggestionResolution['verdict'];
    says: string;
    reason?: string;
    narration?: string;
  }[];
  visit?: Result;
  walk?: { at: number; cell: number; initial: Beginning; ground: Ground; terminal?: Ground; result?: Result };
  interrupted?: { at: number; reason: string; startedAt?: number; workFrom?: number };
  endedAt?: number;
  withdrawn?: boolean;
}
const quiet = (s: WarrenState) =>
  !s.bell && !s.raids.some((r) => r.stage === 'smoke' || r.stage === 'riders');
const person = (s: WarrenState, who: string) =>
  s.people.find(
    (p) => p.id === who && p.body.alive && !s.flags[`released:${who}`] && !s.flags[`release-pending:${who}`],
  );
const exchange = (s: WarrenState, who: string) => s.newcomerExchanges?.find((r) => r.who === who);
function household(s: WarrenState, who: string) {
  // Only the generated household identity, never a matching personal name.
  return s.houses.find(
    (h) =>
      /^h[1-9]\d*$/.test(h.id) &&
      Number(h.id.slice(1)) <= s.arrivals &&
      h.came > 0 &&
      h.members.includes(who),
  );
}
function busy(s: WarrenState, who: string) {
  const id = s.people.find((p) => p.id === who)?.activity?.affordanceId;
  if (
    id &&
    ['resident-', 'contextual-refusal-', 'maryam-puzzle-', 'newcomer-'].some((prefix) =>
      id.startsWith(prefix),
    )
  )
    return true;
  return (
    [...Object.values(s.next?.requests ?? {}), doorRequest(s), s.refusalReply].some(
      (r) => r?.endedAt === undefined && r?.who === who,
    ) ||
    (who === 'maryam' && !!s.maryamPuzzle && s.maryamPuzzle.endedAt === undefined)
  );
}
function beginning(s: WarrenState, p: Person, at: number): Beginning {
  const a = p.activity;
  return {
    at,
    cell: positionAt(s, p.id, at),
    place: placeWords(s, positionAt(s, p.id, at)),
    ...(a
      ? {
          activity: {
            action: a.action,
            label: a.affordance.label,
            affordanceId: a.affordanceId,
            startedAt: a.startedAt,
            endsAt: a.endsAt,
          },
        }
      : {}),
  };
}
function ground(s: WarrenState, cell: number, at: number): Ground {
  const h = s.hill;
  const value = (field: number[]): number => {
    const n = field[cell];
    if (n === undefined) throw Error('The chosen place has no retained ground record.');
    return n;
  };
  return {
    at,
    cell,
    kind: value(h.kind),
    use: value(h.use),
    chalk: value(h.chalk),
    shut: value(h.shut),
    lamp: value(h.lamp),
    doorWork: value(h.doorWork),
  };
}
export function newcomerEligible(s: WarrenState, who: string): boolean {
  const p = person(s, who);
  return (
    s.edition === '0.7.0' &&
    !!p &&
    ageYears(p) >= 6 &&
    !p.body.asleep &&
    !!household(s, who) &&
    !exchange(s, who) &&
    quiet(s) &&
    !busy(s, who) &&
    cellsWithUse(s.hill, USE.hearth)[0] !== undefined
  );
}
export function requestNewcomer(s: WarrenState, who: string): boolean {
  if (!newcomerEligible(s, who)) return false;
  const p = person(s, who);
  const h = household(s, who);
  if (!p || !h) return false;
  const arrival = s.notes.findLast((n) => n.kind === 'arrival' && !!n.who && h.members.includes(n.who));
  const dig = s.notes.findLast((n) => n.kind === 'dig' && n.who === who);
  const path = s.notes.findLast((n) => n.kind === 'path' && n.who === who);
  const r: NewcomerExchange = {
    who,
    at: s.minute,
    name: p.name,
    child: ageYears(p) < 18,
    household: {
      id: h.id,
      name: h.name,
      came: h.came,
      members: [...h.members],
      memberNames: h.members.map((id) => {
        const p = s.people.find((p) => p.id === id);
        return { id, ...(p ? { name: p.name } : {}) };
      }),
    },
    source: {
      ...(arrival ? { arrival: { ...arrival } } : {}),
      ...(dig ? { dig: { ...dig } } : {}),
      ...(path ? { path: { ...path } } : {}),
    },
    initial: beginning(s, p, s.minute),
    phase: 'visit',
    answers: [],
  };
  s.newcomerExchanges ??= [];
  s.newcomerExchanges.push(r);
  note(s, {
    kind: 'story',
    who,
    weight: 1,
    text: `You invite ${p.name} to the hearth for a family visit. Travel and thirty minutes are needed. ${r.child ? 'This is a look with the keeper. No work is assigned to the child.' : 'The visit is optional. Current work and rest remain choices.'}`,
  });
  return true;
}
const openPlace = (s: WarrenState, cell: number) =>
  Number.isSafeInteger(cell) &&
  cell >= 0 &&
  cell < s.hill.kind.length &&
  !!s.hill.known[cell] &&
  s.hill.kind[cell] === K.open &&
  !s.hill.shut[cell];
export function walkWithNewcomer(s: WarrenState, who: string, cell: number): boolean {
  const r = exchange(s, who);
  const p = person(s, who);
  if (
    r?.phase !== 'choose' ||
    r.endedAt !== undefined ||
    !p ||
    p.body.asleep ||
    !quiet(s) ||
    busy(s, who) ||
    !openPlace(s, cell)
  )
    return false;
  r.walk = { at: s.minute, cell, initial: beginning(s, p, s.minute), ground: ground(s, cell, s.minute) };
  r.phase = 'walk';
  note(s, {
    kind: 'story',
    who,
    cell,
    weight: 1,
    text: `You invite ${p.name} to look at this open place with you. Travel and thirty minutes there are needed. This is the one optional walk for this visit.`,
  });
  return true;
}
export function withdrawNewcomer(s: WarrenState, who: string): boolean {
  const r = exchange(s, who);
  if (!r || r.endedAt !== undefined) return false;
  r.withdrawn = true;
  if (r.walk) r.walk.terminal = ground(s, r.walk.cell, s.minute);
  r.endedAt = s.minute;
  r.phase = 'done';
  note(s, {
    kind: 'story',
    who,
    weight: 1,
    text: 'You leave this invitation here. Earlier words, answers and time spent remain recorded.',
  });
  return true;
}
function close(s: WarrenState, r: NewcomerExchange, at: number, reason: string, activity?: Activity) {
  if (r.walk) r.walk.terminal = ground(s, r.walk.cell, at);
  r.interrupted = {
    at,
    reason,
    ...(activity
      ? { startedAt: activity.startedAt, workFrom: s.trips[r.who]?.workFrom ?? activity.startedAt }
      : {}),
  };
  r.endedAt = at;
  r.phase = 'done';
  note(s, { at, kind: 'story', who: r.who, weight: 1, text: reason });
}
/** Reconcile even a pending invitation whose person never makes another decision. */
export function observeNewcomers(s: WarrenState): void {
  for (const r of s.newcomerExchanges ?? []) {
    if (r.endedAt !== undefined) continue;
    const p = person(s, r.who);
    if (p && (r.phase === 'visit' || r.phase === 'walk')) {
      const phase = r.phase;
      const adviceId = `${RESIDENT_VOICE}:${r.walk?.at ?? r.at}`;
      for (const event of p.events) {
        const data = event.data;
        if (
          data.kind !== 'suggestion-resolved' ||
          data.adviceId !== adviceId ||
          r.answers.some((a) => a.eventId === event.id)
        )
          continue;
        const decision = p.events.find(
          (e) => e.data.kind === 'decision' && e.data.decision.id === data.decisionId,
        );
        if (!decision || decision.data.kind !== 'decision') continue;
        const chosenId =
          decision.data.decision.chosenAffordanceId ??
          (decision.data.decision.review ? p.activity?.affordanceId : undefined);
        const chosen =
          s.hfOffers[p.id]?.offers.find((o) => o.id === chosenId) ??
          (p.activity && p.activity.affordanceId === chosenId ? p.activity.affordance : undefined);
        const narration = residentReply(p, event);
        const at = event.at / 60000;
        r.answers.push({
          at,
          phase,
          eventId: event.id,
          action: chosen?.action ?? 'none',
          label: chosen?.label ?? 'continue the current activity',
          verdict: data.resolution.verdict,
          says: narration,
          reason: data.resolution.reason,
        });
        note(s, {
          at,
          kind: 'answer',
          who: p.id,
          weight: 1,
          text: `${p.name}'s actual response: ${narration}`,
        });
        if (chosenId !== offerId(r))
          close(s, r, at, `${p.name} chose another activity. This invitation has ended.`);
        break;
      }
    }
    if (r.endedAt !== undefined) continue;
    const reason = !p
      ? 'The invited person is no longer present. This exchange has ended.'
      : !quiet(s)
        ? 'The bell call or danger ended this exchange.'
        : p.body.asleep
          ? 'Sleep ended this exchange.'
          : undefined;
    if (reason)
      close(
        s,
        r,
        s.minute,
        reason,
        p?.activity?.affordanceId.startsWith('newcomer-') ? p.activity : undefined,
      );
  }
}
function pending(s: WarrenState, p: Person) {
  const r = exchange(s, p.id);
  return r && r.endedAt === undefined && (r.phase === 'visit' || r.phase === 'walk') ? r : undefined;
}
const offerId = (r: NewcomerExchange) => `newcomer-${r.phase}-${r.at}-${r.who}`;
export function newcomerSuggestion(s: WarrenState, p: Person): Suggestion | undefined {
  const r = pending(s, p);
  if (r && quiet(s) && person(s, p.id) && !p.body.asleep)
    return { voiceId: RESIDENT_VOICE, affordanceId: offerId(r), strength: 0.7, since: r.walk?.at ?? r.at };
}
export function newcomerOffers(
  s: WarrenState,
  p: Person,
): { offer: Affordance; cell: number; minutes: number }[] {
  const r = pending(s, p);
  if (!r || !quiet(s) || !person(s, p.id) || p.body.asleep) return [];
  const cell = r.phase === 'walk' ? r.walk?.cell : cellsWithUse(s.hill, USE.hearth)[0];
  if (cell === undefined || (r.phase === 'walk' && !openPlace(s, cell))) return [];
  return [
    {
      cell,
      minutes: 30,
      offer: {
        id: offerId(r),
        action: 'play',
        label:
          r.phase === 'visit'
            ? 'visit the hearth with the keeper'
            : 'look at the chosen open place with the keeper',
        duration: 0,
        effort: 0.05,
        advertises: { autonomy: 0.1, belonging: 0.2 },
        tags: ['social', 'leisure'],
        placeId: r.phase === 'visit' ? 'hearth' : 'below',
      },
    },
  ];
}
export function captureNewcomerAnswer(
  s: WarrenState,
  p: Person,
  offer: Affordance,
  record: DecisionRecord,
): void {
  const r = pending(s, p);
  if (!r) return;
  const answer =
    record.suggestion?.voiceId === RESIDENT_VOICE
      ? record.suggestion
      : record.suggestions?.find((a) => a.voiceId === RESIDENT_VOICE);
  // An assenting review can interrupt work, then HF makes a fresh choice with
  // no suggestion. That executable choice, including another activity, owns
  // the result; the earlier review is not continuing assent.
  if (!answer && offer.id !== offerId(r) && !r.answers.some((a) => a.phase === r.phase)) return;
  if (r.answers.some((a) => a.phase === r.phase && Math.abs(a.at - p.now) < 1e-6)) return;
  r.answers.push({
    at: p.now,
    phase: r.phase as 'visit' | 'walk',
    action: offer.action,
    label: offer.label,
    says: answer?.says ?? record.narration ?? '',
    ...(answer ? { verdict: answer.verdict, reason: answer.reason } : {}),
    ...(record.narration ? { narration: record.narration } : {}),
  });
  note(s, {
    at: p.now,
    kind: 'answer',
    who: p.id,
    weight: 1,
    text: `${p.name} chose to ${offer.label}.${answer?.says ? ` ${answer.says}` : ''}`,
  });
  if (offer.id !== offerId(r))
    close(s, r, p.now, `${p.name} chose another activity. This invitation has ended.`);
}
function familyWords(name: string): string {
  return name.replace(/ house$/, ' family');
}
function placeWords(s: WarrenState, cell: number): string {
  if (yOf(cell) < SURF) return 'by the houses';
  const use = s.hill.use[cell];
  return use === USE.hearth
    ? 'at the hearth'
    : use === USE.beds
      ? 'by the sleeping places'
      : use === USE.store
        ? 'by the store'
        : use === USE.well
          ? 'by the well'
          : use === USE.door
            ? 'beside the marked door'
            : 'in the passage';
}
function groundWords(g: Ground): string {
  if (g.kind !== K.open) return 'This place is no longer open.';
  const use =
    g.use === USE.beds
      ? 'Sleeping places are marked here.'
      : g.use === USE.store
        ? 'Storage is marked here.'
        : g.use === USE.hearth
          ? 'The hearth is here.'
          : g.use === USE.well
            ? 'The well is here.'
            : g.use === USE.door
              ? g.doorWork > 0
                ? 'A door is marked here, but it still needs work.'
                : `The door is ${g.shut ? 'shut' : 'open'}.`
              : 'This is open ground without furnishings.';
  return `${use}${g.lamp ? ' A lamp is here.' : ''}${g.chalk ? ' There is still a digging mark here.' : ''}`;
}
export function finishNewcomer(
  s: WarrenState,
  p: Person,
  activity: Activity,
  done: boolean,
): Partial<Outcome> | undefined {
  if (!activity.affordanceId.startsWith('newcomer-')) return;
  const r = pending(s, p);
  const workFrom = s.trips[p.id]?.workFrom ?? activity.startedAt;
  if (
    !r ||
    activity.action !== 'play' ||
    activity.affordanceId !== offerId(r) ||
    activity.startedAt < (r.walk?.at ?? r.at)
  )
    return { status: 'interrupted', summary: 'This newcomer invitation is no longer pending.' };
  const cell = r.phase === 'walk' ? r.walk?.cell : cellsWithUse(s.hill, USE.hearth)[0];
  const failure = !done
    ? 'The exchange stopped before the visit finished.'
    : !person(s, p.id)
      ? 'The invited person is no longer present.'
      : !quiet(s)
        ? 'The bell call or danger interrupted the exchange.'
        : p.body.asleep
          ? 'Sleep interrupted the exchange.'
          : cell === undefined || (r.phase === 'walk' && !openPlace(s, cell))
            ? 'The chosen place is no longer open.'
            : p.now - workFrom < 30 - 1e-6 || positionAt(s, p.id, p.now) !== cell
              ? 'The exchange did not receive thirty minutes at the chosen place.'
              : undefined;
  if (failure || cell === undefined) {
    close(s, r, p.now, failure ?? 'The chosen place is unavailable.', activity);
    return { status: 'interrupted', summary: failure ?? 'The chosen place is unavailable.' };
  }
  const current = ground(s, cell, p.now);
  if (r.walk) r.walk.terminal = current;
  const words =
    r.phase === 'visit'
      ? `I came with ${familyWords(r.household.name)}. ${r.initial.activity ? `When you called me over, I was busy with this: ${r.initial.activity.label}.` : 'You asked me to come to the hearth. Here I am.'} ${r.child ? 'Will you show me a place in the refuge? We can just look.' : 'Which place in the refuge would you like to show me?'} Or shall we leave our visit here?`
      : `When you chose the place, this is what was here. ${groundWords(r.walk!.ground)} This is what is here now. ${groundWords(current)} You can change its marks with your tools. I have finished looking with you.`;
  // Scripted dialogue follows the person's actual completed activity. It is not
  // quoted HF narration or a claim that an HF listener attended. Full attribution
  // and the independent decision receipts remain in Debug and the saved result.
  const text = `${p.name} says, “${words}”`;
  const result: Result = {
    authoredBy: 'Warren',
    at: p.now,
    startedAt: activity.startedAt,
    workFrom,
    cell,
    text,
    ground: current,
  };
  if (r.phase === 'visit') {
    r.visit = result;
    r.phase = 'choose';
  } else if (r.walk) {
    r.walk.result = result;
    r.phase = 'done';
    r.endedAt = p.now;
  }
  note(s, { at: p.now, kind: 'story', who: p.id, cell, weight: 2, text });
  return { summary: 'The newcomer visit finished.' };
}
/** Ordinary player reading. Exact IDs, times, provenance and receipts stay in Debug/export. */
export function newcomerWords(s: WarrenState, who: string): string {
  const r = exchange(s, who);
  if (!r) {
    const p = person(s, who);
    return p && household(s, who) && ageYears(p) < 6
      ? `${p.name} is too young for an independent visit with the keeper.`
      : 'Invite this family member to the hearth. They may choose something else. Allow time to walk there and half an hour for the visit. You can then offer to look at one place together.';
  }
  const answer = r.answers.at(-1);
  const names = r.household.memberNames.flatMap((p) => (p.name ? [p.name] : []));
  const earlier = r.source.dig ?? r.source.path ?? r.source.arrival;
  return [
    r.withdrawn
      ? 'You left the visit here.'
      : r.interrupted
        ? r.interrupted.reason
        : r.endedAt !== undefined
          ? 'The visit has ended.'
          : r.phase === 'choose'
            ? 'Choose a visible open place to look at together, or leave the visit here.'
            : `The invitation is waiting for ${r.name}.`,
    `${familyWords(r.household.name).replace(/^the /, 'The ')} came to the hill${names.length ? ` with ${names.join(', ')}` : ''}.`,
    earlier
      ? `Earlier on the hill: ${earlier.text}`
      : 'The earlier account of their arrival and work is missing.',
    answer ? `${r.name} chose to ${answer.label}.` : `${r.name} has not answered yet.`,
    r.visit?.text ?? '',
    r.walk
      ? `When you invited the walk, ${r.name} was ${r.walk.initial.place ?? 'at the meeting place'}. At the place you chose then: ${groundWords(r.walk.ground)}`
      : '',
    r.walk?.result?.text ?? '',
    r.walk?.terminal && !r.walk.result
      ? `When the invitation ended: ${groundWords(r.walk.terminal)} The walk did not finish.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}
