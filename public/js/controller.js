// controller.js — pengendali utama Snake.io
// Menggabungkan: Firebase (profil/saldo), picker (warna), game-core, dan (opsional) net-sync

import "./firebase-boot.js";
import "./picker.js";

// ==== Variabel dasar ====
let saldo = 0;
let isAdmin = false;

// Harga tetap
const PRICE_COLOR = 10000;
const PRICE_LEN = 5000;

// Element UI
const startBtn = document.getElementById("startBtn");
const startLenInput = document.getElementById("startLenInput");
const costColorEl = document.getElementById("costColor");
const costLenEl = document.getElementById("costLen");
const costTotalEl = document.getElementById("costTotal");
const configPanel = document.getElementById("configPanel");
const resetBtn = document.getElementById("reset");

// Ambil data dari ColorPicker (default)
let palette = window.ColorPicker?.palette || ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff"];
let selected = window.ColorPicker?.selected || [false, false, false, false, false];

// Cache style profil (untuk disalurkan ke Game)
let lastProfileStyle = null;

// Warna pelangi untuk ADMIN (full body, tidak bisa diganti)
const ADMIN_COLORS = [
  "#8a2be2", // violet
  "#4b0082", // indigo
  "#4169e1", // royal blue
  "#00ced1", // dark turquoise
  "#00fa9a", // spring green
  "#ffd700", // gold
  "#ff7f50", // coral
  "#ff1493"  // deep pink
];

// ==== Fungsi bantu ====
function formatRp(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  return "Rp " + n.toLocaleString("id-ID");
}

function calcCosts() {
  const len = Math.max(1, Math.min(300, parseInt(startLenInput.value || "3", 10)));
  const colorCount = selected.filter(Boolean).length;
  const cColor = colorCount * PRICE_COLOR;
  const cLen = len * PRICE_LEN;
  return { len, colorCount, cColor, cLen, total: cColor + cLen };
}

function refreshCostUI() {
  const { cColor, cLen, total } = calcCosts();
  costColorEl.textContent = formatRp(isAdmin ? 0 : cColor);
  costLenEl.textContent = formatRp(isAdmin ? 0 : cLen);
  costTotalEl.textContent = formatRp(isAdmin ? 0 : total);
}

function refreshStartState() {
  const { total, colorCount } = calcCosts();
  const saldoCheck = isAdmin ? Number.MAX_SAFE_INTEGER : saldo;
  // Admin: boleh start meskipun belum pilih warna (pakai pelangi)
  const can = (isAdmin ? true : (colorCount > 0 && total <= saldoCheck));
  startBtn.disabled = !can;
}

function refreshCostsAndStart() {
  refreshCostUI();
  refreshStartState();
}

// ==== Event bridge dari picker (update warna) ====
window.addEventListener("color:update", (e) => {
  palette = e.detail.palette;
  selected = e.detail.selected;
  refreshCostsAndStart();
});

// ==== Event dari Firebase (saldo + admin) ====
window.addEventListener("user:saldo", (e) => {
  saldo = Number(e.detail.saldo || 0);
  isAdmin = !!e.detail.isAdmin;
  refreshCostsAndStart();
});

// ==== Event dari Firebase (profil style → teruskan ke Game) ====
window.addEventListener("user:profile", (e) => {
  lastProfileStyle = e.detail || null;
  if (window.Game?.applyProfileStyle) window.Game.applyProfileStyle(lastProfileStyle);
});

// ==== Tombol start ====
startLenInput.addEventListener("input", refreshCostsAndStart);

startBtn.addEventListener("click", async () => {
  const { len, colorCount, total } = calcCosts();

  let colors;
  if (isAdmin) {
    // Admin pakai pelangi, abaikan pilihan user & biaya
    colors = ADMIN_COLORS.slice(0, 8);
  } else {
    if (colorCount <= 0) {
      alert("Pilih minimal satu warna dulu!");
      return;
    }
    const saldoCheck = saldo;
    if (total > saldoCheck) {
      alert("Saldo tidak cukup!");
      return;
    }
    colors = palette.filter((_, idx) => selected[idx]);
    if (!colors.length) colors.push("#58ff9b");
  }

  // potong saldo (kalau bukan admin)
  if (!isAdmin && window.Saldo?.charge) {
    await window.Saldo.charge(total);
  }

  // mulai game
  if (window.Game?.start) {
    window.Game.start(colors, len);
  }
  // sinkron online (jika net-sync.js sudah dipasang di HTML)
  if (window.NetSync?.start) {
    window.NetSync.start(colors, len);
  }

  // hide modal
  configPanel.style.display = "none";
});

// ==== Reset tombol (opsional) ====
if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    window.Game?.quickReset && window.Game.quickReset();
  });
}

// ==== Inisialisasi ====
document.addEventListener("DOMContentLoaded", () => {
  // init engine
  if (window.Game?.init) window.Game.init();
  // apply style profil (kalau sudah ada lebih dulu)
  if (lastProfileStyle && window.Game?.applyProfileStyle) {
    window.Game.applyProfileStyle(lastProfileStyle);
  }
  refreshCostsAndStart();
});

// Pastikan NetSync berhenti saat tab ditutup
addEventListener("beforeunload", () => {
  window.NetSync?.stop && window.NetSync.stop();
});
