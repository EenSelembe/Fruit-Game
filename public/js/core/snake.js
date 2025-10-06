// public/js/core/snake.js
import { State } from './state.js';
import { clamp, lerp, angNorm } from './utils.js';
import { spawnFood, spawnSuckBurst } from './food.js';
import { setResetVisible, showToast } from './ui.js';
import { RAINBOW, BOT_PALETTES } from './config.js';
import { Input } from './input.js';

export function bodyRadius(s){ return 4 + 2*Math.sqrt(Math.max(0, s.length-3)); }
const BASE_SEG_SPACE = 6;
export function segSpace(s){ return Math.max(BASE_SEG_SPACE, bodyRadius(s)*0.9); }
export function needForNext(s){ return 10 + Math.max(0,(s.length - s.baseLen))*2; }

// ===== Palet unik (non-admin tidak boleh sama) =====
function paletteKey(cols){ return cols.map(c=>String(c).toLowerCase()).join('|'); }
function isRainbow(cols){
  if (!Array.isArray(cols) || cols.length !== RAINBOW.length) return false;
  const a = cols.map(c=>c.toLowerCase()).join('|');
  const b = RAINBOW.map(c=>c.toLowerCase()).join('|');
  return a === b;
}
function hexToRgb(hex) {
  let h = String(hex).replace('#','');
  if (h.length === 3) h = h.split('').map(c=>c+c).join('');
  const n = parseInt(h, 16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}
function rgbToHex(r,g,b){
  const s = (v)=>Math.max(0,Math.min(255, v|0)).toString(16).padStart(2,'0');
  return `#${s(r)}${s(g)}${s(b)}`;
}
function shiftHex(hex, amt){
  const {r,g,b} = hexToRgb(hex);
  return rgbToHex(r+amt, g+amt, b+amt);
}
function paletteUsed(cols){
  const key = paletteKey(cols);
  for (const s of State.snakes) {
    if (s.isAdminRainbow) continue; // admin: pelangi
    if (paletteKey(s.colors) === key) return true;
  }
  return false;
}
function hash32(str=''){
  let h = 2166136261 >>> 0;
  for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function nudgePalette(baseCols, seedKey){
  const seed = hash32(seedKey);
  for (let step=1; step<=8; step++){
    const amt = ((seed + step*53) % 31) - 15; // -15..+15
    const trial = baseCols.map(c => shiftHex(c, amt));
    if (!paletteUsed(trial)) return trial;
  }
  return baseCols.slice();
}
function pickUniquePalette(preferred, uidOrId){
  if (preferred && isRainbow(preferred)) return preferred.slice();
  if (preferred && preferred.length && !paletteUsed(preferred)) return preferred.slice();
  const start = BOT_PALETTES.length ? (hash32(uidOrId||'') % BOT_PALETTES.length) : 0;
  for (let i=0;i<BOT_PALETTES.length;i++){
    const pal = BOT_PALETTES[(start+i)%BOT_PALETTES.length];
    if (!paletteUsed(pal)) return pal.slice();
  }
  const base = preferred && preferred.length ? preferred : BOT_PALETTES[0] || ['#58ff9b'];
  return nudgePalette(base, String(uidOrId||Math.random()));
}
export function ensureUniqueColors(s, preferred=null){
  if (s.isAdminRainbow) { s.colors = RAINBOW.slice(); return; }
  s.colors = pickUniquePalette(preferred || s.colors, s.uid || s.id);
}

// ===== Turbo drain (integer per detik) =====
const BOOST_LENGTH_DRAIN_PER_SEC = 1;

export function createSnake(colors, x, y, isBot=false, len=3, name='USER', uid=null, nameColor='#fff', borderColor='#000') {
  const s = {
    id: Math.random().toString(36).slice(2),
    uid, name,
    colors: (colors && colors.length) ? colors.slice() : BOT_PALETTES[Math.floor(Math.random()*BOT_PALETTES.length)],
    x, y,
    dir: Math.random()*Math.PI*2 - Math.PI,
    speedBase: 120, speedMax: 220, v: 0,
    boost: false, energy: 1,
    length: Math.max(1, Math.floor(len)), baseLen: Math.max(1, Math.floor(len)), fruitProgress: 0,
    path: [], _pathAcc: 0, alive: true,
    isBot, isRemote: false,
    aiTarget: { x: Math.random()*State.WORLD.w, y: Math.random()*State.WORLD.h },
    isAdminRainbow: false,
    nameColor, borderColor,
    aiSkill: isBot ? 0.8 : 0.9,
    aiAggro: isBot ? 0.65 : 0.9,
    _lenDrainAcc: 0,
    // ⬇️ hitung total buah yang dimakan (untuk drop saat mati)
    fruitsEaten: 0
  };
  ensureUniqueColors(s);
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

  let targetAngle = s.dir;

  if (s === State.player) {
    const t = Input.getTargetAngleForPlayer(s.x, s.y);
    if (t !== null) targetAngle = t;
    s.boost = Input.boostHold || Input.keys['shift'];
  } else if (s.isBot || s.isRemote === false) {
    const aggro = Math.max(0.4, Math.min(1.4, s.aiAggro || 0.7));
    const skill = s.aiSkill || 0.8;

    // cari mangsa lebih kecil
    let prey = null, preyDist2 = 1e12;
    const killSense = 420 * aggro;
    for (const o of State.snakes) {
      if (!o.alive || o === s) continue;
      const dx = o.x - s.x, dy = o.y - s.y, d2 = dx*dx + dy*dy;
      if (o.length + 2 < s.length && d2 < killSense*killSense && d2 < preyDist2) { prey = o; preyDist2 = d2; }
    }
    // buah terdekat
    let bestFood = null, bestD2 = 520 * 520;
    for (const f of State.foods) {
      const dx = f.x - s.x, dy = f.y - s.y, d2 = dx*dx + dy*dy;
      if (d2 < bestD2) { bestD2 = d2; bestFood = f; }
    }
    // pilih target
    let target = s.aiTarget;
    const preyClose = prey && Math.sqrt(preyDist2) < killSense;
    const huntBias = 0.15 * aggro;
    const preferPrey = s.isAdminRainbow ? !!prey : (prey && (preyClose || (!bestFood && Math.random()<huntBias)));
    if (preferPrey) {
      const lead = Math.min(1, Math.sqrt(preyDist2) / 220);
      target = { x: prey.x + Math.cos(prey.dir)*60*lead, y: prey.y + Math.sin(prey.dir)*60*lead };
    } else if (bestFood) {
      target = { x: bestFood.x, y: bestFood.y };
    } else {
      if ((Math.random() < 0.01) || ((s.x - target.x)**2 + (s.y - target.y)**2) < 140*140) {
        target = { x: Math.random()*State.WORLD.w, y: Math.random()*State.WORLD.h };
      }
    }
    s.aiTarget = target;

    // vektor ke target
    let vx = target.x - s.x, vy = target.y - s.y;
    const vlen = Math.hypot(vx, vy) || 1; vx /= vlen; vy /= vlen;

    // hindari bahaya
    let ax = 0, ay = 0, dangerMax = 0;
    const R2 = 110 * 110;
    for (const o of State.snakes) {
      if (!o.alive || o === s) continue;
      for (let i = 8; i < o.path.length; i += 4) {
        const p = o.path[i], dx = s.x - p.x, dy = s.y - p.y, d2 = dx*dx + dy*dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 1;
          const w = (110 - d) / 110;
          ax += (dx/d) * w; ay += (dy/d) * w; dangerMax = Math.max(dangerMax, w);
        }
      }
      const hdx = s.x - o.x, hdy = s.y - o.y, hd2 = hdx*hdx + hdy*hdy;
      if (hd2 < R2) {
        const d = Math.sqrt(hd2) || 1;
        const w = ((110 - d) / 110) * (o.length >= s.length ? 1.4 : 0.8);
        ax += (hdx/d) * w; ay += (hdy/d) * w; dangerMax = Math.max(dangerMax, w);
      }
    }

    const avoidWeight = 1.25 * skill;
    let cx = vx + ax * avoidWeight + (Math.random()*2 - 1) * 0.18 * 0.35;
    let cy = vy + ay * avoidWeight + (Math.random()*2 - 1) * 0.18 * 0.35;

    targetAngle = Math.atan2(cy, cx);

    // boost
    s.boost = false;
    if (preferPrey && s.energy > 0.2) {
      const huntBoostProb = 0.35 * skill * (s.isAdminRainbow ? 1.2 : (0.3 + 0.7*aggro));
      if (Math.random() < huntBoostProb) s.boost = true;
    }
    const dangerThresh = 0.55 * (s.isAdminRainbow ? 0.85 : (1.05 - 0.30*aggro));
    if (dangerMax > dangerThresh && s.energy > 0.15) s.boost = true;
  }

  // belok
  const MAX_TURN = 3.4, delta = angNorm(targetAngle - s.dir);
  s.dir += Math.max(-MAX_TURN*dt, Math.min(MAX_TURN*dt, delta));

  // kecepatan & energi
  const want = (s.boost && s.energy > 0.15) ? s.speedMax : s.speedBase;
  s.v = lerp(s.v || s.speedBase, want, (s.boost ? 0.35 : 0.18));
  const boosting = (s.boost && s.energy > 0.15);

  if (boosting) {
    s.energy = Math.max(0, s.energy - 0.28*dt);
    // drain panjang integer via accumulator
    s._lenDrainAcc += BOOST_LENGTH_DRAIN_PER_SEC * dt;
    const drop = Math.floor(s._lenDrainAcc);
    if (drop > 0) {
      s.length = Math.max(1, Math.floor(s.length) - drop);
      s._lenDrainAcc -= drop;
    }
  } else {
    s.energy = Math.min(1, s.energy + 0.14*dt);
    s._lenDrainAcc = Math.min(s._lenDrainAcc, 0.999);
  }

  // posisi & path
  const mv = s.v * dt;
  s.x += Math.cos(s.dir) * mv; s.y += Math.sin(s.dir) * mv;
  wrapPos(s);

  const SP = segSpace(s);
  s._pathAcc += mv;
  while (s._pathAcc >= SP) { s.path.unshift({ x:s.x, y:s.y }); s._pathAcc -= SP; }
  const maxPath = Math.floor(5.5 * s.length * (BASE_SEG_SPACE / SP));
  if (s.path.length > maxPath) s.path.length = maxPath;

  // makan buah + efek sedot + hitung total dimakan
  for (let i = State.foods.length - 1; i >= 0; i--) {
    const f = State.foods[i], dx2 = s.x - f.x, dy2 = s.y - f.y, eatR = bodyRadius(s) + 10;
    if (dx2*dx2 + dy2*dy2 < eatR*eatR) {
      spawnSuckBurst(f.kind, f.x, f.y, s.id); // efek sedot
      State.foods.splice(i,1);
      s.fruitsEaten = (s.fruitsEaten|0) + 1;   // ⬅️ hitung total
      s.fruitProgress += 1;
      if (s.fruitProgress >= needForNext(s)) {
        s.fruitProgress = 0;
        s.length = Math.max(1, Math.floor(s.length) + 1);
      }
    }
  }

  // tabrakan
  for (const o of State.snakes) {
    if (!o.alive || o === s) continue;
    const rS = bodyRadius(s), rO = bodyRadius(o), thresh = (rS + rO) * 0.7;
    for (let i = 6; i < o.path.length; i += 3) {
      const p = o.path[i], dx3 = s.x - p.x, dy3 = s.y - p.y;
      if (dx3*dx3 + dy3*dy3 < thresh*thresh) { killSnake(s); return; }
    }
  }
}

export function killSnake(s) {
  if (!s.alive) return;
  s.alive = false;

  // === Drop buah sebanyak total yang dimakan ===
  const count = Math.max(0, Math.floor(s.fruitsEaten || 0));
  if (count > 0) {
    const path = (s.path && s.path.length) ? s.path : [{ x: s.x, y: s.y }];
    const L = path.length;
    for (let k = 0; k < count; k++) {
      const t = (L > 1) ? Math.min(L - 1, Math.floor((k / count) * (L - 1))) : 0;
      const p = path[t];
      const jitterX = (Math.random() * 14 - 7);
      const jitterY = (Math.random() * 14 - 7);
      spawnFood(p.x + jitterX, p.y + jitterY);
    }
  }

  // === Sisa logika kematian ===
  if (s.isRemote) { removeSnake(s); return; }

  if (s.isBot) {
    setTimeout(()=>{
      removeSnake(s);
      const pal = BOT_PALETTES[Math.floor(Math.random()*BOT_PALETTES.length)];
      const nb = createSnake(pal, Math.random()*State.WORLD.w, Math.random()*State.WORLD.h, true,
        3 + Math.floor(Math.random()*8), s.name, s.uid, s.nameColor, s.borderColor);
      registerSnake(nb);
    }, 700);
  } else if (s === State.player) {
    setResetVisible(true); // ⬅️ tampilkan tombol Restart di tengah
    showToast('Kamu kalah! Tekan Restart untuk main lagi.', 1800);
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

    const pal = u.isAdmin ? RAINBOW.slice() : BOT_PALETTES[Math.floor(Math.random()*BOT_PALETTES.length)];
    const s = createSnake(pal, p.x, p.y, true,
      3 + Math.floor(Math.random()*8), u.name, uid, nameColor, borderCol);

    s.isAdminRainbow = !!u.isAdmin;
    if (s.isAdminRainbow) s.colors = RAINBOW.slice();
    else ensureUniqueColors(s);

    s.aiAggro = s.isAdminRainbow ? 1.15 : 0.65;
    s.aiSkill = s.isAdminRainbow ? 0.95 : 0.8;

    registerSnake(s);
  }
}
