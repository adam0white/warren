import { month } from '@adam0white/lab-kit';
import { dayOfMinute, doyOf, yearOf } from '../sim/calendar.ts';

/** English month/day on the hill's existing 365-day calendar, without inventing a historical era. */
export function hillDate(minute: number): string {
  const day = dayOfMinute(minute);
  // 2001 is only a non-leap formatting reference; its year and weekday are never displayed.
  const date = new Date(Date.UTC(2001, 0, doyOf(day) + 1));
  return `${date.getUTCDate()} ${month(date.getUTCMonth() + 1)} · Year ${yearOf(day)} at the hill`;
}
