/**
 * The page around the hill: a title, the cross-section, the keeper's tools, the bell, the speed, a person card
 * and the Game menu (journal, people, saves, download). Time runs continuously; nothing pauses, it only slows.
 */
import {
  ageYears,
  describePerson,
  FRAMEWORK_VERSION,
  type Person,
  readBody,
} from '@adam0white/human-framework';
import { DAY, HOUR, hourWords } from '../sim/calendar.ts';
import {
  act,
  advance,
  GAME_VERSION,
  type Game,
  load,
  newGame,
  type Order,
  type Saved,
  save,
} from '../sim/game.ts';
import { AIR_REACH, H, idx, K, neighbours, SURF, THEIR_X, USE, W, xOf, yOf } from '../sim/grid.ts';
import { BELL } from '../sim/people.ts';
import {
  activeRaid,
  airAndLight,
  GOALS,
  houseOf,
  type Note,
  personOf,
  QUANTUM,
  storesWords,
  waterWords,
} from '../sim/warren.ts';
import { baseView, easeView } from './camera.ts';
import { hillDate } from './date.ts';
import { doorWords } from './door-help.ts';
import { cellAt, draw, type Ink, type Paint, personAt, readInk, type View } from './draw.ts';
import { exposureWords } from './exposure.ts';
import { colonyWords, FIRST_CHALK, PURPOSE } from './guidance.ts';
import { lab } from './lab.ts';
import { planSafety } from './plan-safety.ts';
import { bellShelterWords, bellStateWords } from './room-safety.ts';
import { compactShelterWords, sleepingCapacityWords, sleepingRoomWords } from './shelter.ts';
import * as store from './store.ts';

type Tool = 'look' | 'chalk' | 'erase' | 'store' | 'beds' | 'lamp' | 'door';
const SPEEDS = [0.25, 1, 4, 16] as const;
const SPEED_NAMES = ['slow', 'walk', 'trot', 'gallop'];
/** Real milliseconds per sim-minute at speed 1: a sim-day is 20 real seconds. */
const MS_PER_MIN = 20000 / DAY;
const SAVE_KEY = 'hill';
const CATCH_UP_MAX = DAY;

let g: Game | null = null;
let tool: Tool = 'look';
let speedIx = 1;
let disp = 0;
let last = 0;
let raf = 0;
let ink: Ink;
const view: View = { cs: 20, x: 6, y: 2, w: 360, h: 400 };
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let sceneObserver: ResizeObserver | null = null;
let manualView = false;
let pointing = false;
const paint: Paint = { preview: new Set(), previewKind: null, selected: null, t: 0 };
let lastSaved = 0;
let dirty = false;
let seenNotes = 0;
let ticker: Note | null = null;
let tickerUntil = 0;
let lagging = false;
let wake: { release(): Promise<void> } | null = null;
const seenHint = new Set<string>();
const answeredRaids = new Set<number>();
let labScreen = '';
const labGoals = new Set<string>();
let labBase = { arrivals: 0, gone: 0, died: 0 };
// A pending raid response runs at one sim-minute per real second. Sim quanta stay unchanged.
const RAID_SPEED = MS_PER_MIN / 1000;
let menuOpener: HTMLElement | null = null;
let personOpener: HTMLElement | null = null;
let doorCell: number | null = null;
let bellReading = false;
let planCell: number | null = null;
let lastReading: { title: string; words: string } | null = null;

const app = () => document.getElementById('app') as HTMLElement;
const esc = (x: string) =>
  x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const NUM = [
  'no one',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];
const souls = (n: number) =>
  n < NUM.length
    ? `${NUM[n]} ${n === 1 ? 'soul' : 'souls'}`
    : n < 20
      ? 'under twenty souls'
      : n < 40
        ? `some ${Math.round(n / 5) * 5} souls`
        : `${Math.round(n / 10) * 10} souls and more`;
const footer = `<div class="footer"><a href="https://human.adamwhite.work/games/">All games</a><br/>People by the Human Framework ${FRAMEWORK_VERSION}. What they choose comes from it.</div>`;
const markLink = '<a class="mark" href="https://human.adamwhite.work">◇ human framework</a>';
const aboutHill = `<details class="about-hill">
  <summary>More about the hill</summary>
  <p>Riders burned two villages to the south this spring. Under Yusuf Usta’s house there is a cellar cut into the soft stone, and the barley stands ripe. The village needs a refuge before the riders come.</p>
  <p>You keep the dig-master’s chalk and his bell. Mark the stone where a room should be. Hang a lamp where the dark stops them. Ring the bell when there is smoke.</p>
  <p>Nobody obeys. Everyone follows the worn path.</p>
  <p>One finger chalks or looks. Two fingers move the page.</p>
  <p>The hill keeps 365-day years, counted from its first harvest. Dates use English month names; Year 1 begins on 19 August.</p>
</details>`;

// ---------- start ----------

export async function start() {
  mountLabControls();
  if ('serviceWorker' in navigator && location.hostname !== 'localhost')
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  ink = readInk();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    ink = readInk();
  });
  const sv = await store.get<Saved & { savedAt?: number }>(SAVE_KEY);
  title(sv?.value ?? null, sv?.at ?? 0);
}

