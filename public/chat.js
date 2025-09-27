import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } 
  from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

let db, auth;

export function initChat() {
  auth = getAuth();
  db = getFirestore();

  const chatIcon = document.getElementById("chatIcon");
  const chatBox = document.getElementById("chatBox");
  const chatClose = document.getElementById("chatClose");
  const chatInput = document.getElementById("chatInput");
  const chatSend = document.getElementById("chatSend");
  const chatMessages = document.getElementById("chatMessages");

  // Buka & tutup
  chatIcon.addEventListener("click", () => {
    chatBox.style.display = "flex";
    chatIcon.style.display = "none";
  });
  chatClose.addEventListener("click", () => {
    chatBox.style.display = "none";
    chatIcon.style.display = "flex";
  });

  // Kirim pesan
  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    const user = auth.currentUser;
    if (!user) return;

    await addDoc(collection(db, "globalChat"), {
      uid: user.uid,
      name: user.displayName || "Anonim",
      text,
      createdAt: serverTimestamp()
    });
    chatInput.value = "";
  }

  chatSend.addEventListener("click", sendMessage);
  chatInput.addEventListener("keypress", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  // Ambil pesan realtime
  const q = query(collection(db, "globalChat"), orderBy("createdAt", "desc"), limit(50));
  onSnapshot(q, snap => {
    chatMessages.innerHTML = "";
    snap.forEach(doc => {
      const m = doc.data();
      const div = document.createElement("div");
      div.className = "chat-message";
      if (m.uid === "AxB4G2xwhiXdJnyDrzn82Xanc4x2") {
        div.style.color = "#00ff00"; // admin
      }
      div.textContent = `${m.name || "Anonim"}: ${m.text}`;
      chatMessages.prepend(div);
    });
  });

  // Geser icon (versi FIXED, bukan absolute)
  let isDragging = false, offsetX, offsetY;
  chatIcon.addEventListener("mousedown", e => {
    isDragging = true;
    offsetX = e.clientX - chatIcon.offsetLeft;
    offsetY = e.clientY - chatIcon.offsetTop;
    chatIcon.style.cursor = "grabbing";
  });
  document.addEventListener("mousemove", e => {
    if (isDragging) {
      chatIcon.style.left = (e.clientX - offsetX) + "px";
      chatIcon.style.top = (e.clientY - offsetY) + "px";
      chatIcon.style.right = "auto";
      chatIcon.style.bottom = "auto";
    }
  });
  document.addEventListener("mouseup", () => {
    isDragging = false;
    chatIcon.style.cursor = "grab";
  });
}
