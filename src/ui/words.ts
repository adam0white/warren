import type { Person } from '@adam0white/human-framework';

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
  return settingWords(text).replace(
    /heard the bell and kept on with ([^.]+)\./g,
    'heard the bell and continued to $1.',
  );
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
