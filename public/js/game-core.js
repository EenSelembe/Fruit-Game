import { clamp, rand, lerp, angNorm } from './helpers.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const elLen = document.getElementById('len');
const elUsers = document.getElementById('userCount');
const boostBtn = document.getElementById('boostBtn');
const resetBtn = document.getElementById('reset');

let vw=0, vh=0, dpr=Math.max(1, Math.min(2, window.devicePixelRatio||1));
function resize(){ vw=innerWidth; vh=innerHeight; canvas.width=vw*dpr; canvas.height=vh*dpr; canvas.style.width=vw+'px'; canvas.style.height=vh+'px'; ctx.setTransform(dpr,0,0,dpr,0,0); }
addEventListener('resize', resize, {passive:true}); resize();

const WORLD={w:4200,h:4200,grid:90};
function wrapPos(p){ if(p.x<0)p.x+=WORLD.w; else if(p.x>=WORLD.w)p.x-=WORLD.w; if(p.y<0)p.y+=WORLD.h; else if(p.y>=WORLD.h)p.y-=WORLD.h; }
const camera={x:WORLD.w/2,y:WORLD.h/2,zoom:1};
function worldToScreen(x,y){ return {x:(x-camera.x)*camera.zoom+vw/2, y:(y-camera.y)*camera.zoom+vh/2}; }

/* ======= Foods ======= */
const foods=[]; let FOOD_COUNT=1400;
const FRUITS=['apple','orange','grape','watermelon','strawberry','lemon','blueberry','starfruit'];
function spawnFood(x=rand(0,WORLD.w),y=rand(0,WORLD.h)){ const kind=FRUITS[Math.floor(rand(0,FRUITS.length))]; foods.push({kind,x,y}); }
function ensureFood(){ while(foods.length<FOOD_COUNT) spawnFood(); }

/* ======= Snakes ======= */
function bodyRadius(s){ return 4 + 2*Math.sqrt(Math.max(0, s.length-3)); }
const BASE_SEG_SPACE=6;
function segSpace(s){ return Math.max(BASE_SEG_SPACE, bodyRadius(s)*0.9); }

let userIdCounter=1;
function createSnake(colors,x,y,isBot=false,len=3){
  const s={ id:Math.random().toString(36).slice(2), colors, x,y,dir:Math.random()*Math.PI*2-Math.PI,
    speedBase:120,speedMax:220,v:0,boost:false,energy:1, length:len, baseLen:len, fruitProgress:0, path:[], _pathAcc:0, alive:true, isBot,
    aiTarget:{x:Math.random()*WORLD.w,y:Math.random()*WORLD.h} };
  s.path.unshift({x:s.x,y:s.y}); return s;
}
function needForNext(s){ return 10 + Math.max(0, (s.length - s.baseLen)) * 2; }

let player=null; const snakes=[]; const BOT_NUM=12;
function spawnBots(n=BOT_NUM){ for(let i=0;i<n;i++){ snakes.push(createSnake(['#79a7ff'],Math.random()*WORLD.w,Math.random()*WORLD.h,true,3+Math.floor(Math.random()*8))); } }

/* ======= Input ======= */
const keys={}; addEventListener('keydown',e=>{ keys[e.key.toLowerCase()]=true; if(e.key==='r'||e.key==='R') resetMatch(); });
addEventListener('keyup',e=>{ keys[e.key.toLowerCase()]=false; });

const pointer={x:vw/2,y:vh/2,down:false};
addEventListener('pointerdown',e=>{ pointer.down=true; pointer.x=e.clientX; pointer.y=e.clientY; });
addEventListener('pointermove',e=>{ pointer.x=e.clientX; pointer.y=e.clientY; });
addEventListener('pointerup',()=>{ pointer.down=false; });
addEventListener('pointercancel',()=>{ pointer.down=false; });

const joy=document.getElementById('joy'), knob=document.getElementById('knob'); let joyState={ax:0,ay:0,active:false};
function setKnob(cx,cy){ knob.style.left=cx+'%'; knob.style.top=cy+'%'; } setKnob(50,50);
function handleJoy(e,type){
  const r=joy.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
  let x,y; if(e.touches&&e.touches[0]){ x=e.touches[0].clientX; y=e.touches[0].clientY; } else { x=e.clientX; y=e.clientY; }
  const dx=x-cx, dy=y-cy, rad=r.width/2, mag=Math.hypot(dx,dy), cl=mag>rad?rad:mag;
  const nx=mag?dx/mag*cl:0, ny=mag?dy/mag*cl:0; setKnob((nx/rad)*50+50,(ny/rad)*50+50);
  joyState.ax=(nx/rad); joyState.ay=(ny/rad);
  if(type==='end'){ joyState.ax=0; joyState.ay=0; setKnob(50,50); joyState.active=false; } else joyState.active=true;
}
joy.addEventListener('pointerdown',e=>{ joy.setPointerCapture(e.pointerId); handleJoy(e,'start'); });
joy.addEventListener('pointermove',e=>{ if(e.pressure>0) handleJoy(e,'move'); });
joy.addEventListener('pointerup',e=>{ handleJoy(e,'end'); });
joy.addEventListener('pointercancel',e=>{ handleJoy(e,'end'); });
let boostHold=false;
boostBtn.addEventListener('pointerdown',()=>{ boostHold=true; });
boostBtn.addEventListener('pointerup',()=>{ boostHold=false; });
boostBtn.addEventListener('pointercancel',()=>{ boostHold=false; });

