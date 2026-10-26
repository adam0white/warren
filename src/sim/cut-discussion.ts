/**
 * SCOPE: one authored encounter about an actual marked, known loose cut. Yusuf and Meryem
 * may spend real travel/work time to urge caution or continued digging. HF chooses among
 * these and ordinary work/rest. The listener must actually attend the spoken percept before
 * an answer can count. Only opposed, mutually heard statements establish disagreement.
 * This is hill encounter logic, not a generic social model, motive reader or anger simulator.
 * In next/2, elicitation records positions as claims, not instructions to repeat the answer.
 * next/1 retains its scoped standing advice for exact historical replay. No estimate changes.
 * No statement moves grain, completes excavation, creates a promise or overrides the chalk.
 */
import type { Activity, Affordance, Outcome, Person, Suggestion } from '@adam0white/human-framework';
import { interruptPerson } from '@adam0white/human-framework';
import { cellsWithUse, faces, K, USE } from './grid.ts';
import { communityOf, note, positionAt, type WarrenState } from './warren.ts';

export interface CutDiscussion {
  face: number;
  requestedAt: number;
  statements: {
    speaker: string;
    listener: string;
    stance: 'pause' | 'continue';
    startedAt: number;
    workFrom: number;
    offerId: string;
    at: number;
    text: string;
    heard: boolean;
  }[];
  exchange: boolean;
  endedAt?: number;
}
const ids = ['yusuf', 'meryem'];
export function markedLooseCut(s: WarrenState): number {
  return faces(s.hill).find((f) => s.hill.kind[f.face] === K.loose && !!s.hill.known[f.face])?.face ?? -1;
}
export function inviteCutDiscussion(s: WarrenState): boolean {
  const face = markedLooseCut(s);
  if (
    !s.next ||
    face < 0 ||
    s.next.discussion ||
    s.raids.some((r) => r.stage === 'smoke' || r.stage === 'riders') ||
    ids.some((id) => !s.people.find((p) => p.id === id)?.body.alive)
  )
    return false;
  s.next.discussion = { face, requestedAt: s.minute, statements: [], exchange: false };
  for (const id of ids) {
    const p = s.people.find((p) => p.id === id);
    if (!p) return false;
    interruptPerson(communityOf(s), p, Math.max(p.now, s.minute), 'loose-cut-invitation');
  }
  note(s, {
    kind: 'story',
    cell: face,
    text: 'You invite Yusuf Usta and Meryem to discuss the marked loose stone at the hearth. They may keep working or resting instead.',
    weight: 1,
  });
  return true;
}
function canSpeak(s: WarrenState, p: Person): boolean {
  const d = s.next?.discussion;
  if (
    !d ||
    d.endedAt !== undefined ||
    !ids.includes(p.id) ||
    d.statements.some((row) => row.speaker === p.id) ||
    s.hill.kind[d.face] !== K.loose ||
    !s.hill.chalk[d.face] ||
    s.raids.some((r) => r.stage === 'smoke' || r.stage === 'riders')
  )
    return false;
  // An answer follows attended testimony, not private access to the other person's choice.
  const previous = d.statements[0];
  if (previous && !previous.heard) return false;
  return true;
}
export function cutSuggestion(s: WarrenState, p: Person): Suggestion | undefined {
  const discussion = s.next?.discussion;
  return discussion && canSpeak(s, p)
    ? { voiceId: 'keeper-cut', action: 'discuss-cut', strength: 0.7, since: discussion.requestedAt }
    : undefined;
}
export function cutOffers(s: WarrenState, p: Person): Affordance[] {
  const d = s.next?.discussion;
  if (!d || !canSpeak(s, p)) return [];
  const listener = ids.find((id) => id !== p.id);
  if (!listener) return [];
  return [
    {
      id: `cut-pause-${d.face}`,
      action: 'discuss-cut',
      label: 'ask to leave the loose cut alone',
      duration: 0,
      effort: 0.05,
      advertises: { safety: 0.4, belonging: 0.15 },
      tags: ['social'],
      targetId: listener,
      placeId: 'hearth',
    },
    {
      id: 'cut-continue',
      action: 'discuss-cut',
      label: 'ask to keep digging the marked room despite the loose stone',
      duration: 0,
      effort: 0.05,
      advertises: { competence: 0.3, meaning: 0.15, belonging: 0.15 },
      tags: ['social'],
      targetId: listener,
      placeId: 'hearth',
    },
  ];
}
export function finishCutStatement(
  s: WarrenState,
  p: Person,
  activity: Activity,
  done: boolean,
): Partial<Outcome> | undefined {
  if (activity.action !== 'discuss-cut') return undefined;
  const d = s.next?.discussion;
  const q = s.people.find((q) => q.id === activity.targetId);
  const hearth = cellsWithUse(s.hill, USE.hearth)[0];
  if (
    !done ||
    !d ||
    !q ||
    !canSpeak(s, p) ||
    (d.statements[0] && activity.startedAt < d.statements[0].at) ||
    !q.body.alive ||
    q.body.asleep ||
    positionAt(s, p.id, p.now) !== hearth ||
    positionAt(s, q.id, p.now) !== hearth
  )
    return {
      status: 'interrupted',
      summary: 'The loose-stone discussion did not reach an awake listener at the hearth.',
    };
  const stance = activity.affordanceId === `cut-pause-${d.face}` ? 'pause' : 'continue';
  const eliciting = s.next?.config === 'warren-next/2' || s.next?.config === 'warren-rest/1';
  const text = eliciting
    ? stance === 'pause'
      ? `${p.name} tells ${q.name}, “I think that loose cut should wait. Stone can fall on the person digging.”`
      : `${p.name} tells ${q.name}, “I think we should keep digging the marked room. We need the space, even with loose stone.”`
    : stance === 'pause'
      ? `${p.name} tells ${q.name}, “Leave that loose cut alone. Stone can fall on the person digging.”`
      : `${p.name} tells ${q.name}, “Keep digging the marked room. We need the space, even with loose stone.”`;
  d.statements.push({
    speaker: p.id,
    listener: q.id,
    stance,
    at: p.now,
    text,
    heard: false,
    startedAt: activity.startedAt,
    workFrom: s.trips[p.id]?.workFrom ?? activity.startedAt,
    offerId: activity.affordanceId,
  });
  const queued = s.queued[q.id] ?? [];
  s.queued[q.id] = queued;
  queued.push({
    at: p.now,
    channel: 'told',
    kind: 'loose-cut-discussion',
    actorId: p.id,
    targetId: q.id,
    placeId: 'hearth',
    salience: 0.8,
    summary: text,
    claims: [
      {
        prop: `warren-cut:${d.face}:${eliciting ? 'position' : 'advice'}:${stance}`,
        value: true,
        confidence: 1,
      },
    ],
    ...(eliciting
      ? {}
      : {
          advice: [
            {
              action: stance === 'pause' ? 'discuss-cut' : 'dig',
              affordanceId: stance === 'pause' ? `cut-pause-${d.face}` : `dig-${d.face}`,
              strength: 0.7,
            },
          ],
        }),
  });
  note(s, { at: p.now, kind: 'story', who: p.id, cell: d.face, text, weight: 1 });
  return { summary: text, needs: { belonging: 0.1 } };
}
export function observeCutDiscussion(s: WarrenState): void {
  const d = s.next?.discussion;
  if (!d) return;
  for (const row of d.statements) {
    const q = s.people.find((p) => p.id === row.listener);
    row.heard ||= !!q?.memory.episodes.some((e) => e.summary === row.text && e.at >= row.at);
  }
  if (d.statements.length === 2 && d.statements.every((row) => row.heard)) d.endedAt ??= s.minute;
  if (
    !d.exchange &&
    d.statements.length === 2 &&
    d.statements.every((row) => row.heard) &&
    d.statements[0]?.stance !== d.statements[1]?.stance
  ) {
    d.exchange = true;
    note(s, {
      kind: 'story',
      cell: d.face,
      text: 'Yusuf Usta and Meryem disagree about the loose cut. Both heard the other. The chalk stays where you put it; neither speech makes the ground safe.',
      weight: 2,
    });
  }
}
export function discussionWords(s: WarrenState): string {
  const d = s.next?.discussion;
  if (!d)
    return 'A marked loose cut can be discussed with Yusuf Usta and Meryem at the hearth. An invitation does not make them come.';
  return d.exchange
    ? 'Yusuf Usta and Meryem disagree about the loose cut.'
    : d.statements.length
      ? 'Words about the loose cut are recorded in the journal. An unanswered statement is not a quarrel.'
      : 'The invitation is pending. Neither person has spoken about the loose cut.';
}

export function endCutDiscussion(s: WarrenState): boolean {
  const d = s.next?.discussion;
  if (!d || d.endedAt !== undefined) return false;
  d.endedAt = s.minute;
  note(s, {
    kind: 'story',
    cell: d.face,
    text: 'You stop waiting for the loose-stone discussion. Earlier words remain in the journal. The chalk stays where you put it.',
    weight: 1,
  });
  return true;
}
