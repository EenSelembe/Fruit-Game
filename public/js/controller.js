<script type="module">
// controller.js — pengendali utama Snake.io
// Menggabungkan: Firebase (profil/saldo), picker (warna), dan game-core

import "./firebase-boot.js";
import "./picker.js";
import "./game-core.js";

// ==== Variabel dasar ====
let saldo = 0;
let isAdmin = false;

// Harga tetap
const PRICE_COLOR = 10000;
const PRICE_LEN = 5000;

// Ambil elemen UI
const startBtn = document.getElementById("startBtn");
const startLenInput = document.getElementById("startLenInput");
const costColorEl = document.getElementById("costColor");
const costLenEl = document.getElementById("costLen");
const costTotalEl = document.getElementById("costTotal");
const configPanel = document.getElementById("configPanel");

// Ambil data dari ColorPicker
let palette = window.ColorPicker?.palette || ['#ffffff','#ffffff','#ffffff','#ffffff','#ffffff'];
let selected = window.ColorPicker?.selected || [false,false,false,false,false];

// ==== Fungsi bantu ====
function formatRp(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  return "Rp " + n.toLocaleString("id-ID");
}

function calcCosts() {
  const len = Math.max(1, Math.min(300, parseInt(startLenInput.value || '3', 10)));
  const colorCount = selected.filter(Boolean).length;
  const cColor = colorCount * PRICE_COLOR;
  const cLen = len * PRICE_LEN;
  return { len, colorCount, cColor, cLen, total: cColor + cLen };
}

function refreshCostUI() {
  if (isAdmin) {
    costColorEl.textContent = "Rp 0";
    costLenEl.textContent = "Rp 0";
    costTotalEl.textContent = "Rp 0";
    return;
  }
  const { cColor, cLen, total } = calcCosts();
  costColorEl.textContent = formatRp(cColor);
  costLenEl.textContent = formatRp(cLen);
  costTotalEl.textContent = formatRp(total);
}

function refreshStartState() {
  if (isAdmin) {
    startBtn.disabled = false;     // admin selalu bisa mulai
    return;
  }
  const { total, colorCount } = calcCosts();
  const saldoCheck = saldo;
  const can = colorCount > 0 && total <= saldoCheck;
  startBtn.disabled = !can;
}

function refreshCostsAndStart() {
  refreshCostUI();
  refreshStartState();
}

// Non-admin boleh pilih warna. Admin: kunci palette (tidak bisa diganti)
function applyAdminUIState() {
  const boxes = document.querySelectorAll(".colorBox");
  boxes.forEach(b=>{
    b.style.pointerEvents = isAdmin ? "none" : "auto";
    if (isAdmin) b.classList.remove("selected");
  });
  const hint = document.querySelector(".hint");
  if (hint) {
    hint.textContent = isAdmin
      ? "Mode ADMIN: ular pelangi menyala, gratis, warna tidak bisa diubah."
      : "Start aktif jika minimal satu warna dipilih & saldo cukup.";
  }
}

// ==== Sinkron nickname & style dari Firebase ke canvas nameplate ====
window.addEventListener("user:profile", (e) => {
  if (window.Game && typeof window.Game.applyProfileStyle === "function") {
    window.Game.applyProfileStyle(e.detail);
  }
});

// ==== Event dari picker (update warna) ====
window.addEventListener("color:update", (e) => {
  if (isAdmin) return; // admin diabaikan
  palette = e.detail.palette;
  selected = e.detail.selected;
  refreshCostsAndStart();
});

// ==== Event dari Firebase (saldo + admin realtime) ====
window.addEventListener("user:saldo", (e) => {
  saldo = Number(e.detail.saldo || 0);
  isAdmin = !!e.detail.isAdmin;
  applyAdminUIState();
  refreshCostsAndStart();
});

// ==== Tombol start ====
startLenInput.addEventListener("input", () => {
  refreshCostsAndStart();
});

startBtn.addEventListener("click", async () => {
  // Panjang awal tetap bisa dipilih admin/non-admin
  const len = Math.max(1, Math.min(300, parseInt(startLenInput.value || '3', 10)));

  if (!isAdmin) {
    const { colorCount, total } = calcCosts();
    if (colorCount <= 0) {
      alert("Pilih minimal satu warna dulu!");
      return;
    }
    if (total > saldo) {
      alert("Saldo tidak cukup!");
      return;
    }
    // potong saldo (kalau bukan admin)
    if (window.Saldo?.charge) {
      await window.Saldo.charge(total);
    }
  }

  // Tentukan warna untuk non-admin; admin akan diabaikan oleh engine (dipaksa pelangi)
  const colors = isAdmin
    ? []  // diabaikan, engine akan pakai pelangi
    : palette.filter((_, idx) => selected[idx]).filter(Boolean);

  if (!isAdmin && !colors.length) colors.push("#58ff9b");

  // mulai game
  if (window.Game && typeof window.Game.start === "function") {
    window.Game.start(colors, len);
  }

  configPanel.style.display = "none";
});

// ==== Inisialisasi ====
document.addEventListener("DOMContentLoaded", () => {
  applyAdminUIState();
  refreshCostsAndStart();
  if (window.Game && typeof window.Game.init === "function") {
    window.Game.init();  // inisialisasi canvas + kamera
  }
});
</script>
