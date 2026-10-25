import { HOUR } from '../sim/calendar.ts';
import { BEDS_PER_CELL, idx, K, neighbours, roomOf, SURF, USE, xOf, yOf } from '../sim/grid.ts';
import { activeRaid, riderCells, V, type WarrenState } from '../sim/warren.ts';

/** Counterfactual readings use copied door flags, never change the hill. */
function doorReach(s: WarrenState, shut: boolean) {
  const flags = [...s.hill.shut];
  for (let i = 0; i < flags.length; i++)
    if (s.hill.use[i] === USE.door && !s.hill.doorWork[i]) flags[i] = shut ? 1 : 0;
  return riderCells({ ...s, hill: { ...s.hill, shut: flags } });
}

/** Actual shortest open route, including shafts, limited by the simulation's rider search. */
function routeSource(s: WarrenState, target: number): number | undefined {
  const reached = riderCells(s);
  const q = [target];
  const seen = new Set(q);
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    if (i === undefined) continue;
    if (reached.get(i) === 0) return xOf(i);
    for (const j of neighbours(i))
      if (!seen.has(j) && reached.has(j) && (reached.get(j) ?? 0) < (reached.get(i) ?? 0)) {
        seen.add(j);
        q.push(j);
      }
  }
}

function doorLocation(s: WarrenState, room: number[]): string {
  const cell = room[0] ?? 0;
  const doors: number[] = [];
  const reached = riderCells(s);
  const exposed = room.filter((i) => reached.has(i));
  for (let i = 0; i < s.hill.use.length; i++)
    if (s.hill.use[i] === USE.door && !s.hill.doorWork[i]) {
      const flags = [...s.hill.shut];
      flags[i] = flags[i] ? 0 : 1;
      const next = riderCells({ ...s, hill: { ...s.hill, shut: flags } });
      if (exposed.length ? exposed.every((j) => !next.has(j)) : room.some((j) => next.has(j))) doors.push(i);
    }
  if (!exposed.length && doors.length > 1) return 'stone doors on the routes to this room';
  const door = doors.sort(
    (a, b) =>
      Math.abs(xOf(a) - xOf(cell)) +
      Math.abs(yOf(a) - yOf(cell)) -
      (Math.abs(xOf(b) - xOf(cell)) + Math.abs(yOf(b) - yOf(cell))),
  )[0];
  if (door === undefined) return 'stone doors on the routes to this room';
  return `stone door ${yOf(door) < yOf(cell) ? 'above' : yOf(door) > yOf(cell) ? 'below' : xOf(door) < xOf(cell) ? 'to the left of' : 'to the right of'} this room`;
}

export function roomSafetyWords(s: WarrenState, cell: number): string {
  const room = roomOf(s.hill, cell);
  const reached = riderCells(s);
  const exposed = room.filter((i) => reached.has(i));
  if (!exposed.length) {
    const open = doorReach(s, false);
    if (room.some((i) => open.has(i))) {
      const location = doorLocation(s, room);
      return `This room is beyond riders’ reach while the ${location} ${location.startsWith('stone doors') ? 'stay' : 'stays'} shut.`;
    }
    return 'This room is deep enough to be beyond riders’ reach along open routes.';
  }
  const closed = doorReach(s, true);
  const door = exposed.some((i) => !closed.has(i));
  const shaft = exposed.some((i) => routeSource(s, i) !== s.hill.surface.entrance);
  const partly = exposed.length < room.length ? 'Part of this room is exposed. ' : '';
  if (door && exposed.every((i) => !closed.has(i))) {
    const location = doorLocation(s, room);
    return location.startsWith('stone doors')
      ? `Every open route needs a shut stone door. One door may not be enough. ${partly}Riders can reach these beds.`
      : `Ring the bell. A nearby adult may shut the open ${location} to block riders. ${partly}${activeRaid(s) ? '' : 'False alarms can weaken trust.'}`.trim();
  }
  return `Dig deeper, or shut stone doors on every open route. ${partly}${shaft ? 'Riders can reach these beds through an open shaft.' : 'Riders reach these beds from the entrance.'}${door ? ' Riders also have a route through an open door.' : ''}`;
}

export function bedSafety(s: WarrenState): { safe: number; exposed: number } {
  const reached = riderCells(s);
  let safe = 0;
  let exposed = 0;
  for (let i = idx(0, SURF); i < s.hill.kind.length; i++) {
    if (s.hill.kind[i] !== K.open || s.hill.use[i] !== USE.beds) continue;
    if (reached.has(i)) exposed += BEDS_PER_CELL;
    else safe += BEDS_PER_CELL;
  }
  return { safe, exposed };
}

export function hadBellCall(s: WarrenState): boolean {
  return (
    !!s.bell ||
    s.answers.length > 0 ||
    Object.values(s.stats.bell).some((n) => n > 0) ||
    s.notes.some((n) => /^You rang the bell[.,]/.test(n.text))
  );
}

/** Time in the hill, independent of the player's playback speed. */
export function gameTimeWords(minutes: number): string {
  const total = Math.max(0, Math.ceil(minutes));
  const hours = Math.floor(total / HOUR);
  const rest = total % HOUR;
  return hours
    ? `${hours} game ${hours === 1 ? 'hour' : 'hours'}${rest ? ` ${rest} ${rest === 1 ? 'minute' : 'minutes'}` : ''}`
    : `${total} game ${total === 1 ? 'minute' : 'minutes'}`;
}

