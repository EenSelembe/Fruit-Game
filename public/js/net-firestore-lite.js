// net-firestore-lite.js
// Multiplayer ringan 1-room dengan Firestore:
// - Heartbeat presence setiap 4s -> daftar online
// - Host otomatis = uid online terkecil -> hanya host yang mensimulasikan BOT utk pemain OFFLINE
// - Publish posisi ular ke koleksi "s/{uid}" @ 5Hz
// - Subscribe semua "s/*" -> render ular pemain lain (real-time)

// Import Firebase (langsung dari CDN agar mandiri)
import {
  getFirestore, doc, setDoc, updateDoc, onSnapshot, collection,
  getDocs, query
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const Net = (() => {
  const db = window.Firebase?.db || getFirestore();
  let myUid = null;
  let isAdmin = false;
  let myName = "USER";
  let started = false;

  // cache profil semua user (untuk nama & style)
  const users = new Map(); // uid -> {name, ...style}
  // presence online: uid -> lastSeen (ms)
  const online = new Map();
  // host election
  let iAmHost = false;

  // hooks ke Game
  const hooks = {
    upsertRemote: (uid, state) => {},
    removeRemote: (uid) => {},
    replaceOfflineBots: (list) => {},
    getPublishStates: () => [] // array {uid,x,y,dir,length,colors,name,isAdmin}
  };

  const now = () => Date.now();

  /* ---------- USERS (profil) ---------- */
  async function initUsers() {
    const q = query(collection(db, "users"));
    const snap = await getDocs(q);
    snap.forEach(d => {
      const v = d.data() || {};
      const name = v.name || v.username || "Anonim";
      users.set(d.id, {
        name,
        color: v.color || "#fff",
        bgColor: v.bgColor || null,
        bgGradient: v.bgGradient || null,
        borderColor: v.borderColor || "#000",
        borderGradient: v.borderGradient || null,
        isAdmin: (d.id === window.App?.ADMIN_UID)
      });
    });
  }

  /* ---------- PRESENCE (heartbeat + host) ---------- */
  const PRESENCE_TTL = 10000; // ms dianggap online jika lastSeen <= 10s
  let beatTimer = null;

  async function heartbeatLoop() {
    if (!myUid) return;
    try {
      await setDoc(doc(db, "presence", myUid), { lastSeen: now() }, { merge: true });
    } catch (_) {}
  }

  function startPresence() {
    heartbeatLoop();
    beatTimer = setInterval(heartbeatLoop, 4000);
    onSnapshot(collection(db, "presence"), (snap) => {
      const t = now();
      online.clear();
      snap.forEach(d => {
        const v = d.data() || {};
        if ((t - Number(v.lastSeen || 0)) <= PRESENCE_TTL) {
          online.set(d.id, Number(v.lastSeen));
        }
      });
      electHost();
      driveOfflineBots();
    });
    // coba tulis lastSeen 0 saat keluar (best effort)
    addEventListener("pagehide", () => {
      try { navigator.sendBeacon && navigator.sendBeacon("/", ""); } catch(_) {}
    });
  }

  function electHost() {
    // host = uid online terkecil (string compare)
    const arr = [...online.keys()].sort();
    const newHost = arr.length ? arr[0] : null;
    const prev = iAmHost;
    iAmHost = (newHost && myUid === newHost);
    if (prev !== iAmHost) {
      driveOfflineBots(); // refresh daftar bot
    }
  }

  /* ---------- PUBLISH & SUBSCRIBE SNAKE STATE ---------- */
  let pubTimer = null;

  function startPublisher() {
    stopPublisher();
    pubTimer = setInterval(async () => {
      const states = hooks.getPublishStates() || [];
      // host juga mem-publish BOT offline (states sudah termasuk bila iAmHost)
      for (const st of states) {
        if (!st || !st.uid) continue;
        try {
          await setDoc(doc(db, "s", st.uid), {
            x: st.x, y: st.y, dir: st.dir, length: st.length,
            colors: st.colors || ["#58ff9b"],
            name: st.name || "USER",
            isAdmin: !!st.isAdmin,
            ts: now()
          }, { merge: true });
        } catch (_) {}
      }
    }, 200); // 5Hz
  }
  function stopPublisher() {
    if (pubTimer) clearInterval(pubTimer), pubTimer = null;
  }

  function startSubscriber() {
    onSnapshot(collection(db, "s"), (snap) => {
      const t = now();
      snap.docChanges().forEach(ch => {
        const id = ch.doc.id;
        if (id === myUid) return; // lokal kita gambar sendiri
        if (ch.type === "removed") {
          hooks.removeRemote(id);
          return;
        }
        const v = ch.doc.data() || {};
        // abaikan state basi (>6s) untuk keamanan
        if ((t - Number(v.ts || 0)) > 6000) {
          hooks.removeRemote(id);
          return;
        }
        // upsert remote
        hooks.upsertRemote(id, {
          x: Number(v.x || 0), y: Number(v.y || 0), dir: Number(v.dir || 0),
          length: Math.max(1, Number(v.length || 3)),
          colors: Array.isArray(v.colors) && v.colors.length ? v.colors : ["#58ff9b"],
          name: String(v.name || users.get(id)?.name || "USER"),
          isAdmin: !!v.isAdmin
        });
      });
    });
  }

  /* ---------- OFFLINE → BOT oleh HOST ---------- */
  function driveOfflineBots() {
    if (!started) return;
    // daftar semua user valid
    const allUids = [...users.keys()];
    const t = now();
    // offline = tidak di online map
    const offline = allUids.filter(u => !online.has(u));
    if (!iAmHost) {
      // non host: pastikan tidak ada bot offline yg disimulasikan lokal
      hooks.replaceOfflineBots([]);
      return;
    }
    // host: kirim daftar offline (dengan profil) ke Game agar disimulasikan AI
    const list = offline.map(uid => {
      const info = users.get(uid) || {};
      // warna fallback: dari profil jika ada (pakai color), jika tidak default
      const col = info.color ? [info.color] : ["#79a7ff"];
      return { uid, name: info.name || "USER", colors: col, isAdmin: (uid === window.App?.ADMIN_UID) };
    });
    hooks.replaceOfflineBots(list);
  }

  /* ---------- API ---------- */
  async function start(opts = {}) {
    if (started) return;
    myUid = opts.uid;
    isAdmin = !!opts.isAdmin;
    myName = String(opts.name || "USER");
    hooks.upsertRemote = opts.upsertRemote || hooks.upsertRemote;
    hooks.removeRemote = opts.removeRemote || hooks.removeRemote;
    hooks.replaceOfflineBots = opts.replaceOfflineBots || hooks.replaceOfflineBots;
    hooks.getPublishStates = opts.getPublishStates || hooks.getPublishStates;

    await initUsers();
    startPresence();
    startSubscriber();
    startPublisher();
    started = true;
  }

  return { start };
})();

export default Net;
export { Net };
if (typeof window !== "undefined") window.Net = Net;
