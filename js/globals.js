// === APP VERSION ===
// Format: MAJOR.PATCH.HOTFIX — MAJOR = größeres Update/neue Implementation, PATCH = Patch, HOTFIX = Hotfix.
// Immer nur die betroffene Stelle um 1 hochzählen. Siehe Versionierungsregel in CLAUDE.md.
const APP_VERSION = '2.2.2';

// === DOM REFERENCES ===
const appVersionEl = document.getElementById('app-version');
if (appVersionEl) appVersionEl.textContent = 'v' + APP_VERSION;

const setupScreen = document.getElementById('setup-screen');
const intermissionScreen = document.getElementById('intermission-screen');
const winScreen = document.getElementById('win-screen');
const draftOverlay = document.getElementById('draft-overlay');
const draftCardsContainer = document.getElementById('draft-cards');
const researchOverlay = document.getElementById('research-overlay');
const researchCardsContainer = document.getElementById('research-cards');
const canvasWrapper = document.getElementById('canvas-wrapper');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const uiContainer = document.getElementById('ui-container');
const infoPanel = document.getElementById('info-panel');
const actionMenu = document.getElementById('action-menu');
const endTurnBtn = document.getElementById('end-turn-btn');
const upgradeBtn = document.getElementById('upgrade-btn');
const researchBtn = document.getElementById('research-btn');
const linkBox = document.getElementById('link-box');
const intermissionMsg = document.getElementById('intermission-msg');
const waShareBtn = document.getElementById('wa-share-btn');
const resourceHud = document.getElementById('resource-hud');
const gameHud = document.getElementById('game-hud');
const mainTitle = document.getElementById('main-title');
const toastContainer = document.getElementById('toast-container');
const scoreboard = document.getElementById('scoreboard');
const scoreCompact = document.getElementById('score-compact');
const scoreExpanded = document.getElementById('score-expanded');
const eventOverlay = document.getElementById('event-overlay');
const eventIcon = document.getElementById('event-icon');
const eventTitle = document.getElementById('event-title');
const eventDesc = document.getElementById('event-desc');
const mapSizeSelect = document.getElementById('map-size');
const playerCountSelect = document.getElementById('player-count');
const teamModeSelect = document.getElementById('team-mode');
const namesContainer = document.getElementById('player-names-container');
const startGameBtn = document.getElementById('start-game-btn');

// === MUTABLE GAME STATE ===
let gameState = null;
let turnActions = [];
let showRecap = true;
window.specialActive = null;
let pendingEvent = null;

// === CAMERA ===
let camX = 0;
let camY = 0;
let camScale = 1.0;

// === ANIMATION ===
let floatingTexts = [];
let attackAnims = [];
let isAnimating = false;

// === SELECTION ===
let selectedHex = null;
let selectedUnit = null;
let validMoves = [];
let validAttacks = [];
let selectedTower = null;
window.highlightedTunnelEnd = null;
window.demolishTargets = [];

// === UNTERWELT (M9b) ===
// Eigener Auswahl-/Highlight-Zustand statt Verzweigung von selectedUnit/validMoves —
// gleiches Muster wie oben, aber getrennt, weil Unterwelt-Einheiten in `uw.u`
// statt `u[]` leben (siehe Unterwelt/PLAN.md Abschn. 10).
let selectedUWUnit = null;
let uwValidMoves = [];      // BFS-Bewegungsziele (nur offene Hexes)
let uwValidDigs = [];       // angrenzende FELS-Hexes — Klick darauf = Graben + Nachrücken in einem Zug
let uwValidMine = [];       // Kristalladern-Ziele während der "Abbauen"-Zielauswahl
let uwValidAttacks = [];    // Angriffsziele (M10, calculateAttacksUW)
window.uwSpecialActive = null; // z.B. 'mine_select', 'relic_<key>' — mehrstufige Unterwelt-/Reliquien-Aktionen
// Lärm-Marker des GERADE LAUFENDEN Zugs, noch nicht in gameState.uw.n übernommen
// (das passiert erst in doEndTurn — "wird durch die Marker des beendeten Zugs
// ersetzt", siehe PLAN.md Abschn. 3). Bewusst außerhalb von gameState: rein
// transiente Zug-Anzeige, nicht Teil des Spielzustands/Undo — verhält sich wie
// floatingTexts/attackAnims (auch außerhalb von gameState, pro Zug zurückgesetzt).
window.uwNoiseScratch = [];

// === UNDO ===
let undoStack = [];

// === INPUT ===
let isDragging = false;
let hasMoved = false;
let dragStartX = 0, dragStartY = 0;
let initialPinchDist = null;
let initialPinchAngle = null;

// === SCOREBOARD ===
let scoreboardOpen = false;

// === SERVER MODE ===
let currentUser = null;
let currentProfile = null;
let currentGameId = null;
let currentUserSlot = null;
let currentTurnSlot = null;   // server-authoritative: whose turn it is (never changed by client)
let isSpectator = false;
let isLegacyUrlMode = false;