/** Observed threat only: never expose the next scheduled raid. */
export function bellThreatWords(s: WarrenState): string {
  const raid = activeRaid(s);
  if (raid?.stage === 'riders') return 'Riders are at the hill.';
  if (raid?.stage === 'smoke') return 'Smoke rises on the ridge. Riders may arrive in half a day or less.';
  return 'No smoke or riders are in sight.';
}

export function bellStateWords(s: WarrenState): string {
  if (
    (s.edition === '0.4.0' || s.edition === '0.5.0' || s.edition === '0.6.0') &&
    s.bell?.real &&
    s.bell.until > s.minute
  )
    return 'The call stays active until the riders leave. People decide whether to come below. They can refuse at any time.';
  if (s.bell && s.bell.until > s.minute)
    return `The call lasts six game hours. It has ${gameTimeWords(s.bell.until - s.minute)} left. People choose whether to come below.`;
  if ((s.edition === '0.4.0' || s.edition === '0.5.0' || s.edition === '0.6.0') && activeRaid(s))
    return 'No call is active. Ring the bell once to call people below until the riders leave. People choose whether to come.';
  if (hadBellCall(s)) {
    const travelling = s.people.some(
      (p) => p.body.alive && s.trips[p.id]?.action === 'shelter' && (s.trips[p.id]?.workFrom ?? 0) > s.minute,
    );
    const sheltering = s.people.some((p) => p.body.alive && p.activity?.action === 'shelter');
    const bellAt = s.notes.findLast((n) => /^You rang the bell[.,]/.test(n.text))?.at;
    const deadline = s.bell?.until ?? (bellAt === undefined ? undefined : bellAt + V.bellHours * HOUR);
    const raidCall =
      (s.edition === '0.4.0' || s.edition === '0.5.0' || s.edition === '0.6.0') &&
      s.raids.some(
        (r) => r.stage === 'gone' && bellAt !== undefined && r.smoke <= bellAt && bellAt < r.leave,
      );
    const reason = raidCall
      ? ' The riders have gone, so the call has ended.'
      : deadline !== undefined && s.minute >= deadline
        ? ' The call ended after six game hours.'
        : '';
    const ended = travelling
      ? 'The call has ended. Some people are still on their way below.'
      : sheltering
        ? 'The call has ended. Some people are still sheltering below.'
        : 'The call has ended.';
    return `${ended}${reason}${activeRaid(s) && (s.edition !== '0.4.0' && s.edition !== '0.5.0' && s.edition !== '0.6.0') ? ' Ring the bell to renew the call.' : ''}`;
  }
  return activeRaid(s)
    ? s.edition === '0.4.0' || s.edition === '0.5.0' || s.edition === '0.6.0'
      ? 'No call is active. Ring the bell once to call people below until the riders leave. People choose whether to come.'
      : 'No call is active. Ring the bell to call people below for six game hours.'
    : s.edition === '0.4.0' || s.edition === '0.5.0' || s.edition === '0.6.0'
      ? 'The bell is quiet. During a raid, one call lasts until the riders leave. Calls without a raid last six game hours. False alarms can weaken trust. People choose whether to come below.'
      : 'The bell is quiet. Each call lasts six game hours. People choose whether to come below.';
}

export function bellShelterWords(s: WarrenState): string {
  const { safe, exposed } = bedSafety(s);
  const reached = riderCells(s);
  const closed = doorReach(s, true);
  let door = 0;
  let shaft = 0;
  let near = 0;
  for (let i = 0; i < s.hill.use.length; i++) {
    if (s.hill.use[i] !== USE.beds || !reached.has(i)) continue;
    if (!closed.has(i)) door++;
    else if (routeSource(s, i) !== s.hill.surface.entrance) shaft++;
    else near++;
  }
  const cause =
    door >= shaft && door >= near && door > 0
      ? 'by an open door'
      : shaft >= near && shaft > 0
        ? 'by an open shaft'
        : 'near the entrance';
  const people = s.people.filter((p) => p.body.alive).length;
  const missing = Math.max(0, people - safe - exposed);
  if (!safe && !exposed)
    return `The village has ${people} ${people === 1 ? 'person' : 'people'} and no sleeping places yet. Mark sleeping places below ground, where riders cannot reach them. ${bellStateWords(s)}`;
  const sheltered = safe
    ? `${safe} sleeping ${safe === 1 ? 'place is' : 'places are'} beyond riders’ reach.`
    : 'Riders can reach all marked sleeping places.';
  const vulnerable = exposed
    ? ` Riders can reach ${exposed} sleeping ${exposed === 1 ? 'place' : 'places'} ${cause}.`
    : '';
  return `${sheltered}${vulnerable} The village has ${people} ${people === 1 ? 'person' : 'people'}.${missing ? ` Mark sleeping places for ${missing} more ${missing === 1 ? 'person' : 'people'}.` : ''} ${bellStateWords(s)}`;
}

/** The first scare's observed search stays visible afterwards, even if a door is later shut. */
export function scoutedCells(s: WarrenState): Set<number> {
  return new Set(s.raids.flatMap((r) => r.scouted ?? []));
}
