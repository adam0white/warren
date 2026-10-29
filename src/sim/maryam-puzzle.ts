/** SCOPE: one prospective ring/string exercise after the exact retained offer.
 * This is an authored prop with two finite manipulations, not rope physics or a
 * proof that a knot is impossible. HF owns Maryam's participation, time and
 * perception. The host owns geometry and her explicitly authored reply. No input
 * means no state, offer, suggestion or percept. No gift, skill or duty is awarded. */

import { cellsWithUse, USE } from './grid.ts';
import type {
  Activity,
  Affordance,
  DecisionRecord,
  Outcome,
  Person,
  Suggestion,
  SuggestionResolution,
} from './hf4.ts';
import { heard } from './hf4.ts';
import { doorRequest } from './resident-requests.ts';
import { receivedVisit } from './visits.ts';
import { note, positionAt, type WarrenState } from './warren.ts';

export type Handling = 'loosen' | 'draw';
export interface MaryamPuzzle {
  at: number;
  source: { at: number; text: string };
  handling: Handling;
  fixture: { ring: 'threaded'; loop: 'closed'; crossing: 'loose' | 'slack' | 'cinched' };
  answers: {
    at: number;
    verdict: SuggestionResolution['verdict'];
    says: string;
    action: string;
    label: string;
  }[];
  result?: {
    startedAt: number;
    workFrom: number;
    at: number;
    cell: number;
    before: 'loose';
    after: 'slack' | 'cinched';
    text: string;
    reply: string;
    observed: boolean;
  };
  failures: { at: number; startedAt: number; workFrom: number; reason: string }[];
  endedAt?: number;
  withdrawn?: boolean;
}
// Reuse the registered leisure action and keeper request voice. The exact offer ID
// distinguishes this physical exercise without rewriting existing Run definitions.
const VOICE = 'keeper-resident';
const ACTION = 'play';
const quiet = (s: WarrenState) =>
  !s.bell && !s.raids.some((r) => r.stage === 'smoke' || r.stage === 'riders');
