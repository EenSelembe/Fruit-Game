<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transfer Saldo</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #f0f2f5;
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .box {
      background: #fff;
      padding: 20px;
      border-radius: 8px;
      width: 350px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    h2 {
      margin-top: 0;
      text-align: center;
    }
    input {
      width: 100%;
      padding: 10px;
      margin: 8px 0;
      border: 1px solid #ccc;
      border-radius: 6px;
    }
    button {
      width: 100%;
      padding: 10px;
      margin-top: 12px;
      background: #4caf50;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      font-weight: bold;
      cursor: pointer;
    }
    button:hover {
      background: #43a047;
    }
  </style>
</head>
<body>
  <div class="box">
    <h2>Transfer Saldo</h2>
    <input type="text" id="fromUid" placeholder="From UID" />
    <input type="text" id="toUid" placeholder="To UID" />
    <input type="number" id="nominal" placeholder="Nominal (Rp)" />
    <button onclick="doTransfer()">Transfer</button>
  </div>

  <script>
    async function doTransfer() {
      const fromUid = document.getElementById("fromUid").value.trim();
      const toUid = document.getElementById("toUid").value.trim();
      const nominal = parseInt(document.getElementById("nominal").value.trim(), 10);

      if (!fromUid || !toUid || !nominal) {
        alert("Harap isi semua field");
        return;
      }

      try {
        const res = await fetch("/api/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromUid, toUid, nominal })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          alert("❌ Transfer gagal: " + (errData.error || res.status));
          return;
        }

        const data = await res.json();
        alert("✅ Transfer sukses: " + JSON.stringify(data));
      } catch (e) {
        alert("⚠️ Error koneksi: " + e.message);
      }
    }
  </script>
</body>
</html>
