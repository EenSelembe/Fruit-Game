// Mesin game & render
import { clamp, rand, lerp, angNorm } from './helpers.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const elLen = document.getElementById('len');
const elUsers = document.getElementById('userCount');
const resetBtn = document.getElementById('reset');

let vw=0, vh=0, dpr=Math.max(1, Math.min(2, window.devicePixelRatio||1));
function resize(){ vw=innerWidth; vh=innerHeight; canvas.width=vw*dpr; canvas.height=vh*dpr; canvas.style.width=vw+'px'; canvas.style.height=vh+'px'; ctx.setTransform(dpr,0,0,dpr,0,0); }
addEventListener('resize', resize, {passive:true}); resize();

const WORLD={w:4200,h:4200,grid:90};
function wrapPos(p){ if(p.x<0)p.x+=WORLD.w; else if(p.x>=WORLD.w)p.x-=WORLD.w; if(p.y<0)p.y+=WORLD.h; else if(p.y>=WORLD.h)p.y-=WORLD.h; }
const camera={x:WORLD.w/2,y:WORLD.h/2,zoom:1};
function worldToScreen(x,y){ return {x:(x-camera.x)*camera.zoom+vw/2, y:(y-camera.y)*camera.zoom+vh/2}; }

// foods
const foods=[]; let FOOD_COUNT=1400;
const FRUITS=['apple','orange','grape','watermelon','strawberry','lemon','blueberry','starfruit'];
function spawnFood(x=rand(0,WORLD.w),y=rand(0,WORLD.h)){
  const kind=FRUITS[Math.floor(rand(0,FRUITS.length))];
  foods.push({kind,x,y,pulse:Math.random()*6.283});
}
function ensureFood(){ while(foods.length<FOOD_COUNT) spawnFood(); }

// snakes
function bodyRadius(s){ return 4 + 2*Math.sqrt(Math.max(0, s.length-3)); }
const BASE_SEG_SPACE=6;
function segSpace(s){ return Math.max(BASE_SEG_SPACE, bodyRadius(s)*0.9); }

let userIdCounter=1;
function createSnake(colors,x,y,isBot=false,len=3){
  const tag=`User ${userIdCounter++}`;
  const s={
    id:Math.random().toString(36).slice(2),
    label:'USER', rankName:tag,
    colors,
    x,y,dir:Math.random()*Math.PI*2 - Math.PI,
    speedBase:120,speedMax:220,v:0,boost:false,energy:1,
    length:len, baseLen:len, fruitProgress:0,
    path:[], _pathAcc:0, alive:true, isBot,
    aiTarget:{x:Math.random()*WORLD.w,y:Math.random()*WORLD.h}
  };
  s.path.unshift({x:s.x,y:s.y});
  return s;
}
function needForNext(s){ return 10 + Math.max(0, (s.length - s.baseLen)) * 2; }

let player=null; const snakes=[]; const BOT_NUM=12;
function spawnBots(n=BOT_NUM){ for(let i=0;i<n;i++){ snakes.push(createSnake(['#79a7ff'],Math.random()*WORLD.w,Math.random()*WORLD.h,true,3+Math.floor(Math.random()*8))); } }

// input
const keys={}; addEventListener('keydown',e=>{ keys[e.key.toLowerCase()]=true; if(e.key==='r'||e.key==='R') resetMatch(); });
addEventListener('keyup',e=>{ keys[e.key.toLowerCase()]=false; });
const pointer={x:vw/2,y:vh/2,down:false}; addEventListener('pointerdown',e=>{ pointer.down=true; pointer.x=e.clientX; pointer.y=e.clientY; });
addEventListener('pointermove',e=>{ pointer.x=e.clientX; pointer.y=e.clientY; }); addEventListener('pointerup',()=>{ pointer.down=false; }); addEventListener('pointercancel',()=>{ pointer.down=false; });

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
const boostBtn=document.getElementById('boostBtn'); let boostHold=false;
boostBtn.addEventListener('pointerdown',()=>{ boostHold=true; });
boostBtn.addEventListener('pointerup',()=>{ boostHold=false; });
boostBtn.addEventListener('pointercancel',()=>{ boostHold=false; });

