import { describe, expect, it } from 'vitest';
import { DAY } from '../src/sim/calendar.ts';
import { hillDate } from '../src/ui/date.ts';

describe('English dates on the hill’s calendar', () => {
  it('names the initial day without claiming a historical era', () => {
    expect(hillDate(0)).toBe('19 August · Year 1 at the hill');
    expect(hillDate(DAY - 1)).toBe(hillDate(0));
    expect(hillDate(DAY)).toBe('20 August · Year 1 at the hill');
  });

  it('crosses month and calendar-year boundaries within the same year at the hill', () => {
    expect(hillDate(12 * DAY)).toBe('31 August · Year 1 at the hill');
    expect(hillDate(13 * DAY)).toBe('1 September · Year 1 at the hill');
    expect(hillDate(134 * DAY)).toBe('31 December · Year 1 at the hill');
    expect(hillDate(135 * DAY)).toBe('1 January · Year 1 at the hill');
  });

  it('advances years on the hill’s anniversary and preserves its 365-day years', () => {
    expect(hillDate(364 * DAY)).toBe('18 August · Year 1 at the hill');
    expect(hillDate(365 * DAY)).toBe('19 August · Year 2 at the hill');
    expect(hillDate((3 * 365 + 194) * DAY)).toBe('1 March · Year 4 at the hill');
  });
});
