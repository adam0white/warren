import type { Activity, DecisionRecord } from '@adam0white/human-framework';
import { describe, expect, it } from 'vitest';
import { HOUR } from '../src/sim/calendar.ts';
import { act, advance, fingerprint, load, newGame, replay, save } from '../src/sim/game.ts';
import { AIR_REACH, idx, K, SURF, USE } from '../src/sim/grid.ts';
import { airAndLight, makeWorld, offersFor, QUANTUM, riderCells, touch } from '../src/sim/warren.ts';
import { doorWords } from '../src/ui/door-help.ts';
import { colonyWords } from '../src/ui/guidance.ts';
import { bellStateWords } from '../src/ui/room-safety.ts';

function layout() {
  const s = newGame(7).s;
  s.hill.kind.fill(K.rock);
  for (let i = 0; i < idx(0, SURF); i++) s.hill.kind[i] = K.sky;
  s.hill.use.fill(USE.none);
  s.hill.shut.fill(0);
  s.hill.lamp.fill(0);
  s.trips = {};
  const x = s.hill.surface.entrance;
  for (let y = SURF; y <= SURF + 15; y++) s.hill.kind[idx(x, y)] = K.open;
  const near = idx(x, SURF + 2);
  const safe = idx(x, SURF + 11);
  const farther = idx(x, SURF + 14);
  for (const c of [near, safe, farther]) s.hill.use[c] = USE.beds;
  for (const p of s.people) {
    s.pos[p.id] = idx(x, SURF);
    p.activity = null;
  }
  const p = s.people.find((q) => q.id === 'meryem');
  if (!p) throw new Error('Missing Meryem');
  p.body.sleepPressure = 0.95;
  const raid = s.raids[0];
  if (!raid) throw new Error('Missing raid');
  raid.stage = 'smoke';
  touch(s);
  return { s, x, near, safe, farther, p, raid };
}

// Exercise the offered path through the real world callback, without forcing an HF decision.
function destination(f: ReturnType<typeof layout>, id: 'sleep-below' | 'shelter') {
  const offer = offersFor(f.s, f.p).find((a) => a.id === id);
  if (!offer) return undefined;
  makeWorld(f.s).beginOptions?.(f.p, offer, {} as DecisionRecord);
  return f.s.trips[f.p.id]?.end;
}

function reserve(f: ReturnType<typeof layout>, cell: number, action: 'sleep' | 'shelter') {
  for (const p of f.s.people.filter((q) => q.id !== f.p.id).slice(0, 3)) {
    p.activity = { action, ...(action === 'sleep' ? { mode: 'sleep' } : {}) } as Activity;
    f.s.trips[p.id] = { action, end: cell, cells: [cell], times: [f.s.minute], workFrom: f.s.minute };
  }
}

describe('edition 0.4.0 raid call', () => {
  it('describes the current warning after a previous raid call ended', () => {
    const g = newGame(7);
    const [first, second] = g.s.raids;
    if (!first || !second) throw new Error('Missing raids');
    first.stage = 'gone';
    g.s.notes.push({ at: first.smoke, kind: 'story', text: 'You rang the bell.', weight: 1 });
    second.stage = 'smoke';
    g.s.minute = second.smoke;
    expect(colonyWords(g.s)).toMatch(
      /Smoke rises.*No call is active.*Ring the bell once.*until the all-clear/,
    );
    expect(colonyWords(g.s)).not.toContain('riders have gone');
  });
  it('starts only new runs on 0.6.0 and replays its export and continuation', () => {
    const g = newGame(19);
    expect(g.s.edition).toBe('0.6.0');
    act(g, { verb: 'bell' });
    advance(g, g.s.minute + HOUR);
    const exported = save(g);
    expect(exported.game).toBe('0.6.0');
    expect(fingerprint(replay(exported.seed, exported.inputs, exported.minute, exported.game).s)).toBe(
      exported.fingerprint,
    );
    const restored = load(JSON.parse(JSON.stringify(exported)));
    advance(g, g.s.minute + HOUR);
    advance(restored, restored.s.minute + HOUR);
    expect(fingerprint(restored.s)).toBe(fingerprint(g.s));
  });

  it('keeps one smoke-time suggestion through riders until all-clear without renewal interrupts', () => {
    const g = newGame(7);
    const raid = g.s.raids[0];
    if (!raid) throw new Error('Missing raid');
    advance(g, raid.smoke);
    expect(act(g, { verb: 'bell' })).toBe(true);
    const at = g.s.bell?.at;
    const dissenter = g.s.people[0];
    if (!dissenter) throw new Error('Missing dissenter');
    dissenter.retention = { ...dissenter.retention, trace: 200 };
    let lateDissent = false;
    for (let t = g.s.minute + QUANTUM; t < raid.leave; t += QUANTUM) {
      advance(g, t);
      if (!lateDissent && t > (at ?? 0) + 6 * HOUR) {
        // A person with a bad history is free to decline even at a later review.
        dissenter.activity = null;
        delete g.s.trips[dissenter.id];
        g.s.pos[dissenter.id] = idx(g.s.hill.surface.entrance, SURF);
        for (const voice of dissenter.will.voices) {
          voice.trust = 0;
          voice.pressure = 1;
        }
        expect(offersFor(g.s, dissenter).some((a) => a.action === 'shelter')).toBe(true);
        lateDissent = true;
      }
      expect(g.s.bell?.at).toBe(at);
      expect(g.s.bell?.until).toBe(raid.leave);
      expect(bellStateWords(g.s)).toContain('until the all-clear');
      expect(bellStateWords(g.s)).not.toMatch(/renew|six game hours/);
      const before = fingerprint(g.s);
      expect(act(g, { verb: 'bell' })).toBe(false);
      expect(fingerprint(g.s)).toBe(before);
    }
    expect(g.inputs.filter((i) => i.verb === 'bell')).toHaveLength(1);
    expect(g.s.answers.some((a) => a.verdict === 'refused')).toBe(true);
    expect(
      dissenter.trace.some(
        (record) =>
          record.at > (at ?? 0) + 6 * HOUR &&
          // The explicit idle control above creates a fresh choice, not necessarily an activity review.
          record.suggestion?.voiceId === 'usta' &&
          record.suggestion.verdict === 'refused' &&
          record.suggestion.says.length > 0,
      ),
    ).toBe(true);
    advance(g, raid.leave);
    expect(raid.stage).toBe('gone');
    expect(g.s.bell).toBeNull();
    expect(bellStateWords(g.s)).not.toMatch(/renew|six game hours elapsed/);
  });

  it('still expires a quiet call as a false alarm and states the cost at a quiet door', () => {
    const g = newGame(7);
    const door = idx(g.s.hill.surface.entrance, SURF + 2);
    g.s.hill.use[door] = USE.door;
    g.s.hill.doorWork[door] = 0;
    expect(doorWords(g.s, door, true)).toMatch(/false alarm.*trust/i);
    expect(act(g, { verb: 'bell' })).toBe(true);
    advance(g, g.s.minute + 6 * HOUR);
    expect(g.s.bell).toBeNull();
    expect(g.s.flags.falseBells).toBe(1);
    expect(bellStateWords(g.s)).toContain('six game hours elapsed');
  });
});

