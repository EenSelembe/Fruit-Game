// /public/js/firebase-boot.js
// Inisialisasi Firebase + sinkron profil & saldo (realtime)
// -> Menyediakan window.Firebase, window.App (profil + style), event: 'user:profile', 'user:saldo'

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

// Expose dasar
window.Firebase = {
  app, auth, db,
  doc, getDoc, onSnapshot, updateDoc, increment,
  setDoc, collection, serverTimestamp, deleteDoc,
  onAuthStateChanged, signOut
};
window.App = window.App || {};
window.App.ADMIN_UID = ADMIN_UID;
window.App.profile = null;           // dokumen users/<uid>
window.App.profileStyle = null;      // subset untuk UI/canvas
window.App.userRef = null;
window.App.isAdmin = false;
window.App.uid = null;

/* ====== UTIL ====== */
function formatRp(n){ n = Math.max(0, Math.floor(Number(n)||0)); return n.toLocaleString("id-ID"); }
function buildDomNicknameStyle(u){
  let bg = u.bgColor || 'transparent';
  let extraAnim = '';
  if (u.bgGradient) { bg = u.bgGradient; extraAnim = 'background-size:600% 600%; animation: neonAnim 8s ease infinite;'; }
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
  return `color:${color}; background:${bg}; ${extraAnim} border:${border}; border-radius:6px; padding:2px 6px; ${extraBorder}`;
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

  window.App.uid = user.uid;
  window.App.isAdmin = (user.uid === ADMIN_UID);
  const userRef = doc(db, "users", user.uid);
  window.App.userRef = userRef;

  onSnapshot(userRef, (snap)=>{
    if(!snap.exists()) return;
    const data = snap.data() || {};
    window.App.profile = { id:user.uid, ...data };

    window.App.profileStyle = {
      name: data.name || data.username || "Anonim",
      color: data.color || "#fff",
      bgColor: data.bgColor || null,
      bgGradient: data.bgGradient || null,
      borderColor: data.borderColor || "#000",
      borderGradient: data.borderGradient || null
    };

    updateHeaderNickname(data);

    window.dispatchEvent(new CustomEvent("user:profile", { detail: window.App.profileStyle }));

    let saldo = Number(data.saldo || 0);
    if (window.App.isAdmin) saldo = Number.POSITIVE_INFINITY; // ∞
    const elSaldo = document.getElementById("saldo");
    const elSaldo2 = document.getElementById("saldoInModal");
    if (elSaldo)  elSaldo.textContent  = (saldo === Number.POSITIVE_INFINITY) ? "∞" : ("Rp " + formatRp(saldo));
    if (elSaldo2) elSaldo2.textContent = (saldo === Number.POSITIVE_INFINITY) ? "∞" : ("Rp " + formatRp(saldo));

    window.dispatchEvent(new CustomEvent("user:saldo", { detail: { saldo, isAdmin: window.App.isAdmin } }));
  });
});

/* ====== OPTIONAL: helper charge ====== */
if (!window.Saldo) window.Saldo = {};
if (!window.Saldo.charge) {
  window.Saldo.charge = async function(amount){
    if(!window.App?.userRef) return;
    if(window.App.isAdmin) return; // admin tidak dipotong
    amount = Math.max(0, Math.floor(Number(amount)||0));
    const curr = Number(window.App?.profile?.saldo || 0);
    const newSaldo = Math.max(0, curr - amount);
    try{
      await updateDoc(window.App.userRef, {
        saldo: newSaldo,
        consumedSaldo: increment(amount)
      });
    }catch(e){ /* diamkan */ }
  };
             }
