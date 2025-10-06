// /public/js/net-sync.js
// Sinkronisasi posisi pemain via Firestore (1 room global: "global")

import {
  collection, doc, onSnapshot, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const NetSync = (() => {
  const ROOM_ID = "global"; // <- semua pemain di 1 peta/room yang sama
  let db, auth, uid = null, myRef = null;
  let unsub = null, timer = null;

  function isAliveDoc(data) {
    const ts = +data?.ts || 0;
    return data?.online !== false && (Date.now() - ts) < 12000; // 12s heartbeat
  }

  function start(colors, startLen){
    if (!window.Firebase?.db || !window.Firebase?.auth) return;
    db = window.Firebase.db;
    auth = window.Firebase.auth;

    const user = auth.currentUser;
    if (!user) return;
    uid = user.uid;
    myRef = doc(db, "rooms", ROOM_ID, "players", uid);

    // publish awal (merge)
    const st0 = window.Game?.getPlayerState?.() || {};
    const name = st0.name || window.App?.profileStyle?.name || "Player";
    const cols = Array.isArray(colors) && colors.length ? colors : (st0.colors || ["#58ff9b"]);
    setDoc(myRef, {
      name,
      colors: cols,
      x: +st0.x || 0, y: +st0.y || 0, dir: +st0.dir || 0,
      length: +startLen || +st0.length || 3,
      online: true, ts: Date.now()
    }, { merge: true });

    // subscribe semua pemain di room
    const colRef = collection(db, "rooms", ROOM_ID, "players");
    unsub = onSnapshot(colRef, (snap)=>{
      snap.docChanges().forEach(ch=>{
        const id = ch.doc.id;
        if (id === uid) return; // skip diri sendiri

        if (ch.type === "removed") {
          // dokumen dihapus → jadikan bot offline (tetap ada di peta)
          window.Game?.netRemove?.(id);
          return;
        }

        const data = ch.doc.data() || {};
        if (isAliveDoc(data)) {
          window.Game?.netUpsert?.(id, {
            name: data.name || "Player",
            colors: Array.isArray(data.colors) && data.colors.length ? data.colors : ["#79a7ff"],
            x: +data.x || 0, y: +data.y || 0, dir: +data.dir || 0,
            length: +data.length || 3
          });
        } else {
          // tidak alive → jadikan bot
          window.Game?.netRemove?.(id);
        }
      });
    });

    // publish posisi berkala (100ms)
    timer = setInterval(()=>{
      const st = window.Game?.getPlayerState?.();
      if (!st) return;
      setDoc(myRef, {
        name: st.name, colors: st.colors,
        x: st.x, y: st.y, dir: st.dir, length: st.length,
        online: true, ts: Date.now()
      }, { merge: true });
    }, 100);

    // status online/offline sederhana
    document.addEventListener("visibilitychange", ()=>{
      const online = !document.hidden;
      setDoc(myRef, { online, ts: Date.now() }, { merge: true });
    });
    addEventListener("beforeunload", ()=>{
      try { navigator.sendBeacon && setDoc(myRef, { online:false, ts:Date.now() }, { merge:true }); }
      catch(_) { /* no-op */ }
    });
  }

  async function stop(){
    try { timer && clearInterval(timer); } catch(_) {}
    timer = null;
    try { unsub && unsub(); } catch(_) {}
    unsub = null;
    if (myRef) {
      try { await setDoc(myRef, { online:false, ts:Date.now() }, { merge:true }); } catch(_){}
      // optional: hapus dokumen agar cepat hilang
      // try { await deleteDoc(myRef); } catch(_){}
    }
  }

  return { start, stop, ROOM_ID };
})();

export default NetSync;
if (typeof window !== "undefined") window.NetSync = NetSync;
