/** Native authority is a closed creation/replay contract, not a checksum. SDK
 * envelopes provide integrity and admission data, not authentication of authors.
 * No arbitrary caller-supplied opening or unsupported historical factory is used. */
import {
  canonicalCast,
  canonicalPersona,
  closePersonaBranch,
  type PersonaEnvelope,
  validatePersona,
} from '@adam0white/lab-client';
import { authoringFor, portableOf, project } from './cast.ts';
import { type Game, load, newGame, replay, type Saved, save, stateJson } from './game.ts';
import { archiveOf, FRAMEWORK_VERSION } from './hf4.ts';
import { refusePuzzlePublication } from './maryam-puzzle.ts';
import { CAST_IDS } from './people.ts';

const equal = (a: unknown, b: unknown) => canonicalPersona(a) === canonicalPersona(b);
const fail = () =>
  Error(
    'This hill does not match its complete creation, input and permission history. Keep the original notebook. No shared record was written.',
  );
const localSource = (source: PersonaEnvelope['source']) =>
  source.game === 'warren' && source.engine === FRAMEWORK_VERSION && source.rules === 'warren-hf4-1';

/** Compare all JSON fields, including the complete public HF Run archive. */
export function assertHistory(g: Game): void {
  const body = stateJson(g.s);
  const c = g.chapter;
  if (c) {
    if (
      c.version !== 'warren-hf4-cast/1' ||
      !Array.isArray(c.inputs) ||
      !Array.isArray(c.claims) ||
      c.inputs.length > 6 ||
      c.claims.length > 6 ||
      new Set(c.inputs.map((p) => p.castId)).size !== c.inputs.length ||
      new Set(c.claims.map((p) => p.castId)).size !== c.claims.length
    )
      throw fail();
    const opening = newGame(g.s.seed, g.s.edition, undefined, g.s.next?.config);
    const expected = newGame(
      g.s.seed,
      g.s.edition,
      undefined,
      g.s.next?.config,
      authoringFor(c.inputs, archiveOf(opening.s).initial.spec.start),
    );
    if (!equal(c.initial, stateJson(expected.s))) throw fail();
  }
  compareReplay(g, body);
}

/** Reading a self-consistent supplied opening does not grant source authority. */
export function assertReplay(g: Game): void {
  compareReplay(g, stateJson(g.s));
}

function compareReplay(g: Game, body: ReturnType<typeof stateJson>): void {
  const phase = body.hfPhase;
  const recreated = replay(
    g.s.seed,
    g.inputs,
    g.s.minute,
    g.s.edition,
    g.chapter,
    g.s.next?.config,
    phase ? { from: phase.from, to: phase.to, steps: phase.steps } : undefined,
  );
  if (!equal(body, stateJson(recreated.s))) throw fail();
}

/** Validate each incoming record before admission so one refusal stays local. */
export async function validateIncoming(input: PersonaEnvelope): Promise<void> {
  await validatePersona(input);
  portableOf(input);
  if (input.source.game === 'warren' && !localSource(input.source)) throw fail();
}

async function validateClaims(g: Game): Promise<void> {
  if (g.nativeReturnHeads && Object.keys(g.nativeReturnHeads).length) throw fail();
  const c = g.chapter;
  if (!c) return;
  for (const input of c.inputs) {
    await validateIncoming(input);
    // Published HF admission owns foreign mapping. Warren can additionally
    // recognize its own exact producer metadata; a rewritten rules label fails.
    if (!c.claims.some((p) => p.castId === input.castId)) throw fail();
  }
  for (const claim of c.claims) {
    await validatePersona(claim);
    if (
      !Object.values(CAST_IDS).includes(claim.castId) ||
      claim.terminal ||
      claim.castRevision !== canonicalCast(claim.castId).revision
    )
      throw fail();
    const input = c.inputs.find((p) => p.castId === claim.castId);
    if (input) {
      if (
        claim.branchId !== input.branchId ||
        claim.parentRevision !== input.revision ||
        !equal(claim.source, input.source) ||
        !equal(claim.transfer, { ...input.transfer, portableClaim: { game: 'warren' } })
      )
        throw fail();
    } else if (
      claim.parentRevision !== null ||
      !localSource(claim.source) ||
      !equal(claim.transfer, { castPassport: 'warren-hf4-active/1', portableClaim: { game: 'warren' } })
    )
      throw fail();
  }
}

