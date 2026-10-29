/** Warren's HF4 boundary. Actor readings come only from public inspect; all changes use step. */
import {
  type ActionResolution,
  createPerson,
  createRun,
  exportRun,
  step as frameworkStep,
  type Input,
  inspect,
  type Offer,
  type PerceptData,
  type PersonAuthoring,
  type PersonView,
  type Result,
  type Run,
  type RunArchive,
  type RunSpec,
  restoreRun,
  type StepResult,
  type VisibleEvent,
} from '@adam0white/human-framework';
import frameworkPackage from '@adam0white/human-framework/package.json' with { type: 'json' };
import { castNorms } from './cast-norms.ts';
import { H, W } from './grid.ts';
import type { WarrenState } from './warren.ts';
export const FRAMEWORK_VERSION = frameworkPackage.version;
/** Diagnostic timings for each actual public step call; excludes host work and archive export. */
export type StepTiming = { wallMs: number; cpuMs: number };
let stepObserver: ((sample: StepTiming) => void) | undefined;
export function observeSteps(observer: (sample: StepTiming) => void): () => void {
  stepObserver = observer;
  return () => {
    stepObserver = undefined;
  };
}
function step(...args: Parameters<typeof frameworkStep>): ReturnType<typeof frameworkStep> {
  if (!stepObserver) return frameworkStep(...args);
  const start = performance.now(),
    cpu = typeof process !== 'undefined' ? process.cpuUsage() : undefined;
  try {
    return frameworkStep(...args);
  } finally {
    const elapsed = cpu ? process.cpuUsage(cpu) : undefined;
    stepObserver({
      wallMs: performance.now() - start,
      cpuMs: elapsed ? (elapsed.user + elapsed.system) / 1000 : 0,
    });
  }
}
export const MINUTE = 60_000;
export const DAY = 86_400_000;
export type HostParts = Extract<PersonView, { kind: 'host' }>['parts'][number];
export type Part<K extends HostParts['select']> = Extract<HostParts, { select: K }>['value'];
export type Commitment = Part<'agenda'>['commitments'][number];
export type PersonReading = {
  id: string;
  name: string;
  now: number;
  life: { bornAt: number; sex: 'male' | 'female' };
  body: Part<'body'>['state'];
  bodyReadout: Part<'body'>['readout'];
  skills: Record<string, { level: number }>;
  agenda: Part<'agenda'>;
  will: Part<'relationships'>;
  activity: Activity | null;
  events: VisibleEvent[];
};
export type Person = PersonReading;
export interface Affordance {
  id: string;
  action: string;
  label: string;
  duration: number;
  effort: number;
  focus?: number;
  targetId?: string;
  placeId?: string;
  with?: string[];
  alongside?: string[];
  mode?: 'awake' | 'sleep';
  skill?: { id: string; difficulty: number; domain?: 'general' | 'motor' | 'language' | 'knowledge' };
  advertises: Record<string, number>;
  tags?: string[];
  norms?: Offer['norms'];
  fulfills?: string[];
  diminishes?: string[];
  advances?: string[];
  jointId?: string;
  risk?: { chance: number; severity: number; kind: string };
  material?: number;
  requires?: Offer['demands']['requires'];
  followedBy?: { label?: string; duration: number; effort: number; focus?: number }[];
  forecastAt?: { comfortAt?: number; spentAt?: number };
  voidsBladder?: boolean;
}
export interface Activity {
  id: string;
  affordanceId: string;
  action: string;
  targetId?: string;
  affordance: Affordance;
  startedAt: number;
  endsAt: number;
  effort: number;
  focus: number;
  mode: 'awake' | 'sleep';
  reviewAt: number;
  protest?: boolean;
}
export interface Suggestion {
  voiceId: string;
  affordanceId?: string;
  action?: string;
  strength: number;
  since?: number;
  adviceId?: string;
  appeal?: string;
}
export interface SuggestionResolution {
  voiceId: string;
  verdict: 'assented' | 'complied' | 'deferred' | 'modified' | 'refused' | 'commanded';
  says: string;
  reason: string;
}
export interface DecisionRecord {
  narration?: string;
  review?: boolean;
  suggestion?: SuggestionResolution;
  suggestions?: SuggestionResolution[];
}
export interface Percept {
  at: number;
  channel: 'saw' | 'heard' | 'told' | 'felt' | 'outcome' | 'social';
  kind: string;
  actorId?: string;
  targetId?: string;
  placeId?: string;
  valence?: number;
  salience: number;
  summary: string;
  [key: string]: unknown;
}
export interface Outcome {
  affordanceId: string;
  action: string;
  targetId?: string;
  status: 'completed' | 'failed' | 'interrupted';
  at: number;
  needs?: Record<string, number>;
  percepts?: Percept[];
  summary?: string;
  quality?: number;
  fulfills?: string[];
  advances?: string[];
  material?: number;
  injury?: unknown;
  illness?: unknown;
  exposures?: { kind: string; amount?: number }[];
  practice?: unknown;
  voidedBladder?: boolean;
}
export interface SimEvent {
  kind: string;
  personId: string;
  at: number;
  withId?: string;
  [key: string]: unknown;
}
export interface World {
  observed?: (at: number) => void;
  converse: (speaker: Person, listener: Person) => false | { placeId: string };
  now: () => number;
  affordancesFor: (p: Person) => Affordance[];
  perceptsFor: (p: Person, since: number, until: number) => Percept[];
  scarcityFor: (p: Person) => number;
  beginOptions: (p: Person, o: Affordance, d: DecisionRecord) => undefined;
  resolve: (p: Person, a: Activity, reason: 'ended' | 'interrupted') => Outcome;
}
export const ageYears = (p: Pick<Person, 'now' | 'life'>) => (p.now - p.life.bornAt) / (365.25 * 1440);
export const readBody = (p: Person) => p.bodyReadout;
export function need<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code} ${r.error.path}: ${r.error.message}`);
  return r.value;
}
const runs = new WeakMap<WarrenState, Run>();
interface Runtime {
  at: number;
  revision: number;
  identities: Map<string, PersonAuthoring['identity']>;
}
const runtimes = new WeakMap<WarrenState, Runtime>();
function runtimeOf(s: WarrenState): Runtime {
  let runtime = runtimes.get(s);
  if (!runtime) {
    const identities = new Map(s.hf.initial.people.map((p) => [p.id, p.identity]));
    for (const tx of s.hf.history)
      for (const input of tx.inputs)
        if (input.kind === 'person.arrived')
          identities.set(input.payload.authored.id, input.payload.authored.identity);
    runtime = { at: s.hf.current.at, revision: s.hf.current.world.revision, identities };
    runtimes.set(s, runtime);
  }
  return runtime;
}
export function hfRunOf(s: WarrenState): Run {
  let run = runs.get(s);
  if (!run) {
    run = need(restoreRun(s.hf));
    runs.set(s, run);
  }
  return run;
}
export function archiveOf(s: WarrenState): RunArchive {
  return exportRun(hfRunOf(s)) as RunArchive;
}
export function syncReadings(s: WarrenState): void {
  const run = hfRunOf(s),
    runtime = runtimeOf(s),
    oldPeople = new Map(s.people.map((p) => [p.id, p]));
  const views = need(
    inspect(run, {
      perspective: { kind: 'host' },
      people: [...runtime.identities.keys()],
      select: ['summary', 'body', 'skills', 'agenda', 'relationships', 'events'],
      ...(s.hfEventCursor ? { afterEvent: s.hfEventCursor } : {}),
    }),
  );
  // The host's retained population order is part of a full save. A cold HF
  // archive may enumerate later arrivals in canonical input order instead.
  // Preserve every existing reading's order, then append actual new identities.
  const order = new Map(
    [...new Set([...oldPeople.keys(), ...runtime.identities.keys()])].map((id, i) => [id, i]),
  );
  s.people = [...views.people]
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((view) => {
      if (view.kind !== 'host') throw new Error('Host reading required');
      const part = <K extends HostParts['select']>(key: K): Part<K> => {
        const p = view.parts.find((p) => p.select === key);
        if (!p) throw new Error(`Missing ${key}`);
        return p.value as Part<K>;
      };
      const identity = runtime.identities.get(view.id)!;
      const body = part('body');
      const agenda = structuredClone(part('agenda'));
      for (const c of agenda.commitments) {
        c.from /= MINUTE;
        c.until /= MINUTE;
      }
      for (const g of agenda.goals) {
        g.adoptedAt /= MINUTE;
        g.lastAdvancedAt /= MINUTE;
        if (g.deadline !== undefined) g.deadline /= MINUTE;
      }
      return {
        id: view.id,
        name: identity.name,
        now: runtime.at / MINUTE,
        life: { bornAt: identity.birthAt / MINUTE, sex: identity.sex },
        body: structuredClone(body.state),
        bodyReadout: structuredClone(body.readout),
        skills: Object.fromEntries(part('skills').map((v) => [v.id, { level: v.competence }])),
        agenda,
        will: structuredClone(part('relationships')),
        activity: s.hfActive?.[view.id] ?? null,
        events: [...(oldPeople.get(view.id)?.events ?? []), ...part('events')].slice(-128),
      } as Person;
    });
}
export function authoredPerson(
  id: string,
  name: string,
  sex: 'female' | 'male' = 'female',
  at = 300 * MINUTE,
): PersonAuthoring {
  return {
    id,
    identity: { name, birthAt: at - 30 * 365 * DAY, sex },
    biography: [],
    origin: {
      kind: 'authored',
      basis: { kind: 'evidence', id: `author:${id}` },
      traits: { kind: 'explicit-authoring', evidence: { kind: 'evidence', id: `traits:${id}` } },
    },
    state: {
      traits: {
        honesty: 0.5,
        emotionality: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        conscientiousness: 0.5,
        openness: 0.5,
      },
      values: {
        benevolence: 0.5,
        universalism: 0.5,
        tradition: 0.5,
        conformity: 0.5,
        security: 0.5,
        achievement: 0.5,
        power: 0.5,
        hedonism: 0.5,
        stimulation: 0.5,
        selfDirection: 0.5,
      },
      body: {
        satiety: 0.8,
        hydration: 0.85,
        sleepPressure: 0.2,
        exertion: 0,
        fitness: 0.5,
        health: 1,
        pain: 0,
        sleepDebtHours: 0,
        depletion: 0,
        circadianPeakMs: 16 * 60 * MINUTE,
        asleep: false,
        since: at,
        doze: {
          context: { posture: 'upright', stimulation: 0.5 },
          basis: { kind: 'authored', author: 'world', at: at },
        },
        bladder: { fill: 0, pending: 0 },
        injuries: [],
        illnesses: [],
        exposures: [],
      },
      needs: {
        safety: 0.8,
        belonging: 0.7,
        esteem: 0.6,
        autonomy: 0.7,
        competence: 0.6,
        leisure: 0.6,
        meaning: 0.6,
      },
      skills: [],
      heldNorms: [],
      beliefs: [],
      consequences: [],
      sourceTrust: [],
      context: {
        scarcity: { kind: 'prior', value: 0, basis: 'engineering:source-zero-context' },
        smoking: { kind: 'unobserved' },
      },
      relationships: [],
      voices: [{ voiceId: 'player', trust: 0.5 }],
      agenda: {
        exemptions: { traveling: { kind: 'unobserved' }, illnessSeverity: { kind: 'unobserved' } },
        commitments: [],
        goals: [],
        precommitments: [],
        owed: [],
      },
      family: { contactCovered: [], aptitudes: {} },
      groups: [],
      reserve: {},
      retention: { trace: 32, chronicleDays: 120 },
      habits: [],
      expectations: [],
      affect: { mood: { valence: 0, arousal: 0.3 }, regulation: 0.3, emotions: [] },
      promptings: { reading: 'none', responses: [] },
      review: { style: 'accounting', atMsOfDay: 21 * 60 * MINUTE },
      bonds: { courtships: [], marriages: [] },
    },
  };
}

export const ACTIONS = [
  'talk-rest',
  'talk-disagreement',
  'test-close',
  'test-open',
  'building-assistance',
  'building-preparation',
  'care-ada',
  'carry-grain',
  'carry-spoil',
  'carve-door',
  'chat',
  'cook',
  'dig',
  'digging-advice',
  'discuss-cut',
  'drink',
  'eat',
  'equipment-check',
  'fetch-water',
  'forage',
  'hide',
  'household-work',
  'make-lamp',
  'open-door',
  'perimeter-watch',
  'play',
  'pray',
  'reap',
  'rest',
  'shelter',
  'show',
  'shut-door',
  'sleep',
  'sow',
  'store-check',
  'stores-assistance',
  'survey-route',
  'take',
  'talk-ada',
  'watch-running',
  'well-advice',
];
/** Real world identities must exist before retained memory is admitted. These facts
 * declare places/groups, never substitute people or kin for remembered locations. */
function openingWorldFacts(s: WarrenState, people: PersonAuthoring[]): RunSpec['world']['facts'] {
  const kinds = new Map<string, string>();
  const historicalEvidence = new Map<string, string>();
  for (const id of [
    'beds',
    'below',
    'surface',
    'hearth',
    'well',
    'spring',
    'door',
    'gorge',
    'face',
    'field',
    'hills',
    'store',
    'heap',
    'theirs',
  ])
    kinds.set(id, 'place');
  for (const house of s.houses) kinds.set(`house:${house.id}`, 'house');
  for (const id of ['travellers', 'riders', 'neighbours']) kinds.set(id, 'group');
  // A remembered cut/store/door target names a real cell in this hill's fixed grid.
  // Declare only needed cells, rather than copying thousands of facts into every step.
  for (const person of people) {
    const portable = person.portable?.person;
    if (portable?.version !== 2) continue;
    for (const episode of [...portable.retained.memory.episodes, ...portable.retained.memory.gists]) {
      const id = episode.targetId;
      if (id && /^(0|[1-9]\d*)$/.test(id) && Number(id) < W * H) kinds.set(id, 'hill-cell');
    }
  }
  for (const person of people) {
    const portable = person.portable?.person;
    if (!portable) continue;
    for (const reference of person.portable?.mapping.references ?? [])
      if (
        (reference.kind === 'entity' ||
          (reference.kind === 'source' && reference.target.startsWith('history:'))) &&
        !kinds.has(reference.target) &&
        !people.some((p) => p.id === reference.target)
      ) {
        kinds.set(
          reference.target,
          `historical-${reference.kind}:${portable.source.game}:${reference.source}`,
        );
        historicalEvidence.set(
          reference.target,
          `portable:${portable.castId}:${portable.castRevision}:${portable.source.game}:${portable.source.engine}:${reference.source}`,
        );
      }
  }
  return [...kinds]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, kind]) => ({
      id: `warren-entity:${id}`,
      subject: id,
      predicate: 'kind',
      value: kind,
      at: Math.round(s.minute * MINUTE),
      provenance: { source: 'warren', evidenceId: historicalEvidence.get(id) ?? `warren-opening-map:${id}` },
    }));
}
export function createWarrenRun(s: WarrenState, people: PersonAuthoring[]): void {
  const rememberedActions = new Set<string>(),
    rememberedSources = new Set<string>();
  for (const person of people)
    for (const reference of person.portable?.mapping.references ?? []) {
      if (reference.kind === 'action') rememberedActions.add(reference.target);
      if (reference.kind === 'source') rememberedSources.add(reference.target);
    }
  const definitions: RunSpec['definitions'] = {
    actions: [...new Set([...ACTIONS, ...rememberedActions])].map((id) => ({
      id,
      label: id,
      demands: { effort: 0, focus: 0, mode: 'awake', requires: {} },
      tags: [],
      norms: [],
    })),
    norms: castNorms(people),
    marriageCustoms: [],
    skills: ['digging', 'farming'].map((id) => ({ id, label: id, domain: 'motor' })),
    skillTransfers: [],
    methods: [],
    routines: [],
    sources: [
      ...people.map((p) => ({ type: 'person' as const, id: p.id })),
      { type: 'host', id: 'warren' },
      { type: 'voice', id: 'usta' },
      { type: 'voice', id: 'keeper-resident' },
      { type: 'voice', id: 'keeper-ada-talk' },
      { type: 'voice', id: 'keeper-cut' },
      ...[...rememberedSources]
        .filter(
          (id) =>
            ![
              'warren',
              'usta',
              'keeper-resident',
              'keeper-ada-talk',
              'keeper-cut',
              ...people.map((p) => p.id),
            ].includes(id),
        )
        .map((id) => ({ type: 'voice' as const, id })),
    ],
    lexicon: {
      names: Object.fromEntries(people.map((p) => [p.id, p.identity.name])),
      roles: { usta: 'the keeper' },
      prefer: 'name',
      actions: {},
    },
    calendar: {
      id: 'warren-calendar',
      epoch: { id: 'warren-opening', simulationAt: 0, dayIndex: 0, msOfDay: 0 },
      dayMs: DAY,
      days: [{ dayIndex: 0, start: 0, windows: [] }],
    },
  };
  const run = need(
    createRun({
      id: `warren:${s.seed}`,
      seed: s.seed,
      start: s.minute * MINUTE,
      host: { id: 'warren', edition: 'warren-hf4/1', schema: 'warren-hf4/1' },
      definitions,
      lifecycle: { kinPremises: [], kinScopes: [] },
      world: { revision: 0, facts: openingWorldFacts(s, people), hostState: {} },
    }),
  );
  for (const p of people) need(createPerson(run, p));
  runs.set(s, run);
  s.hf = archiveOf(s);
  syncReadings(s);
}
export function enqueue<K extends Input['kind']>(
  s: WarrenState,
  kind: K,
  payload: Extract<Input, { kind: K }>['payload'],
): void {
  const at = Math.round(s.minute * MINUTE) + 1;
  s.hfQueue.push({
    id: `host:${at}:${s.hfQueue.length}:${kind}`,
    at,
    source: { type: 'host', id: 'warren' },
    kind,
    payload,
  } as Input);
}
/** Late households already carry authored ties. Declare their actual identities in
 * partial public scopes before admission; this asserts no new kin premise or
 * completeness. Keep all authored people, marriages and generation draws exact. */
export function enqueueHouseholdArrival(s: WarrenState, people: PersonAuthoring[]): void {
  const first = people[0];
  if (!first) return;
  const current = archiveOf(s).current;
  const at = Math.round(s.minute * MINUTE) + 1;
  for (const other of people.slice(1)) {
    enqueue(s, 'lifecycle.received', {
      type: 'kin-premise',
      premises: [],
      scope: {
        id: `arrival-identities:${first.id}:${other.id}`,
        people: [
          { kind: 'entity', id: first.id },
          { kind: 'entity', id: other.id },
        ],
        at,
        kinRevision: current.lifecycle.kinRevision,
        premiseIds: [],
        degrees: 'source-two-step',
        completeness: 'partial',
        basis: { kind: 'evidence', id: `arrival:${first.id}:${other.id}` },
      },
      basis: {
        evidence: { kind: 'evidence', id: `arrival:${first.id}:${other.id}` },
        worldRevision: current.world.revision,
      },
    });
    s.hfQueue.at(-1)!.id = `arrival:0-identities:${at}:${other.id}`;
  }
  for (const authored of people) {
    enqueue(s, 'person.arrived', { authored, arrivalEvidenceId: `arrival:${authored.id}` });
    s.hfQueue.at(-1)!.id = `arrival:1-person:${at}:${authored.id}`;
  }
}
export function interruptPerson(c: { state: WarrenState }, p: Person, _at: number, reason: string): void {
  if (!p.activity) return;
  const activityId = p.activity.id;
  if (
    c.state.hfQueue.some(
      (input) =>
        input.kind === 'activity.interrupted' &&
        input.payload.person === p.id &&
        input.payload.activityId === activityId,
    )
  )
    return;
  enqueue(c.state, 'activity.interrupted', { person: p.id, activityId, reason });
}
export function sendInjury(
  s: WarrenState,
  p: Person,
  injury: Extract<Input<'body.received'>['payload']['receipt'], { type: 'injured' }>['injury'],
): void {
  enqueue(s, 'body.received', {
    person: p.id,
    evidenceId: `injury:${p.id}:${s.minute}`,
    receipt: { type: 'injured', injury: injury as never },
  });
}
export function offerFor(person: string, o: Affordance): Offer {
  return {
    id: o.id,
    actionId: o.action,
    label: o.label,
    person,
    durationMs: Math.max(1, Math.round(o.duration * MINUTE)),
    target: o.targetId,
    place: o.placeId,
    participants: o.with ?? [],
    alongside: o.alongside ?? [],
    demands: {
      effort: o.effort,
      focus: o.focus ?? 0,
      mode: o.mode ?? 'awake',
      requires: o.requires ?? {},
      ...(o.skill ? { skill: { ...o.skill, domain: o.skill.domain ?? 'general' } } : {}),
    },
    tags: o.tags ?? [],
    norms: o.norms ?? [],
    expected: {
      needs: o.advertises,
      material: o.material,
      risk: o.risk,
      voidsBladder: o.voidsBladder,
      followedBy: (o.followedBy ?? []).map((f) => ({ ...f, durationMs: Math.round(f.duration * MINUTE) })),
      provenance: ['authored:warren-hf4/1'],
    },
    fulfills: o.fulfills ?? [],
    advances: o.advances ?? [],
    diminishes: o.diminishes ?? [],
  };
}
export function perceptFor(p: Percept, id: string): PerceptData {
  const { at, demonstrates, advice, ...data } = p;
  return {
    ...data,
    id,
    occurredAt: Math.round(at * MINUTE),
    claims: p.claims ?? [],
    norms: p.norms ?? [],
    advice: ((advice ?? []) as { action: string; affordanceId?: string; strength?: number }[]).map(
      (a, i) => ({ ...a, adviceId: `${id}:advice:${i}` }),
    ),
    consequences: [],
    withdrawConsequences: [],
    witnesses: [],
    reports: [],
    provenance: [],
    ...(demonstrates
      ? {
          demonstrates: {
            skill: (demonstrates as { skill: string }).skill,
            level: (demonstrates as { level: number }).level,
            durationMs: Math.round((demonstrates as { minutes: number }).minutes * MINUTE),
            domain: 'motor',
          },
        }
      : {}),
  } as unknown as PerceptData;
}

export function heard(p: Person, text: string, at: number): boolean {
  return p.events.some(
    (e) =>
      e.data.kind === 'observation-attended' &&
      e.data.summary === text &&
      e.data.occurredAt >= at * MINUTE &&
      e.data.attention > 0,
  );
}
function decisionAt(p: Person, offer: Affordance): DecisionRecord {
  const e = p.events.findLast(
    (e) => e.data.kind === 'decision' && e.data.decision.chosenAffordanceId === offer.id,
  );
  if (!e || e.data.kind !== 'decision') return {};
  const convert = (r: NonNullable<typeof e.data.decision.suggestion>): SuggestionResolution => ({
    ...r,
    says: e.narration.map((l) => l.text).join(' ') || r.reason,
  });
  return {
    ...e.data.decision,
    narration: e.narration.map((l) => l.text).join(' '),
    suggestion: e.data.decision.suggestion ? convert(e.data.decision.suggestion) : undefined,
    suggestions: e.data.decision.suggestions?.map(convert),
  };
}
export function* stepWarren(
  s: WarrenState,
  makeWorld: (s: WarrenState) => World,
  to: number,
  suggestions: Record<string, Suggestion>,
  observeIdle?: (p: Person) => void,
): Generator<void, SimEvent[], void> {
  const run = hfRunOf(s),
    runtime = runtimeOf(s),
    at = Math.round(s.minute * MINUTE) + 1,
    until = Math.round(to * MINUTE);
  const resumed = s.hfPhase?.result;
  let target = s.hfPhase?.target ?? Math.min(until, Math.floor(at / MINUTE) * MINUTE + MINUTE);
  s.hfPhase ??= { from: s.minute, to, target, steps: 0, lastNote: s.notes.at(-1) };
  const world = makeWorld(s),
    inputs: Input[] = [];
  // One persisted millisecond ingress phase keeps later player inputs after the closed prior quantum.
  if (!resumed)
    for (const p of s.people) {
      if (!p.body.alive) continue;
      const prior = s.hfOffers[p.id]?.revision ?? 0,
        refuge = p.agenda.goals.findLast((g) => g.id === 'refuge' || g.id.startsWith('refuge-rally:')),
        offers = world.affordancesFor(p).map((o) => ({
          ...o,
          advances: o.advances?.map((id) => (id === 'refuge' && refuge ? refuge.id : id)),
        }));
      s.hfOffers[p.id] = { revision: prior + 1, offers };
      inputs.push({
        id: `offers:${p.id}:${at}`,
        at,
        source: { type: 'host', id: 'warren' },
        kind: 'offers.received',
        payload: { person: p.id, revision: prior + 1, offers: offers.map((o) => offerFor(p.id, o)) },
      });
      const percepts = world.perceptsFor(p, -1, at / MINUTE);
      if (percepts.length)
        inputs.push({
          id: `observations:${p.id}:${at}`,
          at,
          source: { type: 'host', id: 'warren' },
          kind: 'observation.received',
          payload: {
            person: p.id,
            evidenceId: `perception:${p.id}:${at}`,
            percepts: percepts.map((pc, i) => perceptFor(pc, `percept:${p.id}:${at}:${i}`)),
          },
        });
      inputs.push({
        id: `scarcity:${p.id}:${at}`,
        at,
        source: { type: 'host', id: 'warren' },
        kind: 'context.received',
        payload: {
          person: p.id,
          evidenceId: `scarcity:${p.id}:${at}`,
          context: { kind: 'scarcity', value: world.scarcityFor(p) },
        },
      });
      const suggestion = suggestions[p.id];
      if (suggestion)
        inputs.push({
          id: `suggestion:${p.id}:${at}`,
          at,
          source: { type: 'host', id: 'warren' },
          kind: 'suggestion.received',
          payload: {
            person: p.id,
            received: {
              kind: 'ordinary',
              suggestion: {
                ...suggestion,
                since: Math.round((suggestion.since ?? s.minute) * MINUTE),
                adviceId: `${suggestion.voiceId}:${suggestion.since ?? s.minute}`,
              } as never,
            },
          },
        });
      if (!p.activity) {
        observeIdle?.(p);
        inputs.push({
          id: `decision:${p.id}:${at}`,
          at,
          source: { type: 'host', id: 'warren' },
          kind: 'decision.requested',
          payload: {
            person: p.id,
            reason: 'hill opportunities',
            treatment: 'ordinary',
            offerRevision: prior + 1,
          },
        });
      }
    }
  if (!resumed) {
    inputs.push(...s.hfQueue);
    s.hfQueue = [];
  }
  let result = resumed ?? need(step(run, JSON.parse(JSON.stringify({ until: target, inputs }))));
  let alreadyRead = !!resumed;
  for (const input of inputs)
    if (input.kind === 'person.arrived')
      runtime.identities.set(input.payload.authored.id, input.payload.authored.identity);
  const events: SimEvent[] = s.hfPhase.events ?? [];
  for (let limit = 0; limit < 10000; limit++) {
    if (!alreadyRead) {
      runtime.at = result.at;
      syncReadings(s);
      if (result.events.length) s.hfEventCursor = result.events.at(-1)!.id;
      s.minute = Math.floor(runtime.at / MINUTE);
      makeWorld(s).observed?.(runtime.at / MINUTE);
      s.hfPhase = {
        ...s.hfPhase!,
        to,
        target,
        steps: s.hfPhase!.steps + 1,
        events,
        result: JSON.parse(JSON.stringify(result)) as StepResult,
      };
      yield;
    } else alreadyRead = false;
    for (const e of result.events) {
      if (e.data.kind === 'claim-told')
        events.push({
          kind: 'converse',
          personId: e.data.speaker,
          withId: e.data.listener,
          at: e.at / MINUTE,
        });
      else if (e.person) events.push({ kind: e.data.kind, personId: e.person, at: e.at / MINUTE });
    }
    if (result.boundary.type === 'until') {
      if (target === until) return events;
      target = Math.min(until, target + MINUTE);
      result = need(step(run, { until: target, inputs: [] }));
      continue;
    }
    const { hf, ...host } = s;
    const candidate = { ...structuredClone(host), hf } as WarrenState,
      receipts: Input[] = [];
    for (const request of [...result.boundary.requests].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )) {
      candidate.minute = request.boundaryAt / MINUTE;
      const revision =
        runtime.revision +
        receipts.filter((r) => r.kind === 'action.resolved' && r.payload.worldChange).length;
      const base = { requestId: request.id, requestHash: request.requestHash, worldRevision: revision };
      if (request.kind === 'communication') {
        const w = makeWorld(candidate),
          speaker = candidate.people.find((p) => p.id === request.speaker);
        const received = request.recipients.flatMap((id) => {
          const listener = candidate.people.find((p) => p.id === id);
          return speaker && listener && w.converse(speaker, listener)
            ? [
                {
                  recipient: id,
                  evidenceId: `hearing:${request.id}:${id}`,
                  attention: 1,
                  itemIds: request.items.map((i) => i.id),
                },
              ]
            : [];
        });
        receipts.push({
          id: `receipt:${request.id}`,
          at: request.boundaryAt,
          source: { type: 'host', id: 'warren' },
          kind: 'communication.resolved',
          payload: {
            ...base,
            speaker: request.speaker,
            emittedItemIds: received.length ? request.items.map((i) => i.id) : [],
            received,
          },
        });
        continue;
      }
      const p = candidate.people.find((p) => p.id === request.person);
      if (!p) throw new Error('Missing requested actor');
      p.now = request.boundaryAt / MINUTE;
      const w = makeWorld(candidate);
      let payload: ActionResolution;
      const common = {
        ...base,
        person: p.id,
        activityId: request.activityId,
        stage: request.stage,
        observations: [],
      };
      if (request.stage === 'start') {
        const offered = candidate.hfOffers[p.id]?.offers.find((o) => o.id === request.offerId);
        const current = w.affordancesFor(p).find((o) => o.id === request.offerId);
        if (!offered || !current) payload = { ...common, disposition: 'rejected' };
        else {
          const activity: Activity = {
            id: request.activityId,
            affordanceId: offered.id,
            action: offered.action,
            targetId: offered.targetId,
            affordance: offered,
            startedAt: p.now,
            endsAt: p.now + Math.round(offered.duration * MINUTE) / MINUTE,
            reviewAt: p.now + Math.round(offered.duration * MINUTE) / MINUTE,
            effort: offered.effort,
            focus: offered.focus ?? 0,
            mode: offered.mode ?? 'awake',
          };
          candidate.hfActive[p.id] = activity;
          w.beginOptions(p, offered, decisionAt(p, offered));
          payload = { ...common, disposition: 'accepted' };
        }
      } else {
        const active = candidate.hfActive[p.id];
        if (!active || active.id !== request.activityId)
          throw new Error('Missing accepted physical activity');
        const actual = w.resolve(p, active, request.stage === 'interrupt' ? 'interrupted' : 'ended');
        delete candidate.hfActive[p.id];
        if (actual.status === 'completed' && active.action === 'chat' && active.targetId) {
          const listener = candidate.people.find((q) => q.id === active.targetId);
          if (listener && w.converse(p, listener)) {
            const view = need(
              inspect(run, { perspective: { kind: 'host' }, people: [p.id], select: ['beliefs'] }),
            ).people[0];
            const beliefs =
              view?.kind === 'host' ? view.parts.find((part) => part.select === 'beliefs') : undefined;
            enqueue(candidate, 'conversation.requested', {
              speaker: p.id,
              listener: listener.id,
              topicIds: beliefs?.select === 'beliefs' ? beliefs.value.map((b) => b.prop) : [],
              maxClaims: 2,
              temptations: [],
              loyalWarning: false,
            });
          }
        }
        if (request.stage === 'finish' && actual.status === 'interrupted') actual.status = 'failed';
        const needs = actual.needs ?? {};
        const physiological = new Set(['food', 'water', 'sleep', 'rest', 'relief']);
        payload = {
          ...common,
          disposition: actual.status,
          outcome: {
            activityId: active.id,
            offerId: active.affordanceId,
            actionId: active.action,
            target: active.targetId,
            start: Math.round(active.startedAt * MINUTE),
            end: request.boundaryAt,
            status: actual.status,
            evidenceId: `outcome:${request.id}`,
            summary: actual.summary,
            quality: actual.quality,
            actual: {
              psychological: Object.fromEntries(Object.entries(needs).filter(([k]) => !physiological.has(k))),
              consumed: {
                ...(needs.food ? { food: needs.food } : {}),
                ...(needs.water ? { water: needs.water } : {}),
              },
              exposures: (actual.exposures ?? []).map((e, i) => ({
                agent: e.kind,
                amount: e.amount ?? 1,
                exposureId: `exposure:${request.id}:${i}`,
              })),
              observedProgress: [],
              injury: actual.injury as never,
              illness: actual.illness as never,
              material: actual.material,
              voidedBladder: actual.voidedBladder,
            },
            fulfills: actual.fulfills ?? active.affordance.fulfills ?? [],
            advances: actual.advances ?? active.affordance.advances ?? [],
          },
          observations: (actual.percepts ?? []).length
            ? [
                {
                  person: p.id,
                  percepts: actual.percepts!.map((pc, i) =>
                    perceptFor(pc, `outcome-percept:${request.id}:${i}`),
                  ),
                },
              ]
            : [],
        };
      }
      if (payload.disposition !== 'rejected')
        payload.worldChange = {
          expectedRevision: revision,
          revision: revision + 1,
          put: [],
          remove: [],
          hostState: { active: Object.keys(candidate.hfActive) },
        };
      receipts.push({
        id: `receipt:${request.id}`,
        at: request.boundaryAt,
        source: { type: 'host', id: 'warren' },
        kind: 'action.resolved',
        payload,
      });
    }
    const due = candidate.hfQueue.filter((i) => i.at <= target);
    candidate.hfQueue = candidate.hfQueue.filter((i) => i.at > target);
    result = need(step(run, JSON.parse(JSON.stringify({ until: target, inputs: [...receipts, ...due] }))));
    for (const receipt of receipts) {
      if (receipt.kind !== 'action.resolved') continue;
      const settled = result.events.find(
        (e) => e.data.kind === 'action-settled' && e.data.requestId === receipt.payload.requestId,
      );
      if (
        !settled ||
        settled.data.kind !== 'action-settled' ||
        settled.data.disposition !== receipt.payload.disposition
      )
        throw new Error('HF did not accept the staged action receipt');
    }
    runtime.revision += receipts.filter((r) => r.kind === 'action.resolved' && r.payload.worldChange).length;
    const oldMinute = s.minute;
    Object.assign(s, candidate);
    s.minute = oldMinute;
  }
  throw new Error('Warren request boundary budget exhausted');
}
