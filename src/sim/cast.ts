/** Finite zero-duration calendar maps. No travel, healing, duty settlement or qualification inference. */
import {
  admitCalendarPersona,
  ENGINE_VERSION,
  isContinuingCommitment,
  type Person,
  projectCalendarPersona,
  restore,
  snapshot,
  validateCalendarPersona,
} from '@adam0white/human-framework';
import {
  canonicalCast,
  canonicalPersona,
  type LifePreparation,
  lifeAdmission,
  type PersonaEnvelope,
  preparePersonaLife,
} from '@adam0white/lab-client';
import { SITE_CAST_NORMS } from './cast-norms.ts';
import { idx, SURF, surfaceCell } from './grid.ts';
import { CAST_IDS } from './people.ts';
import type { WarrenState } from './warren.ts';

const TRUSTED_NORMS = [
  ...SITE_CAST_NORMS,
  {
    id: 'dues',
    label: 'The valley household’s agreed share',
    standing: 'obligatory' as const,
    sources: [
      {
        kind: 'assumption' as const,
        ref: 'Valley household share; each person understands the agreement locally',
      },
    ],
  },
];
export interface Chapter {
  version: 'warren-cast/1';
  inputs: LifePreparation[];
  claims: PersonaEnvelope[];
  initial: WarrenState;
}
const SOURCES: Record<string, Record<string, string>> = {
  warren: CAST_IDS,
  well: { maryam: CAST_IDS.maryam!, tariq: CAST_IDS.tariq! },
  watch: { kian: CAST_IDS.kian!, tamar: CAST_IDS.tamar!, meryem: CAST_IDS.meryem! },
  valley: { 'yusuf-usta': CAST_IDS.yusuf!, 'meryem-visitor': CAST_IDS.meryem!, maryam: CAST_IDS.maryam! },
};
const ACTIONS = new Set([
  'eat',
  'drink',
  'sleep',
  'rest',
  'pray',
  'dig',
  'carry-spoil',
  'make-lamp',
  'carve-door',
]);
const SKILLS: Record<string, Record<string, string>> = {
  warren: { digging: 'digging', farming: 'farming' },
  well: {}, // Building/cooking do not certify stone digging or farming.
  watch: {}, // Watching and sling use do not certify stone digging.
  valley: { digging: 'digging', farming: 'farming' },
};
function role(castId: string) {
  const id = Object.keys(CAST_IDS).find((id) => CAST_IDS[id] === castId);
  if (!id) throw new Error('No canonical Warren role.');
  return id;
}
export function admit(input: LifePreparation, opening: Person): Person {
  const parent = input.parent;
  if (canonicalPersona(preparePersonaLife(parent, input.clockMs).life) !== canonicalPersona(input.life))
    throw new Error('Life differs from pinned clock.');
  lifeAdmission(input, 'warren');
  const id = role(parent.castId);
  if (
    parent.castRevision !== canonicalCast(parent.castId).revision ||
    opening.id !== id ||
    parent.source.engine !== ENGINE_VERSION
  )
    throw new Error('Unsupported identity/engine edition.');
  const sourceRole = parent.transfer.sourceRole;
  if (typeof sourceRole !== 'string' || SOURCES[parent.source.game]?.[sourceRole] !== parent.castId)
    throw new Error('Unsupported source role.');
  const dialect =
    parent.source.game === 'warren'
      ? 'warren-calendar/1'
      : parent.source.game === 'valley'
        ? 'valley-cast/1'
        : 'site-cast/1';
  if (parent.transfer.castPassport !== dialect) throw new Error('Unsupported passport dialect.');
  if (id === 'kian')
    throw new Error(
      'Watch Ada-care adapter pending. Keep this source chapter; do not clear the care promise.',
    );
  const portable = validateCalendarPersona(parent.transfer.person);
  if (portable.person.source.id !== sourceRole) throw new Error('Source identity mismatch.');
  const checkpoint = parent.transfer.checkpoint as
    | { schema?: unknown; sourceMinute?: unknown; rng?: unknown; sha256?: unknown }
    | undefined;
  if (
    !checkpoint ||
    checkpoint.schema !== portable.person.source.schema ||
    checkpoint.sourceMinute !== portable.person.source.now ||
    canonicalPersona(checkpoint.rng) !== canonicalPersona(portable.person.rng) ||
    typeof checkpoint.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(checkpoint.sha256)
  )
    throw new Error('Missing full-source receipt.');
  if (
    portable.person.mappingVersion !==
    (parent.source.game === 'warren'
      ? 'warren-calendar/1'
      : parent.source.game === 'valley'
        ? 'valley-calendar/1'
        : 'site-cast-calendar/1')
  )
    throw new Error('Unsupported calendar map.');
  if (parent.source.game === 'valley' && parent.source.rules !== 'valley-cast-3')
    throw new Error('Unsupported Valley host rules.');
  if (
    portable.calendar.owed.length ||
    portable.calendar.lapse ||
    portable.calendar.commitments.some(
      (c) => c.kind !== 'worship' || c.normId !== 'salah' || c.actions.some((a) => a !== 'pray'),
    )
  )
    throw new Error('Source care/work/owed duty has no supported handover here.');
  for (const n of portable.calendar.norms)
    if (!TRUSTED_NORMS.some((k) => canonicalPersona(k) === canonicalPersona(n)))
      throw new Error('Unsupported norm meaning.');
  for (const duty of [...portable.calendar.commitments, ...portable.calendar.owed])
    if ([...duty.actions, ...(duty.violatedBy ?? [])].some((a) => !ACTIONS.has(a)))
      throw new Error('Source duty has no supported action.');
  const shifted = structuredClone(portable);
  const offset = opening.now - portable.person.source.now;
  shifted.calendar.offset = offset;
  for (const c of shifted.calendar.commitments) {
    c.from += offset;
    c.until += offset;
    if (c.recurUntil !== undefined) c.recurUntil += offset;
    if (c.exempt) c.exempt.at += offset;
  }
  for (const d of shifted.calendar.owed) {
    d.at += offset;
    if (d.lapseSince !== undefined) d.lapseSince += offset;
  }
  if (shifted.calendar.lapse) shifted.calendar.lapse.since += offset;
  const target = restore(snapshot(opening));
  const age = portable.person.source.now - portable.person.life.bornAt;
  if (
    age < canonicalCast(parent.castId).age * 525600 ||
    age > (canonicalCast(parent.castId).age + 200) * 525600
  )
    throw new Error('Unsupported age provenance.');
  target.life.bornAt = portable.person.life.bornAt + offset;
  // Only fitness is explicitly portable; clinical and circadian compatibility stay exact in HF.
  target.body.fitness = portable.person.health.fitness;
  target.agenda.commitments = [];
  delete target.agenda.owed;
  delete target.agenda.lapse;
  const retained: typeof shifted.person.skills = {};
  for (const [skill, value] of Object.entries(shifted.person.skills)) {
    const mapped = SKILLS[parent.source.game]?.[skill];
    if (mapped) retained[mapped] = value;
    else shifted.person.limitations.push(`Source archive retains unmapped skill: ${skill}`);
  }
  shifted.person.skills = retained;
  return admitCalendarPersona(shifted, target, {
    mappingVersion: portable.person.mappingVersion,
    sourceId: sourceRole,
    targetId: id,
    targetNorms: portable.calendar.norms,
  }).person;
}
export function applyLife(s: WarrenState, input: LifePreparation) {
  const id = role(input.parent.castId),
    p = s.people.find((p) => p.id === id)!;
  const facts = lifeAdmission(input, 'warren');
  const h = s.houses.find((h) => h.members.includes(id))!;
  s.pos[id] = facts.startsAtHome ? surfaceCell(h.x) : idx(17, SURF + 3);
  p.agenda.goals.push({
    id: 'between-games-assignment',
    label: facts.assignment,
    serves: ['competence'],
    advancedBy: [{ action: input.life.assignment === 0 ? 'rest' : 'dig', amount: 0.02 }],
    importance: facts.availableForExtraWork ? 0.35 : 0.15,
    progress: 0,
    status: 'active',
    adoptedAt: s.minute,
  });
  s.notes.push({ at: s.minute, kind: 'story', who: id, text: facts.line, weight: 1 });
}
export async function project(person: Person) {
  const retained = person.agenda.commitments.filter((c) => isContinuingCommitment(person.agenda, c));
  const identity = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, k]));
  const raw = snapshot(person);
  const personState = projectCalendarPersona(person, {
    version: 'warren-calendar/1',
    skills: Object.fromEntries(
      ['digging', 'farming'].filter((id) => person.skills[id]).map((id) => [id, id]),
    ),
    calendar: {
      version: 'hf-persona-calendar-map/1',
      offset: 0,
      sourceNorms: TRUSTED_NORMS,
      references: {
        commitments: identity(retained.map((c) => c.id)),
        chains: identity(retained.flatMap((c) => (c.chain ? [c.chain] : []))),
        actions: identity([...ACTIONS]),
        entities: { self: 'self', ada: 'ada' },
        norms: identity(TRUSTED_NORMS.map((n) => n.id)),
      },
    },
  });
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPersona(raw)))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  return {
    transfer: {
      castPassport: 'warren-calendar/1',
      sourceRole: person.id,
      person: personState,
      checkpoint: {
        schema: raw.schema,
        sourceMinute: raw.now,
        rng: structuredClone(raw.rng),
        sha256,
      },
    },
    raw,
  };
}
