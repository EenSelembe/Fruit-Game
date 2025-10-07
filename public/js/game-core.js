// /public/js/game-core.js — ALL-IN-ONE Snake.io
// Tidak butuh file lain: input, UI, food, snake, AI, start modal, saldo (opsional Firebase).
// Kompatibel dengan snackio.html yang kamu kirim.
// -----------------------------------------------------------

// ====== Utility kecil ======
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const angNorm = (a) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
const fmtRp = (n) => (n === Infinity ? "∞" : "Rp " + Math.max(0, Math.floor(+n||0)).toLocaleString("id-ID"));

// ====== Konstanta gameplay ======
const WORLD = { w: 6000, h: 6000, grid: 80 };
const RAINBOW = ["#ff0055","#ff7b00","#ffee00","#00d26a","#00b3ff","#6950ff"];
const BOT_PALETTES = [
  ["#79a7ff","#7cffea"], ["#ff9a76","#ffd166"],
  ["#8aff80","#4df0c3"], ["#b48cff","#7e5bef"],
  ["#ff6fb5","#ffa6c1"], ["#00e5ff","#00ffa3"],
  ["#ffa552","#ffd166"], ["#66ff99","#66ffe5"]
];
const FOOD_TARGET_COUNT = 220;      // banyak buah (cukup ramai)
const BOOST_LENGTH_DRAIN_PER_SEC = 1; // turbo mengurangi panjang per detik (integer)

// ====== State global sederhana ======
const State = {
  canvas: null, ctx: null, vw: 0, vh: 0, dpr: 1,
  camera: { x: WORLD.w/2, y: WORLD.h/2, zoom: 1 },
  foods: [], snakes: [], snakesByUid: new Map(),
  player: null,
  ui: { elLen:null, elUsers:null, rankRowsEl:null, toastEl:null, resetBtnEl:null, canReset:false,
        startBtn:null, startLenInput:null, costColorEl:null, costLenEl:null, costTotalEl:null,
        configPanel:null, saldoHeaderEl:null, saldoModalEl:null, usernameSpan:null },
  // pembelian start terakhir (agar Reset bisa charge ulang)
  lastPurchase: null,
  // efek partikel sedot
  suckBursts: [],
};

// ====== Firebase (opsional) ======
const ADMIN_UID = "AxB4G2xwhiXdJnyDrzn82Xanc4x2";
let FB = { db:null, auth:null, doc:null, updateDoc:null, increment:null, onSnapshot:null, serverTimestamp:null };
let App = { uid:null, isAdmin:false, userRef:null, profile:null, profileStyle:null };
let saldo = 0;

(function wireFirebaseOptional(){
  if (!window.Firebase) return;
  FB = {
    db: window.Firebase.db,
    auth: window.Firebase.auth,
    doc: window.Firebase.doc,
    updateDoc: window.Firebase.updateDoc,
    increment: window.Firebase.increment,
    onSnapshot: window.Firebase.onSnapshot,
    serverTimestamp: window.Firebase.serverTimestamp
  };
  // jika sudah login, siapkan userRef & listen saldo/profil
  const u = FB.auth?.currentUser || null;
  if (!u) return; // kalau belum login, game tetap jalan offline
  App.uid = u.uid;
  App.isAdmin = (u.uid === ADMIN_UID);
  App.userRef = FB.doc(FB.db, "users", u.uid);

  // listen realtime users/<uid>
  try {
    FB.onSnapshot(App.userRef, (snap)=>{
      if (!snap.exists()) return;
      const d = snap.data() || {};
      App.profile = { id:u.uid, ...d };
      App.profileStyle = {
        name: d.name || d.username || "Anonim",
        color: d.color || "#fff",
        borderColor: d.borderColor || "#000"
      };
      saldo = App.isAdmin ? Infinity : Number(d.saldo || 0);
      // update header+modal saldo & nickname style
      if (State.ui.saldoHeaderEl) State.ui.saldoHeaderEl.textContent = fmtRp(saldo);
      if (State.ui.saldoModalEl)  State.ui.saldoModalEl.textContent  = fmtRp(saldo);
      if (State.ui.usernameSpan) {
        State.ui.usernameSpan.textContent = App.profileStyle.name;
        State.ui.usernameSpan.style.color = App.profileStyle.color;
        State.ui.usernameSpan.style.border = `1px solid ${App.profileStyle.borderColor}`;
      }
      // refresh tombol START enable/disable
      refreshCostsAndStart();
    });
  } catch(_){}
})();

