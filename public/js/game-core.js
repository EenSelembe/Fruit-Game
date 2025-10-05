// /public/js/game-core.js
// Snake.io — lengkap: profil & style nickname per user, admin pelangi,
// bot untuk user offline, sinkron online (addOrUpdateRemote/removeRemote),
// rank konsisten antar device, dan quickReset.

// Catatan integrasi:
// - presence.js menyiapkan window.Presence.{UserDir,OnlineUids}
// - net-sync.js akan memanggil:
//     Game.getPlayerState()
//     Game.addOrUpdateRemote(uid, stateFromFirestore)
//     Game.removeRemote(uid)
// - controller.js memanggil:
//     Game.init()  → sekali di halaman
//     Game.start(colors, startLen) → saat klik Mulai
//     Game.quickReset() → saat Reset

const Game = (() => {
  /* ==== Helpers ==== */
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp  = (a,b,t)=>a+(b-a)*t;
  const rand  = (a,b)=>Math.random()*(b-a)+a;
  const angNorm = a => ((a + Math.PI*3) % (Math.PI*2)) - Math.PI;

  function firstColorFromGradient(str, fallback) {
    if (!str) return fallback;
    const m = String(str).match(/(#(?:[0-9a-fA-F]{3,8})|rgba?\([^)]*\))/);
    return m ? m[0] : fallback;
  }

  /* ==== Canvas / Camera / World ==== */
  let canvas, ctx, vw=0, vh=0, dpr=1;
  const WORLD = { w: 4200, h: 4200, grid: 90 };
  const camera = { x: WORLD.w/2, y: WORLD.h/2, zoom: 1 };

  function resize(){
    vw = innerWidth; vh = innerHeight;
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio||1));
    canvas.width = vw * dpr; canvas.height = vh * dpr;
    canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function worldToScreen(x,y){ return { x:(x - camera.x)*camera.zoom + vw/2, y:(y - camera.y)*camera.zoom + vh/2 }; }
  function wrapPos(p){
    if (p.x < 0) p.x += WORLD.w; else if (p.x >= WORLD.w) p.x -= WORLD.w;
    if (p.y < 0) p.y += WORLD.h; else if (p.y >= WORLD.h) p.y -= WORLD.h;
  }

  /* ==== State ==== */
  const foods = [];
  const FRUITS = ['apple','orange','grape','watermelon','strawberry','lemon','blueberry','starfruit'];
  let FOOD_COUNT = 1200;

  const snakes = [];
  const snakesByUid = new Map(); // uid -> snake (player/remote/bot-ofline)
  let player = null;

  // UI
  let elLen, elUsers, rankRowsEl;

  // Profil aktif (untuk apply ke player begitu ada)
  let myProfileStyle = {
    name: 'USER',
    color: '#fff',
    bgColor: null,
    bgGradient: null,
    borderColor: '#000',
    borderGradient: null
  };

  // Admin rainbow
  const RAINBOW = ["#ff0055","#ff7b00","#ffee00","#00d26a","#00b3ff","#6950ff"];

  /* ==== Input ==== */
  const keys = {};
  const pointer = { x:0, y:0, down:false };
  let joy, knob, joyState = { ax:0, ay:0, active:false };
  let boostHold = false;

  function bindInputs(){
    addEventListener('keydown',(e)=>{ keys[e.key.toLowerCase()] = true; if (e.key==='r'||e.key==='R') quickReset(); });
    addEventListener('keyup',(e)=>{ keys[e.key.toLowerCase()] = false; });
    addEventListener('pointerdown',(e)=>{ pointer.down=true; pointer.x=e.clientX; pointer.y=e.clientY; });
    addEventListener('pointermove',(e)=>{ pointer.x=e.clientX; pointer.y=e.clientY; });
    addEventListener('pointerup',()=>{ pointer.down=false; });
    addEventListener('pointercancel',()=>{ pointer.down=false; });

    joy = document.getElementById('joy');
    knob = document.getElementById('knob');
    if (joy && knob) {
      const setKnob = (cx,cy)=>{ knob.style.left=cx+'%'; knob.style.top=cy+'%'; };
      setKnob(50,50);
      function handleJoy(e, type){
        const r = joy.getBoundingClientRect();
        const cx = r.left + r.width/2, cy = r.top + r.height/2;
        let x,y; if (e.touches && e.touches[0]) { x=e.touches[0].clientX; y=e.touches[0].clientY; } else { x=e.clientX; y=e.clientY; }
        const dx = x-cx, dy = y-cy, rad = r.width/2, mag = Math.hypot(dx,dy);
        const cl = Math.min(mag, rad);
        const nx = mag ? (dx/mag)*cl : 0, ny = mag ? (dy/mag)*cl : 0;
        setKnob((nx/rad)*50+50,(ny/rad)*50+50);
        joyState.ax = (nx/rad); joyState.ay = (ny/rad);
        if (type==='end') { joyState.ax=0; joyState.ay=0; setKnob(50,50); joyState.active=false; } else joyState.active=true;
      }
      joy.addEventListener('pointerdown', e=>{ joy.setPointerCapture(e.pointerId); handleJoy(e,'start'); });
      joy.addEventListener('pointermove', e=>{ if (e.pressure>0) handleJoy(e,'move'); });
      joy.addEventListener('pointerup',   e=>{ handleJoy(e,'end'); });
      joy.addEventListener('pointercancel', e=>{ handleJoy(e,'end'); });

      const boostBtn = document.getElementById('boostBtn');
      if (boostBtn) {
        boostBtn.addEventListener('pointerdown', ()=>{ boostHold=true; });
        boostBtn.addEventListener('pointerup', ()=>{ boostHold=false; });
        boostBtn.addEventListener('pointercancel', ()=>{ boostHold=false; });
      }
    }
  }

  /* ==== Geometry ==== */
  function bodyRadius(s){ return 4 + 2 * Math.sqrt(Math.max(0, s.length - 3)); }
  const BASE_SEG_SPACE = 6;
  function segSpace(s){ return Math.max(BASE_SEG_SPACE, bodyRadius(s)*0.9); }

  /* ==== Snake ==== */
  function createSnake(colors, x, y, isBot=false, len=3, name='USER', uid=null){
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
      aiTarget: { x: rand(0, WORLD.w), y: rand(0, WORLD.h) },
      isAdminRainbow: false,
      style: { color:'#fff', border:'#000' } // nameplate style per user
    };
    s.path.unshift({ x:s.x, y:s.y });
    return s;
  }
  function registerSnake(s){ snakes.push(s); if (s.uid) snakesByUid.set(s.uid, s); }
  function removeSnake(s){ const i=snakes.indexOf(s); if(i>=0) snakes.splice(i,1); if(s.uid) snakesByUid.delete(s.uid); }
  function needForNext(s){ return 10 + Math.max(0, (s.length - s.baseLen)) * 2; }

  /* ==== Foods ==== */
  function spawnFood(x=rand(0,WORLD.w), y=rand(0,WORLD.h)) {
    const kind = FRUITS[Math.floor(rand(0, FRUITS.length))];
    foods.push({ kind, x, y });
  }
  function ensureFood(){ while(foods.length < FOOD_COUNT) spawnFood(); }

  /* ==== Drawing ==== */
  function drawGrid(){
    const step = WORLD.grid * camera.zoom; if (step < 14) return;
    const ox = -((camera.x * camera.zoom) % step);
    const oy = -((camera.y * camera.zoom) % step);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x=ox; x<vw; x+=step){ ctx.moveTo(x,0); ctx.lineTo(x,vh); }
    for (let y=oy; y<vh; y+=step){ ctx.moveTo(0,y); ctx.lineTo(vw,y); }
    ctx.stroke();
  }

  function drawFruit(f){
    const s = worldToScreen(f.x, f.y);
    if (s.x<-30 || s.y<-30 || s.x>vw+30 || s.y>vh+30) return;
    ctx.save(); ctx.translate(s.x,s.y); ctx.scale(camera.zoom, camera.zoom);
    // Simple fruit circle (ringkas)
    const C = {apple:'#ff4d4d', orange:'#ffa94d', grape:'#a06cff', watermelon:'#ff5d73', strawberry:'#ff4d6d', lemon:'#ffe066', blueberry:'#4c6ef5', starfruit:'#e9ff70'};
    ctx.fillStyle = C[f.kind] || '#fff';
    ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  function drawFood(){ for (const f of foods) drawFruit(f); }

  function moveWithBezier(ctx, pts, tension=0.75){
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i=0;i<pts.length-1;i++){
      const p0 = i>0? pts[i-1]:pts[i], p1=pts[i], p2=pts[i+1], p3=(i!=pts.length-2)?pts[i+2]:p2, t=tension;
      const cp1x = p1.x + (p2.x - p0.x)*t/6, cp1y = p1.y + (p2.y - p0.y)*t/6;
      const cp2x = p2.x - (p3.x - p1.x)*t/6, cp2y = p2.y - (p3.y - p1.y)*t/6;
      ctx.bezierCurveTo(cp1x,cp1y,cp2x,cp2y,p2.x,p2.y);
    }
  }
  function chaikinSmooth(pts, iterations=2){
    let out = pts.slice();
    for (let k=0;k<iterations;k++){
      const res=[out[0]];
      for (let i=0;i<out.length-1;i++){
        const p=out[i], q=out[i+1];
        const Q={x:p.x*0.75+q.x*0.25, y:p.y*0.75+q.y*0.25};
        const R={x:p.x*0.25+q.x*0.75, y:p.y*0.25+q.y*0.75};
        res.push(Q,R);
      }
      res.push(out[out.length-1]); out=res;
    }
    return out;
  }
  function screenSegmentsFromSnake(sn){
    const pts=[]; for (let i=sn.path.length-1;i>=0;i--){ const p=sn.path[i]; const s=worldToScreen(p.x,p.y); pts.push({x:s.x,y:s.y}); }
    const head = worldToScreen(sn.x, sn.y); pts.push({x:head.x, y:head.y});
    const segs=[]; let cur=[pts[0]];
    for (let i=1;i<pts.length;i++){ const a=pts[i-1], b=pts[i];
      if (Math.abs(a.x-b.x) > vw*0.6 || Math.abs(a.y-b.y) > vh*0.6) { segs.push(cur); cur=[b]; }
      else cur.push(b);
    }
    if (cur.length>1) segs.push(cur);
    return segs;
  }
  function strokeStripedPath(pts, w, colors, outline=0, glow=false){
    if (pts.length<2) return;
    const sm = chaikinSmooth(pts,2);

    if (outline>0){
      ctx.beginPath(); moveWithBezier(ctx, sm, 0.75);
      ctx.strokeStyle='rgba(0,0,0,0.35)';
      ctx.lineWidth = w + outline*2;
      ctx.lineCap='round'; ctx.lineJoin='round';
      ctx.stroke();
    }

    const cols = (colors && colors.length) ? colors : ['#58ff9b'];
    if (cols.length <= 1){
      ctx.beginPath(); moveWithBezier(ctx, sm, 0.75);
      ctx.lineWidth = w; ctx.lineCap='round'; ctx.lineJoin='round';
      ctx.strokeStyle = cols[0];
      if (glow){ ctx.shadowBlur=16; ctx.shadowColor=cols[0]; }
      ctx.stroke(); ctx.shadowBlur=0;
    } else {
      // multi-warna: gradient halus sepanjang path
      const rev = sm.slice().reverse();
      ctx.beginPath(); moveWithBezier(ctx, sm, 0.75);
      const grad = ctx.createLinearGradient(rev[0].x, rev[0].y, rev[rev.length-1].x, rev[rev.length-1].y);
      cols.forEach((c,i)=>grad.addColorStop(i/(cols.length-1), c));
      ctx.lineWidth=w; ctx.lineCap='round'; ctx.lineJoin='round';
      ctx.strokeStyle=grad; if (glow){ ctx.shadowBlur=16; ctx.shadowColor='#fff'; }
      ctx.stroke(); ctx.shadowBlur=0;
    }

    // highlight
    ctx.globalAlpha=0.22;
    ctx.beginPath(); moveWithBezier(ctx, sm, 0.75);
    ctx.strokeStyle='#ffffff'; ctx.lineWidth=Math.max(1, w*0.35);
    ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke();
    ctx.globalAlpha=1;
  }

  function drawSnake(sn){
    if (sn.path.length<2) return;
    const rPix = bodyRadius(sn) * camera.zoom;
    const segs = screenSegmentsFromSnake(sn);
    for (const seg of segs){ if (seg.length<2) continue; strokeStripedPath(seg, rPix*2, sn.colors, rPix*0.65, sn.isAdminRainbow); }

    // head
    const headS = worldToScreen(sn.x, sn.y);
    const rr = (6.5 + 0.1*Math.sqrt(sn.length)) * camera.zoom;
    ctx.beginPath(); ctx.arc(headS.x, headS.y, rr, 0, Math.PI*2);
    ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.lineWidth=2; ctx.stroke();
    ctx.beginPath(); ctx.arc(headS.x+rr*0.25, headS.y-rr*0.15, rr*0.35, 0, Math.PI*2);
    ctx.fillStyle='#000'; ctx.fill();

    // nameplate (pakai style per-snake)
    const nscr=headS, padX=34, padY=16*camera.zoom;
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,.45)';
    ctx.fillRect(nscr.x-padX, nscr.y-22*camera.zoom, padX*2, padY);
    ctx.strokeStyle = sn.style?.border || '#000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(nscr.x-padX, nscr.y-22*camera.zoom, padX*2, padY);
    ctx.font = `${12*camera.zoom}px system-ui,Segoe UI`;
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillStyle = sn.style?.color || '#fff';
    ctx.fillText(sn.name || 'USER', nscr.x, nscr.y - 10*camera.zoom);
    ctx.restore();
  }

  /* ==== Physics ==== */
  function updateSnake(s, dt){
    if (!s.alive) return;

    let target = s.dir, steerX=0, steerY=0;
    if (keys['w']||keys['arrowup']) steerY -= 1;
    if (keys['s']||keys['arrowdown']) steerY += 1;
    if (keys['a']||keys['arrowleft']) steerX -= 1;
    if (keys['d']||keys['arrowright']) steerX += 1;

    if (s === player){
      if (joyState.active && (Math.abs(joyState.ax)+Math.abs(joyState.ay))>0.05) target = Math.atan2(joyState.ay, joyState.ax);
      else if (pointer.down){ const head=worldToScreen(s.x,s.y); target = Math.atan2(pointer.y - head.y, pointer.x - head.x); }
      else if (steerX||steerY) target = Math.atan2(steerY, steerX);
      s.boost = boostHold || keys['shift'];
    } else if (s.isBot || !s.isRemote){
      const dx = s.aiTarget.x - s.x, dy = s.aiTarget.y - s.y;
      if ((dx*dx + dy*dy) < 180*180){ s.aiTarget.x = rand(0, WORLD.w); s.aiTarget.y = rand(0, WORLD.h); }
      target = Math.atan2(dy,dx) + (Math.random()*0.36 - 0.18);
      s.boost = Math.random() < 0.01;
    }

    const delta = angNorm(target - s.dir);
    s.dir += Math.max(-3.4*dt, Math.min(3.4*dt, delta));

    const want = (s.boost && s.energy>0.15) ? s.speedMax : s.speedBase;
    s.v = lerp(s.v||s.speedBase, want, (s.boost?0.35:0.18));
    if (s.boost && s.energy>0.15) s.energy = Math.max(0, s.energy - 0.28*dt);
    else s.energy = Math.min(1, s.energy + 0.14*dt);

    const mv = s.v * dt;
    s.x += Math.cos(s.dir)*mv; s.y += Math.sin(s.dir)*mv; wrapPos(s);

    const SP = segSpace(s);
    s._pathAcc += mv;
    while (s._pathAcc >= SP){ s.path.unshift({ x:s.x, y:s.y }); s._pathAcc -= SP; }
    const maxPath = Math.floor(5.5 * s.length * (BASE_SEG_SPACE/SP));
    if (s.path.length > maxPath) s.path.length = maxPath;

    // eat fruits
    for (let i=foods.length-1;i>=0;i--){
      const f=foods[i], dx=s.x-f.x, dy=s.y-f.y, eatR=bodyRadius(s)+10;
      if (dx*dx + dy*dy < eatR*eatR){
        foods.splice(i,1);
        s.fruitProgress += 1;
        if (s.fruitProgress >= needForNext(s)){ s.fruitProgress=0; s.length += 1; }
      }
    }
  }

  function killSnake(s){
    if (!s.alive) return; s.alive=false;
    for (let i=0;i<s.path.length;i+=Math.max(6,Math.floor(segSpace(s)))){
      const p=s.path[i]; spawnFood(p.x+(Math.random()*12-6), p.y+(Math.random()*12-6));
    }
    if (s.isRemote){ removeSnake(s); return; }
    if (s.isBot){
      setTimeout(()=>{ removeSnake(s);
        const nb = createSnake(['#79a7ff'], rand(0,WORLD.w), rand(0,WORLD.h), true, 3+Math.floor(Math.random()*8), s.name, s.uid);
        nb.style = {...s.style}; registerSnake(nb);
      }, 800);
    } else if (s === player){
      const toast = document.getElementById('toast');
      if (toast){ toast.textContent='Kamu tumbang! Tekan Reset untuk main lagi.'; toast.style.display='block';
        clearTimeout(killSnake._t); killSnake._t=setTimeout(()=>toast.style.display='none',1800); }
    }
  }

  /* ==== Rank Panel ==== */
  function updateRankPanel(){
    if (!rankRowsEl) return;
    const top = snakes.filter(s=>s.alive).sort((a,b)=>b.length-a.length).slice(0,5);
    rankRowsEl.innerHTML = top.map((s,i)=>
      `<div class="rrow${s===player?' me':''}"><div class="title">${i+1}. ${s.name||'USER'}</div><div class="sub">Len ${s.length}</div></div>`
    ).join('');
  }

  /* ==== Offline users as bots ==== */
  function hashToPos(uid){
    let h = 2166136261>>>0;
    for (let i=0;i<uid.length;i++){ h ^= uid.charCodeAt(i); h = Math.imul(h,16777619)>>>0; }
    return { x: (h % WORLD.w), y: ((h>>>1) % WORLD.h) };
  }
  function styleFromUser(u){
    const border = u?.borderGradient ? firstColorFromGradient(u.borderGradient, u.borderColor||'#000') : (u?.borderColor || '#000');
    return { color: u?.color || '#fff', border };
  }
  function spawnOfflineAsBots(maxCount=16){
    const dir = window.Presence?.UserDir;
    const online = window.Presence?.OnlineUids;
    if (!dir || !online) return;

    const offline = [];
    for (const [uid, uinfo] of dir.entries()){
      if (!online.has(uid)) offline.push({ uid, uinfo });
    }
    const n = Math.min(maxCount, offline.length);
    for (let i=0;i<n;i++){
      const { uid, uinfo } = offline[i];
      if (snakesByUid.has(uid)) continue;
      const p = hashToPos(uid);
      const s = createSnake(['#79a7ff'], p.x, p.y, true, 3 + Math.floor(Math.random()*8), (uinfo.name||'USER'), uid);
      s.style = styleFromUser(uinfo.style);
      if (uinfo.isAdmin){ s.colors = RAINBOW.slice(); s.isAdminRainbow = true; }
      registerSnake(s);
    }
  }

  /* ==== Start / Reset ==== */
  let lastColors = ['#58ff9b'];
  let lastStartLen = 3;

  function startGame(colors, startLen){
    snakes.splice(0, snakes.length);
    snakesByUid.clear();
    foods.splice(0, foods.length);
    ensureFood();

    const uid = window.App?.profile?.id || null;
    const isAdmin = !!window.App?.isAdmin;

    // colors: admin pelangi override
    const cols = isAdmin ? RAINBOW.slice() : (Array.isArray(colors) && colors.length ? colors.slice() : ['#58ff9b']);

    const startX = Math.random()*WORLD.w*0.6 + WORLD.w*0.2;
    const startY = Math.random()*WORLD.h*0.6 + WORLD.h*0.2;

    player = createSnake(cols, startX, startY, false, startLen||3, (myProfileStyle.name||'USER'), uid);
    player.style = {
      color: myProfileStyle.color || '#fff',
      border: myProfileStyle.borderGradient ? firstColorFromGradient(myProfileStyle.borderGradient, myProfileStyle.borderColor||'#000')
                                           : (myProfileStyle.borderColor || '#000')
    };
    if (isAdmin) player.isAdminRainbow = true;

    registerSnake(player);

    camera.x = player.x; camera.y = player.y; camera.zoom = 1;

    lastColors = cols.slice();
    lastStartLen = startLen || 3;

    // spawn bots utk user offline (nama asli)
    spawnOfflineAsBots(16);

    if (elLen) elLen.textContent = player.length;
    if (elUsers) elUsers.textContent = snakes.filter(s=>s.alive).length;
    updateRankPanel();
  }

  function quickReset(){
    startGame(lastColors, lastStartLen);
    const toast = document.getElementById('toast');
    if (toast){ toast.textContent='Reset!'; toast.style.display='block';
      clearTimeout(quickReset._t); quickReset._t = setTimeout(()=>toast.style.display='none',900); }
    // Optional hook: beri tahu controller jika mau charging ulang
    try{ window.dispatchEvent(new CustomEvent('game:reset')); }catch(_){}
  }

  /* ==== Loop ==== */
  let last = performance.now(), rankTimer=0;
  function stepPhysics(dt){
    const h = 1/60;
    while (dt>0){
      const step = Math.min(h, dt);
      for (const s of snakes) updateSnake(s, step);
      dt -= step;
    }
  }
  function loop(now){
    const frameDt = Math.min(0.1, (now-last)/1000); last = now;
    stepPhysics(frameDt);

    if (player){
      const zLen = Math.min(0.5, Math.log10(1 + player.length/10)*0.35);
      const zSpeed = Math.min(0.6, (player.v - player.speedBase)/(player.speedMax - player.speedBase + 1e-6))*0.45;
      const tZoom = clamp(1.15 - zSpeed - zLen, 0.35, 1.18);
      camera.zoom = lerp(camera.zoom, tZoom, 0.06);
      camera.x = lerp(camera.x, player.x, 0.085);
      camera.y = lerp(camera.y, player.y, 0.085);
    }

    ctx.clearRect(0,0,vw,vh);
    drawGrid();
    drawFood();
    for (const s of snakes) drawSnake(s);

    if (player){
      if (elLen) elLen.textContent = player.length;
      if (elUsers) elUsers.textContent = snakes.filter(s=>s.alive).length;
    }
    rankTimer += frameDt;
    if (rankTimer > 0.25){ updateRankPanel(); rankTimer = 0; }

    requestAnimationFrame(loop);
  }

  /* ==== Online Hooks for net-sync.js ==== */
  function getPlayerState(){
    if (!player) return null;
    return {
      name: player.name,
      colors: player.colors.slice(),
      x: player.x, y: player.y, dir: player.dir,
      length: player.length,
      alive: player.alive !== false
    };
  }

  // state minimal dari Firestore: { name, colors, x, y, dir, length, alive }
  function addOrUpdateRemote(uid, state){
    if (!uid) return;
    if (player && player.uid === uid) return; // skip diri sendiri

    let s = snakesByUid.get(uid);
    const uinfo = window.Presence?.UserDir?.get(uid); // untuk style & admin
    if (!s){
      const name = state?.name || uinfo?.name || 'USER';
      const cols = (state?.colors && state.colors.length) ? state.colors.slice() : ['#79a7ff'];
      s = createSnake(cols,
        typeof state?.x==='number'? state.x : rand(0,WORLD.w),
        typeof state?.y==='number'? state.y : rand(0,WORLD.h),
        false,
        typeof state?.length==='number'? Math.max(1,Math.floor(state.length)) : 3,
        name,
        uid
      );
      s.isRemote = true;
      s.isBot = false;
      // Style nameplate dari profil
      if (uinfo?.style){
        s.style = {
          color: uinfo.style.color || '#fff',
          border: uinfo.style.borderGradient ? firstColorFromGradient(uinfo.style.borderGradient, uinfo.style.borderColor||'#000')
                                             : (uinfo.style.borderColor || '#000')
        };
      }
      if (uinfo?.isAdmin){ s.colors = RAINBOW.slice(); s.isAdminRainbow = true; }
      registerSnake(s);
    }

    // Update posisi
    if (typeof state.x === 'number') s.x = state.x;
    if (typeof state.y === 'number') s.y = state.y;
    if (typeof state.dir === 'number') s.dir = state.dir;
    if (typeof state.length === 'number') s.length = Math.max(1, Math.floor(state.length));
    if (Array.isArray(state.colors) && state.colors.length) s.colors = state.colors.slice();
    if (typeof state.name === 'string') s.name = state.name;
    if (state.alive === false) killSnake(s);

    s.isRemote = true; s.isBot = false;
    if (!s.path || !s.path.length) s.path = [{ x:s.x, y:s.y }];
  }

  function removeRemote(uid){
    if (!uid) return;
    const s = snakesByUid.get(uid);
    if (!s) return;
    // Jadikan bot agar tetap ada ketika user offline
    s.isRemote = false;
    s.isBot = true;
    s.aiTarget = { x: rand(0,WORLD.w), y: rand(0,WORLD.h) };
  }

  /* ==== Public ==== */
  function init(){
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    elLen = document.getElementById('len');
    elUsers = document.getElementById('userCount');
    rankRowsEl = document.getElementById('rankRows');

    addEventListener('resize', resize, { passive:true }); resize();
    bindInputs();
    requestAnimationFrame(loop);

    // Reaksi ke presence update → top-up bot offline
    window.addEventListener('users:loaded', ()=> spawnOfflineAsBots(16));
    window.addEventListener('presence:update', ()=> spawnOfflineAsBots(16));
  }

  function applyProfileStyle(style){
    if (!style) return;
    myProfileStyle = {
      name: style.name || 'USER',
      color: style.color || '#fff',
      bgColor: style.bgColor || null,
      bgGradient: style.bgGradient || null,
      borderColor: style.borderColor || '#000',
      borderGradient: style.borderGradient || null
    };
    // Jika player sudah ada, update name & style langsung
    if (player){
      player.name = myProfileStyle.name;
      player.style = {
        color: myProfileStyle.color || '#fff',
        border: myProfileStyle.borderGradient
          ? firstColorFromGradient(myProfileStyle.borderGradient, myProfileStyle.borderColor||'#000')
          : (myProfileStyle.borderColor || '#000')
      };
    }
  }

  return {
    init,
    start: startGame,
    quickReset,
    applyProfileStyle,
    getPlayerState,
    addOrUpdateRemote,
    removeRemote
  };
})();

export default Game;
export { Game };
if (typeof window !== 'undefined') window.Game = Game;
