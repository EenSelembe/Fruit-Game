// chat.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot,
  serverTimestamp, doc, getDoc, where
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// === Firebase config (sama persis dengan home.html) ===
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

const ADMIN_UID = "AxB4G2xwhiXdJnyDrzn82Xanc4x2";

export function initChat() {
  // ====== DOM ======
  const chatIcon     = document.getElementById("chatIcon");
  const chatBox      = document.getElementById("chatBox");
  const chatMessages = document.getElementById("chatMessages");
  const chatInput    = document.getElementById("chatInput");
  const chatSend     = document.getElementById("chatSend");
  const chatClose    = document.getElementById("chatClose");
  const badge        = document.getElementById("chatBadge");

  // DM elements
  const dmBox      = document.getElementById("dmBox");
  const dmMessages = document.getElementById("dmMessages");
  const dmInput    = document.getElementById("dmInput");
  const dmSend     = document.getElementById("dmSend");
  const dmClose    = document.getElementById("dmClose");
  const dmTitle    = document.getElementById("dmTitle");

  // ====== Draggable icon ======
  let isDragging = false, offsetX = 0, offsetY = 0;

  function startDrag(e) {
    isDragging = true;
    const rect = chatIcon.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    offsetX = cx - rect.left;
    offsetY = cy - rect.top;
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
    document.addEventListener("touchmove", onDrag, { passive: false });
    document.addEventListener("touchend", stopDrag);
  }
  function onDrag(e) {
    if (!isDragging) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    chatIcon.style.left = (x - offsetX) + "px";
    chatIcon.style.top  = (y - offsetY) + "px";
  }
  function stopDrag() {
    isDragging = false;
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
    document.removeEventListener("touchmove", onDrag);
    document.removeEventListener("touchend", stopDrag);
  }
  chatIcon.addEventListener("mousedown", startDrag);
  chatIcon.addEventListener("touchstart", startDrag);

  // ====== Toggle chat global ======
  let unread = 0;
  chatIcon.addEventListener("click", () => {
    chatBox.style.display = "flex";
    chatIcon.style.display = "none";
    unread = 0;
    if (badge) {
      badge.style.display = "none";
      badge.textContent = "";
    }
  });
  chatClose.addEventListener("click", () => {
    chatBox.style.display = "none";
    chatIcon.style.display = "block";
  });

  // ====== Kirim pesan global (TIDAK DIUBAH) ======
  async function sendMessage() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    const user = auth.currentUser;
    if (!user) return;

    let username = "Anonim";
    try {
      const u = await getDoc(doc(db, "users", user.uid));
      if (u.exists()) {
        const d = u.data();
        username = d.name || d.username || "Anonim";
      }
    } catch (err) {
      console.error("Gagal ambil nama user:", err);
    }

    await addDoc(collection(db, "globalChat"), {
      uid: user.uid,
      text: msg,
      name: username,
      createdAt: serverTimestamp()
    });

    chatInput.value = "";
  }

  chatSend.addEventListener("click", sendMessage);
  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  // ====== Tampilkan pesan global (TIDAK DIUBAH) ======
  const qGlobal = query(
    collection(db, "globalChat"),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  onSnapshot(qGlobal, (snap) => {
    chatMessages.innerHTML = "";
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const div = document.createElement("div");
      div.className = "chat-message";
      if (d.uid === ADMIN_UID) {
        div.style.color = "#00ff7f";
        div.style.fontWeight = "bold";
      }
      div.textContent = `${d.name}: ${d.text}`;

      // ====== OPEN DM saat DUA KALI klik nama/pesan orang ======
      div.addEventListener("dblclick", () => {
        if (!d.uid) return;
        openDM(d.uid, d.name || "Pengguna");
      });

      chatMessages.prepend(div);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (chatBox.style.display === "none" && badge) {
      unread++;
      badge.textContent = unread;
      badge.style.display = "block";
    }
  });

  // ====== DM logic (DIPERBAIKI) ======
  let currentDM = null;
  let unsubDM = null;

  function detachDM() {
    if (typeof unsubDM === "function") {
      unsubDM();
      unsubDM = null;
    }
  }

  function styleDmBubble(div, isMine) {
    div.style.margin = "6px 0";
    div.style.padding = "6px 8px";
    div.style.borderRadius = "8px";
    div.style.maxWidth = "80%";
    if (isMine) {
      div.style.background = "rgba(255, 215, 0, 0.2)";
      div.style.alignSelf = "flex-end";
      div.style.textAlign = "right";
    } else {
      div.style.background = "rgba(255, 255, 255, 0.08)";
      div.style.alignSelf = "flex-start";
      div.style.textAlign = "left";
    }
  }

  async function openDM(uid, name) {
    const me = auth.currentUser;
    if (!me) return;

    currentDM = uid;
    dmTitle.textContent = `📩 DM dengan ${name}`;
    dmBox.style.display = "flex";

    // lepas listener DM sebelumnya
    detachDM();

    // Ambil percakapan dari mailbox-ku sendiri:
    // /dm/{me.uid} where peer == {uid}
    const myMailbox = collection(db, "dm", me.uid);
    const q1 = query(
      myMailbox,
      where("peer", "==", uid),
      orderBy("createdAt", "asc"),
      limit(200)
    );

    unsubDM = onSnapshot(q1, (snap) => {
      dmMessages.innerHTML = "";
      snap.forEach((s) => {
        const m = s.data();
        const row = document.createElement("div");
        row.className = "chat-message";
        const isMine = m.from === me.uid;
        styleDmBubble(row, isMine);
        row.textContent = `${m.fromName || "Aku"}: ${m.text}`;
        dmMessages.appendChild(row);
      });
      dmMessages.scrollTop = dmMessages.scrollHeight;
    });
  }

  async function sendDM() {
    const msg = dmInput.value.trim();
    if (!msg || !currentDM) return;
    const me = auth.currentUser;
    if (!me) return;

    // Ambil namaku untuk dicantumkan
    let myName = "Aku";
    try {
      const u = await getDoc(doc(db, "users", me.uid));
      if (u.exists()) {
        const d = u.data();
        myName = d.name || d.username || "Aku";
      }
    } catch {}

    // Buat dua salinan pesan:
    // 1) Ke mailbox penerima (to = recipient, peer = pengirim)
    const msgForRecipient = {
      from: me.uid,
      to: currentDM,
      peer: me.uid,           // peer relatif ke mailbox penerima
      fromName: myName,
      text: msg,
      createdAt: serverTimestamp()
    };
    // 2) Ke mailbox ku sendiri (to = aku, peer = penerima)
    const msgForMe = {
      from: me.uid,
      to: me.uid,
      peer: currentDM,        // peer relatif ke mailbox milikku
      fromName: myName,
      text: msg,
      createdAt: serverTimestamp()
    };

    // Tulis keduanya
    await addDoc(collection(db, "dm", currentDM), msgForRecipient);
    await addDoc(collection(db, "dm", me.uid), msgForMe);

    dmInput.value = "";
  }

  dmSend.addEventListener("click", sendDM);
  dmInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendDM();
  });
  dmClose.addEventListener("click", () => {
    dmBox.style.display = "none";
    detachDM();
    currentDM = null;
  });

  console.log("✅ Chat initialized with Global + DM (mailbox+peer)");
} // <= penutup function initChat()
