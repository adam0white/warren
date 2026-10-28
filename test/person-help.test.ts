import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/game.ts';
import { idx, SURF, USE } from '../src/sim/grid.ts';
import { personHelpWords } from '../src/ui/person-help.ts';

function fixture() {
  const s = newGame(7).s;
  const p = s.people[0];
  if (!p) throw new Error('Missing founder');
  delete s.trips[p.id];
  return { s, p };
}

describe('plain person help', () => {
  it('keeps current condition unknown and identifies recorded injury as historical', () => {
    const { s, p } = fixture();
    expect(personHelpWords(s, p)).toContain(`${p.name}’s current condition is unavailable.`);
    s.notes.push({ at: s.minute, kind: 'hurt', who: p.id, text: 'An injury was recorded.', weight: 2 });
    const words = personHelpWords(s, p);
    expect(words).toContain('The journal records an earlier injury: An injury was recorded.');
    expect(words).not.toMatch(/needs food|needs water|needs rest|poor health/i);
  });

  it('does not turn ordinary above-ground work into a rescue alert', () => {
    const { s, p } = fixture();
    s.pos[p.id] = idx(17, SURF - 1);
    expect(personHelpWords(s, p)).toBe(`${p.name}’s current condition is unavailable.`);
    const raid = s.raids[0];
    if (!raid) throw new Error('Missing raid');
    raid.stage = 'riders';
    expect(personHelpWords(s, p)).toContain('He is exposed above ground during the raid.');
  });

  it('does not promise safety behind a shut door, and leaves the whole run unchanged', () => {
    const { s, p } = fixture();
    const raid = s.raids[0];
    if (!raid) throw new Error('Missing raid');
    raid.stage = 'riders';
    s.hill.use[idx(18, SURF + 1)] = USE.door;
    s.hill.shut[idx(18, SURF + 1)] = 1;
    s.pos[p.id] = idx(17, SURF + 3);
    const before = JSON.stringify(s);
    expect(personHelpWords(s, p)).toBe(`${p.name}’s current condition is unavailable.`);
    expect(personHelpWords(s, p)).not.toMatch(/safe|guarantee/i);
    expect(JSON.stringify(s)).toBe(before);
  });
});