describe('edition 0.4.0 scouting reward', () => {
  it('keeps scouting exposure but gives neither defence reward nor penalty; later real defence earns it', () => {
    const g = newGame(7);
    const first = g.s.raids[0];
    const second = g.s.raids[1];
    if (!first || !second) throw new Error('Missing raids');
    advance(g, first.leave - QUANTUM);
    const word = g.s.word;
    advance(g, first.leave);
    expect(first.scouted?.length).toBeGreaterThan(0);
    expect(first.wouldCatch?.length).toBeGreaterThan(0);
    expect(first.hurt).toEqual([]);
    expect(g.s.heldAt).toBe(-1);
    expect(g.s.word).toBe(word);
    // Complete an actual second raid's all-clear with no losses.
    second.stage = 'riders';
    second.leave = g.s.minute + QUANTUM;
    second.took = 0;
    second.hurt = [];
    advance(g, second.leave);
    expect(g.s.heldAt).toBe(second.leave);
    expect(g.s.word).toBe(Math.min(1, word + 0.25));
  });
});

describe('edition 0.4.0 danger destinations', () => {
  for (const id of ['sleep-below', 'shelter'] as const) {
    it(`${id} prefers the nearest reachable protected available bed`, () => {
      const f = layout();
      expect(riderCells(f.s).has(f.near)).toBe(true);
      expect(riderCells(f.s).has(f.safe)).toBe(false);
      expect(destination(f, id)).toBe(f.safe);
      expect(offersFor(f.s, f.p).some((a) => a.id === 'sleep-home')).toBe(true);
    });
    for (const action of ['sleep', 'shelter'] as const) {
      it(`${id} respects ${action} reservations and a released place`, () => {
        const f = layout();
        reserve(f, f.safe, action);
        expect(destination(f, id)).toBe(f.farther);
        const occupant = f.s.people.find((p) => p.id !== f.p.id && p.activity);
        if (!occupant) throw new Error('Missing occupant');
        occupant.activity = null;
        expect(destination(f, id)).toBe(f.safe);
      });
    }
    it(`${id} does not prefer beds beyond a shut route or in stale air`, () => {
      const f = layout();
      const door = idx(f.x, SURF + 8);
      f.s.hill.use[door] = USE.door;
      f.s.hill.shut[door] = 1;
      touch(f.s);
      expect(destination(f, id)).not.toBe(f.safe);
      f.s.hill.shut[door] = 0;
      // Put a protected but stale bed at the end of a long side passage.
      for (let x = f.x; x <= f.x + 20; x++) f.s.hill.kind[idx(x, SURF + 2)] = K.open;
      f.s.hill.use[f.safe] = f.s.hill.use[f.farther] = USE.none;
      const stale = idx(f.x + 20, SURF + 2);
      f.s.hill.use[stale] = USE.beds;
      touch(f.s);
      expect(airAndLight(f.s).air[stale]).toBeGreaterThan(AIR_REACH);
      expect(destination(f, id)).not.toBe(stale);
    });
    it(`${id} recalculates protection after a shaft opens and retains quiet-time nearest sleep`, () => {
      const f = layout();
      f.s.hill.use[f.safe] = USE.none;
      f.safe = idx(f.x - 8, SURF + 3);
      for (let x = f.x - 8; x <= f.x; x++) f.s.hill.kind[idx(x, SURF + 3)] = K.open;
      f.s.hill.use[f.safe] = USE.beds;
      touch(f.s);
      expect(riderCells(f.s).has(f.safe)).toBe(false);
      expect(destination(f, id)).toBe(f.safe);
      for (let y = SURF; y <= SURF + 3; y++) f.s.hill.kind[idx(f.x - 8, y)] = K.open;
      touch(f.s);
      expect(riderCells(f.s).has(f.safe)).toBe(true);
      expect(destination(f, id)).not.toBe(f.safe);
      f.raid.stage = 'coming';
      expect(destination(f, 'sleep-below')).toBe(f.near);
    });
  }
});
