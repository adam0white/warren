import { describe, expect, it } from 'vitest';
import { DAY } from '../src/sim/calendar.ts';
import { act, advance, newGame } from '../src/sim/game.ts';
import { idx, K, SURF } from '../src/sim/grid.ts';
import { arrivingFamily } from '../src/sim/people.ts';
import { exposureWords } from '../src/ui/exposure.ts';
import { personHelpWords } from '../src/ui/person-help.ts';
import { bellShelterWords } from '../src/ui/room-safety.ts';

describe('second English pass', () => {
  it('gives arrivals names without numbers after the short name lists run out', () => {
    const used = new Set<string>();
    const people = Array.from({ length: 20 }, (_, i) => arrivingFamily(7, i + 1, 0, 8, used).people).flat();
    expect(people.length).toBeGreaterThan(28);
    expect(people.every((p) => !/\d/.test(p.name))).toBe(true);
    // The identity tokens remain independent of the displayed names.
    expect(people.some((p) => /\d/.test(p.id))).toBe(true);
  });
  it('uses a named person or he/she in person readings and gives a useful empty-shelter instruction', () => {
    const s = newGame(7).s;
    for (const p of s.people) {
      expect(`${personHelpWords(s, p)} ${exposureWords(s, p)}`).not.toMatch(/\bthey|\btheir/i);
    }
    expect(bellShelterWords(s)).toContain('no sleeping places yet');
    expect(bellShelterWords(s)).not.toContain('There are 0');
  });
  it('keeps a remote ground-level shaft distinct from the main entrance in scout notes', () => {
    const g = newGame(7);
    const cell = idx(5, SURF);
    g.s.hill.kind[cell] = K.open;
    advance(g, g.s.raids[0]!.riders);
    const note = g.s.notes.find((n) => n.kind === 'raid' && n.cell === cell);
    expect(note?.text).toMatch(/west of the entrance, at ground level/);
    expect(note?.text).not.toContain('just inside the entrance');
  });
  it('keeps one speaker for a first-person bell reply even when others give the same reply', () => {
    const g = newGame(7);
    for (let h = 0; h < 48; h++) {
      if (h % 6 === 0) act(g, { verb: 'bell' });
      advance(g, g.s.minute + DAY / 24);
    }
    const grouped = g.s.notes.filter((n) => n.kind === 'answer' && n.text.includes('gave the same reply'));
    expect(grouped.length).toBeGreaterThan(0);
    for (const note of grouped) {
      const name = g.s.people.find((p) => p.id === note.who)!.name;
      expect(note.text).toMatch(`${name} and others gave the same reply. ${name} said: “`);
      expect(g.s.answers.some((a) => a.who === note.who && note.text.endsWith(`“${a.says}”`))).toBe(true);
    }
    expect(g.s.notes.map((n) => n.text).join('\n')).not.toMatch(/and others: “/);
  });
});
