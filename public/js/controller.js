// /public/js/controller.js — pengendali utama Snake.io
// Integrasi Firebase (profil/saldo), picker (warna), game-core, dan NetSync.
// Fitur:
// - Start butuh saldo (kecuali admin), biaya: warna*10k + panjang*5k
// - Admin: ular pelangi (tak bisa ganti warna)
// - Reset: memotong saldo lagi sesuai biaya awal mulai (kecuali admin) + tetap 1 peta

import "./firebase-boot.js";
import "./picker.js";
import NetSync from "./net-sync.js";

// ==== Konstanta harga ====
const PRICE_COLOR = 10000;
const PRICE_LEN   = 5000;

// ==== State dasar ====
let saldo = 0;
let isAdmin = false;

// simpan pembelian terakhir agar Reset memotong ulang
let lastPurchase = null; // { colors, len, total }

// Ambil elemen UI
const startBtn       = document.getElementById("startBtn");
const startLenInput  = document.getElementById("startLenInput");
const costColorEl    = document.getElementById("costColor");
const costLenEl      = document.getElementById("costLen");
const costTotalEl    = document.getElementById("costTotal");
const configPanel    = document.getElementById("configPanel");
const resetBtn       = document.getElementById("reset");

// Data dari ColorPicker
let palette  = window.ColorPicker?.palette  || ['#ffffff','#ffffff','#ffffff','#ffffff','#ffffff'];
let selected = window.ColorPicker?.selected || [false,false,false,false,false];

// Rainbow admin (body stripes)
const RAINBOW = ["#ff0055","#ff7b00","#ffee00","#00d26a","#00b3ff","#6950ff"];

// ==== Helpers ====
function formatRp(n){ n = Math.max(0, Math.floor(Number(n)||0)); return "Rp " + n.toLocaleString("id-ID"); }
function getSelectedColors(){
  const cols = palette.filter((_, idx) => selected[idx]);
  return cols.length ? cols : ["#58ff9b"];
}
function calcCosts() {
  const len = Math.max(1, Math.min(300, parseInt(startLenInput.value || '3', 10)));
  const colorCount = selected.filter(Boolean).length;
  const cColor = colorCount * PRICE_COLOR;
  const cLen   = len * PRICE_LEN;
  return { len, colorCount, cColor, cLen, total: cColor + cLen };
}
function refreshCostUI() {
  const { cColor, cLen, total } = calcCosts();
  costColorEl.textContent = formatRp(cColor);
  costLenEl.textContent   = formatRp(cLen);
  costTotalEl.textContent = formatRp(total);
}
function refreshStartState() {
  const { total, colorCount } = calcCosts();
  const saldoCheck = isAdmin ? Number.MAX_SAFE_INTEGER : saldo;
  const can = (isAdmin || colorCount > 0) && total <= saldoCheck;
  startBtn.disabled = !can;
}
function refreshCostsAndStart() { refreshCostUI(); refreshStartState(); }

// ==== Event dari picker ====
window.addEventListener("color:update", (e) => {
  palette  = e.detail.palette;
  selected = e.detail.selected;
  refreshCostsAndStart();
});

// ==== Event dari Firebase (saldo & profile) ====
window.addEventListener("user:saldo", (e) => {
  saldo   = Number(e.detail.saldo || 0);
  isAdmin = !!e.detail.isAdmin;
  refreshCostsAndStart();
});
window.addEventListener("user:profile", (e) => {
  // Teruskan ke canvas (nameplate warna & border per-snake)
  if (window.Game?.applyProfileStyle) {
    window.Game.applyProfileStyle(e.detail);
  }
});

// ==== Input panjang ====
startLenInput.addEventListener("input", refreshCostsAndStart);

// ==== Tombol START ====
startBtn.addEventListener("click", async () => {
  const { len, total } = calcCosts();

  let colors = getSelectedColors();
  if (isAdmin) colors = RAINBOW; // admin pelangi

  // potong saldo (kecuali admin)
  if (!isAdmin && window.Saldo?.charge) {
    await window.Saldo.charge(total);
  }

  // start game lokal
  if (window.Game && typeof window.Game.start === "function") {
    window.Game.start(colors, len);
  }
  // catat last purchase utk reset
  lastPurchase = { colors, len, total };

  // start sync online
  NetSync.start(colors, len);

  // tutup panel
  configPanel.style.display = "none";
});

// ==== Tombol RESET ====
if (resetBtn) {
  resetBtn.addEventListener("click", async ()=>{
    if (lastPurchase && !isAdmin && window.Saldo?.charge) {
      await window.Saldo.charge(lastPurchase.total);
    }
    if (window.Game?.quickReset) window.Game.quickReset();
    // NetSync tetap jalan; publish state baru akan mengikuti Game.getPlayerState()
  });
}

// ==== Inisialisasi awal ====
document.addEventListener("DOMContentLoaded", () => {
  refreshCostsAndStart();
  if (window.Game && typeof window.Game.init === "function") {
    window.Game.init();
  }
});