async function chargeSaldo(amount){
  if (!App.userRef || App.isAdmin) return true;
  const a = Math.max(0, Math.floor(+amount||0));
  if (saldo < a) return false;
  saldo = Math.max(0, saldo - a); // optimis UI
  if (State.ui.saldoHeaderEl) State.ui.saldoHeaderEl.textContent = fmtRp(saldo);
  if (State.ui.saldoModalEl)  State.ui.saldoModalEl.textContent  = fmtRp(saldo);
  try{
    await FB.updateDoc(App.userRef, {
      saldo: Math.max(0, Math.floor(saldo)),
      consumedSaldo: FB.increment(a),
      lastUpdate: FB.serverTimestamp?.()
    });
  }catch(e){ /* diamkan */ }
  return true;
}

// ====== Canvas / Camera ======
function resize() {
  const vw = innerWidth;
  const vh = innerHeight;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  State.canvas.width = vw * dpr;
  State.canvas.height = vh * dpr;
  State.canvas.style.width = vw + 'px';
  State.canvas.style.height = vh + 'px';
  State.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  State.vw = vw; State.vh = vh; State.dpr = dpr;
}
function worldToScreen(x, y) {
  return {
    x: (x - State.camera.x) * State.camera.zoom + State.vw / 2,
    y: (y - State.camera.y) * State.camera.zoom + State.vh / 2
  };
}

// ====== UI Grabbing & helpers ======
function ensureCenterRestartBtn(){
  let btn = document.getElementById('restart') || document.getElementById('resetOverlay');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'restart';
    btn.textContent = 'Restart';
    document.body.appendChild(btn);
  }
  Object.assign(btn.style, {
    position:'fixed', left:'50%', top:'50%', transform:'translate(-50%,-50%)',
    zIndex:'9999', display:'none',
    padding:'14px 28px', fontSize:'20px', borderRadius:'12px', border:'0',
    cursor:'pointer', background:'#1fffb0', color:'#071a12', fontWeight:'700',
    boxShadow:'0 8px 24px rgba(0,0,0,.25)', letterSpacing:'0.4px'
  });
  State.ui.resetBtnEl = btn;
  return btn;
}
function grabUIRefs() {
  const ui = State.ui;
  ui.elLen       = document.getElementById('len') || ui.elLen;
  ui.elUsers     = document.getElementById('userCount') || ui.elUsers;
  ui.rankRowsEl  = document.getElementById('rankRows') || ui.rankRowsEl;
  ui.toastEl     = document.getElementById('toast') || ui.toastEl;
  ui.saldoHeaderEl = document.getElementById('saldo') || ui.saldoHeaderEl;
  ui.saldoModalEl  = document.getElementById('saldoInModal') || ui.saldoModalEl;
  ui.usernameSpan  = document.getElementById('usernameSpan') || ui.usernameSpan;

  // Start panel bits
  ui.configPanel    = document.getElementById('configPanel');
  ui.startBtn       = document.getElementById('startBtn');
  ui.startLenInput  = document.getElementById('startLenInput');
  ui.costColorEl    = document.getElementById('costColor');
  ui.costLenEl      = document.getElementById('costLen');
  ui.costTotalEl    = document.getElementById('costTotal');

  // Pindahkan Rank ke kiri-bawah (paksa)
  const rankPanel = document.getElementById('rankPanel');
  if (rankPanel) {
    Object.assign(rankPanel.style, {
      position:'fixed', left:'10px', bottom:'10px', right:'auto', top:'auto',
      width:'220px', zIndex:'50'
    });
  }
  return ensureCenterRestartBtn();
}
function setResetVisible(show) {
  const btn = State.ui.resetBtnEl || ensureCenterRestartBtn();
  btn.style.display = show ? 'block' : 'none';
  State.ui.canReset = !!show;
}
function showToast(msg, dur=1200){
  const t = State.ui.toastEl; if (!t) return;
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> (t.style.display='none'), dur);
}
function updateHUDCounts(){
  const { elLen, elUsers } = State.ui;
  if (State.player && elLen) elLen.textContent = Math.max(1, Math.floor(State.player.length));
  if (elUsers) elUsers.textContent = State.snakes.filter(s=>s.alive).length;
}
function updateRankPanel(){
  const el = State.ui.rankRowsEl; if (!el) return;
  const top = State.snakes.filter(s=>s.alive).sort((a,b)=>b.length-a.length).slice(0,5);
  el.innerHTML = top.map((s,i)=>`
    <div class="rrow${s===State.player?' me':''}">
      <div class="title">${i+1}. ${s.name||'USER'}</div>
      <div class="sub">Len ${Math.max(1, Math.floor(s.length))}</div>
    </div>`).join('');
}

