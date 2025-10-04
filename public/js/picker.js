// picker.js — kontrol pemilihan warna & modal color picker

const boxes = [...document.querySelectorAll('.colorBox')];
const colorModal = document.getElementById('colorModal');
const prevBox = document.getElementById('prevBox');
const hueEl = document.getElementById('hue');
const satEl = document.getElementById('sat');
const litEl = document.getElementById('lit');
const hexEl = document.getElementById('hex');
const cancelPick = document.getElementById('cancelPick');
const okPick = document.getElementById('okPick');
const swatchesEl = document.getElementById('swatches');
const joyEl = document.getElementById('joy');

const SWATCHES = [
  '#ff5d73','#ff9f1a','#ffd84d','#58ff9b','#2ed573','#79a7ff',
  '#4c6ef5','#b56eff','#ff4d6d','#e9ff70','#a06cff','#ffe066',
  '#3bdc68','#00d1b2','#00ffff','#ffffff'
];

// Buat swatches
swatchesEl.innerHTML = '';
SWATCHES.forEach(c=>{
  const d = document.createElement('div');
  d.className = 'swatch';
  d.style.background = c;
  d.addEventListener('click',()=>setHex(c));
  swatchesEl.appendChild(d);
});

// Data lokal
let palette = ['#ffffff','#ffffff','#ffffff','#ffffff','#ffffff'];
let selected = [false,false,false,false,false];
let currentBox = -1;

// Fungsi konversi warna
function hexToRgb(hex){
  hex = (hex||'').replace('#','').trim();
  if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
  if(!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const n=parseInt(hex,16);
  return {r:(n>>16)&255, g:(n>>8)&255, b:n&255};
}
function rgbToHsl(r,g,b){
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h,s,l=(max+min)/2;
  if(max===min){h=s=0;}
  else{
    const d=max-min;
    s=l>0.5 ? d/(2-max-min):d/(max+min);
    switch(max){
      case r: h=(g-b)/d+(g<b?6:0); break;
      case g: h=(b-r)/d+2; break;
      case b: h=(r-g)/d+4; break;
    }
    h*=60;
  }
  return {h,s:s*100,l:l*100};
}
function hslToRgb(h,s,l){
  h/=360; s/=100; l/=100;
  const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;
    if(t<1/6)return p+(q-p)*6*t;
    if(t<1/2)return q;
    if(t<2/3)return p+(q-p)*(2/3-t)*6;
    return p;
  };
  let r,g,b;
  if(s===0){r=g=b=l;}
  else{
    const q=l<0.5?l*(1+s):l+s-l*s;
    const p=2*l-q;
    r=hue2rgb(p,q,h+1/3);
    g=hue2rgb(p,q,h);
    b=hue2rgb(p,q,h-1/3);
  }
  return {r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255)};
}
function hslToHex(h,s,l){
  const {r,g,b}=hslToRgb(h,s,l);
  const toHex=v=>('0'+v.toString(16)).slice(-2);
  return '#'+toHex(r)+toHex(g)+toHex(b);
}

// Preview warna
function setPreviewFromHSL(){
  const h=+hueEl.value, s=+satEl.value, l=+litEl.value;
  const hex=hslToHex(h,s,l);
  prevBox.style.background=hex;
  hexEl.value=hex.replace('#','');
}
function setHSLFromHex(hex){
  const rgb=hexToRgb(hex); if(!rgb) return;
  const hsl=rgbToHsl(rgb.r,rgb.g,rgb.b);
  hueEl.value=Math.round(hsl.h);
  satEl.value=Math.round(hsl.s);
  litEl.value=Math.round(hsl.l);
  prevBox.style.background=hex;
  hexEl.value=hex.replace('#','');
}
function setHex(hex){
  if(!hex.startsWith('#')) hex='#'+hex;
  setHSLFromHex(hex);
}

// Buka modal untuk box tertentu
function openPickerFor(i){
  currentBox=i;
  const cur=palette[i]||'#58ff9b';
  setHex(cur);
  colorModal.style.display='flex';
  joyEl.style.pointerEvents='none';
}
function closePicker(){
  colorModal.style.display='none';
  joyEl.style.pointerEvents='auto';
  currentBox=-1;
}

// Event pada modal
cancelPick.addEventListener('click',closePicker);
okPick.addEventListener('click',()=>{
  if(currentBox<0) return;
  let hex='#'+(hexEl.value||'').padEnd(6,'0');
  if(!hexToRgb(hex)) hex='#58ff9b';
  palette[currentBox]=hex;
  selected[currentBox]=true;
  boxes[currentBox].style.background=hex;
  boxes[currentBox].classList.add('selected');
  closePicker();

  // kabari modul lain
  window.dispatchEvent(new CustomEvent('color:update',{
    detail:{palette,selected}
  }));
});

// Slider perubahan warna
hueEl.addEventListener('input',setPreviewFromHSL);
satEl.addEventListener('input',setPreviewFromHSL);
litEl.addEventListener('input',setPreviewFromHSL);
hexEl.addEventListener('input',()=>{
  const v=hexEl.value.replace(/[^0-9a-fA-F]/g,'');
  hexEl.value=v.slice(0,6);
  if(v.length===6) setHex('#'+v);
});

// Klik pada kotak warna
boxes.forEach((box,i)=>{
  box.addEventListener('click',()=>openPickerFor(i));
  box.addEventListener('dblclick',()=>{
    selected[i]=!selected[i];
    box.classList.toggle('selected',selected[i]);
    window.dispatchEvent(new CustomEvent('color:update',{
      detail:{palette,selected}
    }));
  });
});

// expose ke global
window.ColorPicker = { palette, selected, refresh:()=>{} };