/* ======= Nameplate style dari saldo.js ======= */
let playerName = "USER";
let playerTextColor = "#ffffff";
let nameBg = { mode:'solid', color:'rgba(0,0,0,.35)', animate:false, durationMs:8000 };
let nameBorder = { mode:'solid', color:'#000', width:1 };
let badgeRadius = 6;

export function setNameStyle(nick){
  playerName = nick?.name || 'USER';
  playerTextColor = nick?.color || '#fff';
  if (nick?.bgCanvas)    nameBg = { ...nameBg, ...nick.bgCanvas };
  if (nick?.borderCanvas) nameBorder = { ...nameBorder, ...nick.borderCanvas };
  if (typeof nick?.radius === 'number') badgeRadius = nick.radius;
  // fallback transparan → pakai semi-gelap
  if (nameBg.mode==='solid' && (!nameBg.color || nameBg.color==='transparent')) {
    nameBg.color = 'rgba(0,0,0,.35)';
  }
}

/* ======= Helpers gradient & rounded rect ======= */
function roundedRectPath(x,y,w,h,r){
  const rr=Math.max(0, Math.min(r, Math.min(w,h)/2));
  ctx.beginPath();
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);
  ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);
  ctx.closePath();
}
function linearGradientXY(x,y,w,h,angleRad,colors,phase=0){
  // panjang proyeksi ke arah sudut
  const cx=x+w/2, cy=y+h/2;
  const r = (Math.abs(w*Math.cos(angleRad)) + Math.abs(h*Math.sin(angleRad))) / 2;
  const dx = Math.cos(angleRad), dy=Math.sin(angleRad);
  const x0 = cx - dx*(r+phase);
  const y0 = cy - dy*(r+phase);
  const x1 = cx + dx*(r+phase);
  const y1 = cy + dy*(r+phase);
  const g = ctx.createLinearGradient(x0,y0,x1,y1);
  const n = Math.max(2, (colors||['#fff','#000']).length);
  (colors||['#fff','#000']).forEach((c,i)=> g.addColorStop(i/(n-1), c));
  return g;
}

/* ======= Render ======= */
function drawGrid(){
  const step=WORLD.grid*camera.zoom; if(step<14) return;
  const ox=-((camera.x*camera.zoom)%step), oy=-((camera.y*camera.zoom)%step);
  ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.lineWidth=1; ctx.beginPath();
  for(let x=ox;x<vw;x+=step){ctx.moveTo(x,0);ctx.lineTo(x,vh);}
  for(let y=oy;y<vh;y+=step){ctx.moveTo(0,y);ctx.lineTo(vw,y);}
  ctx.stroke();
}

