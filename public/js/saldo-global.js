// /public/js/saldo-global.js — universal realtime saldo listener
import {
  getFirestore, doc, onSnapshot, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// ====== CONFIG ======
const ADMIN_UID = "AxB4G2xwhiXdJnyDrzn82Xanc4x2";
const db = getFirestore();
const auth = getAuth();

let userRef = null;
let currentSaldo = 0;
let isAdmin = false;

// format rupiah sederhana
function formatRp(n) {
  if (n === Infinity) return "∞";
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

// update semua elemen saldo di halaman
function updateSaldoUI(saldo) {
  const el1 = document.getElementById("saldo");
  const el2 = document.getElementById("saldoInModal");
  const el3 = document.getElementById("balance");
  const formatted = formatRp(isAdmin ? Infinity : saldo);
  if (el1) el1.textContent = formatted;
  if (el2) el2.textContent = formatted;
  if (el3) el3.textContent = formatted;
}

// listener realtime ke Firestore
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    console.warn("[Saldo Global] Belum login");
    return;
  }

  isAdmin = (user.uid === ADMIN_UID);
  userRef = doc(db, "users", user.uid);

  console.log("[Saldo Global] listener aktif untuk UID:", user.uid);

  onSnapshot(userRef, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    currentSaldo = Number(data.saldo || 0);
    updateSaldoUI(currentSaldo);

    // kirim event ke semua game
    window.dispatchEvent(
      new CustomEvent("user:saldo", {
        detail: { saldo: currentSaldo, isAdmin }
      })
    );
  });
});

// ====== Fungsi global untuk kurangi saldo (game charge) ======
export async function chargeSaldo(amount) {
  if (!userRef || isAdmin) return currentSaldo;
  amount = Math.max(0, Math.floor(amount || 0));
  try {
    await updateDoc(userRef, {
      saldo: increment(-amount),
      consumedSaldo: increment(amount)
    });
  } catch (e) {
    console.warn("chargeSaldo gagal:", e);
  }
  return currentSaldo - amount;
}

// ====== Fungsi global untuk tambah saldo (hadiah / menang) ======
export async function addSaldo(amount) {
  if (!userRef) return currentSaldo;
  amount = Math.max(0, Math.floor(amount || 0));
  try {
    await updateDoc(userRef, { saldo: increment(amount) });
  } catch (e) {
    console.warn("addSaldo gagal:", e);
  }
  return currentSaldo + amount;
}

// expose ke window agar game bisa pakai tanpa import
window.SaldoGlobal = {
  chargeSaldo,
  addSaldo,
  getSaldo: () => currentSaldo,
  isAdmin: () => isAdmin
};
