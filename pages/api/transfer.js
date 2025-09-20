// pages/api/transfer.js
import admin from "firebase-admin";

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
    console.log("✅ Firebase Admin initialized");
  } catch (err) {
    console.error("❌ Firebase Admin init error:", err);
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const { fromEmail, toEmail, nominal } = req.body;

  if (!fromEmail || !toEmail || !nominal) {
    return res.status(400).json({ error: "Data tidak lengkap" });
  }

  try {
    await db.runTransaction(async (t) => {
      const usersRef = db.collection("users");
      const transfersRef = db.collection("transfers");

      // cari user pengirim
      const qFrom = await usersRef.where("email", "==", fromEmail).limit(1).get();
      if (qFrom.empty) throw new Error("Pengirim tidak ditemukan");
      const fromDoc = qFrom.docs[0];
      const fromData = fromDoc.data();

      // cek saldo cukup
      if ((fromData.saldo || 0) < nominal) throw new Error("Saldo tidak cukup");

      // cari user penerima
      const qTo = await usersRef.where("email", "==", toEmail).limit(1).get();
      if (qTo.empty) throw new Error("Penerima tidak ditemukan");
      const toDoc = qTo.docs[0];
      const toData = toDoc.data();

      // update saldo
      t.update(fromDoc.ref, { saldo: (fromData.saldo || 0) - nominal });
      t.update(toDoc.ref, { saldo: (toData.saldo || 0) + nominal });

      // simpan log
      t.set(transfersRef.doc(), {
        from: fromEmail,
        to: toEmail,
        nominal,
        date: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Transfer error:", err);
    return res.status(500).json({ error: err.message });
  }
}
