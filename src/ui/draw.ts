/**
 * The cross-section, drawn like a page of a field notebook: ink on paper, jittered lines, no bars. The rock is
 * stippled; what nobody has seen is drawn as plain rock. Worn floors are darker ink; dark passages are shaded;
 * stale air is a faint wavy hatch. People are small ink figures whose posture says what they are doing.
 */
import { ageYears, type Person, readBody } from '@adam0white/human-framework';
import { DAY, HOUR, isLight, minuteOfDay } from '../sim/calendar.ts';
import { AIR_REACH, faces, H, idx, K, STORE_CAP, SURF, USE, W, xOf, yOf } from '../sim/grid.ts';
import { USTA_ID } from '../sim/people.ts';
import { strHash } from '../sim/rng.ts';
import {
  activeRaid,
  airAndLight,
  carrying,
  drawPosition,
  faceState,
  type WarrenState,
} from '../sim/warren.ts';

export interface Ink {
  paper: string;
  paper2: string;
  ink: string;
  soft: string;
  rope: string;
  moss: string;
  sky: string;
  dark: boolean;
}

export function readInk(): Ink {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim() || '#000';
  const paper = v('--paper');
  return {
    paper,
    paper2: v('--paper-2'),
    ink: v('--ink'),
    soft: v('--ink-soft'),
    rope: v('--rope'),
    moss: v('--moss'),
    sky: v('--sky'),
    dark: paper.toLowerCase() === '#1e1b16',
  };
}

export interface View {
  /** Cell size in CSS px. */
  cs: number;
  /** Top-left corner, in cells. */
  x: number;
  y: number;
  /** Canvas size in CSS px. */
  w: number;
  h: number;
}

export interface Paint {
  /** Cells under the keeper's finger right now (chalk/erase/store/beds preview). */
  preview: Set<number>;
  previewKind: 'chalk' | 'erase' | 'store' | 'beds' | null;
  selected: string | null;
  /** Display minute (between quanta). */
  t: number;
}

const unit = (k: number) => (((Math.sin(k * 12.9898) * 43758.5453) % 1) + 1) % 1;

function wobLine(
  c: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  key: number,
  amp = 1,
) {
  const mx = (x1 + x2) / 2 + (unit(key) - 0.5) * 2 * amp;
  const my = (y1 + y2) / 2 + (unit(key + 7) - 0.5) * 2 * amp;
  c.moveTo(x1, y1);
  c.quadraticCurveTo(mx, my, x2, y2);
}