// ===== Nameplate style (dari saldo.js) =====
let playerName = "USER";
let playerTextColor = "#ffffff";
// background & border utk canvas:
let nameBg = { mode:'solid', color:'rgba(0,0,0,.35)' };
let nameBorder = { mode:'solid', color:'#000' };

export function setNameStyle(nick){
  // nick: { name, color, borderColorCanvas, bgCanvas?, borderCanvas? }
  playerName = nick?.name || 'USER';
  playerTextColor = nick?.color || '#fff';
  if (nick?.bgCanvas) nameBg = nick.bgCanvas;
  if (nick?.borderCanvas) nameBorder = nick.borderCanvas;
  // fallback kalau kosong
  if (nameBg.mode==='solid' && (!nameBg.color || nameBg.color==='transparent')) {
    nameBg = { mode:'solid', color:'rgba(0,0,0,.35)' };
  }
  if (nameBorder.mode==='solid' && !nameBorder.color) {
    nameBorder = { mode:'solid', color:'#000' };
  }
}

// util: bikin linear gradient berdasarkan sudut
function makeLinearGradient(ctx, x, y, w, h, angleRad, colors){
  const cx = x + w/2, cy = y + h/2;
  // panjang radius proyeksi ke sudut
  const r = (Math.abs(w*Math.cos(angleRad)) + Math.abs(h*Math.sin(angleRad))) / 2;
  const x0 = cx - Math.cos(angleRad)*r;
  const y0 = cy - Math.sin(angleRad)*r;
  const x1 = cx + Math.cos(angleRad)*r;
  const y1 = cy + Math.sin(angleRad)*r;
  const g = ctx.createLinearGradient(x0,y0,x1,y1);
  const n = Math.max(2, colors.length);
  colors.forEach((c,i)=> g.addColorStop(i/(n-1), c));
  return g;
}

function drawNameplate(x, y, w, h){
  // background
  if (nameBg.mode === 'gradient') {
    ctx.fillStyle = makeLinearGradient(ctx, x, y, w, h, nameBg.angle || 0, nameBg.colors || ['#fff','#000']);
  } else {
    ctx.fillStyle = nameBg.color || 'rgba(0,0,0,.35)';
  }
  ctx.fillRect(x, y, w, h);

  // border
  if (nameBorder.mode === 'gradient') {
    ctx.strokeStyle = makeLinearGradient(ctx, x, y, w, h, nameBorder.angle || 0, nameBorder.colors || ['#000','#333']);
  } else {
    ctx.strokeStyle = nameBorder.color || '#000';
  }
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
}

function updateSnake(s,dt){
  if(!s.alive) return;
  let targetAngle=s.dir, steerX=0,steerY=0;
  if(keys['w']||keys['arrowup']) steerY-=1;
  if(keys['s']||keys['arrowdown']) steerY+=1;
  if(keys['a']||keys['arrowleft']) steerX-=1;
  if(keys['d']||keys['arrowright']) steerX+=1;

  if(s===player){
    if(joyState.active&&(Math.abs(joyState.ax)+Math.abs(joyState.ay))>0.05) targetAngle=Math.atan2(joyState.ay,joyState.ax);
    else if(pointer.down){ const head=worldToScreen(s.x,s.y); targetAngle=Math.atan2(pointer.y-head.y, pointer.x-head.x); }
    else if(steerX||steerY) targetAngle=Math.atan2(steerY,steerX);
    s.boost=boostHold||keys['shift'];
  }else if(s.isBot){
    const dx=s.aiTarget.x-s.x, dy=s.aiTarget.y-s.y;
    if((dx*dx+dy*dy)<140*140){ s.aiTarget.x=Math.random()*WORLD.w; s.aiTarget.y=Math.random()*WORLD.h; }
    targetAngle=Math.atan2(dy,dx)+(Math.random()*0.36-0.18);
    s.boost=Math.random()<0.012;
  }

  const MAX_TURN=3.4, delta=angNorm(targetAngle-s.dir);
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
      if(s.fruitProgress >= needForNext(s)){
        s.fruitProgress = 0;
        s.length += 1;
      }
    }
  }

  for(const o of snakes){
    if(!o.alive || o===s) continue;
    const rS=bodyRadius(s), rO=bodyRadius(o), thresh=(rS+rO)*0.7, step=3;
    for(let i=6;i<o.path.length;i+=step){
      const p=o.path[i], dx=s.x-p.x, dy=s.y-p.y;
      if(dx*dx+dy*dy < thresh*thresh){ killSnake(s,o); return; }
    }
  }
}

