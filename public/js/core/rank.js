// public/js/core/rank.js
import { State } from './state.js';

export function updateRankPanel() {
  const el = State.ui.rankRowsEl;
  if (!el) return;
  const top = State.snakes.filter(s=>s.alive).sort((a,b)=> b.length - a.length).slice(0,5);
  el.innerHTML = top.map((s,i)=>
    `<div class="rrow${s===State.player?' me':''}">
       <div class="title">${i+1}. ${s.name || 'USER'}</div>
       <div class="sub">Len ${s.length}</div>
     </div>`
  ).join('');
}