function title(sv: (Saved & { savedAt?: number }) | null, at: number) {
  lab.screen('title');
  const compatible = sv && sv.game.split('.')[0] === GAME_VERSION.split('.')[0];
  app().innerHTML = `
  <div class="page">
    ${markLink}
    <h1>The Warren</h1>
    <p>${PURPOSE}</p>
    <p>${FIRST_CHALK}</p>
    <div class="actions">
      ${compatible ? `<button class="primary" id="cont">Go back down <span class="soft">· ${esc(hillDate(sv.minute))}</span></button>` : ''}
      <button ${compatible ? '' : 'class="primary"'} id="new">${compatible ? 'Begin a new hill' : 'Begin'}</button>
    </div>
    ${sv && !compatible ? '<p class="soft">An older notebook was put away; this version cannot read it.</p>' : ''}
    ${aboutHill}
    ${footer}
  </div>`;
  document.getElementById('cont')?.addEventListener('click', () => {
    if (!sv) return;
    g = load(sv);
    catchUp(at);
  });
  document.getElementById('new')?.addEventListener('click', async () => {
    if (compatible && !confirm('Start a new hill? The old notebook will be put away.')) return;
    await store.drop(SAVE_KEY);
    g = newGame((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
    enter();
  });
}

/** After an absence the hill moves on a little (a day at most), and says so. */
function catchUp(savedAt: number) {
  if (!g) return;
  const away = Math.max(0, Date.now() - savedAt);
  const minutes = Math.min(CATCH_UP_MAX, Math.floor(away / MS_PER_MIN));
  const to = Math.floor((g.s.minute + minutes) / QUANTUM) * QUANTUM;
  if (minutes < 2 * HOUR) {
    enter();
    return;
  }
  app().innerHTML = `<div class="page"><p class="hand">While you were away…</p><p class="soft" id="cu"></p></div>`;
  const step = () => {
    if (!g) return;
    const next = Math.min(to, g.s.minute + 4 * HOUR);
    advance(g, next);
    const el = document.getElementById('cu');
    if (el) el.textContent = `${hourWords(g.s.minute)}, ${hillDate(g.s.minute)}`;
    if (g.s.minute < to) setTimeout(step, 0);
    else {
      enter();
      flash(
        `While you were away, ${minutes >= DAY - QUANTUM ? 'a day' : minutes >= DAY / 2 ? 'half a day' : 'some hours'} passed under the hill.`,
      );
    }
  };
  setTimeout(step, 30);
}

// ---------- the scene ----------

function enter() {
  if (!g) return;
  lab.milestone('run started');
  // Milestones count what happens in this sitting, not what a resumed notebook already holds.
  labGoals.clear();
  for (const id of Object.keys(g.s.goals)) labGoals.add(id);
  labBase = {
    arrivals: g.s.arrivals,
    gone: g.s.raids.filter((x) => x.stage === 'gone').length,
    died: g.s.stats.died,
  };
  answeredRaids.clear();
  for (const raid of g.s.raids)
    if (g.inputs.some((input) => input.verb === 'bell' && input.at >= raid.smoke && input.at <= raid.leave))
      answeredRaids.add(raid.smoke);
  app().innerHTML = `
  <div class="game">
    <div class="top">
      <div class="when"><span id="when"></span><span class="soft" id="stock"></span></div>
      <div class="goal-slot"><div class="goal" id="goal"></div>
      <div class="goal" id="raid-warning" hidden></div></div>
    </div>
    <div class="scene" id="scene">
      <canvas id="cv" tabindex="0" aria-label="The hill"></canvas>
      <div class="view-controls" role="group" aria-label="Hill view"><button id="zoom-in" aria-label="Zoom in">Zoom +</button><button id="zoom-out" aria-label="Zoom out">Zoom −</button><button id="fit-hill">Fit hill</button></div>
      <div class="lag soft" id="lag" hidden>the days pass as fast as they can</div>
      <div class="card" id="card" hidden></div>
    </div>
    <div class="panel">
      <div class="reading-slot">
      <div class="card cell-detail" id="cell-detail" hidden><div class="who"><b id="cell-title">Stone door</b><span id="reading-more" hidden>Scroll ↓</span><button class="x" id="cellx" aria-label="Close room or door inspection">×</button></div><p id="cell-words" tabindex="0" role="region" aria-label="Full reading"></p></div>
      <button id="shelter-brief" aria-label="Check shelter summary"><span id="bell-meaning"></span></button>
      <div class="reading-actions"><button class="ticker" id="ticker" aria-label="Open journal"></button><button id="last-reading" disabled>Last reading</button></div>
      </div>
      <div class="clock-status"><span id="clock-rate"></span><span class="raid-controls"><button id="watch-raid">Keep watching</button><button id="shelter-check">Check shelter</button></span></div>
      <div class="tools" role="toolbar" aria-label="Tools">
        ${toolBtn('look', 'look', '◎')}
        ${toolBtn('chalk', 'chalk', '□')}
        ${toolBtn('erase', 'rub out', '⌫')}
        ${toolBtn('store', 'store', '⚱')}
        ${toolBtn('beds', 'beds', '≡')}
        ${toolBtn('lamp', 'lamp', '♨')}
        ${toolBtn('door', 'door', '◯')}
      </div>
      <div class="row">
        <div class="speed" role="group" aria-label="Speed">
          ${SPEEDS.map((_, k) => `<button data-speed="${k}" aria-label="${SPEED_NAMES[k]}">${'›'.repeat(k + 1).replace('››››', '»»')}</button>`).join('')}
        </div>
        <button class="bell" id="bell" aria-label="Ring the bell" aria-describedby="bell-meaning">bell</button>
        <button id="book" aria-label="Game menu">Game menu</button>
      </div>
    </div>
    <div class="drawer" id="drawer" hidden></div>
  </div>`;
  lastReading = null;
  bellReading = false;
  planCell = null;
  doorCell = null;
  canvas = document.getElementById('cv') as HTMLCanvasElement;
  ctx = canvas.getContext('2d');
  disp = g.s.minute;
  paint.t = disp;
  seenNotes = Math.max(0, g.s.notes.length - 1);
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]'))
    b.addEventListener('click', () => setTool(b.dataset.tool as Tool));
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]'))
    b.addEventListener('click', () => {
      speedIx = Number(b.dataset.speed);
      syncButtons();
      chrome();
      requestWake();
    });
  document.getElementById('bell')?.addEventListener('click', () => {
    if (order({ verb: 'bell' })) {
      const raid = g && activeRaid(g.s);
      if (raid) answeredRaids.add(raid.smoke);
      chrome();
      bellReading = true;
      showBellReading();
    }
  });
  document.getElementById('watch-raid')?.addEventListener('click', () => {
    const raid = g && activeRaid(g.s);
    if (raid) answeredRaids.add(raid.smoke);
    chrome();
  });
  document.getElementById('book')?.addEventListener('click', () => openBook());
  document.getElementById('shelter-check')?.addEventListener('click', () => openBook('p'));
  document.getElementById('shelter-brief')?.addEventListener('click', () => openBook('p'));
  document.getElementById('zoom-in')?.addEventListener('click', () => zoomView(1.6));
  document.getElementById('zoom-out')?.addEventListener('click', () => zoomView(1 / 1.6));
  document.getElementById('fit-hill')?.addEventListener('click', () => {
    if (!g) return;
    manualView = true;
    Object.assign(view, baseView(g.s, view.w, view.h));
    clampView();
  });
  document.getElementById('cellx')?.addEventListener('click', () => closeCell());
  // Close on pointerdown before a live redraw can replace the tapped control.
  document.getElementById('card')?.addEventListener('pointerdown', (e) => {
    if (!(e.target as HTMLElement).closest('#cardx')) return;
    e.preventDefault();
    closeCard();
  });
  // Keyboard activation dispatches a click without pointerdown.
  document.getElementById('card')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('#cardx')) closeCard();
  });
  document.getElementById('ticker')?.addEventListener('click', () => openBook('j'));
  document.getElementById('last-reading')?.addEventListener('click', () => {
    if (lastReading?.title === 'Bell call') {
      bellReading = true;
      showBellReading();
    } else if (lastReading) showReading(lastReading.title, lastReading.words);
  });
  document.querySelector('.game')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key !== 'Escape') return;
    if (!document.getElementById('cell-detail')?.hidden) closeCell();
    else if (paint.selected) closeCard();
    else closeBook();
  });
  resize();
  const s = g.s;
  manualView = false;
  pointing = false;
  Object.assign(view, baseView(s, view.w, view.h));
  clampView();
  bindPointer(canvas);
  sceneObserver?.disconnect();
  sceneObserver = new ResizeObserver(resize);
  const scene = document.getElementById('scene');
  if (scene) sceneObserver.observe(scene);
  syncButtons();
  chrome();
  last = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
  requestWake();
}

