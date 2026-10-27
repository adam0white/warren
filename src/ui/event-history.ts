/** SCOPE: read-only projection of retained door requests and alarm receipts.
 * Never reconstruct a past roll from current bodies, activities or physical door state.
 * Original notes and saved outcome text stay untouched. No new saved event is created. */
import type { Game } from '../sim/game.ts';
import type { DoorRequest } from '../sim/resident-requests.ts';
import { hillDate } from './date.ts';

export interface HistoryEntry {
  at: number;
  kind: 'request' | 'reply' | 'door' | 'bell' | 'journal' | 'action' | 'unknown';
  text: string;
  cell?: number;
}

/** Keep the recorded minute; do not round a work boundary into another event time. */
export function historyTime(at: number): string {
  if (!Number.isFinite(at)) return 'Time unknown';
  const minute = ((at % 1440) + 1440) % 1440;
  return `${hillDate(at)} · ${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(Math.floor(minute % 60)).padStart(2, '0')}${minute % 1 ? ' (between minutes)' : ''}`;
}

export function eventHistory(g: Game): HistoryEntry[] {
  const s = g.s;
  const rows: HistoryEntry[] = [];
  // Name lookup identifies the retained actor only. It supplies no present-day need,
  // motive, position or physical condition to the historical projection.
  const name = (id: string) => s.people.find((p) => p.id === id)?.name ?? id;
  const requests: DoorRequest[] = [...(s.doorTrials ?? [])];
  if (s.next?.requests?.door && !requests.includes(s.next.requests.door)) requests.push(s.next.requests.door);
  for (const r of requests) {
    rows.push({
      at: r.at,
      kind: 'request',
      cell: r.cell,
      text: `You asked ${name(r.who)} to test a finished door and reopen it. This request does not establish agreement or a completed roll.`,
    });
    for (const a of r.answers)
      rows.push({
        at: a.at,
        kind: 'reply',
        cell: r.cell,
        text: `${name(r.who)} ${a.verdict}: “${a.says}” The chosen activity was to ${a.label}. This answer is not completed work.`,
      });
    for (const result of r.results)
      rows.push({
        at: result.at,
        kind: 'door',
        cell: r.cell,
        text: `Completed door test: ${result.shut ? 'shut' : 'reopened'} by ${name(r.who)}. Activity began at ${historyTime(result.startedAt)}. Work began at ${historyTime(result.workFrom)}. The roll finished at the time above. ${result.shut ? 'Reopening remained a separate choice.' : 'The passage opened again.'}`,
      });
    if (r.opened) {
      const o = r.opened;
      rows.push({
        at: o.at,
        kind: o.who ? 'door' : 'unknown',
        cell: r.cell,
        text: o.who
          ? `${name(o.who)} reopened the tested door during ordinary work.`
          : 'The tested door was recorded open. Who reopened it and the time of that roll are unknown.',
      });
    }
    if (r.withdrawn && r.endedAt !== undefined)
      rows.push({
        at: r.endedAt,
        kind: 'request',
        cell: r.cell,
        text: 'You withdrew this door request. Earlier answers, spent time and completed rolls remain. Withdrawal is not completion.',
      });
  }
  for (const input of g.inputs.filter((i) => i.verb === 'bell')) {
    const original = s.notes.find((n) => n.at === input.at && n.text.startsWith('You rang the bell'));
    rows.push({
      at: input.at,
      kind: 'bell',
      text: original?.text ?? 'You rang the bell. The original alarm wording is no longer retained.',
    });
    rows.push({
      at: input.at,
      kind: 'unknown',
      text: 'Whether a door shut during this call is unknown without a dated door outcome. A bell reply or an alarm all-clear does not establish a completed roll.',
    });
  }
  for (const a of s.answers)
    rows.push({
      at: a.at,
      kind: 'reply',
      text: `Bell reply from ${name(a.who)} — ${a.verdict}: “${a.says}” This is a reply to shelter, not proof of travel, arrival or closing a door.`,
    });
  for (const n of s.notes) {
    if (
      n.kind === 'raid' ||
      n.text.startsWith('No riders came.') ||
      n.text.startsWith('Again, no riders came.') ||
      n.text.toLowerCase().includes('door') ||
      (n.text.startsWith('You rang the bell') && !g.inputs.some((i) => i.verb === 'bell' && i.at === n.at))
    ) {
      const covered = requests.some(
        (r) =>
          (n.cell === r.cell &&
            (n.at === r.at || r.results.some((x) => x.at === n.at) || r.opened?.at === n.at)) ||
          (n.kind === 'answer' && n.who === r.who && r.answers.some((a) => a.at === n.at)),
      );
      if (!covered) rows.push({ at: n.at, kind: 'journal', cell: n.cell, text: n.text });
    }
  }
  // These are retained outcome episodes, not today's activity or condition. Keep
  // the original summary and status; do not turn a generic outcome into safety credit.
  for (const p of s.people)
    for (const e of p.memory.episodes) {
      if (e.kind !== 'outcome' || !['shut-door', 'open-door'].includes(e.action ?? '')) continue;
      const cell = e.targetId === undefined ? undefined : Number(e.targetId);
      rows.push({
        at: e.at,
        kind: 'action',
        cell: Number.isInteger(cell) ? cell : undefined,
        text: `${name(p.id)} — recorded door action outcome (${e.tags.includes('completed') ? 'completed' : e.tags.includes('interrupted') ? 'interrupted' : 'status unknown'}): ${e.summary} This record does not show how long the door stayed in that state or who was protected.`,
      });
    }
  return rows.sort((a, b) => a.at - b.at);
}
