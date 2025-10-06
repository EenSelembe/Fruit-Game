// /public/js/game-core.js — engine + loop + bridge global
import { State } from './core/state.js';
import { clamp, lerp, angNorm } from './core/utils.js';
import { drawFood, ensureFood } from './core/food.js';
import { createSnake, updateSnake, drawSnake, spawnOfflineAsBots } from './core/snake.js';
import { grabUIRefs, setResetVisible, showToast, updateHUDCounts, updateRankPanel } from './core/ui.js';
import { Input } from './core/input.js';
import { netUpsert, netRemove } from './core/net.js';
import { RAINBOW } from './core/config.js';

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
  State.vw = vw; State.vh = vh; State.dpr = dpr;
}
function worldToScreen(x, y) {
  return { x: (x - State.camera.x) * State.camera.zoom + State.vw / 2,
           y: (y - State.camera.y) * State.camera.zoom + State.vh / 2 };
}

// profil aktif
let myName = 'USER', myTextColor = '#ffffff', myBorderColor = '#000000';
let lastColors = ['#58ff9b'], lastStartLen = 3, rankTick = 0, lastTS = 0;

function clearWorld() {
  State.snakes.splice(0, State.snakes.length);
  State.snakesByUid.clear();
  State.foods.splice(0, State.foods.length);
  ensureFood();
}

// bridge globals utk snake.js
function attachGlobals() {
  if (!window.GameState) window.GameState = State;
  window.GameUtils = window.GameUtils || {};
  window.GameUtils.clamp  = clamp;
  window.GameUtils.lerp   = lerp;
  window.GameUtils.angNorm = angNorm;

  window.GameRender = window.GameRender || {};
  window.GameRender.worldToScreen = worldToScreen;

  window.GameFood = window.GameFood || {};
  if (typeof window.GameFood.spawnSuckBurst !== 'function') window.GameFood.spawnSuckBurst = () => {};
  if (typeof window.GameFood.spawnFood !== 'function') {
    const FRUITS = ['apple','orange','grape','watermelon','strawberry','lemon','blueberry','starfruit'];
    window.GameFood.spawnFood = (x, y) => {
      const kind = FRUITS[(Math.random()*FRUITS.length)|0];
      State.foods.push({ kind, x, y });
    };
  }

  window.GameUI = window.GameUI || {};
  window.GameUI.setResetVisible = setResetVisible;
  window.GameUI.showToast = showToast;

  window.GameInput = Input;

  if (typeof window.Game === 'undefined') window.Game = Game;
}

function startGame(colors, startLen) {
  clearWorld();
  const uid = window.App?.profile?.id || null;
  const startX = Math.random() * State.WORLD.w * 0.6 + State.WORLD.w * 0.2;
  const startY = Math.random() * State.WORLD.h * 0.6 + State.WORLD.h * 0.2;

  const isAdmin = !!window.App?.isAdmin;
  const cols = isAdmin ? RAINBOW.slice() : (colors && colors.length ? colors : ['#58ff9b']);

  const me = createSnake(cols, startX, startY, false, startLen || 3, myName, uid, myTextColor, myBorderColor);
  if (isAdmin) me.isAdminRainbow = true;

  State.player = me;
  State.snakes.push(me);
  if (me.uid) State.snakesByUid.set(me.uid, me);

  State.camera.x = me.x; State.camera.y = me.y; State.camera.zoom = 1;

  lastColors = cols.slice(); lastStartLen = startLen || 3;
  spawnOfflineAsBots(12);

  updateHUDCounts(); updateRankPanel();
  setResetVisible(false);
}
function quickReset() {
  startGame(lastColors, lastStartLen);
  setResetVisible(false);
  showToast('Reset!', 900);
}

function stepPhysics(dt) {
  const h = 1/60;
  while (dt > 0) {
    const step = Math.min(h, dt);
    for (const s of State.snakes) updateSnake(s, step);
    dt -= step;
  }
}
function updateCamera(dt) {
  const p = State.player; if (!p) return;
  const zLen = Math.min(0.5, Math.log10(1 + p.length/10) * 0.35);
  const zSpeed = Math.min(0.6, (p.v - p.speedBase) / (p.speedMax - p.speedBase + 1e-6)) * 0.45;
  const tZoom = clamp(1.15 - zSpeed - zLen, 0.35, 1.18);
  State.camera.zoom = lerp(State.camera.zoom, tZoom, 0.06);
  State.camera.x = lerp(State.camera.x, p.x, 0.085);
  State.camera.y = lerp(State.camera.y, p.y, 0.085);
}
function render() {
  ctx.clearRect(0, 0, State.vw, State.vh);
  const step = State.WORLD.grid * State.camera.zoom;
  if (step >= 14) {
    const ox = -((State.camera.x * State.camera.zoom) % step);
    const oy = -((State.camera.y * State.camera.zoom) % step);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x=ox; x<State.vw; x+=step){ ctx.moveTo(x,0); ctx.lineTo(x,State.vh); }
    for (let y=oy; y<State.vh; y+=step){ ctx.moveTo(0,y); ctx.lineTo(State.vw,y); }
    ctx.stroke();
  }
  drawFood(ctx);
  for (const s of State.snakes) drawSnake(ctx, s);
  if (State.player) updateHUDCounts();
  rankTick += 1; if (rankTick >= 15){ updateRankPanel(); rankTick = 0; }
}
function loop(now) {
  if (!lastTS) lastTS = now;
  const dt = Math.min(0.1, (now - lastTS) / 1000);
  lastTS = now;
  stepPhysics(dt); updateCamera(dt); render();
  requestAnimationFrame(loop);
}
function bindLocalKeys() {
  addEventListener('keydown', (e) => {
    if ((e.key === 'r' || e.key === 'R') && State.ui?.canReset) Game.quickReset();
  }, { passive: true });
}

const Game = {
  init() {
    canvas = document.getElementById('game');
    if (!canvas) throw new Error('Canvas #game tidak ditemukan.');
    ctx = canvas.getContext('2d');
    State.ctx = ctx;
    attachGlobals();

    const restartBtn = grabUIRefs();
    if (restartBtn) restartBtn.addEventListener('click', () => { if (State.ui?.canReset) Game.quickReset(); });

    addEventListener('resize', resize, { passive: true });
    resize();

    if (Input?.init) Input.init(canvas);
    bindLocalKeys();

    requestAnimationFrame(loop);
  },
  start(colors, startLen){ startGame(colors, startLen); },
  quickReset,
  applyProfileStyle(style){
    if (!style) return;
    myName = style.name || 'USER';
    myTextColor = style.color || '#fff';
    if (style.borderGradient) {
      const m = String(style.borderGradient).match(/(#(?:[0-9a-fA-F]{3,8}))|rgba?\([^)]*\)/);
      myBorderColor = m ? m[0] : (style.borderColor || '#000');
    } else myBorderColor = style.borderColor || '#000';
  },
  netUpsert, netRemove,
  getPlayerState(){
    const p = State.player; if (!p) return null;
    return { name:p.name, colors:p.colors, x:p.x, y:p.y, dir:p.dir, length: Math.max(1, Math.floor(p.length)) };
  }
};

export default Game;
export { Game };
if (typeof window !== 'undefined') window.Game = Game;
