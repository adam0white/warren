import { H, K, SURF, W, xOf, yOf } from '../sim/grid.ts';
import type { WarrenState } from '../sim/warren.ts';
import type { View } from './draw.ts';

/** Only excavated space widens the view: chalk and unseen chambers are not a larger refuge. */
export function baseView(s: WarrenState, w: number, h: number): View {
  let left = s.hill.surface.entrance;
  let right = left;
  let bottom = SURF;
  for (let i = SURF * W; i < s.hill.kind.length; i++) {
    if (s.hill.kind[i] !== K.open) continue;
    left = Math.min(left, xOf(i));
    right = Math.max(right, xOf(i));
    bottom = Math.max(bottom, yOf(i));
  }
  const cs = Math.min(48, w / Math.max(11, right - left + 7), h / (bottom - SURF + 8));
  const vw = w / cs;
  return {
    cs,
    x: vw > W + 1 ? (W - vw) / 2 : Math.max(-0.5, Math.min(W + 0.5 - vw, (left + right + 1 - vw) / 2)),
    y: Math.max(0, Math.min(SURF - 3, H - h / cs)),
    w,
    h,
  };
}

/** Time-based easing is stable across frame rates; it never changes simulation state. */
export function easeView(from: View, to: View, dt: number): View {
  const a = 1 - Math.exp(-Math.max(0, dt) / 350);
  return {
    ...to,
    cs: from.cs + (to.cs - from.cs) * a,
    x: from.x + (to.x - from.x) * a,
    y: from.y + (to.y - from.y) * a,
  };
}
