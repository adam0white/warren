/**
 * The people of the hill. Everyone is an HF `Person`; this module only says who they are when they first appear
 * (traits, values, norms, skills, ties, trust in the dig-master's bell) and never keeps a parallel model of their
 * minds. The three founding houses are written by hand so that their stories are reliable; families who arrive
 * later are rolled from the seed.
 */
import {
  createPerson,
  MINUTES_PER_YEAR,
  MUSLIM_CUSTOM,
  marry,
  type Person,
  type PersonSpec,
  promise,
  seedTie,
} from '@adam0white/human-framework';
import { castForGame } from '@adam0white/lab-client';
import { DAY } from './calendar.ts';
import { DRAW, hashUnit, mixSeed, stream } from './rng.ts';

/** The dig-master's bell: the one voice the player has. */
export const BELL = 'usta';
export const USTA_ID = 'yusuf';

export interface House {
  id: string;
  /** "the Kaya house" */
  name: string;
  /** Surface column of the house. */
  x: number;
  members: string[];
  /** Day they came (0 for the founders). */
  came: number;
  /** Grain in the house jars on the surface, kile. */
  jars: number;
  /** Cooked grain reserved to this household, in the same units as jars. */
  prepared?: number;
}

export interface Who {
  id: string;
  name: string;
  age: number;
  sex: 'male' | 'female';
  traits?: PersonSpec['traits'];
  values?: PersonSpec['values'];
  skills?: Record<string, number>;
  devout?: boolean;
  trust?: number;
  /** How much the refuge matters to them at the start (goal importance). */
  refuge?: number;
}

const norms = (devout: boolean, honesty: number, age: number): PersonSpec['norms'] =>
  age < 12
    ? []
    : [
        { normId: 'theft', standing: 'forbidden', conviction: 0.35 + 0.6 * honesty },
        { normId: 'salah', standing: 'obligatory', conviction: devout ? 0.85 : 0.35 },
        { normId: 'help-neighbor', standing: 'recommended', conviction: 0.5 },
      ];

export function makePerson(w: Who, seed: number, now: number, house: string): Person {
  const honesty = w.traits?.honesty ?? 0.5;
  const adult = w.age >= 14;
  const spec: PersonSpec = {
    id: w.id,
    name: w.name,
    seed: mixSeed(
      seed,
      DRAW.person,
      w.id.length,
      w.id.charCodeAt(0),
      w.id.charCodeAt(w.id.length - 1),
      w.age,
    ),
    now,
    bornAt: now - Math.round((w.age + hashUnit(seed, w.age, w.id.length) * 0.9) * MINUTES_PER_YEAR),
    sex: w.sex,
    traits: { ...w.traits },
    values: { tradition: 0.55, security: 0.7, conformity: 0.5, benevolence: 0.6, ...w.values },
    norms: norms(w.devout ?? false, honesty, w.age),
    skills: {
      digging: adult ? 0.3 + 0.2 * hashUnit(seed, w.age, 7) : 0.1,
      farming: adult ? 0.45 : 0.15,
      ...w.skills,
    },
    voices: [{ voiceId: BELL, trust: w.trust ?? 0.55 }],
    retention: { trace: 0, chronicleDays: 14 },
    enable: adult ? { fatigueStore: true } : {},
    // They live with the raids in mind: safety is not felt as met (engineering assumption).
    needs: { safety: 0.55 },
  };
  // Plateau farmers who dig and reap: fit for hard work (engineering assumption).
  if (adult && w.age < 60) spec.body = { fitness: 0.55 + 0.25 * hashUnit(seed, w.age, 11) };
  if (adult && w.id !== USTA_ID)
    spec.goals = [
      {
        id: 'refuge',
        label: 'a refuge under the hill',
        serves: ['safety', 'belonging'],
        advancedBy: [
          { action: 'dig', amount: 0.06 },
          { action: 'carry-spoil', amount: 0.04 },
          { action: 'carve-door', amount: 0.06 },
          { action: 'make-lamp', amount: 0.04 },
        ],
        importance: Math.min(0.95, (w.refuge ?? 0.55) + 0.15),
      },
    ];
  const p = createPerson(spec);
  p.habits.push({
    cue: { placeId: `house:${house}` },
    action: 'sleep',
    strength: 0.4,
    repetitions: 3000,
    lastAt: now,
  });
  if (w.devout && adult) {
    // Prayer at dusk: a quiet part of the day, kept by those who keep it.
    promise(p, {
      kind: 'worship',
      toId: 'self',
      label: 'the evening prayer',
      actions: ['pray'],
      normId: 'salah',
      from: Math.floor(now / DAY) * DAY + 19 * 60 + 30,
      until: Math.floor(now / DAY) * DAY + 21 * 60,
      importance: 0.5,
      recurEvery: DAY,
    });
  }
  return p;
}

