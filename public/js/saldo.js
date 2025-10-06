// /public/js/saldo.js — versi fix total (realtime + increment)
import { 
  getAuth, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { 
  getFirestore, doc, onSnapshot, updateDoc, increment, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const ADMIN_UID = "AxB4G2xwhiXdJnyDrzn82Xanc4x2";

const app = window.Firebase?.app || null;
const auth = window.Firebase?.auth || getAuth(app);
const db = window.Firebase?.db || getFirestore(app);

let userRef = null;
let isAdmin = false;
let saldo = 0;

const elSaldo = document.getElementById("saldo");
const elSaldoModal = document.getElementById("saldoInModal");
const elUsername = document.getElementById("usernameSpan");

function formatRp(n) {
  if (n === Infinity) return "∞";
  return "Rp " + Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("id-ID");
}

function applyUI(name, color, borderColor) {
  if (elUsername) {
    elUsername.textContent = name || "Anonim";
    elUsername.style.color = color || "#fff";
    elUsername.style.border = `1px solid ${borderColor || "#000"}`;
  }

  const s = isAdmin ? Infinity : saldo;
  if (elSaldo) elSaldo.textContent = formatRp(s);
  if (elSaldoModal) elSaldoModal.textContent = formatRp(s);
}

/* ====== MAIN INIT ====== */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    location.href = "index.html";
    return;
  }

  isAdmin = user.uid === ADMIN_UID;
  userRef = doc(db, "users", user.uid);

  // realtime sync saldo + nama
  onSnapshot(userRef, (snap) => {
    if (!snap.exists()) return;
    const d = snap.data() || {};
    saldo = Number(d.saldo || 0);
    applyUI(d.name, d.color, d.borderColor);

    // broadcast ke semua modul
    window.dispatchEvent(new CustomEvent("user:saldo", { detail: { saldo, isAdmin } }));
    window.dispatchEvent(new CustomEvent("user:profile", { detail: d }));
  });
});

/* ====== PUBLIC API ====== */
if (!window.Saldo) window.Saldo = {};

/**
 * Potong saldo secara aman (otomatis realtime di Firestore)
 * @param {number} amount jumlah saldo yang dipotong
 */
window.Saldo.charge = async function(amount) {
  if (!userRef || isAdmin) return;

  amount = Math.max(0, Math.floor(Number(amount) || 0));
  if (amount <= 0) return;

  try {
    await updateDoc(userRef, {
      saldo: increment(-amount),
      consumedSaldo: increment(amount),
      lastUpdate: serverTimestamp()
    });
  } catch (e) {
    console.warn("Gagal update saldo:", e);
  }
};

/**
 * Dapatkan saldo terkini (cache lokal)
 */
window.Saldo.get = () => saldo;

/**
 * Cek apakah user admin
 */
window.Saldo.isAdmin = () => isAdmin;
