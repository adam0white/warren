/** Explicit new-story date fixture. No elapsed life, earned reward or prior journey is claimed. */
import { type Game, type NextConfig, stateJson } from '../src/sim/game.ts';
import { newWarren } from '../src/sim/warren.ts';

export function authoredGame(seed: number, minute = 300, config: NextConfig = 'warren-rest/2'): Game {
  const state = newWarren(seed, true, undefined, minute);
  state.edition = '0.7.0';
  state.refuge = { slept: {}, raids: {}, forage: { day: -1, gathered: 0 } };
  if (config) state.next = { config };
  return {
    s: state,
    inputs: [],
    chapter: { version: 'warren-hf4-cast/1', inputs: [], claims: [], initial: stateJson(state) },
  };
}