interface HouseSpec {
  id: string;
  name: string;
  x: number;
  jars: number;
  people: Who[];
}

const FOUNDERS: HouseSpec[] = [
  {
    id: 'kaya',
    name: 'the Kaya house',
    x: 10,
    jars: 9,
    people: [
      {
        id: 'hasan',
        name: 'Hasan',
        age: 41,
        sex: 'male',
        traits: {
          honesty: 0.38,
          conscientiousness: 0.6,
          agreeableness: 0.45,
          extraversion: 0.55,
          emotionality: 0.35,
        },
        values: { security: 0.85, benevolence: 0.75, achievement: 0.55 },
        skills: { digging: 0.45, farming: 0.6 },
        refuge: 0.65,
      },
      {
        id: 'elif',
        name: 'Elif',
        age: 37,
        sex: 'female',
        traits: { honesty: 0.62, emotionality: 0.75, agreeableness: 0.6, conscientiousness: 0.65 },
        values: { security: 0.9, benevolence: 0.8 },
        devout: true,
        refuge: 0.7,
      },
      {
        id: 'kerem',
        name: 'Kerem',
        age: 16,
        sex: 'male',
        traits: { honesty: 0.5, extraversion: 0.8, conscientiousness: 0.35, openness: 0.7 },
        values: { stimulation: 0.8, achievement: 0.6 },
        skills: { digging: 0.3 },
        refuge: 0.45,
      },
      { id: 'zehra', name: 'Zehra', age: 11, sex: 'female', traits: { openness: 0.8, extraversion: 0.6 } },
    ],
  },
  {
    id: 'demir',
    name: 'the Demir house',
    x: 12,
    jars: 6,
    people: [
      {
        id: 'musa',
        name: 'Musa',
        age: 29,
        sex: 'male',
        traits: { honesty: 0.8, conscientiousness: 0.75, agreeableness: 0.7, extraversion: 0.4 },
        values: { benevolence: 0.8, tradition: 0.6, achievement: 0.6 },
        skills: { digging: 0.55, farming: 0.5 },
        devout: true,
        refuge: 0.6,
      },
      {
        id: 'ayse',
        name: 'Ayşe',
        age: 25,
        sex: 'female',
        traits: { honesty: 0.55, extraversion: 0.7, agreeableness: 0.65, openness: 0.6 },
        values: { hedonism: 0.55, benevolence: 0.7 },
        refuge: 0.5,
      },
      {
        id: 'hatice',
        name: 'Hatice',
        age: 58,
        sex: 'female',
        traits: { honesty: 0.9, conscientiousness: 0.8, agreeableness: 0.55, emotionality: 0.5 },
        values: { tradition: 0.85, benevolence: 0.8, conformity: 0.7 },
        devout: true,
        refuge: 0.5,
      },
    ],
  },
  {
    id: 'usta',
    name: 'the dig-master’s house',
    x: 14,
    jars: 4,
    people: [
      {
        id: USTA_ID,
        name: 'Yusuf Usta',
        age: 74,
        sex: 'male',
        traits: { honesty: 0.75, conscientiousness: 0.7, openness: 0.75, extraversion: 0.5 },
        values: { tradition: 0.7, benevolence: 0.75 },
        skills: { digging: 0.9 },
        devout: true,
      },
      {
        id: 'meryem',
        name: 'Meryem',
        age: 19,
        sex: 'female',
        traits: { honesty: 0.6, openness: 0.85, conscientiousness: 0.55, extraversion: 0.45 },
        values: { selfDirection: 0.8, stimulation: 0.65, achievement: 0.65 },
        skills: { digging: 0.45 },
        refuge: 0.6,
      },
    ],
  },
];

/** Kin ties inside a house: spouses married, parents and children and siblings marked. */
function tieHouse(ps: Person[], ws: Who[], now: number) {
  const head = ps[0];
  for (const a of ps)
    for (const b of ps) {
      if (a === b) continue;
      const wa = ws.find((w) => w.id === a.id);
      const wb = ws.find((w) => w.id === b.id);
      if (!wa || !wb) continue;
      const spouses =
        (a === head || b === head) &&
        wa.sex !== wb.sex &&
        Math.abs(wa.age - wb.age) < 15 &&
        wa.age >= 18 &&
        wb.age >= 18;
      if (spouses) {
        if (a.id < b.id) marry(a, b, now, MUSLIM_CUSTOM);
        continue;
      }
      const roles: string[] = [];
      if (wa.age - wb.age >= 16) roles.push('child');
      else if (wb.age - wa.age >= 16) roles.push('parent');
      else roles.push('sibling');
      seedTie(a, { otherId: b.id, roles, affection: 0.7, familiarity: 0.95, trust: 0.75 });
    }
}

