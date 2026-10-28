import { cellsWithUse, neighbours, paths, USE } from './grid.ts';
/**
 * SCOPE: three finite keeper requests: talk about rest, talk after the mutually heard
 * loose-cut disagreement, and test one finished door during quiet time. Travel and work
 * belong to the hill; HF owns suggestions, choices, conversation and received advice.
 * A request neither diagnoses a person nor compels them. A talk needs an awake listener
 * at the hearth. A door test really shuts a passage, then offers reopening separately.
 * This is authored encounter context, not a general social model or reconciliation rule.
 */
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
import { airAndLight, note, positionAt, touch, type WarrenState } from './warren.ts';

type Reply = {
  at: number;
  action: string;
  label: string;
  verdict: SuggestionResolution['verdict'];
  says: string;
  reason: string;
};
type Work = { at: number; startedAt: number; workFrom: number };
export interface TalkRequest {
  who: string;
  listener: string;
  at: number;
  answers: Reply[];
  speech?: Work & { text: string };
  heard: boolean;
  endedAt?: number;
  withdrawn?: boolean;
}
export interface DoorRequest {
  who: string;
  cell: number;
  at: number;
  phase: 'close' | 'open' | 'done';
  answers: Reply[];
  results: (Work & { shut: boolean })[];
  opened?: { at: number; who?: string; startedAt?: number; workFrom?: number };
  endedAt?: number;
  withdrawn?: boolean;
}
export interface ResidentRequests {
  rest?: TalkRequest;
  disagreement?: TalkRequest;
  door?: DoorRequest;
}
export const doorRequest = (s: WarrenState) => s.doorTrials?.at(-1) ?? s.next?.requests?.door;
const requestsEnabled = (s: WarrenState) => residualEnabled(s) || !!s.doorTrials;
export const RESIDENT_VOICE = 'keeper-resident';
export const residualEnabled = (s: WarrenState) => s.next?.config === 'warren-rest/1';
const quiet = (s: WarrenState) =>
  !s.bell && !s.raids.some((r) => r.stage === 'smoke' || r.stage === 'riders');
const adult = (s: WarrenState, id: string) =>
  s.people.find((p) => p.id === id && p.body.alive && ageYears(p) >= 18 && !s.flags[`released:${id}`]);
