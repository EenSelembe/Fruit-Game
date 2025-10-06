// public/js/core/food.js
import { State } from './state.js';
import { rand } from './utils.js';
import { worldToScreen } from './camera.js';

// ===== Jenis buah =====
export const FRUITS = [
  'apple','orange','grape','watermelon','strawberry','lemon','blueberry','starfruit'
];

// ===== Warna aura & partikel per buah =====
const FRUIT_COLOR = {
  apple:      '#ff4d4d',
  orange:     '#ffa94d',
  grape:      '#a06cff',
  watermelon: '#ff5d73',
  strawberry: '#ff4d6d',
  lemon:      '#ffe066',
  blueberry:  '#4c6ef5',
  starfruit:  '#e9ff70'
};

// ===== GLOW (statis, hemat) =====
const GLOW_ALPHA = 0.35;      // 0..1
const GLOW_BASE_RADIUS = 18;  // radius relatif (bukan px canvas)

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
  const SZ = 128, c = document.createElement('canvas');
  c.width = SZ; c.height = SZ;
  const x = c.getContext('2d');
  const cx = SZ/2, cy = SZ/2, rOut = SZ*0.45;
  const grad = x.createRadialGradient(cx,cy,rOut*0.15, cx,cy,rOut);
  grad.addColorStop(0.00, `rgba(${r},${g},${b},0.85)`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(0.70, `rgba(${r},${g},${b},0.20)`);
  grad.addColorStop(1.00, `rgba(${r},${g},${b},0.00)`);
  x.fillStyle = grad;
  x.beginPath(); x.arc(cx, cy, rOut, 0, Math.PI*2); x.fill();
  return c;
}
function getGlowSprite(kind) {
  if (!glowCache.has(kind)) glowCache.set(kind, makeGlowSprite(kind));
  return glowCache.get(kind);
}

// ===== Data =====
export function spawnFood(x = rand(0, State.WORLD.w), y = rand(0, State.WORLD.h)) {
  const kind = FRUITS[Math.floor(rand(0, FRUITS.length))];
  State.foods.push({ kind, x, y });
}

// Isi ulang sampai kuota tercapai
export function ensureFood() {
  while (State.foods.length < State.FOOD_COUNT) spawnFood();
}

// ===== Efek sedot (partikel) =====
const suckFX = []; // { kind, snakeId, start, dur, pieces:[...] }

function getSnakeById(id) {
  for (const s of State.snakes) if (s.id === id) return s;
  return null;
}

// dipanggil dari snake.js saat makan
export function spawnSuckBurst(kind, x, y, snakeId) {
  const N = 10;
  const now = performance.now();
  const dur = 360 + Math.random()*140;
  const pieces = [];
  for (let i=0;i<N;i++){
    const ang = Math.random()*Math.PI*2;
    const rad = Math.random()*4.5;
    const sx = x + Math.cos(ang)*rad;
    const sy = y + Math.sin(ang)*rad;
    const px = (Math.random()*2 - 1) * 28;
    const py = (Math.random()*2 - 1) * 28;
    const delay = Math.random()*80;
    const life = 240 + Math.random()*180;
    pieces.push({ sx,sy,px,py,delay,life,done:false });
  }
  suckFX.push({ kind, snakeId, start: now, dur, pieces });
}

function updateAndDrawSuckFX(ctx) {
  if (!suckFX.length) return;
  const now = performance.now();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = suckFX.length - 1; i >= 0; i--) {
    const fx = suckFX[i];
    const snake = getSnakeById(fx.snakeId);
    const tx = snake ? snake.x : (fx.pieces?.[0]?.sx ?? 0);
    const ty = snake ? snake.y : (fx.pieces?.[0]?.sy ?? 0);
    let allDone = true;

    for (const p of fx.pieces) {
      const tNow = now - fx.start - p.delay;
      if (tNow < 0) { allDone = false; continue; }
      const u = Math.min(1, tNow / p.life);
      if (u < 1) allDone = false;

      const cx = (p.sx + tx) * 0.5 + p.px;
      const cy = (p.sy + ty) * 0.5 + p.py;
      const a = 1 - u;
      const bx = a*a*p.sx + 2*a*u*cx + u*u*tx;
      const by = a*a*p.sy + 2*a*u*cy + u*u*ty;

      const scr = worldToScreen(bx, by);
      const zz = State.camera.zoom;
      const scale = (1 - u)*0.9 + 0.1;
      const r = (2.5 + Math.random()*0.2) * zz * scale;
      const col = FRUIT_COLOR[fx.kind] || '#ffffff';
      const alpha = 0.85 * (1 - u*u);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, r, 0, Math.PI*2);
      ctx.fill();
    }

    if (allDone) suckFX.splice(i, 1);
  }
  ctx.restore();
}

