// public/js/core/render.js
import { State } from './state.js';
import { updateRankPanel } from './rank.js';
import { worldToScreen } from './camera.js';
import { clamp } from './utils.js';
import { bodyRadius } from './snake.js';
import { drawFood } from './food.js';
import { updateHUDCounts } from './ui.js';

function chaikinSmooth(pts, iterations = 2) {
  let out = pts.slice();
  for (let k=0;k<iterations;k++){
    const res = [out[0]];
    for (let i=0;i<out.length-1;i++){
      const p = out[i], q = out[i+1];
      const Q = { x: p.x*0.75 + q.x*0.25, y: p.y*0.75 + q.y*0.25 };
      const R = { x: p.x*0.25 + q.x*0.75, y: p.y*0.25 + q.y*0.75 };
      res.push(Q,R);
    }
    res.push(out[out.length-1]); out = res;
  }
  return out;
}
function moveWithBezier(ctx, pts, tension = 0.75) {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i=0;i<pts.length-1;i++){
    const p0 = i>0?pts[i-1]:pts[i], p1 = pts[i], p2 = pts[i+1], p3 = (i!=pts.length-2)?pts[i+2]:p2, t=tension;
    const cp1x = p1.x + (p2.x - p0.x)*t/6, cp1y = p1.y + (p2.y - p0.y)*t/6;
    const cp2x = p2.x - (p3.x - p1.x)*t/6, cp2y = p2.y - (p3.y - p1.y)*t/6;
    ctx.bezierCurveTo(cp1x,cp1y,cp2x,cp2y,p2.x,p2.y);
  }
}
function screenSegmentsFromSnake(sn) {
  const pts = [];
  for (let i=sn.path.length-1;i>=0;i--) {
    const p = sn.path[i]; const s = worldToScreen(p.x, p.y); pts.push({ x:s.x, y:s.y });
  }
  const headNow = worldToScreen(sn.x, sn.y); pts.push({ x: headNow.x, y: headNow.y });
  const segs = []; let cur = [pts[0]];
  for (let i=1;i<pts.length;i++){
    const a = pts[i-1], b = pts[i];
    if (Math.abs(a.x-b.x) > State.vw*0.6 || Math.abs(a.y-b.y) > State.vh*0.6) { segs.push(cur); cur=[b]; }
    else cur.push(b);
  }
  if (cur.length>1) segs.push(cur);
  return segs;
}
function strokeStripedPath(ctx, pts, strokeWidth, colors, outlineWidth=0, glow=false) {
  if (pts.length<2) return;
  const smTailHead = chaikinSmooth(pts, 2);

  if (outlineWidth>0){
    ctx.beginPath(); moveWithBezier(ctx, smTailHead, 0.75);
    ctx.strokeStyle='rgba(0,0,0,0.35)';
    ctx.lineWidth = strokeWidth + outlineWidth*2;
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.stroke();
  }

  const cols = (colors && colors.length) ? colors : ['#58ff9b'];
  if (cols.length<=1){
    ctx.beginPath(); moveWithBezier(ctx, smTailHead, 0.75);
    ctx.strokeStyle = cols[0];
    ctx.lineWidth = strokeWidth; ctx.lineCap='round'; ctx.lineJoin='round';
    if (glow) { ctx.shadowBlur=14; ctx.shadowColor=cols[0]; }
    ctx.stroke(); if (glow) ctx.shadowBlur=0;
  } else {
    const smHeadTail = smTailHead.slice().reverse();
    const stripeLen = Math.max(18, strokeWidth*1.4);
    let acc=0, colorIdx=0, segStartIdx=0;
    const strokeSeg = (a,b,col)=>{
      if (b<=a) return;
      ctx.beginPath(); ctx.moveTo(smHeadTail[a].x, smHeadTail[a].y);
      for (let j=a+1;j<=b;j++) ctx.lineTo(smHeadTail[j].x, smHeadTail[j].y);
      ctx.strokeStyle=col; ctx.lineWidth=strokeWidth; ctx.lineCap='round'; ctx.lineJoin='round';
      if(glow){ ctx.shadowBlur=14; ctx.shadowColor=col; }
      ctx.stroke(); if(glow) ctx.shadowBlur=0;
    };
    for (let i=1;i<smHeadTail.length;i++){
      const dx = smHeadTail[i].x - smHeadTail[i-1].x, dy = smHeadTail[i].y - smHeadTail[i-1].y, d = Math.hypot(dx,dy);
      acc += d;
      if (acc>=stripeLen){ strokeSeg(segStartIdx,i, cols[colorIdx%cols.length]); segStartIdx=i; acc=0; colorIdx++; }
    }
    strokeSeg(segStartIdx, smHeadTail.length-1, cols[colorIdx%cols.length]);
  }

  ctx.globalAlpha=0.22;
  ctx.beginPath(); moveWithBezier(ctx, smTailHead, 0.75);
  ctx.strokeStyle='#ffffff';
  ctx.lineWidth = Math.max(1, strokeWidth*0.35);
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.stroke();
  ctx.globalAlpha=1;
}