function legacyFounders(seed: number, now: number): { houses: House[]; people: Person[] } {
  const houses: House[] = [];
  const people: Person[] = [];
  for (const h of FOUNDERS) {
    const ps = h.people.map((w) => makePerson(w, seed, now, h.id));
    tieHouse(ps, h.people, now);
    people.push(...ps);
    houses.push({ id: h.id, name: h.name, x: h.x, members: ps.map((p) => p.id), came: 0, jars: h.jars });
  }
  // Everyone in a hamlet of nine knows everyone; the dig-master is respected.
  for (const a of people)
    for (const b of people) {
      if (a === b || a.social.relationships.some((r) => r.otherId === b.id)) continue;
      seedTie(a, {
        otherId: b.id,
        roles: ['neighbor'],
        affection: 0.35,
        familiarity: 0.8,
        trust: b.id === USTA_ID ? 0.75 : 0.55,
      });
    }
  return { houses, people };
}

const FAMILY_NAMES = [
  'Arslan',
  'Yıldız',
  'Çelik',
  'Şahin',
  'Aydın',
  'Öztürk',
  'Kılıç',
  'Doğan',
  'Koç',
  'Kurt',
  'Polat',
  'Erdem',
  'Kara',
  'Ak',
  'Bulut',
  'Tekin',
  'Güneş',
  'Ateş',
  'Uçar',
  'Duman',
  'Ekinci',
  'Bağcı',
  'Çoban',
  'Tuncer',
  'Yalçın',
  'Sarı',
  'Bozkurt',
  'Ünal',
];
const MEN = [
  'Ali',
  'Ömer',
  'İbrahim',
  'Osman',
  'Halil',
  'Mehmet',
  'Yakup',
  'Selim',
  'Rıza',
  'Cemal',
  'Bekir',
  'İsmail',
  'Kadir',
  'Salih',
];
const WOMEN = [
  'Fatma',
  'Emine',
  'Zeynep',
  'Havva',
  'Sultan',
  'Gül',
  'Rabia',
  'Nuriye',
  'Saliha',
  'Hacer',
  'Esma',
  'Şerife',
  'Leyla',
  'Dilek',
];

/** A family arriving because they heard: 2..5 people, rolled from the seed and the arrival's number. */
export function arrivingFamily(
  seed: number,
  n: number,
  now: number,
  x: number,
  used: Set<string>,
): { house: House; people: Person[] } {
  const r = stream(mixSeed(seed, DRAW.arrival, n), DRAW.arrival);
  let fam = 'Yeni';
  const start = n + Math.floor(r() * FAMILY_NAMES.length);
  for (let k = 0; k < FAMILY_NAMES.length; k++) {
    const nm = FAMILY_NAMES[(start + k) % FAMILY_NAMES.length] ?? 'Yeni';
    if (!used.has(`house:${nm}`)) {
      fam = nm;
      break;
    }
  }
  used.add(`house:${fam}`);
  const size = 2 + Math.floor(r() * 4);
  const ws: Who[] = [];
  const pick = (list: string[]) => {
    for (let k = 0; k < 40; k++) {
      const nm = list[Math.floor(r() * list.length)] ?? 'Ali';
      if (!used.has(nm)) {
        used.add(nm);
        return nm;
      }
    }
    return `${list[0]} ${n}`;
  };
  const trait = () => 0.2 + 0.6 * r();
  const headAge = 24 + Math.floor(r() * 30);
  const headMale = r() < 0.7;
  const mk = (age: number, sex: 'male' | 'female'): Who => {
    const name = pick(sex === 'male' ? MEN : WOMEN);
    return {
      id: `${name.toLowerCase().replace(/[^a-z]/g, '')}${n}`,
      name,
      age,
      sex,
      traits: {
        honesty: trait(),
        emotionality: trait(),
        extraversion: trait(),
        agreeableness: trait(),
        conscientiousness: trait(),
        openness: trait(),
      },
      values: { security: 0.6 + 0.3 * r(), benevolence: 0.4 + 0.4 * r(), achievement: 0.3 + 0.5 * r() },
      devout: r() < 0.45,
      trust: 0.4 + 0.2 * r(),
      refuge: 0.35 + 0.3 * r(),
    };
  };
  ws.push(mk(headAge, headMale ? 'male' : 'female'));
  if (size >= 2) ws.push(mk(Math.max(18, headAge - 3 - Math.floor(r() * 6)), headMale ? 'female' : 'male'));
  for (let k = 2; k < size; k++) {
    const age = Math.max(1, headAge - 18 - Math.floor(r() * 14));
    ws.push(mk(age, r() < 0.5 ? 'male' : 'female'));
  }
  const id = `h${n}`;
  const ps = ws.map((w) => makePerson(w, seed, now, id));
  tieHouse(ps, ws, now);
  return {
    house: {
      id,
      name: `the ${fam} house`,
      x,
      members: ps.map((p) => p.id),
      came: Math.floor(now / DAY),
      jars: 2 + size,
    },
    people: ps,
  };
}

