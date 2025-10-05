// /public/js/controller.js
// Pengendali utama: biaya, start, sinkron profil → Game, dan mulai NetSync

// ==== State dasar ====
let saldo   = 0;
let isAdmin = false;

// Harga (user biasa)
const PRICE_COLOR = 10000;
const PRICE_LEN   = 5000;

// Elemen UI
const startBtn      = document.getElementById("startBtn");
const startLenInput = document.getElementById("startLenInput");
const costColorEl   = document.getElementById("costColor");
const costLenEl     = document.getElementById("costLen");
const costTotalEl   = document.getElementById("costTotal");
const configPanel   = document.getElementById("configPanel");
const paletteEl     = document.getElementById("palette");

// Data dari ColorPicker
let palette  = (window.ColorPicker && window.ColorPicker.palette)  || ['#ffffff','#ffffff','#ffffff','#ffffff','#ffffff'];
let selected = (window.ColorPicker && window.ColorPicker.selected) || [false,false,false,false,false];

// ==== Utils ====
function formatRp(n){
  n = Math.max(0, Math.floor(Number(n)||0));
  return "Rp " + n.toLocaleString("id-ID");
}

function calcCosts(){
  const len = Math.max(1, Math.min(300, parseInt(startLenInput.value || '3', 10)));
  const colorCount = selected.filter(Boolean).length;

  // Admin gratis & warna terkunci (pelangi di Game), jadi nol semua.
  if (isAdmin) {
    return { len, colorCount, cColor: 0, cLen: 0, total: 0 };
  }

  const cColor = colorCount * PRICE_COLOR;
  const cLen   = len * PRICE_LEN;
  return { len, colorCount, cColor, cLen, total: cColor + cLen };
}

function refreshCostUI(){
  const { cColor, cLen, total } = calcCosts();

  costColorEl.textContent = formatRp(cColor);
  costLenEl.textContent   = formatRp(cLen);
  costTotalEl.textContent = formatRp(total);

  // Kunci UI warna untuk admin (tidak bisa pilih warna)
  if (paletteEl) {
    if (isAdmin) {
      paletteEl.style.pointerEvents = "none";
      paletteEl.style.opacity = "0.5";
    } else {
      paletteEl.style.pointerEvents = "auto";
      paletteEl.style.opacity = "1";
    }
  }
}

function refreshStartState(){
  const { total, colorCount } = calcCosts();
  const saldoCheck = isAdmin ? Number.POSITIVE_INFINITY : saldo;

  // Admin: selalu bisa mulai (abaikan warna & saldo)
  const can = isAdmin ? true : (colorCount > 0 && total <= saldoCheck);
  startBtn.disabled = !can;
}

function refreshCostsAndStart(){
  refreshCostUI();
  refreshStartState();
}

// ==== Event dari Color Picker ====
window.addEventListener("color:update", (e) => {
  palette  = e.detail.palette;
  selected = e.detail.selected;
  refreshCostsAndStart();
});

// ==== Event dari Firebase (saldo & role) ====
window.addEventListener("user:saldo", (e) => {
  saldo   = Number(e.detail.saldo || 0);
  isAdmin = !!e.detail.isAdmin;
  refreshCostsAndStart();
});

// ==== Event dari Firebase (style/nickname) → kirim ke Game ====
window.addEventListener("user:profile", (e) => {
  // Pastikan nameplate di kepala ular sesuai profil
  window.Game?.applyProfileStyle?.(e.detail);
});

// ==== Interaksi UI ====
startLenInput.addEventListener("input", refreshCostsAndStart);

startBtn.addEventListener("click", async () => {
  const { len, colorCount, total } = calcCosts();

  // Validasi pemain biasa
  if (!isAdmin) {
    if (colorCount <= 0) {
      alert("Pilih minimal satu warna dulu!");
      return;
    }
    if (total > saldo) {
      alert("Saldo tidak cukup!");
      return;
    }
  }

  // Tentukan warna: admin diabaikan (Game akan pakai pelangi)
  let colors = [];
  if (!isAdmin) {
    colors = palette.filter((_, idx) => selected[idx]);
    if (!colors.length) colors = ["#58ff9b"];
  }

  // Potong saldo untuk user biasa
  if (!isAdmin && window.Saldo?.charge) {
    try { await window.Saldo.charge(total); } catch (_) {}
  }

  // Mulai game lokal
  if (window.Game?.start) {
    window.Game.start(colors, len);
  }

  // Mulai publish/subscribe online
  try {
    window.NetSync?.stop?.();                  // bersihkan sesi sebelumnya (kalau ada)
    window.NetSync?.start?.(colors, len);      // publish awal + subscribe room world1
  } catch (_) {}

  // Tutup modal
  if (configPanel) configPanel.style.display = "none";
});

// ==== Inisialisasi ====
document.addEventListener("DOMContentLoaded", () => {
  // Inisialisasi engine canvas
  window.Game?.init?.();
  // Hitung biaya awal (akan dikoreksi lagi saat event user:saldo & color:update datang)
  refreshCostsAndStart();
});
