import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } 
  from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// Firebase Config
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

export function initChat() {
  chatToggle = document.getElementById("chatToggle");
  chatWindow = document.getElementById("chatWindow");
  closeChat = document.getElementById("closeChat");
  sendChat = document.getElementById("sendChat");
  chatMessage = document.getElementById("chatMessage");
  messagesBox = document.getElementById("messages");

  // Buka/tutup
  chatToggle.onclick = () => {
    chatWindow.style.display = "flex";
    chatToggle.style.display = "none";
  };
  closeChat.onclick = () => {
    chatWindow.style.display = "none";
    chatToggle.style.display = "flex";
  };

  // Kirim pesan
  sendChat.onclick = sendMessage;
  chatMessage.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  // Bisa digeser
  dragElement(chatToggle);

  // Ambil pesan realtime
  loadMessages();
}

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

function loadMessages() {
  const q = query(collection(db, "chatGlobal"), orderBy("time", "desc"), limit(50));
  onSnapshot(q, (snap) => {
    messagesBox.innerHTML = "";
    snap.forEach((doc) => {
      const m = doc.data();
      let color = "#fff";
      if (m.uid === "AxB4G2xwhiXdJnyDrzn82Xanc4x2") color = "lime"; // admin

      const div = document.createElement("div");
      div.innerHTML = `<span style="color:${color}">${m.text}</span>`;
      messagesBox.prepend(div);
    });
  });
}

// Fungsi drag
function dragElement(elmnt) {
  let pos1=0,pos2=0,pos3=0,pos4=0;
  elmnt.onmousedown = dragMouseDown;
  function dragMouseDown(e) {
    e.preventDefault();
    pos3 = e.clientX; pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }
  function elementDrag(e) {
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
