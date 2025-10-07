// /public/js/saldo-global.js
// Satu sumber saldo realtime untuk SEMUA game (Slot, Greedy, Puzzle, Snack.io, dst).
// - Listen Firestore sekali → broadcast ke semua halaman via event 'saldo:update'
// - Deduct saldo pakai increment() agar aman multi-tab
// - Kompatibel mundur: juga kirim 'user:saldo' (biar code lama tetap jalan)

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { doc, onSnapshot, updateDoc, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const ADMIN_UID = "AxB4G2xwhiXdJnyDrzn82Xanc4x2";

// State internal
let _userRef = null;
let _saldo = 0;
let _isAdmin = false;

// Optional: auto-apply ke UI standar kalau elemen ada
const elSaldo = document.getElementById("saldo");
const elSaldoModal = document.getElementById("saldoInModal");
const elUsername = document.getElementById("usernameSpan");

function formatRp(n){ return n === Infinity ? "∞" : ("Rp " + Math.max(0, Math.floor(Number(n)||0)).toLocaleString("id-ID")); }
function applyUI(name, color, borderColor){
  if (elUsername) {
    elUsername.textContent = name || "Anonim";
    elUsername.style.color = color || "#fff";
    elUsername.style.border = `1px solid ${borderColor || "#000"}`;
  }
  const v = _isAdmin ? Infinity : _saldo;
  if (elSaldo) elSaldo.textContent = formatRp(v);
  if (elSaldoModal) elSaldoModal.textContent = formatRp(v);
}

// Init sekali, dipanggil otomatis di bawah
export function initGlobalSaldo(onUpdate){
  const auth = window.Firebase?.auth;
  const db   = window.Firebase?.db;
  if (!auth || !db) {
    console.warn("[GlobalSaldo] Firebase belum siap, coba lagi...");
    // retry ringan
    setTimeout(()=>initGlobalSaldo(onUpdate), 100);
    return;
  }

  onAuthStateChanged(auth, (user)=>{
    if (!user) return; // halaman login akan handle redirect

    _userRef  = doc(db, "users", user.uid);
    _isAdmin  = (user.uid === ADMIN_UID);

    onSnapshot(_userRef, (snap)=>{
      if (!snap.exists()) return;
      const d = snap.data() || {};
      _saldo = _isAdmin ? Infinity : Number(d.saldo||0);

      // update UI standar (opsional)
      applyUI(d.name, d.color, d.borderColor);

      // callback lokal (kalau ada)
      if (typeof onUpdate === "function") onUpdate(_saldo, _isAdmin);

      // broadcast modern
      window.dispatchEvent(new CustomEvent("saldo:update", { detail: { saldo:_saldo, isAdmin:_isAdmin }}));
      // broadcast kompatibilitas lama
      window.dispatchEvent(new CustomEvent("user:saldo",  { detail: { saldo:_saldo, isAdmin:_isAdmin }}));
      window.dispatchEvent(new CustomEvent("user:profile",{ detail: d }));
    });
  });
}

// Potong saldo aman (increment)
export async function chargeGlobal(amount){
  amount = Math.max(0, Math.floor(Number(amount)||0));
  if (!_userRef || _isAdmin || amount <= 0) return _saldo;
  try{
    await updateDoc(_userRef, {
      saldo: increment(-amount),
      consumedSaldo: increment(amount),
      lastUpdate: serverTimestamp()
    });
  }catch(e){
    console.error("[GlobalSaldo] charge gagal:", e);
  }
  return _saldo;
}

// API global di window
if (!window.GlobalSaldo) window.GlobalSaldo = {};
window.GlobalSaldo.init    = initGlobalSaldo;
window.GlobalSaldo.charge  = chargeGlobal;
window.GlobalSaldo.get     = () => _saldo;
window.GlobalSaldo.isAdmin = () => _isAdmin;

// Auto init (agar cukup <script type="module" src="./js/saldo-global.js">)
initGlobalSaldo();
