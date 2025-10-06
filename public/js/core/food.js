// public/js/core/food.js
import { State } from './state.js';
import { rand } from './utils.js';
import { worldToScreen } from './camera.js';

export const FRUITS = ['apple','orange','grape','watermelon','strawberry','lemon','blueberry','starfruit'];

export function spawnFood(x = rand(0, State.WORLD.w), y = rand(0, State.WORLD.h)) {
  const kind = FRUITS[Math.floor(rand(0, FRUITS.length))];
  State.foods.push({ kind, x, y });
}
export function ensureFood() {
  while (State.foods.length < State.FOOD_COUNT) spawnFood();
}

export function drawFruit(ctx, f) {
  const s = worldToScreen(f.x, f.y);
  if (s.x < -30 || s.y < -30 || s.x > State.vw + 30 || s.y > State.vh + 30) return;

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(State.camera.zoom, State.camera.zoom);

  switch (f.kind) {
    case 'apple':
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#3bdc68';
      ctx.beginPath(); ctx.ellipse(6,-9,4,2,-0.6,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#6b3b12'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(0,-14); ctx.stroke();
      break;
    case 'orange':
      ctx.fillStyle = '#ffa94d';
      ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.45)'; ctx.lineWidth=1;
      for (let a=0;a<6;a++){ ctx.beginPath(); ctx.moveTo(0,0);
        ctx.lineTo(Math.cos(a*Math.PI/3)*9, Math.sin(a*Math.PI/3)*9); ctx.stroke(); }
      break;
    case 'grape':
      ctx.fillStyle = '#a06cff';
      for (let i=0;i<5;i++){ const ang=i*1.256, rx=Math.cos(ang)*6, ry=Math.sin(ang)*4;
        ctx.beginPath(); ctx.arc(rx,ry,4.5,0,Math.PI*2); ctx.fill(); }
      ctx.fillStyle = '#3bdc68'; ctx.beginPath(); ctx.ellipse(-2,-9,4,2,0.3,0,Math.PI*2); ctx.fill();
      break;
    case 'watermelon':
      ctx.fillStyle = '#ff5d73';
      ctx.beginPath(); ctx.moveTo(-11,0); ctx.arc(0,0,11,Math.PI,0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2ed573'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0,0,11,Math.PI,0); ctx.stroke();
      ctx.fillStyle = '#111';
      for (let i=-2;i<=2;i++){ ctx.beginPath(); ctx.ellipse(i*3,-3,1.2,2.4,0,0,Math.PI*2); ctx.fill(); }
      break;
    case 'strawberry':
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath(); ctx.moveTo(0,10); ctx.quadraticCurveTo(12,4,8,-6);
      ctx.quadraticCurveTo(0,-12,-8,-6); ctx.quadraticCurveTo(-12,4,0,10); ctx.fill();
      ctx.fillStyle = '#3bdc68'; ctx.beginPath(); ctx.moveTo(-6,-8); ctx.lineTo(0,-14); ctx.lineTo(6,-8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fee440';
      for (let i=-4;i<=4;i+=4){ for(let j=-2;j<=6;j+=4){ ctx.beginPath(); ctx.arc(i,j,1,0,Math.PI*2); ctx.fill(); } }
      break;
    case 'lemon':
      ctx.fillStyle = '#ffe066';
      ctx.beginPath(); ctx.ellipse(0,0,12,8,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#fff385'; ctx.lineWidth=1; ctx.beginPath(); ctx.ellipse(0,0,8,5,0,0,Math.PI*2); ctx.stroke();
      break;
    case 'blueberry':
      ctx.fillStyle='#4c6ef5'; ctx.beginPath(); ctx.arc(0,0,9,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#2b2d42'; ctx.beginPath(); ctx.moveTo(-3,-1); ctx.lineTo(0,-4); ctx.lineTo(3,-1); ctx.lineTo(0,2); ctx.closePath(); ctx.fill();
      break;
    case 'starfruit':
      ctx.fillStyle='#e9ff70'; ctx.beginPath();
      for (let i=0;i<5;i++){ const a=-Math.PI/2 + i*2*Math.PI/5;
        const x1=Math.cos(a)*11, y1=Math.sin(a)*11;
        const x2=Math.cos(a+Math.PI/5)*5, y2=Math.sin(a+Math.PI/5)*5;
        if(i===0) ctx.moveTo(x1,y1); else ctx.lineTo(x1,y1); ctx.lineTo(x2,y2);
      }
      ctx.closePath(); ctx.fill(); ctx.strokeStyle='rgba(0,0,0,.15)'; ctx.lineWidth=1; ctx.stroke();
      break;
  }
  ctx.restore();
}

export function drawFood(ctx) { for (const f of State.foods) drawFruit(ctx, f); }
