/** HF selects the wording using its recorded index. */
type Phrases = Record<string, readonly string[]>;

const wordings: Phrases = {
  'suggestion.resolved': [
    'I {verdict}.',
    'For now, I {verdict}.',
    'I have {verdict}.',
    'After considering it, I {verdict}.',
  ],
  'decision.act': [
    'I will {action}.{why}',
    'I choose to {action}.{why}',
    'For now, I will {action}.{why}',
    'My next step is to {action}.{why}',
  ],
  'decision.wait': [
    'I will wait.',
    'For now, I will wait.',
    'I choose to wait.',
    'I will wait a little longer.',
  ],
};

const profiles: Record<string, Phrases> = {
  yusuf: {
    'suggestion.resolved': [
      'I considered your suggestion. I {verdict}.',
      'I {verdict}. That is my decision.',
      'I gave it thought. I {verdict}.',
      'After considering it, I {verdict}.',
    ],
    'decision.act': [
      'I will {action}.{why}',
      'My decision is to {action}.{why}',
      'I have chosen to {action}.{why}',
      'For now, I intend to {action}.{why}',
    ],
    'decision.wait': [
      'I will wait.',
      'My decision is to wait.',
      'For now, I will stay here and wait.',
      'I have chosen to wait a little longer.',
    ],
  },
  meryem: {
    'suggestion.resolved': [
      'I thought about it. I {verdict}.',
      'After thinking it over, I {verdict}.',
      'I {verdict}. I have given it some thought.',
      'I considered your suggestion and {verdict}.',
    ],
    'decision.act': [
      'I think I will {action}.{why}',
      'I have decided to {action}.{why}',
      'For now, I choose to {action}.{why}',
      'I will go and {action}.{why}',
    ],
    'decision.wait': [
      'I think I will wait.',
      'I will give it a little more time.',
      'For now, I choose to wait.',
      'I have decided to wait a while.',
    ],
  },
  maryam: {
    'suggestion.resolved': [
      'I have considered your suggestion. I {verdict}.',
      'I {verdict}. Thank you for suggesting it.',
      'I thought it over and {verdict}.',
      'I {verdict}, after giving it some thought.',
    ],
    'decision.act': [
      'I will see to it and {action}.{why}',
      'I have decided to {action}.{why}',
      'For now, I will {action}.{why}',
      'I choose to {action}.{why}',
    ],
    'decision.wait': [
      'I will wait for now.',
      'I have decided to give it time.',
      'I will wait a little longer.',
      'For the moment, I choose to wait.',
    ],
  },
  tariq: {
    'suggestion.resolved': [
      'I {verdict}.',
      'I thought about it and {verdict}.',
      'I have {verdict}.',
      'I considered your suggestion. I {verdict}.',
    ],
    'decision.act': [
      'I will go and {action}.{why}',
      'I am going to {action}.{why}',
      'I choose to {action}.{why}',
      'I have decided to {action}.{why}',
    ],
    'decision.wait': [
      'I will wait here.',
      'I will wait a little longer.',
      'I choose to wait.',
      'For now, I will wait.',
    ],
  },
  kian: {
    'suggestion.resolved': [
      'I {verdict}.',
      'I have {verdict}.',
      'I considered it and {verdict}.',
      'After thinking it over, I {verdict}.',
    ],
    'decision.act': [
      'I will {action}.{why}',
      'I choose to {action}.{why}',
      'For now, I will {action}.{why}',
      'I have decided to {action}.{why}',
    ],
    'decision.wait': ['I will wait.', 'I choose to wait.', 'I will wait for now.', 'I will wait longer.'],
  },
  tamar: {
    'suggestion.resolved': [
      'I considered your suggestion. I {verdict}.',
      'I {verdict}. That is my decision.',
      'After considering it, I {verdict}.',
      'I have {verdict}. I considered it carefully.',
    ],
    'decision.act': [
      'I have decided to {action}.{why}',
      'My choice is to {action}.{why}',
      'I will {action}.{why}',
      'For now, I intend to {action}.{why}',
    ],
    'decision.wait': [
      'I have decided to wait.',
      'My choice is to wait.',
      'I will wait for now.',
      'I will wait a little longer.',
    ],
  },
};

