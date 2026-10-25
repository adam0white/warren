/**
 * The hill's calendar. Minute 0 is dawn-dark on the first day of play, which falls in late summer with the
 * harvest standing (day of year START_DOY). Seasons follow a plateau year: harvest in late summer, sowing in
 * autumn, a cold winter, a wet spring. Days are real days; the game never shortens a year.
 */
export const HOUR = 60;
export const DAY = 24 * HOUR;
export const YEAR_DAYS = 365;
/** Day of year the game starts on (about 18 August). */
export const START_DOY = 230;

export type Season = 'spring' | 'summer' | 'harvest' | 'autumn' | 'winter';

export const dayOfMinute = (m: number) => Math.floor(m / DAY);
export const minuteOfDay = (m: number) => ((m % DAY) + DAY) % DAY;
export const doyOf = (day: number) => (START_DOY + day) % YEAR_DAYS;
/** Years under the hill: the first year runs from the first day of play. */
export const yearOf = (day: number) => 1 + Math.floor(day / YEAR_DAYS);

export function seasonOf(doy: number): Season {
  if (doy >= 60 && doy < 152) return 'spring';
  if (doy >= 152 && doy < 213) return 'summer';
  if (doy >= 213 && doy < 262) return 'harvest';
  if (doy >= 262 && doy < 335) return 'autumn';
  return 'winter';
}

/** Sunrise and sunset in minutes of the day, for a plateau near 38°N (approximate). */
export function daylight(doy: number): { rise: number; set: number } {
  const t = Math.cos(((doy - 172) / YEAR_DAYS) * 2 * Math.PI); // 1 at midsummer, -1 at midwinter
  const half = (12 + 2.6 * t) * 30; // half the day length in minutes
  const noon = 12 * HOUR + 10;
  return { rise: Math.round(noon - half), set: Math.round(noon + half) };
}

export function isLight(m: number): boolean {
  const { rise, set } = daylight(doyOf(dayOfMinute(m)));
  const mod = minuteOfDay(m);
  return mod >= rise && mod < set;
}

/** "early morning", "midday", "dusk", "night" */
export function hourWords(m: number): string {
  const { rise, set } = daylight(doyOf(dayOfMinute(m)));
  const mod = minuteOfDay(m);
  if (mod < rise - 60 || mod >= set + 90) return 'night';
  if (mod < rise + 30) return 'dawn';
  if (mod < 11 * HOUR) return 'morning';
  if (mod < 14 * HOUR) return 'midday';
  if (mod < set - 60) return 'afternoon';
  if (mod < set + 30) return 'dusk';
  return 'evening';
}
