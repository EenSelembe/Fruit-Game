import admin from "firebase-admin";

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    console.log("Firebase Admin initialized ✅");
  } catch (err) {
    console.error("Firebase Admin init error ❌:", err);
  }
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

      // Update saldo
      t.update(fromRef, { saldo: fromSaldo - nominal });
      t.update(toRef, { saldo: (toSnap.data().saldo || 0) + nominal });

      // Simpan ke history
      const logRef = db.collection("transfers").doc();
      t.set(logRef, {
        from: fromSnap.data().email,
        to: toSnap.data().email,
        nominal,
        date: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Transfer error ❌:", err);
    return res.status(500).json({ error: err.message });
  }
}
