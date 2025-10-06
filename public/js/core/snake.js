// public/js/core/snake.js
import { State } from './state.js';
import { clamp, lerp, angNorm } from './utils.js';
import { spawnFood } from './food.js';
import { setResetVisible, showToast } from './ui.js';
import { RAINBOW, BOT_PALETTES, AI } from './config.js';
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
    nameColor, borderColor,
    aiSkill: 0.8,      // akurasi steering & menghindar
    aiAggro: 0.7       // seberapa agresif berburu (non-admin < 1, admin > 1)
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

  let targetAngle = s.dir;

  if (s === State.player) {
    const t = Input.getTargetAngleForPlayer(s.x, s.y);
    if (t !== null) targetAngle = t;
    s.boost = Input.boostHold || Input.keys['shift'];
  } else if (s.isBot || s.isRemote === false) {
    // ===== AI: kurang agresif untuk bot biasa, agresif untuk admin bot =====
    const aggro = Math.max(0.4, Math.min(1.4, s.aiAggro || 0.7)); // non-admin ~0.65, admin ~1.15
    const skill = s.aiSkill || 0.8;

    // 1) Cari mangsa (lebih kecil) dalam radius tergantung aggro
    const killSense = AI.KILL_SENSE * aggro; // admin lebih jauh melihat mangsa
    let prey = null, preyDist2 = 1e12;
    for (const o of State.snakes) {
      if (!o.alive || o === s) continue;
      const dx = o.x - s.x, dy = o.y - s.y, d2 = dx*dx + dy*dy;
      if (o.length + 2 < s.length && d2 < killSense*killSense && d2 < preyDist2) { prey = o; preyDist2 = d2; }
    }

    // 2) Cari buah terdekat
    let bestFood = null, bestD2 = AI.FOOD_SENSE * AI.FOOD_SENSE;
    for (const f of State.foods) {
      const dx = f.x - s.x, dy = f.y - s.y, d2 = dx*dx + dy*dy;
      if (d2 < bestD2) { bestD2 = d2; bestFood = f; }
    }

    // 3) Tentukan target:
    //    - Bot biasa: lebih memilih buah, hanya kejar mangsa bila sangat dekat atau sesekali random kecil
    //    - Admin bot: prioritas mangsa ketika ada
    let target = s.aiTarget;
    const preyClose = prey && Math.sqrt(preyDist2) < killSense;
    const huntBias = 0.15 * aggro;   // peluang "tetap kejar" meski tidak terlalu dekat
    const preferPrey = prey && (preyClose || (!bestFood && Math.random() < huntBias));

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

    // 4) Arah ke target
    let vx = target.x - s.x, vy = target.y - s.y;
    const vlen = Math.hypot(vx, vy) || 1; vx /= vlen; vy /= vlen;

    // 5) Hindari bahaya (tidak dikurangi untuk admin — tetap pintar menghindar)
    let ax = 0, ay = 0, dangerMax = 0;
    const R2 = AI.DANGER_RADIUS * AI.DANGER_RADIUS;
    for (const o of State.snakes) {
      if (!o.alive || o === s) continue;
      const step = 4;

      for (let i = 8; i < o.path.length; i += step) {
        const p = o.path[i], dx = s.x - p.x, dy = s.y - p.y, d2 = dx*dx + dy*dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 1;
          const w = (AI.DANGER_RADIUS - d) / AI.DANGER_RADIUS;
          ax += (dx/d) * w; ay += (dy/d) * w; dangerMax = Math.max(dangerMax, w);
        }
      }
      const hdx = s.x - o.x, hdy = s.y - o.y, hd2 = hdx*hdx + hdy*hdy;
      if (hd2 < R2) {
        const d = Math.sqrt(hd2) || 1;
        const w = ((AI.DANGER_RADIUS - d) / AI.DANGER_RADIUS) * (o.length >= s.length ? 1.4 : 0.8);
        ax += (hdx/d) * w; ay += (hdy/d) * w; dangerMax = Math.max(dangerMax, w);
      }
    }

    // 6) Gabungkan
    const avoidWeight = AI.DANGER_WEIGHT * skill;
    let cx = vx + ax * avoidWeight + (Math.random()*2 - 1) * AI.JITTER * 0.35;
    let cy = vy + ay * avoidWeight + (Math.random()*2 - 1) * AI.JITTER * 0.35;

    targetAngle = Math.atan2(cy, cx);

    // 7) Boost: non-admin dikurangi, admin ditingkatkan
    s.boost = false;
    if (preferPrey && s.energy > 0.2) {
      const huntBoostProb = AI.BOOST_HUNT * skill * (0.3 + 0.7*aggro); // non-admin < admin
      if (Math.random() < huntBoostProb) s.boost = true;
    }
    const dangerThresh = AI.BOOST_DANGER * (1.05 - 0.30*aggro); // admin lebih mudah boost saat bahaya
    if (dangerMax > dangerThresh && s.energy > 0.15) s.boost = true;
  }

  const MAX_TURN = 3.4, delta = angNorm(targetAngle - s.dir);
  s.dir += Math.max(-MAX_TURN*dt, Math.min(MAX_TURN*dt, delta));

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

  for (let i = State.foods.length - 1; i >= 0; i--) {
    const f = State.foods[i], dx2 = s.x - f.x, dy2 = s.y - f.y, eatR = bodyRadius(s) + 10;
    if (dx2*dx2 + dy2*dy2 < eatR*eatR) {
      State.foods.splice(i,1);
      s.fruitProgress += 1;
      if (s.fruitProgress >= needForNext(s)) { s.fruitProgress = 0; s.length += 1; }
    }
  }

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

    const pal = BOT_PALETTES[Math.floor(Math.random()*BOT_PALETTES.length)];
    const s = createSnake(pal, p.x, p.y, true,
      3 + Math.floor(Math.random()*8), u.name, uid, nameColor, borderCol);

    if (u.isAdmin) {
      s.colors = RAINBOW.slice();
      s.isAdminRainbow = true;
      s.aiAggro = 1.15;   // admin bot agresif
      s.aiSkill = 0.95;   // dan lincah
    } else {
      s.aiAggro = 0.65;   // bot biasa lebih kalem
      s.aiSkill = 0.8;    // tetap cukup pintar menghindar
    }

    registerSnake(s);
  }
                                    }