export type SourceReceipt = { version: 'warren-hf4-source/1'; head: PersonaEnvelope; saved: Saved };
/** Flat source closure: each receipt keeps the actual full producer, without
 * nesting the same archive map once per checkpoint. The game retains the map. */
export function sourceReceipt(g: Game, head: PersonaEnvelope): SourceReceipt {
  const saved = save(g);
  delete saved.sourceArchives;
  return { version: 'warren-hf4-source/1', head: structuredClone(head), saved };
}

async function validateOwned(g: Game, cast?: string): Promise<void> {
  const archives = g.sourceArchives ?? {};
  const visiting = new Set<string>();
  const checked = new Set<string>();
  const verify = async (head: PersonaEnvelope): Promise<void> => {
    await validatePersona(head);
    if (checked.has(head.revision)) return;
    // The released local-only fresh path retained root claims without a chapter.
    // Its opening is still rebuilt from the seed, never from a supplied body.
    const releasedLocalRoot =
      !g.chapter &&
      head.parentRevision === null &&
      !head.terminal &&
      localSource(head.source) &&
      head.castRevision === canonicalCast(head.castId).revision &&
      Object.values(CAST_IDS).includes(head.castId) &&
      equal(head.transfer, { castPassport: 'warren-hf4-active/1', portableClaim: { game: 'warren' } });
    if (releasedLocalRoot) {
      checked.add(head.revision);
      return;
    }
    const claim = g.chapter?.claims.find((p) => p.revision === head.revision);
    if (claim) {
      if (!equal(head, claim)) throw fail();
      checked.add(head.revision);
      return;
    }
    if (visiting.has(head.revision)) throw fail();
    visiting.add(head.revision);
    const receipt = archives[head.revision] as SourceReceipt | undefined;
    if (
      !receipt ||
      receipt.version !== 'warren-hf4-source/1' ||
      !equal(receipt.head, head) ||
      !localSource(head.source) ||
      receipt.saved.fileOrigin
    )
      throw fail();
    const producer = load(receipt.saved);
    // A valid independent producer is not necessarily an ancestor of this hill.
    // Bind the complete opening and ordered input prefix, not just the claim ID.
    if (
      producer.s.seed !== g.s.seed ||
      producer.s.edition !== g.s.edition ||
      producer.s.next?.config !== g.s.next?.config ||
      producer.s.minute > g.s.minute ||
      !equal(producer.chapter, g.chapter) ||
      !equal(producer.inputs, g.inputs.slice(0, producer.inputs.length))
    )
      throw fail();
    assertHistory(producer);
    await validateClaims(producer);
    const parent = producer.ownedHeads?.[head.castId];
    if (
      !parent ||
      parent.revision !== head.parentRevision ||
      parent.branchId !== head.branchId ||
      parent.castId !== head.castId ||
      parent.castRevision !== head.castRevision ||
      parent.terminal
    )
      throw fail();
    await verify(parent);
    const who = Object.keys(CAST_IDS).find((id) => CAST_IDS[id] === head.castId);
    const person = producer.s.people.find((p) => p.id === who);
    if (!person) throw fail();
    if (person.body.alive) {
      if (head.terminal || !equal(head.transfer, (await project(producer.s, person.id)).transfer))
        throw fail();
    } else if (!equal(head, await closePersonaBranch(parent, head.source, producer.s.minute * 60_000)))
      throw fail();
    visiting.delete(head.revision);
    checked.add(head.revision);
  };
  for (const [castId, head] of Object.entries(g.ownedHeads ?? {})) {
    if (cast && castId !== cast) continue;
    if (head.castId !== castId) throw fail();
    await verify(head);
  }
}

/** The closure cancels async work if any source, authority or archive bytes change.
 * It grants no authentication to an independently rewritten self-consistent tape. */
export async function validateSource(g: Game, publication = false, cast?: string): Promise<() => boolean> {
  const identity = () => canonicalPersona(save(g));
  const captured = identity();
  assertHistory(g);
  await validateClaims(g);
  await validateOwned(g, cast);
  if (publication) {
    if (g.fileOrigin) throw fail();
    refusePuzzlePublication(g.s);
  }
  if (identity() !== captured) throw fail();
  return () => identity() === captured;
}