export function draw(c: CanvasRenderingContext2D, s: WarrenState, v: View, ink: Ink, paint: Paint) {
  const { cs } = v;
  const h = s.hill;
  const t = paint.t;
  const { air, lit } = airAndLight(s);
  const light = isLight(t);
  c.save();
  c.fillStyle = ink.paper;
  c.fillRect(0, 0, v.w, v.h);
  c.translate(-v.x * cs, -v.y * cs);
  const x0 = Math.max(0, Math.floor(v.x));
  const y0 = Math.max(0, Math.floor(v.y));
  const x1 = Math.min(W, Math.ceil(v.x + v.w / cs) + 1);
  const y1 = Math.min(H, Math.ceil(v.y + v.h / cs) + 1);
  const linked = s.linked;

  // Sky: night is a wash of --sky.
  if (!light) {
    c.globalAlpha = ink.dark ? 0.25 : 0.14;
    c.fillStyle = ink.sky;
    c.fillRect(0, 0, W * cs, SURF * cs);
    c.globalAlpha = 1;
  }

  // Rock and rooms.
  for (let y = Math.max(y0, SURF); y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = idx(x, y);
      const k = h.kind[i] ?? K.rock;
      const px = x * cs;
      const py = y * cs;
      const seen = !!h.known[i];
      const theirs = k === K.theirs;
      if (k === K.open || (theirs && (linked || seen))) {
        c.fillStyle = ink.paper;
        c.fillRect(px, py, cs, cs);
        const wear = h.wear[i] ?? 0;
        if (wear > 0.5) {
          c.globalAlpha = Math.min(0.32, 0.06 + Math.log1p(wear) * 0.05);
          c.fillStyle = ink.soft;
          c.fillRect(px + cs * 0.1, py + cs * 0.82, cs * 0.8, cs * 0.14);
          c.globalAlpha = 1;
        }
        if (lit[i] && !theirs) {
          c.globalAlpha = ink.dark ? 0.1 : 0.07;
          c.fillStyle = ink.rope;
          c.fillRect(px, py, cs, cs);
          c.globalAlpha = 1;
        }
        if (!lit[i] && !theirs) {
          c.globalAlpha = ink.dark ? 0.55 : 0.32;
          c.fillStyle = ink.dark ? '#000' : ink.ink;
          c.fillRect(px, py, cs, cs);
          c.globalAlpha = 1;
        }
        if ((air[i] ?? 32000) > AIR_REACH && !theirs) {
          c.strokeStyle = ink.sky;
          c.globalAlpha = 0.5;
          c.lineWidth = 1;
          c.beginPath();
          for (let r = 0; r < 2; r++) {
            const yy = py + cs * (0.3 + r * 0.35);
            c.moveTo(px + cs * 0.15, yy);
            c.bezierCurveTo(
              px + cs * 0.35,
              yy - cs * 0.12,
              px + cs * 0.55,
              yy + cs * 0.12,
              px + cs * 0.85,
              yy,
            );
          }
          c.stroke();
          c.globalAlpha = 1;
        }
        drawUse(c, s, i, px, py, cs, ink, lit[i] === 1);
        const sp = h.spoil[i] ?? 0;
        if (sp > 0.05) {
          c.fillStyle = ink.soft;
          const n = Math.min(9, Math.ceil(sp * 3));
          for (let q = 0; q < n; q++) {
            const u = unit(i * 31 + q);
            const w = unit(i * 17 + q * 3);
            c.beginPath();
            c.arc(
              px + cs * (0.15 + u * 0.7),
              py + cs * (0.92 - w * 0.12 * Math.min(3, sp)),
              cs * 0.06,
              0,
              Math.PI * 2,
            );
            c.fill();
          }
        }
        continue;
      }
      // Rock: paper-2 with stipple; what has been seen shows its nature.
      c.fillStyle = ink.paper2;
      c.fillRect(px, py, cs, cs);
      c.fillStyle = ink.soft;
      const dots = k === K.bedrock ? 12 : 6;
      for (let q = 0; q < dots; q++) {
        c.globalAlpha = 0.55;
        c.fillRect(px + unit(i * 7 + q) * cs, py + unit(i * 13 + q) * cs, 1.5, 1.5);
      }
      c.globalAlpha = 1;
      if (seen || k === K.bedrock) {
        if (k === K.hard || k === K.bedrock) {
          c.strokeStyle = ink.soft;
          c.lineWidth = 1;
          c.beginPath();
          for (let q = 0; q < 3; q++)
            wobLine(c, px + q * cs * 0.33, py + cs, px + q * cs * 0.33 + cs * 0.33, py, i + q, 0.6);
          c.stroke();
        } else if (k === K.loose) {
          c.strokeStyle = ink.soft;
          c.lineWidth = 1;
          for (let q = 0; q < 3; q++) {
            c.beginPath();
            c.arc(
              px + cs * (0.2 + unit(i + q) * 0.6),
              py + cs * (0.2 + unit(i * 3 + q) * 0.6),
              cs * 0.1,
              0,
              Math.PI * 2,
            );
            c.stroke();
          }
        } else if (k === K.seam) {
          c.strokeStyle = ink.sky;
          c.lineWidth = 1.2;
          c.beginPath();
          wobLine(c, px, py + cs * 0.5, px + cs, py + cs * 0.55, i, 1.5);
          c.stroke();
        }
      }
      // Half-dug: cracks.
      const d = h.dig[i] ?? 0;
      if (d > 0.02) {
        c.strokeStyle = ink.ink;
        c.lineWidth = 1;
        c.beginPath();
        const n = 1 + Math.floor(d * 4);
        for (let q = 0; q < n; q++) {
          const ax = px + unit(i + q * 5) * cs;
          const ay = py + unit(i * 2 + q) * cs;
          wobLine(
            c,
            ax,
            ay,
            ax + (unit(q + i) - 0.5) * cs * 0.6,
            ay + (unit(q * 9 + i) - 0.5) * cs * 0.6,
            i + q,
            1,
          );
        }
        c.stroke();
      }
    }

  // Outlines of open space: the walls, inked.
  c.strokeStyle = ink.ink;
  c.lineWidth = 1.5;
  c.beginPath();
  for (let y = Math.max(y0, SURF); y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = idx(x, y);
      const open = isOpen(s, i);
      if (!open) continue;
      const px = x * cs;
      const py = y * cs;
      if (x > 0 && !isOpen(s, i - 1)) wobLine(c, px, py, px, py + cs, i * 4, 0.8);
      if (x < W - 1 && !isOpen(s, i + 1)) wobLine(c, px + cs, py, px + cs, py + cs, i * 4 + 1, 0.8);
      if (y > SURF && !isOpen(s, i - W)) wobLine(c, px, py, px + cs, py, i * 4 + 2, 0.8);
      if (y < H - 1 && !isOpen(s, i + W)) wobLine(c, px, py + cs, px + cs, py + cs, i * 4 + 3, 0.8);
    }
  c.stroke();

  // The ground line and the surface.
  drawSurface(c, s, cs, ink, t);

  // Chalk and faces.
  c.lineWidth = 1.6;
  for (let i = 0; i < h.chalk.length; i++) {
    if (!h.chalk[i]) continue;
    const x = xOf(i);
    const y = yOf(i);
    if (x < x0 - 1 || x > x1 || y < y0 - 1 || y > y1) continue;
    chalkMark(c, x * cs, y * cs, cs, ink.rope, i);
  }
  const fs = faces(h);
  c.font = `${Math.round(cs * 0.42)}px Caveat, cursive`;
  c.textAlign = 'center';
  for (const f of fs) {
    const st = faceState(s, f.face, f.stand, lit, air);
    if (st === 'ready' || st === 'busy') continue;
    const word = st === 'dark' ? 'dark' : st === 'stale' ? 'no air' : st === 'spoil' ? 'blocked' : '';
    if (!word) continue;
    c.fillStyle = ink.rope;
    c.fillText(word, (xOf(f.face) + 0.5) * cs, (yOf(f.face) + 0.62) * cs);
  }
  // Lamps the keeper has asked for: ghost outlines.
  for (const g of h.lampsWanted) lampGlyph(c, xOf(g) * cs, yOf(g) * cs, cs, ink, true);

  // Preview of the finger's stroke.
  if (paint.previewKind) {
    for (const i of paint.preview) {
      const px = xOf(i) * cs;
      const py = yOf(i) * cs;
      if (paint.previewKind === 'chalk') chalkMark(c, px, py, cs, ink.rope, i);
      else {
        c.globalAlpha = 0.25;
        c.fillStyle = paint.previewKind === 'erase' ? ink.soft : ink.rope;
        c.fillRect(px + 1, py + 1, cs - 2, cs - 2);
        c.globalAlpha = 1;
      }
    }
  }

  // People.
  const raid = activeRaid(s);
  const recent = new Map<string, string>();
  for (const a of s.answers) if (a.at > t - 2 * HOUR && a.at <= t + 30 && a.says) recent.set(a.who, a.says);
  for (const p of s.people) {
    if (!p.body.alive) continue;
    const [fx, fy] = drawPosition(s, p.id, t);
    if (fx < x0 - 2 || fx > x1 + 1 || fy < y0 - 2 || fy > y1 + 1) continue;
    const off = ((strHash(p.id) >>> 0) % 7) / 7 - 0.43;
    figure(c, p, s, (fx + 0.5 + off * 0.55) * cs, (fy + 0.95) * cs, cs, ink, t, paint.selected === p.id);
    const said = recent.get(p.id);
    if (said && (paint.selected === p.id || recent.size <= 4))
      bubble(c, said, (fx + 0.5) * cs, (fy - 0.15) * cs, cs, ink);
  }

  // The bell: rope arcs at the entrance while it rings.
  if (s.bell && t < s.bell.until) {
    const ex = (h.surface.entrance + 0.5) * cs;
    const ey = (SURF - 1.4) * cs;
    c.strokeStyle = ink.rope;
    c.lineWidth = 1.5;
    const ph = (t / 3) % 1;
    for (let r = 0; r < 3; r++) {
      c.globalAlpha = 1 - ((r + ph) % 3) / 3;
      c.beginPath();
      c.arc(ex, ey, cs * (0.5 + ((r + ph) % 3) * 0.45), -Math.PI * 0.85, -Math.PI * 0.15);
      c.stroke();
    }
    c.globalAlpha = 1;
  }
  // Smoke in the south (left), riders on the hill.
  if (raid?.stage === 'smoke') smoke(c, cs, t, ink);
  if (raid?.stage === 'riders') riders(c, s, cs, t, ink);
  c.restore();
}

