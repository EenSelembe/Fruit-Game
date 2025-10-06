// public/js/core/snake.js
// === Snake logic module (tanpa import) ===
// Mengandalkan global dari game-core.js:
//   window.GameState, window.GameUtils, window.GameRender, window.GameFood, window.GameUI, window.GameInput

/* ================== Config Warna ================== */
const RAINBOW = ["#ff0055","#ff7b00","#ffee00","#00d26a","#00b3ff","#6950ff"];
const BOT_PALETTES = [
  ["#79a7ff","#7cffea"], ["#ff9a76","#ffd166"],
  ["#8aff80","#4df0c3"], ["#b48cff","#7e5bef"],
  ["#ff6fb5","#ffa6c1"], ["#00e5ff","#00ffa3"],
  ["#ffa552","#ffd166"], ["#66ff99","#66ffe5"]
];

/* ================== Helpers internal ================== */
function hash32(str=''){
  let h = 2166136261 >>> 0;
  for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
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
function paletteKey(cols){ return cols.map(c=>String(c).toLowerCase()).join('|'); }
function isRainbow(cols){
  if (!Array.isArray(cols) || cols.length !== RAINBOW.length) return false;
  const a = cols.map(c=>c.toLowerCase()).join('|');
  const b = RAINBOW.map(c=>c.toLowerCase()).join('|');
  return a === b;
}
function paletteUsed(cols){
  const State = window.GameState;
  const key = paletteKey(cols);
  for (const s of State.snakes) {
    if (s.isAdminRainbow) continue;
    if (paletteKey(s.colors) === key) return true;
  }
  return false;
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

/* ================== Geometry & Growth ================== */
export function bodyRadius(s){ return 4 + 2*Math.sqrt(Math.max(0, s.length-3)); }
const BASE_SEG_SPACE = 6;
export function segSpace(s){ return Math.max(BASE_SEG_SPACE, bodyRadius(s)*0.9); }
export function needForNext(s){ return 10 + Math.max(0,(s.length - s.baseLen))*2; }

/* ================== Creation & Registry ================== */
const BOOST_LENGTH_DRAIN_PER_SEC = 1; // turbo: 1 poin/detik (integer via accumulator)

export function ensureUniqueColors(s, preferred=null){
  if (s.isAdminRainbow) { s.colors = RAINBOW.slice(); return; }
  s.colors = pickUniquePalette(preferred || s.colors, s.uid || s.id);
}
export function createSnake(colors, x, y, isBot=false, len=3, name='USER', uid=null, nameColor='#fff', borderColor='#000') {
  const State = window.GameState;
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
    fruitsEaten: 0,
    _eatTimer: 0
  };
  ensureUniqueColors(s);
  s.path.unshift({ x: s.x, y: s.y });
  return s;
}
export function registerSnake(s){ const State=window.GameState; State.snakes.push(s); if (s.uid) State.snakesByUid.set(s.uid, s); }
export function removeSnake(s){ const State=window.GameState; const i=State.snakes.indexOf(s); if(i>=0) State.snakes.splice(i,1); if(s.uid) State.snakesByUid.delete(s.uid); }
export function wrapPos(p) {
  const W = window.GameState.WORLD;
  if (p.x < 0) p.x += W.w; else if (p.x >= W.w) p.x -= W.w;
  if (p.y < 0) p.y += W.h; else if (p.y >= W.h) p.y -= W.h;
}

/* ================== AI & Physics ================== */
export function updateSnake(s, dt) {
  const State = window.GameState;
  const Input = window.GameInput;
  const { angNorm, lerp } = window.GameUtils;

  if (!s.alive) return;

  let targetAngle = s.dir;

  if (s === State.player) {
    const t = Input.getTargetAngleForPlayer(s.x, s.y);
    if (t !== null) targetAngle = t;
    s.boost = Input.boostHold || Input.keys['shift'];
  } else if (s.isBot || s.isRemote === false) {
    const aggro = Math.max(0.4, Math.min(1.4, s.aiAggro || 0.7));
    const skill = s.aiSkill || 0.8;

    // prey kecil
    let prey = null, preyDist2 = 1e12;
    const killSense = 420 * aggro;
    for (const o of State.snakes) {
      if (!o.alive || o === s) continue;
      const dx = o.x - s.x, dy = o.y - s.y, d2 = dx*dx + dy*dy;
      if (o.length + 2 < s.length && d2 < killSense*killSense && d2 < preyDist2) { prey = o; preyDist2 = d2; }
    }
    // food terdekat
    let bestFood = null, bestD2 = 520 * 520;
    for (const f of State.foods) {
      const dx = f.x - s.x, dy = f.y - s.y, d2 = dx*dx + dy*dy;
      if (d2 < bestD2) { bestD2 = d2; bestFood = f; }
    }
    // target
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

  // makan buah
  for (let i = State.foods.length - 1; i >= 0; i--) {
    const f = State.foods[i], dx2 = s.x - f.x, dy2 = s.y - f.y, eatR = bodyRadius(s) + 10;
    if (dx2*dx2 + dy2*dy2 < eatR*eatR) {
      window.GameFood.spawnSuckBurst(f.kind, f.x, f.y, s.id); // efek sedot
      s._eatTimer = performance.now();                        // mulut buka 200ms
      State.foods.splice(i,1);
      s.fruitsEaten = (s.fruitsEaten|0) + 1;

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

/* ================== Death & Respawn ================== */
export function killSnake(s) {
  const State = window.GameState;
  if (!s.alive) return;
  s.alive = false;

  // drop buah sebanyak yang dimakan
  const count = Math.max(0, Math.floor(s.fruitsEaten || 0));
  if (count > 0) {
    const path = (s.path && s.path.length) ? s.path : [{ x: s.x, y: s.y }];
    const L = path.length;
    for (let k = 0; k < count; k++) {
      const t = (L > 1) ? Math.min(L - 1, Math.floor((k / Math.max(1,count-1)) * (L - 1))) : 0;
      const p = path[t];
      window.GameFood.spawnFood(p.x + (Math.random()*14 - 7), p.y + (Math.random()*14 - 7));
    }
  }

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
    window.GameUI.setResetVisible(true); // tombol Restart
    window.GameUI.showToast('Kamu kalah! Tekan Restart untuk main lagi.', 1800);
  }
}

/* ================== Offline Bots ================== */
export function hashToPos(uid){
  const State = window.GameState;
  let h = 2166136261 >>> 0;
  for (let i=0;i<uid.length;i++){ h ^= uid.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return { x: (h % State.WORLD.w), y: ((h>>>1) % State.WORLD.h) };
}
export function spawnOfflineAsBots(maxCount=12) {
  const State = window.GameState;
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

/* ================== Rendering helpers (striped body) ================== */
function moveWithBezier(ctx, pts, tension = 0.75) {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[i], p1 = pts[i], p2 = pts[i + 1],
          p3 = (i !== pts.length - 2) ? pts[i + 2] : p2, t = tension;
    const cp1x = p1.x + (p2.x - p0.x) * t / 6, cp1y = p1.y + (p2.y - p0.y) * t / 6;
    const cp2x = p2.x - (p3.x - p1.x) * t / 6, cp2y = p2.y - (p3.y - p1.y) * t / 6;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}
function chaikinSmooth(pts, iterations = 2) {
  let out = pts.slice();
  for (let k = 0; k < iterations; k++) {
    const res = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const p = out[i], q = out[i + 1];
      const Q = { x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 };
      const R = { x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 };
      res.push(Q, R);
    }
    res.push(out[out.length - 1]); out = res;
  }
  return out;
}
function screenSegmentsFromSnake(sn) {
  const State = window.GameState;
  const worldToScreen = window.GameRender.worldToScreen;
  const pts = [];
  for (let i = sn.path.length - 1; i >= 0; i--) {
    const p = sn.path[i]; const s = worldToScreen(p.x, p.y); pts.push({ x: s.x, y: s.y });
  }
  const headNow = worldToScreen(sn.x, sn.y); pts.push({ x: headNow.x, y: headNow.y });
  const segs = []; let cur = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (Math.abs(a.x - b.x) > State.vw * 0.6 || Math.abs(a.y - b.y) > State.vh * 0.6) { segs.push(cur); cur = [b]; }
    else cur.push(b);
  }
  if (cur.length > 1) segs.push(cur);
  return segs;
}
function strokeStripedPath(ctx, pts, strokeWidth, colors, outlineWidth = 0, glow = false) {
  if (pts.length < 2) return;
  const smTailHead = chaikinSmooth(pts, 2);

  // outline
  if (outlineWidth > 0) {
    ctx.beginPath(); moveWithBezier(ctx, smTailHead, 0.75);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = strokeWidth + outlineWidth * 2;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke();
  }

  const cols = (colors && colors.length) ? colors : ['#58ff9b'];
  if (cols.length <= 1) {
    ctx.beginPath(); moveWithBezier(ctx, smTailHead, 0.75);
    ctx.strokeStyle = cols[0];
    ctx.lineWidth = strokeWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (glow) { ctx.shadowBlur = 14; ctx.shadowColor = cols[0]; }
    ctx.stroke(); if (glow) { ctx.shadowBlur = 0; }
  } else {
    const smHeadTail = smTailHead.slice().reverse();
    const stripeLen = Math.max(18, strokeWidth * 1.4);
    let acc = 0, colorIdx = 0, segStartIdx = 0;
    function strokeSeg(a, b, col) {
      if (b <= a) return;
      ctx.beginPath(); ctx.moveTo(smHeadTail[a].x, smHeadTail[a].y);
      for (let j = a + 1; j <= b; j++) ctx.lineTo(smHeadTail[j].x, smHeadTail[j].y);
      ctx.strokeStyle = col;
      ctx.lineWidth = strokeWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (glow) { ctx.shadowBlur = 14; ctx.shadowColor = col; }
      ctx.stroke();
      if (glow) ctx.shadowBlur = 0;
    }
    for (let i = 1; i < smHeadTail.length; i++) {
      const dx = smHeadTail[i].x - smHeadTail[i - 1].x, dy = smHeadTail[i].y - smHeadTail[i - 1].y, d = Math.hypot(dx, dy);
      acc += d;
      if (acc >= stripeLen) { strokeSeg(segStartIdx, i, cols[colorIdx % cols.length]); segStartIdx = i; acc = 0; colorIdx++; }
    }
    strokeSeg(segStartIdx, smHeadTail.length - 1, cols[colorIdx % cols.length]);
  }

  // highlight
  ctx.globalAlpha = 0.22;
  ctx.beginPath(); moveWithBezier(ctx, smTailHead, 0.75);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, strokeWidth * 0.35);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/* ================ Draw Snake (eyes + mouth open on eat) ================ */
export function drawSnake(ctx, sn) {
  const State = window.GameState;
  const worldToScreen = window.GameRender.worldToScreen;
  if (!sn.path.length) return;

  const rPix = bodyRadius(sn) * State.camera.zoom;
  const segs = screenSegmentsFromSnake(sn);

  // body
  for (const seg of segs) {
    if (seg.length < 2) continue;
    strokeStripedPath(ctx, seg, rPix * 2, sn.colors, rPix * 0.65, sn.isAdminRainbow);
  }

  // head + eyes + mouth
  const headS = worldToScreen(sn.x, sn.y);
  const rr = (6.5 + 0.1 * Math.sqrt(sn.length)) * State.camera.zoom;

  // head
  ctx.beginPath();
  ctx.arc(headS.x, headS.y, rr, 0, Math.PI * 2);
  ctx.fillStyle = sn.colors && sn.colors.length ? sn.colors[0] : '#58ff9b';
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.stroke();

  const dir = sn.dir;

  // two eyes
  const eyeOffsetX = Math.cos(dir + Math.PI / 2) * rr * 0.45;
  const eyeOffsetY = Math.sin(dir + Math.PI / 2) * rr * 0.45;
  const eyes = [
    { x: headS.x + eyeOffsetX, y: headS.y + eyeOffsetY },
    { x: headS.x - eyeOffsetX, y: headS.y - eyeOffsetY }
  ];
  for (const e of eyes) {
    ctx.beginPath(); ctx.arc(e.x, e.y, rr * 0.33, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill();

    ctx.beginPath();
    ctx.arc(e.x + Math.cos(dir) * rr * 0.15, e.y + Math.sin(dir) * rr * 0.15, rr * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = "#000"; ctx.fill();
  }

  // mouth (opens ~200ms after eat)
  const mouthOpen = (sn._eatTimer && performance.now() - sn._eatTimer < 200);
  const mouthSize = mouthOpen ? rr * 0.8 : rr * 0.4;
  const mx = headS.x + Math.cos(dir) * rr * 0.7;
  const my = headS.y + Math.sin(dir) * rr * 0.7;
  ctx.beginPath();
  ctx.ellipse(mx, my, mouthSize * 0.5, rr * 0.25, dir, 0, Math.PI * 2);
  ctx.fillStyle = "#300";
  ctx.fill();

  // nameplate
  const padX = 34, padY = 16 * State.camera.zoom;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(headS.x - padX, headS.y - 22 * State.camera.zoom, padX * 2, padY);
  ctx.strokeStyle = sn.borderColor || '#000';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(headS.x - padX, headS.y - 22 * State.camera.zoom, padX * 2, padY);
  ctx.font = `${12 * State.camera.zoom}px system-ui,Segoe UI`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = sn.nameColor || '#fff';
  ctx.fillText(sn.name || 'USER', headS.x, headS.y - 10 * State.camera.zoom);
  ctx.restore();
    }
