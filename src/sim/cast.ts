/** HF owns retained person state; the shelf owns transport and compare-and-swap. */
import {
  inspect,
  type PersonAuthoring,
  type PortablePerson,
  validatePortablePerson,
} from '@adam0white/human-framework';
import { canonicalCast, type PersonaEnvelope } from '@adam0white/lab-client';
import { ACTIONS, archiveOf, hfRunOf } from './hf4.ts';
import { refusePuzzlePublication } from './maryam-puzzle.ts';
import { CAST_IDS } from './people.ts';
import { refuseTrialPublication } from './tariq-trial.ts';
import type { WarrenState } from './warren.ts';

export interface Chapter {
  version: 'warren-hf4-cast/1';
  inputs: PersonaEnvelope[];
  claims: PersonaEnvelope[];
  initial: WarrenState;
}
const SOURCE_ROLES: Record<string, Record<string, string>> = {
  warren: CAST_IDS,
  well: { maryam: CAST_IDS.maryam!, tariq: CAST_IDS.tariq! },
  watch: { kian: CAST_IDS.kian!, tamar: CAST_IDS.tamar!, meryem: CAST_IDS.meryem! },
  valley: { 'yusuf-usta': CAST_IDS.yusuf!, 'meryem-visitor': CAST_IDS.meryem!, maryam: CAST_IDS.maryam! },
};
export function portableOf(envelope: PersonaEnvelope): PortablePerson {
  const portable = validatePortablePerson(envelope.transfer.portable);
  const cast = canonicalCast(envelope.castId);
  if (
    envelope.terminal ||
    portable.version !== 2 ||
    envelope.castRevision !== cast.revision ||
    portable.castId !== envelope.castId ||
    portable.castRevision !== envelope.castRevision ||
    portable.source.game !== envelope.source.game ||
    portable.source.engine !== envelope.source.engine ||
    !cast.games.includes(envelope.source.game) ||
    !cast.games.includes('warren') ||
    envelope.transfer.castPassport !== `hf-portable-person/${portable.version}` ||
    !/^4\./.test(portable.source.engine) ||
    (portable.source.personId !== envelope.castId &&
      SOURCE_ROLES[portable.source.game]?.[portable.source.personId] !== envelope.castId)
  )
    throw Error(
      'This saved person cannot continue in this hill. Keep the source chapter or export it. Start a fresh hill to use new people.',
    );
  if (envelope.transfer.portableClaim)
    throw Error('This person still belongs to another chapter. Continue or export that chapter first.');
  return portable;
}
/** Explicit retained vocabulary preserves foreign history without claiming its places
 * or people are present in this hill. Unknown actions remain historical duties. */
function retainedReferences(portable: PortablePerson, person: string) {
  type Kind = 'action' | 'entity' | 'source' | 'norm' | 'proposition';
  const references: { kind: Kind; source: string; target: string }[] = [];
  if (portable.version !== 2) return references;
  const declared = new Set<string>();
  const add = (kind: Kind, id: string | undefined) => {
    if (!id || declared.has(`${kind}:${id}`)) return;
    declared.add(`${kind}:${id}`);
    if ((kind === 'entity' || kind === 'source') && (id === 'self' || id === portable.source.personId)) {
      if (id !== 'self') references.push({ kind, source: id, target: person });
      return;
    }
    const foreign = portable.source.game !== 'warren';
    const historical =
      (foreign && (kind === 'entity' || kind === 'source')) || (kind === 'action' && !ACTIONS.includes(id));
    references.push({
      kind,
      source: id,
      target: historical ? `history:${portable.source.game}:${encodeURIComponent(id)}` : id,
    });
  };
  const memory = portable.retained.memory;
  for (const episode of [...memory.episodes, ...memory.gists]) {
    add('action', episode.action);
    for (const id of [episode.actorId, episode.targetId, episode.placeId]) add('entity', id);
    add('source', episode.voiceId);
  }
  for (const id of Object.keys(memory.sourceTrust)) add('source', id);
  for (const belief of memory.beliefs) {
    add('proposition', belief.prop);
    for (const source of belief.sources) add('source', source.id);
    add('source', belief.provenance?.origin);
    add('source', belief.provenance?.firstFrom);
  }
  for (const row of memory.contradictions) {
    add('source', row.sourceId);
    add('proposition', row.prop);
  }
  for (const row of memory.expectations) {
    const actions = [
      ...new Set([
        ...ACTIONS,
        ...[...memory.episodes, ...memory.gists].flatMap((e) => (e.action ? [e.action] : [])),
      ]),
    ];
    if (actions.includes(row.key)) add('action', row.key);
    else {
      const matches = actions.filter((action) => row.key.startsWith(`${action}@`));
      if (matches.length !== 1)
        throw Error('This remembered expectation cannot be mapped here. Keep the source chapter.');
      const action = matches[0]!;
      add('action', action);
      add('entity', row.key.slice(action.length + 1));
    }
  }
  for (const duty of [...portable.retained.agenda.commitments, ...portable.retained.agenda.owed]) {
    for (const action of [...duty.actions, ...(duty.violatedBy ?? [])]) {
      add('action', action);
    }
    if ('toId' in duty) add('entity', duty.toId);
    if ('targetId' in duty) add('entity', duty.targetId);
    add('norm', duty.normId);
  }
  return references;
}
/** The complete admission is retained in the game export. HF validates all references. */
export function authoringFor(envelopes: PersonaEnvelope[], startMs: number) {
  const incoming = new Map(envelopes.map((envelope) => [envelope.castId, portableOf(envelope)]));
  if (incoming.size !== envelopes.length) throw Error('The continuing group contains a person twice.');
  return (opening: PersonAuthoring): PersonAuthoring => {
    const castId = CAST_IDS[opening.id];
    const portable = castId && incoming.get(castId);
    if (!portable) return opening;
    const result = structuredClone(opening);
    if (portable.version === 2) {
      result.biography = [];
      result.state.beliefs = [];
      result.state.expectations = [];
      result.state.sourceTrust = [];
      result.state.heldNorms = [];
      result.state.agenda.commitments = [];
      result.state.agenda.owed = [];
      result.state.agenda.goals = [];
      result.state.agenda.precommitments = [];
    }
    result.identity.castId = castId;
    result.portable = {
      person: portable,
      mapping: {
        offsetMs: portable.version === 2 ? startMs - portable.retained.at : 0,
        references: retainedReferences(portable, opening.id),
      },
    };
    return result;
  };
}
export async function project(s: WarrenState, who: string) {
  refusePuzzlePublication(s);
  refuseTrialPublication(s);
  if (s.hfQueue.length || s.hfPhase)
    throw Error(
      'This hill still has inputs waiting for its people. Continue playing before saving shared history.',
    );
  const castId = CAST_IDS[who];
  if (!castId) throw Error('This person has no shared cast identity.');
  const cast = canonicalCast(castId);
  const result = inspect(hfRunOf(s), {
    perspective: { kind: 'host' },
    people: [who],
    select: ['persona'],
    portable: { person: who, castId, castRevision: cast.revision },
  });
  if (!result.ok) throw Error(result.error.message);
  const person = result.value.people[0];
  if (!person || person.kind !== 'host') throw Error('The person could not be projected.');
  const part = person.parts.find((part) => part.select === 'persona');
  if (!part || part.select !== 'persona') throw Error('The retained person is unavailable.');
  const portable = validatePortablePerson(part.value);
  return {
    transfer: { castPassport: `hf-portable-person/${portable.version}`, portable },
    raw: archiveOf(s),
  };
}
