// chat.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { 
  getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, doc, getDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// Firebase config (sama persis dengan home.html)
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

  // === draggable icon ===
  let isDragging = false, offsetX = 0, offsetY = 0;
  chatIcon.addEventListener("mousedown", startDrag);
  chatIcon.addEventListener("touchstart", startDrag);

  function startDrag(e) {
    isDragging = true;
    const rect = chatIcon.getBoundingClientRect();
    if (e.touches) {
      offsetX = e.touches[0].clientX - rect.left;
      offsetY = e.touches[0].clientY - rect.top;
    } else {
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
    }
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

  // === toggle chat ===
  chatIcon.addEventListener("click", () => {
    chatBox.style.display = "flex";
    chatIcon.style.display = "none";
    // reset badge saat buka
    unread = 0;
    badge.style.display = "none";
  });
  chatClose.addEventListener("click", () => {
    chatBox.style.display = "none";
    chatIcon.style.display = "block";
  });

  // === kirim pesan GLOBAL ===
  async function sendMessage() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    const user = auth.currentUser;
    if (!user) return;

    // ambil nama user dari Firestore
    let username = "Anonim";
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const d = userDoc.data();
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

  // === tampilkan pesan GLOBAL + badge unread ===
  const q = query(
    collection(db, "globalChat"),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  // 🔹 Badge unread
  let badge = document.createElement("span");
  badge.id = "chatBadge";
  badge.style.position = "absolute";
  badge.style.top = "2px";
  badge.style.right = "2px";
  badge.style.background = "red";
  badge.style.color = "white";
  badge.style.fontSize = "12px";
  badge.style.fontWeight = "bold";
  badge.style.padding = "2px 5px";
  badge.style.borderRadius = "50%";
  badge.style.display = "none";
  badge.style.zIndex = "10000";
  chatIcon.style.position = "fixed";
  chatIcon.appendChild(badge);

  let unread = 0;

  onSnapshot(q, (snap) => {
    chatMessages.innerHTML = "";
    snap.forEach((doc) => {
      const d = doc.data();
      const div = document.createElement("div");
      div.className = "chat-message";

      // admin hijau stabilo
      if (d.uid === ADMIN_UID) {
        div.style.color = "#00ff7f";
        div.style.fontWeight = "bold";
      }

      div.textContent = `${d.name}: ${d.text}`;
      chatMessages.prepend(div);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (chatBox.style.display === "none") {
      unread++;
      badge.textContent = unread;
      badge.style.display = "block";
    }
  });

  // === fitur tambahan: kirim PRIVATE MESSAGE ===
  async function sendPrivateMessage(targetUid, msg) {
    if (!msg) return;
    const user = auth.currentUser;
    if (!user) return;

    // bikin chatId unik
    const chatId = [user.uid, targetUid].sort().join("_");

    // ambil nama user
    let username = "Anonim";
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const d = userDoc.data();
        username = d.name || d.username || "Anonim";
      }
    } catch (err) {
      console.error("Gagal ambil nama user:", err);
    }

    await addDoc(collection(db, "privateChats", chatId, "messages"), {
      uid: user.uid,
      text: msg,
      name: username,
      createdAt: serverTimestamp()
    });
  }

  // Listener private chat
  function listenPrivateChat(targetUid, callback) {
    const user = auth.currentUser;
    if (!user) return;

    const chatId = [user.uid, targetUid].sort().join("_");

    const q = query(
      collection(db, "privateChats", chatId, "messages"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    return onSnapshot(q, (snap) => {
      const messages = [];
      snap.forEach(doc => messages.push(doc.data()));
      callback(messages.reverse());
    });
  }

  // expose biar bisa dipanggil dari luar
  window.sendPrivateMessage = sendPrivateMessage;
  window.listenPrivateChat = listenPrivateChat;

  console.log("✅ Chat initialized (global + private)");
} // end initChat
