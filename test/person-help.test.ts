import { describe, expect, it } from 'vitest';
import { idx, SURF, USE } from '../src/sim/grid.ts';
import { personHelpWords } from '../src/ui/person-help.ts';
import { conditionFixture } from './condition-fixture.ts';

const fixture = conditionFixture;

describe('plain person help', () => {
  it.each([
    [
      'unable to stand',
      (b) => {
        b.downed = { since: b.since, reason: 'injury' };
      },
      'cannot get up and needs help',
    ],
    [
      'poor health',
      (b) => {
        b.health = 0.3;
      },
      'is in poor health and needs care',
    ],
    [
      'illness',
      (b) => {
        b.illnesses = [
          { id: 'ill', kind: 'fever', severity: 0.3, trendPerDay: 0, contagious: false, since: b.since },
        ];
      },
      'is living with an illness',
    ],
    [
      'bleeding',
      (b) => {
        b.injuries = [
          { id: 'cut', part: 'arm', severity: 0.3, healRatePerDay: 0.1, since: b.since, bleeding: 0.1 },
        ];
      },
      'is bleeding and needs care',
    ],
    [
      'injury',
      (b) => {
        b.injuries = [{ id: 'bruise', part: 'arm', severity: 0.3, healRatePerDay: 0.1, since: b.since }];
      },
      'has an injury',
    ],
    [
      'pain',
      (b) => {
        b.pain = 0.9;
      },
      'appears to be in pain',
    ],
    [
      'hunger',
      (b) => {
        b.satiety = 0;
      },
      'needs food',
    ],
    [
      'thirst',
      (b) => {
        b.hydration = 0;
      },
      'needs water',
    ],
    [
      'fatigue',
      (b) => {
        b.exertion = 0.95;
      },
      'needs rest',
    ],
    [
      'sleepiness',
      (b) => {
        b.sleepPressure = 1;
        b.sleepDebtHours = 24;
      },
      'needs rest',
    ],
  ] satisfies [string, Parameters<typeof conditionFixture>[0], string][])(
    'shows %s from HF inspect as approximate words',
    (_trait, change, expected) => {
      const { s, p } = fixture(change);
      const before = JSON.stringify(s);
      const words = personHelpWords(s, p);
      expect(words).toContain('This is an approximate reading of current condition.');
      expect(words).toContain(expected);
      expect(words).not.toMatch(/unavailable|\d|I will/);
      expect(JSON.stringify(s)).toBe(before);
    },
  );

  it('keeps an earlier injury distinct from the current reading', () => {
    const { s, p } = fixture();
    s.notes.push({ at: s.minute, kind: 'hurt', who: p.id, text: 'An injury was recorded.', weight: 2 });
    const words = personHelpWords(s, p);
    expect(words).toContain('does not seem to need food, water, rest or care right now');
    expect(words).toContain('The journal records an earlier injury: An injury was recorded.');
  });

  it('does not turn ordinary above-ground work into a rescue alert', () => {
    const { s, p } = fixture();
    s.pos[p.id] = idx(17, SURF - 1);
    expect(personHelpWords(s, p)).toContain('does not seem to need food, water, rest or care right now.');
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
    expect(personHelpWords(s, p)).toContain('does not seem to need food, water, rest or care right now.');
    expect(personHelpWords(s, p)).not.toMatch(/safe|guarantee/i);
    expect(JSON.stringify(s)).toBe(before);
  });
});
