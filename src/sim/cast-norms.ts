import { DEFAULT_NORMS, type PersonAuthoring, type RunSpec } from '@adam0white/human-framework';

export const SITE_CAST_NORMS = DEFAULT_NORMS;

/** Keep the source's exact definitions and provenance for imported understandings.
 * HF checks each passport against this catalogue and refuses conflicting claims. */
export function castNorms(people: PersonAuthoring[]): RunSpec['definitions']['norms'] {
  const norms = [...SITE_CAST_NORMS];
  const ids = new Set(norms.map((norm) => norm.id));
  for (const person of people) {
    const portable = person.portable?.person;
    if (portable?.version !== 2) continue;
    for (const norm of portable.retained.calendar.norms) {
      if (!ids.has(norm.id)) {
        norms.push(structuredClone(norm) as RunSpec['definitions']['norms'][number]);
        ids.add(norm.id);
      }
    }
  }
  return norms;
}
