// /public/js/net-sync.js
// Sinkron posisi pemain via Firestore (single room: "world1")

import {
  collection, doc, onSnapshot, setDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const NetSync = (() => {
  const ROOM_ID = "world1";
  let db, auth, uid = null, myRef = null;
  let unsub = null, timer = null;

  function start() {
    if (!window.Firebase?.db || !window.Firebase?.auth) return;
    db = window.Firebase.db;
    auth = window.Firebase.auth;

    const user = auth.currentUser;
    if (!user) return;
    uid = user.uid;
    myRef = doc(db, "rooms", ROOM_ID, "players", uid);

    // publish awal (pakai state game kalau ada)
    const st0 = window.Game?.getPlayerState?.() || {};
    const name = st0.name || window.App?.profileStyle?.name || "Player";
    const colors = Array.isArray(st0.colors) && st0.colors.length ? st0.colors : ["#58ff9b"];

    setDoc(myRef, {
      name,
      colors,
      x: typeof st0.x === "number" ? st0.x : 0,
      y: typeof st0.y === "number" ? st0.y : 0,
      dir: typeof st0.dir === "number" ? st0.dir : 0,
      length: typeof st0.length === "number" ? st0.length : 3,
      online: true,
      ts: Date.now()
    }, { merge: true });

    // subscribe semua pemain di room
    const colRef = collection(db, "rooms", ROOM_ID, "players");
    unsub = onSnapshot(colRef, (snap) => {
      snap.forEach((docSnap) => {
        const id = docSnap.id;
        const data = docSnap.data() || {};
        if (id === uid) return; // abaikan diri sendiri

        const alive = (data.online !== false) && (Date.now() - (data.ts || 0) < 15000);

        if (alive) {
          window.Game?.netUpsert?.(id, {
            name: data.name || "Player",
            colors: Array.isArray(data.colors) && data.colors.length ? data.colors : ["#79a7ff"],
            x: +data.x || 0,
            y: +data.y || 0,
            dir: +data.dir || 0,
            length: +data.length || 3,
            alive: true
          });
        } else {
          window.Game?.netRemove?.(id);
        }
      });
    });

    // publish posisi berkala (hanya pemain aktif; bot TIDAK publish)
    timer = setInterval(() => {
      const st = window.Game?.getPlayerState?.();
      if (!st) return;
      setDoc(myRef, {
        name: st.name,
        colors: st.colors,
        x: st.x, y: st.y, dir: st.dir,
        length: st.length,
        online: true,
        ts: Date.now()
      }, { merge: true });
    }, 120); // 8–10 Hz cukup halus

    // status online/offline sederhana
    document.addEventListener("visibilitychange", () => {
      const online = !document.hidden;
      setDoc(myRef, { online, ts: Date.now() }, { merge: true });
    });
    addEventListener("beforeunload", () => {
      try { setDoc(myRef, { online: false, ts: Date.now() }, { merge: true }); } catch(_) {}
    });
  }

  function stop() {
    try { timer && clearInterval(timer); } catch(_) {}
    timer = null;
    try { unsub && unsub(); } catch(_) {}
    unsub = null;
    if (myRef) setDoc(myRef, { online: false, ts: Date.now() }, { merge: true });
  }

  return { start, stop };
})();

export default NetSync;
if (typeof window !== "undefined") window.NetSync = NetSync;
