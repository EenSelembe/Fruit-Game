// public/js/core/snake.js
import { State } from './state.js';
import { clamp, lerp, angNorm } from './utils.js';
import { worldToScreen } from './camera.js';
import { spawnFood } from './food.js';
import { setResetVisible, showToast } from './ui.js';
import { RAINBOW } from './config.js';
import { Input } from './input.js';

export function bodyRadius(s){ return 4 + 2*Math.sqrt(Math.max(0, s.length-3)); }
const BASE_SEG_SPACE = 6;
export function segSpace(s){ return Math.max(BASE_SEG_SPACE, bodyRadius(s)*0.9); }
export function needForNext(s){ return 10 + Math.max(0,(s.length - s.baseLen))*2; }

export function createSnake(colors, x, y, isBot=false, len=3, name='USER', uid=null, nameColor='#fff', borderColor='#000') {
  const s = {
    id: Math.random().toString(36).slice(2),
    uid, name,
    colors: (colors && colors.length) ? colors.slice() : ['#58ff9b'],
    x, y,
    dir: Math.random()*Math.PI*2 - Math.PI,
    speedBase: 120, speedMax: 220, v: 0,
    boost: false, energy: 1,
    length: len, baseLen: len, fruitProgress: 0,
    path: [], _pathAcc: 0, alive: true,
    isBot, isRemote: false,
    aiTarget: { x: Math.random()*State.WORLD.w, y: Math.random()*State.WORLD.h },
    isAdminRainbow: false,
    nameColor, borderColor
  };
  s.path.unshift({ x: s.x, y: s.y });
  return s;
}
export function registerSnake(s){ State.snakes.push(s); if (s.uid) State.snakesByUid.set(s.uid, s); }
export function removeSnake(s){ const i=State.snakes.indexOf(s); if(i>=0) State.snakes.splice(i,1); if(s.uid) State.snakesByUid.delete(s.uid); }

export function wrapPos(p) {
  const W = State.WORLD;
  if (p.x < 0) p.x += W.w; else if (p.x >= W.w) p.x -= W.w;
  if (p.y < 0) p.y += W.h; else if (p.y >= W.h) p.y -= W.h;
}

export function updateSnake(s, dt) {
  if (!s.alive) return;

  // target angle & boost
  let targetAngle = s.dir;
  if (s === State.player) {
    const t = Input.getTargetAngleForPlayer(s.x, s.y);
    if (t !== null) targetAngle = t;
    s.boost = Input.boostHold || Input.keys['shift'];
  } else if (s.isBot || s.isRemote === false) {
    const dx = s.aiTarget.x - s.x, dy = s.aiTarget.y - s.y;
    if ((dx*dx + dy*dy) < 140*140) { s.aiTarget.x = Math.random()*State.WORLD.w; s.aiTarget.y = Math.random()*State.WORLD.h; }
    targetAngle = Math.atan2(dy, dx) + (Math.random()*0.36 - 0.18);
    s.boost = Math.random() < 0.012;
  }

  const MAX_TURN = 3.4, delta = angNorm(targetAngle - s.dir);
  s.dir += clamp(delta, -MAX_TURN*dt, MAX_TURN*dt);

  const want = (s.boost && s.energy > 0.15) ? s.speedMax : s.speedBase;
  s.v = lerp(s.v || s.speedBase, want, (s.boost ? 0.35 : 0.18));
  if (s.boost && s.energy > 0.15) s.energy = Math.max(0, s.energy - 0.28*dt);
  else s.energy = Math.min(1, s.energy + 0.14*dt);

  const mv = s.v * dt;
  s.x += Math.cos(s.dir) * mv; s.y += Math.sin(s.dir) * mv;
  wrapPos(s);

  const SP = segSpace(s);
  s._pathAcc += mv;
  while (s._pathAcc >= SP) { s.path.unshift({ x:s.x, y:s.y }); s._pathAcc -= SP; }
  const maxPath = Math.floor(5.5 * s.length * (BASE_SEG_SPACE / SP));
  if (s.path.length > maxPath) s.path.length = maxPath;

  // eat
  for (let i = State.foods.length - 1; i >= 0; i--) {
    const f = State.foods[i], dx2 = s.x - f.x, dy2 = s.y - f.y, eatR = bodyRadius(s) + 10;
    if (dx2*dx2 + dy2*dy2 < eatR*eatR) {
      State.foods.splice(i,1);
      s.fruitProgress += 1;
      if (s.fruitProgress >= needForNext(s)) { s.fruitProgress = 0; s.length += 1; }
    }
  }

  // collisions
  for (const o of State.snakes) {
    if (!o.alive || o === s) continue;
    const rS = bodyRadius(s), rO = bodyRadius(o), thresh = (rS + rO) * 0.7, step = 3;
    for (let i = 6; i < o.path.length; i += step) {
      const p = o.path[i], dx3 = s.x - p.x, dy3 = s.y - p.y;
      if (dx3*dx3 + dy3*dy3 < thresh*thresh) { killSnake(s); return; }
    }
  }
}

export function killSnake(s) {
  if (!s.alive) return;
  s.alive = false;

  // drop foods
  for (let i=0;i<s.path.length;i+=Math.max(6, Math.floor(segSpace(s)))) {
    const p = s.path[i];
    spawnFood(p.x + (Math.random()*12 - 6), p.y + (Math.random()*12 - 6));
  }

  if (s.isRemote) { removeSnake(s); return; }

  if (s.isBot) {
    setTimeout(()=>{
      removeSnake(s);
      const nb = createSnake(['#79a7ff'], Math.random()*State.WORLD.w, Math.random()*State.WORLD.h, true,
        3 + Math.floor(Math.random()*8), s.name, s.uid, s.nameColor, s.borderColor);
      registerSnake(nb);
    }, 700);
  } else if (s === State.player) {
    setResetVisible(true);
    showToast('Kamu tumbang! Tekan Reset untuk main lagi.', 1800);
  }
}

export function hashToPos(uid){
  let h = 2166136261 >>> 0;
  for (let i=0;i<uid.length;i++){ h ^= uid.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return { x: (h % State.WORLD.w), y: ((h>>>1) % State.WORLD.h) };
}

export function spawnOfflineAsBots(maxCount=12) {
  const dir = window.Presence?.UserDir;
  const online = window.Presence?.OnlineUids;
  if (!dir || !online) return;

  const offline = [];
  for (const [uid, u] of dir.entries()) { if (!online.has(uid)) offline.push({ uid, u }); }

  const n = Math.min(maxCount, offline.length);
  for (let i=0;i<n;i++){
    const { uid, u } = offline[i];
    if (State.snakesByUid.has(uid)) continue;
    const p = hashToPos(uid);
    const nameColor = u.style?.color || '#fff';
    const borderCol = u.style?.borderColor || '#000';

    const s = createSnake(['#79a7ff'], p.x, p.y, true, 3 + Math.floor(Math.random()*8), u.name, uid, nameColor, borderCol);
    if (u.isAdmin) { s.colors = RAINBOW.slice(); s.isAdminRainbow = true; }
    registerSnake(s);
  }
}
