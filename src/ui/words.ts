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
export function activityWords(label: string, walking = false): string {
  label = displayWords(label);
  return label === 'deciding what to do'
    ? 'They are deciding what to do.'
    : walking
      ? `They are on their way to ${label}.`
      : `Their current task is to ${label}.`;
}
