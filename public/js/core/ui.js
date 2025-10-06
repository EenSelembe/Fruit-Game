// public/js/core/ui.js
import { State } from './state.js';

function ensureRestartButton() {
  // Cari #restart atau #reset; kalau tidak ada, buat #restart
  let btn = document.getElementById('restart') || document.getElementById('reset');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'restart';
    btn.textContent = 'Restart';
    document.body.appendChild(btn);
  }
  // Gaya center overlay (langsung dari JS agar tidak perlu edit CSS)
  Object.assign(btn.style, {
    position: 'fixed',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: '9999',
    display: 'none',
    padding: '14px 28px',
    fontSize: '20px',
    borderRadius: '12px',
    border: '0',
    cursor: 'pointer',
    background: '#1fffb0',
    color: '#071a12',
    fontWeight: '700',
    boxShadow: '0 8px 24px rgba(0,0,0,.25)',
    letterSpacing: '0.4px',
  });
  State.ui.resetBtnEl = btn;
  return btn;
}

export function grabUIRefs() {
  const ui = State.ui;
  ui.elLen      = document.getElementById('len')       || ui.elLen;
  ui.elUsers    = document.getElementById('userCount') || ui.elUsers;
  ui.rankRowsEl = document.getElementById('rankRows')  || ui.rankRowsEl;
  ui.toastEl    = document.getElementById('toast')     || ui.toastEl;

  // Pastikan tombol restart tersedia & diposisikan di tengah
  const btn = ensureRestartButton();
  // Jangan pasang handler di sini (Input.bind akan menambahkan handler klik + keyboard)
  return btn;
}

export function setResetVisible(show) {
  const btn = ensureRestartButton();
  btn.style.display = show ? 'block' : 'none';
  State.ui.canReset = !!show;
}

export function showToast(msg, dur = 1200) {
  const t = State.ui.toastEl;
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (t.style.display = 'none'), dur);
}

export function updateHUDCounts() {
  const { elLen, elUsers } = State.ui;
  if (State.player && elLen) elLen.textContent = Math.max(1, Math.floor(State.player.length));
  if (elUsers) elUsers.textContent = State.snakes.filter((s) => s.alive).length;
}

export function updateRankPanel() {
  const el = State.ui.rankRowsEl;
  if (!el) return;
  const top = State.snakes
    .filter((s) => s.alive)
    .sort((a, b) => b.length - a.length)
    .slice(0, 5);

  el.innerHTML = top
    .map(
      (s, i) =>
        `<div class="rrow${s === State.player ? ' me' : ''}">
          <div class="title">${i + 1}. ${s.name || 'USER'}</div>
          <div class="sub">Len ${Math.max(1, Math.floor(s.length))}</div>
        </div>`
    )
    .join('');
    }