/** Every current person has a voice; newcomers use the general authored wording. */
export function phrasebookFor(people: readonly { id: string }[]): {
  wordings: Phrases;
  voices: Record<string, Phrases>;
} {
  return { wordings, voices: Object.fromEntries(people.map(({ id }) => [id, profiles[id] ?? wordings])) };
}

const reasons: Record<string, readonly string[]> = {
  distrust: [
    'I do not trust that advice enough.',
    'I am not sure I can trust that advice.',
    'I do not have enough trust in that advice.',
    'I cannot place enough trust in that advice.',
  ],
  unavailable: [
    'I cannot do that here now.',
    'That is not available to me now.',
    'I cannot take that action now.',
    'That action is not available to me.',
  ],
  busy: [
    'I am busy right now.',
    'I am occupied at the moment.',
    'I have something else underway.',
    'I am already occupied.',
  ],
  'need:food': ['I need food.', 'I need to eat.', 'I am hungry.', 'I need something to eat.'],
  'need:water': ['I need water.', 'I need to drink.', 'I am thirsty.', 'I need something to drink.'],
  'need:sleep': ['I need sleep.', 'I need to sleep.', 'I am sleepy.', 'I need some sleep.'],
  'need:rest': ['I need rest.', 'I need to rest.', 'I need a rest.', 'I need time to rest.'],
  'need:bladder': [
    'I need to use the toilet.',
    'I need a toilet.',
    'I need to relieve myself.',
    'I need to go to the toilet.',
  ],
  'need:survival': [
    'I have an urgent bodily need.',
    'I need to attend to an urgent bodily need.',
    'My body needs urgent care.',
    'An urgent bodily need comes first.',
  ],
  dead: ['I have died.', 'My life has ended.', 'I am no longer alive.', 'I am dead.'],
  downed: [
    'I cannot get up.',
    'I am down and cannot do that.',
    'I cannot do that while I am down.',
    'I am unable to get up.',
  ],
  asleep: ['I am asleep.', 'I am sleeping.', 'I cannot do that while asleep.', 'I am asleep right now.'],
  break: [
    'I am too overwhelmed to continue.',
    'I cannot continue; I am overwhelmed.',
    'I am overwhelmed and cannot go on.',
    'I cannot carry on right now; I am overwhelmed.',
  ],
  'not-sleepy': [
    'I am not sleepy.',
    'I do not need sleep yet.',
    'I am not ready to sleep.',
    'I am not sleepy enough to sleep.',
  ],
  invalid: [
    'I cannot do that.',
    'That cannot be done.',
    'I cannot carry that out.',
    'That is not something I can do.',
  ],
  duty: [
    'I must keep a duty.',
    'I have a duty I must keep.',
    'I need to fulfil a duty.',
    'I must attend to a duty.',
  ],
  norm: [
    'That conflicts with a rule I hold.',
    'It goes against a rule I hold.',
    'A rule I hold prevents me.',
    'I hold a rule against that.',
  ],
  rule: [
    'That conflicts with a personal rule of mine.',
    'It goes against a rule I set for myself.',
    'My own rule prevents me.',
    'I have a personal rule against that.',
  ],
  capacity: [
    'I cannot manage that physically now.',
    'I am not able to do that now.',
    'My current condition prevents that.',
    'I cannot manage that in my current condition.',
  ],
  skill: [
    'I do not have enough skill for that.',
    'That needs more skill than I have.',
    'My skill is not enough for that.',
    'I cannot do that with my current skill.',
  ],
  voice: [
    'I am following someone else’s request first.',
    'Someone else’s request comes first now.',
    'I will follow another person’s request first.',
    'I have another person’s request to follow first.',
  ],
};