// ====== Input (mouse/touch/keyboard + boost) ======
const Input = (() => {
  const keys = {};
  let boostHold = false;
  let aim = { x:null, y:null, active:false };

  function init(canvas){
    canvas.addEventListener('pointerdown', (e)=>{ aim.active=true; aim.x=e.clientX; aim.y=e.clientY; }, {passive:true});
    addEventListener('pointermove', (e)=>{ if(aim.active){ aim.x=e.clientX; aim.y=e.clientY; } }, {passive:true});
    addEventListener('pointerup',   ()=>{ aim.active=false; aim.x=null; aim.y=null; }, {passive:true});
    addEventListener('keydown', (e)=>{ keys[e.key.toLowerCase()] = true; if(e.key==='Shift') boostHold=true; }, {passive:true});
    addEventListener('keyup',   (e)=>{ keys[e.key.toLowerCase()] = false; if(e.key==='Shift') boostHold=false; }, {passive:true});

    // tombol BOOST di footer kalau ada
    const boostBtn = document.getElementById('boostBtn');
    if (boostBtn) {
      boostBtn.addEventListener('pointerdown', ()=>{ boostHold = true; });
      addEventListener('pointerup', ()=>{ boostHold = false; }, {passive:true});
      addEventListener('blur', ()=>{ boostHold = false; }, {passive:true});
    }
  }
  function getTargetAngleForPlayer(px, py){
    if (!aim.active) return null;
    const s = worldToScreen(px, py);
    const dx = (aim.x - s.x), dy = (aim.y - s.y);
    if (dx*dx + dy*dy < 4) return null;
    return Math.atan2(dy, dx);
  }
  return { init, keys, boostHold, getTargetAngleForPlayer };
})();