/** The keeper is a player office; Yusuf Usta remains an independent person. */
export const CAST_IDS: Record<string, string> = {
  yusuf: 'hf.cast.yusuf.warren',
  meryem: 'hf.cast.meryem.warren',
  maryam: 'hf.cast.maryam.well',
  tariq: 'hf.cast.tariq.well',
  kian: 'hf.cast.kian.watch',
  tamar: 'hf.cast.tamar.watch',
};
export const VISIT_TERMS: Record<string, string> = {
  yusuf:
    'Yusuf Usta is a retired well-digger and adviser. Meryem is his granddaughter. You are the keeper and hold the chalk and bell. You do not play as Yusuf Usta.',
  meryem:
    'Meryem is learning to measure and map land. She lives with her grandfather Yusuf Usta. Her parents live elsewhere.',
  maryam:
    'Maryam is a widowed cook who organises the seed store. Her son Yusuf remains at the Well. Her kitchen visit is temporary. She agreed who would prepare each household meal before she left.',
  tariq:
    'Tariq is sixteen and is learning building work. Maryam is his grandmother. His father Yusuf and stepmother Zehra agreed to this supervised visit. He sleeps in Maryam’s guest household and returns with her.',
  kian: 'Kian is a sixteen-year-old watcher. His sister Ada is in his care. In this new story, Ada agrees to come with him. He remains responsible for her care, and they return together. This does not describe any care agreement brought from the Watch.',
  tamar:
    'Tamar is fifty-four and advises on watching the village boundary. She teaches Kian, who is not her child. She is visiting the refuge during time off. This temporary visit does not make her his guardian.',
};
export function founders(
  seed: number,
  now: number,
  canonical = false,
): { houses: House[]; people: Person[] } {
  if (!canonical) return legacyFounders(seed, now);
  const rows = castForGame('warren');
  const houses: House[] = [
    { id: 'usta', name: 'the dig-master’s house', x: 14, jars: 7, members: ['yusuf', 'meryem'], came: 0 },
    {
      id: 'well-guests',
      name: 'Maryam’s guest household',
      x: 10,
      jars: 7,
      members: ['maryam', 'tariq'],
      came: 0,
    },
    {
      id: 'watch-guests',
      name: 'the Watch guest household (Ada stays with Kian)',
      x: 12,
      jars: 5,
      members: ['kian', 'tamar'],
      came: 0,
    },
  ];
  const people = Object.entries(CAST_IDS).map(([id, castId]) => {
    const c = rows.find((c) => c.castId === castId)!;
    const house = houses.find((h) => h.members.includes(id))!;
    const p = makePerson(
      {
        id,
        name: c.name,
        age: c.age,
        sex: ['meryem', 'maryam', 'tamar'].includes(id) ? 'female' : 'male',
        traits: c.traits,
        values: c.values,
        skills: { digging: id === 'yusuf' ? 0.9 : id === 'meryem' ? 0.45 : 0.15, farming: 0.15 },
        devout: id === 'yusuf',
      },
      seed,
      now,
      house.id,
    );
    // Baseline means exactly the registry, including values previously overridden by this host.
    p.values = structuredClone(c.values);
    return p;
  });
  const relate = (a: string, b: string, roles: string[]) =>
    seedTie(people.find((p) => p.id === a)!, {
      otherId: b,
      roles,
      affection: 0.7,
      familiarity: 0.95,
      trust: 0.75,
    });
  relate('meryem', 'yusuf', ['grandparent']);
  relate('yusuf', 'meryem', ['grandchild']);
  relate('tariq', 'maryam', ['grandparent']);
  relate('maryam', 'tariq', ['grandchild']);
  relate('kian', 'tamar', ['mentor']);
  relate('tamar', 'kian', ['mentee']);
  // Visiting people do not receive fabricated familiarity with the host household or each other.
  return { houses, people };
}
