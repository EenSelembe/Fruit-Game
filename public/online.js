// online.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, updateDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

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

export function initOnlineStatus() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const meRef = doc(db, "users", user.uid);
        await updateDoc(meRef, { isOnline: true });
      } catch (e) {
        console.error("Gagal update status online:", e);
      }
    } else {
      window.location.href = "index.html";
    }
  });

  // Saat tab ditutup → offline
  window.addEventListener("beforeunload", () => {
    const user = auth.currentUser;
    if (user) {
      const meRef = doc(db, "users", user.uid);
      updateDoc(meRef, { isOnline: false });
    }
  });
}