function toolBtn(t: Tool, label: string, glyph: string) {
  return `<button data-tool="${t}" aria-label="${label}"><span class="g">${glyph}</span><span class="l">${label}</span></button>`;
}

function setTool(t: Tool) {
  closeCell(false);
  if (t !== 'look') manualView = true;
  tool = t;
  syncButtons();
  const hints: Partial<Record<Tool, string>> = {
    chalk: 'Dashed outlines plan a dig. People choose when.',
    erase: 'Drag to rub out chalk or a room’s mark.',
    store: 'Drag over open ground to make it a store. Grain goes where the jars are.',
    beds: 'Drag over open ground for sleeping places below.',
    lamp: 'Tap open ground to hang a lamp. Tap it again to take it down.',
    door: 'Tap a passage one cell wide, open on two opposite sides only. They carve a rolling stone there if it is lit. Three doors at most.',
  };
  const h = hints[t];
  if (h) hint(`tool:${t}`, h);
}

function syncButtons() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]'))
    b.classList.toggle('on', b.dataset.tool === tool);
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]'))
    b.classList.toggle('on', Number(b.dataset.speed) === speedIx);
}

function resize() {
  const sc = document.getElementById('scene');
  if (!sc || !canvas) return;
  const r = sc.getBoundingClientRect();
  const dpr = Math.min(3, devicePixelRatio || 1);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  canvas.style.width = `${r.width}px`;
  canvas.style.height = `${r.height}px`;
  view.w = r.width;
  view.h = r.height;
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  clampView();
}

function clampView() {
  const vw = view.w / view.cs;
  const vh = view.h / view.cs;
  view.x = Math.max(-0.5, Math.min(W + 0.5 - vw, view.x));
  view.y = Math.max(0, Math.min(H - vh, view.y));
  if (vw > W + 1) view.x = (W - vw) / 2;
}

/** Keep the centre of the working view fixed; zoom never becomes a simulation input. */
function zoomView(factor: number) {
  manualView = true;
  const cx = view.x + view.w / view.cs / 2;
  const cy = view.y + view.h / view.cs / 2;
  view.cs = Math.max(10, Math.min(72, view.cs * factor));
  view.x = cx - view.w / view.cs / 2;
  view.y = cy - view.h / view.cs / 2;
  clampView();
}

function order(o: Order): boolean {
  if (!g) return false;
  const ok = act(g, o);
  if (ok) dirty = true;
  return ok;
}

// ---------- the loop ----------

function raidDecision() {
  const raid = g && activeRaid(g.s);
  return raid && !answeredRaids.has(raid.smoke) ? raid : null;
}

function clockRate(reading: boolean) {
  const chosen = SPEEDS[speedIx] ?? 1;
  return raidDecision() ? Math.min(chosen, RAID_SPEED) : reading ? Math.min(chosen, SPEEDS[0]) : chosen;
}

function frame(now: number) {
  raf = requestAnimationFrame(frame);
  if (!g || !ctx) return;
  const dt = Math.min(250, now - last);
  last = now;
  const s = g.s;
  // The notebook open slows the days to 'slow' rather than stopping them.
  const reading = !(document.getElementById('drawer')?.hidden ?? true);
  disp += (dt * clockRate(reading)) / MS_PER_MIN;
  const t0 = performance.now();
  while (s.minute + QUANTUM <= disp && performance.now() - t0 < 10) {
    const pending = raidDecision();
    advance(g, s.minute + QUANTUM);
    dirty = true;
    if (!pending && raidDecision()) {
      // Discard only playback overshoot: never skip or alter a simulation step.
      disp = s.minute;
      chrome();
      break;
    }
  }
  lagging = disp > s.minute + 2 * QUANTUM;
  if (lagging) disp = s.minute + QUANTUM;
  paint.t = Math.min(disp, s.minute + QUANTUM);
  if (!manualView && !pointing && doorCell === null && document.getElementById('cell-detail')?.hidden) {
    Object.assign(view, easeView(view, baseView(s, view.w, view.h), dt));
    clampView();
  }
  draw(ctx, s, view, ink, paint);
  if (Math.floor(now / 250) !== Math.floor((now - dt) / 250)) chrome();
  if (dirty && now - lastSaved > 30000) writeSave();
}