function active(s: WarrenState, id: string) {
  // A withdrawn request does not turn its still-running work into a new request.
  if (s.people.find((p) => p.id === id)?.activity?.affordanceId.startsWith('resident-')) return true;
  const r = s.next?.requests;
  return [r?.rest, r?.disagreement, doorRequest(s)].some((x) => x?.who === id && x.endedAt === undefined);
}
export function requestTalk(s: WarrenState, who: string, kind: 'rest' | 'disagreement'): boolean {
  if (
    !residualEnabled(s) ||
    !adult(s, who) ||
    active(s, who) ||
    !quiet(s) ||
    (s.next?.requests?.[kind] && s.next.requests[kind].endedAt === undefined)
  )
    return false;
  const d = s.next?.discussion;
  if (
    kind === 'disagreement' &&
    (!d?.exchange || !d.statements.every((r) => r.heard) || !d.statements.some((r) => r.speaker === who))
  )
    return false;
  const listener =
    kind === 'disagreement'
      ? d?.statements.find((r) => r.speaker === who)?.listener
      : (s.people.find(
          (p) =>
            p.id !== who &&
            adult(s, p.id) &&
            positionAt(s, p.id, s.minute) === cellsWithUse(s.hill, USE.hearth)[0],
        )?.id ?? s.people.find((p) => p.id !== who && adult(s, p.id))?.id);
  if (!listener || !adult(s, listener)) return false;
  s.next!.requests ??= {};
  const requests = s.next!.requests;
  requests[kind] = { who, listener, at: s.minute, answers: [], heard: false };
  note(s, {
    kind: 'story',
    who,
    weight: 1,
    text:
      kind === 'rest'
        ? `You ask ${adult(s, who)!.name} to talk about taking a break at the hearth. An awake companion must be there. Work and rest remain choices.`
        : `You invite ${adult(s, who)!.name} to talk again with ${adult(s, listener)!.name} about their heard disagreement. The chalk stays as it is. Neither person has agreed to change their position.`,
  });
  return true;
}
function canRequestDoor(s: WarrenState, who: string, cell: number): boolean {
  if (
    !adult(s, who) ||
    active(s, who) ||
    !quiet(s) ||
    !Number.isInteger(cell) ||
    s.hill.use[cell] !== USE.door ||
    s.hill.doorWork[cell] ||
    s.hill.shut[cell]
  )
    return false;
  const { lit } = airAndLight(s);
  if ((paths(s.hill, s.pos[who] ?? -1, lit, s.linked).dist[cell] ?? Infinity) > 40) return false;
  const current = doorRequest(s);
  return !current || current.endedAt !== undefined;
}
function noteDoorRequest(s: WarrenState, who: string, cell: number) {
  note(s, {
    kind: 'story',
    who,
    cell,
    weight: 1,
    text: `You ask ${adult(s, who)!.name} to test this finished door, then reopen it. Each roll takes work. A shut door blocks the passage until someone chooses to reopen it. No bell was rung.`,
  });
}
export function requestDoor(s: WarrenState, who: string, cell: number): boolean {
  if (!residualEnabled(s) || !canRequestDoor(s, who, cell)) return false;
  s.next!.requests ??= {};
  s.next!.requests.door = { who, cell, at: s.minute, phase: 'close', answers: [], results: [] };
  noteDoorRequest(s, who, cell);
  return true;
}
/** Public trials reuse physical work and HF choice, without changing an older edition.
 * Each accepted input appends a history receipt. No new input means no new state. */
