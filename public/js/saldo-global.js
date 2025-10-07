// /public/js/saldo-global.js
// Layer pusat untuk sinkron saldo antar-halaman/game.
// - Dengar 'user:saldo' dari firebase-boot.js
// - Ekspor onSaldo(cb), chargeGlobal(amount), getSaldo(), isAdmin()

const ADMIN_UID = "AxB4G2xwhiXdJnyDrzn82Xanc4x2";

let _saldo = 0;
let _isAdmin = false;
let _ready = false;

function dispatch() {
  window.dispatchEvent(new CustomEvent("saldo:update", {
    detail: { saldo: _saldo, isAdmin: _isAdmin }
  }));
}

// Ambil update dari firebase-boot.js (yang sudah onSnapshot)
window.addEventListener("user:saldo", (e) => {
  _saldo   = Number(e.detail?.saldo ?? 0);
  _isAdmin = !!e.detail?.isAdmin;
  _ready = true;
  dispatch();
});

// Fallback jika halaman tertentu tidak load firebase-boot.js (jarang, tapi aman)
(async function ensureAuthWatch(){
  try {
    if (window.Firebase?.onAuthStateChanged && !_ready) {
      window.Firebase.onAuthStateChanged(window.Firebase.auth, (user) => {
        if (!user) return;
        _isAdmin = (user.uid === ADMIN_UID);
        // saldo realtime tetap dipush oleh firebase-boot.js → user:saldo
      });
    }
  } catch {}
})();

// ===== API =====
export function onSaldo(cb){
  if (typeof cb === "function") {
    // panggil jika sudah siap
    if (_ready) cb(_saldo, _isAdmin);
    // dengarkan update
    window.addEventListener("saldo:update", (e)=>{
      cb(e.detail.saldo, e.detail.isAdmin);
    });
  }
}

export async function chargeGlobal(amount){
  amount = Math.max(0, Math.floor(Number(amount)||0));
  if (_isAdmin || amount <= 0) return _saldo;

  // Optimistic UI
  _saldo = Math.max(0, _saldo - amount);
  dispatch();

  // Tulis ke Firestore via helper dari firebase-boot.js (window.Saldo.charge)
  if (window.Saldo?.charge) {
    try {
      const newVal = await window.Saldo.charge(amount);
      // beberapa versi helper tidak return; biarkan snapshot menstabilkan
      if (typeof newVal === "number") {
        _saldo = newVal;
        dispatch();
      }
    } catch (e) {
      // fallback: biarkan snapshot memperbaiki bila gagal
      console.warn("[saldo-global] charge gagal, menunggu snapshot:", e);
    }
  } else if (window.Firebase?.updateDoc && window.App?.userRef) {
    // Fallback langsung ke Firestore bila helper tidak ada (harusnya jarang)
    try {
      const { updateDoc, increment, serverTimestamp } = window.Firebase;
      await updateDoc(window.App.userRef, {
        saldo: window.Firebase.increment(-amount),
        consumedSaldo: window.Firebase.increment(amount),
        lastUpdate: serverTimestamp()
      });
    } catch (e) {
      console.warn("[saldo-global] fallback updateDoc gagal:", e);
    }
  }

  return _saldo;
}

export function getSaldo(){ return _saldo; }
export function isAdmin(){ return _isAdmin; }

// Expose opsional ke window (debug)
if (typeof window !== "undefined") {
  window.SaldoGlobal = { onSaldo, chargeGlobal, getSaldo, isAdmin };
}
