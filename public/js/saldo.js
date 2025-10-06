// /public/js/saldo.js — versi final fix (realtime + aman untuk semua game)
import { auth, db, onAuthStateChanged, doc, getDoc, updateDoc, setDoc, onSnapshot, increment } from './firebase-boot.js';
import { formatRupiah } from './helpers.js';

const ADMIN_UID = "AxB4G2xwhiXdJnyDrzn82Xanc4x2";

let _saldo = 0;
let _isAdmin = false;
let _userRef = null;

const elSaldo = document.getElementById('saldo');
const elSaldoModal = document.getElementById('saldoInModal');
const usernameSpan = document.getElementById('usernameSpan');

function applySaldoUI() {
  const s = _isAdmin ? "∞" : formatRupiah(_saldo);
  if (elSaldo) elSaldo.textContent = s;
  if (elSaldoModal) elSaldoModal.textContent = s;
}

// ==== Helpers nickname ====
function firstColor(str) {
  const m = String(str||'').match(/(#(?:[0-9a-fA-F]{3,8}))|rgba?\([^)]*\)/);
  return m ? m[0] : '#000';
}
function allColors(str) {
  const re = /(#(?:[0-9a-fA-F]{3,8})|rgba?\([^)]*\))/g;
  const out = []; let m;
  while ((m = re.exec(String(str||'')))) out.push(m[1] || m[0]);
  return out.length ? out : ['#ffffff','#000000'];
}
function angleToRad(str) {
  const s = String(str||'').toLowerCase();
  let deg = 0;
  const m = s.match(/(-?\d+(\.\d+)?)\s*deg/);
  if (m) deg = parseFloat(m[1]);
  else if (/to\s+right/.test(s)) deg = 0;
  else if (/to\s+left/.test(s)) deg = 180;
  else if (/to\s+bottom/.test(s)) deg = 90;
  else if (/to\s+top/.test(s)) deg = 270;
  return deg * Math.PI / 180;
}

function buildNicknameStyle(data) {
  let bg = data.bgColor || 'transparent';
  let extraAnim = '';
  if (data.bgGradient) {
    bg = data.bgGradient;
    extraAnim = 'background-size:600% 600%; animation: neonAnim 8s ease infinite;';
  }

  let border = `1px solid ${data.borderColor || '#000'}`;
  let extraBorder = '';
  if (data.borderGradient) {
    const baseBg = data.bgColor || 'transparent';
    border = '3px solid transparent';
    extraBorder = `
      background-image: linear-gradient(${baseBg}, ${baseBg}), ${data.borderGradient};
      background-origin: border-box;
      background-clip: padding-box, border-box;
    `;
  }

  const color = data.color || '#fff';
  const name  = data.name || data.username || "Anonim";
  const styleString = `color:${color}; background:${bg}; ${extraAnim} border:${border}; ${extraBorder}`;

  const borderColorCanvas = firstColor(data.borderGradient || data.borderColor || '#000');

  return { name, color, styleString, borderColorCanvas };
}

// ==== INIT ====
export function initSaldo({ onSaldoChange, onProfileChange, onNoAuthRedirect }) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      if (typeof onNoAuthRedirect === 'function') onNoAuthRedirect();
      return;
    }

    _isAdmin = (user.uid === ADMIN_UID);
    _userRef = doc(db, "users", user.uid);

    // Baca awal
    const first = await getDoc(_userRef);
    if (first.exists()) {
      const d = first.data();
      _saldo = Number(d.saldo || 0);
      applySaldoUI();
      const nick = buildNicknameStyle(d);
      if (usernameSpan) {
        usernameSpan.setAttribute('style', nick.styleString);
        usernameSpan.textContent = nick.name;
      }
      onProfileChange?.(nick);
      onSaldoChange?.(_saldo, _isAdmin);
    }

    // Realtime listener
    onSnapshot(_userRef, (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      _saldo = Number(d.saldo || 0);
      applySaldoUI();
      const nick = buildNicknameStyle(d);
      if (usernameSpan) {
        usernameSpan.setAttribute('style', nick.styleString);
        usernameSpan.textContent = nick.name;
      }
      onProfileChange?.(nick);
      onSaldoChange?.(_saldo, _isAdmin);
    });
  });
}

// ==== POTONG SALDO ====
export async function charge(amount) {
  amount = Math.max(0, Math.floor(amount || 0));
  if (_isAdmin || !_userRef) return _saldo;
  if (amount <= 0) return _saldo;

  _saldo = Math.max(0, _saldo - amount);
  applySaldoUI();

  try {
    await updateDoc(_userRef, {
      saldo: increment(-amount),
      consumedSaldo: increment(amount),
      lastUpdate: Date.now()
    });
  } catch (e) {
    // fallback
    await setDoc(_userRef, {
      saldo: increment(-amount),
      consumedSaldo: increment(amount),
      lastUpdate: Date.now()
    }, { merge: true });
  }
  return _saldo;
}

export const getSaldo = () => _saldo;
export const isAdmin = () => _isAdmin;