function killSnake(s){
  if(!s.alive) return; s.alive=false;
  for(let i=0;i<s.path.length;i+=Math.max(6, Math.floor(segSpace(s)))){ const p=s.path[i]; spawnFood(p.x+(Math.random()*12-6), p.y+(Math.random()*12-6)); }
  if(s.isBot){
    setTimeout(()=>{ const idx=snakes.indexOf(s); if(idx>=0) snakes.splice(idx,1);
      snakes.push(createSnake(['#79a7ff'],Math.random()*WORLD.w,Math.random()*WORLD.h,true,3+Math.floor(Math.random()*8)));
    },700);
  }
}

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
  ctx.save();
  ctx.translate(s.x,s.y);
  ctx.scale(camera.zoom,camera.zoom);

  switch(f.kind){
    case 'apple':
      ctx.fillStyle='#ff4d4d';
      ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#3bdc68';
      ctx.beginPath(); ctx.ellipse(6,-9,4,2,-0.6,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#6b3b12'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(0,-14); ctx.stroke();
      break;
    case 'orange':
      ctx.fillStyle='#ffa94d';
      ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.45)'; ctx.lineWidth=1;
      for(let a=0;a<6;a++){ ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(a*Math.PI/3)*9,Math.sin(a*Math.PI/3)*9); ctx.stroke(); }
      break;
    case 'grape':
      ctx.fillStyle='#a06cff';
      for(let i=0;i<5;i++){ const ang=i*1.256, rx=Math.cos(ang)*6, ry=Math.sin(ang)*4; ctx.beginPath(); ctx.arc(rx,ry,4.5,0,Math.PI*2); ctx.fill(); }
      ctx.fillStyle='#3bdc68'; ctx.beginPath(); ctx.ellipse(-2,-9,4,2,0.3,0,Math.PI*2); ctx.fill();
      break;
    case 'watermelon':
      ctx.fillStyle='#ff5d73';
      ctx.beginPath(); ctx.moveTo(-11,0); ctx.arc(0,0,11,Math.PI,0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle='#2ed573'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,0,11,Math.PI,0); ctx.stroke();
      ctx.fillStyle='#111'; for(let i=-2;i<=2;i++){ ctx.beginPath(); ctx.ellipse(i*3,-3,1.2,2.4,0,0,Math.PI*2); ctx.fill(); }
      break;
    case 'strawberry':
      ctx.fillStyle='#ff4d6d';
      ctx.beginPath();
      ctx.moveTo(0,10); ctx.quadraticCurveTo(12,4,8,-6); ctx.quadraticCurveTo(0,-12,-8,-6); ctx.quadraticCurveTo(-12,4,0,10);
      ctx.fill();
      ctx.fillStyle='#3bdc68'; ctx.beginPath(); ctx.moveTo(-6,-8); ctx.lineTo(0,-14); ctx.lineTo(6,-8); ctx.closePath(); ctx.fill();
      ctx.fillStyle='#fee440'; for(let i=-4;i<=4;i+=4){ for(let j=-2;j<=6;j+=4){ ctx.beginPath(); ctx.arc(i,j,1,0,Math.PI*2); ctx.fill(); } }
      break;
    case 'lemon':
      ctx.fillStyle='#ffe066';
      ctx.beginPath(); ctx.ellipse(0,0,12,8,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#fff385'; ctx.lineWidth=1; ctx.beginPath(); ctx.ellipse(0,0,8,5,0,0,Math.PI*2); ctx.stroke();
      break;
    case 'blueberry':
      ctx.fillStyle='#4c6ef5';
      ctx.beginPath(); ctx.arc(0,0,9,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#2b2d42';
      ctx.beginPath(); ctx.moveTo(-3,-1); ctx.lineTo(0,-4); ctx.lineTo(3,-1); ctx.lineTo(0,2); ctx.closePath(); ctx.fill();
      break;
    case 'starfruit':
      ctx.fillStyle='#e9ff70';
      ctx.beginPath();
      for(let i=0;i<5;i++){
        const a=-Math.PI/2+i*2*Math.PI/5;
        const x1=Math.cos(a)*11, y1=Math.sin(a)*11;
        const x2=Math.cos(a+Math.PI/5)*5, y2=Math.sin(a+Math.PI/5)*5;
        if(i===0) ctx.moveTo(x1,y1); else ctx.lineTo(x1,y1);
        ctx.lineTo(x2,y2);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,.15)'; ctx.lineWidth=1; ctx.stroke();
      break;
  }

  ctx.restore();
}