const commonVoice: Record<string, Record<string, readonly string[]>> = {
  yusuf: {
    distrust: [
      'I do not trust that advice enough.',
      'I cannot place enough trust in that advice.',
      'My trust in that advice is not enough.',
      'I have too little trust in that advice.',
    ],
    busy: [
      'I am occupied now.',
      'I have something underway.',
      'I am busy at present.',
      'I am already occupied.',
    ],
    unavailable: [
      'I cannot do that here now.',
      'I cannot do that from here now.',
      'I cannot do that at present.',
      'I have no way to do that now.',
    ],
    'need:rest': [
      'I need rest.',
      'I need to rest now.',
      'I must take some rest.',
      'It is time for me to rest.',
    ],
  },
  meryem: {
    distrust: [
      'I am not sure I can trust that advice.',
      'I do not trust that advice enough.',
      'I have too little trust in that advice.',
      'I cannot place enough trust in it.',
    ],
    busy: [
      'I am busy with something else.',
      'I have something underway right now.',
      'I am occupied at the moment.',
      'I am already busy.',
    ],
    unavailable: [
      'I cannot do that here right now.',
      'I do not have a way to do that now.',
      'That is not available to me yet.',
      'I cannot do that at the moment.',
    ],
    'need:rest': [
      'I think I need to rest.',
      'I need a little rest.',
      'I need time to rest.',
      'I need to rest now.',
    ],
  },
  maryam: {
    distrust: [
      'I cannot trust that advice enough.',
      'I have too little trust in that advice.',
      'I do not have enough trust in it.',
      'I cannot place enough trust in that advice.',
    ],
    busy: [
      'I am busy with something just now.',
      'I have something else underway.',
      'I am occupied right now.',
      'I am already busy.',
    ],
    unavailable: [
      'I cannot do that just now.',
      'That is not available to me now.',
      'I have no way to do that at present.',
      'I cannot manage that here now.',
    ],
    'need:rest': [
      'I need to rest a while.',
      'I need some rest now.',
      'I need time to rest.',
      'I must have a little rest.',
    ],
  },
  tariq: {
    distrust: [
      'I do not trust that advice enough.',
      'I cannot trust it enough.',
      'I have too little trust in that advice.',
      'I am not sure I can trust it.',
    ],
    busy: [
      'I am busy right now.',
      'I am doing something else.',
      'I already have something underway.',
      'I am occupied at the moment.',
    ],
    unavailable: [
      'I cannot do that right now.',
      'There is no way for me to do that now.',
      'That is not available to me.',
      'I cannot do that here now.',
    ],
    'need:rest': [
      'I need a rest.',
      'I need to rest now.',
      'I need some time to rest.',
      'I need a little rest.',
    ],
  },
  kian: {
    distrust: [
      'I do not trust that advice enough.',
      'I cannot trust it enough.',
      'I have too little trust in it.',
      'I do not trust that advice enough to follow it.',
    ],
    busy: ['I am busy.', 'I am occupied now.', 'I have something underway.', 'I am already busy.'],
    unavailable: [
      'I cannot do that now.',
      'That is unavailable to me.',
      'I cannot do that here.',
      'I have no way to do that now.',
    ],
    'need:rest': ['I need rest.', 'I need to rest.', 'I need a rest now.', 'I need time to rest.'],
  },
  tamar: {
    distrust: [
      'I do not trust that advice enough.',
      'I have insufficient trust in that advice.',
      'I cannot place enough trust in it.',
      'I do not trust that advice enough to follow it.',
    ],
    busy: [
      'I am already occupied.',
      'I have something underway.',
      'I am busy at present.',
      'I am occupied right now.',
    ],
    unavailable: [
      'I cannot do that at present.',
      'I cannot do that from here now.',
      'I have no way to do that now.',
      'I cannot do that here now.',
    ],
    'need:rest': ['I need to rest now.', 'I need a period of rest.', 'I must rest.', 'I need time to rest.'],
  },
};

/** Explain only the recorded reason. Unknown codes have no invented explanation. */
export function replyReason(who: string, reason: string, variant: number): string {
  const lines = commonVoice[who]?.[reason] ?? reasons[reason] ?? reasons[reason.split(':')[0] ?? ''];
  if (!lines) return '';
  const index = Number.isFinite(variant) ? Math.floor(variant) : 0;
  return lines[((index % lines.length) + lines.length) % lines.length] ?? '';
}