/** The text around the scene: date, stores, goal, notes, the card. Updated a few times a second. */
function chrome() {
  if (!g) return;
  const s = g.s;
  const when = document.getElementById('when');
  if (when) when.textContent = `${hourWords(paint.t)}, ${hillDate(paint.t)}`;
  const alive = s.people.filter((p) => p.body.alive).length;
  const stock = document.getElementById('stock');
  if (stock) stock.textContent = `${souls(alive)} · ${storesWords(s)} · ${waterWords(s)}`;
  const goal = document.getElementById('goal');
  if (goal) goal.textContent = tool === 'beds' && !activeRaid(s) ? sleepingCapacityWords(s) : colonyWords(s);
  const r0 = activeRaid(s);
  const lag = document.getElementById('lag');
  if (lag) lag.hidden = !lagging || speedIx < 2;
  // The lab: where the player is (the last screen before leaving is the quit point) and what they reached.
  const reading0 = !(document.getElementById('drawer')?.hidden ?? true);
  const chapter = reading0 ? 'notebook' : r0 ? 'raid' : 'play';
  if (chapter !== labScreen) {
    labScreen = chapter;
    lab.screen(chapter);
  }
  for (const id of Object.keys(s.goals))
    if (!labGoals.has(id)) {
      labGoals.add(id);
      lab.milestone(`goal ${id}`);
    }
  if (s.arrivals > labBase.arrivals) lab.milestone('a family arrived');
  if (s.raids.filter((x) => x.stage === 'gone').length > labBase.gone) lab.milestone('riders came and went');
  if (s.stats.died > labBase.died) lab.milestone('a death');
  const pending = raidDecision();
  if (goal) goal.hidden = !!pending;
  const warning = document.getElementById('raid-warning');
  if (warning) {
    warning.hidden = !pending;
    warning.textContent = !pending
      ? ''
      : `${pending.stage === 'smoke' ? 'Smoke on the ridge.' : 'Riders are at the hill.'} ${bellStateWords(s)} Check shelter or keep watching.`;
  }
  const watch = document.getElementById('watch-raid') as HTMLButtonElement | null;
  const shelter = document.getElementById('shelter-check') as HTMLButtonElement | null;
  if (shelter) shelter.hidden = !!pending;
  if (watch) {
    watch.hidden = !pending;
    watch.style.visibility = pending ? 'visible' : 'hidden';
    watch.disabled = !pending;
  }
  const rate = document.getElementById('clock-rate');
  if (rate) {
    const actual = clockRate(reading0);
    const name =
      pending || reading0 ? 'Slow' : (SPEED_NAMES[speedIx] ?? 'walk').replace(/^./, (c) => c.toUpperCase());
    rate.textContent = `${name} · ${Math.round((actual * 1000) / MS_PER_MIN)} min/s${pending ? ' · raid warning' : reading0 ? ' · reading' : ''}`;
  }
  // New notes: heavy ones take the ticker.
  for (; seenNotes < s.notes.length; seenNotes++) {
    const n = s.notes[seenNotes];
    if (!n) continue;
    // Light notes fill a quiet ticker; heavy ones push in.
    const quiet = performance.now() > tickerUntil;
    if ((n.weight >= 1 && (!ticker || n.weight >= ticker.weight)) || quiet) {
      ticker = n;
      tickerUntil = performance.now() + 5000 + n.weight * 2000;
    }
  }
  const tk = document.getElementById('ticker');
  if (tk) {
    const text = ticker ? ticker.text : '';
    if (tk.dataset.text !== text) {
      tk.dataset.text = text;
      tk.innerHTML = `<span class="journal-action">Open journal →</span><span class="journal-preview ${ticker && ticker.weight >= 2 ? 'heavy' : ''}">${ticker ? esc(text) : 'No new entries.'}</span>`;
      tk.classList.remove('ink-in');
      void tk.offsetWidth;
      tk.classList.add('ink-in');
    }
  }
  const bell = document.getElementById('bell') as HTMLButtonElement | null;
  if (bell) bell.classList.toggle('ringing', !!s.bell && s.minute < s.bell.until);
  updateShelter();
  updateDoor();
  updatePlanPreview();
  if (bellReading) showBellReading();
  if (paint.selected) card();
}

function showReading(title: string, words: string, remember = true, preserveScroll = false) {
  const detail = document.getElementById('cell-detail');
  const heading = document.getElementById('cell-title');
  const text = document.getElementById('cell-words');
  if (!detail || !heading || !text) return;
  const sameReading = preserveScroll && !detail.hidden && heading.textContent === title;
  heading.textContent = title;
  if (text.textContent !== words) {
    const scroll = sameReading ? text.scrollTop : 0;
    text.textContent = words;
    text.scrollTop = scroll;
  }
  detail.hidden = false;
  const more = document.getElementById('reading-more');
  if (more) more.hidden = text.scrollHeight <= text.clientHeight;
  if (remember) {
    lastReading = { title, words };
    const reopen = document.getElementById('last-reading') as HTMLButtonElement | null;
    if (reopen) reopen.disabled = false;
  }
}

function flash(text: string) {
  bellReading = false;
  doorCell = null;
  showReading('Reading', text);
  ticker = { at: g?.s.minute ?? 0, kind: 'story', text, weight: 2 };
  tickerUntil = performance.now() + 9000;
}

function hint(key: string, text: string) {
  if (seenHint.has(key)) return;
  seenHint.add(key);
  flash(text);
}

// ---------- the person card ----------

function bodyWords(p: Person): string {
  const b = readBody(p).perceived;
  const w: string[] = [];
  if (b.hunger > 0.75) w.push('very hungry');
  else if (b.hunger > 0.5) w.push('hungry');
  if (b.thirst > 0.6) w.push('thirsty');
  if (b.sleepiness > 0.75) w.push('dead on their feet');
  else if (b.fatigue > 0.65) w.push('worn out');
  else if (b.fatigue > 0.45) w.push('tired');
  if (b.pain > 0.5) w.push('in pain');
  else if (p.body.injuries.length) w.push('nursing a hurt');
  return w.length ? w.join(', ') : 'well enough';
}

/** How they seem, from HF's own description: the feeling, if any, said plainly. */
function feeling(p: Person): string {
  const f = /feeling ([^.;]+)/.exec(describePerson(p))?.[1];
  return f ? `${p.name.split(' ')[0]} seems to be feeling ${f}.` : '';
}