function isOpen(s: WarrenState, i: number): boolean {
  const k = s.hill.kind[i];
  return k === K.open || (k === K.theirs && (s.linked || !!s.hill.known[i]));
}

function chalkMark(
  c: CanvasRenderingContext2D,
  px: number,
  py: number,
  cs: number,
  color: string,
  key: number,
) {
  c.strokeStyle = color;
  c.globalAlpha = 0.85;
  c.beginPath();
  wobLine(c, px + cs * 0.22, py + cs * 0.25, px + cs * 0.78, py + cs * 0.75, key, 1.2);
  wobLine(c, px + cs * 0.78, py + cs * 0.25, px + cs * 0.22, py + cs * 0.75, key + 3, 1.2);
  c.stroke();
  c.globalAlpha = 1;
}

function lampGlyph(
  c: CanvasRenderingContext2D,
  px: number,
  py: number,
  cs: number,
  ink: Ink,
  ghost: boolean,
) {
  const cx = px + cs * 0.5;
  const cy = py + cs * 0.38;
  c.strokeStyle = ghost ? ink.rope : ink.ink;
  c.lineWidth = 1.2;
  if (ghost) c.setLineDash([2, 2]);
  c.beginPath();
  c.ellipse(cx, cy + cs * 0.08, cs * 0.16, cs * 0.07, 0, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([]);
  if (!ghost) {
    c.fillStyle = ink.rope;
    c.beginPath();
    c.moveTo(cx + cs * 0.1, cy);
    c.quadraticCurveTo(cx + cs * 0.16, cy - cs * 0.16, cx + cs * 0.12, cy - cs * 0.22);
    c.quadraticCurveTo(cx + cs * 0.04, cy - cs * 0.1, cx + cs * 0.1, cy);
    c.fill();
  }
}

function drawUse(
  c: CanvasRenderingContext2D,
  s: WarrenState,
  i: number,
  px: number,
  py: number,
  cs: number,
  ink: Ink,
  lit: boolean,
) {
  const h = s.hill;
  const u = h.use[i] ?? 0;
  c.strokeStyle = ink.ink;
  c.lineWidth = 1.2;
  if (u === USE.store) {
    const g = h.grain[i] ?? 0;
    const full = Math.ceil((g / STORE_CAP) * 3 - 0.01);
    for (let q = 0; q < 3; q++) {
      const jx = px + cs * (0.2 + q * 0.3);
      const jy = py + cs * 0.92;
      c.beginPath();
      c.moveTo(jx - cs * 0.08, jy);
      c.quadraticCurveTo(jx - cs * 0.15, jy - cs * 0.22, jx - cs * 0.05, jy - cs * 0.34);
      c.lineTo(jx + cs * 0.05, jy - cs * 0.34);
      c.quadraticCurveTo(jx + cs * 0.15, jy - cs * 0.22, jx + cs * 0.08, jy);
      c.closePath();
      if (q < full) {
        c.fillStyle = ink.soft;
        c.fill();
      }
      c.stroke();
    }
  } else if (u === USE.beds) {
    c.beginPath();
    for (let q = 0; q < 3; q++)
      wobLine(
        c,
        px + cs * 0.1,
        py + cs * (0.78 + q * 0.06),
        px + cs * 0.9,
        py + cs * (0.78 + q * 0.06),
        i + q,
        0.5,
      );
    c.stroke();
  } else if (u === USE.hearth) {
    c.beginPath();
    c.moveTo(px + cs * 0.25, py + cs * 0.95);
    c.lineTo(px + cs * 0.75, py + cs * 0.95);
    c.stroke();
    c.fillStyle = ink.rope;
    c.beginPath();
    c.moveTo(px + cs * 0.4, py + cs * 0.92);
    c.quadraticCurveTo(px + cs * 0.45, py + cs * 0.6, px + cs * 0.52, py + cs * 0.55);
    c.quadraticCurveTo(px + cs * 0.65, py + cs * 0.75, px + cs * 0.6, py + cs * 0.92);
    c.fill();
  } else if (u === USE.well) {
    c.beginPath();
    c.ellipse(px + cs * 0.5, py + cs * 0.85, cs * 0.3, cs * 0.1, 0, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = ink.sky;
    c.beginPath();
    wobLine(c, px + cs * 0.3, py + cs * 0.86, px + cs * 0.7, py + cs * 0.86, i, 0.6);
    c.stroke();
  } else if (u === USE.door) {
    const work = h.doorWork[i] ?? 0;
    const shut = !!h.shut[i];
    c.beginPath();
    c.arc(px + cs * (shut ? 0.5 : 0.85), py + cs * 0.5, cs * 0.42, 0, Math.PI * 2);
    if (work > 0) c.setLineDash([3, 3]);
    c.lineWidth = 1.8;
    c.stroke();
    c.setLineDash([]);
    c.beginPath();
    c.arc(px + cs * (shut ? 0.5 : 0.85), py + cs * 0.5, cs * 0.08, 0, Math.PI * 2);
    c.stroke();
  }
  if (h.lamp[i]) lampGlyph(c, px, py, cs, ink, false);
  void lit;
}

function drawSurface(c: CanvasRenderingContext2D, s: WarrenState, cs: number, ink: Ink, t: number) {
  const h = s.hill;
  const gy = SURF * cs;
  c.strokeStyle = ink.ink;
  c.lineWidth = 1.6;
  c.beginPath();
  for (let x = 0; x < W; x++) {
    const i = idx(x, SURF);
    const open = h.kind[i] === K.open || (h.kind[i] === K.theirs && x === 29);
    if (open) continue;
    wobLine(c, x * cs, gy, (x + 1) * cs, gy, x, 0.8);
  }
  c.stroke();
  // Ridge.
  c.beginPath();
  c.moveTo(24 * cs, gy);
  c.quadraticCurveTo(25 * cs, gy - cs * 1.2, 26 * cs, gy);
  c.stroke();
  // Fields: stubble or standing barley.
  const [f0, f1] = h.surface.fields;
  const standing = s.fields.standing / Math.max(1, s.fields.size);
  const sown = s.fields.sown;
  c.lineWidth = 1;
  c.strokeStyle = ink.soft;
  c.beginPath();
  for (let x = f0 * cs; x < (f1 + 1) * cs; x += cs * 0.22) {
    const k = x / cs;
    const tall =
      standing > 0.02 && unit(k * 5) < standing + 0.1
        ? cs * (0.4 + unit(k) * 0.3)
        : sown > 0.1
          ? cs * 0.12
          : cs * 0.06;
    c.moveTo(x, gy);
    c.lineTo(x + (unit(k * 3) - 0.5) * cs * 0.1, gy - tall);
  }
  c.stroke();
  // The spring.
  c.strokeStyle = ink.sky;
  c.lineWidth = 1.3;
  c.beginPath();
  wobLine(c, (h.surface.spring - 0.2) * cs, gy - 2, (h.surface.spring + 0.8) * cs, gy - 2, 3, 1);
  c.stroke();
  // Threshing floor with its heap.
  const fl = h.surface.floor;
  c.strokeStyle = ink.ink;
  c.beginPath();
  c.ellipse((fl + 0.5) * cs, gy - 1, cs * 0.6, cs * 0.12, 0, 0, Math.PI * 2);
  c.stroke();
  if (s.fields.floor > 0.5) {
    c.fillStyle = ink.soft;
    const hh = Math.min(0.6, 0.15 + s.fields.floor / 120);
    c.beginPath();
    c.moveTo((fl + 0.1) * cs, gy - 1);
    c.quadraticCurveTo((fl + 0.5) * cs, gy - hh * cs * 2, (fl + 0.9) * cs, gy - 1);
    c.fill();
  }
  // Spoil heap: grows with the stone carried up.
  const dug = s.stats.dug;
  if (dug > 0) {
    const hx = h.surface.heap;
    const r = Math.min(2.4, 0.4 + Math.sqrt(dug) * 0.18);
    c.fillStyle = ink.paper2;
    c.strokeStyle = ink.ink;
    c.beginPath();
    c.moveTo((hx + 0.5 - r) * cs, gy);
    c.quadraticCurveTo((hx + 0.5) * cs, gy - r * cs * 1.1, (hx + 0.5 + r) * cs, gy);
    c.fill();
    c.stroke();
  }
  // Houses: ours and the neighbours'.
  const night = !isLight(t);
  for (const hs of s.houses)
    house(
      c,
      hs.x,
      cs,
      ink,
      night,
      hs.members.some((m) => s.people.find((p) => p.id === m)?.body.alive),
    );
  for (const x of [27, 30]) house(c, x, cs, ink, night, true);
  // The entrance: a lintel.
  const ex = h.surface.entrance;
  c.strokeStyle = ink.ink;
  c.lineWidth = 1.8;
  c.beginPath();
  c.moveTo(ex * cs - 2, gy - cs * 0.5);
  c.lineTo((ex + 1) * cs + 2, gy - cs * 0.5);
  c.moveTo(ex * cs, gy - cs * 0.5);
  c.lineTo(ex * cs, gy);
  c.moveTo((ex + 1) * cs, gy - cs * 0.5);
  c.lineTo((ex + 1) * cs, gy);
  c.stroke();
  void DAY;
}

function house(c: CanvasRenderingContext2D, x: number, cs: number, ink: Ink, night: boolean, lived: boolean) {
  const gy = SURF * cs;
  const px = x * cs - cs * 0.3;
  const w = cs * 1.6;
  const hh = cs * 1.1;
  c.fillStyle = ink.paper;
  c.strokeStyle = ink.ink;
  c.lineWidth = 1.4;
  c.beginPath();
  c.rect(px, gy - hh, w, hh);
  c.fill();
  c.stroke();
  c.beginPath();
  c.moveTo(px - 2, gy - hh);
  c.lineTo(px + w / 2, gy - hh - cs * 0.55);
  c.lineTo(px + w + 2, gy - hh);
  c.stroke();
  // Door and a window; a lit window at night if anyone lives there.
  c.beginPath();
  c.rect(px + w * 0.15, gy - hh * 0.6, w * 0.22, hh * 0.6);
  c.stroke();
  c.beginPath();
  c.rect(px + w * 0.6, gy - hh * 0.7, w * 0.22, hh * 0.25);
  if (night && lived) {
    c.fillStyle = ink.rope;
    c.globalAlpha = 0.6;
    c.fill();
    c.globalAlpha = 1;
  }
  c.stroke();
}

function figure(
  c: CanvasRenderingContext2D,
  p: Person,
  s: WarrenState,
  x: number,
  foot: number,
  cs: number,
  ink: Ink,
  t: number,
  sel: boolean,
) {
  const child = ageYears(p) < 14;
  const old = ageYears(p) >= 65;
  const hgt = cs * (child ? 0.55 : 0.8);
  const a = p.activity?.action ?? '';
  const tr = s.trips[p.id];
  const walking = !!tr && t < tr.workFrom && tr.cells.length > 1;
  const body = readBody(p);
  const tired = body.perceived.fatigue > 0.6 || body.perceived.sleepiness > 0.7;
  const hurt = (p.body.injuries?.length ?? 0) > 0;
  c.strokeStyle = ink.ink;
  c.lineWidth = 1.4;
  c.lineCap = 'round';
  if (sel) {
    c.strokeStyle = ink.rope;
    c.beginPath();
    c.ellipse(x, foot - hgt * 0.45, cs * 0.42, hgt * 0.65, 0, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = ink.ink;
  }
  if (a.startsWith('sleep')) {
    c.beginPath();
    c.moveTo(x - hgt * 0.5, foot - 2);
    c.lineTo(x + hgt * 0.35, foot - 2);
    c.stroke();
    c.beginPath();
    c.arc(x + hgt * 0.45, foot - 3, hgt * 0.1, 0, Math.PI * 2);
    c.stroke();
    return;
  }
  const seated =
    a === 'rest' ||
    a === 'chat' ||
    a === 'eat' ||
    a === 'pray' ||
    a === 'show' ||
    (p.id === USTA_ID && !walking);
  const lean = (old ? 0.18 : 0) + (tired ? 0.15 : 0) + (a === 'dig' && !walking ? 0.3 : 0);
  const hipY = seated ? foot - hgt * 0.22 : foot - hgt * 0.42;
  const headR = hgt * 0.13;
  const shoulderX = x + lean * hgt * 0.5;
  const shoulderY = hipY - hgt * 0.32;
  // Legs.
  c.beginPath();
  if (seated) {
    c.moveTo(x, hipY);
    c.lineTo(x + hgt * 0.25, hipY);
    c.lineTo(x + hgt * 0.25, foot);
  } else {
    const stride = walking
      ? Math.sin(t * 0.9 + (strHash(p.id) % 10)) * hgt * (tired ? 0.12 : 0.2)
      : hgt * 0.06;
    c.moveTo(x - stride, foot);
    c.lineTo(x, hipY);
    c.lineTo(x + stride, foot);
  }
  // Torso and head.
  c.moveTo(x, hipY);
  c.lineTo(shoulderX, shoulderY);
  c.stroke();
  c.beginPath();
  c.arc(shoulderX + lean * headR, shoulderY - headR * 1.1, headR, 0, Math.PI * 2);
  c.stroke();
  // Arms: a pick when digging, a load above the head when carrying.
  const load = carrying(s, p.id, t);
  c.beginPath();
  if (a === 'dig' && !walking) {
    const sw = Math.sin(t * 1.7 + (strHash(p.id) % 5)) * 0.5;
    const hx = shoulderX + hgt * 0.35;
    const hy = shoulderY - hgt * (0.1 + sw * 0.2);
    c.moveTo(shoulderX, shoulderY + 2);
    c.lineTo(hx, hy);
    c.moveTo(hx - hgt * 0.08, hy - hgt * 0.15);
    c.lineTo(hx + hgt * 0.12, hy + hgt * 0.18);
  } else if (load) {
    c.moveTo(shoulderX, shoulderY + 2);
    c.lineTo(shoulderX + hgt * 0.05, shoulderY - headR * 2.4);
    c.stroke();
    c.beginPath();
    c.fillStyle = load === 'water' ? ink.sky : load === 'grain' ? ink.paper2 : ink.soft;
    c.ellipse(shoulderX + lean * headR, shoulderY - headR * 2.9, hgt * 0.17, hgt * 0.09, 0, 0, Math.PI * 2);
    c.fill();
  } else {
    c.moveTo(shoulderX - hgt * 0.15, shoulderY + hgt * 0.22);
    c.lineTo(shoulderX, shoulderY + 2);
    c.lineTo(shoulderX + hgt * 0.15, shoulderY + hgt * 0.22);
  }
  c.stroke();
  if (hurt) {
    c.fillStyle = ink.rope;
    c.globalAlpha = 0.8;
    c.beginPath();
    c.arc(shoulderX + hgt * 0.06, shoulderY + hgt * 0.1, hgt * 0.07, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
  }
}

function bubble(c: CanvasRenderingContext2D, text: string, x: number, y: number, cs: number, ink: Ink) {
  const t = text.length > 34 ? `${text.slice(0, 33)}…` : text;
  c.font = `${Math.max(13, Math.round(cs * 0.55))}px Caveat, cursive`;
  const w = c.measureText(t).width + 10;
  const bx = x - w / 2;
  const by = y - cs * 0.9;
  c.fillStyle = ink.paper;
  c.strokeStyle = ink.soft;
  c.lineWidth = 1;
  c.beginPath();
  c.roundRect(bx, by, w, cs * 0.75, 6);
  c.fill();
  c.stroke();
  c.fillStyle = ink.ink;
  c.textAlign = 'center';
  c.fillText(t, x, by + cs * 0.55);
}

function smoke(c: CanvasRenderingContext2D, cs: number, t: number, ink: Ink) {
  c.strokeStyle = ink.soft;
  c.lineWidth = 2;
  c.globalAlpha = 0.7;
  c.beginPath();
  const bx = 1 * cs;
  const by = (SURF - 1) * cs;
  c.moveTo(bx, by);
  for (let k = 1; k < 10; k++)
    c.lineTo(bx + Math.sin(t / 20 + k) * cs * 0.4 + k * cs * 0.1, by - k * cs * 0.6);
  c.stroke();
  c.globalAlpha = 1;
}

function riders(c: CanvasRenderingContext2D, s: WarrenState, cs: number, t: number, ink: Ink) {
  const gy = SURF * cs;
  c.strokeStyle = ink.ink;
  c.lineWidth = 1.6;
  for (let k = 0; k < 4; k++) {
    const x = ((k * 7 + Math.floor(t / 40) * (k + 1)) % 22) + 1;
    const px = x * cs;
    c.beginPath();
    c.ellipse(px, gy - cs * 0.8, cs * 0.5, cs * 0.22, 0, 0, Math.PI * 2);
    c.moveTo(px - cs * 0.35, gy - cs * 0.65);
    c.lineTo(px - cs * 0.4, gy);
    c.moveTo(px + cs * 0.35, gy - cs * 0.65);
    c.lineTo(px + cs * 0.4, gy);
    c.moveTo(px + cs * 0.45, gy - cs * 0.9);
    c.lineTo(px + cs * 0.75, gy - cs * 1.3);
    c.moveTo(px, gy - cs);
    c.lineTo(px, gy - cs * 1.6);
    c.stroke();
    c.beginPath();
    c.arc(px, gy - cs * 1.75, cs * 0.14, 0, Math.PI * 2);
    c.stroke();
  }
  void s;
  void minuteOfDay;
}

/** The cell under a canvas point (CSS px). */
export function cellAt(v: View, px: number, py: number): number {
  const x = Math.floor(v.x + px / v.cs);
  const y = Math.floor(v.y + py / v.cs);
  if (x < 0 || y < 0 || x >= W || y >= H) return -1;
  return idx(x, y);
}

/** The nearest living person to a canvas point, within reach. */
export function personAt(s: WarrenState, v: View, px: number, py: number, t: number): string | null {
  const wx = v.x + px / v.cs;
  const wy = v.y + py / v.cs;
  let best: string | null = null;
  let bd = 0.9;
  for (const p of s.people) {
    if (!p.body.alive) continue;
    const [fx, fy] = drawPosition(s, p.id, t);
    const off = ((strHash(p.id) >>> 0) % 7) / 7 - 0.43;
    const d = Math.hypot(fx + 0.5 + off * 0.55 - wx, fy + 0.6 - wy);
    if (d < bd) {
      bd = d;
      best = p.id;
    }
  }
  return best;
}
