/** SCOPE: one prospective dry balance trial after Tariq's retained boat note.
 * HF owns participation, actual time and perception. The host owns a supplied
 * hull/load/support fixture, not buoyancy, boat skill, a gift or private history.
 * Both positions use the same weights; only the load's measured position changes.
 */
import { cellsWithUse, USE } from './grid.ts';
import {
  type Activity,
  type Affordance,
  type DecisionRecord,
  heard,
  type Outcome,
  type Person,
  residentReply,
  type Suggestion,
} from './hf4.ts';
import { doorRequest } from './resident-requests.ts';
import { receivedVisit } from './visits.ts';
import { note, positionAt, type WarrenState } from './warren.ts';

export type LoadPosition = 'middle' | 'edge';
export interface TariqTrial {
  at: number;
  source: { at: number; text: string };
  load: LoadPosition;
  fixture: { supportHalfWidthMm: 10; hullHalfWidthMm: 20; hullMass: 1; loadMass: 2; loadOffsetMm: 0 | 20 };
  answers: { at: number; says: string; action: string; label: string; verdict?: string; eventId?: string }[];
  result?: {
    at: number;
    startedAt: number;
    workFrom: number;
    cell: number;
    centerOfMassMm: number;
    state: 'upright' | 'tipped';
    text: string;
    observed: boolean;
  };
  interruption?: { at: number; startedAt: number; workFrom: number };
  endedAt?: number;
  reason?: string;
  withdrawn?: boolean;
}
const quiet = (s: WarrenState) =>
  !s.bell && !s.raids.some((r) => r.stage === 'smoke' || r.stage === 'riders');
const present = (s: WarrenState, p?: Person) =>
  p?.id === 'tariq' && p.body.alive && !s.flags['released:tariq'] && !s.flags['release-pending:tariq'];