function drawFruit(f){
  const s=worldToScreen(f.x,f.y);
  if(s.x<-30||s.y<-30||s.x>vw+30||s.y>vh+30) return;
  ctx.save(); ctx.translate(s.x,s.y); ctx.scale(camera.zoom,camera.zoom);
  ctx.fillStyle='#ff5d73'; ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function moveWithBezier(ctx, pts, tension=0.75){
  ctx.moveTo(pts[0].x, pts[0].y);
  for(let i=0;i<pts.length-1;i++){
    const p0=i>0?pts[i-1]:pts[i], p1=pts[i], p2=pts[i+1], p3=(i!=pts.length-2)?pts[i+2]:p2, t=tension;
    const cp1x=p1.x+(p2.x-p0.x)*t/6, cp1y=p1.y+(p2.y-p0.y)*t/6;
    const cp2x=p2.x-(p3.x-p1.x)*t/6, cp2y=p2.y-(p3.y-p1.y)*t/6;
    ctx.bezierCurveTo(cp1x,cp1y,cp2x,cp2y,p2.x,p2.y);
  }
}
function chaikinSmooth(pts, iterations=2){
  let out=pts.slice();
  for(let k=0;k<iterations;k++){
    const res=[out[0]];
    for(let i=0;i<out.length-1;i++){
      const p=out[i], q=out[i+1];
      const Q={x:p.x*0.75+q.x*0.25, y:p.y*0.75+q.y*0.25};
      const R={x:p.x*0.25+q.x*0.75, y:p.y*0.25+q.y*0.75};
      res.push(Q,R);
    }
    res.push(out[out.length-1]);
    out=res;
  }
  return out;
}
function screenSegmentsFromSnake(sn){
  const pts=[]; for(let i=sn.path.length-1;i>=0;i--){ const p=sn.path[i]; const s=worldToScreen(p.x,p.y); pts.push({x:s.x,y:s.y}); }
  const headNow=worldToScreen(sn.x,sn.y); pts.push({x:headNow.x,y:headNow.y});
  const segs=[]; let cur=[pts[0]];
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1], b=pts[i];
    if(Math.abs(a.x-b.x)>vw*0.6 || Math.abs(a.y-b.y)>vh*0.6){ segs.push(cur); cur=[b]; } else cur.push(b);
  }
  if(cur.length>1) segs.push(cur); return segs;
}
function strokeStripedPath(pts, strokeWidth, colors, outlineWidth=0){
  if(pts.length<2) return;
  const sm=chaikinSmooth(pts,2);
  if(outlineWidth>0){ ctx.beginPath(); moveWithBezier(ctx, sm, 0.75);
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=strokeWidth+outlineWidth*2; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke(); }
  const cols=(colors&&colors.length)?colors:['#58ff9b'];
  ctx.beginPath(); moveWithBezier(ctx, sm, 0.75);
  ctx.strokeStyle=cols[0]; ctx.lineWidth=strokeWidth; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke();
}

/* === Badge: identik dgn DOM (radius, border width, gradient, anim) === */
let animClock = 0; // ms
function drawNameplateRect(x, y, w, h){
  // BG
  let fillStyle;
  if (nameBg.mode === 'gradient') {
    // animasi 8s → geser gradient maju-mundur
    const dur = Math.max(100, nameBg.durationMs || 8000);
    const t = (animClock % dur) / dur;          // 0..1
    const phase = (t - 0.5) * 2;                // -1..1
    const r = (Math.abs(w*Math.cos(nameBg.angle||0)) + Math.abs(h*Math.sin(nameBg.angle||0))) / 2;
    fillStyle = linearGradientXY(x,y,w,h, nameBg.angle||0, nameBg.colors||['#fff','#000'], phase * r * 0.8);
  } else {
    fillStyle = nameBg.color || 'rgba(0,0,0,.35)';
  }
  ctx.fillStyle = fillStyle;
  roundedRectPath(x,y,w,h,badgeRadius);
  ctx.fill();

  // BORDER
  ctx.lineWidth = Math.max(1, nameBorder.width || 1);
  if (nameBorder.mode === 'gradient') {
    ctx.strokeStyle = linearGradientXY(x,y,w,h, nameBorder.angle||0, nameBorder.colors||['#000','#333'], 0);
  } else {
    ctx.strokeStyle = nameBorder.color || '#000';
  }
  roundedRectPath(x,y,w,h,badgeRadius);
  ctx.stroke();
}

function drawSnake(sn){
  if(sn.path.length<2) return;
  const rPix=bodyRadius(sn)*camera.zoom, segs=screenSegmentsFromSnake(sn);
  for(const seg of segs){ if(seg.length<2) continue; strokeStripedPath(seg, rPix*2, sn.colors, rPix*0.65); }

  // Head
  const headS=worldToScreen(sn.x,sn.y), rr=(6.5+0.1*Math.sqrt(sn.length))*camera.zoom;
  ctx.beginPath(); ctx.arc(headS.x, headS.y, rr, 0, Math.PI*2); ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.lineWidth=2; ctx.stroke();
  ctx.beginPath(); ctx.arc(headS.x+rr*0.25, headS.y-rr*0.15, rr*0.35, 0, Math.PI*2); ctx.fillStyle='#000'; ctx.fill();

  // Nameplate — ukuran & posisi seperti sebelumnya
  const s=worldToScreen(sn.x,sn.y);
  const padX=34, padY=16*camera.zoom;
  const x = s.x - padX, y = s.y - 22*camera.zoom, w = padX*2, h = padY;

  ctx.save();
  drawNameplateRect(x,y,w,h);
  ctx.font=`${12*camera.zoom}px system-ui,Segoe UI`;
  ctx.fillStyle = playerTextColor || '#fff';
  ctx.textAlign='center'; ctx.textBaseline='bottom';
  ctx.fillText(playerName || 'USER', s.x, s.y-10*camera.zoom);
  ctx.restore();
}

