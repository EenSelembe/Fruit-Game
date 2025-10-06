// public/js/game-core.js
import { State } from './core/state.js';
import { RAINBOW, DEFAULT_PLAYER_COLOR } from './core/config.js';
import { resize } from './core/camera.js';
import { Input } from './core/input.js';
import { ensureFood } from './core/food.js';
import { renderFrame } from './core/render.js';
import { setResetVisible, showToast, grabUIRefs } from './core/ui.js';
import { createSnake, registerSnake, spawnOfflineAsBots, updateSnake } from './core/snake.js';
import { clamp, lerp } from './core/utils.js';
import { netUpsert, netRemove } from './core/net.js';

const LS = typeof localStorage !== 'undefined' ? localStorage : null;
const save = (k,v)=>{ if(LS) LS.setItem(k,v); };

const Game = (() => {
  function stepPhysics(dt) {
    const h = 1/60;
    while (dt > 0) {
      const step = Math.min(h, dt);
      for (const s of State.snakes) updateSnake(s, step);
      dt -= step;
    }
  }

  let last = performance.now();
  function loop(now) {
    const frameDt = Math.min(0.1, (now - last) / 1000); last = now;
    stepPhysics(frameDt);

    if (State.player) {
      const zLen = Math.min(0.5, Math.log10(1 + State.player.length/10) * 0.35);
      const zSpeed = Math.min(0.6, (State.player.v - State.player.speedBase) / (State.player.speedMax - State.player.speedBase + 1e-6)) * 0.45;
      const tZoom = clamp(1.15 - zSpeed - zLen, 0.35, 1.18);
      State.camera.zoom = lerp(State.camera.zoom, tZoom, 0.06);
      State.camera.x = lerp(State.camera.x, State.player.x, 0.085);
      State.camera.y = lerp(State.camera.y, State.player.y, 0.085);
    }

    renderFrame(frameDt);
    requestAnimationFrame(loop);
  }

  function startGame(colors, startLen) {
    State.snakes.splice(0, State.snakes.length);
    State.snakesByUid.clear();
    State.foods.splice(0, State.foods.length);
    ensureFood();

    const isAdminRuntime = !!window.App?.isAdmin;
    if (isAdminRuntime) { State.profile.isAdminPersist = true; save('snake_isAdminPersist','1'); }

    const isAdmin = State.profile.forceAdminRainbow || State.profile.isAdminPersist || isAdminRuntime;

    const uid = window.App?.profile?.id || null;
    const startX = Math.random() * State.WORLD.w * 0.6 + State.WORLD.w * 0.2;
    const startY = Math.random() * State.WORLD.h * 0.6 + State.WORLD.h * 0.2;

    const cols = isAdmin ? RAINBOW.slice() : (colors && colors.length ? colors : [DEFAULT_PLAYER_COLOR]);
    const sMe = createSnake(cols, startX, startY, false, startLen || 3, State.profile.name, uid, State.profile.textColor, State.profile.borderColor);
    sMe.isAdminRainbow = !!isAdmin;
    if (sMe.isAdminRainbow) sMe.colors = RAINBOW.slice();

    State.player = sMe;
    registerSnake(State.player);

    State.camera.x = State.player.x; State.camera.y = State.player.y; State.camera.zoom = 1;

    State.lastColors = sMe.colors.slice();
    State.lastStartLen = startLen || 3;

    spawnOfflineAsBots(12);
    setResetVisible(false);
  }

  function quickReset() {
    startGame(State.lastColors, State.lastStartLen);
    setResetVisible(false);
    showToast('Reset!', 900);
  }

  function init() {
    State.canvas = document.getElementById('game');
    State.ctx = State.canvas.getContext('2d');
    addEventListener('resize', resize, { passive: true });
    resize();
    grabUIRefs();
    Input.bind(()=> quickReset());
    setResetVisible(false);
    requestAnimationFrame(loop);
  }

  function applyProfileStyle(style) {
    if (!style) return;
    State.profile.name = style.name || 'USER';
    State.profile.textColor = style.color || '#fff';
    if (style.borderGradient) {
      const m = String(style.borderGradient).match(/(#(?:[0-9a-fA-F]{3,8}))|rgba?\([^)]*\)/);
      State.profile.borderColor = m ? m[0] : (style.borderColor || '#000');
    } else {
      State.profile.borderColor = style.borderColor || '#000';
    }
  }

  function setAdminRainbow(on = true) {
    State.profile.forceAdminRainbow = !!on;
    save('snake_forceAdminRainbow', on ? '1' : '0');
  }

  function getPlayerState() {
    if (!State.player) return null;
    return { name: State.player.name, colors: State.player.colors, x: State.player.x, y: State.player.y, dir: State.player.dir, length: State.player.length };
  }

  return { init, start: startGame, quickReset, applyProfileStyle, netUpsert, netRemove, getPlayerState, setAdminRainbow };
})();

export default Game;
export { Game };
if (typeof window !== 'undefined') window.Game = Game;
