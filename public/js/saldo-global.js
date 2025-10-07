// /public/js/firebase-boot.js — versi debug HP (alert realtime saldo)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, onSnapshot, updateDoc, increment,
  setDoc, collection, serverTimestamp, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* ===== CONFIG ===== */
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

/* ===== INIT ===== */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

window.Firebase = { app, auth, db, doc, getDoc, onSnapshot, updateDoc, increment, setDoc, collection, serverTimestamp, deleteDoc, onAuthStateChanged, signOut };
window.App = { ADMIN_UID, profile:null, profileStyle:null, userRef:null, isAdmin:false, uid:null };

/* ===== UTIL ===== */
function formatRp(n){ if(n===Infinity)return"∞"; n=Math.max(0,Math.floor(Number(n)||0)); return"Rp "+n.toLocaleString("id-ID"); }
function updateHeaderNickname(u){
  const el=document.getElementById("usernameSpan");
  if(!el)return;
  el.textContent=u.name||"Anonim";
  el.style.color=u.color||"#fff";
  el.style.border=`1px solid ${u.borderColor||"#000"}`;
}
function logMsg(msg){
  console.log(msg);
  if (location.search.includes("debug=1")) alert(msg);
}

/* ===== AUTH FLOW ===== */
logMsg("[firebase-boot] mulai auth...");
onAuthStateChanged(auth, async(user)=>{
  if(!user){
    logMsg("[firebase-boot] belum login → redirect ke index.html");
    location.href="index.html";
    return;
  }

  logMsg("[firebase-boot] login sebagai: " + user.uid);
  window.App.uid=user.uid;
  window.App.isAdmin=(user.uid===ADMIN_UID);
  const ref=doc(db,"users",user.uid);
  window.App.userRef=ref;

  // pastikan dokumen ada
  const snap=await getDoc(ref);
  if(!snap.exists()){
    logMsg("[firebase-boot] membuat dokumen user baru...");
    await setDoc(ref,{name:user.displayName||"Anonim",saldo:0,createdAt:serverTimestamp()},{merge:true});
  }

  // realtime listener
  logMsg("[firebase-boot] mulai dengarkan saldo realtime...");
  onSnapshot(ref,(snap)=>{
    if(!snap.exists())return;
    const d=snap.data();
    window.App.profile={id:user.uid,...d};
    const style={name:d.name||"Anonim",color:d.color||"#fff",borderColor:d.borderColor||"#000"};
    window.App.profileStyle=style;
    updateHeaderNickname(style);

    let s=Number(d.saldo||0);
    if(window.App.isAdmin)s=Infinity;

    const el1=document.getElementById("saldo");
    const el2=document.getElementById("saldoInModal");
    if(el1)el1.textContent=formatRp(s);
    if(el2)el2.textContent=formatRp(s);

    logMsg("[firebase-boot] saldo update → " + s);

    // kirim ke listener global
    window.dispatchEvent(new CustomEvent("user:profile",{detail:style}));
    window.dispatchEvent(new CustomEvent("user:saldo",{detail:{saldo:s,isAdmin:window.App.isAdmin}}));
  });
});

/* ===== SALDO API ===== */
if(!window.Saldo)window.Saldo={};
window.Saldo.charge=async function(amount){
  if(!window.App?.userRef)return;
  if(window.App.isAdmin)return;
  amount=Math.max(0,Math.floor(Number(amount)||0));
  if(amount<=0)return;
  logMsg("[firebase-boot] charge saldo -" + amount);
  try{
    await updateDoc(window.App.userRef,{
      saldo:increment(-amount),
      consumedSaldo:increment(amount),
      lastUpdate:serverTimestamp()
    });
    logMsg("[firebase-boot] charge OK updateDoc");
  }catch(e){
    logMsg("[firebase-boot] charge fallback setDoc: " + e.message);
    await setDoc(window.App.userRef,{
      saldo:increment(-amount),
      consumedSaldo:increment(amount),
      lastUpdate:serverTimestamp()
    },{merge:true});
  }
};