export function requestDoorTrial(s: WarrenState, who: string, cell: number): boolean {
  if (residualEnabled(s) || !canRequestDoor(s, who, cell)) return false;
  s.doorTrials ??= [];
  s.doorTrials.push({ who, cell, at: s.minute, phase: 'close', answers: [], results: [] });
  noteDoorRequest(s, who, cell);
  return true;
}
export function withdrawDoorTrial(s: WarrenState): boolean {
  const r = s.doorTrials?.at(-1);
  if (!r || r.endedAt !== undefined) return false;
  r.endedAt = s.minute;
  r.withdrawn = true;
  note(s, {
    kind: 'story',
    who: r.who,
    cell: r.cell,
    weight: 1,
    text: 'You withdraw the door test. It did not finish. Time spent, earlier answers and the actual door state remain.',
  });
  return true;
}
export function withdrawRequest(s: WarrenState, kind: keyof ResidentRequests): boolean {
  const r = s.next?.requests?.[kind];
  if (!residualEnabled(s) || !r || r.endedAt !== undefined) return false;
  r.endedAt = s.minute;
  r.withdrawn = true;
  note(s, {
    kind: 'story',
    who: r.who,
    weight: 1,
    text: 'You withdraw this request. Time already spent is not restored. Earlier words and the actual door state remain.',
  });
  return true;
}
function talkFor(s: WarrenState, p: Person): [TalkRequest, 'rest' | 'disagreement'] | undefined {
  const r = s.next?.requests;
  for (const kind of ['rest', 'disagreement'] as const) {
    const talk = r?.[kind];
    if (talk?.who === p.id && talk.endedAt === undefined) return [talk, kind];
  }
}
/** Settle only a pending opening. Ordinary work supplies its own actor and timing. */
function reconcileOpenDoor(s: WarrenState, opened?: DoorRequest['opened']): void {
  if (!requestsEnabled(s)) return;
  const d = doorRequest(s);
  if (!d || d.endedAt !== undefined || d.phase !== 'open' || s.hill.shut[d.cell]) return;
  if (s.doorTrials?.includes(d) && !opened) return;
  d.opened = opened ?? { at: s.minute };
  d.phase = 'done';
  d.endedAt = d.opened.at;
  note(s, {
    at: d.opened.at,
    kind: 'story',
    who: opened?.who,
    cell: d.cell,
    weight: 1,
    text: opened?.who
      ? `${s.people.find((p) => p.id === opened.who)!.name} reopened the tested door during ordinary work. The passage is open again.`
      : 'The tested door is already open. No reopening by the requested adult was recorded.',
  });
}
export function recordOrdinaryReopening(s: WarrenState, p: Person, activity: Activity): void {
  const d = doorRequest(s);
  if (!d || Number(activity.targetId) !== d.cell) return;
  if (
    s.doorTrials?.includes(d) &&
    (!quiet(s) ||
      !adult(s, p.id) ||
      p.body.asleep ||
      s.hill.use[d.cell] !== USE.door ||
      s.hill.doorWork[d.cell] ||
      p.now - (s.trips[p.id]?.workFrom ?? activity.startedAt) < 8 ||
      !neighbours(d.cell).includes(positionAt(s, p.id, p.now)))
  )
    return;
  reconcileOpenDoor(s, {
    at: p.now,
    who: p.id,
    startedAt: activity.startedAt,
    workFrom: s.trips[p.id]?.workFrom ?? activity.startedAt,
  });
}
export function residentSuggestion(s: WarrenState, p: Person): Suggestion | undefined {
  reconcileOpenDoor(s);
  if (!requestsEnabled(s) || !quiet(s)) return;
  const talk = talkFor(s, p);
  if (talk) {
    const [r, kind] = talk;
    if (r.speech && !r.heard) return;
    return {
      voiceId: RESIDENT_VOICE,
      action: r.heard ? 'rest' : `talk-${kind}`,
      strength: 0.7,
      since: r.speech?.at ?? r.at,
    };
  }
  const door = doorRequest(s);
  if (door?.who === p.id && door.endedAt === undefined)
    return {
      voiceId: RESIDENT_VOICE,
      action: `test-${door.phase}`,
      strength: 0.7,
      since: door.results.at(-1)?.at ?? door.at,
    };
}
/** Offers leave routing to the hill's existing plan/duration calculation. */
export function residentOffers(
  s: WarrenState,
  p: Person,
): { offer: Affordance; cell: number; minutes: number }[] {
  reconcileOpenDoor(s);
  if (!requestsEnabled(s) || !quiet(s)) return [];
  const talk = talkFor(s, p);
  if (talk && !talk[0].speech) {
    const [r, kind] = talk;
    const hearth = cellsWithUse(s.hill, USE.hearth)[0];
    if (hearth === undefined || !adult(s, r.listener)) return [];
    return [
      {
        cell: hearth,
        minutes: 30,
        offer: {
          id: `resident-${kind}-${r.at}`,
          action: `talk-${kind}`,
          label:
            kind === 'rest'
              ? 'talk about taking a break at the hearth'
              : 'talk again about the loose-cut disagreement',
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
  const d = doorRequest(s);
  if (
    !d ||
    (s.doorTrials?.includes(d) && !adult(s, p.id)) ||
    d.who !== p.id ||
    d.endedAt !== undefined ||
    d.phase === 'done' ||
    s.hill.use[d.cell] !== USE.door ||
    s.hill.doorWork[d.cell]
  )
    return [];
  const { lit } = airAndLight(s);
  const reach = paths(s.hill, s.pos[p.id] ?? -1, lit, s.linked);
  const destination =
    d.phase === 'open' && s.hill.shut[d.cell]
      ? neighbours(d.cell).find((c) => Number.isFinite(reach.dist[c] ?? Infinity))
      : d.cell;
  if (destination === undefined) return [];
  return [
    {
      cell: destination,
      minutes: 8,
      offer: {
        id: `resident-door-${d.phase}-${d.at}`,
        action: `test-${d.phase}`,
        label: d.phase === 'close' ? 'roll the door shut for a test' : 'reopen the tested door',
        targetId: String(d.cell),
        placeId: 'door',
        duration: 0,
        effort: 0.6,
        advertises: { competence: 0.2, safety: 0.1 },
        tags: ['work'],
      },
    },
  ];
}
export function captureResidentAnswer(
  s: WarrenState,
  p: Person,
  offer: Affordance,
  record: DecisionRecord,
): void {
  if (!requestsEnabled(s)) return;
  const result =
    record.suggestion?.voiceId === RESIDENT_VOICE
      ? record.suggestion
      : record.suggestions?.find((r) => r.voiceId === RESIDENT_VOICE);
  if (!result) return;
  const r = talkFor(s, p)?.[0] ?? (doorRequest(s)?.who === p.id ? doorRequest(s) : undefined);
  if (!r || r.endedAt !== undefined) return;
  const previous = r.answers.at(-1);
  if (
    previous?.verdict === result.verdict &&
    previous.says === result.says &&
    previous.action === offer.action
  )
    return;
  r.answers.push({
    at: p.now,
    action: offer.action,
    label: offer.label,
    verdict: result.verdict,
    says: result.says,
    reason: result.reason,
  });
  note(s, {
    at: p.now,
    kind: 'answer',
    who: p.id,
    weight: 1,
    text: `${p.name} answers your request: “${result.says}” The chosen activity is to ${offer.label}.`,
  });
}
export function finishResidentWork(
  s: WarrenState,
  p: Person,
  activity: Activity,
  done: boolean,
): Partial<Outcome> | undefined {
  if (!requestsEnabled(s)) return;
  const talk = talkFor(s, p);
  if (activity.action === 'talk-rest' || activity.action === 'talk-disagreement') {
    if (!talk || talk[0].speech || !done || !quiet(s)) return { status: 'interrupted' };
    const [r, kind] = talk;
    const q = adult(s, r.listener),
      hearth = cellsWithUse(s.hill, USE.hearth)[0];
    if (
      !q ||
      q.body.asleep ||
      p.body.asleep ||
      positionAt(s, p.id, p.now) !== hearth ||
      positionAt(s, q.id, p.now) !== hearth
    )
      return {
        status: 'interrupted',
        summary: 'The conversation did not reach an awake listener at the hearth.',
      };
    const text =
      kind === 'rest'
        ? `${p.name} tells ${q.name}, “The keeper asked about taking a break. We can rest here instead of working.”`
        : `${p.name} tells ${q.name}, “We disagree about that loose cut. We can take a break and talk here. Our words do not change the marked stone.”`;
    r.speech = {
      at: p.now,
      startedAt: activity.startedAt,
      workFrom: s.trips[p.id]?.workFrom ?? activity.startedAt,
      text,
    };
    const queued = s.queued[q.id] ?? [];
    s.queued[q.id] = queued;
    queued.push({
      at: p.now,
      channel: 'told',
      kind: `resident-${kind}`,
      actorId: p.id,
      targetId: q.id,
      placeId: 'hearth',
      salience: 0.8,
      summary: text,
      advice: [{ action: 'rest', strength: 0.7 }],
    });
    note(s, { at: p.now, kind: 'story', who: p.id, weight: 1, text });
    return { summary: text, needs: { belonging: 0.1 } };
  }
  if (talk?.[0].heard && activity.action === 'rest' && done) {
    talk[0].endedAt = p.now;
    note(s, {
      at: p.now,
      kind: 'story',
      who: p.id,
      weight: 1,
      text: `${p.name} finished a rest after the conversation. The work on the hill waited during this rest.`,
    });
  }
  if (!['test-close', 'test-open'].includes(activity.action)) return;
  reconcileOpenDoor(s);
  const d = doorRequest(s);
  if (
    !d ||
    (s.doorTrials?.includes(d) && !adult(s, p.id)) ||
    d.who !== p.id ||
    d.endedAt !== undefined ||
    Number(activity.targetId) !== d.cell ||
    activity.affordanceId !== `resident-door-${d.phase}-${d.at}` ||
    !!s.hill.shut[d.cell] !== (d.phase === 'open') ||
    !done ||
    !quiet(s) ||
    s.hill.use[d.cell] !== USE.door ||
    s.hill.doorWork[d.cell] ||
    (positionAt(s, p.id, p.now) !== d.cell &&
      !(d.phase === 'open' && neighbours(d.cell).includes(positionAt(s, p.id, p.now)))) ||
    activity.action !== `test-${d.phase}`
  )
    return { status: 'interrupted' };
  if (
    s.doorTrials?.includes(d) &&
    (!adult(s, p.id) || p.body.asleep || p.now - (s.trips[p.id]?.workFrom ?? activity.startedAt) < 8)
  )
    return { status: 'interrupted' };
  const shut = d.phase === 'close';
  s.hill.shut[d.cell] = shut ? 1 : 0;
  touch(s);
  d.results.push({
    at: p.now,
    startedAt: activity.startedAt,
    workFrom: s.trips[p.id]?.workFrom ?? activity.startedAt,
    shut,
  });
  d.phase = shut ? 'open' : 'done';
  if (!shut) d.endedAt = p.now;
  const text = shut
    ? `${p.name} rolled the door shut for the test. The passage is blocked. Reopening is still a separate choice.`
    : `${p.name} reopened the tested door. The passage is open again.`;
  note(s, { at: p.now, kind: 'story', who: p.id, cell: d.cell, weight: 1, text });
  return { summary: text, needs: { competence: 0.05 } };
}
export function observeResidentTalk(s: WarrenState, reconcile = true): void {
  if (reconcile) reconcileOpenDoor(s);
  if (!requestsEnabled(s)) return;
  for (const r of [s.next?.requests?.rest, s.next?.requests?.disagreement]) {
    if (!r?.speech || r.heard) continue;
    const speech = r.speech;
    r.heard = !!((p) => !!p && heard(p, speech.text, speech.at))(s.people.find((p) => p.id === r.listener));
  }
}
export function requestWords(s: WarrenState, kind: keyof ResidentRequests): string {
  const r = kind === 'door' ? doorRequest(s) : s.next?.requests?.[kind];
  if (!r)
    return kind === 'door'
      ? 'A test really shuts the door. Reopening takes another choice and more work.'
      : 'A conversation needs travel, time and an awake companion at the hearth. The person may work or rest instead.';
  const reply = r.answers.at(-1);
  const speech = 'speech' in r ? r.speech : undefined;
  const lastRoll = 'results' in r ? r.results.at(-1) : undefined;
  const opened = 'opened' in r ? r.opened : undefined;
  const result = opened
    ? opened.who
      ? `${s.people.find((p) => p.id === opened.who)?.name ?? 'Another adult'} reopened the tested door during ordinary work.`
      : 'The tested door is already open. No reopening by the requested adult was recorded.'
    : lastRoll
      ? `${s.people.find((p) => p.id === r.who)?.name ?? 'The requested adult'} ${lastRoll.shut ? 'shut the door for the test. Reopening still needs a real choice.' : 'reopened the tested door.'}`
      : '';
  return `${r.withdrawn ? 'The request was withdrawn.' : r.endedAt !== undefined ? 'The requested work finished.' : 'The request is still pending.'} ${reply ? `Latest answer: “${reply.says}” Chosen activity: ${reply.label}.` : 'No answer has been recorded yet.'} ${speech ? speech.text : ''} ${result} ${'heard' in r && speech ? (r.heard ? 'The companion heard these words.' : 'Hearing has not been recorded yet.') : ''}`.trim();
}
