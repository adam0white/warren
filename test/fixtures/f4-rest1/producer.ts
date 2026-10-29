import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const source = process.argv[2];
const { act, advance, newGame, save, stateJson } = (await import(
  pathToFileURL(`${source}/src/sim/game.ts`).href
)) as typeof import('../../../src/sim/game.ts');
const { idx, K, SURF } = (await import(
  pathToFileURL(`${source}/src/sim/grid.ts`).href
)) as typeof import('../../../src/sim/grid.ts');
const out = process.argv[3] + '/';
const rows = [];
for (const mode of ['marked', 'refusal'] as const) {
  const opening = newGame(7, '0.7.0', undefined, 'warren-rest/1', (p) =>
    mode !== 'refusal' || p.id !== 'meryem'
      ? p
      : {
          ...p,
          state: {
            ...p.state,
            values: { ...p.state.values, security: 0, achievement: 1, selfDirection: 1 },
            needs: { ...p.state.needs, safety: 1, competence: 0, meaning: 0, autonomy: 0 },
          },
        },
  );
  const face = idx(15, SURF + 3);
  opening.s.hill.kind[face] = K.loose;
  opening.s.hill.known[face] = 1;
  const g = newGame(
    7,
    '0.7.0',
    { version: 'warren-hf4-cast/1', inputs: [], claims: [], initial: stateJson(opening.s) },
    'warren-rest/1',
  );
  assert(act(g, { verb: 'chalk', cells: [face], on: true }));
  const prefix = out + 'recovery-warren-opus-fix-f4-' + mode;
  if (mode === 'refusal') {
    assert(act(g, { verb: 'discuss-cut' }));
    for (let n = 0; n < 32 && !g.s.next!.discussion!.exchange; n++) advance(g, g.s.minute + 30);
    assert(g.s.next!.discussion!.exchange, 'actual opposed heard choices');
    const who = g.s.next!.discussion!.statements[0]!.listener;
    assert(act(g, { verb: 'reply-refusal', who }));
    assert.equal(g.s.refusalReply!.endedAt, undefined);
    const before = JSON.stringify(save(g));
    assert.equal(act(g, { verb: 'discuss-cut' }), false);
    assert.equal(JSON.stringify(save(g)), before);
  }
  writeFileSync(prefix + '-native.json', JSON.stringify(save(g)));
  advance(g, g.s.minute + 60);
  writeFileSync(prefix + '-next.json', JSON.stringify(save(g)));
  if (mode === 'marked') assert.equal(g.s.next!.discussion, undefined);
  rows.push({
    mode,
    minute: g.s.minute,
    people: g.s.people.length,
    discussion: g.s.next!.discussion,
    refusal: g.s.refusalReply,
  });
}
writeFileSync(
  out + 'recovery-warren-opus-fix-f4-producer-receipt.json',
  JSON.stringify(
    {
      source: 'f4c0df3f6def6d532aaa20c329e9b775ad15e9a1',
      framework: '4.10.0',
      scope:
        'Authored terrain and labelled public Meryem initial-value control; all subsequent choices/hearing are actual HF. Not a player round.',
      rows,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    rows.map((r) => ({
      mode: r.mode,
      minute: r.minute,
      people: r.people,
      exchange: r.discussion?.exchange,
      refusal: r.refusal?.who,
    })),
  ),
);