function drawFood(){ for(const f of foods) drawFruit(f); }

// smoothing
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
    for(let i=0;i<out.length-1;i++){ const p=out[i], q=out[i+1];
      const Q={x:p.x*0.75+q.x*0.25, y:p.y*0.75+q.y*0.25};
      const R={x:p.x*0.25+q.x*0.75, y:p.y*0.25+q.y*0.75};
      res.push(Q,R);
    }
    res.push(out[out.length-1]); out=res;
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
  const smTailHead=chaikinSmooth(pts,2);
  if(outlineWidth>0){ ctx.beginPath(); moveWithBezier(ctx, smTailHead, 0.75);
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=strokeWidth+outlineWidth*2; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke(); }
  const cols=(colors&&colors.length)?colors:['#58ff9b'];
  if(cols.length<=1){
    ctx.beginPath(); moveWithBezier(ctx, smTailHead, 0.75);
    ctx.strokeStyle=cols[0]; ctx.lineWidth=strokeWidth; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke();
  }else{
    const smHeadTail=smTailHead.slice().reverse();
    const stripeLen=Math.max(18, strokeWidth*1.4);
    let acc=0, colorIdx=0, segStartIdx=0;
    function strokeSegment(a,b,col){ if(b<=a) return; ctx.beginPath(); ctx.moveTo(smHeadTail[a].x,smHeadTail[a].y);
      for(let j=a+1;j<=b;j++) ctx.lineTo(smHeadTail[j].x,smHeadTail[j].y);
      ctx.strokeStyle=col; ctx.lineWidth=strokeWidth; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke(); }
    for(let i=1;i<smHeadTail.length;i++){
      const dx=smHeadTail[i].x-smHeadTail[i-1].x, dy=smHeadTail[i].y-smHeadTail[i-1].y, d=Math.hypot(dx,dy);
      acc+=d; if(acc>=stripeLen){ strokeSegment(segStartIdx,i,cols[colorIdx%cols.length]); segStartIdx=i; acc=0; colorIdx++; }
    }
    strokeSegment(segStartIdx, smHeadTail.length-1, cols[colorIdx%cols.length]);
  }
  ctx.globalAlpha=0.22; ctx.beginPath(); moveWithBezier(ctx, smTailHead, 0.75);
  ctx.strokeStyle='#ffffff'; ctx.lineWidth=Math.max(1, strokeWidth*0.35); ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke(); ctx.globalAlpha=1;
}