// ====== Food system (spawn, glow, sedot) ======
const FRUITS = ['apple','orange','grape','watermelon','strawberry','lemon','blueberry','starfruit'];
function spawnFood(x,y, kind=null){
  const k = kind || FRUITS[(Math.random()*FRUITS.length)|0];
  State.foods.push({ kind:k, x, y });
}
function ensureFood(){
  while(State.foods.length < FOOD_TARGET_COUNT){
    spawnFood(Math.random()*WORLD.w, Math.random()*WORLD.h);
  }
}
function nectarColor(kind){
  switch(kind){
    case 'apple': return '#ff4a4a';
    case 'orange': return '#ff9a3b';
    case 'grape': return '#b667ff';
    case 'watermelon': return '#54ff87';
    case 'strawberry': return '#ff5c86';
    case 'lemon': return '#fff04f';
    case 'blueberry': return '#4fa0ff';
    case 'starfruit': return '#ffe95e';
    default: return '#fff';
  }
}
function drawFood(ctx){
  ensureFood();
  const zoom = State.camera.zoom;
  const size = clamp(10*zoom, 6, 18);

  // efek sedot
  for (let i = State.suckBursts.length-1; i>=0; i--){
    const sb = State.suckBursts[i];
    const t = (performance.now() - sb.t0)/350;
    if (t >= 1){ State.suckBursts.splice(i,1); continue; }
    const s = worldToScreen(sb.x, sb.y);
    ctx.globalAlpha = 1-t;
    ctx.beginPath();
    ctx.arc(s.x, s.y, (1-t)*28, 0, Math.PI*2);
    ctx.strokeStyle = sb.col;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  for (const f of State.foods){
    const s = worldToScreen(f.x, f.y);

    // glow
    ctx.shadowBlur = 18; ctx.shadowColor = nectarColor(f.kind);
    ctx.fillStyle = nectarColor(f.kind);
    ctx.beginPath();
    ctx.arc(s.x, s.y, size*0.62, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // highlight
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.x - size*0.25, s.y - size*0.25, size*0.22, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
// efek sedot trigger
function spawnSuckBurst(kind, x, y){
  State.suckBursts.push({ x, y, col: nectarColor(kind), t0: performance.now() });
}

// ====== Snake helpers ======
function bodyRadius(s){ return 4 + 2*Math.sqrt(Math.max(0, s.length-3)); }
const BASE_SEG_SPACE = 6;
function segSpace(s){ return Math.max(BASE_SEG_SPACE, bodyRadius(s)*0.9); }
function needForNext(s){ return 10 + Math.max(0,(s.length - s.baseLen))*2; }

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
  const key = paletteKey(cols);
  for (const s of State.snakes) {
    if (s.isAdminRainbow) continue;
    if (paletteKey(s.colors) === key) return true;
  }
  return false;
}
function nudgePalette(baseCols, seedKey){
  let h = 2166136261 >>> 0;
  const str = String(seedKey||'');
  for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  for (let step=1; step<=8; step++){
    const amt = ((h + step*53) % 31) - 15; // -15..+15
    const trial = baseCols.map(c => shiftHex(c, amt));
    if (!paletteUsed(trial)) return trial;
  }
  return baseCols.slice();
}
function pickUniquePalette(preferred, uidOrId){
  if (preferred && isRainbow(preferred)) return preferred.slice();
  if (preferred && preferred.length && !paletteUsed(preferred)) return preferred.slice();
  const start = BOT_PALETTES.length ? (Math.floor(Math.random()*BOT_PALETTES.length)) : 0;
  for (let i=0;i<BOT_PALETTES.length;i++){
    const pal = BOT_PALETTES[(start+i)%BOT_PALETTES.length];
    if (!paletteUsed(pal)) return pal.slice();
  }
  const base = preferred && preferred.length ? preferred : BOT_PALETTES[0] || ['#58ff9b'];
  return nudgePalette(base, String(uidOrId||Math.random()));
}

// ====== Snake creation & AI ======
function ensureUniqueColors(s, preferred=null){
  if (s.isAdminRainbow) { s.colors = RAINBOW.slice(); return; }
  s.colors = pickUniquePalette(preferred || s.colors, s.uid || s.id);
}
function wrapPos(p) {
  if (p.x < 0) p.x += WORLD.w; else if (p.x >= WORLD.w) p.x -= WORLD.w;
  if (p.y < 0) p.y += WORLD.h; else if (p.y >= WORLD.h) p.y -= WORLD.h;
}
function createSnake(colors, x, y, isBot=false, len=3, name='USER', uid=null, nameColor='#fff', borderColor='#000') {
  const s = {
    id: Math.random().toString(36).slice(2),
    uid, name,
    colors: (colors && colors.length) ? colors.slice() : BOT_PALETTES[(Math.random()*BOT_PALETTES.length)|0],
    x, y,
    dir: Math.random()*Math.PI*2 - Math.PI,
    speedBase: 120, speedMax: 220, v: 120,
    boost: false, energy: 1,
    length: Math.max(1, Math.floor(len)), baseLen: Math.max(1, Math.floor(len)), fruitProgress: 0,
    path: [], _pathAcc: 0, alive: true,
    isBot, isRemote: false,
    aiTarget: { x: Math.random()*WORLD.w, y: Math.random()*WORLD.h },
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
function registerSnake(s){ State.snakes.push(s); if (s.uid) State.snakesByUid.set(s.uid, s); }
function removeSnake(s){ const i=State.snakes.indexOf(s); if(i>=0) State.snakes.splice(i,1); if(s.uid) State.snakesByUid.delete(s.uid); }

function updateSnake(s, dt){
  if (!s.alive) return;

  // --- ambil target angle
  let targetAngle = s.dir;
  if (s === State.player) {
    const t = Input.getTargetAngleForPlayer(s.x, s.y);
    if (t !== null) targetAngle = t;
    s.boost = Input.boostHold || Input.keys['shift'];
  } else if (s.isBot) {
    const aggro = clamp(s.aiAggro || 0.7, 0.4, 1.4);
    const skill = s.aiSkill || 0.8;

    // prey kecil
    let prey=null, preyDist2=1e12;
    const killSense = 420 * aggro;
    for (const o of State.snakes){
      if (!o.alive || o===s) continue;
      const dx=o.x-s.x, dy=o.y-s.y, d2=dx*dx+dy*dy;
      if (o.length + 2 < s.length && d2 < killSense*killSense && d2 < preyDist2){ prey=o; preyDist2=d2; }
    }
    // food terdekat
    let bestFood=null, bestD2=520*520;
    for (const f of State.foods){
      const dx=f.x-s.x, dy=f.y-s.y, d2=dx*dx+dy*dy;
      if (d2 < bestD2){ bestD2=d2; bestFood=f; }
    }
    // target
    let target = s.aiTarget;
    const preyClose = prey && Math.sqrt(preyDist2) < killSense;
    const huntBias = 0.15 * aggro;
    const preferPrey = s.isAdminRainbow ? !!prey : (prey && (preyClose || (!bestFood && Math.random()<huntBias)));
    if (preferPrey) {
      const lead = Math.min(1, Math.sqrt(preyDist2)/220);
      target = { x: prey.x + Math.cos(prey.dir)*60*lead, y: prey.y + Math.sin(prey.dir)*60*lead };
    } else if (bestFood) {
      target = { x: bestFood.x, y: bestFood.y };
    } else {
      if ((Math.random()<0.01) || ((s.x-target.x)**2 + (s.y-target.y)**2) < 140*140){
        target = { x: Math.random()*WORLD.w, y: Math.random()*WORLD.h };
      }
    }
    s.aiTarget = target;

    // vektor & hindari
    let vx = target.x - s.x, vy = target.y - s.y;
    const vlen = Math.hypot(vx, vy) || 1; vx/=vlen; vy/=vlen;

    let ax=0, ay=0, dangerMax=0;
    const R2 = 110*110;
    for (const o of State.snakes){
      if (!o.alive || o===s) continue;
      for (let i=8;i<o.path.length;i+=4){
        const p=o.path[i], dx=s.x-p.x, dy=s.y-p.y, d2=dx*dx+dy*dy;
        if (d2 < R2){
          const d=Math.sqrt(d2)||1, w=(110-d)/110;
          ax += (dx/d)*w; ay += (dy/d)*w; dangerMax = Math.max(dangerMax, w);
        }
      }
      const hdx=s.x-o.x, hdy=s.y-o.y, hd2=hdx*hdx+hdy*hdy;
      if (hd2 < R2){
        const d=Math.sqrt(hd2)||1, w=((110-d)/110)*(o.length>=s.length?1.4:0.8);
        ax += (hdx/d)*w; ay += (hdy/d)*w; dangerMax = Math.max(dangerMax, w);
      }
    }
    const avoidWeight = 1.25*skill;
    let cx = vx + ax*avoidWeight + (Math.random()*2-1)*0.18*0.35;
    let cy = vy + ay*avoidWeight + (Math.random()*2-1)*0.18*0.35;
    targetAngle = Math.atan2(cy, cx);

    // boost
    s.boost = false;
    if (preferPrey && s.energy > 0.2){
      const huntBoostProb = 0.35*skill*(s.isAdminRainbow?1.2:(0.3+0.7*aggro));
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
  s.x += Math.cos(s.dir)*mv; s.y += Math.sin(s.dir)*mv;
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
      spawnSuckBurst(f.kind, f.x, f.y);    // efek sedot
      s._eatTimer = performance.now();     // mulut buka 200ms
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
function killSnake(s){
  if (!s.alive) return;
  s.alive = false;

  // drop buah sebanyak yang dimakan (sepanjang path)
  const count = Math.max(0, Math.floor(s.fruitsEaten || 0));
  if (count > 0) {
    const path = (s.path && s.path.length) ? s.path : [{ x: s.x, y: s.y }];
    const L = path.length;
    for (let k = 0; k < count; k++) {
      const t = (L > 1) ? Math.min(L - 1, Math.floor((k / Math.max(1,count-1)) * (L - 1))) : 0;
      const p = path[t];
      spawnFood(p.x + (Math.random()*14 - 7), p.y + (Math.random()*14 - 7));
    }
  }

  if (s.isBot) {
    // respawn bot setelah delay
    setTimeout(()=>{
      removeSnake(s);
      const pal = BOT_PALETTES[(Math.random()*BOT_PALETTES.length)|0];
      const nb = createSnake(pal, Math.random()*WORLD.w, Math.random()*WORLD.h, true,
        3 + Math.floor(Math.random()*8), s.name, s.uid, s.nameColor, s.borderColor);
      nb.aiAggro = s.isAdminRainbow ? 1.15 : 0.65;
      nb.aiSkill = s.isAdminRainbow ? 0.95 : 0.8;
      registerSnake(nb);
    }, 700);
  } else if (s === State.player) {
    setResetVisible(true);
    showToast('Kamu kalah! Tekan Restart untuk main lagi.', 1800);
  }
}

// ====== Rendering snake (body strip + 2 eyes + mouth) ======
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
function screenSegmentsFromSnake(sn) {
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
function drawSnake(ctx, sn){
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

// ====== Game start/reset ======
let myName = 'USER', myTextColor = '#fff', myBorderColor = '#000';
let lastColors = ['#58ff9b'], lastStartLen = 3;
function clearWorld(){
  State.snakes.splice(0, State.snakes.length);
  State.snakesByUid.clear();
  State.foods.splice(0, State.foods.length);
  ensureFood();
}
function spawnBots(n=12){
  for (let i=0;i<n;i++){
    const pal = BOT_PALETTES[(Math.random()*BOT_PALETTES.length)|0];
    const b = createSnake(pal, Math.random()*WORLD.w, Math.random()*WORLD.h, true,
      3 + Math.floor(Math.random()*8), "BOT_"+((Math.random()*999)|0), null, "#fff", "#000");
    b.aiAggro = 0.65; b.aiSkill = 0.8;
    registerSnake(b);
  }
}
function startGame(colors, startLen){
  clearWorld();

  // Player
  const isAdmin = !!App.isAdmin;
  const cols = isAdmin ? RAINBOW.slice() : (Array.isArray(colors)&&colors.length ? colors : ['#58ff9b']);
  const startX = Math.random()*WORLD.w*0.6 + WORLD.w*0.2;
  const startY = Math.random()*WORLD.h*0.6 + WORLD.h*0.2;
  const me = createSnake(cols, startX, startY, false, startLen||3, myName, App.uid, myTextColor, myBorderColor);
  if (isAdmin) me.isAdminRainbow = true;
  State.player = me; registerSnake(me);

  // Camera
  State.camera.x = me.x; State.camera.y = me.y; State.camera.zoom = 1;

  lastColors = cols.slice(); lastStartLen = startLen||3;

  // Bots
  spawnBots(12);

  updateHUDCounts();
  updateRankPanel();
  setResetVisible(false);
}
function quickReset(){
  if (State.ui && State.ui.canReset && State.lastPurchase && !App.isAdmin){
    // jika ingin charge lagi di sini, sudah ditangani tombol Reset header (tidak ganda).
  }
  startGame(lastColors, lastStartLen);
  setResetVisible(false);
  showToast('Reset!', 900);
}

// ====== Render loop ======
let rankTick = 0, lastTS = 0;
function stepPhysics(dt){
  const h = 1/60;
  while (dt > 0){
    const step = Math.min(h, dt);
    for (const s of State.snakes) updateSnake(s, step);
    dt -= step;
  }
}
function updateCamera(dt){
  const p = State.player; if (!p) return;
  const zLen = Math.min(0.5, Math.log10(1 + p.length / 10) * 0.35);
  const zSpeed = Math.min(0.6, (p.v - p.speedBase) / (p.speedMax - p.speedBase + 1e-6)) * 0.45;
  const tZoom = clamp(1.15 - zSpeed - zLen, 0.35, 1.18);
  State.camera.zoom = lerp(State.camera.zoom, tZoom, 0.06);
  State.camera.x = lerp(State.camera.x, p.x, 0.085);
  State.camera.y = lerp(State.camera.y, p.y, 0.085);
}
function render(){
  const ctx = State.ctx;
  ctx.clearRect(0,0,State.vw, State.vh);

  // grid ringan
  const step = WORLD.grid * State.camera.zoom;
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

  // foods
  drawFood(ctx);

  // snakes
  for (const s of State.snakes) drawSnake(ctx, s);

  // HUD & rank throttle
  if (State.player) updateHUDCounts();
  rankTick += 1;
  if (rankTick >= 15){ updateRankPanel(); rankTick = 0; }
}
function loop(now){
  if (!lastTS) lastTS = now;
  const dt = Math.min(0.1, (now - lastTS)/1000);
  lastTS = now;

  stepPhysics(dt);
  updateCamera(dt);
  render();

  requestAnimationFrame(loop);
}

// ====== Start menu (warna + biaya + saldo) ======
const PRICE_COLOR = 10000;
const PRICE_LEN   = 5000;

// Warna pilihan langsung di kotak palette (tanpa modal HSL)
const START_SWATCHES = ["#58ff9b","#ff6fb5","#7cffea","#ffd166","#00e5ff","#79a7ff","#8aff80","#b48cff","#ffa552","#66ff99","#ffee00","#6950ff"];
let selectedFlags = [false,false,false,false,false];
let selectedColors = ["#ffffff","#ffffff","#ffffff","#ffffff","#ffffff"];

function initPaletteSimple(){
  const palEl = document.getElementById('palette');
  if (!palEl) return;
  const boxes = palEl.querySelectorAll('.colorBox');
  boxes.forEach((box, idx)=>{
    let colorIdx = (idx % START_SWATCHES.length);
    let chosen = false;
    const apply = ()=>{
      box.style.background = chosen ? START_SWATCHES[colorIdx] : '#ffffff';
      box.style.color = chosen ? '#000':'#000';
      box.style.outline = chosen ? '3px solid #222' : '1px solid #ccc';
      selectedFlags[idx] = chosen;
      selectedColors[idx] = chosen ? START_SWATCHES[colorIdx] : '#ffffff';
      refreshCostsAndStart();
    };
    box.addEventListener('click', ()=>{
      // klik pertama = pilih warna default; klik lagi = ganti warna (cycle)
      if (!chosen){ chosen = true; }
      else { colorIdx = (colorIdx+1) % START_SWATCHES.length; }
      apply();
    });
    apply();
  });
}
function getChosenColors(){
  const cols = [];
  for (let i=0;i<selectedFlags.length;i++){
    if (selectedFlags[i]) cols.push(selectedColors[i]);
  }
  return cols.length ? cols : ['#58ff9b'];
}
function calcCosts(){
  const len = Math.max(1, Math.min(300, parseInt(State.ui.startLenInput?.value || '3', 10)));
  const colorCount = selectedFlags.filter(Boolean).length;
  const cColor = colorCount * PRICE_COLOR;
  const cLen = len * PRICE_LEN;
  return { len, colorCount, cColor, cLen, total: cColor + cLen };
}
function refreshCostUI(){
  const { cColor, cLen, total } = calcCosts();
  if (State.ui.costColorEl) State.ui.costColorEl.textContent = fmtRp(cColor);
  if (State.ui.costLenEl)   State.ui.costLenEl.textContent   = fmtRp(cLen);
  if (State.ui.costTotalEl) State.ui.costTotalEl.textContent = fmtRp(total);
}
function refreshStartState(){
  const { total, colorCount } = calcCosts();
  const saldoCheck = App.isAdmin ? Infinity : saldo;
  const can = (App.isAdmin || colorCount > 0) && total <= saldoCheck;
  if (State.ui.startBtn) State.ui.startBtn.disabled = !can;
}
function refreshCostsAndStart(){ refreshCostUI(); refreshStartState(); }

function bindStartControls(){
  const { startBtn, startLenInput, configPanel } = State.ui;
  if (startLenInput) startLenInput.addEventListener('input', refreshCostsAndStart);

  if (startBtn) startBtn.addEventListener('click', async ()=>{
    const { len, total } = calcCosts();
    let cols = getChosenColors();
    if (App.isAdmin) cols = RAINBOW;

    // potong saldo (non-admin)
    if (!App.isAdmin && App.userRef){
      const ok = await chargeSaldo(total);
      if (!ok) { showToast('Saldo kurang', 1200); return; }
    }

    // apply profile style ke nameplate
    if (App.profileStyle){
      myName = App.profileStyle.name || 'USER';
      myTextColor = App.profileStyle.color || '#fff';
      myBorderColor = App.profileStyle.borderColor || '#000';
    }

    // mulai game
    startGame(cols, len);
    State.lastPurchase = { colors: cols.slice(), len, total };

    // tutup panel
    if (configPanel) configPanel.style.display = 'none';
    showToast('Game dimulai!', 1000);
  });

  // tombol Reset di header (#reset) — charge ulang biaya start
  const resetHeader = document.getElementById('reset');
  if (resetHeader) {
    resetHeader.addEventListener('click', async ()=>{
      const p = State.lastPurchase;
      if (p && !App.isAdmin && App.userRef){
        const ok = await chargeSaldo(p.total);
        if (!ok){ showToast('Saldo kurang', 1200); return; }
      }
      quickReset();
    });
  }

  // tombol Restart di tengah (muncul saat mati) — tidak charge (hanya quickReset)
  const overlayBtn = ensureCenterRestartBtn();
  overlayBtn.onclick = ()=> quickReset();
}

// ====== Public-like API (agar tetap bisa dipanggil dari luar kalau perlu) ======
window.Game = {
  init(){
    State.canvas = document.getElementById('game');
    if (!State.canvas) throw new Error('Canvas #game tidak ditemukan');
    State.ctx = State.canvas.getContext('2d');

    // UI
    grabUIRefs();
    initPaletteSimple();
    bindStartControls();

    // inisialisasi camera & input
    addEventListener('resize', resize, {passive:true});
    resize();
    Input.init(State.canvas);

    // tampilkan saldo awal (jika sudah ada)
    if (State.ui.saldoHeaderEl) State.ui.saldoHeaderEl.textContent = fmtRp(saldo);
    if (State.ui.saldoModalEl)  State.ui.saldoModalEl.textContent  = fmtRp(saldo);

    // jalankan loop
    requestAnimationFrame(loop);
  },
  start(colors, startLen){ startGame(colors, startLen); },
  quickReset(){ quickReset(); },
};

// ====== Auto init saat DOM siap ======
document.addEventListener('DOMContentLoaded', ()=>{
  // kalau ada profileStyle di App (dari firebase-boot), apply warna/nama ke pill
  if (App.profileStyle && State.ui.usernameSpan){
    State.ui.usernameSpan.textContent = App.profileStyle.name || 'USER';
    State.ui.usernameSpan.style.color = App.profileStyle.color || '#fff';
    State.ui.usernameSpan.style.border = `1px solid ${App.profileStyle.borderColor || '#000'}`;
  }
  window.Game.init();
});