/* ======= Game Loop ======= */
function updateSnake(s,dt){
  if(!s.alive) return;
  let target=s.dir, sx=0,sy=0;
  if(keys['w']||keys['arrowup']) sy-=1;
  if(keys['s']||keys['arrowdown']) sy+=1;
  if(keys['a']||keys['arrowleft']) sx-=1;
  if(keys['d']||keys['arrowright']) sx+=1;

  if(s===player){
    if(joyState.active&&(Math.abs(joyState.ax)+Math.abs(joyState.ay))>0.05) target=Math.atan2(joyState.ay,joyState.ax);
    else if(pointer.down){ const head=worldToScreen(s.x,s.y); target=Math.atan2(pointer.y-head.y, pointer.x-head.x); }
    else if(sx||sy) target=Math.atan2(sy,sx);
    s.boost=boostHold||keys['shift'];
  }else if(s.isBot){
    const dx=s.aiTarget.x-s.x, dy=s.aiTarget.y-s.y;
    if((dx*dx+dy*dy)<140*140){ s.aiTarget.x=Math.random()*WORLD.w; s.aiTarget.y=Math.random()*WORLD.h; }
    target=Math.atan2(dy,dx)+(Math.random()*0.36-0.18);
    s.boost=Math.random()<0.012;
  }

  const MAX_TURN=3.4, delta=angNorm(target-s.dir);
  s.dir+=Math.max(-MAX_TURN*dt, Math.min(MAX_TURN*dt, delta));

  const want=(s.boost&&s.energy>0.15)?s.speedMax:s.speedBase;
  s.v=lerp(s.v||s.speedBase, want, (s.boost?0.35:0.18));
  if(s.boost&&s.energy>0.15){ s.energy=Math.max(0, s.energy-0.28*dt); } else { s.energy=Math.min(1, s.energy+0.14*dt); }

  const mv=s.v*dt; s.x+=Math.cos(s.dir)*mv; s.y+=Math.sin(s.dir)*mv; wrapPos(s);

  const SP=segSpace(s); s._pathAcc+=mv; while(s._pathAcc>=SP){ s.path.unshift({x:s.x,y:s.y}); s._pathAcc-=SP; }
  const maxPath=Math.floor(5.5 * s.length * (BASE_SEG_SPACE / SP)); if(s.path.length>maxPath) s.path.length=maxPath;

  for(let i=foods.length-1;i>=0;i--){
    const f=foods[i], dx=s.x-f.x, dy=s.y-f.y, eatR=bodyRadius(s)+10;
    if(dx*dx+dy*dy<eatR*eatR){
      foods.splice(i,1);
      s.fruitProgress += 1;
      if(s.fruitProgress >= needForNext(s)){ s.fruitProgress = 0; s.length += 1; }
    }
  }
}

let last=performance.now();
let rankTick=0;
function loop(now){
  const dt=Math.min(0.1,(now-last)/1000); last=now;
  animClock = now; // buat animasi gradient nama

  let t=dt; while(t>0){ const step=Math.min(1/60, t); for(const s of snakes) updateSnake(s,step); t-=step; }

  // camera follow
  if(player){
    const zLen=Math.min(0.5, Math.log10(1+player.length/10)*0.35);
    const zSpeed=Math.min(0.6,(player.v-player.speedBase)/(player.speedMax-player.speedBase+1e-6))*0.45;
    const targetZoom=clamp(1.15 - zSpeed - zLen, 0.35, 1.18);
    camera.zoom=lerp(camera.zoom,targetZoom,0.06); camera.x=lerp(camera.x,player.x,0.085); camera.y=lerp(camera.y,player.y,0.085);
  }

  ctx.clearRect(0,0,vw,vh);
  drawGrid();
  for(const f of foods) drawFruit(f);
  for(const s of snakes) drawSnake(s);

  if(player){ elLen.textContent=player.length; elUsers.textContent=snakes.filter(s=>s.alive).length; }
  rankTick += dt; if(rankTick>0.25){ /* update rank panel kalau ada */ rankTick=0; }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ======= API utk main.js / controller ======= */
export function startMatch(colors, startLen){
  snakes.splice(0,snakes.length); foods.splice(0,foods.length);
  userIdCounter=1; ensureFood(); spawnBots(BOT_NUM);
  player=createSnake(colors, Math.random()*WORLD.w*0.6+WORLD.w*0.2, Math.random()*WORLD.h*0.6+WORLD.h*0.2, false, startLen);
  snakes.push(player);
  camera.x=player.x; camera.y=player.y; camera.zoom=1;
  elLen.textContent=player.length; elUsers.textContent=snakes.filter(s=>s.alive).length;
}

export function resetMatch(){
  const colors = (player?.colors?.length ? player.colors.slice() : ['#58ff9b']);
  const len = player ? (player.baseLen||3) : 3;
  startMatch(colors, len);
}

export function setJoyInteractive(enabled){
  const joyEl=document.getElementById('joy');
  if (joyEl) joyEl.style.pointerEvents = enabled ? 'auto' : 'none';
}