function drawSnake(sn){
  if(sn.path.length<2) return;
  const rPix=bodyRadius(sn)*camera.zoom, segs=screenSegmentsFromSnake(sn);
  for(const seg of segs){ if(seg.length<2) continue; strokeStripedPath(seg, rPix*2, sn.colors, rPix*0.65); }

  const headS=worldToScreen(sn.x,sn.y), rr=(6.5+0.1*Math.sqrt(sn.length))*camera.zoom;
  ctx.beginPath(); ctx.arc(headS.x, headS.y, rr, 0, Math.PI*2); ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.lineWidth=2; ctx.stroke();
  ctx.beginPath(); ctx.arc(headS.x+rr*0.25, headS.y-rr*0.15, rr*0.35, 0, Math.PI*2); ctx.fillStyle='#000'; ctx.fill();

  // ===== nameplate =====
  const nscr=worldToScreen(sn.x,sn.y);
  const padX=34, padY=16*camera.zoom;
  const rectX = nscr.x - padX;
  const rectY = nscr.y - 22*camera.zoom;
  const rectW = padX*2;
  const rectH = padY;

  ctx.save();
  drawNameplate(rectX, rectY, rectW, rectH);

  ctx.font=`${12*camera.zoom}px system-ui,Segoe UI`; 
  ctx.textAlign='center'; 
  ctx.textBaseline='bottom';
  ctx.fillStyle=playerTextColor || '#fff';
  ctx.fillText(playerName || 'USER', nscr.x, nscr.y-10*camera.zoom);
  ctx.restore();
}

// rank UI
const rankRowsEl=document.getElementById('rankRows');
function updateRankPanel(){
  const top = snakes.filter(s=>s.alive).sort((a,b)=> b.length - a.length).slice(0,5);
  rankRowsEl.innerHTML = top.map((s,i)=>{
    const me = (s===player) ? ' me' : '';
    return `<div class="rrow${me}"><div class="title">${i+1}. User</div><div class="sub">Len ${s.length}</div></div>`;
  }).join('');
}

function stepPhysics(dt){ const h=1/60; while(dt>0){ const step=Math.min(h,dt); for(const s of snakes) updateSnake(s, step); dt-=step; } }

let last=performance.now();
let rankTimer=0;
function loop(now){
  let frameDt=Math.min(0.1,(now-last)/1000); last=now; stepPhysics(frameDt);

  if(player){
    const zLen=Math.min(0.5, Math.log10(1+player.length/10)*0.35);
    const zSpeed=Math.min(0.6,(player.v-player.speedBase)/(player.speedMax-player.speedBase+1e-6))*0.45;
    const tZoom=clamp(1.15 - zSpeed - zLen, 0.35, 1.18);
    camera.zoom=lerp(camera.zoom,tZoom,0.06); camera.x=lerp(camera.x,player.x,0.085); camera.y=lerp(camera.y,player.y,0.085);
  }

  ctx.clearRect(0,0,vw,vh);
  drawGrid();
  for(const f of foods) drawFruit(f);
  for(const s of snakes) drawSnake(s);

  if(player){ if(elLen) elLen.textContent=player.length; if(elUsers) elUsers.textContent=snakes.filter(s=>s.alive).length; }
  rankTimer += frameDt; if(rankTimer>0.25){ updateRankPanel(); rankTimer=0; }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// API utk controller
export function startMatch(colors, startLen){
  snakes.splice(0,snakes.length); foods.splice(0,foods.length);
  userIdCounter=1;
  ensureFood(); spawnBots(BOT_NUM);
  player=createSnake(colors, Math.random()*WORLD.w*0.6+WORLD.w*0.2, Math.random()*WORLD.h*0.6+WORLD.h*0.2, false, startLen);
  snakes.push(player);
  camera.x=player.x; camera.y=player.y; camera.zoom=1;
  if (elLen) elLen.textContent=player.length;
  if (elUsers) elUsers.textContent=snakes.filter(s=>s.alive).length;
  updateRankPanel();
}

export function resetMatch(){
  const colors=['#58ff9b'];
  if (player && Array.isArray(player.colors) && player.colors.length) colors.splice(0,colors.length,...player.colors);
  const len = player ? (player.baseLen||3) : 3;
  startMatch(colors, len);
}

export function setJoyInteractive(enabled){
  const joyEl=document.getElementById('joy');
  if (joyEl) joyEl.style.pointerEvents = enabled ? 'auto' : 'none';
    }
