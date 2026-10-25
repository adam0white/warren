/** Only the known Warren → Watch Meryem/Kian route. No travel or completed return is inferred. */
import { restore, snapshot } from '@adam0white/human-framework';
import { canonicalPersona } from '@adam0white/lab-client';
import { type AdaVisit, shiftWatchCare, validateWatchCare } from './ada-care.ts';
import { project } from './cast.ts';
import { releaseVisit } from './visits.ts';
import { advanceTo, type WarrenState } from './warren.ts';

export type NativeReturnId = 'kian' | 'meryem';
export function returnCare(
  visit: AdaVisit | undefined,
  captured: number,
  commitments: Parameters<typeof validateWatchCare>[2],
) {
  if (!visit || visit.endedAt === undefined || visit.endedAt > captured || visit.returnBy <= captured)
    throw Error(
      'Finish the optional refuge work before preparing a saved return to the Watch. The duty to return must remain pending.',
    );
  const v = structuredClone(visit);
  validateWatchCare(
    v.source,
    captured - v.offset,
    commitments.map((c) => ({
      ...structuredClone(c),
      from: c.from - v.offset,
      until: c.until - v.offset,
    })),
  );
  const shifted = shiftWatchCare(v.source, v.offset);
  if (
    canonicalPersona(v.agreement) !== canonicalPersona(shifted.agreement) ||
    canonicalPersona(v.care) !== canonicalPersona(shifted.care) ||
    v.returnBy !== shifted.returnBy
  )
    throw Error('The original care record does not match the saved record from the Watch.');
  validateWatchCare({ agreement: v.agreement, care: v.care, dependent: v.dependent }, captured, commitments);
  if (
    !Number.isSafeInteger(v.careCount) ||
    v.careCount < 0 ||
    v.careCount > 48 ||
    v.dependent.ageMinutes !== v.source.dependent.ageMinutes ||
    v.dependent.sourceMinute < shifted.dependent.sourceMinute ||
    v.dependent.sourceMinute > captured ||
    Math.abs(v.dependent.satiety - Math.min(1, v.source.dependent.satiety + 0.35 * v.careCount)) > 1e-12 ||
    Math.abs(v.dependent.hydration - Math.min(1, v.source.dependent.hydration + 0.35 * v.careCount)) >
      1e-12 ||
    Math.abs(v.dependent.sleepPressure - Math.max(0, v.source.dependent.sleepPressure - 0.05 * v.careCount)) >
      1e-12
  )
    throw Error('Ada’s current care record does not match the care completed during this visit.');
  return { version: 'warren-watch-ada/1' as const, capturedMinute: captured, visit: v };
}

/** Deliberate replay input. Normal HF actions finish; no activity/body/clock is overwritten. */
export function prepareNativeReturn(s: WarrenState, who: NativeReturnId): boolean {
  const invalidated = !!s.nativeDepartures?.[who];
  if (s.nativeDepartures) delete s.nativeDepartures[who];
  if ((s.edition !== '0.6.0' && s.edition !== '0.7.0') || !['kian', 'meryem'].includes(who))
    return invalidated;
  const p = s.people.find((p) => p.id === who);
  if (!p?.body.alive || s.raids.some((r) => r.stage === 'riders')) return invalidated;
  if (who === 'kian') {
    if (s.adaVisit?.endedAt === undefined || s.minute >= s.adaVisit.returnBy) return invalidated;
  } else if (!releaseVisit(s, who)) return invalidated;
  const end = s.minute + 600;
  let person = !p.activity ? snapshot(p) : undefined;
  let care = person && who === 'kian' ? structuredClone(s.adaVisit) : undefined;
  while (!person && s.minute < end)
    advanceTo(s, s.minute + 30, (actual) => {
      if (actual === p && !person) {
        person = snapshot(actual);
        if (who === 'kian') care = structuredClone(s.adaVisit);
      }
    });
  if (person) {
    s.nativeDepartures ??= {};
    s.nativeDepartures[who] = { person, preparedAt: s.minute, guard: snapshot(p), ...(care ? { care } : {}) };
  }
  return true;
}
export function nativeReturnCurrent(s: WarrenState, who: NativeReturnId): boolean {
  const departure = s.nativeDepartures?.[who],
    live = s.people.find((p) => p.id === who);
  return (
    !!departure &&
    !!live?.body.alive &&
    departure.preparedAt === s.minute &&
    canonicalPersona(snapshot(live)) === canonicalPersona(departure.guard) &&
    (who !== 'kian' ||
      (canonicalPersona(s.adaVisit) === canonicalPersona(departure.care) && s.minute < s.adaVisit!.returnBy))
  );
}
export async function projectNativeReturn(s: WarrenState, who: NativeReturnId) {
  const departure = s.nativeDepartures?.[who];
  if (!departure)
    throw Error(
      'No saved state is ready for this person’s return. Continue playing, then prepare this person again after the current activity ends.',
    );
  const p = restore(departure.person);
  if (!nativeReturnCurrent(s, who))
    throw Error(
      'The person has changed since the return was prepared. Prepare this person again. The old saved state will not be reused.',
    );
  if (p.id !== who || p.now > s.minute)
    throw Error('The identity or time in the saved return does not match the current person.');
  const care = who === 'kian' ? returnCare(departure.care, p.now, p.agenda.commitments) : undefined;
  const captured = await project(p); // Existing clinical, activity, project, duty and owed guards remain.
  return { ...captured, transfer: { ...captured.transfer, ...(care ? { warrenCare: care } : {}) } };
}
