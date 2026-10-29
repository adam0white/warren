import { describe, expect, it } from 'vitest';
import { botStep, newBot } from '../src/sim/bot.ts';
import { act, advance, fingerprint, newGame, replay, save, stateJson } from '../src/sim/game.ts';
import { rallyBlock, refugeGoal } from '../src/sim/rally.ts';

function opening() {
  // Explicit authored weakened-goal fixture; no live actor state is changed.
  const game = newGame(1476719286, '0.7.0', undefined, 'warren-rest/2', (person) => {
    const authored = structuredClone(person);
    for (const goal of authored.state.agenda.goals)
      if (goal.id === 'refuge') {
        goal.importance = 0.1;
        goal.baseImportance = 0.7;
      }
    return authored;
  });
  game.chapter = { version: 'warren-hf4-cast/1', inputs: [], claims: [], initial: stateJson(game.s) };
  botStep(game, newBot());
  return game;
}
describe('HF4 refuge goal request', () => {
  it('admits the walk as goal inputs, preserves cooldown and replays exactly', () => {
    const game = opening();
    expect(rallyBlock(game.s)).toBeUndefined();
    expect(act(game, { verb: 'rally' })).toBe(true);
    expect(rallyBlock(game.s)).toMatch(/three days/);
    expect(act(game, { verb: 'rally' })).toBe(false);
    advance(game, game.s.minute + 30);
    const goal = refugeGoal(game.s.people.find((person) => person.id === 'meryem')!);
    expect(goal?.id).toMatch(/^refuge-rally:/);
    expect(game.inputs.filter((input) => input.verb === 'rally')).toHaveLength(1);
    const exported = save(game);
    expect(
      fingerprint(
        replay(
          exported.seed,
          exported.inputs,
          exported.minute,
          exported.game,
          exported.chapter,
          exported.config,
          exported.phase,
        ).s,
      ),
    ).toBe(exported.fingerprint);
  });
  it('does not offer a walk while riders are present', () => {
    const game = opening();
    game.s.raids[1]!.stage = 'riders';
    const before = fingerprint(game.s);
    expect(act(game, { verb: 'rally' })).toBe(false);
    expect(fingerprint(game.s)).toBe(before);
  });
});
