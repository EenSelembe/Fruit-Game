// chat.js
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

const ADMIN_UID = "AxB4G2xwhiXdJnyDrzn82Xanc4x2";

export function initChat() {
  const chatIcon = document.getElementById("chatIcon");
  const chatBox = document.getElementById("chatBox");
  const chatMessages = document.getElementById("chatMessages");
  const chatInput = document.getElementById("chatInput");
  const chatSend = document.getElementById("chatSend");
  const chatClose = document.getElementById("chatClose");
  const badge = document.getElementById("chatBadge");

  // DM
  const dmBox = document.getElementById("dmBox");
  const dmMessages = document.getElementById("dmMessages");
  const dmInput = document.getElementById("dmInput");
  const dmSend = document.getElementById("dmSend");
  const dmClose = document.getElementById("dmClose");
  const dmTitle = document.getElementById("dmTitle");

  // === draggable chat icon ===
  let isDragging = false, offsetX = 0, offsetY = 0;
  chatIcon.addEventListener("mousedown", startDrag);
  chatIcon.addEventListener("touchstart", startDrag);

  function startDrag(e) {
    isDragging = true;
    const rect = chatIcon.getBoundingClientRect();
    offsetX = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    offsetY = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
    document.addEventListener("touchmove", onDrag);
    document.addEventListener("touchend", stopDrag);
  }

  function onDrag(e) {
    if (!isDragging) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    chatIcon.style.left = (x - offsetX) + "px";
    chatIcon.style.top = (y - offsetY) + "px";
  }

  function stopDrag() {
    isDragging = false;
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
    document.removeEventListener("touchmove", onDrag);
    document.removeEventListener("touchend", stopDrag);
  }

  // === toggle chat global ===
  let unread = 0;
  chatIcon.addEventListener("click", () => {
    chatBox.style.display = "flex";
    chatIcon.style.display = "none";
    unread = 0;
    badge.style.display = "none";
  });

  chatClose.addEventListener("click", () => {
    chatBox.style.display = "none";
    chatIcon.style.display = "block";
  });

  // === kirim pesan global ===
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
  chatInput.addEventListener("keypress", e => {
    if (e.key === "Enter") sendMessage();
  });

  // === tampilkan pesan global ===
  const q = query(collection(db, "globalChat"), orderBy("createdAt", "desc"), limit(50));
  onSnapshot(q, (snap) => {
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
      div.addEventListener("dblclick", () => openDM(d.uid, d.name)); // DM
      chatMessages.prepend(div);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (chatBox.style.display === "none") {
      unread++;
      badge.textContent = unread;
      badge.style.display = "block";
    }
  });

  // === DM logic ===
  let currentDM = null;
  function openDM(uid, name) {
    currentDM = uid;
    dmTitle.textContent = `📩 DM dengan ${name}`;
    dmBox.style.display = "flex";

    const qDM = query(
      collection(db, "dm", uid),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    onSnapshot(qDM, (snap) => {
      dmMessages.innerHTML = "";
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        const div = document.createElement("div");
        div.className = "chat-message";
        div.textContent = `${d.fromName}: ${d.text}`;
        dmMessages.prepend(div);
      });
      dmMessages.scrollTop = dmMessages.scrollHeight;
    });
  }

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

    await addDoc(collection(db, "dm", currentDM), {
      from: user.uid,
      to: currentDM,            // ✅ ditambahkan biar sesuai rules
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
  });

  console.log("✅ Chat initialized with Global + DM");
} // << penutup function initChat()
