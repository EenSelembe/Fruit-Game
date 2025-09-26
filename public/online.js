import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, updateDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const auth = getAuth();
const db = getFirestore();

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
}
