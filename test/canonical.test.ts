import { castForGame } from '@adam0white/lab-client';
import { describe, expect, it } from 'vitest';
import { act, advance, fingerprint, load, newGame, replay, save } from '../src/sim/game.ts';
import { ageYears } from '../src/sim/hf4.ts';
import { ROLE_TASKS } from '../src/sim/roles.ts';
import { QUANTUM } from '../src/sim/warren.ts';

describe('canonical Warren chapter', () => {
  it('uses the six complete canonical opening profiles and explicit family roles', () => {
    const g = newGame(7);
    const cast = castForGame('warren');
    expect(g.s.people.map((p) => p.name).sort()).toEqual(cast.map((p) => p.name).sort());
    for (const c of cast) {
      const p = g.s.people.find((p) => p.name === c.name)!;
      expect(Math.floor(ageYears(p))).toBe(c.age);
      const authored = g.s.hf.initial.people.find((person) => person.id === p.id)!;
      expect(authored.state.traits).toEqual(c.traits);
      expect(authored.state.values).toEqual(c.values);
    }
    expect(
      g.s.people.find((p) => p.id === 'meryem')?.will.ties.find((r) => r.otherId === 'yusuf')?.roles,
    ).toContain('grandparent');
    expect(
      g.s.people.find((p) => p.id === 'kian')?.will.ties.find((r) => r.otherId === 'tamar')?.roles,
    ).toContain('mentor');
  });
  it('keeps goal memory-tag identity while activity prose becomes clearer', () => {
    const maryam = newGame(7).s.people.find((p) => p.id === 'maryam');
    expect(maryam?.agenda.goals.find((goal) => goal.id === 'canonical-role')?.label).toBe(
      'prepare a household pot from its own grain',
    );
    expect(ROLE_TASKS.maryam?.[0]?.label).toBe('cook a household meal from its own grain');
  });
  // Complete opening, actual invitation and history remain within each original
  // deadline. Cold native restore and replay are independently useful journeys.
  function privateClue(restore: 'native' | 'file') {
    const g = newGame(7);
    expect(g.s.notes.some((n) => /impossible knots|Very Small King/.test(n.text))).toBe(false);
    advance(g, 300 + QUANTUM);
    expect(g.s.people.find((p) => p.id === 'maryam')!.activity).not.toBeNull();
    expect(act(g, { verb: 'visit', who: 'maryam' })).toBe(true);
    advance(g, 720);
    expect(g.s.notes.some((n) => /impossible knots/.test(n.text))).toBe(true);
    const sv = save(g);
    const restored =
      restore === 'native' ? load(sv) : replay(sv.seed, sv.inputs, sv.minute, sv.game, sv.chapter, sv.config);
    expect(fingerprint(restored.s)).toBe(sv.fingerprint);
  }
  it('only reveals private clues after an invitation and retains them in native restoration', () =>
    privateClue('native'));
  it('only reveals private clues after an invitation and retains them in file replay', () =>
    privateClue('file'));
  it('waits for current work before releasing optional work at a real source boundary', () => {
    const g = newGame(7);
    advance(g, 300 + QUANTUM);
    expect(act(g, { verb: 'release', who: 'meryem' })).toBe(true);
    expect(g.s.flags['released:meryem']).toBeUndefined();
    let boundary = false;
    for (let minute = 300 + 2 * QUANTUM; minute <= 1440; minute += QUANTUM) {
      advance(g, minute);
      if ((g.s.flags['released:meryem'] ?? 0) >= g.s.minute - QUANTUM + 1) {
        boundary = !g.s.people.find((p) => p.id === 'meryem')!.activity;
        break;
      }
    }
    expect(boundary).toBe(true);
    expect(
      g.s.people
        .find((p) => p.id === 'meryem')!
        .agenda.goals.some((g) => g.id === 'refuge' && g.status === 'active'),
    ).toBe(false);
  });
});
