// /public/js/game-core.js
// Engine Snake.io — kamera, loop, UI, start/reset, dan hook online.
// Memakai modul modular di /public/js/core/*
// API publik:
//   Game.init()
//   Game.start(colors, startLen)
//   Game.quickReset()
//   Game.applyProfileStyle(style)
//   Game.netUpsert(uid, state)
//   Game.netRemove(uid)
//   Game.getPlayerState()

import { State } from './core/state.js';
import { clamp, lerp } from './core/utils.js';
import { drawFood, ensureFood } from './core/food.js';
import { createSnake, updateSnake, drawSnake, spawnOfflineAsBots } from './core/snake.js';
import { grabUIRefs, setResetVisible, showToast, updateHUDCounts, updateRankPanel } from './core/ui.js';
import { Input } from './core/input.js';
import { netUpsert, netRemove } from './core/net.js';

// ===== Canvas / Camera =====
let canvas, ctx;
function resize() {
  const vw = innerWidth;
  const vh = innerHeight;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = vw * dpr;
  canvas.height = vh * dpr;
  canvas.style.width = vw + 'px';
  canvas.style.height = vh + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  State.vw = vw;
  State.vh = vh;
  State.dpr = dpr;
}

// ===== Profil pemain aktif (untuk nameplate) =====
let myName = 'USER';
let myTextColor = '#ffffff';
let myBorderColor = '#000000';

// ===== Game State lokal =====
let lastColors = ['#58ff9b'];
let lastStartLen = 3;
let rankTick = 0;
let lastTS = 0;

// ===== Helpers =====
function clearWorld() {
  State.snakes.splice(0, State.snakes.length);
  State.snakesByUid.clear();
  State.foods.splice(0, State.foods.length);
  ensureFood(); // isi awal supaya langsung ada buah
}

// ===== Start/Reset =====
function startGame(colors, startLen) {
  clearWorld();

  // Buat pemain
  const uid = window.App?.profile?.id || null;
  const startX = Math.random() * State.WORLD.w * 0.6 + State.WORLD.w * 0.2;
  const startY = Math.random() * State.WORLD.h * 0.6 + State.WORLD.h * 0.2;

  const isAdmin = !!window.App?.isAdmin;
  const cols = isAdmin ? State.RAINBOW?.slice?.() || lastColors.slice() : (colors && colors.length ? colors : ['#58ff9b']);

  const me = createSnake(
    cols,
    startX,
    startY,
    false,
    startLen || 3,
    myName,
    uid,
    myTextColor,
    myBorderColor
  );
  if (isAdmin) me.isAdminRainbow = true;

  State.player = me;
  State.snakes.push(me);
  if (me.uid) State.snakesByUid.set(me.uid, me);

  // Kamera awal
  State.camera.x = me.x;
  State.camera.y = me.y;
  State.camera.zoom = 1;

  // Simpan untuk quick reset
  lastColors = cols.slice();
  lastStartLen = startLen || 3;

  // Spawn bot offline dengan nama & style Presence (admin pelangi)
  spawnOfflineAsBots(12);

  // HUD awal
  updateHUDCounts();
  updateRankPanel();

  // Pastikan tombol Restart tersembunyi saat hidup
  setResetVisible(false);
}

function quickReset() {
  startGame(lastColors, lastStartLen);
  setResetVisible(false);
  showToast('Reset!', 900);
}

// ===== Loop =====
function stepPhysics(dt) {
  // Fixed-step 60 Hz
  const h = 1 / 60;
  while (dt > 0) {
    const step = Math.min(h, dt);
    for (const s of State.snakes) updateSnake(s, step);
    dt -= step;
  }
}

function updateCamera(dt) {
  const p = State.player;
  if (!p) return;
  const zLen = Math.min(0.5, Math.log10(1 + p.length / 10) * 0.35);
  const zSpeed = Math.min(0.6, (p.v - p.speedBase) / (p.speedMax - p.speedBase + 1e-6)) * 0.45;
  const tZoom = clamp(1.15 - zSpeed - zLen, 0.35, 1.18);
  State.camera.zoom = lerp(State.camera.zoom, tZoom, 0.06);
  State.camera.x = lerp(State.camera.x, p.x, 0.085);
  State.camera.y = lerp(State.camera.y, p.y, 0.085);
}

function render() {
  ctx.clearRect(0, 0, State.vw, State.vh);

  // Grid ringan (opsional)
  const step = State.WORLD.grid * State.camera.zoom;
  if (step >= 14) {
    const ox = -((State.camera.x * State.camera.zoom) % step);
    const oy = -((State.camera.y * State.camera.zoom) % step);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox; x < State.vw; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, State.vh); }
    for (let y = oy; y < State.vh; y += step) { ctx.moveTo(0, y); ctx.lineTo(State.vw, y); }
    ctx.stroke();
  }

  // Buah (termasuk glow + efek sedot + auto-refill)
  drawFood(ctx);

  // Ular
  for (const s of State.snakes) drawSnake(ctx, s);

  // HUD count + rank panel (throttle 4x/detik)
  if (State.player) updateHUDCounts();
  rankTick += 1;
  if (rankTick >= 15) { // ~0.25s pada 60FPS
    updateRankPanel();
    rankTick = 0;
  }
}

function loop(now) {
  if (!lastTS) lastTS = now;
  const dt = Math.min(0.1, (now - lastTS) / 1000);
  lastTS = now;

  stepPhysics(dt);
  updateCamera(dt);
  render();

  requestAnimationFrame(loop);
}

// ===== Input binding tambahan (R untuk reset) =====
function bindLocalKeys() {
  addEventListener('keydown', (e) => {
    if ((e.key === 'r' || e.key === 'R') && State.ui?.canReset) {
      Game.quickReset();
    }
  }, { passive: true });
}

// ===== Public API =====
const Game = {
  init() {
    canvas = document.getElementById('game');
    if (!canvas) {
      throw new Error('Canvas #game tidak ditemukan. Pastikan ada <canvas id="game"></canvas> di HTML.');
    }
    ctx = canvas.getContext('2d');

    // Simpan context ke State (opsional bila modul lain butuh)
    State.ctx = ctx;

    // UI & tombol Restart (tengah layar)
    const restartBtn = grabUIRefs();
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        if (State.ui?.canReset) Game.quickReset();
      });
    }

    // Resize
    addEventListener('resize', resize, { passive: true });
    resize();

    // Input (pointer/keyboard/joystick) — dikendalikan modul Input
    if (Input?.init) Input.init(canvas);
    bindLocalKeys();

    // Mulai loop
    requestAnimationFrame(loop);
  },

  start(colors, startLen) {
    startGame(colors, startLen);
  },

  quickReset,

  applyProfileStyle(style) {
    if (!style) return;
    myName = style.name || 'USER';
    myTextColor = style.color || '#fff';
    if (style.borderGradient) {
      const m = String(style.borderGradient).match(/(#(?:[0-9a-fA-F]{3,8}))|rgba?\([^)]*\)/);
      myBorderColor = m ? m[0] : (style.borderColor || '#000');
    } else myBorderColor = style.borderColor || '#000';
  },

  // Hook untuk net-sync
  netUpsert,
  netRemove,

  getPlayerState() {
    const p = State.player;
    if (!p) return null;
    return {
      name: p.name,
      colors: p.colors,
      x: p.x, y: p.y, dir: p.dir,
      length: Math.max(1, Math.floor(p.length))
    };
  }
};

export default Game;
export { Game };

// Global compat
if (typeof window !== 'undefined') window.Game = Game;
