/** Glosses for HF narration and historical saves. New game prose is written at its source. */
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
};
/** Translate setting titles only at the display boundary. */
export function settingWords(text: string): string {
  return text
    .replaceAll('Yusuf Usta', 'Master Yusuf')
    .replaceAll('Hajja Maryam', 'Maryam')
    .replace(/\bUsta\b/gu, 'Master');
}

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
  return settingWords(result)
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
