// public/js/core/ui.js
import { State } from './state.js';

export function grabUIRefs() {
  const ui = State.ui;
  ui.elLen      = document.getElementById('len')       || ui.elLen;
  ui.elUsers    = document.getElementById('userCount') || ui.elUsers;
  ui.rankRowsEl = document.getElementById('rankRows')  || ui.rankRowsEl;
  // dukung id 'reset' atau 'restart'
  ui.resetBtnEl = document.getElementById('reset') || document.getElementById('restart') || ui.resetBtnEl;
  ui.toastEl    = document.getElementById('toast')     || ui.toastEl;
}

export function setResetVisible(show) {
  grabUIRefs();
  const btn = State.ui.resetBtnEl;
  if (btn) btn.style.display = show ? 'inline-block' : 'none';
  State.ui.canReset = !!show;
}

export function showToast(msg, dur=1200) {
  grabUIRefs();
  const t = State.ui.toastEl;
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> t.style.display='none', dur);
}

export function updateHUDCounts() {
  const { elLen, elUsers } = State.ui;
  if (State.player && elLen)   elLen.textContent = Math.max(1, Math.floor(State.player.length));
  if (elUsers) elUsers.textContent = State.snakes.filter(s=>s.alive).length;
      }
