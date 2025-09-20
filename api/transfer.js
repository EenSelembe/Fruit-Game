import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
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
