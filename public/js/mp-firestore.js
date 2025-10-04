// /public/js/mp-firestore.js
// Multiplayer ringan berbasis Firestore
// Room tunggal: "default"

import { Game } from "./game-core.js";

const roomId = "default";
const FRESH_MS = 1500;   // kalau update lebih lama dari ini => dianggap offline
const TICK_MS  = 120;    // ~8 Hz publish

let db, collection, doc, setDoc, updateDoc, onSnapshot, serverTimestamp, deleteDoc, getDoc;
let uid = null, isAdmin = false, userName = "USER", colorsAtStart = ['#58ff9b'], startLenVal = 3;

let publishTimer = null, unsubSnakes = null, myDocRef = null;

/* ===== Helper ambil Firebase API dari window.Firebase ===== */
function bootRefs(){
  const F = window.Firebase || {};
  db = F.db; collection = F.collection; doc = F.doc; setDoc = F.setDoc;
  updateDoc = F.updateDoc; onSnapshot = F.onSnapshot; serverTimestamp = F.serverTimestamp;
  deleteDoc = F.deleteDoc; getDoc = F.getDoc;
}

/* ===== Pool nama bot dari koleksi users (opsional) ===== */
async function loadNamePool(){
  try{
    const F = window.Firebase;
    const usersCol = collection(db, "users");
    // Firestore v9+ tidak ada getDocs di export awal; ambil via fetch REST ringan:
    // Untuk simple: skip REST. Kita pakai snapshot realtime lalu sekali isi pool.
    const stop = onSnapshot(usersCol, (snap)=>{
      const names = [];
      snap.forEach(d=>{
        const u = d.data()||{};
        const nm = u.name || u.username;
        if (nm) names.push(String(nm));
      });
      if (names.length) Game.setBotNamePool(names.slice(0, 64));
      stop(); // one-shot
    });
  }catch(e){ /* optional */ }
}

/* ===== Start MP ===== */
async function start(colors, startLen){
  bootRefs();
  uid = window.App?.uid;
  if (!uid) return; // belum login

  isAdmin = !!window.App?.isAdmin;
  userName = (window.App?.profileStyle?.name) || "USER";
  colorsAtStart = (colors && colors.length) ? colors.slice() : ['#58ff9b'];
  startLenVal = startLen || 3;

  await loadNamePool();

  myDocRef = doc(db, `rooms/${roomId}/snakes/${uid}`);
  await setDoc(myDocRef, {
    uid, name: userName, admin: isAdmin, colors: (isAdmin ? [] : colorsAtStart),
    len: startLenVal, alive: true, online: true,
    x: 0, y: 0, dir: 0, v: 0,
    ts: serverTimestamp()
  }, { merge: true });

  // subscribe semua snake di room
  const snakesCol = collection(db, `rooms/${roomId}/snakes`);
  unsubSnakes = onSnapshot(snakesCol, (snap)=>{
    const now = Date.now();
    snap.docChanges().forEach(ch=>{
      const d = ch.doc.data() || {};
      const id = ch.doc.id;

      if (id === uid) return; // diri sendiri

      if (ch.type === 'removed') {
        Game.remoteGone(id);
        return;
      }

      const t = d.ts && typeof d.ts.toMillis === 'function' ? d.ts.toMillis() : (Date.parse(d.ts) || 0);
      const fresh = d.online && (now - t < FRESH_MS);

      Game.ensureRemote(id, {
        x: d.x, y: d.y, dir: d.dir,
        len: d.len, colors: d.colors, name: d.name, admin: !!d.admin
      });
      Game.setRemoteOnline(id, !!fresh);
    });
  });

  // publish loop
  clearInterval(publishTimer);
  publishTimer = setInterval(async ()=>{
    const p = Game.getPlayerSnapshot();
    if (!p) return;
    try{
      await updateDoc(myDocRef, {
        x: p.x, y: p.y, dir: p.dir, v: p.v, len: p.length, alive: p.alive,
        online: true, ts: serverTimestamp()
      });
    }catch(e){ /* abaikan throttle sementara */ }
  }, TICK_MS);

  // presence on unload
  const goodbye = async ()=>{
    try{ await updateDoc(myDocRef, { online: false, ts: serverTimestamp() }); }catch(_){}
    clearInterval(publishTimer); publishTimer=null;
    unsubSnakes && unsubSnakes(); unsubSnakes=null;
  };
  window.addEventListener('beforeunload', goodbye, { once:true });
}

/* ===== Stop MP (opsional) ===== */
async function stop(){
  try{
    if (myDocRef) await updateDoc(myDocRef, { online:false, ts: serverTimestamp() });
  }catch(_){}
  clearInterval(publishTimer); publishTimer = null;
  unsubSnakes && unsubSnakes(); unsubSnakes = null;
}

window.MP = { start, stop };
export { start, stop };
