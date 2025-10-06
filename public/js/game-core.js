// public/js/game-core.js
// === Engine utama: state, input, kamera, render, buah + efek sedot, UI, loop ===

import { createSnake, updateSnake, drawSnake, killSnake, spawnOfflineAsBots,
         registerSnake, removeSnake, bodyRadius, segSpace, needForNext } from './core/snake.js';

/* ================== Utils & Globals ================== */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (a, b) => Math.random() * (b - a) + a;
const angNorm = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

const GameState = {
  WORLD: { w: 4200, h: 4200, grid: 90 },
  camera: { x: 2100, y: 2100, zoom: 1 },
  vw: 0, vh: 0, dpr: 1,
  foods: [],
  FOOD_COUNT: 1400,
  snakes: [],
  snakesByUid: new Map(),
  player: null,
  ui: { elLen:null, elUsers:null, rankRowsEl:null, toastEl:null, resetBtnEl:null, canReset:false }
};
window.GameState = GameState;
window.GameUtils = { clamp, lerp, rand, angNorm };

/* ================== Canvas / Resize / Camera ================== */
let canvas, ctx;
function resize() {
  GameState.vw = innerWidth; GameState.vh = innerHeight;
  GameState.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = GameState.vw * GameState.dpr; canvas.height = GameState.vh * GameState.dpr;
  canvas.style.width = GameState.vw + "px"; canvas.style.height = GameState.vh + "px";
  ctx.setTransform(GameState.dpr, 0, 0, GameState.dpr, 0, 0);
}
function worldToScreen(x, y) {
  const { camera, vw, vh } = GameState;
  return { x: (x - camera.x) * camera.zoom + vw / 2, y: (y - camera.y) * camera.zoom + vh / 2 };
}
window.GameRender = { worldToScreen };

/* ================== Input (pointer, keyboard, boost) ================== */
const GameInput = {
  keys: {},
  pointer: { x: 0, y: 0, down: false },
  boostHold: false,
  getTargetAngleForPlayer(px, py) {
    const { pointer, keys } = GameInput;
    if (pointer.down) {
      const head = worldToScreen(px, py);
      return Math.atan2(pointer.y - head.y, pointer.x - head.x);
    }
    let ax=0, ay=0;
    if (keys['w'] || keys['arrowup'])    ay -= 1;
    if (keys['s'] || keys['arrowdown'])  ay += 1;
    if (keys['a'] || keys['arrowleft'])  ax -= 1;
    if (keys['d'] || keys['arrowright']) ax += 1;
    if (ax || ay) return Math.atan2(ay, ax);
    return null;
  }
};
window.GameInput = GameInput;

function bindInputs() {
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    GameInput.keys[k] = true;
    if (k === 'shift') GameInput.boostHold = true;
    if (k === 'r' && GameState.ui.canReset) Game.quickReset();
  });
  addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    GameInput.keys[k] = false;
    if (k === 'shift') GameInput.boostHold = false;
  });
  addEventListener('pointerdown', (e) => { GameInput.pointer.down = true; GameInput.pointer.x = e.clientX; GameInput.pointer.y = e.clientY; });
  addEventListener('pointermove',  (e) => { GameInput.pointer.x = e.clientX; GameInput.pointer.y = e.clientY; });
  addEventListener('pointerup',    ()  => { GameInput.pointer.down = false; });
  addEventListener('pointercancel',()  => { GameInput.pointer.down = false; });
}

