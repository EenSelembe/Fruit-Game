// controller.js — pengendali utama Snake.io
// Menggabungkan: Firebase (profil/saldo), picker (warna), dan game-core

import "./firebase-boot.js";
import "./picker.js";

// ==== Variabel dasar ====
let saldo = 0;
let isAdmin = false;
let colorCount = 0;
let totalCost = 0;
let startLen = 3;

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

// Ambil data dari window.ColorPicker
let palette = window.ColorPicker?.palette || ['#ffffff'];
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
  const { cColor, cLen, total } = calcCosts();
  costColorEl.textContent = formatRp(cColor);
  costLenEl.textContent = formatRp(cLen);
  costTotalEl.textContent = formatRp(total);
}
function refreshStartState() {
  const { total, colorCount } = calcCosts();
  const saldoCheck = isAdmin ? Number.MAX_SAFE_INTEGER : saldo;
  const can = colorCount > 0 && total <= saldoCheck;
  startBtn.disabled = !can;
}
function refreshCostsAndStart() {
  refreshCostUI();
  refreshStartState();
}

// ==== Event dari picker (update warna) ====
window.addEventListener("color:update", (e) => {
  palette = e.detail.palette;
  selected = e.detail.selected;
  refreshCostsAndStart();
});

// ==== Event dari Firebase (saldo realtime) ====
window.addEventListener("user:saldo", (e) => {
  saldo = Number(e.detail.saldo || 0);
  isAdmin = e.detail.isAdmin;
  refreshCostsAndStart();
});

// ==== Tombol start ====
startLenInput.addEventListener("input", () => {
  refreshCostsAndStart();
});

startBtn.addEventListener("click", async () => {
  const { len, colorCount, total } = calcCosts();
  if (colorCount <= 0) {
    alert("Pilih minimal satu warna dulu!");
    return;
  }
  const saldoCheck = isAdmin ? Number.MAX_SAFE_INTEGER : saldo;
  if (total > saldoCheck) {
    alert("Saldo tidak cukup!");
    return;
  }

  const colors = palette.filter((_, idx) => selected[idx]);
  if (!colors.length) colors.push("#58ff9b");

  // potong saldo (kalau bukan admin)
  if (!isAdmin && window.Saldo?.charge) {
    await window.Saldo.charge(total);
  }

  // panggil game-core
  if (window.Game && typeof window.Game.start === "function") {
    window.Game.start(colors, len);
  }

  configPanel.style.display = "none";
});

// ==== Inisialisasi awal ====
document.addEventListener("DOMContentLoaded", () => {
  refreshCostsAndStart();
});
