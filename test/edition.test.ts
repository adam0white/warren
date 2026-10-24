import { injure } from '@adam0white/human-framework';
import { describe, expect, it } from 'vitest';
import { DAY, HOUR } from '../src/sim/calendar.ts';
import { act, advance, fingerprint, load, newGame, replay, save } from '../src/sim/game.ts';
import { riderCells } from '../src/sim/warren.ts';

describe('current engine with historical mechanics controls', () => {
  it('plainly refuses a notebook from the old framework', () => {
    const old = save(newGame(7));
    old.framework = '2.8.0';
    expect(() => load(old)).toThrow(/Start fresh/);
  });
  it('makes the first raid a named, drawn scare and preserves the new edition in replay and continuation', () => {
    const g = newGame(7, '0.3.0');
    expect(g.s.edition).toBe('0.3.0');
    const first = g.s.raids[0];
    if (!first) throw new Error('Missing raid');
    advance(g, first.riders);
    expect(first.scouted).toEqual([...riderCells(g.s).keys()]);
    expect(first.wouldCatch?.length).toBeGreaterThan(0);
    expect(g.s.notes.some((n) => /They looked into.*where.*would have been caught/.test(n.text))).toBe(true);
    advance(g, first.leave + HOUR);
    expect(first.hurt).toEqual([]);
    expect(g.s.notes.some((n) => /No one was struck/.test(n.text))).toBe(true);
    const sv = save(g);
    expect(sv.game).toBe('0.3.0');
    expect(fingerprint(replay(sv.seed, sv.inputs, sv.minute, sv.game).s)).toBe(sv.fingerprint);
    const restored = load(JSON.parse(JSON.stringify(sv)));
    advance(g, g.s.minute + DAY);
    advance(restored, restored.s.minute + DAY);
    expect(fingerprint(restored.s)).toBe(fingerprint(g.s));
  });

  it('second and later raids still strike, and the injured speak as their injuries heal', () => {
    const g = newGame(1, '0.3.0');
    const second = g.s.raids[1];
    if (!second) throw new Error('Missing second raid');
    advance(g, second.leave + HOUR);
    expect(second.hurt.length).toBeGreaterThan(0);
    const injured = second.hurt.map((id) => g.s.people.find((p) => p.id === id)).filter((p) => p?.body.alive);
    const severity = injured.flatMap((p) => p?.body.injuries.map((i) => i.severity) ?? []);
    expect(severity.length).toBeGreaterThan(0);
    advance(g, g.s.minute + 20 * DAY);
    expect(g.s.notes.some((n) => n.kind === 'hurt' && /“.*(easier|mended)/.test(n.text))).toBe(true);
    expect(injured.every((p) => !p?.body.alive || p.body.injuries.length === 0)).toBe(true);
    const third = g.s.raids[2];
    if (!third) throw new Error('Missing third raid');
    // Move the third scheduled raid close without changing its force or strike rules.
    third.smoke = g.s.minute + HOUR;
    third.riders = third.smoke + 6 * HOUR;
    third.leave = third.riders + 40 * HOUR;
    advance(g, third.leave + HOUR);
    expect(third.hurt.length).toBeGreaterThan(0);
  });

  it('reports a mended wound without claiming a still-injured arm is well', () => {
    const g = newGame(7, '0.3.0');
    const p = g.s.people[0];
    if (!p) throw new Error('Missing person');
    injure(p, { part: 'arm', severity: 0.1, healRatePerDay: 1 });
    injure(p, { part: 'arm', severity: 0.7, healRatePerDay: 0.001 });
    advance(g, g.s.minute + 8 * HOUR);
    expect(p.body.injuries.some((i) => i.part === 'arm')).toBe(true);
    const words = g.s.notes
      .filter((n) => n.who === p.id)
      .map((n) => n.text)
      .join(' ');
    expect(words).not.toContain('My arm has mended');
    expect(words).toContain('The wound on my arm has mended');
  });

  it('continues healing narration exactly after loading, and gives no recovery voice to the dead', () => {
    const g = newGame(7, '0.3.0');
    const p = g.s.people[0];
    if (!p) throw new Error('Missing person');
    injure(p, { part: 'arm', severity: 0.3, healRatePerDay: 0.1 });
    advance(g, g.s.minute + HOUR);
    const restored = load(JSON.parse(JSON.stringify(save(g))));
    advance(g, g.s.minute + 4 * DAY);
    advance(restored, restored.s.minute + 4 * DAY);
    expect(fingerprint(restored.s)).toBe(fingerprint(g.s));
    const dead = restored.s.people[0];
    if (!dead) throw new Error('Missing person');
    injure(dead, { part: 'head', severity: 0.3, healRatePerDay: 1 });
    advance(restored, restored.s.minute + HOUR);
    const at = restored.s.minute;
    dead.body.alive = false;
    dead.body.injuries = [];
    advance(restored, at + DAY);
    expect(restored.s.notes.filter((n) => n.who === dead.id && n.at > at && n.kind === 'hurt')).toEqual([]);
  });

  it('replays and exports a bell input on its own edition', () => {
    const g = newGame(19, '0.3.0');
    act(g, { verb: 'bell' });
    advance(g, g.s.minute + DAY);
    const sv = save(g);
    expect(fingerprint(replay(sv.seed, sv.inputs, sv.minute, sv.game).s)).toBe(sv.fingerprint);
  });
});
