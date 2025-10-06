// public/js/core/utils.js
export const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
export const lerp  = (a,b,t) => a + (b-a)*t;
export const rand  = (a,b) => Math.random()*(b-a)+a;
export const angNorm = (a)=>((a+Math.PI*3)%(Math.PI*2))-Math.PI;
