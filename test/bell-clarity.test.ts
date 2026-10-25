import type { Activity } from '@adam0white/human-framework';
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/game.ts';
import { idx, SURF } from '../src/sim/grid.ts';
import { exposureWords } from '../src/ui/exposure.ts';
import { colonyWords } from '../src/ui/guidance.ts';
import { bellStateWords, bellThreatWords } from '../src/ui/room-safety.ts';

function ringing() {
  const s = newGame(7, '0.3.0').s;
  s.bell = { at: s.minute, until: s.minute + 360, real: true };
  s.notes.push({ at: s.minute, kind: 'story', text: 'You rang the bell.', weight: 1 });
  const p = s.people[0];
  if (!p) throw new Error('Missing person');
  s.answers.push({ at: s.minute, who: p.id, verdict: 'assented', says: 'I agree.' });
  p.activity = {
    action: 'carve',
    affordance: { label: 'carve the rolling stone' },
    startedAt: s.minute - 20,
    endsAt: s.minute + 90,
    reviewAt: s.minute + 12,
  } as Activity;
  delete s.trips[p.id];
  return { s, p };
}

describe('bell duration and observed replies', () => {
  it('explains the call duration before the first ring', () => {
    const s = newGame(7, '0.3.0').s;
    expect(bellStateWords(s)).toMatch(/The bell is quiet.*six game hours/);
  });

  it('reports game time remaining and the actual deadline expiry reason', () => {
    const { s } = ringing();
    s.minute += 285;
    expect(bellStateWords(s)).toMatch(/six game hours.*1 game hour 15 minutes left/);
    s.minute += 75;
    s.bell = null;
    expect(bellStateWords(s)).toMatch(/The call has ended.*call ended after six game hours/);
    s.notes = [];
    expect(bellStateWords(s)).not.toContain('elapsed');
  });

  it('keeps duration and expiry visible in raid guidance', () => {
    const { s } = ringing();
    const raid = s.raids[0];
    if (!raid) throw new Error('Missing raid');
    raid.stage = 'smoke';
    expect(colonyWords(s)).toContain('6 game hours left');
    s.minute += 360;
    s.bell = null;
    expect(colonyWords(s)).toContain('call ended after six game hours');
  });

  it('pairs assent with the current task and the next choice time without promising travel', () => {
    const { s, p } = ringing();
    const before = JSON.stringify(s);
    expect(exposureWords(s, p)).toMatch(
      /carve the rolling stone.*When the bell rang, he said: “I agree.”.*current task.*12 game minutes/,
    );
    expect(exposureWords(s, p)).not.toMatch(/will.*(come|follow|head|go)|He is still travelling below/);
    expect(JSON.stringify(s)).toBe(before);
    s.minute += 13;
    expect(exposureWords(s, p)).toContain('His next choice is due now');
  });

  it('distinguishes observed shelter travel from a later different choice', () => {
    const { s, p } = ringing();
    s.trips[p.id] = {
      action: 'shelter',
      cells: [idx(17, SURF - 1), idx(17, SURF + 3)],
      times: [s.minute, s.minute + 60],
      workFrom: s.minute + 60,
      end: idx(17, SURF + 3),
    };
    expect(exposureWords(s, p)).toContain('He is still travelling below');
    expect(exposureWords(s, p)).not.toContain('current task first');
    delete s.trips[p.id];
    if (!p.activity) throw new Error('Missing activity');
    p.activity.startedAt = s.minute + 1;
    s.minute += 2;
    expect(exposureWords(s, p)).toContain('Since that reply, he chose a different task');
    expect(exposureWords(s, p)).not.toContain('current task first');
  });

  it('shows the next choice even when the current task includes a walk', () => {
    const { s, p } = ringing();
    s.trips[p.id] = {
      action: 'carve',
      cells: [idx(17, SURF - 1), idx(17, SURF + 3)],
      times: [s.minute, s.minute + 60],
      workFrom: s.minute + 60,
      end: idx(17, SURF + 3),
    };
    expect(exposureWords(s, p)).toMatch(/He is on the way to carve.*current task.*12 game minutes/);
    expect(exposureWords(s, p)).not.toContain('He is still travelling below');
  });

  it('does not turn prayer into a countdown', () => {
    const { s, p } = ringing();
    if (!p.activity) throw new Error('Missing activity');
    p.activity.action = 'pray';
    p.activity.affordance.label = 'pray';
    expect(exposureWords(s, p)).not.toMatch(/minutes|hours|choice due/);
  });
});

it('names only the threat the village can currently see beside the bell', () => {
  const s = newGame(7).s;
  const before = JSON.stringify(s);
  expect(bellThreatWords(s)).toBe('No smoke or riders are in sight.');
  expect(JSON.stringify(s)).toBe(before);
  const raid = s.raids[0];
  if (!raid) throw new Error('Missing raid');
  raid.stage = 'smoke';
  expect(bellThreatWords(s)).toMatch(/Smoke.*half a day/);
  s.bell = { at: s.minute, until: s.minute + 360, real: true };
  expect(colonyWords(s)).toContain('Tap the people count');
  expect(colonyWords(s)).not.toContain('Check shelter');
  raid.stage = 'riders';
  expect(bellThreatWords(s)).toBe('Riders are at the hill.');
  raid.stage = 'gone';
  expect(bellThreatWords(s)).toBe('No smoke or riders are in sight.');
});
