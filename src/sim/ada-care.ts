/** A finite referenced dependent record. Ada remains Kian's ward, not another autonomous cast actor. */
import type { Commitment, Person } from '@adam0white/human-framework';
import type { WarrenState } from './warren.ts';
export interface WatchCare {
  agreement: {
    version: 'watch-warren-ada/1';
    guardian: 'kian';
    dependent: 'ada';
    sourceMinute: number;
    returnBy: number;
    kianAssented: true;
    adaAssented: true;
    commitmentId: string;
    returnCommitmentId: string;
    careCompletedAt: number;
    status: 'agreed';
  };
  care: { commitment: Commitment; completedAt: number };
  dependent: {
    id: 'ada';
    guardian: 'kian';
    sourceMinute: number;
    ageMinutes: number;
    alive: true;
    satiety: number;
    hydration: number;
    sleepPressure: number;
  };
}
export interface AdaVisit {
  source: WatchCare;
  offset: number;
  agreement: WatchCare['agreement'];
  care: WatchCare['care'];
  returnBy: number;
  dependent: WatchCare['dependent'];
  careCount: number;
  endRequested?: boolean;
  endedAt?: number;
  protection?: 'protected' | 'exposed';
}
export function validateWatchCare(raw: unknown, captured: number, commitments: Commitment[]): WatchCare {
  const x = raw as WatchCare;
  const a = x?.agreement,
    d = x?.dependent,
    c = x?.care;
  if (JSON.stringify(raw)?.length > 16384) throw Error('Care record exceeds the finite bound.');
  const keys = (v: object, allowed: string[]) => Object.keys(v).every((k) => allowed.includes(k));
  if (
    !x ||
    !a ||
    !d ||
    !c ||
    !keys(x, ['agreement', 'care', 'dependent']) ||
    !keys(d, [
      'id',
      'guardian',
      'sourceMinute',
      'ageMinutes',
      'alive',
      'satiety',
      'hydration',
      'sleepPressure',
    ]) ||
    !keys(a, [
      'version',
      'guardian',
      'dependent',
      'sourceMinute',
      'returnBy',
      'kianAssented',
      'adaAssented',
      'commitmentId',
      'returnCommitmentId',
      'careCompletedAt',
      'status',
    ]) ||
    !keys(c, ['commitment', 'completedAt'])
  )
    throw Error('Unsupported finite care fields.');
  const integer = (n: number) => Number.isSafeInteger(n);
  if (
    !a ||
    !d ||
    !c ||
    a.version !== 'watch-warren-ada/1' ||
    a.guardian !== 'kian' ||
    a.dependent !== 'ada' ||
    a.status !== 'agreed' ||
    a.kianAssented !== true ||
    a.adaAssented !== true ||
    !integer(a.sourceMinute) ||
    !integer(a.returnBy) ||
    a.returnBy - a.sourceMinute !== 1440 ||
    captured < a.sourceMinute ||
    captured >= a.returnBy ||
    typeof a.commitmentId !== 'string' ||
    a.commitmentId.length < 1 ||
    a.commitmentId.length > 256 ||
    typeof a.returnCommitmentId !== 'string' ||
    a.returnCommitmentId.length < 1 ||
    a.returnCommitmentId.length > 256 ||
    a.commitmentId === a.returnCommitmentId
  )
    throw Error('Unsupported Watch assent/window.');
  const exact = (v: Commitment | undefined, id: string, action: string, status: string) =>
    v?.id === id &&
    v.kind === 'duty' &&
    v.toId === 'ada' &&
    v.targetId === 'ada' &&
    v.actions.length === 1 &&
    v.actions[0] === action &&
    v.status === status &&
    v.from === a.sourceMinute &&
    v.until === a.returnBy &&
    !v.recurUntil &&
    !v.chain &&
    !v.exempt &&
    !v.violatedBy?.length;
  if (
    !exact(c.commitment, a.commitmentId, 'care-ada', 'kept') ||
    !integer(c.completedAt) ||
    c.completedAt !== a.careCompletedAt ||
    c.completedAt < a.sourceMinute ||
    c.completedAt > captured
  )
    throw Error('Missing actual completed source care.');
  if (
    !exact(
      commitments.find((v) => v.id === a.returnCommitmentId),
      a.returnCommitmentId,
      'return-with-ada',
      'pending',
    ) ||
    commitments.some((v) => v.id !== a.returnCommitmentId && v.kind !== 'worship')
  )
    throw Error('Unsupported care/home duty.');
  if (
    d.id !== 'ada' ||
    d.guardian !== 'kian' ||
    d.alive !== true ||
    !integer(d.sourceMinute) ||
    Math.abs(d.sourceMinute - captured) > 1440 ||
    d.sourceMinute >= a.returnBy ||
    !integer(d.ageMinutes) ||
    d.ageMinutes < 8 * 525600 ||
    d.ageMinutes >= 9 * 525600 ||
    [d.satiety, d.hydration, d.sleepPressure].some(
      (n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1,
    )
  )
    throw Error('Unsupported actual Ada reservoirs.');
  return structuredClone(x);
}
export function shiftWatchCare(source: WatchCare, offset: number): AdaVisit {
  return {
    source: structuredClone(source),
    offset,
    returnBy: source.agreement.returnBy + offset,
    agreement: {
      ...structuredClone(source.agreement),
      sourceMinute: source.agreement.sourceMinute + offset,
      returnBy: source.agreement.returnBy + offset,
      careCompletedAt: source.agreement.careCompletedAt + offset,
    },
    care: {
      commitment: {
        ...structuredClone(source.care.commitment),
        from: source.care.commitment.from + offset,
        until: source.care.commitment.until + offset,
      },
      completedAt: source.care.completedAt + offset,
    },
    dependent: { ...structuredClone(source.dependent), sourceMinute: source.dependent.sourceMinute + offset },
    careCount: 0,
  };
}
export function completeAdaCare(s: WarrenState, p: Person, done: boolean, waterCell: number): boolean {
  const v = s.adaVisit,
    h = s.houses.find((h) => h.members.includes('kian'));
  if (
    !done ||
    p.id !== 'kian' ||
    !p.body.alive ||
    !v ||
    v.endedAt !== undefined ||
    p.now >= v.returnBy ||
    s.raids.some((r) => r.stage === 'smoke' || r.stage === 'riders') ||
    !h ||
    h.jars < 0.1 ||
    (s.hill.water[waterCell] ?? 0) < 0.1
  )
    return false;
  h.jars -= 0.1;
  s.hill.water[waterCell] = (s.hill.water[waterCell] ?? 0) - 0.1;
  v.dependent.satiety = Math.min(1, v.dependent.satiety + 0.35);
  v.dependent.hydration = Math.min(1, v.dependent.hydration + 0.35);
  v.dependent.sleepPressure = Math.max(0, v.dependent.sleepPressure - 0.05);
  v.dependent.sourceMinute = p.now;
  v.careCount++;
  delete s.flags['ada-care-request'];
  s.notes.push({
    at: p.now,
    kind: 'story',
    who: 'kian',
    text: 'Kian shared actual household grain and jar water with Ada, then rested with her. Her care record changed; their return remains unverified.',
    weight: 2,
  });
  return true;
}
export function requestAdaEnd(s: WarrenState): boolean {
  const v = s.adaVisit,
    p = s.people.find((p) => p.id === 'kian');
  if (!v || v.endedAt !== undefined || !p?.body.alive) return false;
  v.endRequested = true;
  if (p.activity || s.raids.some((r) => r.stage === 'riders')) return true;
  v.endedAt = s.minute;
  s.flags['released:kian'] = s.minute + 1;
  for (const g of p.agenda.goals)
    if (g.status === 'active' && ['refuge', 'canonical-role', 'between-games-assignment'].includes(g.id))
      g.status = 'abandoned';
  s.notes.push({
    at: s.minute,
    kind: 'story',
    who: 'kian',
    text: 'Kian ends his optional refuge work at a quiet boundary; Ada remains with him. Their exact return duty and changed care record remain. No completed journey or return is claimed; onward transfer is refused here.',
    weight: 2,
  });
  return true;
}
export function adaWords(s: WarrenState): string {
  const v = s.adaVisit;
  if (!v) return 'No imported Ada-care agreement. Fresh local accompaniment is authored fiction.';
  if (!s.people.find((p) => p.id === 'kian')?.body.alive)
    return 'Kian has died. Ada’s care arrangement is unresolved. The captured care record remains in the notebook; no new guardian or completed return is inferred.';
  const food =
    v.dependent.satiety < 0.3 ? 'looks hungry' : v.dependent.satiety < 0.6 ? 'could eat' : 'has eaten';
  const water =
    v.dependent.hydration < 0.3
      ? 'looks thirsty'
      : v.dependent.hydration < 0.6
        ? 'could drink'
        : 'has had water';
  const rest =
    v.dependent.sleepPressure > 0.7
      ? 'looks sleepy'
      : v.dependent.sleepPressure > 0.4
        ? 'looks tired'
        : 'looks rested';
  const remaining = Math.max(1, Math.ceil((v.returnBy - s.minute) / 60));
  return `Ada stays with her guardian Kian. Both agreed at the Watch. She ${food}, ${water}, and ${rest}. ${v.careCount ? 'They have shared further food, water and rest here.' : ''} ${v.endedAt !== undefined ? 'Kian’s optional refuge work has ended. Their return remains unverified.' : s.minute >= v.returnBy ? 'Their return window has expired. No return is inferred.' : `They agreed to return in about ${remaining} hill hours.`} ${v.protection === 'protected' ? 'Their last shelter choice put them beyond the riders’ reach.' : v.protection === 'exposed' ? 'Their last shelter choice left them exposed.' : ''} This is a bounded care record. Keep the full local notebook; only the finite native Watch return can carry this notebook; other onward transfer is unavailable here.`;
}
