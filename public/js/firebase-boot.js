// /public/js/firebase-boot.js
// Inisialisasi Firebase + sinkron profil & saldo (realtime, aman meski doc belum ada)
// Menyediakan:
//   window.Firebase { app, auth, db, doc, getDoc, onSnapshot, updateDoc, increment, setDoc, collection, serverTimestamp, deleteDoc, onAuthStateChanged, signOut }
//   window.App { ADMIN_UID, profile, profileStyle, userRef, isAdmin, uid }
// Event yang dipublish:
//   'user:profile' -> detail: style untuk UI/canvas
//   'user:saldo'   -> detail: { saldo, isAdmin }

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, onSnapshot, updateDoc, increment,
  setDoc, collection, serverTimestamp, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* ====== CONFIG ====== */
const firebaseConfig = {
  apiKey: "AIzaSyB8g9X_En_sJnbdT_Rc1NK88dUdbg3y2nE",
  authDomain: "fruit-game-5e4a8.firebaseapp.com",
  projectId: "fruit-game-5e4a8",
  storageBucket: "fruit-game-5e4a8.appspot.com",
  messagingSenderId: "936228678997",
  appId: "1:936228678997:web:9dab2fa0d9a019161bd3dc",
  measurementId: "G-EPTSQQPM4D"
};
const ADMIN_UID = "AxB4G2xwhiXdJnyDrzn82Xanc4x2";

/* ====== INIT ====== */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Expose dasar untuk modul lain
window.Firebase = {
  app, auth, db,
  doc, getDoc, onSnapshot, updateDoc, increment,
  setDoc, collection, serverTimestamp, deleteDoc,
  onAuthStateChanged, signOut
};
window.App = window.App || {};
window.App.ADMIN_UID = ADMIN_UID;
window.App.profile = null;           // isi dokumen users/<uid>
window.App.profileStyle = null;      // subset untuk UI/canvas
window.App.userRef = null;
window.App.isAdmin = false;
window.App.uid = null;

/* ====== UTIL ====== */
function formatRp(n){
  if (n === Infinity) return "∞";
  n = Math.max(0, Math.floor(Number(n)||0));
  return "Rp " + n.toLocaleString("id-ID");
}
function buildDomNicknameStyle(u){
  // Background (solid/gradient)
  let bg = u.bgGradient ? u.bgGradient : (u.bgColor || 'transparent');
  const anim = u.bgGradient ? 'background-size:600% 600%; animation: neonAnim 8s ease infinite;' : '';

  // Border (solid/gradient)
  let border = `1px solid ${u.borderColor || '#000'}`;
  let extraBorder = '';
  if (u.borderGradient) {
    const baseBg = u.bgColor || 'transparent';
    border = '3px solid transparent';
    extraBorder =
      `background-image: linear-gradient(${baseBg}, ${baseBg}), ${u.borderGradient};
       background-origin: border-box; background-clip: padding-box, border-box;`;
  }

  const color = u.color || '#fff';
  return `color:${color}; background:${bg}; ${anim} border:${border}; border-radius:6px; padding:2px 6px; ${extraBorder}`;
}
function updateHeaderNickname(u){
  const el = document.getElementById("usernameSpan");
  if(!el) return;
  el.setAttribute("style", buildDomNicknameStyle(u));
  el.textContent = u.name || u.username || "Anonim";
}

/* ====== AUTH FLOW ====== */
onAuthStateChanged(auth, async (user)=>{
  if(!user){
    try { window.location.href = "index.html"; } catch(_) {}
    return;
  }

  // Set identitas global
  window.App.uid = user.uid;
  window.App.isAdmin = (user.uid === ADMIN_UID);
  const userRef = doc(db, "users", user.uid);
  window.App.userRef = userRef;

  // Pastikan dokumen user ADA (penting agar update realtime tidak gagal)
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        name: user.displayName || "Anonim",
        saldo: 0,
        createdAt: serverTimestamp()
      }, { merge: true });
    }
  } catch (e) {
    console.warn("[firebase-boot] gagal memastikan dokumen user:", e);
  }

  // Listener realtime profil + saldo
  onSnapshot(userRef, (snap)=>{
    if(!snap.exists()) return;
    const data = snap.data() || {};
    window.App.profile = { id:user.uid, ...data };

    const style = {
      name: data.name || data.username || "Anonim",
      color: data.color || "#fff",
      bgColor: data.bgColor || null,
      bgGradient: data.bgGradient || null,
      borderColor: data.borderColor || "#000",
      borderGradient: data.borderGradient || null
    };
    window.App.profileStyle = style;

    updateHeaderNickname(data);

    // UI Saldo
    let saldoVal = Number(data.saldo || 0);
    if (window.App.isAdmin) saldoVal = Infinity; // admin ∞ di sisi tampilan
    const elSaldo  = document.getElementById("saldo");
    const elSaldo2 = document.getElementById("saldoInModal");
    if (elSaldo)  elSaldo.textContent  = formatRp(saldoVal);
    if (elSaldo2) elSaldo2.textContent = formatRp(saldoVal);

    // Broadcast ke game/UI lain
    window.dispatchEvent(new CustomEvent("user:profile", { detail: style }));
    window.dispatchEvent(new CustomEvent("user:saldo",   { detail: { saldo: saldoVal, isAdmin: window.App.isAdmin } }));
  }, (err)=>{
    console.error("[firebase-boot] onSnapshot error:", err);
  });
});

/* ====== Saldo API (REALTIME & AMAN) ====== */
// Catatan: gunakan setDoc(..., {merge:true}) + increment() supaya:
// - tetap berhasil walaupun dokumen belum ada (merge membuatnya ada),
// - delta dihitung di server (atomic),
// - memicu snapshot realtime di semua tab/game.
if (!window.Saldo) window.Saldo = {};
window.Saldo.charge = async function(amount){
  if(!window.App?.userRef) return;
  if(window.App.isAdmin) return; // admin tidak dipotong
  amount = Math.max(0, Math.floor(Number(amount)||0));
  if (amount <= 0) return;

  try{
    await setDoc(window.App.userRef, {
      saldo: increment(-amount),
      consumedSaldo: increment(amount),
      lastUpdate: serverTimestamp()
    }, { merge: true });
  }catch(e){
    console.error("[Saldo.charge] gagal:", e);
    throw e; // biar caller (controller.js) bisa tampilkan toast kalau perlu
  }
};
