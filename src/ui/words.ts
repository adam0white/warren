/** Display-only language. Saved notes, HF decisions and replay hashes keep their original bytes. */
const phrases: Record<string, string> = {
  "I'm starving — eating first.": 'I am very hungry. I need to eat first.',
  'Food first.': 'I need food first.',
  "I'm parched. Water first.": 'I am very thirsty. I need water first.',
  'Thirsty — the well, then.': 'I am thirsty. I will go to the well.',
  "I can't keep my eyes open. Bed.": 'I cannot keep my eyes open. I need to sleep.',
  'Sleep, before anything else.': 'I need to sleep before doing anything else.',
  'A rest first, then the rest.': 'I will rest before doing other tasks.',
  'Time for something easier.': 'I want to do something easier.',
  'Something worthwhile, for once.': 'I want to do something worthwhile.',
  'My choice, this time.': 'I will make my own choice this time.',
  'Caution, for now.': 'I will be careful for now.',
  'Same as always.': 'I will do what I usually do.',
  'Out of habit, really.': 'I do this out of habit.',
  'The easy thing, for now.': 'I will do something easy for now.',
  'Nothing strenuous.': 'I will avoid hard work for now.',
  'Charity, while I can.': 'I will give to others while I can.',
  'For my parents.': 'I am doing this for my parents.',
  'Good idea. On it.': 'That is a good idea. I will do it.',
  'On it.': 'I will do it.',
  'As you say.': 'I will do as you say.',
  "Can't — I'm under orders.": 'I cannot do that. I am following orders.',
  "I'm down.": 'I cannot get up.',
  'Not now, not here.': 'I cannot do that here now.',
  'I haven’t the strength.': 'I do not have the strength.',
  'carry spoil up to the heap': 'carry loose rock up to the heap',
  'dig at the chalked face': 'dig at the marked wall',
  'dig at the loose face': 'dig at the loose stone',
  'go down and show them the stroke': 'go below and show others how to cut stone',
  'Then a lamp came through it: the next village’s diggers had reached ours.':
    'Then diggers from the next village broke through with a lamp.',
  'broke through into someone else’s dark: a swept floor, a lamp niche, jars along a wall.':
    'broke through into a dark room with a swept floor, a lamp niche and jars along a wall.',
  'Fresh local fiction:': 'In a new hill,',

  'Smoke on the southern hills, more than a field fire makes. Riders, then. Half a day, maybe less.':
    'Smoke rises from the southern hills. It is too much for a field fire. Riders may arrive in half a day or less.',
  'Smoke again in the south.': 'Smoke rises in the south again.',
  'Riders on the hill. Hooves over our heads, voices at the entrance.':
    'Riders are on the hill. We hear hooves above us and voices at the entrance.',
  'First frost.': 'The first frost has come.',
  'A knocking in the east wall at night, regular as a pick.':
    'Someone knocks against the east wall at night, as regularly as a pick strikes.',
  'Jars half empty in the store this morning, and the dust by the east passage scuffed.':
    'The jars in the store were half empty this morning. Footprints marked the dust by the east passage.',
  'Water.': 'Water flows from the stone.',
  'A well under the hill.': 'There is a well under the hill.',
  'Chalk under the ridge.': 'You marked stone under the ridge.',
  'Past it the stone is the neighbours’.': 'Beyond the ridge, the stone belongs to the neighbours.',
  'A stone door the riders cannot pass.': 'Build a stone door that riders cannot pass.',
  'Beds below for everyone before the frost.': 'Mark sleeping places below for everyone before the frost.',
  'Water under the hill.': 'Find water under the hill.',
  'Room for those who hear of us: thirty souls.': 'Make room for thirty people as families arrive.',
  'Below the hard band.': 'Dig below the layer of hard stone.',
  'A year under the hill.': 'Live through a year under the hill.',
  'A door, before they come again.': 'We need a door before they come again.',
  'Better below than above when they come.': 'The grain is better stored below when riders come.',
  'Retired well-digger and adviser.': 'He is a retired well-digger and adviser.',
  'Apprentice surveyor, living with her grandfather Yusuf Usta.':
    'She is an apprentice surveyor and lives with her grandfather Yusuf Usta.',
  'Widowed cook and seed-store organiser.': 'She is a widowed cook and organises the seed store.',
  'Sixteen-year-old building apprentice.': 'He is a sixteen-year-old building apprentice.',
  'Sixteen-year-old watcher.': 'He is a sixteen-year-old watcher.',
  'Fifty-four-year-old perimeter adviser.': 'She is a fifty-four-year-old perimeter adviser.',
  'Fine.': 'I agree.',
  'Time to pray.': 'It is time to pray.',
  'Prayer first; the rest can wait.': 'I will pray first. The rest can wait.',
  'Because I should.': 'I should do this.',
  'Another step toward what I want.': 'This takes me closer to what I want.',
  'Keeping at it.': 'I will keep working at it.',
  'Nearly did otherwise.': 'I nearly chose something else.',
  'Why not.': 'I see no reason not to.',
  'Might as well.': 'I may as well do this.',
  'Nothing for it but to wait.': 'I can only wait.',
  'Away from drinking water, and after the work is put away.':
    'I will try it away from drinking water, after I put the work away.',
  'No riders again.': 'No riders came again.',
  'No riders.': 'No riders came.',
};
export function speechWords(text: string): string {
  return displayWords(text)
    .replace(/Not now\. (After [^.]+)\./g, 'I cannot come now. I will come $1.')
    .replace(/I will come After /g, 'I will come after ')
    .replace(/Not now\. Later\./g, 'I cannot come now. I will come later.')
    .replace(/On it\./g, 'I will do it.')
    .replace(/Since you insist\./g, 'I will do it because you insist.')
    .replace(/Not what I'd choose\./g, 'That is not what I would choose.');
}
export function displayWords(text: string): string {
  let result = text;
  for (const [from, to] of Object.entries(phrases)) result = result.replaceAll(from, to);
  return result
    .replace(/heard the bell and kept on with ([^.]+)\./g, 'heard the bell and continued to $1.')
    .replace(/“([^”]+)”/g, (_, speech: string) => `“${speechWords(speech)}”`);
}
export function activityWords(label: string, walking = false): string {
  label = displayWords(label);
  return label === 'deciding what to do'
    ? 'They are deciding what to do.'
    : walking
      ? `They are on their way to ${label}.`
      : `Their current task is to ${label}.`;
}
