// /public/js/controller.js — kontrol UI + biaya + reset charge + hubungkan ke Game & Firebase

import "./firebase-boot.js";
import "./picker.js";

// ==== Harga ====
const PRICE_COLOR = 10000;
const PRICE_LEN   = 5000;

// ==== State dasar ====
let saldo = 0;
let isAdmin = false;
let palette = window.ColorPicker?.palette || ['#58ff9b', '#ffffff', '#ffffff', '#ffffff', '#ffffff'];
let selected = window.ColorPicker?.selected || [true,false,false,false,false];
let lastStartCost = 0;   // disimpan untuk dipotong ulang saat Reset
let lastStartLen  = 3;   // untuk quick reset
let lastColors    = ['#58ff9b'];

// ==== Elemen UI ====
const startBtn       = document.getElementById("startBtn");
const startLenInput  = document.getElementById("startLenInput");
const costColorEl    = document.getElementById("costColor");
const costLenEl      = document.getElementById("costLen");
const costTotalEl    = document.getElementById("costTotal");
const configPanel    = document.getElementById("configPanel");
const resetBtn       = document.getElementById("reset");

// ==== Util ====
function formatRp(n){ n = Math.max(0, Math.floor(Number(n)||0)); return "Rp " + n.toLocaleString("id-ID"); }
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
  // Admin boleh mulai tanpa memilih warna
  const can = (isAdmin || colorCount > 0) && total <= saldoCheck;
  startBtn.disabled = !can;
}
function refreshCostsAndStart(){ refreshCostUI(); refreshStartState(); }

// ==== Event: picker warna ====
window.addEventListener("color:update", (e) => {
  palette  = e.detail.palette;
  selected = e.detail.selected;
  refreshCostsAndStart();
});

// ==== Event: Firebase saldo & profil ====
window.addEventListener("user:saldo", (e) => {
  saldo   = Number(e.detail.saldo || 0);
  isAdmin = !!e.detail.isAdmin;
  refreshCostsAndStart();
});
window.addEventListener("user:profile", (e) => {
  // kirim style ke game agar nameplate konsisten
  if (window.Game?.applyProfileStyle) window.Game.applyProfileStyle(e.detail);
});

// ==== Input ====
startLenInput.addEventListener("input", refreshCostsAndStart);

// ==== Mulai ====
startBtn.addEventListener("click", async () => {
  const { len, colorCount, total } = calcCosts();

  // Admin: selalu bisa, gratis & warna paksa pelangi di game-core
  if (!isAdmin) {
    if (colorCount <= 0) { alert("Pilih minimal satu warna dulu!"); return; }
    if (total > saldo)   { alert("Saldo tidak cukup!"); return; }
  }

  // siapkan warna yang dipilih
  let colors = palette.filter((_, idx) => selected[idx]);
  if (!colors.length) colors = ["#58ff9b"];

  // potong saldo saat mulai (kecuali admin)
  if (!isAdmin && window.Saldo?.charge) {
    try { await window.Saldo.charge(total); }
    catch(_) {}
  }

  // simpan biaya & param untuk reset nanti
  lastStartCost = isAdmin ? 0 : total;
  lastStartLen  = len;
  lastColors    = colors.slice();

  // mulai game
  if (window.Game?.start) window.Game.start(colors, len);

  // tutup panel
  if (configPanel) configPanel.style.display = "none";
});

// ==== Reset (potong ulang biaya start & tetap satu dunia) ====
if (resetBtn) resetBtn.addEventListener("click", async () => {
  // potong sesuai biaya start sebelumnya (kecuali admin / belum pernah start)
  if (!isAdmin && lastStartCost > 0 && window.Saldo?.charge) {
    try { await window.Saldo.charge(lastStartCost); } catch(_) {}
  }
  if (window.Game?.quickReset) window.Game.quickReset();
});

// ==== Init ====
document.addEventListener("DOMContentLoaded", () => {
  refreshCostsAndStart();
  if (window.Game?.init) window.Game.init();
});