// ===== Render =====
export function drawFruit(ctx, f) {
  const s = worldToScreen(f.x, f.y);
  if (s.x < -30 || s.y < -30 || s.x > State.vw + 30 || s.y > State.vh + 30) return;

  const zz = State.camera.zoom;

  // Glow hemat
  const spr = getGlowSprite(f.kind);
  const size = (GLOW_BASE_RADIUS * 2) * zz;
  ctx.save();
  ctx.globalAlpha = GLOW_ALPHA;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(spr, s.x - size/2, s.y - size/2, size, size);
  ctx.restore();

  // Bentuk buah
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(zz, zz);

  switch (f.kind) {
    case 'apple':
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3bdc68';
      ctx.beginPath(); ctx.ellipse(6, -9, 4, 2, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6b3b12'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, -14); ctx.stroke();
      break;
    case 'orange':
      ctx.fillStyle = '#ffa94d';
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1;
      for (let a = 0; a < 6; a++) {
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a * Math.PI / 3) * 9, Math.sin(a * Math.PI / 3) * 9);
        ctx.stroke();
      }
      break;
    case 'grape':
      ctx.fillStyle = '#a06cff';
      for (let i = 0; i < 5; i++) {
        const ang = i * 1.256, rx = Math.cos(ang) * 6, ry = Math.sin(ang) * 4;
        ctx.beginPath(); ctx.arc(rx, ry, 4.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#3bdc68';
      ctx.beginPath(); ctx.ellipse(-2, -9, 4, 2, 0.3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'watermelon':
      ctx.fillStyle = '#ff5d73';
      ctx.beginPath(); ctx.moveTo(-11, 0); ctx.arc(0, 0, 11, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2ed573'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 11, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#111';
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(i * 3, -3, 1.2, 2.4, 0, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'strawberry':
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.quadraticCurveTo(12, 4, 8, -6);
      ctx.quadraticCurveTo(0, -12, -8, -6);
      ctx.quadraticCurveTo(-12, 4, 0, 10);
      ctx.fill();
      ctx.fillStyle = '#3bdc68';
      ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(0, -14); ctx.lineTo(6, -8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fee440';
      for (let i = -4; i <= 4; i += 4) {
        for (let j = -2; j <= 6; j += 4) { ctx.beginPath(); ctx.arc(i, j, 1, 0, Math.PI * 2); ctx.fill(); }
      }
      break;
    case 'lemon':
      ctx.fillStyle = '#ffe066';
      ctx.beginPath(); ctx.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff385'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 0, 8, 5, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'blueberry':
      ctx.fillStyle = '#4c6ef5';
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2b2d42';
      ctx.beginPath(); ctx.moveTo(-3, -1); ctx.lineTo(0, -4); ctx.lineTo(3, -1); ctx.lineTo(0, 2); ctx.closePath(); ctx.fill();
      break;
    case 'starfruit':
      ctx.fillStyle = '#e9ff70';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
        const x1 = Math.cos(a) * 11, y1 = Math.sin(a) * 11;
        const x2 = Math.cos(a + Math.PI / 5) * 5, y2 = Math.sin(a + Math.PI / 5) * 5;
        if (i === 0) ctx.moveTo(x1, y1); else ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 1; ctx.stroke();
      break;
  }

  ctx.restore();
}

// Gambar semua buah + efek sedot + refill cepat
export function drawFood(ctx) {
  // refill cepat setiap frame → buah langsung muncul lagi sampai kuota
  ensureFood();
  for (const f of State.foods) drawFruit(ctx, f);
  updateAndDrawSuckFX(ctx);
                                          }
