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

// Toast helper (aman bila GameUI belum ada)
const toast = (msg, dur=1200) => window.GameUI?.showToast?.(msg, dur);

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
  // guard kalau belum init
  if (!window.Game || typeof window.Game.start !== "function") {
    toast("Game belum siap, sebentar...", 1200);
    return;
  }

  const { len, total } = calcCosts();
  let colors = getSelectedColors();
  if (isAdmin) colors = RAINBOW; // admin pelangi

  // lock tombol agar tidak double-klik
  const oldText = startBtn.textContent;
  startBtn.disabled = true;
  startBtn.textContent = "Memulai...";

  try {
    // potong saldo (kecuali admin)
    if (!isAdmin && window.Saldo?.charge) {
      await window.Saldo.charge(total);
    }

    // start game lokal
    window.Game.start(colors, len);
    lastPurchase = { colors, len, total };

    // sync online (jangan halangi game kalau gagal)
    try {
      NetSync.start(colors, len);
    } catch (e) {
      console.warn("[NetSync] start gagal:", e);
      toast("Mode online gagal, tetap lanjut offline", 1500);
    }

    // tutup panel & feedback
    if (configPanel) configPanel.style.display = "none";
    toast("Game dimulai!", 1000);

  } catch (err) {
    console.error("Start gagal:", err);
    toast(err?.message || "Start gagal. Cek saldo atau koneksi.", 1600);
    // jika gagal, jangan ubah UI panel
  } finally {
    startBtn.textContent = oldText;
    refreshCostsAndStart(); // set enabled/disabled sesuai kondisi terakhir
  }
});

// ==== Tombol RESET (header) ====
if (resetBtn) {
  resetBtn.addEventListener("click", async ()=>{
    try {
      if (lastPurchase && !isAdmin && window.Saldo?.charge) {
        await window.Saldo.charge(lastPurchase.total);
      }
      if (window.Game?.quickReset) window.Game.quickReset();
      toast("Reset!", 900);
    } catch (e) {
      console.error("Reset gagal:", e);
      toast(e?.message || "Reset gagal.", 1200);
    }
  });
}

// ==== Inisialisasi awal ====
// Pastikan Game.init() benar-benar terpanggil meskipun urutan module berubah.
document.addEventListener("DOMContentLoaded", () => {
  refreshCostsAndStart();

  const tryInit = () => {
    if (window.Game && typeof window.Game.init === "function") {
      window.Game.init();
      return;
    }
    // cek ulang tiap 100ms sampai Game tersedia
    setTimeout(tryInit, 100);
  };
  tryInit();
});
