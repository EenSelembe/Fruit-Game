// /api/transfer.js
import admin from "firebase-admin";

// Pastikan hanya sekali initialize
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const { fromUid, toUid, nominal } = req.body;
  if (!fromUid || !toUid || !nominal) {
    return res.status(400).json({ error: "Data tidak lengkap" });
  }

  try {
    // Jalankan transaksi biar aman
    await db.runTransaction(async (t) => {
      const fromRef = db.collection("users").doc(fromUid);
      const toRef = db.collection("users").doc(toUid);

      const fromSnap = await t.get(fromRef);
      const toSnap = await t.get(toRef);

      if (!fromSnap.exists || !toSnap.exists) {
        throw new Error("User tidak ditemukan");
      }

      const fromSaldo = fromSnap.data().saldo || 0;
      if (fromSaldo < nominal) {
        throw new Error("Saldo tidak cukup");
      }

      t.update(fromRef, { saldo: fromSaldo - nominal });
      t.update(toRef, { saldo: (toSnap.data().saldo || 0) + nominal });
    });

    return res.status(200).json({ success: true, message: "Transfer berhasil" });
  } catch (err) {
    console.error("Transfer error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
