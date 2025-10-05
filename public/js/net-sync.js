// /public/js/net-sync.js
// Sinkronisasi posisi pemain via Firestore (1 room: "world1")

import { collection, doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const NetSync = (() => {
  const ROOM_ID = "world1";
  let db, auth, uid = null, myRef = null;
  let unsub = null, timer = null;

  function start(colors, startLen){
    if (!window.Firebase?.db || !window.Firebase?.auth) return;
    db = window.Firebase.db;
    auth = window.Firebase.auth;

    const user = auth.currentUser;
    if (!user) return;
    uid = user.uid;
    myRef = doc(db, "rooms", ROOM_ID, "players", uid);

    // publish awal (merge)
    const name = window.App?.profileStyle?.name || "Player";
    const cols = Array.isArray(colors) && colors.length ? colors : ["#58ff9b"];
    const st0  = window.Game?.getPlayerState?.() || {};
    setDoc(myRef, {
      name,
      colors: cols,
      x: +st0.x || 0, y: +st0.y || 0, dir: +st0.dir || 0,
      // ✅ gunakan "len" konsisten dengan game-core.js
      len: +st0.len || +startLen || 3,
      alive: st0.alive !== false,
      online: true,
      ts: Date.now()
    }, { merge: true });

    // subscribe semua pemain di room
    const colRef = collection(db, "rooms", ROOM_ID, "players");
    unsub = onSnapshot(colRef, (snap)=>{
      snap.docChanges().forEach(ch=>{
        const id = ch.doc.id;
        if (id === uid) return; // skip diri sendiri
        const data = ch.doc.data() || {};
        const alive = (data.online !== false) && (Date.now() - (data.ts || 0) < 15000);
        if (alive) {
          window.Game?.netUpsert?.(id, {
            name: data.name || "Player",
            colors: Array.isArray(data.colors) && data.colors.length ? data.colors : ["#79a7ff"],
            x: +data.x || 0, y: +data.y || 0, dir: +data.dir || 0,
            // ✅ kirim "len" (tetap dukung kalau ada field "length" lama)
            len: typeof data.len === "number" ? data.len : (+data.length || 3),
            alive: data.alive !== false
          });
        } else {
          window.Game?.netRemove?.(id);
        }
      });
    });

    // publish posisi berkala (≈10 Hz)
    timer = setInterval(()=>{
      const st = window.Game?.getPlayerState?.();
      if (!st) return;
      setDoc(myRef, {
        name: st.name,
        colors: st.colors,
        x: st.x, y: st.y, dir: st.dir,
        // ✅ konsisten pakai "len"
        len: st.len,
        alive: st.alive !== false,
        online: true,
        ts: Date.now()
      }, { merge: true });
    }, 100);

    // status online/offline sederhana
    document.addEventListener("visibilitychange", ()=>{
      const online = !document.hidden;
      setDoc(myRef, { online, ts: Date.now() }, { merge: true });
    });
    addEventListener("beforeunload", ()=>{
      try { setDoc(myRef, { online:false, ts:Date.now() }, { merge:true }); } catch(_) {}
    });
  }

  function stop(){
    try { timer && clearInterval(timer); } catch(_) {}
    timer = null;
    try { unsub && unsub(); } catch(_) {}
    unsub = null;
    if (myRef) setDoc(myRef, { online:false, ts:Date.now() }, { merge:true });
  }

  return { start, stop };
})();

export default NetSync;
if (typeof window !== "undefined") window.NetSync = NetSync;
