/** Display-only topology. Unknown stone is never inspected for a material or a hidden opening. */
import { diggable, idx, K, neighbours, RIDGE, SURF, THEIR_X, USE, xOf, yOf } from '../sim/grid.ts';
import { receivedVisit } from '../sim/visits.ts';
import { riderCells, V, type WarrenState } from '../sim/warren.ts';
import { historyTime } from './event-history.ts';
import { cellLocationWords } from './known-work.ts';

type Route = { accessible: boolean; exposed: boolean; riskPath: number[] };

function trace(parents: Map<number, number>, target: number): number[] {
  if (!parents.has(target)) return [];
  const path = [target];
  while (parents.get(path[0]!) !== path[0]) path.unshift(parents.get(path[0]!)!);
  return path;
}

function access(s: WarrenState, stone: boolean, knownStone = false) {
  const h = s.hill;
  const parents = new Map<number, number>();
  const q: number[] = [];
  const pass = (i: number) =>
    (!!h.known[i] || (stone && !!h.chalk[i])) &&
    (h.kind[i] === K.open ||
      (stone && !!h.chalk[i]) ||
      (knownStone && xOf(i) < THEIR_X && yOf(i) >= SURF && diggable(h.kind[i] ?? K.bedrock))) &&
    !(h.use[i] === USE.door && h.shut[i]);
  for (let x = 0; x < RIDGE; x++) {
    const i = idx(x, SURF);
    if (pass(i)) {
      parents.set(i, i);
      q.push(i);
    }
  }
  for (let n = 0; n < q.length; n++)
    for (const j of neighbours(q[n]!))
      if (!parents.has(j) && pass(j)) {
        parents.set(j, q[n]!);
        q.push(j);
      }
  return parents;
}

function risk(s: WarrenState, target: number): number[] {
  const h = s.hill;
  const kind = h.known.map((known, i) => (known ? h.kind[i]! : K.rock));
  const reach = riderCells({ ...s, hill: { ...h, kind } });
  if (!s.hill.known[target] || !reach.has(target)) return [];
  const path = [target];
  while (reach.get(path[0]!) !== 0) {
    const i = path[0]!;
    const next = neighbours(i).find((j) => s.hill.known[j] && reach.get(j) === (reach.get(i) ?? 0) - 1);
    if (next === undefined) return [];
    path.unshift(next);
  }
  return path;
}

export function selectedPlan(s: WarrenState, cell: number) {
  // Accepted chalk coordinates are visible plans. Treat their stone as generic;
  // never read a concealed material or claim that hidden rock is easy to dig.
  const kind = [...s.hill.kind];
  const known = [...s.hill.known];
  for (let i = 0; i < kind.length; i++)
    if (s.hill.chalk[i]) {
      kind[i] = K.open;
      known[i] = 1;
    }
  const proposedState = { ...s, hill: { ...s.hill, kind, known } };
  const read = (state: WarrenState): Route => {
    const riskPath = risk(state, cell);
    return { accessible: access(state, false, false).has(cell), exposed: !!riskPath.length, riskPath };
  };
  const current = read(s);
  const proposed = read(proposedState);
  const markedConnection = trace(access(s, true), cell);
  const connection = markedConnection.length ? markedConnection : trace(access(s, true, true), cell);
  const firstFace = connection.find((i) => s.hill.kind[i] !== K.open);
  const shutDoor = s.hill.use.some((u, i) => u === USE.door && !!s.hill.shut[i] && !!s.hill.known[i]);
  const describe = (r: Route) =>
    `${r.accessible ? 'reachable through known open passages' : 'not reachable through known open passages'}; ${r.exposed ? 'within the structural rider search' : 'no rider route is shown through known passages'}`;
  let words = `Now: ${describe(current)}. If all accepted chalk is dug: ${describe(proposed)}.`;
  if (connection.length)
    words += ` The shown connection has ${connection.length - 1} passage steps from its opening. Riders search up to ${V.riderReach} steps from every opening; another shaft can shorten the route.`;
  if (firstFace !== undefined)
    words += ` First connecting stone: ${cellLocationWords(s, firstFace)}. Mark the outlined square first if it has no chalk. This connection may include unmarked known stone; only accepted chalk is included in the exposure preview.`;
  else if (!current.accessible && !connection.length)
    words +=
      ' No connected known chalk route reaches this selection. Mark adjoining stone from an accessible wall; no route through unknown stone is assumed.';
  if (shutDoor)
    words +=
      current.accessible && current.exposed
        ? ' A shut door exists, but another open route reaches this selection.'
        : ' A shut door can block passage. Being beyond rider reach does not mean people can reach this place.';
  words +=
    ' Solid lines show current rider reach. Dashed lines show proposed rider reach and the chalk connection. Lines show known structural routes, not future enemy movement. Only marked stone is assumed dug. Light, air, spoil, work and beds are not supplied by this preview.';
  return { current, proposed, connection, firstFace, words };
}

/** Call only after the real command returns. A false acknowledgement cannot claim a change. */
export function chalkFeedback(ack: boolean, before: number[], after: number[]): string {
  const added = after.filter((v, i) => !!v && !before[i]).length;
  const removed = before.filter((v, i) => !!v && !after[i]).length;
  if (!ack) return added || removed ? 'The chalk command was not accepted.' : 'The chalk is unchanged.';
  if (added) return `${added} ${added === 1 ? 'square marked' : 'squares marked'} for digging.`;
  if (removed) return `${removed} chalk ${removed === 1 ? 'mark removed' : 'marks removed'}.`;
  return 'The chalk is unchanged.';
}

/** SCOPE: retained invitation note beside today's selection, never a historical geometric agreement. */
export function yusufPlanWords(s: WarrenState, cell: number): string {
  if (!s.hill.chalk[cell]) return '';
  const receipt = receivedVisit(s, 'yusuf');
  const original = receipt
    ? `Retained Yusuf invitation note · ${historyTime(receipt.at)}: ${receipt.text}`
    : 'Yusuf’s invitation note is unavailable in the retained notes. Its words and date are unknown.';
  const current = `Current chalk selection: ${cellLocationWords(s, cell)}. ${s.hill.known[cell] ? 'This square is known ground.' : 'The chalk is visible, but the stone inside is unknown.'}`;
  return `${original} ${current} No endpoints for Yusuf’s stopping line are recorded. The selected chalk and its shown connections do not establish that line or an agreement about this work. You choose whether to keep or change this plan. Use Rub out on a mark to remove it. Use Chalk on adjoining stone to plan digging. Reading these words changes no chalk.`;
}
