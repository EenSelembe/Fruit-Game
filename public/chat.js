import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } 
  from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// 🔑 Config Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB8g9X_En_sJnbdT_Rc1NK88dUdbg3y2nE",
  authDomain: "fruit-game-5e4a8.firebaseapp.com",
  projectId: "fruit-game-5e4a8",
  storageBucket: "fruit-game-5e4a8.appspot.com",
  messagingSenderId: "936228678997",
  appId: "1:936228678997:web:9dab2fa0d9a019161bd3dc"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let chatToggle, chatWindow, closeChat, sendChat, chatMessage, messagesBox;

// 🔥 Init chat widget setelah HTML dimuat
function initChat() {
  chatToggle = document.getElementById("chatToggle");
  chatWindow = document.getElementById("chatWindow");
  closeChat = document.getElementById("closeChat");
  sendChat = document.getElementById("sendChat");
  chatMessage = document.getElementById("chatMessage");
  messagesBox = document.getElementById("messages");

  // Toggle buka/tutup
  chatToggle.addEventListener("click", () => {
    chatWindow.style.display = "flex";
    chatToggle.style.display = "none";
  });

  closeChat.addEventListener("click", () => {
    chatWindow.style.display = "none";
    chatToggle.style.display = "block";
  });

  // Kirim pesan
  sendChat.addEventListener("click", sendMessage);
  chatMessage.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  // Geser tombol 💬
  dragElement(chatToggle);

  // Ambil pesan dari Firestore
  loadMessages();
}

// 🚀 Fungsi kirim pesan
async function sendMessage() {
  const user = auth.currentUser;
  if (!user || !chatMessage.value.trim()) return;

  await addDoc(collection(db, "chatGlobal"), {
    uid: user.uid,
    text: chatMessage.value,
    time: serverTimestamp()
  });

  chatMessage.value = "";
}

// 🚀 Ambil pesan realtime
function loadMessages() {
  const q = query(collection(db, "chatGlobal"), orderBy("time", "desc"), limit(50));
  onSnapshot(q, (snap) => {
    messagesBox.innerHTML = "";
    snap.forEach((doc) => {
      const m = doc.data();
      const div = document.createElement("div");
      let color = "#fff";

      if (m.uid === "AxB4G2xwhiXdJnyDrzn82Xanc4x2") {
        color = "lime"; // Admin hijau stabilo
      }

      div.innerHTML = `<span style="color:${color}">${m.text}</span>`;
      messagesBox.prepend(div);
    });
  });
}

// 🚀 Fungsi drag
function dragElement(elmnt) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  elmnt.onmousedown = dragMouseDown;
  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }
  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
    elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
  }
  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

window.initChat = initChat;
