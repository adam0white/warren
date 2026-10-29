import { NARRATION_TEMPLATES, replay as replayHF } from '@adam0white/human-framework';
import { expect, it } from 'vitest';
import { act, advance, load, newGame, replay, save } from '../src/sim/game.ts';
import { residentReply } from '../src/sim/hf4.ts';
import { phrasebookFor, replyReason } from '../src/sim/voice.ts';

it('authors four distinct alternatives with exactly HF’s required slots for every resident', () => {
  const people = newGame(7).s.people;
  const book = phrasebookFor(people);
  const slots = (s: string) => [...new Set(s.match(/\{[^}]+\}/g) ?? [])].sort();
  for (const table of [book.wordings, ...Object.values(book.voices)])
    for (const [key, alternatives] of Object.entries(table)) {
      expect(new Set(alternatives).size).toBeGreaterThanOrEqual(4);
      const defaults = NARRATION_TEMPLATES[key as keyof typeof NARRATION_TEMPLATES];
      for (const line of alternatives) expect(slots(line)).toEqual(slots(defaults[0] ?? ''));
    }
  expect(new Set(Object.values(book.voices).map((v) => JSON.stringify(v))).size).toBe(6);
  for (const person of people) {
    for (const reason of ['distrust', 'busy', 'unavailable', 'need:rest', 'need:food', 'duty:x', 'norm:x'])
      expect(new Set([0, 1, 2, 3].map((i) => replyReason(person.id, reason, i))).size).toBe(4);
    expect(replyReason(person.id, 'unknown-code', 0)).toBe('');
  }
});

it('uses actual HF suggestion narration and preserves complete save and playtest replay', () => {
  const game = newGame(7, '0.7.0', undefined, 'warren-rest/1');
  act(game, { verb: 'bell' });
  advance(game, 360);
  expect(game.s.answers.length).toBeGreaterThan(0);
  const before = save(game);
  for (const person of game.s.people) {
    for (const event of person.events.filter((e) => e.data.kind === 'suggestion-resolved')) {
      if (event.data.kind !== 'suggestion-resolved') continue;
      const text = residentReply(person, event);
      if (['asleep', 'dead'].includes(event.data.resolution.reason)) {
        expect(text).toBe('');
        continue;
      }
      expect(text).toContain(event.narration[0]?.text);
      expect(text).not.toMatch(/need:|unavailable|distrust|\{\w+\}/);
    }
  }
  expect(save(game)).toEqual(before);
  expect(save(load(before))).toEqual(before);
  expect(
    save(
      replay(
        before.seed,
        before.inputs,
        before.minute,
        before.game,
        before.chapter,
        before.config,
        before.phase,
      ),
    ),
  ).toEqual(before);
  const verified = replayHF(before.state.hf);
  expect(verified.ok && verified.value.verified).toBe(true);
  if (verified.ok) expect(verified.value.fullHash).toBe(before.state.hf.hashes.full);
  expect(() => load({ ...before, framework: '4.8.1' })).toThrow(/start fresh/i);
});