function trustWords(p: Person): string {
  const v = p.will.voices.find((x) => x.voiceId === BELL);
  if (!v) return '';
  if (v.trust > 0.75) return 'comes when the bell rings';
  if (v.trust > 0.5) return 'listens for the bell';
  if (v.trust > 0.3) return 'is not sure about the bell any more';
  return 'has stopped believing the bell';
}

function card() {
  const el = document.getElementById('card');
  if (!el || !g) return;
  const p = paint.selected ? personOf(g.s, paint.selected) : undefined;
  if (!p?.body.alive) {
    closeCard();
    return;
  }
  const s = g.s;
  const house = houseOf(s, p.id);
  const doing = p.activity?.affordance.label ?? 'deciding what to do';
  const tr = s.trips[p.id];
  const walking = tr && paint.t < tr.workFrom && tr.cells.length > 1;
  const why = walking ? undefined : s.why?.[p.id];
  const about = s.notes.filter((n) => n.who === p.id).slice(-2);
  const habit = p.habits.some((h) => h.action === 'dig' && h.strength > 0.25);
  const html = `
    <div class="who"><b>${esc(p.name)}</b> <span class="soft">${Math.floor(ageYears(p))}, ${esc(house?.name ?? 'come from elsewhere')}</span><button class="x" id="cardx" aria-label="Close">×</button></div>
    <div class="shelter-person">${esc(exposureWords(s, p))}</div>
    <div>${walking ? 'on the way to ' : ''}${esc(doing)}<span class="soft"> · ${esc(bodyWords(p))}</span></div>
    ${feeling(p) ? `<div class="soft">${esc(feeling(p))}</div>` : ''}
    ${habit ? '<div class="hand">Goes down to the faces every morning now. Nobody asks.</div>' : ''}
    ${trustWords(p) ? `<div class="soft">${esc(p.name)} ${trustWords(p)}.</div>` : ''}
    ${why ? `<div class="hand">“${esc(why)}”</div>` : ''}
    ${about.map((n) => `<div class="soft small">${esc(n.text)}</div>`).join('')}`;
  if (el.dataset.html !== html) {
    const closing = document.activeElement?.id === 'cardx';
    el.dataset.html = html;
    el.innerHTML = html;
    if (closing) document.getElementById('cardx')?.focus();
  }
  el.hidden = false;
}

// ---------- pointer: paint, tap, pan, zoom ----------

function bindPointer(cv: HTMLCanvasElement) {
  const pts = new Map<number, { x: number; y: number; x0: number; y0: number }>();
  let mode: 'none' | 'paint' | 'pan' | 'pinch' = 'none';
  let pinch = { d: 0, cs: 0, cx: 0, cy: 0 };
  let moved = false;
  const local = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const painting = () => tool === 'chalk' || tool === 'erase' || tool === 'store' || tool === 'beds';
  cv.addEventListener('pointerdown', (e) => {
    pointing = true;
    cv.setPointerCapture(e.pointerId);
    const p = local(e);
    pts.set(e.pointerId, { ...p, x0: p.x, y0: p.y });
    moved = false;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      if (a && b)
        pinch = {
          d: Math.hypot(a.x - b.x, a.y - b.y),
          cs: view.cs,
          cx: (a.x + b.x) / 2,
          cy: (a.y + b.y) / 2,
        };
      manualView = true;
      mode = 'pinch';
      paint.preview.clear();
      paint.previewKind = null;
      closeCell(false);
    } else if (e.button === 2 || e.button === 1 || !painting()) mode = 'pan';
    else {
      mode = 'paint';
      paint.preview.clear();
      paint.previewKind = tool as Paint['previewKind'];
      addPaint(p.x, p.y, true);
    }
  });
  cv.addEventListener('pointermove', (e) => {
    const q = pts.get(e.pointerId);
    if (!q) return;
    const p = local(e);
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    q.x = p.x;
    q.y = p.y;
    if (Math.hypot(p.x - q.x0, p.y - q.y0) > 8) moved = true;
    if (mode === 'pan') {
      if (moved) manualView = true;
      view.x -= dx / view.cs;
      view.y -= dy / view.cs;
      clampView();
    } else if (mode === 'paint') addPaint(p.x, p.y);
    else if (mode === 'pinch' && pts.size === 2) {
      const [a, b] = [...pts.values()];
      if (!a || !b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const wx = view.x + pinch.cx / view.cs;
      const wy = view.y + pinch.cy / view.cs;
      view.cs = Math.max(10, Math.min(72, pinch.cs * (d / Math.max(1, pinch.d))));
      view.x = wx - cx / view.cs;
      view.y = wy - cy / view.cs;
      pinch.cx = cx;
      pinch.cy = cy;
      clampView();
    }
  });
  const up = (e: PointerEvent) => {
    const q = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    pointing = pts.size > 0;
    if (!q) return;
    if (mode === 'paint') {
      commitPaint();
    } else if (mode === 'pan' && !moved && e.button === 0) tap(q.x, q.y);
    if (pts.size === 0) mode = 'none';
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', (e) => {
    pts.delete(e.pointerId);
    pointing = pts.size > 0;
    paint.preview.clear();
    paint.previewKind = null;
    closeCell(false);
    mode = 'none';
  });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      manualView = true;
      if (e.ctrlKey) {
        const r = cv.getBoundingClientRect();
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        const wx = view.x + px / view.cs;
        const wy = view.y + py / view.cs;
        view.cs = Math.max(10, Math.min(72, view.cs * (1 - e.deltaY * 0.01)));
        view.x = wx - px / view.cs;
        view.y = wy - py / view.cs;
      } else {
        view.x += (e.shiftKey ? e.deltaY : e.deltaX) / view.cs;
        view.y += (e.shiftKey ? 0 : e.deltaY) / view.cs;
      }
      clampView();
    },
    { passive: false },
  );
}

let lastPaint: { x: number; y: number } | null = null;
function addPaint(px: number, py: number, fresh = false) {
  const from = fresh || !lastPaint ? { x: px, y: py } : lastPaint;
  const n = Math.max(1, Math.ceil(Math.hypot(px - from.x, py - from.y) / (view.cs / 3)));
  for (let k = 1; k <= n; k++) {
    const c = cellAt(view, from.x + ((px - from.x) * k) / n, from.y + ((py - from.y) * k) / n);
    if (c >= 0 && yOf(c) >= SURF) paint.preview.add(c);
  }
  lastPaint = { x: px, y: py };
  updatePlanPreview();
}