/* ================== UI (Restart di tengah + HUD + Rank) ================== */
function ensureRestartButton() {
  let btn = document.getElementById('restart') || document.getElementById('reset');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'restart';
    btn.textContent = 'Restart';
    document.body.appendChild(btn);
  }
  Object.assign(btn.style, {
    position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
    zIndex: '9999', display: 'none', padding: '14px 28px', fontSize: '20px',
    borderRadius: '12px', border: '0', cursor: 'pointer',
    background: '#1fffb0', color: '#071a12', fontWeight: '700',
    boxShadow: '0 8px 24px rgba(0,0,0,.25)', letterSpacing: '0.4px'
  });
  btn.onclick = () => { if (GameState.ui.canReset) Game.quickReset(); };
  GameState.ui.resetBtnEl = btn;
  return btn;
}
function grabUIRefs() {
  const ui = GameState.ui;
  ui.elLen      = document.getElementById('len')       || ui.elLen;
  ui.elUsers    = document.getElementById('userCount') || ui.elUsers;
  ui.rankRowsEl = document.getElementById('rankRows')  || ui.rankRowsEl;
  ui.toastEl    = document.getElementById('toast')     || ui.toastEl;
  ensureRestartButton();
}
function setResetVisible(show) {
  const btn = ensureRestartButton();
  btn.style.display = show ? 'block' : 'none';
  GameState.ui.canReset = !!show;
}
function showToast(msg, dur = 1200) {
  const t = GameState.ui.toastEl;
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (t.style.display = 'none'), dur);
}
function updateHUDCounts() {
  const { elLen, elUsers } = GameState.ui;
  if (GameState.player && elLen) elLen.textContent = Math.max(1, Math.floor(GameState.player.length));
  if (elUsers) elUsers.textContent = GameState.snakes.filter((s) => s.alive).length;
}
function updateRankPanel() {
  const el = GameState.ui.rankRowsEl;
  if (!el) return;
  const top = GameState.snakes
    .filter((s) => s.alive)
    .sort((a, b) => b.length - a.length)
    .slice(0, 5);
  el.innerHTML = top.map((s,i)=>`
    <div class="rrow${s===GameState.player?' me':''}">
      <div class="title">${i+1}. ${s.name || 'USER'}</div>
      <div class="sub">Len ${Math.max(1, Math.floor(s.length))}</div>
    </div>`).join('');
}
window.GameUI = { setResetVisible, showToast };

/* ================== Food + Glow + Efek Sedot ================== */
const FRUITS = ['apple','orange','grape','watermelon','strawberry','lemon','blueberry','starfruit'];
const FRUIT_COLOR = {
  apple:'#ff4d4d', orange:'#ffa94d', grape:'#a06cff', watermelon:'#ff5d73',
  strawberry:'#ff4d6d', lemon:'#ffe066', blueberry:'#4c6ef5', starfruit:'#e9ff70'
};
function spawnFood(x = rand(0, GameState.WORLD.w), y = rand(0, GameState.WORLD.h)) {
  const kind = FRUITS[Math.floor(rand(0, FRUITS.length))];
  GameState.foods.push({ kind, x, y });
}
function ensureFood(){ while (GameState.foods.length < GameState.FOOD_COUNT) spawnFood(); }

const glowCache = new Map();
function hexToRgb(hex) {
  let h = String(hex).replace('#','');
  if (h.length === 3) h = h.split('').map(c=>c+c).join('');
  const num = parseInt(h,16);
  return { r:(num>>16)&255, g:(num>>8)&255, b:num&255 };
}
function makeGlowSprite(kind) {
  const col = FRUIT_COLOR[kind] || '#ffffff';
  const { r,g,b } = hexToRgb(col);
  const SZ = 128, c = document.createElement('canvas'); c.width=SZ; c.height=SZ;
  const x = c.getContext('2d'); const cx = SZ/2, cy = SZ/2, rOut = SZ*0.45;
  const grad = x.createRadialGradient(cx,cy,rOut*0.15, cx,cy,rOut);
  grad.addColorStop(0.00, `rgba(${r},${g},${b},0.85)`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(0.70, `rgba(${r},${g},${b},0.20)`);
  grad.addColorStop(1.00, `rgba(${r},${g},${b},0.00)`);
  x.fillStyle = grad; x.beginPath(); x.arc(cx
