// /public/js/controller.js
// Pengendali utama: Firebase (profil/saldo), picker (warna), game-core, dan NetSync

import "./firebase-boot.js";
import "./picker.js";

let saldo = 0;
let isAdmin = false;

const PRICE_COLOR = 10000;
const PRICE_LEN = 5000;

const startBtn       = document.getElementById("startBtn");
const startLenInput  = document.getElementById("startLenInput");
const costColorEl    = document.getElementById("costColor");
const costLenEl      = document.getElementById("costLen");
const costTotalEl    = document.getElementById("costTotal");
const configPanel    = document.getElementById("configPanel");

let palette  = window.ColorPicker?.palette  || ['#ffffff'];
let selected = window.ColorPicker?.selected || [false,false,false,false,false];

function formatRp(n){ n = Math.max(0, Math.floor(Number(n)||0)); return "Rp " + n.toLocaleString("id-ID"); }
function calcCosts(){
  const len = Math.max(1, Math.min(300, parseInt(startLenInput.value || '3', 10)));
  const colorCount = selected.filter(Boolean).length;
  const cColor = colorCount * PRICE_COLOR;
  const cLen   = len * PRICE_LEN;
  return { len, colorCount, cColor, cLen, total: cColor + cLen };
}
function refreshCostUI(){
  const { cColor, cLen, total } = calcCosts();
  costColorEl.textContent = formatRp(cColor);
  costLenEl.textContent   = formatRp(cLen);
  costTotalEl.textContent = formatRp(total);
}
function refreshStartState(){
  const { total, colorCount } = calcCosts();
  const saldoCheck = isAdmin ? Number.MAX_SAFE_INTEGER : saldo;
  // ✅ admin boleh mulai tanpa pilih warna
  const can = isAdmin ? (total <= saldoCheck) : (colorCount > 0 && total <= saldoCheck);
  startBtn.disabled = !can;
}
function refreshCostsAndStart(){ refreshCostUI(); refreshStartState(); }

// === sinkron style nickname untuk nameplate
window.addEventListener("user:profile", (e)=>{
  if (window.Game?.applyProfileStyle) window.Game.applyProfileStyle(e.detail);
});

// === dari picker
window.addEventListener("color:update", (e)=>{
  palette  = e.detail.palette;
  selected = e.detail.selected;
  refreshCostsAndStart();
});

// === saldo realtime
window.addEventListener("user:saldo", (e)=>{
  saldo   = Number(e.detail.saldo || 0);
  isAdmin = !!e.detail.isAdmin;
  refreshCostsAndStart();
});

startLenInput.addEventListener("input", refreshCostsAndStart);

startBtn.addEventListener("click", async ()=>{
  const { len, colorCount, total } = calcCosts();

  if (!isAdmin && colorCount <= 0) { alert("Pilih minimal satu warna dulu!"); return; }

  const saldoCheck = isAdmin ? Number.MAX_SAFE_INTEGER : saldo;
  if (total > saldoCheck) { alert("Saldo tidak cukup!"); return; }

  const colors = palette.filter((_, i)=> selected[i]);
  if (!colors.length) colors.push("#58ff9b");

  if (!isAdmin && window.Saldo?.charge) {
    await window.Saldo.charge(total);
  }

  // Mulai game lokal
  if (window.Game?.start) window.Game.start(colors, len);

  // ✅ Mulai sinkronisasi online
  if (window.NetSync?.start) window.NetSync.start(colors, len);

  configPanel.style.display = "none";
});

document.addEventListener("DOMContentLoaded", ()=>{
  refreshCostsAndStart();
  if (window.Game?.init) window.Game.init();
});