function updatePlanPreview() {
  if (!g || (paint.previewKind !== 'chalk' && paint.previewKind !== 'beds') || !paint.preview.size) return;
  bellReading = false;
  doorCell = null;
  showReading('Plan preview', planSafety(g.s, paint.preview, paint.previewKind).words, false);
}

/** Whether the chalk just laid joins open ground through other chalk (so a digger can work toward it). */
function reachable(cells: number[]): boolean {
  if (!g) return true;
  const h = g.s.hill;
  const open = (j: number) => h.kind[j] === K.open || yOf(j) === SURF - 1;
  const seen = new Set<number>();
  const q = cells.filter((c) => h.chalk[c] && neighbours(c).some(open));
  for (const c of q) seen.add(c);
  for (let i = 0; i < q.length; i++)
    for (const j of neighbours(q[i] ?? 0))
      if (!seen.has(j) && h.chalk[j]) {
        seen.add(j);
        q.push(j);
      }
  return cells.every((c) => !h.chalk[c] || seen.has(c));
}

function commitPaint() {
  if (!g) return;
  const cells = [...paint.preview];
  const kind = paint.previewKind;
  paint.preview.clear();
  paint.previewKind = null;
  if (!cells.length || !kind) return;
  const h = g.s.hill;
  if (kind === 'chalk') {
    if (order({ verb: 'chalk', cells, on: true })) {
      if (reachable(cells))
        flash(`Dig planned. ${planSafety(g.s, cells, 'chalk').words} People choose when to dig.`);
      else
        flash(
          'Nobody can get at that stone yet. Chalk a way to it from open ground, and they will dig toward it.',
        );
      return;
    }
    if (cells.length === 1 && h.chalk[cells[0] ?? 0]) order({ verb: 'chalk', cells, on: false });
    // Every refusal says why, in the village's words.
    else if (cells.some((c) => xOf(c) >= THEIR_X))
      flash(
        '“That is the neighbours’ ground, Usta. Only a passage that reaches it would show what is in it.”',
      );
    else if (cells.every((c) => h.kind[c] === K.open)) flash('That is open already. Chalk goes on stone.');
    else if (cells.some((c) => h.kind[c] === K.bedrock))
      flash('“Nothing cuts that, Usta. It is the old grey rock.”');
    else flash('Chalk goes on stone the picks can reach.');
  } else if (kind === 'erase') {
    order({ verb: 'chalk', cells, on: false });
    order({ verb: 'use', cells, use: 'none' });
  } else {
    const ok = order({ verb: 'use', cells, use: kind });
    if (kind === 'beds' && cells.some((c) => h.kind[c] === K.open && h.use[c] === USE.beds)) {
      const cell = cells.find((c) => h.kind[c] === K.open && h.use[c] === USE.beds);
      if (cell !== undefined) flash(`${sleepingRoomWords(g.s, cell)} ${sleepingCapacityWords(g.s)}`);
    }
    if (!ok && cells.every((c) => h.kind[c] !== K.open))
      flash('Rooms are marked on open ground. Chalk the stone first.');
  }
}

function tap(px: number, py: number) {
  if (!g) return;
  closeCell(false);
  const s = g.s;
  const c = cellAt(view, px, py);
  if (tool === 'lamp') {
    if (c < 0) return;
    if (s.hill.lamp[c] || s.hill.lampsWanted.includes(c)) order({ verb: 'unlamp', cell: c });
    else if (order({ verb: 'lamp', cell: c })) {
      if (s.hill.lampsWanted.includes(c))
        flash(
          'No lamp in hand: the dashed ring marks where it will hang. Someone will shape one at the hearth, if they will.',
        );
      else flash('Lamp hung.');
    } else flash('A lamp hangs in open ground, below the surface.');
    return;
  }
  if (tool === 'door') {
    if (c < 0) return;
    if (order({ verb: 'door', cell: c }))
      flash('A door marked. They will carve the rolling stone when someone has the time and a light.');
    else if (s.hill.use[c] === USE.door) showDoor(c);
    else if (s.hill.use.filter((u) => u === USE.door).length >= 3)
      flash('“Three doors are all we can keep rolled, Usta.”');
    else flash('A door fits a narrow passage: open on two opposite sides only.');
    return;
  }
  // Plans and sleeping marks take priority over people standing on them.
  if (c >= 0 && s.hill.chalk[c] && s.hill.kind[c] !== K.open) {
    showPlan(c);
    return;
  }
  if (c >= 0 && s.hill.use[c] === USE.beds) {
    showDoor(c);
    return;
  }
  const who = personAt(s, view, px, py, paint.t);
  personOpener = null;
  paint.selected = who;
  if (who) {
    card();
    document.getElementById('cardx')?.focus();
  } else {
    const el = document.getElementById('card');
    if (el) el.hidden = true;
    if (c >= 0) describeCell(c);
  }
}

function lightAt(c: number): boolean {
  if (!g) return false;
  const { lit } = airAndLight(g.s);
  return !!lit[c] || neighbours(c).some((j) => !!lit[j]);
}

/** Air and light at an open cell, in words, with what changes them. */
function airWords(c: number): string {
  if (!g) return '';
  const { lit, air } = airAndLight(g.s);
  if (yOf(c) >= SURF && (air[c] ?? 32000) > AIR_REACH)
    return ' The air is stale: no lamp burns and nobody will cut here. Air comes down an opening to the sky; it carries a long way straight down a shaft, not far sideways.';
  if (!lit[c]) return ' Dark. A lamp hung here would let them work.';
  return '';
}

