// === online.js ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// Konfigurasi Firebase (SAMAKAN dengan project kamu)
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
const auth = getAuth(app);
const db = getFirestore(app);

// Fungsi init presence
export function initOnlineStatus() {
  onAuthStateChanged(auth, (user) => {
    if (!user) return;

    const userRef = doc(db, "users", user.uid);

    // Update lastSeen pertama kali saat login
    updateDoc(userRef, { lastSeen: serverTimestamp() });

    // Update lastSeen tiap 30 detik
    setInterval(() => {
      updateDoc(userRef, { lastSeen: serverTimestamp() });
    }, 30000);

    // Update lastSeen terakhir saat tab ditutup
    window.addEventListener("beforeunload", () => {
      updateDoc(userRef, { lastSeen: serverTimestamp() });
    });
  });
}
