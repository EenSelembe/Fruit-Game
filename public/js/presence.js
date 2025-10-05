// /public/js/presence.js
import {
  getFirestore, collection, getDocs, onSnapshot, doc, setDoc, updateDoc,
  serverTimestamp, query, where
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

const db   = window.Firebase?.db   || getFirestore();
const auth = window.Firebase?.auth || getAuth();

const UserDir = new Map();     // uid -> { uid, name, style, isAdmin }
const OnlineUids = new Set();  // uid yang online di room yg sama
const ROOM_ID = window.WORLD_ROOM_ID || "world1";
console.info("[ROOM presence]", ROOM_ID);

// ambil semua user utk nama + style bot offline
async function loadUsersOnce(){
  const snap = await getDocs(collection(db, "users"));
  UserDir.clear();
  snap.forEach(d=>{
    const u = d.data() || {};
    UserDir.set(d.id, {
      uid: d.id,
      name: u.name || u.username || "USER",
      isAdmin: d.id === (window.App?.ADMIN_UID),
      style: {
        color: u.color || "#fff",
        bgColor: u.bgColor || null,
        bgGradient: u.bgGradient || null,
        borderColor: u.borderColor || "#000",
        borderGradient: u.borderGradient || null
      }
    });
  });
  window.dispatchEvent(new CustomEvent("users:loaded", { detail: { users: [...UserDir.values()] } }));
}

// subscribe presence per-room
function subPresence(){
  const q = query(collection(db, "presence"), where("room", "==", ROOM_ID));
  onSnapshot(q, snap=>{
    OnlineUids.clear();
    snap.forEach(d=>{
      const v = d.data() || {};
      if (v.online) OnlineUids.add(d.id);
    });
    window.dispatchEvent(new CustomEvent("presence:update", { detail: { online: [...OnlineUids] } }));
  });
}

// heartbeat untuk diri sendiri
async function keepMyPresence(uid){
  const ref = doc(db, "presence", uid);
  await setDoc(ref, { room: ROOM_ID, online: true, ts: serverTimestamp() }, { merge: true });
  const ping = () => updateDoc(ref, { ts: serverTimestamp(), online: !document.hidden });
  document.addEventListener("visibilitychange", ping);
  setInterval(ping, 15000);
  addEventListener("beforeunload", ()=>{ navigator.sendBeacon?.("/", "bye"); });
}

onAuthStateChanged(auth, async (user)=>{
  if(!user) return;
  await loadUsersOnce();
  subPresence();
  keepMyPresence(user.uid);
});

// expose
window.Presence = { UserDir, OnlineUids, ROOM_ID };
