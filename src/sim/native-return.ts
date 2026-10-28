/** Only the known Warren → Watch Meryem/Kian route. No travel or completed return is inferred. */
import { canonicalPersona } from '@adam0white/lab-client';
import { type AdaVisit, shiftWatchCare, validateWatchCare } from './ada-care.ts';
import type { WarrenState } from './warren.ts';

export type NativeReturnId = 'kian' | 'meryem';
export function returnCare(
  visit: AdaVisit | undefined,
  captured: number,
  commitments: Parameters<typeof validateWatchCare>[2],
) {
  if (!visit || visit.endedAt === undefined || visit.endedAt > captured || visit.returnBy <= captured)
    throw Error(
      'Finish the optional refuge work before preparing a saved return to the Watch. The duty to return must remain pending.',
    );
  const v = structuredClone(visit);
  validateWatchCare(
    v.source,
    captured - v.offset,
    commitments.map((c) => ({
      ...structuredClone(c),
      from: c.from - v.offset,
      until: c.until - v.offset,
    })),
  );
  const shifted = shiftWatchCare(v.source, v.offset);
  if (
    canonicalPersona(v.agreement) !== canonicalPersona(shifted.agreement) ||
    canonicalPersona(v.care) !== canonicalPersona(shifted.care) ||
    v.returnBy !== shifted.returnBy
  )
    throw Error('The original care record does not match the saved record from the Watch.');
  validateWatchCare({ agreement: v.agreement, care: v.care, dependent: v.dependent }, captured, commitments);
  if (
    !Number.isSafeInteger(v.careCount) ||
    v.careCount < 0 ||
    v.careCount > 48 ||
    v.dependent.ageMinutes !== v.source.dependent.ageMinutes ||
    v.dependent.sourceMinute < shifted.dependent.sourceMinute ||
    v.dependent.sourceMinute > captured ||
    Math.abs(v.dependent.satiety - Math.min(1, v.source.dependent.satiety + 0.35 * v.careCount)) > 1e-12 ||
    Math.abs(v.dependent.hydration - Math.min(1, v.source.dependent.hydration + 0.35 * v.careCount)) >
      1e-12 ||
    Math.abs(v.dependent.sleepPressure - Math.max(0, v.source.dependent.sleepPressure - 0.05 * v.careCount)) >
      1e-12
  )
    throw Error('Ada’s current care record does not match the care completed during this visit.');
  return { version: 'warren-watch-ada/1' as const, capturedMinute: captured, visit: v };
}

/** HF3 Watch checkpoints are deliberately refused by the HF4 edition. */
export function prepareNativeReturn(_s: WarrenState, _who: NativeReturnId): boolean {
  return false;
}
export function nativeReturnCurrent(_s: WarrenState, _who: NativeReturnId): boolean {
  return false;
}
export async function projectNativeReturn(_s: WarrenState, _who: NativeReturnId): Promise<never> {
  throw new Error(
    'This HF4 hill cannot make an older Watch handoff. Keep your notebook. People continue through the browser shelf when the receiving game supports this version.',
  );
}
