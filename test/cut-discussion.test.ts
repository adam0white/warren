import { expect, it } from 'vitest';
import { newGame } from '../src/sim/game.ts';

it('refuses the historical standing-advice configuration', () => {
  expect(() => newGame(7, '0.7.0', undefined, 'warren-next/1')).toThrow(/keep.*start fresh/i);
});
