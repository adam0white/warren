/**
 * The page around the hill: a title, the cross-section, the keeper's tools, the bell, the speed, a person card
 * and the Game menu (journal, people, saves, download). Time runs continuously; the Game menu pauses it.
 */
import { ageYears, describePerson, FRAMEWORK_VERSION, type Person } from '@adam0white/human-framework';
import { type PhoneStage, phoneStage, telemetryNotice } from '@adam0white/lab-kit';
import { DAY, hourWords } from '../sim/calendar.ts';
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
  TEXT_VERSION,
} from '../sim/game.ts';
import { AIR_REACH, diggable, H, idx, K, neighbours, SURF, THEIR_X, USE, W, xOf, yOf } from '../sim/grid.ts';
import { BELL, VISIT_TERMS } from '../sim/people.ts';
import { INVITATIONS } from '../sim/visits.ts';
import {
  activeRaid,
  airAndLight,
  GOALS,
  houseOf,
  type Note,
  personOf,
  positionAt,
  QUANTUM,
  storesWords,
  waterWords,
} from '../sim/warren.ts';
import { baseView } from './camera.ts';
import * as continuity from './continuity.ts';
import { hillDate } from './date.ts';
import { doorDetailWords, doorWords } from './door-help.ts';
import { cellAt, draw, type Ink, type Paint, personAt, readInk, type View } from './draw.ts';
import { exposureWords } from './exposure.ts';
import { openFeedback } from './feedback.ts';
import { growthWords } from './growth.ts';
import { colonyWords, FIRST_CHALK, PURPOSE } from './guidance.ts';
import { lab } from './lab.ts';
import { activityWords, displayWords, settingWords, speechWords } from './words.ts';

const labTools = new URLSearchParams(location.search).get('lab') === '1';

import { personHelpWords } from './person-help.ts';
import { type PlanSafety, planSafety } from './plan-safety.ts';
import { eventStamp, playbackRate } from './playback.ts';
import { bellShelterWords, bellStateWords, bellThreatWords } from './room-safety.ts';
import {
  compactShelterWords,
  sleepingCapacity,
  sleepingCapacityWords,
  sleepingRoomWords,
} from './shelter.ts';
import * as store from './store.ts';

type Tool = 'look' | 'chalk' | 'erase' | 'store' | 'beds' | 'lamp' | 'door';
const SPEEDS = [1, 4, 16] as const;
const SPEED_NAMES = ['Slow', 'Steady', 'Fast'];
const MS_PER_MIN = 20000 / DAY;
let speedIx = 0;
const SAVE_KEY = 'hill';

let g: Game | null = null;
let tool: Tool = 'look';
let readUntil = 0;
let disp = 0;
let last = 0;
let raf = 0;
let ink: Ink;
const view: View = { cs: 20, x: 6, y: 2, w: 360, h: 400 };
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let sceneObserver: ResizeObserver | null = null;
let stage: PhoneStage | null = null;
let focusCell: number | null = null;
let sceneTop = 0;
let resizeQueued = false;
function queueResize() {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    resize();
  });
}
const paint: Paint = { preview: new Set(), previewKind: null, selected: null, t: 0 };
let lastSaved = 0;
let dirty = false;
let lastSeenNote: Note | null = null;
let ticker: Note | null = null;
let tickerUntil = 0;
let lagging = false;
let wake: { release(): Promise<void> } | null = null;
const seenHint = new Set<string>();
const answeredRaids = new Set<number>();
let labScreen = '';
const labGoals = new Set<string>();
let labBase = { arrivals: 0, gone: 0, died: 0 };
let menuOpener: HTMLElement | null = null;
let personOpener: HTMLElement | null = null;
let doorCell: number | null = null;
let bellReading = false;
let planCell: number | null = null;
let lastReading: { title: string; words: string; context?: string } | null = null;
let pendingEntrance: number[] | null = null;

const notice = telemetryNotice();
// Keep the shared notice readable on platforms with wider system font metrics.
if (notice) {
  notice.style.fontFamily = 'Arial, "Liberation Sans", sans-serif';
  notice.style.paddingInline = '2px';
}
const app = () => document.getElementById('app') as HTMLElement;
const esc = (x: string) =>
  settingWords(x).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );
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
  n === 0
    ? 'no people'
    : n < NUM.length
      ? `${NUM[n]} ${n === 1 ? 'person' : 'people'}`
      : n < 20
        ? 'under twenty people'
        : n < 40
          ? `about ${Math.round(n / 5) * 5} people`
          : `${Math.round(n / 10) * 10} people or more`;
// Keep the actual notice and its host outside app rerenders. SDK suppression stays final.
const noticeFooter = document.createElement('footer');
noticeFooter.id = 'notice-footer';
if (notice) noticeFooter.append(notice);
document.body.append(noticeFooter);
const footer = `<div class="footer">${'<a class="mark" href="https://human.adamwhite.work">◇ human framework</a>'}<br>People by the Human Framework.${labTools ? ` Version ${FRAMEWORK_VERSION}.` : ''}</div>`;
const playInfo = `<p>Draw a dashed outline with chalk to mark stone for digging. People choose when to dig. They need fresh air and light.</p><p>Use the Furnish menu to mark open ground for grain stores, sleeping places, lamps or doors.</p><p>A door needs a passage one square wide, with open ground on two opposite sides. You can mark up to three doors.</p><p>Filled circles show marked sleeping places. Empty circles show how many more places are needed. Tap the people count to check who riders could reach.</p>`;
function topbar(titlePage = false) {
  return `<header class="topbar"><div class="bar-words">${titlePage ? '<a target="_top" href="https://human.adamwhite.work/games/">All games</a>' : '<span id="when"></span>'}</div><button class="info" aria-label="Information" popovertarget="hill-info">i</button><button id="book" aria-label="Game menu">≡<span class="menu-label"> Menu</span></button></header><div id="hill-info" class="info-popover" popover="auto"><div class="who"><b>${titlePage ? 'The hill' : 'Chalk and marks'}</b><button popovertarget="hill-info" popovertargetaction="hide" aria-label="Close information">×</button></div>${titlePage ? '<p>Riders burned two villages. Your refuge starts in the cellar under Master Yusuf’s house.</p><p>You have the chalk and the bell. You mark where work is needed. Each person chooses what to do.</p><p>Use one finger to draw chalk marks or inspect the hill. Use two fingers to move the view.</p><p>A year has 365 days. Year 1 begins on 19 August.</p>' : playInfo}</div>`;
}

// ---------- start ----------

export async function start() {
  window.addEventListener('warren-history-error', (event) => {
    if ((event as CustomEvent<Game>).detail !== g) return;
    let warning = document.getElementById('history-warning');
    if (!warning) {
      warning = document.createElement('p');
      warning.id = 'history-warning';
      warning.setAttribute('role', 'alert');
      noticeFooter.prepend(warning);
    }
    warning.textContent =
      'Shared history could not be confirmed. Keep this hill open. You can open Feedback from the menu.';
  });
  continuity.attach(
    () => g,
    async (game) => (g === game ? writeSave() : false),
  );
  lab.trackRun(
    async () => {
      const current = g;
      try {
        const stored = await store.get<Saved>(SAVE_KEY);
        if (current && g === current && stored?.value.seed === current.s.seed) lab.captureSave(stored.value);
      } catch {}
      return runOf();
    },
    {
      runKey: () => g?.s.seed ?? 'title',
      getLogs: () => g?.s.notes.slice(-40).map((line) => line.text) ?? [],
    },
  );
  if ('serviceWorker' in navigator && location.hostname !== 'localhost')
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  ink = readInk();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    ink = readInk();
  });
  const sv = await store.get<Saved & { savedAt?: number }>(SAVE_KEY);
  title(sv?.value ?? null, sv?.at ?? 0);
}

