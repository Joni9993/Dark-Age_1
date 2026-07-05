// === DOM REFERENCES ===
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
