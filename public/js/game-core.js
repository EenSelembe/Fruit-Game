// /public/js/game-core.js
// Inti game (fisika + render). Fokus update: nameplate di atas kepala ular
// memakai style dari Firestore (bg/bgGradient + border/borderGradient + color).

(function(){
  const H = window.Helpers;

  /* ===== Canvas & Dunia ===== */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let vw=0, vh=0, dpr=Math.max(1, Math.min(2, window.devicePixelRatio||1));
  function resize(){
    vw=innerWidth; vh=innerHeight;
    canvas.width=vw*dpr; canvas.height=vh*dpr;
    canvas.style.width=vw+'px'; canvas.style.height=vh+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  addEventListener('resize', resize, {passive:true}); resize();

  const WORLD={w:4200,h:4200,grid:90};
  function wrapPos(p){ if(p.x<0)p.x+=WORLD.w; else if(p.x>=WORLD.w)p.x-=WORLD.w; if(p.y<0)p.y+=WORLD.h; else if(p.y>=WORLD.h)p.y-=WORLD.h; }
  const camera={x:WORLD.w/2,y:WORLD.h/2,zoom:1};
  const worldToScreen=(x,y)=>({x:(x-camera.x)*camera.zoom+vw/2, y:(y-camera.y)*camera.zoom+vh/2});

  /* ===== State Game ===== */
  const FRUITS=['apple','orange','grape','watermelon','strawberry','lemon','blueberry','starfruit'];
  const foods=[]; let FOOD_COUNT=1400;
  function rand(a,b){ return Math.random()*(b-a)+a; }
  function spawnFood(x=rand(0,WORLD.w),y=rand(0,WORLD.h)){ const kind=FRUITS[Math.floor(rand(0,FRUITS.length))]; foods.push({kind,x,y}); }
  function ensureFood(){ while(foods.length<FOOD_COUNT) spawnFood(); }

  const BASE_SEG_SPACE=6;
  function bodyRadius(s){ return 4 + 2*Math.sqrt(Math.max(0, s.length-3)); }
  function segSpace(s){ return Math.max(BASE_SEG_SPACE, bodyRadius(s)*0.9); }
  function needForNext(s){ return 10 + Math.max(0, (s.length - s.baseLen)) * 2; }

  let userIdCounter=1;
  function createSnake(colors,x,y,isBot=false,len=3){
    const s={
      id:Math.random().toString(36).slice(2),
      label:'USER',
      colors, x,y, dir:rand(-Math.PI,Math.PI),
      speedBase:120,speedMax:220,v:0,boost:false,energy:1,
      length:len, baseLen:len, fruitProgress:0,
      path:[], _pathAcc:0, alive:true, isBot,
      aiTarget:{x:rand(0,WORLD.w),y:rand(0,WORLD.h)}
    };
    s.path.unshift({x:s.x,y:s.y});
    return s;
  }

  let player=null; const snakes=[]; const BOT_NUM=12;

  /* ===== Input ===== */
  const keys={};
  addEventListener('keydown',e=>{ keys[e.key.toLowerCase()]=true; if(e.key==='r'||e.key==='R') Game.quickReset(); });
  addEventListener('keyup',e=>{ keys[e.key.toLowerCase()]=false; });
  const pointer={x:vw/2,y:vh/2,down:false};
  addEventListener('pointerdown',e=>{ pointer.down=true; pointer.x=e.clientX; pointer.y=e.clientY; });
  addEventListener('pointermove',e=>{ pointer.x=e.clientX; pointer.y=e.clientY; });
  addEventListener('pointerup',()=>{ pointer.down=false; }); addEventListener('pointercancel',()=>{ pointer.down=false; });

  const joy=document.getElementById('joy'), knob=document.getElementById('knob');
  let joyState={ax:0,ay:0,active:false};
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

  /* ===== UI kecil ===== */
  const elLen=document.getElementById('len');
  const elUsers=document.getElementById('userCount');
  const rankRowsEl=document.getElementById('rankRows');
  const toast=document.getElementById('toast');
  function showToast(msg,t=1500){ if(!toast) return; toast.textContent=msg; toast.style.display='block'; clearTimeout(showToast._t); showToast._t=setTimeout(()=>toast.style.display='none',t); }

  function updateRankPanel(){
    if(!rankRowsEl) return;
    const top = snakes.filter(s=>s.alive).sort((a,b)=> b.length - a.length).slice(0,5);
    rankRowsEl.innerHTML = top.map((s,i)=>{
      const me = (s===player) ? ' me' : '';
      return `<div class="rrow${me}"><div class="title">${i+1}. User</div><div class="sub">Len ${s.length}</div></div>`;
    }).join('');
  }

  /* ===== Fisika ===== */
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
      if((dx*dx+dy*dy)<140*140){ s.aiTarget.x=rand(0,WORLD.w); s.aiTarget.y=rand(0,WORLD.h); }
      targetAngle=Math.atan2(dy,dx)+(Math.random()*0.36-0.18);
      s.boost=Math.random()<0.012;
    }

    const MAX_TURN=3.4, delta=((targetAngle - s.dir + Math.PI*3)%(Math.PI*2))-Math.PI;
    s.dir+=Math.max(-MAX_TURN*dt, Math.min(MAX_TURN*dt, delta));

    const want=(s.boost&&s.energy>0.15)?s.speedMax:s.speedBase;
    s.v=H.lerp(s.v||s.speedBase, want, (s.boost?0.35:0.18));
    if(s.boost&&s.energy>0.15){ s.energy=Math.max(0, s.energy-0.28*dt); } else { s.energy=Math.min(1, s.energy+0.14*dt); }

    const mv=s.v*dt; s.x+=Math.cos(s.dir)*mv; s.y+=Math.sin(s.dir)*mv; wrapPos(s);

    const SP=segSpace(s); s._pathAcc+=mv; while(s._pathAcc>=SP){ s.path.unshift({x:s.x,y:s.y}); s._pathAcc-=SP; }
    const maxPath=Math.floor(5.5 * s.length * (BASE_SEG_SPACE / SP)); if(s.path.length>maxPath) s.path.length=maxPath;

    // makan buah
    for(let i=foods.length-1;i>=0;i--){
      const f=foods[i], dx=s.x-f.x, dy=s.y-f.y, eatR=bodyRadius(s)+10;
      if(dx*dx+dy*dy<eatR*eatR){
        foods.splice(i,1);
        s.fruitProgress += 1;
        if(s.fruitProgress >= needForNext(s)){ s.fruitProgress = 0; s.length += 1; }
      }
    }

    // tabrakan kepala ke badan lain
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
        snakes.push(createSnake(['#79a7ff'],rand(0,WORLD.w),rand(0,WORLD.h),true,3+Math.floor(Math.random()*8)));
      },700);
    }else{
      showToast('Kamu tumbang! Tekan Reset untuk main lagi.');
    }
  }

  /* ===== Render ===== */
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
    ctx.fillStyle='#ff5d73'; ctx.beginPath(); ctx.arc(0,0,8,0,Math.PI*2); ctx.fill(); // simple, biar ringan
    ctx.restore();
  }
  function drawFood(){ for(const f of foods) drawFruit(f); }

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
    const sm=chaikinSmooth(pts,2);
    if(outlineWidth>0){ ctx.beginPath(); ctx.moveTo(sm[0].x,sm[0].y); for(let i=1;i<sm.length;i++) ctx.lineTo(sm[i].x,sm[i].y);
      ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=strokeWidth+outlineWidth*2; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke(); }
    const cols=(colors&&colors.length)?colors:['#58ff9b'];
    ctx.beginPath(); ctx.moveTo(sm[0].x,sm[0].y); for(let i=1;i<sm.length;i++) ctx.lineTo(sm[i].x,sm[i].y);
    ctx.strokeStyle=cols[0]; ctx.lineWidth=strokeWidth; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke();
    ctx.globalAlpha=0.22; ctx.beginPath(); ctx.moveTo(sm[0].x,sm[0].y); for(let i=1;i<sm.length;i++) ctx.lineTo(sm[i].x,sm[i].y);
    ctx.strokeStyle='#ffffff'; ctx.lineWidth=Math.max(1, strokeWidth*0.35); ctx.stroke(); ctx.globalAlpha=1;
  }

  function drawSnake(sn){
    if(sn.path.length<2) return;
    const rPix=bodyRadius(sn)*camera.zoom, segs=screenSegmentsFromSnake(sn);
    for(const seg of segs){ if(seg.length<2) continue; strokeStripedPath(seg, rPix*2, sn.colors, rPix*0.65); }

    // kepala
    const headS=worldToScreen(sn.x,sn.y), rr=(6.5+0.1*Math.sqrt(sn.length))*camera.zoom;
    ctx.beginPath(); ctx.arc(headS.x, headS.y, rr, 0, Math.PI*2); ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.lineWidth=2; ctx.stroke();
    ctx.beginPath(); ctx.arc(headS.x+rr*0.25, headS.y-rr*0.15, rr*0.35, 0, Math.PI*2); ctx.fillStyle='#000'; ctx.fill();

    // === NAMEPLATE (PERSIS HOME.HTML) ===
    let style = {
      color:'#fff', bgColor:'rgba(0,0,0,.35)', bgGradient:null, borderColor:'#000', borderGradient:null
    };
    let title = 'USER';
    if (sn === player) {
      // ambil dari Firestore (firebase-boot.js)
      const ps = window.App?.profileStyle;
      if (ps) {
        style = { color: ps.color, bgColor: ps.bgColor, bgGradient: ps.bgGradient,
                  borderColor: ps.borderColor, borderGradient: ps.borderGradient };
        title = ps.name || 'USER';
      }
    }
    const labelBottom = headS.y - 10*camera.zoom;
    H.drawNicknamePill(ctx, headS.x, labelBottom, title, style, camera.zoom);
  }

  /* ===== Loop ===== */
  function stepPhysics(dt){ const h=1/60; while(dt>0){ const step=Math.min(h,dt); for(const s of snakes) updateSnake(s, step); dt-=step; } }
  let last=performance.now(), rankTimer=0;
  function loop(now){
    let frameDt=Math.min(0.1,(now-last)/1000); last=now; stepPhysics(frameDt);

    if(player){
      const zLen=Math.min(0.5, Math.log10(1+player.length/10)*0.35);
      const zSpeed=Math.min(0.6,(player.v-player.speedBase)/(player.speedMax-player.speedBase+1e-6))*0.45;
      const tZoom=H.clamp(1.15 - zSpeed - zLen, 0.35, 1.18);
      camera.zoom=H.lerp(camera.zoom,tZoom,0.06); camera.x=H.lerp(camera.x,player.x,0.085); camera.y=H.lerp(camera.y,player.y,0.085);
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

  /* ===== API Game ===== */
  function startGame(colors, startLen){
    snakes.splice(0,snakes.length); foods.splice(0,foods.length);
    userIdCounter=1; ensureFood();

    // bot
    for(let i=0;i<12;i++) snakes.push(createSnake(['#79a7ff'],rand(0,WORLD.w),rand(0,WORLD.h),true,3+Math.floor(Math.random()*8)));

    // player
    player=createSnake((colors&&colors.length?colors:['#58ff9b']),
                       rand(WORLD.w*0.2,WORLD.w*0.8), rand(WORLD.h*0.2,WORLD.h*0.8),
                       false, startLen||3);
    snakes.push(player);
    camera.x=player.x; camera.y=player.y; camera.zoom=1;
    if(elLen) elLen.textContent=player.length;
    if(elUsers) elUsers.textContent=snakes.filter(s=>s.alive).length;
    updateRankPanel();
  }
  function quickReset(){
    // default reset: pakai setelan terakhir
    const lastCols = window.Game?._lastColors || ['#58ff9b'];
    const lastLen  = window.Game?._lastLen    || 3;
    startGame(lastCols, lastLen);
    showToast('Reset!');
  }

  // Expose
  const Game = window.Game = window.Game || {};
  Game.start = (colors,len)=>{ Game._lastColors=colors; Game._lastLen=len; startGame(colors,len); };
  Game.startGame = Game.start;
  Game.quickReset = quickReset;

})();