function describeCell(c: number) {
  if (!g) return;
  const h = g.s.hill;
  const k = h.kind[c];
  const known = !!h.known[c];
  let text = '';
  if (yOf(c) < SURF) return;
  if (k === K.open) {
    const u = h.use[c] ?? 0;
    text =
      u === USE.store
        ? (h.grain[c] ?? 0) > 0.5
          ? 'A store. Jars of barley.'
          : 'A store, empty.'
        : u === USE.beds
          ? `${sleepingRoomWords(g.s, c)} ${sleepingCapacityWords(g.s)}`
          : u === USE.hearth
            ? 'The hearth. Yusuf Usta sits here.'
            : u === USE.well
              ? 'The well. Cold water from the seam.'
              : u === USE.door
                ? doorWords(g.s, c, lightAt(c))
                : (h.wear[c] ?? 0) > 6
                  ? 'Worn smooth. They walk this way.'
                  : 'Open ground.';
    text += airWords(c);
  } else if (!known) text = 'Stone. Nobody has seen what is in it.';
  else
    text =
      k === K.hard
        ? 'Hard stone. Slow to cut.'
        : k === K.loose
          ? 'Loose, crumbling stone. Quick to dig, and it can come down.'
          : k === K.seam
            ? 'Damp stone. Water seeps here.'
            : 'Soft stone. It cuts like cheese when it is fresh.';
  if (k !== K.open && h.chalk[c]) {
    const stand = neighbours(c).find((j) => h.kind[j] === K.open && yOf(j) >= SURF);
    if (stand !== undefined) text += airWords(stand);
  }
  if (h.use[c] === USE.door || h.use[c] === USE.beds) showDoor(c);
  else flash(text);
  void xOf;
  void idx;
}

function closeCell(focus = true) {
  bellReading = false;
  planCell = null;
  doorCell = null;
  const detail = document.getElementById('cell-detail');
  if (!detail || detail.hidden) return;
  detail.hidden = true;
  if (focus) canvas?.focus();
}

function updateDoor() {
  if (!g || doorCell === null) return;
  if (g.s.hill.chalk[doorCell] && g.s.hill.kind[doorCell] !== K.open) {
    showReading('Unbuilt plan', planSafety(g.s, [doorCell], 'chalk').words, true, true);
    return;
  }
  if (planCell !== null) {
    showReading(
      'Excavated plan',
      `${planSafety(g.s, [doorCell], 'beds').words} This ground is open now; beds still need marking.`,
    );
    doorCell = null;
    planCell = null;
    return;
  }
  const text = document.getElementById('cell-words');
  const words =
    g.s.hill.use[doorCell] === USE.beds
      ? sleepingRoomWords(g.s, doorCell)
      : doorWords(g.s, doorCell, lightAt(doorCell));
  if (text && text.textContent !== words) {
    text.textContent = words;
    lastReading = { title: g.s.hill.use[doorCell] === USE.beds ? 'Sleeping room' : 'Stone door', words };
  }
}

function showPlan(cell: number) {
  if (!g) return;
  closeCard();
  bellReading = false;
  planCell = cell;
  doorCell = cell;
  showReading('Unbuilt plan', planSafety(g.s, [cell], 'chalk').words);
  document.getElementById('cellx')?.focus();
}

function showDoor(cell: number) {
  if (!g) return;
  closeCard();
  doorCell = cell;
  const beds = g.s.hill.use[cell] === USE.beds;
  const title = document.getElementById('cell-title');
  if (title) title.textContent = beds ? 'Sleeping room' : 'Stone door';
  const words = beds ? sleepingRoomWords(g.s, cell) : doorWords(g.s, cell, lightAt(cell));
  flash(words);
  doorCell = cell;
  showReading(beds ? 'Sleeping room' : 'Stone door', words);
  const detail = document.getElementById('cell-detail');
  const text = document.getElementById('cell-words');
  if (detail && text) {
    text.textContent = words;
    detail.hidden = false;
    document.getElementById('cellx')?.focus();
  }
}

// ---------- Game menu ----------

function showBellReading() {
  if (!g) return;
  const s = g.s;
  const at = s.bell?.at ?? s.notes.findLast((n) => /^You rang the bell[.,]/.test(n.text))?.at;
  const replies = s.people.filter(
    (p) => p.body.alive && at !== undefined && s.answers.some((a) => a.who === p.id && a.at >= at),
  );
  const call = bellStateWords(s);
  const shelter = bellShelterWords(s).replace(call, '').trim();
  showReading(
    'Bell call',
    `${call}\n\n${shelter}${replies.length ? `\n\n${replies.map((p) => `${p.name}: ${exposureWords(s, p)}`).join('\n\n')}` : ' No replies recorded yet.'}`,
    true,
    true,
  );
}

function updateShelter() {
  if (!g) return;
  const brief = document.getElementById('shelter-brief');
  if (brief) brief.title = compactShelterWords(g.s);
  const meaning = document.getElementById('bell-meaning');
  if (meaning) meaning.textContent = `Sleeping places · ${compactShelterWords(g.s)}. ${bellStateWords(g.s)}`;
  const summary = document.getElementById('shelter-summary');
  if (summary) summary.textContent = `${sleepingCapacityWords(g.s)} ${bellShelterWords(g.s)}`;
  for (const row of document.querySelectorAll<HTMLElement>('[data-shelter-person]')) {
    const person = personOf(g.s, row.dataset.shelterPerson ?? '');
    const words = person?.body.alive ? exposureWords(g.s, person) : 'No longer living; see the journal.';
    if (row.textContent !== words) row.textContent = words;
  }
}

function closeCard() {
  if (!paint.selected) return;
  paint.selected = null;
  const el = document.getElementById('card');
  if (el) el.hidden = true;
  const d = document.getElementById('drawer');
  if (personOpener?.isConnected && d) {
    d.hidden = false;
    personOpener.focus();
  } else canvas?.focus();
  personOpener = null;
}

function closeBook() {
  const d = document.getElementById('drawer');
  if (!d || d.hidden) return;
  d.hidden = true;
  menuOpener?.focus();
}