function drawGrid(ctx) {
  const step = State.WORLD.grid * State.camera.zoom;
  if (step < 14) return;
  const ox = -((State.camera.x * State.camera.zoom) % step);
  const oy = -((State.camera.y * State.camera.zoom) % step);
  ctx.strokeStyle='rgba(255,255,255,0.05)';
  ctx.lineWidth=1; ctx.beginPath();
  for (let x=ox; x<State.vw; x+=step){ ctx.moveTo(x,0); ctx.lineTo(x,State.vh); }
  for (let y=oy; y<State.vh; y+=step){ ctx.moveTo(0,y); ctx.lineTo(State.vw,y); }
  ctx.stroke();
}

function drawSnake(ctx, sn) {
  if (sn.path.length<2) return;
  const rPix = bodyRadius(sn) * State.camera.zoom, segs = screenSegmentsFromSnake(sn);
  for (const seg of segs) {
    if (seg.length<2) continue;
    strokeStripedPath(ctx, seg, rPix*2, sn.colors, rPix*0.65, sn.isAdminRainbow);
  }
  const headS = worldToScreen(sn.x, sn.y);
  const rr = (6.5 + 0.1*Math.sqrt(sn.length)) * State.camera.zoom;
  ctx.beginPath(); ctx.arc(headS.x, headS.y, rr, 0, Math.PI*2);
  ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.lineWidth=2; ctx.stroke();
  ctx.beginPath(); ctx.arc(headS.x + rr*0.25, headS.y - rr*0.15, rr*0.35, 0, Math.PI*2);
  ctx.fillStyle='#000'; ctx.fill();

  // nameplate (pakai style pemilik snake)
  const nscr = headS;
  const padX = 34, padY = 16*State.camera.zoom;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.35)';
  ctx.fillRect(nscr.x - padX, nscr.y - 22*State.camera.zoom, padX*2, padY);
  ctx.strokeStyle = sn.borderColor || '#000';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(nscr.x - padX, nscr.y - 22*State.camera.zoom, padX*2, padY);
  ctx.font = `${12*State.camera.zoom}px system-ui,Segoe UI`;
  ctx.textAlign='center'; ctx.textBaseline='bottom';
  ctx.fillStyle = sn.nameColor || '#fff';
  ctx.fillText(sn.name || 'USER', nscr.x, nscr.y - 10*State.camera.zoom);
  ctx.restore();
}

let rankTimer = 0;
export function renderFrame(dt) {
  const { ctx } = State;
  ctx.clearRect(0,0,State.vw, State.vh);
  drawGrid(ctx);
  drawFood(ctx);
  for (const s of State.snakes) drawSnake(ctx, s);

  // HUD
  updateHUDCounts();
  rankTimer += dt;
  if (rankTimer > 0.25) { updateRankPanel(); rankTimer = 0; }
      }
