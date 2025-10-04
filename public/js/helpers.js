export const PRICE_COLOR = 10000;
export const PRICE_LEN = 5000;

export const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
export const rand=(a,b)=>Math.random()*(b-a)+a;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const angNorm=a=>((a+Math.PI*3)%(Math.PI*2))-Math.PI;

export function formatRupiah(n){
  n = Math.max(0, Math.floor(n||0));
  return 'Rp ' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function showToast(msg, t=1500){
  const toast = document.getElementById('toast');
  if(!toast) return;
  toast.textContent = msg;
  toast.style.display='block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> toast.style.display='none', t);
}
