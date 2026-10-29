import type { PersonReading as Person } from '../sim/hf4.ts';

/** Host wording only. HF supplies complete sentences for fresh games. */
/** Translate setting titles only at the display boundary. */
export function settingWords(text: string): string {
  return text
    .replaceAll('Yusuf Usta', 'Master Yusuf')
    .replaceAll('Hajja Maryam', 'Maryam')
    .replace(/\bUsta\b/gu, 'Master');
}

export function speechWords(text: string): string {
  return displayWords(text);
}
export function displayWords(text: string): string {
  return settingWords(text)
    .replace(
      /([^.!?]+) and others gave the same reply\. \1 said: “([^”]+)”/gu,
      '$1 and the others said: “$2”',
    )
    .replaceAll(
      'In this new story, Ada agrees to come with him. He remains responsible for her care, and they return together. This does not describe any care agreement brought from the Watch.',
      'Ada comes with him for the visit. He looks after her, and they go back together.',
    )
    .replaceAll(' This temporary visit does not make her his guardian.', '')
    .replaceAll('Her son Yusuf remains at the Well.', 'Her son Yusuf stayed behind at the well settlement.')
    .replace(/([^.!?]+) was still in view there\./gu, '$1 could still be seen from there.')
    .replaceAll(
      'came up under the open sky. Air will come down this shaft now, and so could riders.',
      'dug through to the surface. Air can now come down this shaft, but riders could too.',
    )
    .replace(/heard the bell and kept on with ([^.]+)\./g, 'heard the bell and continued to $1.');
}
export function activityWords(label: string, walking = false, name = 'This person'): string {
  label = displayWords(label);
  return label === 'deciding what to do'
    ? `${name} is deciding what to do.`
    : walking
      ? `${name} is on the way to ${label}.`
      : `${name}’s current task is to ${label}.`;
}

/** Names are the fallback when an imported person has no recorded sex. */
export function personWords(p: Person) {
  const subject = p.life.sex === 'female' ? 'She' : p.life.sex === 'male' ? 'He' : p.name;
  const possessive = p.life.sex === 'female' ? 'Her' : p.life.sex === 'male' ? 'His' : `${p.name}’s`;
  return { subject, lower: subject === p.name ? subject : subject.toLowerCase(), possessive };
}
