import { BEDS_PER_CELL, K, roomOf, USE } from '../sim/grid.ts';
import { bedsBelow, type WarrenState } from '../sim/warren.ts';

/** Marked space, not a promise that people can reach it or survive there. */
export function sleepingCapacity(s: WarrenState): { places: number; people: number; enough: boolean } {
  const places = bedsBelow(s);
  const people = s.people.filter((p) => p.body.alive).length;
  return { places, people, enough: places >= people };
}

const small = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function numberWords(n: number): string {
  if (n < 20) return small[n] ?? 'zero';
  if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? `-${small[n % 10]}` : ''}`;
  const unit = n < 1000 ? 100 : 1000;
  return `${numberWords(Math.floor(n / unit))} ${unit === 100 ? 'hundred' : 'thousand'}${n % unit ? ` ${numberWords(n % unit)}` : ''}`;
}

/** The selected room is the connected region of beds, rather than all beds in the hill. */
export function sleepingRoomWords(s: WarrenState, cell: number): string {
  if (s.hill.use[cell] !== USE.beds || s.hill.kind[cell] !== K.open) return '';
  const places = roomOf(s.hill, cell).length * BEDS_PER_CELL;
  const { people } = sleepingCapacity(s);
  return `Room for about ${numberWords(places)} people. ${places >= people ? 'Enough sleeping space for the village.' : 'This room cannot hold the whole village.'}`;
}

export function sleepingCapacityWords(s: WarrenState): string {
  const { places, enough } = sleepingCapacity(s);
  if (!places) return 'No sleeping places are marked below. The village needs sleeping places.';
  return `Sleeping places below have room for about ${numberWords(places)} people. ${enough ? 'Enough sleeping space for the village.' : 'The village needs more sleeping places.'}`;
}