function present(s: WarrenState, p: Person, at: number) {
  return (
    p.id === 'maryam' &&
    p.body.alive &&
    !s.flags['released:maryam'] &&
    !s.flags['release-pending:maryam'] &&
    !p.agenda.commitments.some(
      (c) => c.status === 'pending' && c.kind !== 'worship' && c.from <= at + 30 && c.until >= at,
    )
  );
}
export function puzzleUnavailable(s: WarrenState): string | undefined {
  if (s.edition !== '0.6.0' && s.edition !== '0.7.0') return 'This earlier hill keeps its original visits.';
  if (s.maryamPuzzle) return 'This exercise has already been requested. Its time and result remain recorded.';
  if (!receivedVisit(s, 'maryam'))
    return 'Maryam’s original puzzle offer is not retained here. A visit mark cannot recover it.';
  if (
    [...Object.values(s.next?.requests ?? {}), doorRequest(s)].some(
      (r) => r?.who === 'maryam' && r.endedAt === undefined,
    )
  )
    return 'Maryam already has a pending request. Finish or withdraw it first.';
  if (s.bellAmends?.who === 'maryam' && s.bellAmends.endedAt === undefined)
    return 'Maryam already has another request.';
  if (!quiet(s)) return 'Wait until the bell call and danger have passed.';
  const p = s.people.find((p) => p.id === 'maryam');
  if (!p || !present(s, p, s.minute))
    return 'Maryam is absent, released or has a household duty due. The exercise cannot begin.';
  if (p.activity?.affordanceId.match(/^(resident-|bell-amends-)/))
    return 'Maryam is still finishing another request. Wait until that work ends.';
  return undefined;
}
export function requestPuzzle(s: WarrenState, handling: Handling): boolean {
  if (!['loosen', 'draw'].includes(handling) || puzzleUnavailable(s)) return false;
  const source = receivedVisit(s, 'maryam')!;
  s.maryamPuzzle = {
    at: s.minute,
    source: { at: source.at, text: source.text },
    handling,
    fixture: { ring: 'threaded', loop: 'closed', crossing: 'loose' },
    answers: [],
    failures: [],
  };
  note(s, {
    kind: 'story',
    who: 'maryam',
    weight: 1,
    text: `You ask Maryam to ${handling === 'loosen' ? 'loosen the crossing' : 'draw the crossing toward the ring'} in one exercise at the hearth. The proposed exercise uses a wooden ring threaded onto a closed string loop with one loose crossing. If she chooses to try, she keeps the prop. Travel and half an hour are needed if she chooses to try. Her work may come first.`,
  });
  return true;
}
export function withdrawPuzzle(s: WarrenState): boolean {
  const r = s.maryamPuzzle;
  if (!r || r.endedAt !== undefined) return false;
  r.withdrawn = true;
  r.endedAt = s.minute;
  note(s, {
    kind: 'story',
    who: 'maryam',
    weight: 1,
    text: 'You stop waiting for the ring and string exercise. Time already spent remains. No ring was freed or given away.',
  });
  return true;
}
function available(s: WarrenState, p: Person) {
  const r = s.maryamPuzzle;
  return (
    !!r &&
    r.endedAt === undefined &&
    (!p.activity || !['cook', 'store-check'].includes(p.activity.action) || p.activity.endsAt <= p.now) &&
    !r.result &&
    quiet(s) &&
    present(s, p, Math.max(s.minute, p.now))
  );
}
export function puzzleSuggestion(s: WarrenState, p: Person): Suggestion | undefined {
  if (available(s, p))
    return {
      voiceId: VOICE,
      affordanceId: `maryam-puzzle-${s.maryamPuzzle!.at}`,
      strength: 0.7,
      since: s.maryamPuzzle!.at,
    };
}
export function puzzleOffers(s: WarrenState, p: Person): Affordance[] {
  if (!available(s, p) || cellsWithUse(s.hill, USE.hearth)[0] === undefined) return [];
  return [
    {
      id: `maryam-puzzle-${s.maryamPuzzle!.at}`,
      action: ACTION,
      label:
        s.maryamPuzzle!.handling === 'loosen'
          ? 'loosen the string crossing at the hearth'
          : 'draw the string crossing toward the ring at the hearth',
      placeId: 'hearth',
      duration: 0,
      effort: 0.05,
      advertises: { autonomy: 0.1, belonging: 0.2 },
      tags: ['social', 'leisure'],
    },
  ];
}
export function capturePuzzleAnswer(s: WarrenState, p: Person, offer: Affordance, record: DecisionRecord) {
  const r = s.maryamPuzzle;
  if (!r || !available(s, p)) return;
  const answer =
    record.suggestion?.voiceId === VOICE
      ? record.suggestion
      : record.suggestions?.find((a) => a.voiceId === VOICE);
  if (!answer) return;
  const row = {
    at: p.now,
    verdict: answer.verdict,
    says: answer.says,
    action: offer.action,
    label: offer.label,
  };
  const prev = r.answers.at(-1);
  if (prev?.verdict === row.verdict && prev.says === row.says && prev.action === row.action) return;
  r.answers.push(row);
  note(s, {
    at: p.now,
    kind: 'answer',
    who: p.id,
    weight: 1,
    text: `Maryam answers the exercise request: “${row.says}” She chooses to ${row.label}.`,
  });
}
export function finishPuzzle(
  s: WarrenState,
  p: Person,
  activity: Activity,
  done: boolean,
): Partial<Outcome> | undefined {
  if (activity.action !== ACTION || !activity.affordanceId.startsWith('maryam-puzzle-')) return;
  const r = s.maryamPuzzle;
  const workFrom = s.trips[p.id]?.workFrom ?? activity.startedAt;
  const hearth = cellsWithUse(s.hill, USE.hearth)[0];
  if (
    !r ||
    !available(s, p) ||
    !done ||
    p.body.asleep ||
    hearth === undefined ||
    positionAt(s, p.id, p.now) !== hearth ||
    puzzleOffers(s, p)[0]?.id !== activity.affordanceId ||
    p.now - workFrom < 30
  ) {
    if (r && activity.affordanceId === `maryam-puzzle-${r.at}`) {
      const reason =
        'The exercise stopped before a full quiet half hour at the hearth. The ring remains threaded and the crossing has not changed.';
      r.failures.push({ at: p.now, startedAt: activity.startedAt, workFrom, reason });
      r.endedAt ??= p.now;
      note(s, { at: p.now, kind: 'story', who: p.id, weight: 1, text: reason });
    }
    return { status: 'interrupted' };
  }
  const after = r.handling === 'loosen' ? 'slack' : 'cinched';
  r.fixture.crossing = after;
  const text =
    after === 'slack'
      ? 'Maryam opens the crossing into a slack bend beside the wooden ring. The ring stays threaded on the closed string loop.'
      : 'Maryam draws the crossing against the wooden ring. It tightens there. The ring stays threaded on the closed string loop.';
  const reply =
    after === 'slack'
      ? 'There is room to move it now. I have not freed the ring.'
      : 'That has tightened it. I would undo that pull before trying again.';
  r.result = {
    startedAt: activity.startedAt,
    workFrom,
    at: p.now,
    cell: hearth,
    before: 'loose',
    after,
    text,
    reply,
    observed: false,
  };
  r.endedAt = p.now;
  s.queued[p.id] ??= [];
  s.queued[p.id]!.push({
    at: p.now,
    channel: 'saw',
    kind: 'maryam-puzzle-result',
    actorId: p.id,
    placeId: 'hearth',
    salience: 0.8,
    summary: text,
  });
  note(s, {
    at: p.now,
    kind: 'story',
    who: p.id,
    cell: hearth,
    weight: 2,
    text: `${text} Maryam says, “${reply}” The attempt has ended. She keeps the ring and string.`,
  });
  return { summary: text };
}
export function observePuzzle(s: WarrenState) {
  const r = s.maryamPuzzle?.result;
  const p = s.people.find((p) => p.id === 'maryam');
  if (r && !r.observed) r.observed = !!p && heard(p, r.text, r.at);
}
export function puzzleWords(s: WarrenState): string {
  const r = s.maryamPuzzle;
  if (!r)
    return (
      puzzleUnavailable(s) ??
      'Ask to try one ring and string exercise. Maryam may choose work or rest instead. Each attempt needs travel and half an hour. This exercise uses her wooden ring threaded onto a closed string loop with one loose crossing. Loosening leaves slack; drawing pulls the crossing tight against the ring. Neither frees it. One attempt is offered here, with no reset or second attempt. The ring is not a gift.'
    );
  const answer = r.answers.at(-1);
  return `${r.withdrawn ? 'You stopped waiting.' : r.result ? 'The attempt ended. The ring remains threaded.' : r.endedAt !== undefined ? 'The exercise was interrupted.' : 'The exercise is pending. Maryam may choose her current work or rest.'} ${answer ? `Latest answer: “${answer.says}” Chosen activity: ${answer.label}.` : 'Maryam has not answered this request yet.'} ${r.result ? `${r.result.text} Maryam says, “${r.result.reply}” ${r.result.observed ? 'Maryam observed the physical result.' : 'No observation of the result is recorded yet.'} She keeps the ring and string.` : ''} ${r.failures.at(-1)?.reason ?? ''}`.trim();
}
/** Official portable/source contracts do not represent this prop or its exercise. */
export function refusePuzzlePublication(s: WarrenState): void {
  if (s.maryamPuzzle)
    throw Error(
      'This hill contains a ring and string exercise that shared history cannot carry. Keep the full local notebook. No shared record was written.',
    );
}