function title(sv: (Saved & { savedAt?: number }) | null, _at: number) {
  lab.screen('title');
  feedbackCleanup?.();
  const compatible =
    sv && sv.framework === FRAMEWORK_VERSION && sv.game === GAME_VERSION && sv.textVersion === TEXT_VERSION;
  cancelAnimationFrame(raf);
  canvas = null;
  stage?.destroy();
  sceneObserver?.disconnect();
  app().innerHTML = `<div class="page">${topbar(true)}
    <div class="title-art"><canvas id="title-cv" aria-label="The village above its cellar"></canvas><h1>The Warren</h1></div>
    <p class="title-goal">${PURPOSE}</p>
    ${sv && !compatible ? '<p class="soft">This saved game comes from an older version and cannot be loaded. Start a new game.</p>' : ''}
    <div class="title-actions">${compatible ? `<button class="primary" id="cont">Resume <span class="soft">· ${esc(hillDate(sv.minute).split(' · ')[0] ?? '')}</span></button>` : ''}
      <button ${compatible ? '' : 'class="primary"'} id="new">${compatible ? 'New game' : 'Begin'}</button>
      <div id="new-confirm" hidden><p>Starting a new game replaces this saved hill.</p><button id="new-yes">Yes, begin</button><button id="new-no">No</button></div>
      ${footer}</div><div id="title-drawer" hidden></div></div>`;
  const art = document.getElementById('title-cv') as HTMLCanvasElement;
  const artCtx = art.getContext('2d');
  const demo = sv && compatible ? load(sv) : newGame(7);
  art.width = art.clientWidth * devicePixelRatio;
  art.height = art.clientHeight * devicePixelRatio;
  artCtx?.scale(devicePixelRatio, devicePixelRatio);
  if (artCtx)
    draw(artCtx, demo.s, baseView(demo.s, art.clientWidth, art.clientHeight), ink, {
      ...paint,
      t: demo.s.minute,
    });
  document.getElementById('book')?.addEventListener('click', () => titleMenu());
  document.getElementById('cont')?.addEventListener('click', async () => {
    if (!sv) return;
    try {
      const prepared = await continuity.localLoad(sv);
      g = prepared;
      speedIx = 1;
      enter();
    } catch (error) {
      startError(error, 'The saved hill could not be opened.');
    }
  });
  document.getElementById('new')?.addEventListener('click', () => {
    if (compatible) {
      document.getElementById('new-confirm')?.removeAttribute('hidden');
      document.getElementById('new')?.setAttribute('hidden', '');
    } else void beginNewHill();
  });
  document.getElementById('new-yes')?.addEventListener('click', () => void beginNewHill());
  document.getElementById('new-no')?.addEventListener('click', () => {
    document.getElementById('new-confirm')?.setAttribute('hidden', '');
    document.getElementById('new')?.removeAttribute('hidden');
  });
}

