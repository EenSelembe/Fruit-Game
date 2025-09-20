// pages/api/transfer.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { fromUid, toUid, nominal } = req.body;
    if (!fromUid || !toUid || !nominal) {
      return res.status(400).json({ error: "Data tidak lengkap" });
    }

    // TODO: logika Firestore kamu
    console.log("Transfer request:", fromUid, "->", toUid, ":", nominal);

    return res.status(200).json({ success: true, message: "Transfer berhasil (dummy)" });
  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
