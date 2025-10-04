// /public/js/presence.js
// Presence sederhana: tulis heartbeat ke Firestore dan tampilkan jumlah pemain online.

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, setDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const auth = getAuth();               // pakai app default
const db   = getFirestore();

let uid = null;
let timer = null;

function heartbeat() {
  const p = window.App?.profile || {};
  setDoc(doc(db, "presence", uid), {
    username: p.name || p.username || "Anonim",
    t: Date.now()
  }, { merge: true });
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  uid = user.uid;

  // kirim heartbeat tiap 5s
  heartbeat();
  timer && clearInterval(timer);
  timer = setInterval(heartbeat, 5000);

  // dengarkan semua presence dan hitung yang aktif (<15s)
  const col = collection(db, "presence");
  onSnapshot(col, (snap) => {
    const now = Date.now();
    let online = 0;
    snap.forEach((d) => {
      const t = (d.data()?.t) || 0;
      if (now - t < 15000) online++;
    });
    const el = document.getElementById("userCount");
    if (el) el.textContent = online;
  });
});