function openBook(tab = 's') {
  closeCell(false);
  const d = document.getElementById('drawer');
  if (!d || !g) return;
  menuOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  paint.selected = null;
  personOpener = null;
  const personCard = document.getElementById('card');
  if (personCard) personCard.hidden = true;
  const s = g.s;
  const notes = s.notes
    .filter((n) => n.weight >= 1)
    .slice(-60)
    .reverse();
  const alive = s.people.filter((p) => p.body.alive);
  const done = GOALS.filter((x) => s.goals[x.id] !== undefined);
  d.innerHTML = `
    <div class="sheet">
      <div class="who"><b>Game menu</b><button class="x" id="bookx" aria-label="Close">×</button></div>
      <div class="tabs">
        <button data-tab="s">Save and run</button><button data-tab="j">journal</button><button data-tab="p">people</button>
      </div>
      <div id="sheet-body" tabindex="0" role="region" aria-label="Game menu contents"><div class="tab" data-pane="j">${notes.map((n) => `<p class="${n.weight >= 2 ? 'heavy' : ''}"><span class="soft small">${esc(hillDate(n.at))}</span><br/>${esc(n.text)}</p>`).join('')}</div>
      <div class="tab" data-pane="p" hidden><b>Shelter check · now</b><p id="shelter-summary"></p><p class="soft small">The bell calls people below. Beds make sleeping space; depth and shut doors put stone between people and riders. Open shafts give riders another way in.</p>${s.houses
        .map((hs) => {
          const ms = hs.members.map((m) => personOf(s, m)).filter((p): p is Person => !!p && p.body.alive);
          if (!ms.length) return '';
          return `<section class="household"><b>${esc(hs.name)}</b>${ms.map((p) => `<div class="shelter-row"><button class="link" data-who="${p.id}">${esc(p.name)}</button><div class="small" data-shelter-person="${p.id}"></div></div>`).join('')}</section>`;
        })
        .join(
          '',
        )}<p class="soft">${souls(alive.length)} in the village. ${s.stats.died ? `${NUM[s.stats.died] ?? s.stats.died} buried.` : ''}</p></div>
      <div class="tab" data-pane="s" hidden>
        ${aboutHill}
        <p>${done.map((x) => `✓ ${esc(x.text)}`).join('<br/>') || '<span class="soft">Nothing ticked off yet.</span>'}</p>
        <div class="actions">
          <button id="savenow">Save this hill</button>
          <button id="send">Send this run to the notebook</button>
          <button id="export">Download this run</button>
          <button id="restart">Begin a new hill</button>
        </div>
        <p class="soft small">The Warren ${GAME_VERSION} · HF ${FRAMEWORK_VERSION} · seed ${s.seed}</p>
      </div>
      ${footer}</div>
    </div>`;
  d.hidden = false;
  updateShelter();
  document.getElementById('bookx')?.addEventListener('click', closeBook);
  for (const b of d.querySelectorAll<HTMLButtonElement>('[data-tab]'))
    b.addEventListener('click', () => {
      for (const x of d.querySelectorAll<HTMLButtonElement>('[data-tab]')) x.classList.toggle('on', x === b);
      for (const p of d.querySelectorAll<HTMLElement>('[data-pane]'))
        p.hidden = p.dataset.pane !== b.dataset.tab;
    });
  for (const b of d.querySelectorAll<HTMLButtonElement>('[data-who]'))
    b.addEventListener('click', () => {
      personOpener = b;
      paint.selected = b.dataset.who ?? null;
      d.hidden = true;
      const [x, y] = [xOf(g?.s.pos[paint.selected ?? ''] ?? 0), yOf(g?.s.pos[paint.selected ?? ''] ?? 0)];
      manualView = true;
      view.x = x - view.w / view.cs / 2;
      view.y = y - view.h / view.cs / 2;
      clampView();
      card();
      document.getElementById('cardx')?.focus();
    });
  document.getElementById('savenow')?.addEventListener('click', async () => {
    await writeSave();
    closeBook();
    flash('This hill is saved. It keeps going while you are gone, a little.');
  });
  document.getElementById('export')?.addEventListener('click', download);
  document.getElementById('send')?.addEventListener('click', () => {
    if (!g) return;
    const send = document.getElementById('send');
    const restore = () => {
      if (!d.isConnected) return;
      d.hidden = false;
      send?.focus();
    };
    d.hidden = true;
    lab.openSendDialog({ getRun: () => runOf() });
    const veil = document.querySelector('.hflab-veil');
    if (!veil) {
      restore();
      return;
    }
    // The pinned lab client has no dismissal callback; observe its own veil removal.
    const dismissed = new MutationObserver(() => {
      if (veil.isConnected) return;
      dismissed.disconnect();
      restore();
    });
    dismissed.observe(document.body, { childList: true });
  });
  d.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)?.click();
  document.getElementById('bookx')?.focus();
  document.getElementById('restart')?.addEventListener('click', async () => {
    if (!confirm('Begin a new hill? This one will be put away for good.')) return;
    await store.drop(SAVE_KEY);
    g = newGame((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
    seenHint.clear();
    enter();
  });
}

async function writeSave(): Promise<void> {
  if (!g) return;
  lastSaved = performance.now();
  dirty = false;
  await store.put(SAVE_KEY, { ...save(g), savedAt: Date.now() });
}

function runOf() {
  return g ? { ...save(g), exportedAt: new Date().toISOString() } : null;
}

function download() {
  if (!g) return;
  const blob = new Blob([JSON.stringify(runOf())], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `the-warren-${g.s.seed}-day${Math.floor(g.s.minute / DAY)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- phone niceties ----------

async function requestWake() {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> };
    };
    if (nav.wakeLock && !wake) wake = await nav.wakeLock.request('screen');
  } catch {}
}

addEventListener('pagehide', () => {
  if (g) void writeSave();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (g) void writeSave();
    cancelAnimationFrame(raf);
    wake = null;
  } else if (g && canvas) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
    requestWake();
  }
});

export const _debug = {
  get game() {
    return g;
  },
  view,
  setSpeed(k: number) {
    speedIx = k;
  },
  order,
};

/** Available on the title page too, before regular play events begin. */
function mountLabControls() {
  const controls = document.createElement('details');
  controls.className = 'lab-controls';
  controls.innerHTML = `<summary>Playtest privacy</summary><label><input type="checkbox"> Anonymous play events</label> <a href="https://human.adamwhite.work/lab/privacy/">Privacy</a>`;
  const toggle = controls.querySelector('input');
  if (toggle) {
    toggle.checked = lab.eventsOn;
    const sync = () => {
      toggle.checked = lab.eventsOn;
    };
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    document.addEventListener('change', sync);
    toggle.addEventListener('change', () => {
      lab.setEventsOff(!toggle.checked);
      toggle.checked = lab.eventsOn;
    });
  }
  document.body.append(controls);
}
