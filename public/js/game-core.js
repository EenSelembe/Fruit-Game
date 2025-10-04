// /public/js/game-core.js
// Engine permainan (render, fisika, input, kamera, buah, rank mini).
// Terintegrasi dengan controller.js, firebase-boot.js, dan mp-firestore.js
// API publik: Game.init(), Game.start(colors,len), Game.quickReset(),
//            Game.applyProfileStyle(style) — (untuk lokal saja),
//            Game.ensureRemote(uid, data), Game.remoteGone(uid),
//            Game.setRemoteOnline(uid, online),
//            Game.getPlayerSnapshot(), Game.setBotNamePool(list)

const Game = (() => {
  /* ===== Helpers ===== */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => Math.random() * (b - a) + a;
  const angNorm = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

  /* ===== Canvas / Camera / World ===== */
  let canvas, ctx, vw = 0, vh = 0, dpr = 1;
  const WORLD = { w: 4200, h: 4200, grid: 90 };
  const camera = { x: WORLD.w / 2, y: WORLD.h / 2, zoom: 1 };

  function resize() {
    vw = innerWidth;
    vh = innerHeight;
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = vw * dpr;
    canvas.height = vh * dpr;
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function worldToScreen(x, y) {
    return { x: (x - camera.x) * camera.zoom + vw / 2, y: (y - camera.y) * camera.zoom + vh / 2 };
  }
  function wrapPos(p) {
    if (p.x < 0) p.x += WORLD.w; else if (p.x >= WORLD.w) p.x -= WORLD.w;
    if (p.y < 0) p.y += WORLD.h; else if (p.y >= WORLD.h) p.y -= WORLD.h;
  }

  /* ===== Game State ===== */
  const foods = [];
  const FRUITS = ['apple', 'orange', 'grape', 'watermelon', 'strawberry', 'lemon', 'blueberry', 'starfruit'];
  let FOOD_COUNT = 1400;

  const snakes = [];
  let player = null;
  const remotes = new Map(); // uid -> snake
  const BOT_NUM = 12;
  let BOT_NAME_POOL = [];
  const RAINBOW = ['#ff5d73','#ffa94d','#ffe066','#58ff9b','#4cfeef','#79a7ff','#a06cff'];

  // UI refs
  let elLen, elUsers, rankRowsEl;

  /* ===== Input ===== */
  const keys = {};
  const pointer = { x: 0, y: 0, down: false };
  let joy, knob, joyState = { ax: 0, ay: 0, active: false };
  let boostHold = false;

  function bindInputs() {
    addEventListener('keydown', (e) => {
      keys[e.key.toLowerCase()] = true;
      if (e.key === 'r' || e.key === 'R') Game.quickReset();
    });
    addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

    addEventListener('pointerdown', (e) => { pointer.down = true; pointer.x = e.clientX; pointer.y = e.clientY; });
    addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; });
    addEventListener('pointerup', () => { pointer.down = false; });
    addEventListener('pointercancel', () => { pointer.down = false; });

    // Joystick (opsional di mobile)
    joy = document.getElementById('joy');
    knob = document.getElementById('knob');
    if (joy && knob) {
      const setKnob = (cx, cy) => { knob.style.left = cx + '%'; knob.style.top = cy + '%'; };
      setKnob(50, 50);
      function handleJoy(e, type) {
        const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let x, y;
        if (e.touches && e.touches[0]) { x = e.touches[0].clientX; y = e.touches[0].clientY; }
        else { x = e.clientX; y = e.clientY; }
        const dx = x - cx, dy = y - cy, rad = r.width / 2, mag = Math.hypot(dx, dy), cl = mag > rad ? rad : mag;
        const nx = mag ? (dx / mag) * cl : 0, ny = mag ? (dy / mag) * cl : 0;
        setKnob((nx / rad) * 50 + 50, (ny / rad) * 50 + 50);
        joyState.ax = (nx / rad);
        joyState.ay = (ny / rad);
        if (type === 'end') { joyState.ax = 0; joyState.ay = 0; setKnob(50, 50); joyState.active = false; }
        else joyState.active = true;
      }
      joy.addEventListener('pointerdown', e => { joy.setPointerCapture(e.pointerId); handleJoy(e, 'start'); });
      joy.addEventListener('pointermove', e => { if (e.pressure > 0) handleJoy(e, 'move'); });
      joy.addEventListener('pointerup', e => { handleJoy(e, 'end'); });
      joy.addEventListener('pointercancel', e => { handleJoy(e, 'end'); });

      const boostBtn = document.getElementById('boostBtn');
      if (boostBtn) {
        boostBtn.addEventListener('pointerdown', () => { boostHold = true; });
        boostBtn.addEventListener('pointerup', () => { boostHold = false; });
        boostBtn.addEventListener('pointercancel', () => { boostHold = false; });
      }
    }
  }

  /* ===== Geometry Helpers ===== */
  function bodyRadius(s) { return 4 + 2 * Math.sqrt(Math.max(0, s.length - 3)); }
  const BASE_SEG_SPACE = 6;
  function segSpace(s) { return Math.max(BASE_SEG_SPACE, bodyRadius(s) * 0.9); }

  /* ===== Snake ===== */
  function createSnake(colors, x, y, isBot = false, len = 3, isAdmin = false) {
    const s = {
      id: Math.random().toString(36).slice(2),
      colors: (isAdmin ? RAINBOW.slice() : colors),
      x, y,
      dir: Math.random() * Math.PI * 2 - Math.PI,
      speedBase: 120, speedMax: 220, v: 0,
      boost: false, energy: 1,
      length: len, baseLen: len, fruitProgress: 0,
      path: [], _pathAcc: 0, alive: true, isBot,
      isRemote: false, remoteFresh: false,
      userName: isBot ? pickBotName() : 'USER',
      nameColor: '#fff',
      nameBorder: '#000',
      glowPhase: Math.random() * Math.PI * 2 // untuk admin glow
    };
    s.path.unshift({ x: s.x, y: s.y });
    return s;
  }
  function pickBotName(){
    if (!BOT_NAME_POOL || BOT_NAME_POOL.length === 0) return 'User';
    const name = BOT_NAME_POOL.shift();
    BOT_NAME_POOL.push(name);
    return name;
  }
  function needForNext(s) { return 10 + Math.max(0, (s.length - s.baseLen)) * 2; }

  function spawnBots(n = BOT_NUM) {
    for (let i = 0; i < n; i++) {
      const b = createSnake(['#79a7ff'], Math.random() * WORLD.w, Math.random() * WORLD.h, true, 3 + Math.floor(Math.random() * 8), false);
      snakes.push(b);
    }
  }

  /* ===== Foods ===== */
  function spawnFood(x = rand(0, WORLD.w), y = rand(0, WORLD.h)) {
    const kind = FRUITS[Math.floor(rand(0, FRUITS.length))];
    foods.push({ kind, x, y, pulse: Math.random() * Math.PI * 2 });
  }
  function ensureFood() { while (foods.length < FOOD_COUNT) spawnFood(); }

  /* ===== Drawing ===== */
  function drawGrid() {
    const step = WORLD.grid * camera.zoom;
    if (step < 14) return;
    const ox = -((camera.x * camera.zoom) % step), oy = -((camera.y * camera.zoom) % step);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox; x < vw; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, vh); }
    for (let y = oy; y < vh; y += step) { ctx.moveTo(0, y); ctx.lineTo(vw, y); }
    ctx.stroke();
  }

  function drawFruit(f) {
    const s = worldToScreen(f.x, f.y);
    if (s.x < -30 || s.y < -30 || s.x > vw + 30 || s.y > vh + 30) return;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(camera.zoom, camera.zoom);

    switch (f.kind) {
      case 'apple': {
        ctx.fillStyle = '#ff4d4d';
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3bdc68';
        ctx.beginPath(); ctx.ellipse(6, -9, 4, 2, -0.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#6b3b12'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, -14); ctx.stroke();
        break;
      }
      case 'orange': {
        ctx.fillStyle = '#ffa94d';
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1;
        for (let a = 0; a < 6; a++) {
          ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a * Math.PI / 3) * 9, Math.sin(a * Math.PI / 3) * 9);
          ctx.stroke();
        }
        break;
      }
      case 'grape': {
        ctx.fillStyle = '#a06cff';
        for (let i = 0; i < 5; i++) {
          const ang = i * 1.256, rx = Math.cos(ang) * 6, ry = Math.sin(ang) * 4;
          ctx.beginPath(); ctx.arc(rx, ry, 4.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#3bdc68'; ctx.beginPath(); ctx.ellipse(-2, -9, 4, 2, 0.3, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'watermelon': {
        ctx.fillStyle = '#ff5d73';
        ctx.beginPath(); ctx.moveTo(-11, 0); ctx.arc(0, 0, 11, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#2ed573'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 11, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = '#111';
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(i * 3, -3, 1.2, 2.4, 0, 0, Math.PI * 2); ctx.fill(); }
        break;
      }
      case 'strawberry': {
        ctx.fillStyle = '#ff4d6d';
        ctx.beginPath();
        ctx.moveTo(0, 10); ctx.quadraticCurveTo(12, 4, 8, -6); ctx.quadraticCurveTo(0, -12, -8, -6);
        ctx.quadraticCurveTo(-12, 4, 0, 10); ctx.fill();
        ctx.fillStyle = '#3bdc68'; ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(0, -14); ctx.lineTo(6, -8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fee440';
        for (let i = -4; i <= 4; i += 4) { for (let j = -2; j <= 6; j += 4) { ctx.beginPath(); ctx.arc(i, j, 1, 0, Math.PI * 2); ctx.fill(); } }
        break;
      }
      case 'lemon': {
        ctx.fillStyle = '#ffe066';
        ctx.beginPath(); ctx.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff385'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 0, 8, 5, 0, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'blueberry': {
        ctx.fillStyle = '#4c6ef5';
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2b2d42';
        ctx.beginPath(); ctx.moveTo(-3, -1); ctx.lineTo(0, -4); ctx.lineTo(3, -1); ctx.lineTo(0, 2); ctx.closePath(); ctx.fill();
        break;
      }
      case 'starfruit': {
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
    }
    ctx.restore();
  }
  function drawFood() { for (const f of foods) drawFruit(f); }

  // Smoothing
  function moveWithBezier(ctx, pts, tension = 0.75) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = (i != pts.length - 2) ? pts[i + 2] : p2, t = tension;
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
    const pts = [];
    for (let i = sn.path.length - 1; i >= 0; i--) {
      const p = sn.path[i]; const s = worldToScreen(p.x, p.y); pts.push({ x: s.x, y: s.y });
    }
    const headNow = worldToScreen(sn.x, sn.y); pts.push({ x: headNow.x, y: headNow.y });
    const segs = []; let cur = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (Math.abs(a.x - b.x) > vw * 0.6 || Math.abs(a.y - b.y) > vh * 0.6) { segs.push(cur); cur = [b]; } else cur.push(b);
    }
    if (cur.length > 1) segs.push(cur); return segs;
  }
  function strokeStripedPath(pts, strokeWidth, colors, outlineWidth = 0, isAdmin = false, glowPhase = 0) {
    if (pts.length < 2) return;
    const smTailHead = chaikinSmooth(pts, 2);

    // outer shadow
    ctx.beginPath(); moveWithBezier(ctx, smTailHead, 0.75);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = strokeWidth + (outlineWidth||0) * 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();

    // stripes
    const cols = (colors && colors.length) ? colors : ['#58ff9b'];
    if (cols.length <= 1) {
      ctx.beginPath(); moveWithBezier(ctx, smTailHead, 0.75);
      ctx.strokeStyle = cols[0]; ctx.lineWidth = strokeWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    } else {
      const smHeadTail = smTailHead.slice().reverse();
      const stripeLen = Math.max(18, strokeWidth * 1.4);
      let acc = 0, colorIdx = 0, segStartIdx = 0;
      function strokeSeg(a, b, col) {
        if (b <= a) return;
        ctx.beginPath(); ctx.moveTo(smHeadTail[a].x, smHeadTail[a].y);
        for (let j = a + 1; j <= b; j++) ctx.lineTo(smHeadTail[j].x, smHeadTail[j].y);
        ctx.strokeStyle = col; ctx.lineWidth = strokeWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      }
      for (let i = 1; i < smHeadTail.length; i++) {
        const dx = smHeadTail[i].x - smHeadTail[i - 1].x, dy = smHeadTail[i].y - smHeadTail[i - 1].y, d = Math.hypot(dx, dy);
        acc += d; if (acc >= stripeLen) { strokeSeg(segStartIdx, i, cols[colorIdx % cols.length]); segStartIdx = i; acc = 0; colorIdx++; }
      }
      strokeSeg(segStartIdx, smHeadTail.length - 1, cols[colorIdx % cols.length]);
    }

    // highlight
    ctx.globalAlpha = 0.22; ctx.beginPath(); moveWithBezier(ctx, smTailHead, 0.75);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, strokeWidth * 0.35); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.globalAlpha = 1;

    // admin glow animate
    if (isAdmin) {
      const glow = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(glowPhase));
      ctx.beginPath(); moveWithBezier(ctx, smTailHead, 0.75);
      ctx.strokeStyle = 'rgba(255,255,255,'+glow.toFixed(2)+')';
      ctx.lineWidth = strokeWidth * 1.35;
      ctx.stroke();
    }
  }

  function drawSnake(sn) {
    if (sn.path.length < 2) return;
    const rPix = bodyRadius(sn) * camera.zoom;
    const segs = screenSegmentsFromSnake(sn);
    for (const seg of segs) {
      if (seg.length < 2) continue;
      strokeStripedPath(seg, rPix * 2, sn.colors, rPix * 0.65, (sn.colors === RAINBOW || isRainbow(sn)), sn.glowPhase);
    }

    // head + mata
    const headS = worldToScreen(sn.x, sn.y), rr = (6.5 + 0.1 * Math.sqrt(sn.length)) * camera.zoom;
    ctx.beginPath(); ctx.arc(headS.x, headS.y, rr, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(headS.x + rr * 0.25, headS.y - rr * 0.15, rr * 0.35, 0, Math.PI * 2); ctx.fillStyle = '#000'; ctx.fill();

    // nameplate (per snake)
    const nscr = worldToScreen(sn.x, sn.y);
    const padX = 34, padY = 16 * camera.zoom;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(nscr.x - padX, nscr.y - 22 * camera.zoom, padX * 2, padY);
    ctx.strokeStyle = sn.nameBorder || '#000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(nscr.x - padX, nscr.y - 22 * camera.zoom, padX * 2, padY);
    ctx.font = `${12 * camera.zoom}px system-ui,Segoe UI`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = sn.nameColor || '#fff';
    ctx.fillText(sn.userName || 'USER', nscr.x, nscr.y - 10 * camera.zoom);
    ctx.restore();
  }
  function isRainbow(sn){ // cek array sama panjang RAINBOW
    const c = sn.colors || [];
    if (c.length !== RAINBOW.length) return false;
    for (let i=0;i<c.length;i++) if (c[i] !== RAINBOW[i]) return false;
    return true;
  }

  /* ===== Physics & Game Loop ===== */
  function updateSnake(s, dt) {
    if (!s.alive) return;

    // admin rainbow warna berdenyut
    if (isRainbow(s)) s.glowPhase += dt * 3.2;

    let targetAngle = s.dir, steerX = 0, steerY = 0;

    if (s.isRemote) {
      // interpolasi menuju target remote (_rx, _ry)
      if (typeof s._rx === 'number' && typeof s._ry === 'number') {
        const dx = s._rx - s.x, dy = s._ry - s.y, dist = Math.hypot(dx, dy);
        targetAngle = Math.atan2(dy, dx);
        const want = clamp(80 + dist * 3.5, s.speedBase * 0.6, s.speedMax * 1.1);
        s.v = lerp(s.v || s.speedBase, want, 0.28);
      } else {
        s.v = lerp(s.v || s.speedBase, s.speedBase, 0.1);
      }
      s.boost = false;
    } else {
      // lokal / bot
      if (keys['w'] || keys['arrowup']) steerY -= 1;
      if (keys['s'] || keys['arrowdown']) steerY += 1;
      if (keys['a'] || keys['arrowleft']) steerX -= 1;
      if (keys['d'] || keys['arrowright']) steerX += 1;

      if (s === player) {
        if (joyState.active && (Math.abs(joyState.ax) + Math.abs(joyState.ay)) > 0.05) targetAngle = Math.atan2(joyState.ay, joyState.ax);
        else if (pointer.down) { const head = worldToScreen(s.x, s.y); targetAngle = Math.atan2(pointer.y - head.y, pointer.x - head.x); }
        else if (steerX || steerY) targetAngle = Math.atan2(steerY, steerX);
        s.boost = boostHold || keys['shift'];
      } else if (s.isBot) {
        const dx = (s.aiTarget?.x ?? s.x) - s.x, dy = (s.aiTarget?.y ?? s.y) - s.y;
        if ((dx * dx + dy * dy) < 140 * 140 || Math.random() < 0.01) {
          s.aiTarget = { x: Math.random() * WORLD.w, y: Math.random() * WORLD.h };
        }
        const ndx = s.aiTarget.x - s.x, ndy = s.aiTarget.y - s.y;
        targetAngle = Math.atan2(ndy, ndx) + (Math.random() * 0.36 - 0.18);
        s.boost = Math.random() < 0.012;
      }
    }

    const MAX_TURN = 3.4, delta = angNorm(targetAngle - s.dir);
    s.dir += Math.max(-MAX_TURN * dt, Math.min(MAX_TURN * dt, delta));

    const want = (s.boost && s.energy > 0.15) ? s.speedMax : s.speedBase;
    if (!s.isRemote) s.v = lerp(s.v || s.speedBase, want, (s.boost ? 0.35 : 0.18));
    if (s.boost && s.energy > 0.15) { s.energy = Math.max(0, s.energy - 0.28 * dt); } else { s.energy = Math.min(1, s.energy + 0.14 * dt); }

    const mv = s.v * dt; s.x += Math.cos(s.dir) * mv; s.y += Math.sin(s.dir) * mv; wrapPos(s);

    const SP = segSpace(s); s._pathAcc += mv; while (s._pathAcc >= SP) { s.path.unshift({ x: s.x, y: s.y }); s._pathAcc -= SP; }
    const maxPath = Math.floor(5.5 * s.length * (BASE_SEG_SPACE / SP)); if (s.path.length > maxPath) s.path.length = maxPath;

    // makan buah (lokal saja — tidak disinkronkan lintas klien, cukup untuk visual)
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i], dx = s.x - f.x, dy = s.y - f.y, eatR = bodyRadius(s) + 10;
      if (dx * dx + dy * dy < eatR * eatR) {
        foods.splice(i, 1);
        s.fruitProgress += 1;
        if (s.fruitProgress >= needForNext(s)) { s.fruitProgress = 0; s.length += 1; }
      }
    }

    // tabrakan (optimistic local)
    for (const o of snakes) {
      if (!o.alive || o === s) continue;
      const rS = bodyRadius(s), rO = bodyRadius(o), thresh = (rS + rO) * 0.7, step = 3;
      for (let i = 6; i < o.path.length; i += step) {
        const p = o.path[i], dx = s.x - p.x, dy = s.y - p.y;
        if (dx * dx + dy * dy < thresh * thresh) { killSnake(s, o); return; }
      }
    }
  }

  function killSnake(s) {
    if (!s.alive) return; s.alive = false;
    for (let i = 0; i < s.path.length; i += Math.max(6, Math.floor(segSpace(s)))) {
      const p = s.path[i]; spawnFood(p.x + (Math.random() * 12 - 6), p.y + (Math.random() * 12 - 6));
    }
    if (s.isBot || s.isRemote) {
      // remote/bot tidak respawn di sini
    } else {
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = 'Kamu tumbang! Tekan Reset untuk main lagi.';
        toast.style.display = 'block'; clearTimeout(killSnake._t);
        killSnake._t = setTimeout(() => toast.style.display = 'none', 1800);
      }
    }
  }

  /* ===== Rank Panel (mini) ===== */
  function updateRankPanel() {
    if (!rankRowsEl) return;
    const top = snakes.filter(s => s.alive).sort((a, b) => b.length - a.length).slice(0, 5);
    rankRowsEl.innerHTML = top.map((s, i) => {
      const me = (s === player) ? ' me' : '';
      return `<div class="rrow${me}"><div class="title">${i + 1}. ${escapeHtml(s.userName||'User')}</div><div class="sub">Len ${s.length}</div></div>`;
    }).join('');
  }
  function escapeHtml(t){ return String(t).replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m])); }

  /* ===== Start/Reset ===== */
  let lastColors = ['#58ff9b'];
  let lastStartLen = 3;

  function startGame(colors, startLen) {
    snakes.splice(0, snakes.length);
    foods.splice(0, foods.length);
    remotes.clear();
    ensureFood();
    spawnBots(BOT_NUM);

    const isAdmin = !!window.App?.isAdmin;
    player = createSnake(colors && colors.length ? colors : ['#58ff9b'],
      Math.random() * WORLD.w * 0.6 + WORLD.w * 0.2,
      Math.random() * WORLD.h * 0.6 + WORLD.h * 0.2,
      false,
      startLen || 3,
      isAdmin
    );
    // apply nameplate dari profile
    const ps = window.App?.profileStyle || {};
    player.userName = ps.name || 'USER';
    player.nameColor = ps.color || '#fff';
    player.nameBorder = ps.borderColor || '#000';
    if (isAdmin) player.colors = RAINBOW.slice();

    snakes.push(player);
    camera.x = player.x; camera.y = player.y; camera.zoom = 1;

    lastColors = (colors && colors.length) ? colors : ['#58ff9b'];
    lastStartLen = startLen || 3;

    if (elLen) elLen.textContent = player.length;
    if (elUsers) elUsers.textContent = snakes.filter(s => s.alive).length;
    updateRankPanel();
  }

  function quickReset() {
    startGame(lastColors, lastStartLen);
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = 'Reset!';
      toast.style.display = 'block'; clearTimeout(quickReset._t);
      quickReset._t = setTimeout(() => toast.style.display = 'none', 900);
    }
  }

  /* ===== Loop ===== */
  let last = performance.now(), rankTimer = 0;
  function stepPhysics(dt) {
    const h = 1 / 60;
    while (dt > 0) {
      const step = Math.min(h, dt);
      for (const s of snakes) updateSnake(s, step);
      dt -= step;
    }
  }
  function loop(now) {
    const frameDt = Math.min(0.1, (now - last) / 1000); last = now;
    stepPhysics(frameDt);

    if (player) {
      const zLen = Math.min(0.5, Math.log10(1 + player.length / 10) * 0.35);
      const zSpeed = Math.min(0.6, (player.v - player.speedBase) / (player.speedMax - player.speedBase + 1e-6)) * 0.45;
      const tZoom = clamp(1.15 - zSpeed - zLen, 0.35, 1.18);
      camera.zoom = lerp(camera.zoom, tZoom, 0.06);
      camera.x = lerp(camera.x, player.x, 0.085);
      camera.y = lerp(camera.y, player.y, 0.085);
    }

    ctx.clearRect(0, 0, vw, vh);
    drawGrid();
    drawFood();
    for (const s of snakes) drawSnake(s);

    if (player) {
      if (elLen) elLen.textContent = player.length;
      if (elUsers) elUsers.textContent = snakes.filter(s => s.alive).length;
    }
    rankTimer += frameDt; if (rankTimer > 0.25) { updateRankPanel(); rankTimer = 0; }

    requestAnimationFrame(loop);
  }

  /* ===== Public / Multiplayer hooks ===== */
  function init() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    elLen = document.getElementById('len');
    elUsers = document.getElementById('userCount');
    rankRowsEl = document.getElementById('rankRows');

    addEventListener('resize', resize, { passive: true }); resize();
    bindInputs();
    requestAnimationFrame(loop);
  }

  // (hanya untuk kompat lama) — sekarang nameplate per-snake
  function applyProfileStyle(style) {
    if (!player || !style) return;
    player.userName = style.name || player.userName;
    player.nameColor = style.color || player.nameColor;
    player.nameBorder = style.borderColor || player.nameBorder;
  }

  function ensureRemote(uid, data) {
    // data: {x,y,dir,len,colors,name,admin}
    let s = remotes.get(uid);
    if (!s) {
      s = createSnake((data.admin ? RAINBOW : (data.colors||['#79a7ff'])),
        Math.random()*WORLD.w, Math.random()*WORLD.h, false, data.len||3, !!data.admin);
      s.isRemote = true;
      s.userName = data.name || 'User';
      s.nameColor = '#fff';
      s.nameBorder = '#000';
      snakes.push(s);
      remotes.set(uid, s);
    }
    s._rx = data.x; s._ry = data.y;
    if (typeof data.len === 'number') s.length = data.len;
    if (Array.isArray(data.colors) && !data.admin) s.colors = data.colors.slice();
    if (data.name) s.userName = data.name;
    if (data.admin) s.colors = RAINBOW.slice();
    s.remoteFresh = true;
  }
  function remoteGone(uid) {
    const s = remotes.get(uid);
    if (!s) return;
    const idx = snakes.indexOf(s);
    if (idx >= 0) snakes.splice(idx, 1);
    remotes.delete(uid);
  }
  function setRemoteOnline(uid, online) {
    const s = remotes.get(uid);
    if (!s) return;
    if (!online) {
      // jadikan bot lokal sementara
      s.isRemote = false;
      s.isBot = true;
      s.aiTarget = { x: Math.random() * WORLD.w, y: Math.random() * WORLD.h };
    } else {
      s.isRemote = true;
      s.isBot = false;
    }
  }

  function getPlayerSnapshot() {
    if (!player) return null;
    return { x: player.x, y: player.y, dir: player.dir, v: player.v, length: player.length, alive: player.alive };
  }

  function setBotNamePool(list){ BOT_NAME_POOL = Array.isArray(list) ? list.slice() : []; }

  return {
    init,
    start: startGame,
    quickReset,
    applyProfileStyle,
    ensureRemote,
    remoteGone,
    setRemoteOnline,
    getPlayerSnapshot,
    setBotNamePool
  };
})();

// Ekspor & global
export default Game;
export { Game };
if (typeof window !== 'undefined') window.Game = Game;
