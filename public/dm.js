// dm.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { 
  getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, doc, getDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB8g9X_En_sJnbdT_Rc1NK88dUdbg3y2nE",
  authDomain: "fruit-game-5e4a8.firebaseapp.com",
  projectId: "fruit-game-5e4a8",
  storageBucket: "fruit-game-5e4a8.appspot.com",
  messagingSenderId: "936228678997",
  appId: "1:936228678997:web:9dab2fa0d9a019161bd3dc",
  measurementId: "G-EPTSQQPM4D"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export function initDM() {
  const dmBox = document.getElementById("dmBox");
  const dmMessages = document.getElementById("dmMessages");
  const dmInput = document.getElementById("dmInput");
  const dmSend = document.getElementById("dmSend");
  const dmClose = document.getElementById("dmClose");
  const dmTitle = document.getElementById("dmTitle");

  let currentDM = null;
  let unsubscribeDM = null;

  // === buka DM ===
  window.openDM = function(uid, name) {
    currentDM = uid;
    dmTitle.textContent = `📩 DM dengan ${name}`;
    dmBox.style.display = "flex";

    // stop listener lama
    if (unsubscribeDM) unsubscribeDM();

    // listen pesan di subkoleksi /dm/{userId}/messages
    const qDM = query(
      collection(db, "dm", auth.currentUser.uid, "messages"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    unsubscribeDM = onSnapshot(qDM, (snap) => {
      dmMessages.innerHTML = "";
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        // tampilkan kalau pesan untuk dia atau dari dia
        if ((d.from === uid && d.to === auth.currentUser.uid) ||
            (d.from === auth.currentUser.uid && d.to === uid)) {
          const div = document.createElement("div");
          div.className = "chat-message";
          div.textContent = `${d.fromName}: ${d.text}`;
          dmMessages.prepend(div);
        }
      });
      dmMessages.scrollTop = dmMessages.scrollHeight;
    });
  };

  // === kirim DM ===
  async function sendDM() {
    const msg = dmInput.value.trim();
    if (!msg || !currentDM) return;
    const user = auth.currentUser;
    if (!user) return;

    let username = "Anonim";
    try {
      const u = await getDoc(doc(db, "users", user.uid));
      if (u.exists()) {
        const d = u.data();
        username = d.name || d.username || "Anonim";
      }
    } catch {}

    // simpan ke subkoleksi DM penerima
    await addDoc(collection(db, "dm", currentDM, "messages"), {
      from: user.uid,
      to: currentDM,
      fromName: username,
      text: msg,
      createdAt: serverTimestamp()
    });

    // simpan juga ke subkoleksi DM pengirim biar sinkron
    await addDoc(collection(db, "dm", user.uid, "messages"), {
      from: user.uid,
      to: currentDM,
      fromName: username,
      text: msg,
      createdAt: serverTimestamp()
    });

    dmInput.value = "";
  }

  dmSend.addEventListener("click", sendDM);
  dmInput.addEventListener("keypress", e => {
    if (e.key === "Enter") sendDM();
  });
  dmClose.addEventListener("click", () => {
    dmBox.style.display = "none";
    if (unsubscribeDM) unsubscribeDM();
  });

  console.log("✅ DM initialized");
}
