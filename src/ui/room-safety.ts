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
      return `Beyond riders’ reach while the ${location} ${location.startsWith('stone doors') ? 'stay' : 'stays'} shut.`;
    }
    return 'Deep enough: beyond riders’ reach along open routes.';
  }
  const closed = doorReach(s, true);
  const door = exposed.some((i) => !closed.has(i));
  const shaft = exposed.some((i) => routeSource(s, i) !== s.hill.surface.entrance);
  const partly = exposed.length < room.length ? 'Partly exposed. ' : '';
  if (door && exposed.every((i) => !closed.has(i))) {
    const location = doorLocation(s, room);
    return location.startsWith('stone doors')
      ? `Every open route needs a shut stone door; one may not suffice. ${partly}Riders can reach these beds.`
      : `Ring the bell; a nearby adult may shut the open ${location}, blocking riders. ${partly}${activeRaid(s) ? '' : 'False alarms can weaken trust.'}`.trim();
  }
  return `Dig deeper, or shut stone doors on every open route. ${partly}${shaft ? 'An open shaft reaches these beds.' : 'Riders reach these beds from the entrance.'}${door ? ' An open door leaves another route.' : ''}`;
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
    ? `${hours} game ${hours === 1 ? 'hour' : 'hours'}${rest ? ` ${rest} minutes` : ''}`
    : `${total} game ${total === 1 ? 'minute' : 'minutes'}`;
}

/** Observed threat only: never expose the next scheduled raid. */
export function bellThreatWords(s: WarrenState): string {
  const raid = activeRaid(s);
  if (raid?.stage === 'riders') return 'Riders are at the hill.';
  if (raid?.stage === 'smoke') return 'Smoke on the ridge. Riders may be half a day off.';
  return 'No smoke or riders in sight.';
}

export function bellStateWords(s: WarrenState): string {
  if ((s.edition === '0.4.0' || s.edition === '0.5.0') && s.bell?.real && s.bell.until > s.minute)
    return 'Call active until the all-clear. People choose whether to come below and may refuse throughout.';
  if (s.bell && s.bell.until > s.minute)
    return `Call active for six game hours; ${gameTimeWords(s.bell.until - s.minute)} left. People choose whether to come below.`;
  if ((s.edition === '0.4.0' || s.edition === '0.5.0') && activeRaid(s))
    return 'No call active. Ring the bell once to call people below until the all-clear. People choose whether to come.';
  if (hadBellCall(s)) {
    const travelling = s.people.some(
      (p) => p.body.alive && s.trips[p.id]?.action === 'shelter' && (s.trips[p.id]?.workFrom ?? 0) > s.minute,
    );
    const sheltering = s.people.some((p) => p.body.alive && p.activity?.action === 'shelter');
    const bellAt = s.notes.findLast((n) => /^You rang the bell[.,]/.test(n.text))?.at;
    const deadline = s.bell?.until ?? (bellAt === undefined ? undefined : bellAt + V.bellHours * HOUR);
    const raidCall =
      (s.edition === '0.4.0' || s.edition === '0.5.0') &&
      s.raids.some(
        (r) => r.stage === 'gone' && bellAt !== undefined && r.smoke <= bellAt && bellAt < r.leave,
      );
    const reason = raidCall
      ? ' The riders have gone; the all-clear ended the call.'
      : deadline !== undefined && s.minute >= deadline
        ? ' The call’s six game hours elapsed.'
        : '';
    const ended = travelling
      ? 'Call ended; some are still on the way below.'
      : sheltering
        ? 'Call ended; some are still sheltering below.'
        : 'Call ended.';
    return `${ended}${reason}${activeRaid(s) && (s.edition !== '0.4.0' && s.edition !== '0.5.0') ? ' Ring to renew.' : ''}`;
  }
  return activeRaid(s)
    ? s.edition === '0.4.0' || s.edition === '0.5.0'
      ? 'No call active. Ring the bell once to call people below until the all-clear. People choose whether to come.'
      : 'No call active. Ring the bell to call people below for six game hours.'
    : s.edition === '0.4.0' || s.edition === '0.5.0'
      ? 'Bell quiet. During a raid, one call stands until the all-clear. Quiet-time calls last six game hours; false alarms can weaken trust. People choose whether to come below.'
      : 'Bell quiet. Each call lasts six game hours. People choose whether to come below.';
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
  return `Sleeping places: ${safe} beyond riders’ reach; ${exposed} exposed${exposed ? ` ${cause}` : ''}. ${people} villagers${missing ? `; ${missing} lack marked space` : ''}. ${bellStateWords(s)}`;
}

/** The first scare's observed search stays visible afterwards, even if a door is later shut. */
export function scoutedCells(s: WarrenState): Set<number> {
  return new Set(s.raids.flatMap((r) => r.scouted ?? []));
}
