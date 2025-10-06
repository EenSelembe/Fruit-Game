// /public/js/presence.js — versi fix realtime & sinkron Firebase tunggal
import {
  collection, getDocs, onSnapshot, doc, setDoc, updateDoc,
  serverTimestamp, query, where
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// ====== Global map untuk user directory dan online presence ======
const UserDir = new Map();     // uid -> { uid, name, style, isAdmin }
const OnlineUids = new Set();  // uid yang online di room aktif
const ROOM_ID = window.WORLD_ROOM_ID || "world1";

// ====== Helper: tunggu Firebase siap dari firebase-boot.js ======
function waitForFirebaseInit(cb) {
  if (window.Firebase?.db && window.Firebase?.auth) {
    cb(window.Firebase.db, window.Firebase.auth);
  } else {
    setTimeout(() => waitForFirebaseInit(cb), 120);
  }
}

// ====== Load semua user agar bisa dipakai bot offline (warna & nama) ======
async function loadUsersOnce(db) {
  const snap = await getDocs(collection(db, "users"));
  UserDir.clear();
  snap.forEach((d) => {
    const u = d.data() || {};
    UserDir.set(d.id, {
      uid: d.id,
      name: u.name || u.username || "USER",
      isAdmin: d.id === window.App?.ADMIN_UID,
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

// ====== Pantau siapa yang online di room aktif ======
function subPresence(db) {
  const q = query(collection(db, "presence"), where("room", "==", ROOM_ID));
  onSnapshot(q, (snap) => {
    OnlineUids.clear();
    snap.forEach((d) => {
      const v = d.data() || {};
      if (v.online) OnlineUids.add(d.id);
    });
    window.dispatchEvent(new CustomEvent("presence:update", { detail: { online: [...OnlineUids] } }));
  });
}

// ====== Jalankan heartbeat untuk user yang sedang login ======
async function keepMyPresence(db, uid) {
  const ref = doc(db, "presence", uid);
  await setDoc(ref, { room: ROOM_ID, online: true, ts: serverTimestamp() }, { merge: true });

  const ping = () => {
    updateDoc(ref, { ts: serverTimestamp(), online: !document.hidden }).catch(() => {});
  };
  document.addEventListener("visibilitychange", ping);
  setInterval(ping, 15000);

  // tandai offline saat keluar
  addEventListener("beforeunload", () => {
    try {
      navigator.sendBeacon?.("/", "bye");
      setDoc(ref, { online: false, ts: serverTimestamp() }, { merge: true });
    } catch (_) {}
  });
}

// ====== Jalankan saat Firebase siap dan user login ======
waitForFirebaseInit((db, auth) => {
  console.info("[ROOM presence] aktif:", ROOM_ID);

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    await loadUsersOnce(db);
    subPresence(db);
    keepMyPresence(db, user.uid);
  });
});

// ====== Ekspor ke global ======
window.Presence = { UserDir, OnlineUids, ROOM_ID };