async function beginNewHill(errorHost?: HTMLElement): Promise<boolean> {
  try {
    const prepared = await continuity.fresh((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
    await store.drop(SAVE_KEY);
    g = prepared;
  } catch (error) {
    startError(error, 'A new hill could not be started.', errorHost);
    return false;
  }
  speedIx = 0;
  seenHint.clear();
  enter();
  return true;
}

function startError(error: unknown, message: string, host?: HTMLElement) {
  console.error('Warren start failed', error);
  let status = document.getElementById('start-error');
  if (!status) {
    status = document.createElement('p');
    status.id = 'start-error';
    status.setAttribute('role', 'alert');
    (host ?? document.querySelector('.title-actions'))?.prepend(status);
  }
  status.textContent = `${message} Your saved hill has not been replaced. You can retry or open Feedback in the menu.${labTools ? ` ${String(error)}` : ''}`;
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
  <div class="game lk-stage" data-sheet="fit"><span id="font-probe" aria-hidden="true"></span>
    ${topbar()}
    <div class="state-strip"><div class="state-drawing"><button id="shelter-check" aria-label="The village"></button><span id="stock"></span><span id="bell-state" aria-label="Bell quiet">🔔</span></div>
    <div class="pace"><span id="clock-rate"></span><div class="speed" role="group" aria-label="Speed">${SPEEDS.map((_, k) => `<button data-speed="${k}">${SPEED_NAMES[k]}</button>`).join('')}</div></div></div>
    <div class="goal-slot"><div class="goal" id="goal"></div><div class="goal" id="raid-warning" hidden></div></div>
    <div class="scene lk-scene" id="scene"><canvas id="cv" tabindex="0" aria-label="The hill"></canvas>
      <div class="view-controls" role="group" aria-label="Hill view"><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="fit-hill" aria-label="Fit hill">⤢</button></div>
      <div class="lag soft" id="lag" hidden>The game is running as fast as this device allows.</div>
    </div>
    <div class="panel lk-sheet" aria-label="Hill actions"><div class="lk-sheet-body" id="inspection-body">
      <div class="card" id="card" hidden></div>
      <div class="card cell-detail" id="cell-detail" hidden><div class="who"><b id="cell-title">Reading</b><button class="x" id="cellx" aria-label="Close reading">×</button></div><p id="cell-words" role="region" aria-label="Full reading"></p><div id="entrance-choice" hidden><button id="confirm-entrance">Plan this entrance</button><button id="cancel-entrance">Cancel</button></div><details id="reading-context" hidden><summary>More ▸</summary><div id="door-context"></div></details></div>
      <div class="drawer" id="drawer" hidden></div>
      <div id="journal-tail"></div>
    </div>
    <div class="reading-actions"><button id="last-reading"><span id="event-sentence" aria-live="polite">${FIRST_CHALK}</span> ▸</button><button class="ticker" id="ticker">Journal ▸</button></div>
    <div class="lk-commit" id="hill-controls"><div class="tools" role="toolbar" aria-label="Tools">
      ${toolBtn('look', 'look', '◎')}${toolBtn('chalk', 'chalk', '□')}${toolBtn('erase', 'rub out', '⌫')}
      <button id="furnish" aria-expanded="false">furnish ▾</button><button class="bell" id="bell">bell</button></div>
      <div id="furnish-picker" hidden>${(['store', 'beds', 'lamp', 'door'] as const).map((t) => `<button data-tool="${t}">${t}<small>${{ store: 'Mark open ground for grain jars.', beds: 'Mark open ground for sleeping.', lamp: 'Hang a lamp over open ground.', door: 'Use a passage one square wide, open on two opposite sides.' }[t]}</small></button>`).join('')}</div>
      <div id="raid-actions" hidden></div>
    </div></div></div>`;
  stage?.destroy();
  const stageRoot = document.querySelector<HTMLElement>('.lk-stage');
  if (!stageRoot) return;
  stage = phoneStage(stageRoot, {
    observeOnly: true,
    onSceneRect: queueResize,
  });
  lastReading = null;
  pendingEntrance = null;
  bellReading = false;
  planCell = null;
  doorCell = null;
  canvas = document.getElementById('cv') as HTMLCanvasElement;
  ctx = canvas.getContext('2d');
  disp = g.s.minute;
  paint.t = disp;
  lastSeenNote = g.s.notes.at(-2) ?? null;
  readUntil = performance.now() + 6000;
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
      bellReading = true;
      showBellReading();
      chrome();
    }
  });
  document.getElementById('raid-actions')?.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest('button')?.id;
    if (id === 'raid-bell') {
      document.getElementById('bell')?.click();
      return;
    }
    if (id !== 'watch-raid') return;
    const raid = g && activeRaid(g.s);
    if (raid) answeredRaids.add(raid.smoke);
    chrome();
  });
  document.getElementById('furnish')?.addEventListener('click', () => {
    const picker = document.getElementById('furnish-picker');
    if (picker) picker.hidden = !picker.hidden;
    document.getElementById('furnish')?.setAttribute('aria-expanded', String(!picker?.hidden));
  });
  document.getElementById('book')?.addEventListener('click', () => openBook());
  document.getElementById('shelter-check')?.addEventListener('click', () => openBook('p'));
  document.getElementById('zoom-in')?.addEventListener('click', () => zoomView(2.2));
  document.getElementById('zoom-out')?.addEventListener('click', () => zoomView(1 / 2.2));
  document.getElementById('fit-hill')?.addEventListener('click', () => {
    if (!g) return;
    Object.assign(view, baseView(g.s, view.w, view.h));
    clampView();
  });
  document.getElementById('cellx')?.addEventListener('click', () => closeCell());
  document.getElementById('cancel-entrance')?.addEventListener('click', () => closeCell());
  document.getElementById('confirm-entrance')?.addEventListener('click', () => {
    const cells = pendingEntrance;
    pendingEntrance = null;
    const choice = document.getElementById('entrance-choice');
    if (choice) choice.hidden = true;
    if (cells) {
      paint.preview = new Set(cells);
      paint.previewKind = 'chalk';
      commitPaint(true);
    }
  });
  // Close on pointerdown before a live redraw can replace the tapped control.
  document.getElementById('card')?.addEventListener('pointerdown', (e) => {
    if (!(e.target as HTMLElement).closest('#cardx, #cardback')) return;
    e.preventDefault();
    closeCard();
  });
  // Keyboard activation dispatches a click without pointerdown.
  document.getElementById('card')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('#cardx, #cardback')) closeCard();
  });
  document.getElementById('ticker')?.addEventListener('click', () => openBook('j'));
  document.getElementById('last-reading')?.addEventListener('click', () => {
    if (lastReading?.title === 'Bell call') {
      bellReading = true;
      showBellReading();
    } else if (lastReading) {
      const saved = lastReading;
      showReading(saved.title, saved.words);
      if (saved.context) {
        readingContext(saved.context);
        if (lastReading) lastReading.context = saved.context;
      }
    } else showReading('Latest word', document.getElementById('event-sentence')?.textContent ?? FIRST_CHALK);
  });
  document.querySelector('.game')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key !== 'Escape') return;
    if (document.querySelector(':popover-open')) return;
    if (!document.getElementById('cell-detail')?.hidden) closeCell();
    else if (paint.selected) closeCard();
    else closeBook();
  });
  resize();
  const s = g.s;
  focusCell = null;
  Object.assign(view, baseView(s, view.w, view.h));
  clampView();
  bindPointer(canvas);
  sceneObserver?.disconnect();
  sceneObserver = new ResizeObserver(queueResize);
  const scene = document.getElementById('scene');
  if (scene) sceneObserver.observe(scene);
  if (stageRoot) sceneObserver.observe(stageRoot);
  const commitRow = document.getElementById('hill-controls');
  if (commitRow) sceneObserver.observe(commitRow);
  const fontProbe = document.getElementById('font-probe');
  if (fontProbe) sceneObserver.observe(fontProbe);
  const guidance = stageRoot.querySelector<HTMLElement>(':scope > .goal-slot');
  if (guidance) sceneObserver.observe(guidance);
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
  closeCard();
  closeBook();
  document.getElementById('furnish-picker')?.setAttribute('hidden', '');
  document.getElementById('furnish')?.setAttribute('aria-expanded', 'false');
  focusCell = null;
  tool = t;
  syncButtons();
  const hints: Partial<Record<Tool, string>> = {
    chalk: 'A dashed outline marks where people can dig. Each person chooses when to work.',
    erase: 'Drag to erase chalk marks or room markings.',
    store: 'Drag over open ground to mark a grain store. People can bring grain to its jars.',
    beds: 'Drag over open ground to mark sleeping places below.',
    lamp: 'Tap open ground to hang a lamp. Tap it again to take it down.',
    door: 'Tap a lit passage one square wide, with two opposite openings. You can mark up to three doors.',
  };
  const h = hints[t];
  if (h) hint(`tool:${t}`, h);
}

function syncButtons() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
    const selected = Number(b.dataset.speed) === speedIx;
    b.classList.toggle('on', selected);
    b.setAttribute('aria-pressed', String(selected));
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
    b.classList.toggle('on', b.dataset.tool === tool);
    b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
  }
  const furnish = document.getElementById('furnish');
  if (furnish) {
    const selected = ['store', 'beds', 'lamp', 'door'].includes(tool);
    furnish.textContent = selected ? `${tool} ▾` : 'furnish ▾';
    furnish.setAttribute('aria-pressed', String(selected));
  }
}

function resize() {
  const sc = document.getElementById('scene');
  if (!sc || !canvas) return;
  const root = document.querySelector<HTMLElement>('.game');
  if (root) {
    root.dataset.reflow = String(parseFloat(getComputedStyle(root).fontSize) > 24 || innerHeight < 600);
    root.style.setProperty('--warren-height', `${root.clientHeight}px`);
    root.style.setProperty(
      '--warren-goal-height',
      `${root.querySelector(':scope > .goal-slot')?.getBoundingClientRect().height ?? 64}px`,
    );
    root.style.setProperty(
      '--warren-commit-height',
      `${document.getElementById('hill-controls')?.getBoundingClientRect().height ?? 0}px`,
    );
    root.style.setProperty(
      '--warren-strip-height',
      `${root.querySelector('.top')?.getBoundingClientRect().height ?? 0}px`,
    );
  }
  const sceneBounds = sc.getBoundingClientRect();
  const controlsHeight = 0;
  const r = {
    width: sceneBounds.width,
    height: Math.max(1, sceneBounds.height - controlsHeight),
    top: sceneBounds.top + controlsHeight,
  };
  if (canvas.width && sceneTop) view.y += (r.top - sceneTop) / view.cs;
  sceneTop = r.top;
  if (focusCell !== null) {
    const y = (yOf(focusCell) + 0.5 - view.y) * view.cs;
    if (y < 60 || y > r.height - 12) view.y = yOf(focusCell) + 0.5 - (r.height + 48) / (2 * view.cs);
  }
  const dpr = Math.min(3, devicePixelRatio || 1);
  const width = Math.round(r.width * dpr);
  const height = Math.round(r.height * dpr);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
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
  const cx = view.x + view.w / view.cs / 2;
  const cy = Math.max(SURF + 3, view.y + view.h / view.cs / 2);
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

/** Menu pages, their person pages and notebook/privacy dialogs hold only playback. */
function menuHoldsTime(): boolean {
  return (
    !!document.querySelector('#drawer:not([hidden]), .hflab-veil, #feedback-host:not([hidden])') ||
    !!document.querySelector(':popover-open') ||
    (!!personOpener?.isConnected && !document.getElementById('card')?.hidden)
  );
}

function frame(now: number) {
  raf = requestAnimationFrame(frame);
  if (!g || !ctx) return;
  const elapsed = Math.max(0, now - last);
  const dt = Math.min(250, elapsed);
  const held = menuHoldsTime() || isReading() || !!raidDecision();
  if (held && readUntil > last) readUntil += elapsed;
  last = now;
  const s = g.s;
  const menuHeld = menuHoldsTime();
  const reading = isReading();
  const rate = playbackRate(
    reading || menuHeld,
    !!raidDecision(),
    now < readUntil,
    ((SPEEDS[speedIx] ?? 1) * 1000) / MS_PER_MIN,
  );
  if (rate === 0) disp = s.minute;
  else disp += (dt * rate) / 1000;
  const t0 = performance.now();
  while (rate > 0 && s.minute + QUANTUM <= disp && performance.now() - t0 < 10) {
    const pending = raidDecision();
    const before = eventStamp(s);
    const dayBefore = Math.floor(s.minute / DAY);
    const aliveBefore = s.people.filter((p) => p.body.alive).length;
    advance(g, s.minute + QUANTUM);
    if (
      s.people.some((p) => (s.flags[`released:${p.id}`] ?? 0) >= s.minute - QUANTUM + 1 && !p.activity) ||
      Math.floor(s.minute / DAY) !== dayBefore ||
      s.people.filter((p) => p.body.alive).length !== aliveBefore
    )
      void continuity.checkpoint();
    dirty = true;
    if ((!pending && raidDecision()) || eventStamp(s) !== before) {
      readUntil = now + 6000;
      // Discard only playback overshoot: never skip or alter a simulation step.
      disp = s.minute;
      chrome();
      break;
    }
  }
  lagging = disp > s.minute + 2 * QUANTUM;
  if (lagging) disp = s.minute + QUANTUM;
  paint.t = Math.min(disp, s.minute + QUANTUM);
  // The working view moves only through view controls, gestures or explicit person selection.
  draw(ctx, s, view, ink, paint);
  if (Math.floor(now / 250) !== Math.floor((now - dt) / 250)) chrome();
  if (dirty && now - lastSaved > 30000) writeSave();
}

/** The text around the scene: date, stores, goal, notes, the card. Updated a few times a second. */
function chrome() {
  if (!g) return;
  const s = g.s;
  const when = document.getElementById('when');
  if (when)
    when.textContent = `${hourWords(paint.t).replace(/^./, (c) => c.toUpperCase())} · ${hillDate(paint.t)
      .replace(' at the hill', '')
      .replace('Year', 'year')
      .replace(/(January|February|March|April|August|September|October|November|December)/g, (m) =>
        m.slice(0, 3),
      )}`;
  const stock = document.getElementById('stock');
  if (stock) {
    const jars = storesWords(s);
    const filled = ['empty', 'a few', 'month', 'winter', 'year'].findIndex((w) => jars.includes(w));
    const water = waterWords(s);
    stock.innerHTML = `<span class="jars" aria-label="${jars}" title="${jars}">${[0, 1, 2, 3].map((i) => `<span class="${i < filled ? 'full' : 'empty'}">⚱</span>`).join('')}</span><span class="water ${water.includes('dry') ? 'dry' : ''}" style="--fill:${water.includes('little') ? '25%' : '100%'}" aria-label="${water}" title="${water}">${water.includes('dry') ? '♧' : water.includes('little') ? '◒' : '◕'}</span>`;
  }
  const goal = document.getElementById('goal');
  if (goal)
    goal.textContent = waterWords(s).includes('dry')
      ? 'The water jars are dry. People need a well or water carried below.'
      : tool === 'beds' && !activeRaid(s)
        ? sleepingCapacityWords(s)
        : colonyWords(s);
  const r0 = activeRaid(s);
  const lag = document.getElementById('lag');
  if (lag) lag.hidden = !lagging;
  // The lab: where the player is (the last screen before leaving is the quit point) and what they reached.
  const reading0 = isReading();
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
      : `${pending.stage === 'smoke' ? 'Smoke rises on the ridge.' : 'Riders are at the hill.'} Ring the bell once, or keep watching. People choose whether to come.`;
  }
  const root = document.querySelector<HTMLElement>('.game');
  if (root) root.dataset.raid = String(!!pending);
  const tools = document.querySelector<HTMLElement>('.tools');
  if (tools) tools.hidden = !!pending;
  const speeds = document.querySelector<HTMLElement>('.speed');
  if (speeds) speeds.hidden = !!pending;
  const decisions = document.getElementById('raid-actions');
  if (decisions) {
    decisions.hidden = !pending;
    if (pending) document.getElementById('furnish-picker')?.setAttribute('hidden', '');
    if (pending && !decisions.children.length)
      decisions.innerHTML = `<p id="raid-words"></p><button id="raid-bell">🔔 Ring the bell</button><button id="watch-raid">Keep watching</button>`;
    if (!pending) decisions.replaceChildren();
    const words = document.getElementById('raid-words');
    const below = s.people.filter((p) => p.body.alive && yOf(positionAt(s, p.id, s.minute)) >= SURF);
    if (words)
      words.textContent = `${pending?.stage === 'smoke' ? 'Smoke rises on the ridge. Riders may arrive in half a day.' : 'Riders are at the hill.'} People choose whether to come. People below ground: ${below.length <= 4 ? below.map((p) => settingWords(p.name)).join(', ') || 'no one' : souls(below.length)}. People above ground: ${s.people.filter((p) => p.body.alive).length - below.length}.`;
  }
  const info = document.getElementById('hill-info');
  if (info && !info.matches(':popover-open')) {
    const raidInfo = !!pending;
    if (info.dataset.raid !== String(raidInfo)) {
      info.dataset.raid = String(raidInfo);
      info.innerHTML = `<div class="who"><b>${raidInfo ? 'Smoke and riders' : 'Chalk and marks'}</b><button popovertarget="hill-info" popovertargetaction="hide" aria-label="Close information">×</button></div>${raidInfo ? '<p>Smoke warns that riders may arrive in about half a day.</p><p>The bell calls whoever hears it.</p><p>If you ring the bell when no riders come, people may trust it less.</p>' : playInfo}`;
    }
  }
  const rate = document.getElementById('clock-rate');
  if (rate)
    rate.textContent =
      menuHoldsTime() || reading0
        ? 'Time is paused for reading.'
        : pending
          ? 'Time is paused for your choice.'
          : performance.now() < readUntil
            ? 'Time slows for new text.'
            : '';
  // New notes: heavy ones take the ticker.
  const firstNew = lastSeenNote ? s.notes.indexOf(lastSeenNote) + 1 : Math.max(0, s.notes.length - 1);
  for (const n of s.notes.slice(firstNew)) {
    // Light notes fill a quiet ticker; heavy ones push in.
    const quiet = performance.now() > tickerUntil;
    if ((n.weight >= 1 && (!ticker || n.weight >= ticker.weight)) || quiet) {
      ticker = n;
      tickerUntil = performance.now() + 5000 + n.weight * 2000;
    }
  }
  lastSeenNote = s.notes.at(-1) ?? null;
  const tk = document.getElementById('ticker');
  if (tk) {
    const text = ticker ? ticker.text : '';
    if (tk.dataset.text !== text) {
      tk.dataset.text = text;
      tk.textContent = 'Journal ▸';
      tk.title = displayWords(text);
      tk.classList.remove('ink-in');
      void tk.offsetWidth;
      tk.classList.add('ink-in');
    }
  }
  const event = document.getElementById('event-sentence');
  const work = [...s.notes]
    .reverse()
    .find((n) => (n.kind === 'dig' && n.who) || n.kind === 'arrival' || n.kind === 'raid');
  if (event) {
    const sentences = (work ? displayWords(work.text) : undefined)?.match(/[^.!?]+[.!?]/g) ?? [];
    const name = work?.who ? personOf(s, work.who)?.name : undefined;
    if (performance.now() > hintUntil)
      event.textContent =
        (name ? sentences.find((line) => line.includes(name)) : sentences[0])?.trim() ??
        (work ? displayWords(work.text) : undefined) ??
        FIRST_CHALK;
  }
  const bell = document.getElementById('bell') as HTMLButtonElement | null;
  if (bell) bell.classList.toggle('ringing', !!s.bell && s.minute < s.bell.until);
  const tail = document.getElementById('journal-tail');
  if (tail)
    tail.innerHTML = s.notes
      .filter((n) => n.weight >= 1)
      .slice(-8)
      .reverse()
      .map((n) => `<p>${esc(displayWords(n.text))}</p>`)
      .join('');
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
  hideOtherSheets('cell-detail');
  const context = document.getElementById('reading-context');
  if (context) context.hidden = true;
  pendingEntrance = null;
  const choice = document.getElementById('entrance-choice');
  if (choice) choice.hidden = true;
  const sameReading = preserveScroll && !detail.hidden && heading.textContent === settingWords(title);
  if (!sameReading) document.getElementById('inspection-body')?.scrollTo(0, 0);
  heading.textContent = settingWords(title);
  words = displayWords(words);
  if (text.textContent !== settingWords(words)) {
    const scroll = sameReading ? text.scrollTop : 0;
    text.textContent = settingWords(words);
    text.scrollTop = scroll;
  }
  detail.hidden = false;
  void preserveScroll;
  if (remember) {
    lastReading = { title, words };
    const reopen = document.getElementById('last-reading') as HTMLButtonElement | null;
    if (reopen) reopen.disabled = false;
  }
}

function planReading(title: string, reading: PlanSafety, remember = true, preserveScroll = false) {
  showReading(title, reading.words, remember, preserveScroll);
  readingContext(reading.context ?? '');
  if (remember && lastReading) lastReading.context = reading.context;
}

function readingContext(words: string) {
  const context = document.getElementById('reading-context');
  const label = context?.querySelector('summary');
  const text = document.getElementById('door-context');
  if (context) context.hidden = !words;
  if (label) {
    label.textContent = 'More ▸';
    label.setAttribute('aria-label', 'More about these routes');
  }
  if (text) text.textContent = settingWords(words);
}

function flash(text: string, contextWords = '') {
  bellReading = false;
  doorCell = null;
  showReading('Reading', text);
  if (contextWords) {
    readingContext(contextWords);
    if (lastReading) lastReading.context = contextWords;
  }
  ticker = { at: g?.s.minute ?? 0, kind: 'story', text, weight: 2 };
  tickerUntil = performance.now() + 9000;
}

/** A successful mark is a receipt, not an inspection. Keep it available through the peek. */
function receipt(text: string) {
  closeCell(false);
  lastReading = { title: 'Reading', words: text };
  const reopen = document.getElementById('last-reading') as HTMLButtonElement | null;
  if (reopen) reopen.disabled = false;
  hintUntil = performance.now() + 6000;
  const peek = document.getElementById('event-sentence');
  if (peek) peek.textContent = settingWords(text);
}

function hint(key: string, text: string) {
  if (seenHint.has(key)) return;
  seenHint.add(key);
  const peek = document.getElementById('event-sentence');
  hintUntil = performance.now() + 6000;
  if (peek) peek.textContent = settingWords(text);
}
let hintUntil = 0;

function isReading() {
  return ['drawer', 'card', 'cell-detail'].some((id) => !document.getElementById(id)?.hidden);
}

function hideOtherSheets(keep: string) {
  for (const id of ['drawer', 'card', 'cell-detail']) {
    if (id === keep) continue;
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
  if (keep !== 'card') paint.selected = null;
  const actions = document.querySelector<HTMLElement>('.reading-actions');
  if (actions) actions.hidden = true;
  const controls = document.getElementById('hill-controls');
  if (controls) controls.dataset.compact = 'false';
}

function restoreActions() {
  const actions = document.querySelector<HTMLElement>('.reading-actions');
  if (actions) actions.hidden = isReading();
  const controls = document.getElementById('hill-controls');
  if (controls) controls.dataset.compact = 'false';
}

// ---------- the person card ----------

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
  const cell = positionAt(s, p.id, paint.t);
  focusCell = cell;
  const margin = Math.min(32, view.h / 4);
  const px = (xOf(cell) + 0.5 - view.x) * view.cs;
  const py = (yOf(cell) + 0.5 - view.y) * view.cs;
  if (px < margin || px > view.w - margin) view.x = xOf(cell) + 0.5 - view.w / view.cs / 2;
  if (py < margin || py > view.h - margin) view.y = yOf(cell) + 0.5 - view.h / view.cs / 2;
  clampView();
  const house = houseOf(s, p.id);
  const doing = p.activity?.affordance.label ?? 'deciding what to do';
  const tr = s.trips[p.id];
  const walking = tr && paint.t < tr.workFrom && tr.cells.length > 1;
  const why = walking ? undefined : s.why?.[p.id];
  const about = s.notes.filter((n) => n.who === p.id).slice(-2);
  const habit = p.habits.some((h) => h.action === 'dig' && h.strength > 0.25);
  const html = `
    <div class="who">${personOpener ? `<button id="cardback" aria-label="Back to The village">← ${esc(p.name)}</button>` : `<b>${esc(p.name)}</b>`} <span class="soft">${Math.floor(ageYears(p))}, ${esc(house?.name ?? 'from elsewhere')}</span><button class="x" id="cardx" aria-label="Close">×</button></div>
        <p id="person-help">${esc(personHelpWords(s, p))}</p>
    <div>${esc(activityWords(doing, walking))}</div>
    <details id="person-context"><summary id="person-context-toggle">Activity and words</summary>
    <div class="shelter-person">${esc(exposureWords(s, p))}</div>
    ${feeling(p) ? `<div class="soft">${esc(feeling(p))}</div>` : ''}
    ${habit ? `<div class="hand">${esc(p.name)} goes down to the marked walls every morning now. Nobody needs to ask.</div>` : ''}
    ${trustWords(p) ? `<div class="soft">${esc(p.name)} ${trustWords(p)}.</div>` : ''}
    ${why ? `<div class="hand">“${esc(speechWords(why))}”</div>` : ''}
    ${about.map((n) => `<div class="soft small">${esc(displayWords(n.text))}</div>`).join('')}${(s.edition === '0.5.0' || s.edition === '0.6.0') && VISIT_TERMS[p.id] ? `<p>${esc(displayWords(VISIT_TERMS[p.id]!))}</p><button id="visit-person" ${s.flags[`visit:${p.id}`] ? 'disabled' : ''}>${esc(INVITATIONS[p.id]!)}</button><button id="release-person" ${s.flags[`released:${p.id}`] ? 'disabled' : ''}>End optional work</button>` : ''}
</details>${p.id === 'kian' ? continuity.careControls() : ''}`;
  if (el.dataset.html !== html) {
    const focused = document.activeElement?.id;
    const expanded = el.querySelector('details')?.open ?? false;
    el.dataset.html = html;
    el.innerHTML = html;
    continuity.bind(el, () => {});
    el.querySelector('#release-person')?.addEventListener('click', () => {
      if (g) {
        const ok = act(g, { verb: 'release', who: p.id });
        if (!ok) alert('This person cannot leave yet. Work, a duty, danger or care still needs them here.');
        dirty = true;
        card();
      }
    });
    el.querySelector('#visit-person')?.addEventListener('click', () => {
      if (g) {
        act(g, { verb: 'visit', who: p.id });
        dirty = true;
        card();
      }
    });
    const details = el.querySelector('details');
    if (details) details.open = expanded;
    if (focused) el.querySelector<HTMLElement>(`#${focused}`)?.focus();
  }
  hideOtherSheets('card');
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
    if (pendingEntrance) closeCell(false);
    cv.setPointerCapture(e.pointerId);
    const p = local(e);
    paint.target = cellAt(view, p.x, p.y);
    if (ctx && g) draw(ctx, g.s, view, ink, paint);
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
      if (ctx && g) draw(ctx, g.s, view, ink, paint);
    }
  });
  cv.addEventListener('pointermove', (e) => {
    const q = pts.get(e.pointerId);
    if (!q) return;
    const p = local(e);
    paint.target = cellAt(view, p.x, p.y);
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    q.x = p.x;
    q.y = p.y;
    if (Math.hypot(p.x - q.x0, p.y - q.y0) > 8) moved = true;
    if (mode === 'pan') {
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
    paint.target = mode === 'pan' || mode === 'pinch' ? null : cellAt(view, p.x, p.y);
  });
  const up = (e: PointerEvent) => {
    const q = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    paint.target = null;
    if (!q) return;
    if (mode === 'paint') {
      commitPaint();
    } else if (mode === 'pan' && !moved && e.button === 0) tap(q.x, q.y);
    if (pts.size === 0) mode = 'none';
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', (e) => {
    pts.delete(e.pointerId);
    paint.target = null;
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
  if (pendingEntrance) return;
  if (!g || (paint.previewKind !== 'chalk' && paint.previewKind !== 'beds') || !paint.preview.size) return;
  bellReading = false;
  doorCell = null;
  planReading('Plan preview', planSafety(g.s, paint.preview, paint.previewKind), false);
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

function commitPaint(entranceConfirmed = false) {
  if (!g) return;
  const cells = [...paint.preview];
  focusCell = null;
  const kind = paint.previewKind;
  paint.preview.clear();
  paint.previewKind = null;
  if (!cells.length || !kind) return;
  const h = g.s.hill;
  if (kind === 'chalk') {
    const opensEntrance = cells.some(
      (c) =>
        yOf(c) === SURF &&
        xOf(c) < THEIR_X &&
        xOf(c) !== h.surface.entrance &&
        !h.chalk[c] &&
        (diggable(h.kind[c] ?? K.bedrock) || h.kind[c] === K.old || h.kind[c] === K.theirs),
    );
    if (opensEntrance && !entranceConfirmed) {
      showReading(
        'New entrance?',
        'Open a new entrance here? It brings air, but riders could enter. A door below could close it.',
      );
      pendingEntrance = cells;
      paint.preview = new Set(cells);
      paint.previewKind = 'chalk';
      const choice = document.getElementById('entrance-choice');
      if (choice) choice.hidden = false;
      return;
    }
    if (order({ verb: 'chalk', cells, on: true })) {
      if (reachable(cells)) {
        const reading = planSafety(g.s, cells, 'chalk');
        flash(`The dig is marked. ${reading.words}`, reading.context);
      } else
        flash(
          'Nobody can reach that stone yet. Mark a path to it with chalk from open ground so people can dig toward it.',
        );
      return;
    }
    if (cells.length === 1 && h.chalk[cells[0] ?? 0]) order({ verb: 'chalk', cells, on: false });
    // Every refusal says why, in the village's words.
    else if (cells.some((c) => xOf(c) >= THEIR_X))
      flash(
        '“That ground belongs to the neighbours, Master. We need a passage to it before we can see what is there.”',
      );
    else if (cells.every((c) => h.kind[c] === K.open))
      flash('That ground is already open. Use chalk on stone.');
    else if (cells.some((c) => h.kind[c] === K.bedrock)) flash('“We cannot cut that old grey rock, Master.”');
    else flash('Use chalk on stone that people can reach with their picks.');
  } else if (kind === 'erase') {
    order({ verb: 'chalk', cells, on: false });
    order({ verb: 'use', cells, use: 'none' });
  } else {
    const ok = order({ verb: 'use', cells, use: kind });
    if (kind === 'beds' && cells.some((c) => h.kind[c] === K.open && h.use[c] === USE.beds)) {
      const cell = cells.find((c) => h.kind[c] === K.open && h.use[c] === USE.beds);
      if (cell !== undefined) flash(sleepingRoomWords(g.s, cell));
    }
    if (kind === 'store' && ok) receipt('The store is marked. People can bring grain to these jars.');
    else if (kind === 'store' && cells.some((c) => h.kind[c] === K.open && h.use[c] === USE.store))
      receipt('This ground is already marked as a store.');
    chrome();
    if (!ok && cells.every((c) => h.kind[c] !== K.open))
      flash('Rooms are marked on open ground. Chalk the stone first.');
  }
}

function tap(px: number, py: number) {
  if (!g) return;
  closeCell(false);
  const s = g.s;
  const c = cellAt(view, px, py);
  focusCell = c >= 0 ? c : null;
  if (tool === 'lamp') {
    if (c < 0) return;
    if (s.hill.lamp[c] || s.hill.lampsWanted.includes(c)) order({ verb: 'unlamp', cell: c });
    else if (order({ verb: 'lamp', cell: c })) {
      if (s.hill.lampsWanted.includes(c))
        flash(
          'There is no spare lamp. The dashed ring marks its place. Someone may choose to make one at the hearth.',
        );
      else receipt('The lamp is hanging here now.');
    } else flash('You can hang a lamp over open ground below the surface.');
    return;
  }
  if (tool === 'door') {
    if (c < 0) return;
    if (order({ verb: 'door', cell: c }))
      flash('The door is marked. Someone may carve it when they have time and light.');
    else if (s.hill.use[c] === USE.door) showDoor(c);
    else if (s.hill.use.filter((u) => u === USE.door).length >= 3)
      flash('“We can only keep three doors ready to roll shut, Master.”');
    else flash('A door fits a narrow passage with open ground on only two opposite sides.');
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
    return ' The air is stale. Lamps cannot burn here, and nobody will dig. Fresh air comes through an opening to the sky. It travels far down a vertical shaft but only a short way sideways.';
  if (!lit[c]) return ' It is dark here. A lamp would let people work.';
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
          ? 'This store holds jars of barley.'
          : 'This store is empty.'
        : u === USE.beds
          ? `${sleepingRoomWords(g.s, c)} ${sleepingCapacityWords(g.s)}`
          : u === USE.hearth
            ? 'Yusuf Usta sits at this hearth.'
            : u === USE.well
              ? 'Cold water flows into this well through a layer of damp stone.'
              : u === USE.door
                ? doorWords(g.s, c, lightAt(c))
                : (h.wear[c] ?? 0) > 6
                  ? 'People have worn this path smooth.'
                  : 'This ground is open.';
    text += airWords(c);
  } else if (!known) text = 'Nobody has seen what is inside this stone.';
  else
    text =
      k === K.hard
        ? 'This stone is hard and slow to cut.'
        : k === K.loose
          ? 'This loose stone is quick to dig, but it can fall.'
          : k === K.seam
            ? 'Water seeps through this damp stone.'
            : 'This soft stone is easy to cut when freshly exposed.';
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
  if (pendingEntrance) {
    pendingEntrance = null;
    paint.preview.clear();
    paint.previewKind = null;
  }
  const choice = document.getElementById('entrance-choice');
  if (choice) choice.hidden = true;
  bellReading = false;
  planCell = null;
  doorCell = null;
  const detail = document.getElementById('cell-detail');
  if (!detail || detail.hidden) return;
  detail.hidden = true;
  restoreActions();
  chrome();
  if (focus) canvas?.focus();
}

function updateDoor() {
  if (!g || doorCell === null) return;
  if (g.s.hill.chalk[doorCell] && g.s.hill.kind[doorCell] !== K.open) {
    planReading('Unbuilt plan', planSafety(g.s, [doorCell], 'chalk'), true, true);
    return;
  }
  if (planCell !== null) {
    showReading(
      'Excavated plan',
      `${planSafety(g.s, [doorCell], 'beds').words} This ground is open now. You still need to mark sleeping places.`,
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
  if (text && text.textContent !== settingWords(words)) {
    text.textContent = settingWords(words);
    lastReading = { title: g.s.hill.use[doorCell] === USE.beds ? 'Sleeping room' : 'Stone door', words };
  }
  updateDoorContext(doorCell);
}

function updateDoorContext(cell: number) {
  if (!g) return;
  const context = document.getElementById('reading-context');
  const text = document.getElementById('door-context');
  const words = g.s.hill.use[cell] === USE.door ? doorDetailWords(g.s, cell) : '';
  const label = context?.querySelector('summary');
  if (label) {
    label.textContent = 'More ▸';
    label.setAttribute('aria-label', 'More about this door');
  }
  if (context) context.hidden = !words;
  if (text) text.textContent = settingWords(words);
}

function showPlan(cell: number) {
  if (!g) return;
  closeCard();
  bellReading = false;
  planCell = cell;
  doorCell = cell;
  const reading = planSafety(g.s, [cell], 'chalk');
  const stand = neighbours(cell).find((j) => g?.s.hill.kind[j] === K.open);
  if (stand !== undefined) {
    const blocked = airWords(stand);
    if (blocked)
      reading.words = `A lamp or a second opening may be needed. ${blocked.trim()} ${reading.words}`;
  }
  planReading('Unbuilt plan', reading);
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
  updateDoorContext(cell);
  const detail = document.getElementById('cell-detail');
  const text = document.getElementById('cell-words');
  if (detail && text) {
    text.textContent = settingWords(words);
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
  showReading('Bell call', `${bellThreatWords(s)} ${call}`, true, true);
  const context = document.getElementById('reading-context');
  const label = context?.querySelector('summary');
  const text = document.getElementById('door-context');
  if (context) context.hidden = false;
  if (label) {
    label.textContent = 'More ▸';
    label.setAttribute('aria-label', 'Replies to the bell');
  }
  if (text)
    text.textContent = replies.length
      ? replies.map((p) => settingWords(`${p.name}: ${exposureWords(s, p)}`)).join('\n\n')
      : 'No one has replied yet.';
}

function updateShelter() {
  if (!g) return;
  const brief = document.getElementById('shelter-check');
  const alive = g.s.people.filter((p) => p.body.alive);
  const { places } = sleepingCapacity(g.s);
  if (brief) {
    brief.title = compactShelterWords(g.s);
    brief.innerHTML = `${alive
      .slice(0, 20)
      .map(
        (p, i) =>
          `<span class="soul ${i < places ? 'sheltered' : 'exposed'} ${p.activity?.action === 'hide' ? 'hiding' : ''}" aria-label="${esc(p.name)}">${i < places ? '●' : '○'}</span>`,
      )
      .join('')}${alive.length > 20 ? ' and more' : ''}<span class="small"> people</span>`;
  }
  const bellState = document.getElementById('bell-state');
  if (bellState) {
    const ringing = !!g.s.bell && g.s.minute < g.s.bell.until;
    const low = alive.some((p) => (p.will.voices.find((v) => v.voiceId === BELL)?.trust ?? 0.5) < 0.3);
    bellState.textContent = low ? '🔔╱' : '🔔';
    bellState.classList.toggle('ringing', ringing);
    bellState.setAttribute('aria-label', ringing ? 'Bell ringing' : low ? 'Bell trust is low' : 'Bell quiet');
  }
  const summary = document.getElementById('shelter-summary');
  if (summary)
    summary.textContent = settingWords(bellShelterWords(g.s).replace(bellStateWords(g.s), '').trim());
  for (const row of document.querySelectorAll<HTMLElement>('[data-shelter-person]')) {
    const person = personOf(g.s, row.dataset.shelterPerson ?? '');
    const words = person?.body.alive ? exposureWords(g.s, person) : 'This person has died. See the journal.';
    if (row.textContent !== settingWords(words)) row.textContent = settingWords(words);
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
  restoreActions();
}

function closeBook() {
  feedbackCleanup?.();
  const d = document.getElementById('drawer');
  if (!d || d.hidden) return;
  d.hidden = true;
  restoreActions();
  menuOpener?.focus();
}

function menuRows() {
  return `<p>The game is paused while the menu is open.</p><div class="menu-rows"><button id="send">Feedback</button><button id="fullscreen">Full screen</button><a target="_top" href="https://human.adamwhite.work/games/">All games</a><button id="to-title">New game</button></div><div id="menu-new-confirm" hidden><p>Starting a new game replaces this saved hill.</p><button id="menu-new-yes">Start new game</button><button id="menu-new-no">Cancel</button></div>${labTools ? continuity.controls() : ''}<div class="menu-footer"><label><input id="record-play" type="checkbox" ${lab.telemetryOn ? 'checked' : ''}> Recording</label></div><button class="primary" id="resume">Resume</button>`;
}
let feedbackCleanup: (() => void) | undefined;
function showFeedback(host: HTMLElement, onBack: () => void) {
  feedbackCleanup?.();
  feedbackCleanup = openFeedback(host, lab, runOf, download, onBack, continuity.chooseContinuityRecording);
}
function bindMenu(host: HTMLElement, close: () => void) {
  continuity.bind(host, (game) => {
    g = game;
    speedIx = 0;
    enter();
  });
  host.querySelector('#resume')?.addEventListener('click', close);
  host.querySelector('#record-play')?.addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    lab.setPrivacyOverride(on);
    lab.setTelemetryOff(!on);
  });
  host.querySelector('#fullscreen')?.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  });
  host.querySelector('#to-title')?.addEventListener('click', async () => {
    if (!(await writeSave())) {
      let warning = host.querySelector<HTMLElement>('#save-warning');
      if (!warning) {
        warning = document.createElement('p');
        warning.id = 'save-warning';
        warning.setAttribute('role', 'alert');
        host.querySelector('.menu-rows')?.before(warning);
      }
      warning.textContent = 'This hill could not be saved. Keep it open and try again.';
      return;
    }
    host.querySelector('#menu-new-confirm')?.removeAttribute('hidden');
    host.querySelector('#to-title')?.setAttribute('hidden', '');
  });
  host.querySelector('#menu-new-no')?.addEventListener('click', () => {
    host.querySelector('#menu-new-confirm')?.setAttribute('hidden', '');
    host.querySelector('#to-title')?.removeAttribute('hidden');
    host.querySelector<HTMLElement>('#to-title')?.focus();
  });
  host.querySelector('#menu-new-yes')?.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    await beginNewHill(host.querySelector<HTMLElement>('#menu-new-confirm') ?? host);
    if (button.isConnected) button.disabled = false;
  });
  host.querySelector('#send')?.addEventListener('click', () => {
    host.dataset.kind = 'feedback';
    showFeedback(host, () => {
      if (host.id === 'drawer') openBook();
      else titleMenu();
    });
  });
  for (const b of host.querySelectorAll<HTMLElement>('[data-open]'))
    b.addEventListener('click', () => openBook(b.dataset.open));
}
function titleMenu() {
  const host = document.getElementById('title-drawer');
  if (!host) return;
  host.hidden = false;
  host.dataset.kind = 's';
  host.innerHTML = `<div class="sheet"><div class="who"><b>Game menu</b><button id="title-menu-x" aria-label="Close menu">×</button></div>${menuRows()}</div>`;
  const close = () => {
    host.hidden = true;
  };
  host.querySelector('#title-menu-x')?.addEventListener('click', close);
  bindMenu(host, close);
  // Reading rows belong to the current hill; enter it before opening a reading.
  for (const b of host.querySelectorAll<HTMLElement>('[data-open]'))
    b.addEventListener('click', async () => {
      const sv = await store.get<Saved>(SAVE_KEY);
      if (sv) {
        g = await continuity.localLoad(sv.value);
        speedIx = 1;
        enter();
        openBook(b.dataset.open);
      }
    });
}
function openBook(tab = 's') {
  feedbackCleanup?.();
  closeCell(false);
  bellReading = false;
  const d = document.getElementById('drawer');
  if (!d || !g) return;
  if (tab === 's') void writeSave();
  menuOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  paint.selected = null;
  personOpener = null;
  const s = g.s;
  const notes = s.notes
    .filter((n) => n.weight >= 1)
    .slice(-60)
    .reverse();
  const newestSafety = notes.find(
    (n) => n.kind === 'raid' || n.kind === 'hurt' || (n.kind === 'dig' && /shaft|riders|door/i.test(n.text)),
  );
  const entry = (n: Note) =>
    `<p class="${n.weight >= 2 ? 'heavy' : ''}"><span class="soft small">${esc(hillDate(n.at))}</span><br>${esc(displayWords(n.text))}</p>`;
  const alive = s.people.filter((p) => p.body.alive);
  const below = alive.filter((p) => yOf(positionAt(s, p.id, s.minute)) >= SURF);
  const done = GOALS.filter((x) => s.goals[x.id] !== undefined);
  const householdRows = (members: Person[]) =>
    s.houses
      .map((hs) => {
        const people = members.filter((p) => hs.members.includes(p.id));
        return people.length
          ? `<section class="household"><b>${esc(hs.name)}</b>${people.map((p) => `<div class="shelter-row"><button class="link" data-who="${p.id}">${esc(p.name)}</button><div class="small" data-shelter-person="${p.id}"></div></div>`).join('')}</section>`
          : '';
      })
      .join('');
  const heading =
    tab === 'p'
      ? 'The village'
      : tab === 'j'
        ? 'Journal'
        : tab === 'd'
          ? 'What the village has done'
          : 'Game menu';
  d.dataset.kind = tab;
  d.innerHTML = `<div class="sheet"><div class="who"><b>${heading}</b><button class="x" id="bookx" aria-label="Close">×</button></div><div id="sheet-body" tabindex="0" role="region" aria-label="${heading}">${
    tab === 's'
      ? menuRows()
      : tab === 'j'
        ? `<button data-open="d">What the village has done</button>${newestSafety ? `<p id="newest-safety"><b>Latest safety entry</b><br>${esc(displayWords(newestSafety.text))}</p>` : ''}${notes.slice(0, 8).map(entry).join('')}<details><summary>Earlier journal entries</summary>${notes.slice(8).map(entry).join('')}</details>`
        : tab === 'd'
          ? `<p id="growth-record">${esc(growthWords(s))}</p><p>${done.map((x) => `✓ ${esc(displayWords(x.text))}`).join('<br>') || 'No goals are complete yet.'}</p>`
          : `<h3>People below ground</h3>${householdRows(below) || '<p>No one is below yet.</p>'}<h3>People above ground</h3><p id="shelter-summary"></p>${householdRows(alive.filter((p) => !below.includes(p))) || '<p>No one is above ground.</p>'}<p class="soft">There ${alive.length === 1 ? 'is' : 'are'} ${souls(alive.length)} in the village. ${s.stats.died ? `${NUM[s.stats.died] ?? s.stats.died} ${s.stats.died === 1 ? 'person has' : 'people have'} died.` : 'No one has died.'}</p>`
  }</div></div>`;
  hideOtherSheets('drawer');
  d.hidden = false;
  updateShelter();
  document.getElementById('bookx')?.addEventListener('click', closeBook);
  bindMenu(d, closeBook);
  for (const b of d.querySelectorAll<HTMLButtonElement>('[data-who]'))
    b.addEventListener('click', () => {
      personOpener = b;
      paint.selected = b.dataset.who ?? null;
      d.hidden = true;
      card();
      document.getElementById('cardx')?.focus();
    });
  document.getElementById('bookx')?.focus();
}

async function writeSave(): Promise<boolean> {
  if (!g) return true;
  lastSaved = performance.now();
  dirty = false;
  const saved = { ...save(g), savedAt: Date.now() };
  const stored = await store.put(SAVE_KEY, saved);
  if (stored) lab.captureSave(saved);
  else dirty = true;
  return stored;
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
    syncButtons();
    chrome();
  },
  order,
};
