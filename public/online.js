// online.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { 
  getAuth, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  updateDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

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

let heartbeatInterval = null;

export function initOnlineStatus() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      const userRef = doc(db, "users", user.uid);

      // update pertama kali
      updateDoc(userRef, {
        lastSeen: serverTimestamp()
      }).catch(console.error);

      // update setiap 20 detik
      heartbeatInterval = setInterval(() => {
        updateDoc(userRef, {
          lastSeen: serverTimestamp()
        }).catch(console.error);
      }, 20000);

      // saat logout / tutup tab
      window.addEventListener("beforeunload", () => {
        clearInterval(heartbeatInterval);
        updateDoc(userRef, {
          lastSeen: serverTimestamp()
        }).catch(console.error);
      });
    } else {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    }
  });
}
