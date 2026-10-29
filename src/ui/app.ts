/**
 * The page around the hill: a title, the cross-section, the keeper's tools, the bell, the speed, a person card
 * and the Game menu (journal, people, saves, download). Time runs continuously; the Game menu pauses it.
 */
import { version as FRAMEWORK_VERSION } from '@adam0white/human-framework/package.json';
import { type PhoneStage, phoneStage, telemetryNotice } from '@adam0white/lab-kit';
import { adaTalkUnavailable, adaTalkWords } from '../sim/ada-talk.ts';
import { amendsUnavailable, amendsWords } from '../sim/bell-amends.ts';
import { DAY, hourWords } from '../sim/calendar.ts';
import { canInviteCutDiscussion, discussionWords } from '../sim/cut-discussion.ts';
import {
  act,
  catchUp,
  GAME_VERSION,
  type Game,
  load,
  newGame,
  type Order,
  type Saved,
  save,
  TEXT_VERSION,
} from '../sim/game.ts';
import {
  AIR_REACH,
  cellsWithUse,
  diggable,
  H,
  idx,
  K,
  neighbours,
  SURF,
  THEIR_X,
  USE,
  W,
  xOf,
  yOf,
} from '../sim/grid.ts';
import { ageYears, type PersonReading as Person } from '../sim/hf4.ts';
import { puzzleUnavailable, puzzleWords } from '../sim/maryam-puzzle.ts';
import { newcomerEligible, newcomerWords } from '../sim/newcomer-exchange.ts';
import { VISIT_TERMS } from '../sim/people.ts';
import { rallyBlock } from '../sim/rally.ts';
import { canReplyToRefusal, refusalReplyWords } from '../sim/refusal-reply.ts';
import {
  doorRequest,
  type ResidentRequests,
  requestWords,
  residualEnabled,
} from '../sim/resident-requests.ts';
import { trialUnavailable, trialWords } from '../sim/tariq-trial.ts';
import { INVITATIONS } from '../sim/visits.ts';
import {
  activeRaid,
  advanceFrame,
  airAndLight,
  digProgress,
  goalsFor,
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
import { doorCandidates, doorDetailWords, doorWords } from './door-help.ts';
import { cellAt, draw, type Ink, type Paint, personAt, readInk, type View } from './draw.ts';
import { eventHistory, historyTime } from './event-history.ts';
import { exposureWords } from './exposure.ts';
import { openFeedback } from './feedback.ts';
import { awayWords, growthWords } from './growth.ts';
import { colonyWords, FIRST_CHALK, PURPOSE } from './guidance.ts';
import {
  cellLocationWords,
  grainHelpWords,
  markedWorkWords,
  personGrainWords,
  ROUTE_HELP,
  readyMark,
  waterHelpWords,
} from './known-work.ts';
import { lab } from './lab.ts';
import { invitationWords, personHelpWords } from './person-help.ts';
import { type PlanSafety, planSafety } from './plan-safety.ts';
import {
  eventStamp,
  type InvitationObservation,
  invitationNotices,
  invitationObservation,
  playbackRate,
} from './playback.ts';
import { bellShelterWords, bellStateWords, bellThreatWords } from './room-safety.ts';
import { chalkFeedback, selectedPlan, yusufPlanWords } from './selected-plan.ts';
import {
  compactShelterWords,
  sleepingCapacity,
  sleepingCapacityWords,
  sleepingRoomWords,
} from './shelter.ts';
import * as store from './store.ts';
import { activityWords, displayWords, settingWords, speechWords } from './words.ts';
import {
  journalView,
  observeMarkedWork,
  observeSetups,
  type SetupObservation,
  type WorkObservation,
  workDigestWords,
} from './work.ts';

type Tool = 'look' | 'chalk' | 'erase' | 'store' | 'beds' | 'lamp' | 'door';
const SPEEDS = [1, 4, 16] as const;
const SPEED_NAMES = ['Slow', 'Steady', 'Fast'];
const MS_PER_MIN = 20000 / DAY;
let speedIx = 0;
const SAVE_KEY = 'hill';

let g: Game | null = null;
let observedGame: Game | null = null;
let observedWork: WorkObservation | undefined;
let observedSetups: SetupObservation | undefined;
let observedInvitations: InvitationObservation | undefined;
/** Display only, this sitting: changes to what the keeper set up, shown at the top of the Journal. */
let seenWhileWatching: { at: number; text: string }[] = [];
let generation = 0;
let gameGeneration = 0;
function replaceGame(game: Game, expected = ++generation): boolean {
  if (expected !== generation) return false;
  g = game;
  framePending = null;
  gameGeneration = expected;
  hiddenAt = null;
  return true;
}
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
let newcomerPlace: number | undefined;
let framedPerson: string | null = null;
let zoomCell: number | null = null;
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
let checkpointPending = false;
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
let returnReading = false;
let planCell: number | null = null;
let lastReading: { title: string; words: string; context?: string; cell?: number } | null = null;
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
const footer = `<div class="footer">${'<a class="mark" href="https://human.adamwhite.work">◇ human framework</a>'}<br>People by the Human Framework. Version ${FRAMEWORK_VERSION}.</div>`;
const playInfo = `<p>You are the keeper. The hill is the stone beneath the village. Open ground means space already dug out. Furnishings are the stores, beds, lamps and stone doors you mark there.</p><p>Draw a dashed outline with chalk to mark stone for digging. People choose when to dig. They need fresh air and light.</p><p>Tap one stone square touching the cellar, or drag a connected chalk line from it. A dashed mark is a plan, not a finished passage.</p><p>Use the Furnish menu to mark open ground for grain stores, sleeping places, lamps or doors.</p><p>A door needs a passage one square wide, with open ground on two opposite sides. You can mark up to three doors.</p><p>Filled circles show marked sleeping places. Empty circles show how many more places are needed. Tap the people count to check who riders could reach.</p><p>${ROUTE_HELP}</p><p>Water comes from the spring until digging opens a well in damp stone. People choose when to carry water to the hearth jars.</p>`;
function topbar(titlePage = false) {
  return `<header class="topbar"><div class="bar-words">${titlePage ? '<a target="_top" href="https://human.adamwhite.work/games/">All games</a>' : '<span id="when"></span>'}</div><button class="info" aria-label="Information" popovertarget="hill-info">i</button><button id="book" aria-label="Game menu">≡<span class="menu-label"> Menu</span></button></header><div id="hill-info" class="info-popover" popover="auto"><div class="who"><b>${titlePage ? 'The hill' : 'Chalk and marks'}</b><button popovertarget="hill-info" popovertargetaction="hide" aria-label="Close information">×</button></div>${titlePage ? '<p>Riders burned two villages. Your refuge starts in the cellar under Master Yusuf’s house.</p><p>You are the keeper. You have the chalk and the bell. You mark where work is needed. Each person chooses what to do.</p><p>Use one finger to draw chalk marks or inspect the hill. Use two fingers to move the view.</p><p>A year has 365 days. Year 1 begins on 19 August.</p>' : playInfo}</div>`;
}

// ---------- start ----------

export async function start() {
  if (location.pathname === '/file/') {
    openFilePage();
    return;
  }
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
      const expected = generation;
      if (current) await writeSave();
      return g === current && generation === expected ? runOf() : null;
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
  const expected = generation;
  const sv = await store.get<Saved & { savedAt?: number }>(SAVE_KEY);
  if (expected !== generation) return;
  title(sv?.value ?? null, sv?.at ?? 0);
}

function title(sv: (Saved & { savedAt?: number }) | null, at: number) {
  lab.screen('title');
  feedbackCleanup?.();
  const compatible =
    sv &&
    sv.framework === FRAMEWORK_VERSION &&
    (sv.game === GAME_VERSION || sv.game === '0.7.0') &&
    sv.textVersion === TEXT_VERSION;
  cancelAnimationFrame(raf);
  canvas = null;
  stage?.destroy();
  sceneObserver?.disconnect();
  app().innerHTML = `<div class="page">${topbar(true)}
    <div class="title-art"><canvas id="title-cv" aria-label="The village above its cellar"></canvas><h1>The Warren</h1></div>
    <p class="title-goal">${PURPOSE}</p>
    ${sv && !compatible ? '<p class="soft">This hill was saved by an older version and cannot open here. Start fresh with Begin. You can download the old hill to keep it. Your people across games are kept.</p><button id="download-old-run">Download this saved hill</button>' : ''}
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
  document.getElementById('download-old-run')?.addEventListener('click', () => {
    if (sv) downloadSaved(sv, 'the-warren-saved-hill.json');
  });
  document.getElementById('cont')?.addEventListener('click', async () => {
    if (!sv) return;
    const expected = ++generation;
    try {
      const prepared = await continuity.localLoad(sv);
      if (!replaceGame(prepared, expected)) return;
      const stamp = sv.savedAt ?? at;
      const elapsed = Number.isFinite(stamp) && stamp > 0 ? Math.max(0, Math.floor(Date.now() - stamp)) : 0;
      catchUp(prepared, elapsed);
      speedIx = 1;
      enter();
      if (prepared.s.next?.away) {
        showReading('While you were away', awayWords(prepared.s));
        returnReading = true;
        void writeSave();
      }
    } catch (error) {
      if (expected === generation) {
        gameGeneration = expected;
        dirty = true;
      }
      startError(error, 'The saved hill could not be opened.');
    }
  });
  document.getElementById('new')?.addEventListener('click', () => {
    if (sv) {
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

function openFilePage() {
  ink = readInk();
  app().innerHTML = `<main class="title"><h1>Open a saved hill</h1><p>Choose a Warren run you downloaded. It plays here without replacing the hill saved on this device or changing shared people.</p><p>Keep your original file. Older versions may need a fresh hill.</p><input id="hill-file" type="file" accept=".json,application/json"><p id="file-status" role="status"></p><details hidden id="file-debug"><summary>Debug</summary><pre id="file-detail"></pre></details><a href="/">Return to your hill</a></main>`;
  document.getElementById('hill-file')?.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    input.disabled = true;
    const status = document.getElementById('file-status');
    if (!status) return;
    status.textContent = 'Checking the saved hill and its history…';
    document.getElementById('file-debug')?.setAttribute('hidden', '');
    try {
      const expected = ++generation;
      const prepared = await continuity.fileLoad(file);
      if (!replaceGame(prepared, expected)) return;
      speedIx = 0;
      enter();
    } catch (error) {
      status.textContent =
        'This file cannot be opened in this version. Keep it and start fresh with a new game.';
      const detail = document.getElementById('file-detail');
      if (detail) {
        detail.textContent = String(error instanceof Error ? (error.cause ?? error) : error);
        document.getElementById('file-debug')?.removeAttribute('hidden');
      }
      input.disabled = false;
    }
  });
}

async function beginNewHill(errorHost?: HTMLElement): Promise<boolean> {
  const expected = ++generation;
  try {
    const prepared = await continuity.fresh(
      (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0,
      '0.7.0',
      'warren-rest/2',
    );
    if (expected !== generation) return false;
    await store.drop(SAVE_KEY);
    if (!replaceGame(prepared, expected)) return false;
  } catch (error) {
    if (expected === generation) {
      gameGeneration = expected;
      dirty = true;
    }
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
  const sharedUnavailable =
    error instanceof Error &&
    error.message ===
      'People across games are temporarily unavailable. Your shared records and current hill are unchanged.';
  status.textContent = sharedUnavailable
    ? error.message
    : `${message} Your saved hill has not been replaced. You can retry or open Feedback in the menu.`;
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
    <div class="goal-slot"><button class="goal" id="goal" aria-label="Current work and help"></button><div class="goal" id="raid-warning" hidden></div></div>
    <div class="scene lk-scene" id="scene"><canvas id="cv" tabindex="0" aria-label="The hill"></canvas>
      <div class="view-controls" role="group" aria-label="Hill view"><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="fit-hill" aria-label="Fit hill">⤢</button></div>
      <div class="lag soft" id="lag" hidden>The game is running as fast as this device allows.</div>
    </div>
    <div class="panel lk-sheet" aria-label="Hill actions"><div class="lk-sheet-body" id="inspection-body">
      <div class="card" id="card" hidden></div>
      <div class="card cell-detail" id="cell-detail" hidden><div class="who"><b id="cell-title">Reading</b><button class="x" id="cellx" aria-label="Close reading">×</button></div><p id="cell-words" role="region" aria-label="Full reading"></p><div id="resident-door-controls" hidden></div><div id="rally-controls" hidden><button id="rally-marks">Ask Master Yusuf to walk the marks with the diggers</button></div><div id="entrance-choice" hidden><button id="confirm-entrance">Plan this entrance</button><button id="cancel-entrance">Cancel</button></div><button id="connections" hidden aria-pressed="false">Show connections</button><p id="connection-words" hidden></p><details id="reading-context" hidden><summary>More ▸</summary><div id="door-context"></div></details></div>
      <div class="drawer" id="drawer" hidden></div>
      <div id="journal-tail"></div>
    </div>
    <div class="reading-actions"><button id="last-reading"><span id="event-sentence" aria-live="polite">${FIRST_CHALK}</span> ▸</button><button id="completed-work" hidden>Inspect completed digging ▸</button><button class="ticker" id="ticker">Journal ▸</button></div>
    <div class="lk-commit" id="hill-controls"><div class="tools" role="toolbar" aria-label="Tools">
      ${toolBtn('look', 'look', '◎')}${toolBtn('chalk', 'chalk', '□')}${toolBtn('erase', 'rub out', '⌫')}
      <button id="furnish" aria-expanded="false">furnish ▾</button><button class="bell" id="bell" title="Call people below. False alarms can weaken trust." aria-label="Bell. Call people below. False alarms can weaken trust.">bell</button></div>
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
  zoomCell = null;
  returnReading = false;
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
  document.getElementById('rally-marks')?.addEventListener('click', () => {
    if (!order({ verb: 'rally' })) {
      const why = g && rallyBlock(g.s);
      if (why) hint('rally-blocked', displayWords(why));
      showRally(rallyCell);
      return;
    }
    if (rallyCell === null) showCurrentHelp();
    else showPlan(rallyCell);
    chrome();
  });
  document.getElementById('bell')?.addEventListener('click', () => {
    // Quiet-hill confirmation stays in the UI until the keeper chooses to ring.
    // Ordinary reading keeps time moving; a different hill invalidates the button.
    if (g && !activeRaid(g.s) && !g.s.bell) {
      const offeredHill = g;
      showReading(
        'Ring the alarm?',
        'No smoke has been reported. This is an alarm for riders, not a call to work. A false bell can weaken trust. Ring it anyway?',
        false,
      );
      const controls = document.createElement('div');
      controls.id = 'bell-confirm-controls';
      controls.innerHTML =
        '<button id="confirm-bell">Ring the alarm</button><button id="cancel-bell">Keep quiet</button>';
      document.getElementById('inspection-body')?.append(controls);
      controls.querySelector('#cancel-bell')?.addEventListener('click', () => {
        controls.remove();
        document.getElementById('cellx')?.click();
      });
      controls.querySelector('#confirm-bell')?.addEventListener('click', () => {
        if (g !== offeredHill) return;
        controls.remove();
        if (order({ verb: 'bell' })) {
          bellReading = true;
          showBellReading();
          chrome();
        }
      });
      return;
    }
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
  document
    .getElementById('book')
    ?.addEventListener('click', (event) => openBook('s', event.currentTarget as HTMLElement));
  document
    .getElementById('shelter-check')
    ?.addEventListener('click', (event) => openBook('p', event.currentTarget as HTMLElement));
  document.getElementById('zoom-in')?.addEventListener('click', () => zoomView(2.2));
  document.getElementById('zoom-out')?.addEventListener('click', () => zoomView(1 / 2.2));
  document.getElementById('fit-hill')?.addEventListener('click', () => {
    if (!g) return;
    zoomCell = null;
    focusCell = null;
    Object.assign(view, baseView(g.s, view.w, view.h));
    clampView();
  });
  document.getElementById('cellx')?.addEventListener('click', () => {
    if (g?.s.next?.attention) {
      order({ verb: 'acknowledge' });
      dirty = true;
    }
    closeCell();
  });
  document.getElementById('cancel-entrance')?.addEventListener('click', () => closeCell());
  document.getElementById('connections')?.addEventListener('click', () => {
    paint.connections = !paint.connections;
    updateConnections();
  });
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
  document.getElementById('goal')?.addEventListener('click', showCurrentHelp);
  document.getElementById('ticker')?.addEventListener('click', () => openBook('j'));
  document.getElementById('last-reading')?.addEventListener('click', () => {
    if (lastReading?.title === 'Bell call') {
      bellReading = true;
      showBellReading();
    } else if (lastReading) {
      const saved = lastReading;
      showReading(saved.title, saved.words, true, false, saved.cell);
      if (saved.context) {
        readingContext(saved.context);
        if (lastReading) lastReading.context = saved.context;
      }
    } else if (document.getElementById('event-sentence')?.textContent === FIRST_CHALK) showCurrentHelp();
    else showReading('Latest word', document.getElementById('event-sentence')?.textContent ?? FIRST_CHALK);
  });
  document.getElementById('completed-work')?.addEventListener('click', () => {
    if (!g) return;
    const cell = observedWork?.completed.at(-1);
    if (cell === undefined) return;
    showReading('Completed marked digging', workDigestWords(g.s, observedWork), true, false, cell);
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

function showCurrentHelp() {
  if (!g) return;
  const s = g.s;
  if (!s.stats.dug && !s.hill.chalk.some(Boolean) && !waterWords(s).includes('dry')) {
    focusCell = idx(17, SURF + 3);
    view.cs = Math.max(view.cs, Math.min(36, view.w / 10));
    view.x = 17.5 - view.w / view.cs / 2;
    view.y = Math.max(0, SURF + 3.5 - view.h / view.cs / 2);
    clampView();
    showReading(
      'Start at the cellar',
      'You are the keeper. The cellar is the lit room at the bottom of the entrance stair. Choose chalk. Tap a stone square touching that room, or drag a connected line from its wall. Open ground means space already dug out.',
    );
    return;
  }
  const dig = s.hill.chalk.some(Boolean) ? markedWorkWords(s) : 'Choose chalk to plan more digging.';
  const supply = `${grainHelpWords(s)} ${waterHelpWords(s)}`;
  // A stalled plan the keeper can act on leads, so the ask sits next to the words that explain it.
  showReading('Current work and water', rallyBlock(s) ? `${supply} ${dig}` : `${dig} ${supply}`);
  showRally(null);
  readingContext(
    `${ROUTE_HELP} First frost begins on 2 December in this game calendar. ${goalsFor(s)
      .filter((goal) => goal.shown(s) && s.goals[goal.id] === undefined)
      .map((goal) => displayWords(goal.text))
      .join(' ')}`,
  );
}

/** The keeper's ask appears only where a ready mark waits on people whose refuge goal has faded. */
let rallyCell: number | null = null;
function showRally(cell: number | null) {
  const el = document.getElementById('rally-controls');
  if (!el || !g) return;
  rallyCell = cell;
  el.hidden = !!rallyBlock(g.s) || !readyMark(g.s, cell ?? undefined);
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
  const guidance = root?.querySelector(':scope > .goal-slot')?.getBoundingClientRect();
  // Phone help occupies its own strip above the canvas, never a person or chalk target.
  const controlsHeight =
    guidance && guidance.left < sceneBounds.right && guidance.right > sceneBounds.left
      ? Math.max(0, guidance.bottom - sceneBounds.top)
      : 0;
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
  canvas.style.marginTop = `${controlsHeight}px`;
  const oldWidth = view.w;
  view.w = r.width;
  view.h = r.height;
  // A width change keeps the hill in view: a new device size refits the dug hill, a small change keeps the centre.
  if (oldWidth > 0 && r.width !== oldWidth) {
    if (g && Math.max(oldWidth, r.width) / Math.min(oldWidth, r.width) > 1.5)
      Object.assign(view, baseView(g.s, r.width, r.height));
    else view.x += (oldWidth - r.width) / (2 * view.cs);
  }
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
  const target = focusCell ?? zoomCell;
  const cx = target === null ? view.x + view.w / view.cs / 2 : xOf(target) + 0.5;
  const cy = target === null ? Math.max(SURF + 3, view.y + view.h / view.cs / 2) : yOf(target) + 0.5;
  view.cs = Math.max(10, Math.min(72, view.cs * factor));
  view.x = cx - view.w / view.cs / 2;
  view.y = cy - view.h / view.cs / 2;
  clampView();
}

function order(o: Order): boolean {
  if (!g) return false;
  const ok = act(g, o);
  framePending = null;
  if (ok) dirty = true;
  return ok;
}

// ---------- the loop ----------

function sEditionLegacy() {
  return g?.s.edition !== '0.7.0';
}

function raidDecision() {
  const raid = g && activeRaid(g.s);
  return raid && !answeredRaids.has(raid.smoke) ? raid : null;
}

/** Menu pages, their person pages and notebook/privacy dialogs hold only playback. */
function menuHoldsTime(): boolean {
  if (g?.s.edition === '0.7.0')
    return (
      !!document.querySelector(
        '#drawer[data-kind="s"]:not([hidden]), #drawer[data-kind="p"]:not([hidden]), #drawer[data-kind="feedback"]:not([hidden]), .hflab-veil, #feedback-host:not([hidden])',
      ) ||
      (!!personOpener?.isConnected && !document.getElementById('card')?.hidden)
    );
  return (
    !!document.querySelector('#drawer:not([hidden]), .hflab-veil, #feedback-host:not([hidden])') ||
    !!document.querySelector(':popover-open') ||
    (!!personOpener?.isConnected && !document.getElementById('card')?.hidden)
  );
}

let framePending: { before: string; day: number; alive: number; raid: boolean } | null = null;

function frame(now: number) {
  raf = requestAnimationFrame(frame);
  if (!g || !ctx) return;
  const elapsed = Math.max(0, now - last);
  const dt = Math.min(250, elapsed);
  const held = menuHoldsTime() || (sEditionLegacy() && (isReading() || !!raidDecision()));
  if (held && readUntil > last) readUntil += elapsed;
  last = now;
  const s = g.s;
  const menuHeld = menuHoldsTime();
  const reading = isReading();
  const awaitingReading = returnReading;
  const rate =
    menuHeld || awaitingReading || checkpointPending
      ? 0
      : playbackRate(
          reading || !!document.querySelector(':popover-open'),
          !!raidDecision(),
          now < readUntil,
          ((SPEEDS[speedIx] ?? 1) * 1000) / MS_PER_MIN,
          s.edition === '0.7.0',
        );
  if (rate === 0) disp = s.minute;
  else disp += (dt * rate) / 1000;
  const t0 = performance.now();
  while (rate > 0 && (framePending || s.minute + QUANTUM <= disp) && performance.now() - t0 < 10) {
    if (!framePending) {
      if (s.next?.attention && now >= readUntil) order({ verb: 'acknowledge' });
      framePending = {
        before: eventStamp(s),
        day: Math.floor(s.minute / DAY),
        alive: s.people.filter((p) => p.body.alive).length,
        raid: !!raidDecision(),
      };
    }
    if (!advanceFrame(s)) break;
    const completed = framePending;
    framePending = null;
    if (
      s.people.some((p) => (s.flags[`released:${p.id}`] ?? 0) >= s.minute - QUANTUM + 1 && !p.activity) ||
      Math.floor(s.minute / DAY) !== completed.day ||
      s.people.filter((p) => p.body.alive).length !== completed.alive
    )
      void continuity.checkpoint();
    dirty = true;
    if ((!completed.raid && raidDecision()) || eventStamp(s) !== completed.before) {
      readUntil = now + 6000;
      disp = s.minute;
      chrome();
      break;
    }
    // One simulation boundary per animation frame, even when a quantum just ended.
    break;
  }
  lagging = disp > s.minute + 2 * QUANTUM;
  if (lagging) disp = s.minute + QUANTUM;
  paint.t = Math.min(disp, s.minute + QUANTUM);
  // The working view moves only through view controls, gestures or explicit person selection.
  draw(ctx, s, view, ink, paint);
  if (Math.floor(now / 250) !== Math.floor((now - dt) / 250)) chrome();
  if (dirty && !g?.fileOrigin && !checkpointPending && now - lastSaved > 30000) automaticCheckpoint();
}

/** The text around the scene: date, stores, goal, notes, the card. Updated a few times a second. */
function chrome() {
  if (!g) return;
  const s = g.s;
  const when = document.getElementById('when');
  if (when)
    when.textContent = `${(hourWords(s.minute) === 'night' && s.minute % DAY < 12 * 60 ? 'before dawn' : hourWords(s.minute)).replace(/^./, (c) => c.toUpperCase())} · ${hillDate(
      s.minute,
    )
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
      ? `The water jars are dry. ${cellsWithUse(s.hill, USE.well).length ? 'A discovered well supplies water below.' : activeRaid(s)?.stage === 'riders' ? 'Riders block fetching from the spring.' : 'Water comes from the spring.'} Tap here for water and current work.`
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
      words.textContent = `${bellThreatWords(s)} People choose whether to come. People below ground: ${below.length <= 4 ? below.map((p) => settingWords(p.name)).join(', ') || 'no one' : souls(below.length)}. People above ground: ${s.people.filter((p) => p.body.alive).length - below.length}.`;
  }
  const info = document.getElementById('hill-info');
  if (info && !info.matches(':popover-open')) {
    const raidInfo = !!pending;
    if (info.dataset.raid !== String(raidInfo)) {
      info.dataset.raid = String(raidInfo);
      info.innerHTML = `<div class="who"><b>${raidInfo ? 'Smoke and riders' : 'Chalk and marks'}</b><button popovertarget="hill-info" popovertargetaction="hide" aria-label="Close information">×</button></div>${raidInfo ? '<p>Smoke warns that riders may arrive in half a day or less.</p><p>The bell calls whoever hears it.</p><p>If you ring the bell when no riders come, people may trust it less.</p>' : playInfo}`;
    }
  }
  const rate = document.getElementById('clock-rate');
  if (rate)
    rate.textContent = checkpointPending
      ? 'Saving this hill. Time is paused.'
      : menuHoldsTime() || (sEditionLegacy() && reading0)
        ? 'Time is paused for reading.'
        : !sEditionLegacy() && (reading0 || pending)
          ? 'Time slows while you read.'
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
  const completedBefore = observedGame === g ? (observedWork?.completed.length ?? 0) : undefined;
  observedWork = observeMarkedWork(s, observedGame === g ? observedWork : undefined);
  const setups = observeSetups(s, observedGame === g ? observedSetups : undefined);
  setups.seen.push(...invitationNotices(s, observedGame === g ? observedInvitations : undefined));
  observedInvitations = invitationObservation(s);
  for (const c of observedWork.completed.slice(completedBefore ?? observedWork.completed.length))
    setups.seen.push(`Your marked square ${cellLocationWords(s, c)} is dug open now.`);
  observedSetups = setups.observation;
  if (observedGame !== g) seenWhileWatching = [];
  observedGame = g;
  if (setups.seen.length) {
    const words = setups.seen.join(' ');
    seenWhileWatching = [...seenWhileWatching, ...setups.seen.map((text) => ({ at: s.minute, text }))].slice(
      -12,
    );
    // Display only: retain the reading and use the ordinary nonzero reading slowdown.
    readUntil = performance.now() + 6000;
    hintUntil = performance.now() + 6000;
    if (event) event.textContent = settingWords(words);
  }
  if (event && performance.now() > hintUntil) {
    event.textContent = workDigestWords(s, observedWork);
  }
  const completedWork = document.getElementById('completed-work');
  if (completedWork) completedWork.hidden = observedWork.completed.length === 0;
  const bell = document.getElementById('bell') as HTMLButtonElement | null;
  if (bell) bell.classList.toggle('ringing', !!s.bell && s.minute < s.bell.until);
  const tail = document.getElementById('journal-tail');
  if (tail) {
    const view = journalView(s.notes);
    const routine = view.routine.filter((n) => n.weight >= 1).length;
    tail.innerHTML = `${view.fresh
      .filter((n) => n.weight >= 1)
      .slice(-8)
      .reverse()
      .map((n) => `<p>${esc(displayWords(n.text))}</p>`)
      .join(
        '',
      )}${routine ? `<p class="soft small">${routine === 1 ? 'One routine line repeats' : `${routine} routine lines repeat`} each day. The Journal keeps them together under Daily routine.</p>` : ''}`;
  }
  updateShelter();
  updateDoor();
  updatePlanPreview();
  if (bellReading) showBellReading();
  if (paint.selected) card();
}

function showReading(title: string, words: string, remember = true, preserveScroll = false, cell?: number) {
  document.getElementById('bell-confirm-controls')?.remove();
  paint.connectionCell = cell ?? null;
  returnReading = false;
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
  const residentControls = document.getElementById('resident-door-controls');
  if (residentControls) residentControls.hidden = true;
  const rallyControls = document.getElementById('rally-controls');
  if (rallyControls) rallyControls.hidden = true;
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
  updateConnections();
  void preserveScroll;
  if (remember) {
    lastReading = { title, words, cell };
    const reopen = document.getElementById('last-reading') as HTMLButtonElement | null;
    if (reopen) reopen.disabled = false;
  }
}

function updateConnections() {
  const button = document.getElementById('connections');
  const text = document.getElementById('connection-words');
  if (!button || !text || !g) return;
  button.hidden = paint.connectionCell == null;
  button.setAttribute('aria-pressed', String(!!paint.connections));
  button.textContent = paint.connections ? 'Hide connections' : 'Show connections';
  text.hidden = !paint.connections || paint.connectionCell == null;
  if (!text.hidden) text.textContent = selectedPlan(g.s, paint.connectionCell ?? -1).words;
}

function planReading(
  title: string,
  reading: PlanSafety,
  remember = true,
  preserveScroll = false,
  cell?: number,
) {
  showReading(title, reading.words, remember, preserveScroll, cell);
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
function receipt(text: string, context?: string, readingWords = text) {
  const cell = paint.connectionCell ?? undefined;
  closeCell(false);
  lastReading = { title: 'Reading', words: readingWords, context, cell };
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
  if (keep !== 'cell-detail') returnReading = false;
  for (const id of ['drawer', 'card', 'cell-detail']) {
    if (id === keep) continue;
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
  if (keep !== 'card') {
    paint.selected = null;
    framedPerson = null;
  }
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
  // Selecting a person may frame them once. Reading an updating card never follows them.
  if (framedPerson !== p.id) {
    framedPerson = p.id;
    focusCell = cell;
    const margin = Math.min(32, view.h / 4);
    const px = (xOf(cell) + 0.5 - view.x) * view.cs;
    const py = (yOf(cell) + 0.5 - view.y) * view.cs;
    if (px < margin || px > view.w - margin) view.x = xOf(cell) + 0.5 - view.w / view.cs / 2;
    if (py < margin || py > view.h - margin) view.y = yOf(cell) + 0.5 - view.h / view.cs / 2;
    clampView();
  }
  const house = houseOf(s, p.id);
  const doing = p.activity?.affordance.label ?? 'deciding what to do';
  const tr = s.trips[p.id];
  const walking = tr && paint.t < tr.workFrom && tr.cells.length > 1;
  const why = walking ? undefined : s.why?.[p.id];
  const about = s.notes.filter((n) => n.who === p.id).slice(-2);
  const newcomerHouse = s.houses.find((h) => /^h[1-9]\d*$/.test(h.id) && h.members.includes(p.id));
  const exchange = s.newcomerExchanges?.find((r) => r.who === p.id);
  const openPlaces = s.hill.kind.flatMap((kind, cell) =>
    kind === K.open && s.hill.known[cell] ? [cell] : [],
  );
  if (newcomerPlace === undefined || !openPlaces.includes(newcomerPlace)) newcomerPlace = openPlaces[0];
  const newcomerHtml = newcomerHouse
    ? `<section id="newcomer-exchange"><p id="newcomer-status">${esc(newcomerWords(s, p.id))}</p>${!exchange ? `<button id="invite-newcomer" ${newcomerEligible(s, p.id) ? '' : 'disabled'}>Invite ${esc(p.name)} to share a visit at the hearth</button>` : exchange.endedAt === undefined ? `${exchange.phase === 'choose' ? `<label for="newcomer-place">A visible open place to look at together</label><select id="newcomer-place">${openPlaces.map((c) => `<option value="${c}" ${c === newcomerPlace ? 'selected' : ''}>${esc(cellLocationWords(s, c))}</option>`).join('')}</select><button id="walk-newcomer">Ask to look at this place together</button>` : ''}<button id="withdraw-newcomer">Leave the exchange here</button>` : ''}</section>`
    : '';

  const html = `
    <div class="who">${personOpener ? `<button id="cardback" aria-label="Back to The village">← ${esc(p.name)}</button>` : `<b>${esc(p.name)}</b>`} <span class="soft">${Math.floor(ageYears(p))}, ${esc(house?.name ?? 'from elsewhere')}</span><button class="x" id="cardx" aria-label="Close">×</button></div>
        <p id="person-help">${esc(personHelpWords(s, p))}</p>
    <div>${esc(activityWords(doing, walking, p.name))}</div>
    ${s.next && ['yusuf', 'meryem'].includes(p.id) ? `<p>${esc(discussionWords(s))}</p>${canInviteCutDiscussion(s) ? '<button id="discuss-cut">Invite Yusuf Usta and Meryem to discuss the marked loose cut</button>' : s.next.discussion && s.next.discussion.endedAt === undefined ? '<button id="end-cut-discussion">Stop waiting for this discussion</button>' : ''}` : ''}
    ${residualEnabled(s) && ageYears(p) >= 18 ? `<p>${esc(s.next?.requests?.rest?.who === p.id ? requestWords(s, 'rest') : 'You can ask to talk about taking a break. The person may keep working or rest instead.')}</p>${s.next?.requests?.rest?.who === p.id && s.next.requests.rest.endedAt === undefined ? '<button data-withdraw="rest">Withdraw the rest request</button>' : '<button id="talk-rest">Ask to talk about rest</button>'}${!canReplyToRefusal(s, p.id) && !(s.refusalReply?.who === p.id && s.refusalReply.endedAt === undefined) && s.next?.discussion?.exchange && s.next.discussion.statements.some((r) => r.speaker === p.id) ? `<p>${esc(s.next?.requests?.disagreement?.who === p.id ? requestWords(s, 'disagreement') : 'Both people heard the disagreement about the cut. You can invite another conversation. You may leave or change the chalk yourself.')}</p>${s.next?.requests?.disagreement?.who === p.id && s.next.requests.disagreement.endedAt === undefined ? '<button data-withdraw="disagreement">Withdraw the conversation request</button>' : '<button id="talk-disagreement">Ask to talk after the disagreement</button>'}` : ''}` : ''}
    ${p.id === 'kian' && (s.edition === '0.6.0' || s.edition === '0.7.0') ? `<section id="ada-conversation"><p id="ada-talk-status">${esc(adaTalkWords(s))}</p>${s.adaTalks?.at(-1)?.endedAt === undefined && s.adaTalks?.length ? '<button id="withdraw-ada-talk">Stop waiting for this conversation</button>' : `<button id="ask-ada" ${adaTalkUnavailable(s) ? 'disabled' : ''}>Ask Kian about Ada</button>${adaTalkUnavailable(s) ? `<p>${esc(adaTalkUnavailable(s)!)}</p>` : ''}`}</section>` : ''}
    ${p.id === 'tariq' ? `<section id="tariq-trial"><p>${esc(trialWords(s))}</p>${s.tariqTrial ? (s.tariqTrial.endedAt === undefined ? '<button id="withdraw-tariq-trial">Stop waiting for the boat trial</button>' : '') : `<button id="tariq-trial-middle" ${trialUnavailable(s) ? 'disabled' : ''}>Try the load in the middle</button><button id="tariq-trial-edge" ${trialUnavailable(s) ? 'disabled' : ''}>Try the load at the edge</button>`}</section>` : ''}
    ${p.id === 'maryam' ? `<section id="maryam-puzzle"><p id="maryam-puzzle-status">${esc(puzzleWords(s))}</p>${s.maryamPuzzle ? (s.maryamPuzzle.endedAt === undefined ? '<button id="withdraw-maryam-puzzle">Stop waiting for the exercise</button>' : '') : `<button id="maryam-puzzle-loosen" ${puzzleUnavailable(s) ? 'disabled' : ''}>Ask Maryam to loosen the crossing</button><button id="maryam-puzzle-draw" ${puzzleUnavailable(s) ? 'disabled' : ''}>Ask Maryam to draw the crossing toward the ring</button>`}</section>` : ''}
    ${canReplyToRefusal(s, p.id) || s.refusalReply?.who === p.id ? `<section id="contextual-refusal"><p>${esc(refusalReplyWords(s))}</p>${canReplyToRefusal(s, p.id) ? '<button id="reply-refusal">Invite a reply to the heard disagreement</button>' : s.refusalReply?.endedAt === undefined ? '<button id="withdraw-refusal-reply">Stop waiting for this reply</button>' : ''}</section>` : ''}
    ${s.bellAmends?.who === p.id || !amendsUnavailable(s, p.id) ? `<section id="bell-amends"><p>${s.bellAmends?.who === p.id ? esc(amendsWords(s)) : 'You can ask to apologise for the false bell at the hearth. The earlier bell and its consequences remain.'}</p>${s.bellAmends ? (s.bellAmends.endedAt === undefined ? '<button id="withdraw-bell-amends">Stop waiting for the apology</button>' : '') : '<button id="ask-bell-amends">Ask to apologise for the false bell</button>'}</section>` : ''}
    ${personGrainWords(s, p.id) ? '<button id="follow-grain-work">Follow this grain work</button>' : ''}
    ${newcomerHtml}
    <div class="shelter-person">${esc(exposureWords(s, p))}</div>
    ${(s.edition === '0.5.0' || s.edition === '0.6.0' || s.edition === '0.7.0') && VISIT_TERMS[p.id] ? `<p id="invitation-status">${esc(displayWords(invitationWords(s, p)))}</p><p>${esc(displayWords(VISIT_TERMS[p.id]!))}</p><button id="visit-person" ${s.flags[`visit:${p.id}`] || s.flags[`invitation-pending:${p.id}`] ? 'disabled' : ''}>${esc(INVITATIONS[p.id]!)}</button><p class="soft small">${esc(s.flags[`released:${p.id}`] ? `${p.name} no longer works on the refuge. Promises and household duties still apply.` : `Releasing ${p.name} stops their digging and other work on the refuge for the rest of this hill.${p.id === 'yusuf' ? ' He will no longer walk the marks with the diggers when you ask.' : ''} It cannot be taken back. Promises and household duties still apply.`)}</p><button id="release-person" ${s.flags[`released:${p.id}`] ? 'disabled' : ''}>${esc(`Release ${p.name} from refuge work`)}</button>` : ''}

    <details id="person-context"><summary id="person-context-toggle">More activity and words</summary>
    ${why ? `<div class="hand">“${esc(speechWords(why))}”</div>` : ''}
    ${about.map((n) => `<div class="soft small">${esc(displayWords(n.text))}</div>`).join('')}
</details>${p.id === 'kian' ? continuity.careControls() : ''}${continuity.handoffControls(p.id)}`;
  if (el.dataset.html !== html) {
    const focused = document.activeElement?.id;
    const expanded = el.querySelector('details')?.open ?? false;
    const handoffExpanded = el.querySelector<HTMLDetailsElement>('[data-native-person]')?.open ?? false;
    el.dataset.html = html;
    el.innerHTML = html;
    continuity.bind(el);
    el.querySelector('#invite-newcomer')?.addEventListener('click', () => {
      if (!order({ verb: 'invite-newcomer', who: p.id }))
        flash('The visit could not begin. The person may be busy with another request.');
      card();
    });
    el.querySelector<HTMLSelectElement>('#newcomer-place')?.addEventListener('change', (event) => {
      newcomerPlace = Number((event.target as HTMLSelectElement).value);
    });
    el.querySelector('#walk-newcomer')?.addEventListener('click', () => {
      if (newcomerPlace !== undefined && !order({ verb: 'walk-newcomer', who: p.id, cell: newcomerPlace }))
        flash('The first visit must finish before this walk. The place must still be visible and open.');
      card();
    });
    el.querySelector('#withdraw-newcomer')?.addEventListener('click', () => {
      order({ verb: 'withdraw-newcomer', who: p.id });
      card();
    });
    el.querySelector('#reply-refusal')?.addEventListener('click', () => {
      order({ verb: 'reply-refusal', who: p.id });
      card();
    });
    el.querySelector('#follow-grain-work')?.addEventListener('click', () => {
      if (!g) return;
      const words = personGrainWords(g.s, p.id);
      if (words) showReading(`${p.name}'s grain work`, words);
    });
    el.querySelector('#ask-bell-amends')?.addEventListener('click', () => {
      order({ verb: 'ask-bell-amends', who: p.id });
      card();
    });
    el.querySelector('#withdraw-bell-amends')?.addEventListener('click', () => {
      order({ verb: 'withdraw-bell-amends' });
      card();
    });
    el.querySelector('#withdraw-refusal-reply')?.addEventListener('click', () => {
      order({ verb: 'withdraw-refusal-reply' });
      card();
    });
    for (const handling of ['loosen', 'draw'] as const)
      el.querySelector(`#maryam-puzzle-${handling}`)?.addEventListener('click', () => {
        if (!g) return;
        const ok = order({ verb: 'try-maryam-puzzle', handling });
        card();
        if (!ok) flash(puzzleUnavailable(g.s) ?? 'The exercise could not begin.');
      });
    for (const load of ['middle', 'edge'] as const) {
      el.querySelector(`#tariq-trial-${load}`)?.addEventListener('click', () => {
        order({ verb: 'try-tariq-trial', load });
        card();
      });
    }
    el.querySelector('#withdraw-tariq-trial')?.addEventListener('click', () => {
      order({ verb: 'withdraw-tariq-trial' });
      card();
    });
    el.querySelector('#withdraw-maryam-puzzle')?.addEventListener('click', () => {
      order({ verb: 'withdraw-maryam-puzzle' });
      card();
    });
    for (const verb of ['ask-ada', 'withdraw-ada-talk'] as const)
      el.querySelector(`#${verb}`)?.addEventListener('click', () => {
        if (!g) return;
        const ok = order({ verb });
        dirty = true;
        card();
        if (!ok) flash(adaTalkUnavailable(g.s) ?? 'There is no pending conversation to withdraw.');
      });
    for (const verb of ['talk-rest', 'talk-disagreement'] as const)
      el.querySelector(`#${verb}`)?.addEventListener('click', () => {
        if (!g) return;
        const ok = order({ verb, who: p.id });
        dirty = true;
        card();
        if (!ok)
          flash(
            'The request could not begin. Another request, danger, or the companion’s absence may need attention first.',
          );
      });
    el.querySelectorAll<HTMLButtonElement>('[data-withdraw]').forEach((button) => {
      button.addEventListener('click', () => {
        if (g) order({ verb: 'withdraw-request', kind: button.dataset.withdraw as keyof ResidentRequests });
        dirty = true;
        card();
      });
    });
    for (const verb of ['discuss-cut', 'end-cut-discussion'] as const)
      el.querySelector(`#${verb}`)?.addEventListener('click', () => {
        if (g) {
          order({ verb });
          dirty = true;
          card();
        }
      });
    el.querySelector('#release-person')?.addEventListener('click', () => {
      if (g) {
        const ok = order({ verb: 'release', who: p.id });
        if (!ok) alert('This person cannot leave yet. Work, a duty, danger or care still needs them here.');
        dirty = true;
        card();
      }
    });
    el.querySelector('#visit-person')?.addEventListener('click', () => {
      if (g) {
        order({ verb: 'visit', who: p.id });
        dirty = true;
        card();
      }
    });
    const details = el.querySelector('details');
    if (details) details.open = expanded;
    const handoff = el.querySelector<HTMLDetailsElement>('[data-native-person]');
    if (handoff) handoff.open = handoffExpanded;
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
  if (paint.previewKind === 'beds') {
    planReading('Plan preview', planSafety(g.s, paint.preview, 'beds'), false);
    return;
  }
  const cell = [...paint.preview].at(-1);
  if (cell === undefined) return;
  const peek = document.getElementById('event-sentence');
  const limit =
    xOf(cell) >= THEIR_X
      ? 'This is the neighbours’ boundary. Chalk here may be refused.'
      : g.s.hill.known[cell] && g.s.hill.kind[cell] === K.bedrock
        ? 'This known grey rock cannot be cut.'
        : g.s.hill.kind[cell] === K.open
          ? 'This ground is already open. Chalk marks stone.'
          : '';
  if (peek)
    peek.textContent = `${limit} ${planSafety(g.s, paint.preview, paint.previewKind).words} ${g.s.hill.known[cell] ? markedWorkWords({ ...g.s, hill: { ...g.s.hill, chalk: g.s.hill.chalk.map((v, i) => (paint.preview.has(i) ? 1 : v)) } }, cell) : 'This stone is not yet known. The chalk does not reveal what lies inside.'} Chalk plans work; it supplies no light or air.`;
  hintUntil = performance.now() + 6000;
}

function commitPaint(entranceConfirmed = false) {
  if (!g) return;
  const cells = [...paint.preview];
  zoomCell = cells.at(-1) ?? null;
  paint.worldCell = zoomCell;
  paint.connectionCell = zoomCell;
  focusCell = null;
  const kind = paint.previewKind;
  paint.preview.clear();
  paint.previewKind = null;
  if (!cells.length || !kind) return;
  const h = g.s.hill;
  const beforeChalk = cells.map((c) => h.chalk[c] ?? 0);
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
    const accepted = order({ verb: 'chalk', cells, on: true });
    if (accepted) {
      const reading = planSafety(g.s, cells, 'chalk');
      const ack = chalkFeedback(
        accepted,
        beforeChalk,
        cells.map((c) => h.chalk[c] ?? 0),
      );
      const work = markedWorkWords(g.s, cells.at(-1));
      receipt(`${ack} ${work}`, `${ack} ${work} ${reading.context ?? ''}`, reading.words);
      return;
    }
    if (cells.length === 1 && h.chalk[cells[0] ?? 0]) {
      const removed = order({ verb: 'chalk', cells, on: false });
      receipt(
        chalkFeedback(
          removed,
          beforeChalk,
          cells.map((c) => h.chalk[c] ?? 0),
        ),
      );
    } else if (cells.every((c) => h.chalk[c])) receipt('The chalk is unchanged.');
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
    const removed = order({ verb: 'chalk', cells, on: false });
    receipt(
      chalkFeedback(
        removed,
        beforeChalk,
        cells.map((c) => h.chalk[c] ?? 0),
      ),
    );
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
  if (c >= 0 && s.hill.chalk[c] && s.hill.kind[c] !== K.open) {
    showPlan(c);
    return;
  }
  if (c >= 0 && (s.hill.use[c] === USE.beds || s.hill.use[c] === USE.door)) {
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
        ? grainHelpWords(g.s, c)
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
          ? g.s.edition === '0.7.0'
            ? 'Loose stone can fall and break furnishings beside the wall. The passage will stay open.'
            : 'This loose stone is quick to dig, but it can fall.'
          : k === K.seam
            ? 'Water seeps through this damp stone.'
            : 'This soft stone is easy to cut when freshly exposed.';
  if (g.s.edition === '0.7.0' && k !== K.open && h.chalk[c]) {
    const progress = digProgress(g.s, c);
    text +=
      progress > 0.7
        ? ' The cut is nearly through.'
        : progress > 0.25
          ? ' The cut is deepening.'
          : progress > 0.02
            ? ' Pick marks are opening the face.'
            : ' Nobody has cut into this wall yet.';
  }
  if (k !== K.open && h.chalk[c]) {
    const stand = neighbours(c).find((j) => h.kind[j] === K.open && yOf(j) >= SURF);
    if (stand !== undefined) text += airWords(stand);
  }
  if (h.use[c] === USE.door || h.use[c] === USE.beds) showDoor(c);
  else if (h.use[c] === USE.store) {
    showReading('Grain store', text, true, false, c);
    readingContext(
      'Use Look to inspect the passage. Use Store on open ground for more jars; Chalk marks stone for digging and Lamp marks light over open ground. People choose their own work.',
    );
  } else flash(text);
  void xOf;
  void idx;
}

function closeCell(focus = true) {
  returnReading = false;
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
  paint.connections = false;
  paint.connectionCell = null;
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
    const reading = planSafety(g.s, [doorCell], 'chalk');
    reading.words = `${markedWorkWords(g.s, doorCell)} ${reading.words} ${yusufPlanWords(g.s, doorCell)}`;
    planReading('Unbuilt plan', reading, true, true, doorCell);
    return;
  }
  if (planCell !== null) {
    showReading(
      'Excavated plan',
      `${planSafety(g.s, [doorCell], 'beds').words} This ground is open now. You still need to mark sleeping places.`,
      true,
      false,
      doorCell,
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
    lastReading = {
      title: g.s.hill.use[doorCell] === USE.beds ? 'Sleeping room' : 'Stone door',
      words,
      cell: doorCell,
    };
  }
  updateDoorContext(doorCell);
}

function updateDoorContext(cell: number) {
  if (!g) return;
  updateResidentDoor(cell);
  const context = document.getElementById('reading-context');
  const text = document.getElementById('door-context');
  const words =
    g.s.hill.use[cell] === USE.door
      ? doorDetailWords(g.s, cell)
      : (planSafety(g.s, [cell], 'beds').context ?? ROUTE_HELP);
  const label = context?.querySelector('summary');
  if (label) {
    label.textContent = 'More ▸';
    label.setAttribute(
      'aria-label',
      g.s.hill.use[cell] === USE.door ? 'More about this door' : 'Routes and rider reach',
    );
  }
  if (context) context.hidden = !words;
  if (text) text.textContent = settingWords(words);
}

/** Existing reading scroll/pacing owns these choices; no new pause or camera rule. */
function updateResidentDoor(cell: number) {
  const el = document.getElementById('resident-door-controls');
  if (!el || !g) return;
  const s = g.s;
  if (s.hill.use[cell] !== USE.door) {
    el.hidden = true;
    return;
  }
  const r = doorRequest(s);
  const pending = r?.endedAt === undefined && !!r;
  const quiet = !s.bell && !activeRaid(s);
  const candidates = doorCandidates(s, cell).filter((p) => ageYears(p) >= 18 && !s.flags[`released:${p.id}`]);
  const canRequest =
    quiet && !pending && !s.hill.doorWork[cell] && !s.hill.shut[cell] && candidates.length > 0;
  const html = `<p>${esc(r?.cell === cell ? requestWords(s, 'door') : 'You can ask an adult to test this finished door during quiet time. Closing and reopening each take work. The door stays shut until someone reopens it.')}</p>${pending && r.cell === cell ? '<button id="withdraw-door-test">Withdraw the door request</button>' : canRequest ? `<label>Ask a reachable adult <select id="door-tester">${candidates.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><button id="test-door">Ask for a door test</button>` : '<p>A test needs a finished open door, quiet time, and an adult who can reach it. Another pending door request must finish or be withdrawn first.</p>'}`;
  el.hidden = false;
  if (el.dataset.html === html) return;
  const selected = el.querySelector<HTMLSelectElement>('select')?.value;
  el.dataset.html = html;
  el.innerHTML = html;
  if (selected && el.querySelector(`option[value="${selected}"]`))
    el.querySelector<HTMLSelectElement>('select')!.value = selected;
  el.querySelector('#test-door')?.addEventListener('click', () => {
    const who = el.querySelector<HTMLSelectElement>('#door-tester')?.value;
    if (!g || !who) return;
    const ok = order({ verb: residualEnabled(g.s) ? 'test-door' : 'try-door', who, cell });
    dirty = true;
    updateResidentDoor(cell);
    if (!ok)
      flash('This door test could not begin. Check the current request and the person’s reachable route.');
  });
  el.querySelector('#withdraw-door-test')?.addEventListener('click', () => {
    if (g) {
      if (g.s.doorTrials?.at(-1) === doorRequest(g.s)) order({ verb: 'withdraw-door-trial' });
      else order({ verb: 'withdraw-request', kind: 'door' });
    }
    dirty = true;
    updateResidentDoor(cell);
  });
}

function showPlan(cell: number) {
  if (!g) return;
  closeCard();
  bellReading = false;
  planCell = cell;
  doorCell = cell;
  paint.connectionCell = cell;
  paint.worldCell = cell;
  const reading = planSafety(g.s, [cell], 'chalk');
  reading.words = `${markedWorkWords(g.s, cell)} ${reading.words} ${yusufPlanWords(g.s, cell)}`;
  planReading('Unbuilt plan', reading, true, false, cell);
  showRally(cell);
  document.getElementById('cellx')?.focus();
}

function showDoor(cell: number) {
  if (!g) return;
  closeCard();
  doorCell = cell;
  paint.connectionCell = cell;
  paint.worldCell = cell;
  const beds = g.s.hill.use[cell] === USE.beds;
  const title = document.getElementById('cell-title');
  if (title) title.textContent = beds ? 'Sleeping room' : 'Stone door';
  const words = beds ? sleepingRoomWords(g.s, cell) : doorWords(g.s, cell, lightAt(cell));
  flash(words);
  doorCell = cell;
  showReading(beds ? 'Sleeping room' : 'Stone door', words, true, false, cell);
  updateDoorContext(cell);
  updateConnections();
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
  const latest = at === undefined ? undefined : s.answers.findLast((a) => a.at >= at);
  const speaker = latest && s.people.find((p) => p.id === latest.who);
  showReading(
    'Bell call',
    `${bellThreatWords(s)} ${call} The bell asks people to shelter below. A reply does not promise a journey.${speaker ? ` Latest heard reply and current task: ${exposureWords(s, speaker, true)}` : ' No one has replied yet.'}`,
    true,
    true,
  );
  const context = document.getElementById('reading-context');
  const label = context?.querySelector('summary');
  const text = document.getElementById('door-context');
  if (context) context.hidden = false;
  if (label) {
    label.textContent = 'Heard replies and current tasks ▸';
    label.setAttribute('aria-label', 'Replies to the bell');
  }
  if (text)
    text.textContent = replies.length
      ? replies.map((p) => settingWords(`${p.name}: ${exposureWords(s, p, true)}`)).join('\n\n')
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
    bellState.textContent = '🔔';
    bellState.classList.toggle('ringing', ringing);
    bellState.setAttribute('aria-label', ringing ? 'Bell ringing' : 'Bell quiet');
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
  framedPerson = null;
  focusCell = null;
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
  return `<p>The game is paused while the menu is open.</p><p>Pace: ${SPEED_NAMES[speedIx]}</p><div class="menu-rows"><button id="send">Feedback</button><button id="fullscreen">Full screen</button><a href="/file/" target="_blank" rel="noopener">Open a saved hill</a><button id="download-run" ${g ? '' : 'disabled'}>Download this run</button><a target="_top" href="https://human.adamwhite.work/games/">All games</a>${g?.fileOrigin ? '<a href="/">Return to your hill</a>' : '<button id="to-title">New game</button>'}</div><div id="menu-new-confirm" hidden><p>Starting a new game replaces this saved hill.</p><button id="menu-new-yes">Start new game</button><button id="menu-new-no">Cancel</button></div><a class="shelf-link" href="https://human.adamwhite.work/lab/people/" target="_blank" rel="noopener">People across games</a><div class="menu-footer"><label><input id="record-play" type="checkbox" ${lab.telemetryOn ? 'checked' : ''}> Recording</label><a href="https://human.adamwhite.work/lab/privacy/" target="_blank" rel="noopener">Lab privacy</a><details class="game-debug"><summary>Debug</summary><p>The Warren ${GAME_VERSION} · HF ${FRAMEWORK_VERSION}</p><div>${continuity.controls()}</div>${g?.s.next?.discussion ? `<details id="cut-discussion-debug"><summary>Loose-cut encounter receipts</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify({ current: g.s.next.discussion, earlier: g.s.cutDiscussionHistory ?? [] }, null, 2))}</pre></details>` : ''}${g?.s.bellAmends ? `<details id="bell-amends-debug"><summary>False bell apology receipts</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(g.s.bellAmends, null, 2))}</pre></details>` : ''}${g?.s.tariqTrial ? `<details id="tariq-trial-debug"><summary>Boat trial receipts</summary><p>Warren supplies this prospective dry balance fixture. Person choices and observation remain separate.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(g.s.tariqTrial, null, 2))}</pre></details>` : ''}${g?.s.newcomerExchanges?.length ? `<details id="newcomer-debug"><summary>Newcomer exchange receipts</summary><p>Scripted dialogue is authored by Warren after completed work. Decision narration is HF output. The keeper is a player office; no HF listener or hearing is claimed.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(g.s.newcomerExchanges, null, 2))}</pre></details>` : ''}</details></div><button class="primary" id="resume">Resume</button>`;
}
let feedbackCleanup: (() => void) | undefined;
function showFeedback(host: HTMLElement, onBack: () => void) {
  feedbackCleanup?.();
  feedbackCleanup = openFeedback(host, lab, runOf, download, onBack, continuity.chooseContinuityRecording);
}
function bindMenu(host: HTMLElement, close: () => void) {
  host.onkeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [
      ...host.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), textarea, select, summary, [tabindex="0"]',
      ),
    ].filter((el) => el.checkVisibility() && !el.closest('[hidden]'));
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (
      (event.shiftKey && document.activeElement === first) ||
      (!event.shiftKey && document.activeElement === last) ||
      !host.contains(document.activeElement)
    ) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  };

  host.querySelector('#download-run')?.addEventListener('click', download);
  continuity.bind(host);
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
    document.getElementById('book')?.focus();
  };
  host.querySelector('#title-menu-x')?.addEventListener('click', close);
  bindMenu(host, close);
  host.querySelector<HTMLElement>('#title-menu-x')?.focus();
  // Reading rows belong to the current hill; enter it before opening a reading.
  for (const b of host.querySelectorAll<HTMLElement>('[data-open]'))
    b.addEventListener('click', async () => {
      const expected = ++generation;
      const sv = await store.get<Saved>(SAVE_KEY);
      if (sv && expected === generation) {
        const prepared = await continuity.localLoad(sv.value);
        if (!replaceGame(prepared, expected)) return;
        speedIx = 1;
        enter();
        openBook(b.dataset.open);
      }
    });
}
function openBook(tab = 's', opener?: HTMLElement) {
  feedbackCleanup?.();
  closeCell(false);
  bellReading = false;
  const d = document.getElementById('drawer');
  if (!d || !g) return;
  if (tab === 's') void writeSave();
  menuOpener = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  paint.selected = null;
  framedPerson = null;
  personOpener = null;
  const s = g.s;
  const journal = journalView(s.notes);
  const notes = journal.fresh
    .filter((n) => n.weight >= 1)
    .slice(-60)
    .reverse();
  const history = eventHistory(g);
  const timeline = `<section id="door-alarm-history"><h3>Door requests and bell calls</h3><p>These are retained records. An answer is not completed work. Missing events and times remain unknown. Current door state cannot establish past closure or safety.</p>${
    history.length
      ? history
          .toReversed()
          .map(
            (e) =>
              `<p data-history-kind="${e.kind}"><span class="soft small">${esc(historyTime(e.at))}</span>${e.cell === undefined ? '' : `<br><span class="soft small">Recorded square ${esc(cellLocationWords(s, e.cell))}</span>`}<br>${esc(displayWords(e.text))}</p>`,
          )
          .join('')
      : '<p>No dated door or bell record is retained.</p>'
  }</section>`;
  const routine = journal.routine.filter((n) => n.weight >= 1).reverse();
  const newestSafety = notes.find(
    (n) => n.kind === 'raid' || n.kind === 'hurt' || (n.kind === 'dig' && /shaft|riders|door/i.test(n.text)),
  );
  const entry = (n: Note) =>
    `<p class="${n.weight >= 2 ? 'heavy' : ''}"><span class="soft small">${esc(hillDate(n.at))}</span><br>${esc(displayWords(n.text))}</p>`;
  const alive = s.people.filter((p) => p.body.alive);
  const below = alive.filter((p) => yOf(positionAt(s, p.id, s.minute)) >= SURF);
  const done = goalsFor(s).filter((x) => s.goals[x.id] !== undefined);
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
        ? `<button data-open="d">What the village has done</button>${
            seenWhileWatching.length
              ? `<section id="seen-while-watching"><b>Seen while you watched</b>${seenWhileWatching
                  .slice()
                  .reverse()
                  .map(
                    (e) =>
                      `<p><span class="soft small">${esc(hillDate(e.at))}</span><br>${esc(settingWords(e.text))}</p>`,
                  )
                  .join('')}</section>`
              : ''
          }${newestSafety ? `<p id="newest-safety"><b>Latest safety entry</b><br>${esc(displayWords(newestSafety.text))}</p>` : ''}<details id="door-alarm-records"><summary>Door requests and bell calls</summary>${timeline}</details>${notes.slice(0, 8).map(entry).join('')}${routine.length ? `<details id="daily-routine"><summary>Daily routine (${routine.length} repeated ${routine.length === 1 ? 'line' : 'lines'})</summary>${routine.map(entry).join('')}</details>` : ''}<details><summary>Earlier journal entries</summary>${notes.slice(8).map(entry).join('')}</details>`
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

/** Show and pause an automatic checkpoint before materializing its exact archive.
 * Export cost is separate from the simulation frame budget; no history is trimmed. */
function automaticCheckpoint() {
  const current = g,
    expected = generation;
  checkpointPending = true;
  chrome();
  requestAnimationFrame(() =>
    setTimeout(() => {
      if (g !== current || generation !== expected) {
        checkpointPending = false;
        return;
      }
      void writeSave().finally(() => {
        checkpointPending = false;
        chrome();
      });
    }, 0),
  );
}
async function writeSave(): Promise<boolean> {
  if (!g || g.fileOrigin) return true;
  const current = g;
  const expected = gameGeneration;
  const owns = () => g === current && expected === generation;
  if (!owns()) return false;
  lastSaved = performance.now();
  dirty = false;
  const saved = { ...save(current), savedAt: Date.now() };
  const stored = await store.put(SAVE_KEY, saved, owns);
  if (!owns()) return false;
  if (stored) lab.captureSave(saved);
  else dirty = true;
  return stored;
}

function runOf() {
  if (!g) return null;
  const saved = save(g);
  return { ...saved, exportedAt: new Date().toISOString() };
}

function download() {
  if (!g) return;
  downloadSaved(runOf(), `the-warren-${g.s.seed}-day${Math.floor(g.s.minute / DAY)}.json`);
}

function downloadSaved(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
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

let hiddenAt: number | null = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    if (g) void writeSave();
    cancelAnimationFrame(raf);
    wake = null;
  } else if (g && canvas) {
    if (hiddenAt !== null && catchUp(g, Math.max(0, Math.floor(Date.now() - hiddenAt)))) {
      showReading('While you were away', awayWords(g.s));
      returnReading = true;
      void writeSave();
    }
    hiddenAt = null;
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
