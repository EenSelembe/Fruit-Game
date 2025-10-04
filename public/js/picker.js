import { PRICE_COLOR, PRICE_LEN, clamp } from './helpers.js';
import { setJoyInteractive } from './game-core.js';

const configPanel=document.getElementById('configPanel');
const startBtn=document.getElementById('startBtn');
const startLenInput=document.getElementById('startLenInput');
const boxes=[...document.querySelectorAll('.colorBox')];

const costColorEl=document.getElementById('costColor');
const costLenEl=document.getElementById('costLen');
const costTotalEl=document.getElementById('costTotal');

const colorModal=document.getElementById('colorModal');
const prevBox=document.getElementById('prevBox');
const hueEl=document.getElementById('hue'), satEl=document.getElementById('sat'), litEl=document.getElementById('lit'), hexEl=document.getElementById('hex');
const cancelPick=document.getElementById('cancelPick'), okPick=document.getElementById('okPick'), swatchesEl=document.getElementById('swatches');
const SWATCHES=['#ff5d73','#ff9f1a','#ffd84d','#58ff9b','#2ed573','#79a7ff','#4c6ef5','#b56eff','#ff4d6d','#e9ff70','#a06cff','#ffe066','#3bdc68','#00d1b2','#00ffff','#ffffff'];

let palette=['#ffffff','#ffffff','#ffffff','#ffffff','#ffffff'];
let selected=[false,false,false,false,false];
let currentBox=-1;

function hexToRgb(hex){
  hex = (hex||'').replace('#','').trim();
  if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
  if(!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const n=parseInt(hex,16);
  return {r:(n>>16)&255, g:(n>>8)&255, b:n&255};
}
function rgbToHsl(r, g, b){
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h,s,l=(max+min)/2;
  if(max===min){ h=s=0; }
  else{
    const d=max-min;
    s=l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h=(g-b)/d + (g<b?6:0); break;
      case g: h=(b-r)/d + 2; break;
      case b: h=(r-g)/d + 4; break;
    }
    h*=60;
  }
  return {h, s:s*100, l:l*100};
}
function hslToRgb(h, s, l){
  h/=360; s/=100; l/=100;
  const hue2rgb=(p,q,t)=>{ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; };
  let r,g,b;
  if(s===0){ r=g=b=l; }
  else{
    const q=l<0.5 ? l*(1+s) : l+s-l*s;
    const p=2*l-q;
    r=hue2rgb(p,q,h+1/3);
    g=hue2rgb(p,q,h);
    b=hue2rgb(p,q,h-1/3);
  }
  return {r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255)};
}
function hslToHex(h,s,l){ const {r,g,b}=hslToRgb(h,s,l); const h2=v=>('0'+v.toString(16)).slice(-2); return '#'+h2(r)+h2(g)+h2(b); }
function setPreviewFromHSL(){ const h=+hueEl.value, s=+satEl.value, l=+litEl.value; const hex=hslToHex(h,s,l); prevBox.style.background=hex; hexEl.value=hex.replace('#',''); }
function setHSLFromHex(hex){
  const rgb=hexToRgb(hex); if(!rgb) return;
  const hsl=rgbToHsl(rgb.r,rgb.g,rgb.b);
  hueEl.value=Math.round(hsl.h); satEl.value=Math.round(hsl.s); litEl.value=Math.round(hsl.l);
  prevBox.style.background=hex; hexEl.value=hex.replace('#','');
}
function setHex(hex){ if(!hex.startsWith('#')) hex='#'+hex; setHSLFromHex(hex); }

function openPickerFor(i){
  currentBox=i;
  const cur = palette[i] || '#58ff9b';
  setHex(cur);
  colorModal.style.display='flex';
  setJoyInteractive(false);
}
function closePicker(){
  colorModal.style.display='none';
  currentBox=-1;
  setJoyInteractive(true);
}

cancelPick.addEventListener('click', closePicker);
okPick.addEventListener('click', ()=>{
  if(currentBox<0) return;
  let hex = '#'+(hexEl.value||'').padEnd(6,'0');
  if(!hexToRgb(hex)) hex = '#58ff9b';
  palette[currentBox]=hex;
  selected[currentBox]=true;
  boxes[currentBox].style.background=hex;
  boxes[currentBox].classList.add('selected');
  closePicker();
  _notifyChange();
});

SWATCHES.forEach(c=>{ const d=document.createElement('div'); d.className='swatch'; d.style.background=c; d.addEventListener('click',()=>setHex(c)); swatchesEl.appendChild(d); });
hueEl.addEventListener('input', setPreviewFromHSL);
satEl.addEventListener('input', setPreviewFromHSL);
litEl.addEventListener('input', setPreviewFromHSL);
hexEl.addEventListener('input', ()=>{ const v=hexEl.value.replace(/[^0-9a-fA-F]/g,''); hexEl.value=v.slice(0,6); if(v.length===6) setHex('#'+v); });

boxes.forEach((box,i)=>{
  box.addEventListener('click', ()=>openPickerFor(i));
  box.addEventListener('dblclick', ()=>{
    selected[i]=!selected[i];
    box.classList.toggle('selected', selected[i]);
    _notifyChange();
  });
});

startLenInput.addEventListener('input', ()=>{ 
  let v = clamp(parseInt(startLenInput.value||'3',10),1,300);
  startLenInput.value = v;
  _notifyChange();
});

let _onChange = null;
let _currentBudget = { saldo: 0, isAdmin: false };

function calcCosts(){
  const len = clamp(parseInt(startLenInput.value||'3',10), 1, 300);
  const colorCount = selected.filter(Boolean).length;
  const cColor = colorCount * PRICE_COLOR;
  const cLen = len * PRICE_LEN;
  return { len, colorCount, cColor, cLen, total: cColor + cLen };
}
function renderCost(){
  const {cColor,cLen,total} = calcCosts();
  costColorEl.textContent = 'Rp ' + cColor.toLocaleString('id-ID');
  costLenEl.textContent = 'Rp ' + cLen.toLocaleString('id-ID');
  costTotalEl.textContent = 'Rp ' + total.toLocaleString('id-ID');
}
function updateStartEnabled(){
  const {colorCount,total} = calcCosts();
  const saldoCheck = _currentBudget.isAdmin ? Number.MAX_SAFE_INTEGER : _currentBudget.saldo;
  const can = colorCount>0 && total <= saldoCheck;
  startBtn.disabled = !can;
}
function _notifyChange(){
  renderCost();
  updateStartEnabled();
  if (typeof _onChange === 'function') _onChange(calcCosts());
}

export function initPicker({ onChange }={}){
  _onChange = onChange || null;
  renderCost();
  updateStartEnabled();
}
export function setBudget(saldo, isAdmin){
  _currentBudget = { saldo, isAdmin: !!isAdmin };
  updateStartEnabled();
}
export function getSelectedColors(){
  return boxes.map((_, idx)=> selected[idx] ? (palette[idx] || '#ffffff') : null).filter(Boolean);
}
export function getStartLen(){
  return clamp(parseInt(startLenInput.value||'3',10), 1, 300);
}
export function bindStart(handler){
  startBtn.addEventListener('click', ()=>{
    const costs = calcCosts();
    if (typeof handler === 'function') handler({
      ...costs,
      colors: getSelectedColors()
    });
  });
}
// tampilkan panel saat awal (controller yg sembunyikan setelah start)
export function openConfig(){ configPanel.style.display='flex'; setJoyInteractive(false); }
export function closeConfig(){ configPanel.style.display='none'; setJoyInteractive(true); }

// render awal
renderCost();