const id = (r: TariqTrial) => `tariq-trial-${r.at}`;
export function trialUnavailable(s: WarrenState): string | undefined {
  if (s.edition !== '0.7.0') return 'This hill keeps its original invitations.';
  if (s.tariqTrial) return 'This boat trial has already been requested.';
  if (!receivedVisit(s, 'tariq')) return 'Tariq’s original boat note is not retained here.';
  if (s.bellAmends?.who === 'tariq' && s.bellAmends.endedAt === undefined)
    return 'Tariq already has another request.';
  if (!quiet(s)) return 'Wait until the bell call and danger have passed.';
  const p = s.people.find((p) => p.id === 'tariq');
  if (!present(s, p)) return 'Tariq is absent or has stopped refuge work.';
  if (
    [...Object.values(s.next?.requests ?? {}), doorRequest(s)].some(
      (r) => r?.who === 'tariq' && r.endedAt === undefined,
    ) ||
    p?.activity?.affordanceId.match(/^(resident-|bell-amends-)/)
  )
    return 'Tariq is still considering or finishing another request.';
}
export function requestTrial(s: WarrenState, load: LoadPosition): boolean {
  if (!['middle', 'edge'].includes(load) || trialUnavailable(s)) return false;
  const source = receivedVisit(s, 'tariq')!;
  s.tariqTrial = {
    at: s.minute,
    source: { at: source.at, text: source.text },
    load,
    fixture: {
      supportHalfWidthMm: 10,
      hullHalfWidthMm: 20,
      hullMass: 1,
      loadMass: 2,
      loadOffsetMm: load === 'middle' ? 0 : 20,
    },
    answers: [],
  };
  note(s, {
    kind: 'story',
    who: 'tariq',
    weight: 1,
    text: `You set aside a small wooden test boat, a clay load and a narrow support above a dry tray at the hearth. You ask Tariq to try the load ${load === 'middle' ? 'in the middle' : 'at the edge'}. He may choose work or rest instead. Travel and half an hour are needed. This tests balance on the support, not whether the boat floats.`,
  });
  return true;
}
export function withdrawTrial(s: WarrenState): boolean {
  const r = s.tariqTrial;
  if (!r || r.endedAt !== undefined) return false;
  r.withdrawn = true;
  r.endedAt = s.minute;
  r.reason = 'You stop waiting for the boat trial. Time already spent remains.';
  note(s, { kind: 'story', who: 'tariq', weight: 1, text: r.reason });
  return true;
}
function available(s: WarrenState, p: Person) {
  const r = s.tariqTrial;
  return (
    r &&
    r.endedAt === undefined &&
    !r.result &&
    present(s, p) &&
    quiet(s) &&
    !p.agenda.commitments.some(
      (c) => c.status === 'pending' && c.kind !== 'worship' && c.from <= p.now + 30 && c.until >= p.now,
    )
  );
}
export function trialSuggestion(s: WarrenState, p: Person): Suggestion | undefined {
  if (available(s, p))
    return {
      voiceId: 'keeper-resident',
      affordanceId: id(s.tariqTrial!),
      strength: 0.7,
      since: s.tariqTrial!.at,
    };
}
export function trialOffers(s: WarrenState, p: Person): Affordance[] {
  if (!available(s, p) || cellsWithUse(s.hill, USE.hearth)[0] === undefined) return [];
  return [
    {
      id: id(s.tariqTrial!),
      action: 'play',
      label: 'try the wooden boat on its narrow support',
      placeId: 'hearth',
      duration: 0,
      effort: 0.05,
      advertises: { autonomy: 0.1, belonging: 0.2 },
      tags: ['social', 'leisure'],
    },
  ];
}
export function captureTrialAnswer(s: WarrenState, p: Person, offer: Affordance, record: DecisionRecord) {
  const r = s.tariqTrial;
  if (!r || !available(s, p)) return;
  const answer =
    record.suggestion?.voiceId === 'keeper-resident'
      ? record.suggestion
      : record.suggestions?.find((a) => a.voiceId === 'keeper-resident');
  if (!answer && !r.answers.length) return;
  const row = {
    at: p.now,
    says: answer?.says ?? record.narration ?? '',
    action: offer.action,
    label: offer.label,
    ...(answer ? { verdict: answer.verdict } : {}),
  };
  r.answers.push(row);
  note(s, {
    at: p.now,
    kind: 'answer',
    who: p.id,
    weight: 1,
    text: `${p.name} chooses to ${row.label}.`,
  });
  // A review's assent does not replace the next executable choice.
  if (offer.id !== id(r)) {
    r.endedAt = p.now;
    r.reason = 'Tariq chose another activity. The trial ends without a balance result.';
  }
}
export function finishTrial(
  s: WarrenState,
  p: Person,
  a: Activity,
  done: boolean,
): Partial<Outcome> | undefined {
  if (!a.affordanceId.startsWith('tariq-trial-')) return;
  const r = s.tariqTrial,
    cell = cellsWithUse(s.hill, USE.hearth)[0],
    workFrom = s.trips[p.id]?.workFrom ?? a.startedAt;
  if (
    !r ||
    !available(s, p) ||
    a.affordanceId !== id(r) ||
    !done ||
    p.body.asleep ||
    cell === undefined ||
    positionAt(s, p.id, p.now) !== cell ||
    p.now - workFrom < 30
  ) {
    if (r && a.affordanceId === id(r)) {
      r.interruption = { at: p.now, startedAt: a.startedAt, workFrom };
      r.endedAt ??= p.now;
      r.reason ??=
        'The trial stopped before a full quiet half hour at the hearth. No balance result was obtained.';
    }
    return { status: 'interrupted' };
  }
  const f = r.fixture,
    centerOfMassMm = (f.loadMass * f.loadOffsetMm) / (f.hullMass + f.loadMass);
  const state = Math.abs(centerOfMassMm) <= f.supportHalfWidthMm ? 'upright' : 'tipped';
  const text =
    state === 'upright'
      ? 'Tariq sets the clay load in the middle. The wooden test boat stays upright on its narrow support above the dry tray.'
      : 'Tariq sets the clay load at the edge. The loaded side tips off the narrow support into the dry tray.';
  r.result = {
    at: p.now,
    startedAt: a.startedAt,
    workFrom,
    cell,
    centerOfMassMm,
    state,
    text,
    observed: false,
  };
  r.endedAt = p.now;
  s.queued[p.id] ??= [];
  s.queued[p.id]!.push({
    at: p.now,
    channel: 'saw',
    kind: 'tariq-trial-result',
    actorId: p.id,
    placeId: 'hearth',
    salience: 0.8,
    summary: text,
  });
  note(s, {
    at: p.now,
    kind: 'story',
    who: p.id,
    cell,
    weight: 2,
    text: `${text} The trial ends. The test pieces stay beside the hearth. Nothing has been put in drinking water.`,
  });
  return { summary: text };
}
export function observeTrial(s: WarrenState) {
  const r = s.tariqTrial,
    p = s.people.find((p) => p.id === 'tariq');
  if (!r) return;
  if (p && r.endedAt === undefined) {
    for (const event of p.events) {
      const data = event.data;
      if (
        data.kind !== 'suggestion-resolved' ||
        data.adviceId !== `keeper-resident:${r.at}` ||
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
        (p.activity?.affordanceId === chosenId ? p.activity?.affordance : undefined);
      const says = residentReply(p, event);
      r.answers.push({
        at: event.at / 60000,
        eventId: event.id,
        action: chosen?.action ?? 'none',
        label: chosen?.label ?? 'continue the current activity',
        says,
        verdict: data.resolution.verdict,
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
        r.reason = 'Tariq chose another activity. The trial ends without a balance result.';
      }
      break;
    }
  }
  if (r.result && !r.result.observed) r.result.observed = !!p && heard(p, r.result.text, r.result.at);
  if (r.endedAt === undefined && (!present(s, p) || !quiet(s) || s.minute >= r.at + 180)) {
    r.endedAt = s.minute;
    r.reason = 'The quiet time for this boat trial has ended. No balance result was obtained.';
    note(s, { kind: 'story', who: 'tariq', weight: 1, text: r.reason });
  }
}
export function trialWords(s: WarrenState): string {
  const r = s.tariqTrial;
  if (!r)
    return (
      trialUnavailable(s) ??
      'Ask Tariq to balance a small wooden test boat on a narrow support above a dry tray. Put the clay load in the middle or at the edge. Travel and half an hour are needed; he may choose something else. This is one dry balance trial, not a test of floating.'
    );
  if (r.result)
    return `${r.result.text} ${r.result.observed ? 'Tariq has seen the result.' : 'It is not yet clear whether Tariq has seen the result.'} The test pieces stay beside the hearth. Whether the boat floats remains untested.`;
  return r.reason ?? 'The boat trial is waiting. Tariq may keep working or resting. You can stop waiting.';
}
export function refuseTrialPublication(s: WarrenState) {
  if (s.tariqTrial || JSON.stringify(s.hf).includes('tariq-trial-'))
    throw Error(
      'This hill contains a wooden boat trial that shared history cannot carry. Keep the full local notebook. No shared record was written.',
    );
}
