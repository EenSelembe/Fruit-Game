import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const { fromUid, toUid, nominal } = req.body;

  if (!fromUid || !toUid || !nominal) {
    return res.status(400).json({ error: "Data tidak lengkap" });
  }

  try {
    const fromRef = doc(db, "users", fromUid);
    const toRef = doc(db, "users", toUid);

    const fromSnap = await getDoc(fromRef);
    const toSnap = await getDoc(toRef);

    if (!fromSnap.exists() || !toSnap.exists()) {
      return res.status(404).json({ error: "User tidak ditemukan" });
    }

    const fromSaldo = fromSnap.data().saldo || 0;
    if (fromSaldo < nominal) {
      return res.status(400).json({ error: "Saldo tidak cukup" });
    }

    // update saldo
    await updateDoc(fromRef, { saldo: fromSaldo - nominal });
    await updateDoc(toRef, { saldo: (toSnap.data().saldo || 0) + nominal });

    return res.status(200).json({ success: true, message: "Transfer berhasil" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
