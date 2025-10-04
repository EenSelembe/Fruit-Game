// /public/js/controller.js — Orchestrator UI (fix: admin bisa start tanpa pilih warna)
import "./firebase-boot.js";
import "./picker.js";

let saldo = 0;
let isAdmin = false;

const PRICE_COLOR = 10000;
const PRICE_LEN   = 5000;

const startBtn      = document.getElementById("startBtn");
const startLenInput = document.getElementById("startLenInput");
const costColorEl   = document.getElementById("costColor");
const costLenEl     = document.getElementById("costLen");
const costTotalEl   = document.getElementById("costTotal");
const configPanel   = document.getElementById("configPanel");

let palette  = window.ColorPicker?.palette  || ['#ffffff','#ffffff','#ffffff','#ffffff','#ffffff'];
let selected = window.ColorPicker?.selected || [false,false,false,false,false];

function formatRp(n){
  n = Math.max(0, Math.floor(Number(n)||0));
  return "Rp " + n.toLocaleString("id-ID");
}
function calcCosts(){
  const len = Math.max(1, Math.min(300, parseInt(startLenInput?.value || '3', 10)));
  const colorCount = selected.filter(Boolean).length;
  const cColor = colorCount * PRICE_COLOR;
  const cLen   = len * PRICE_LEN;
  return { len, colorCount, cColor, cLen, total: cColor + cLen };
}
function refreshCostUI(){
  const { cColor, cLen, total } = calcCosts();
  if (costColorEl) costColorEl.textContent = formatRp(cColor);
  if (costLenEl)   costLenEl.textContent   = formatRp(cLen);
  if (costTotalEl) costTotalEl.textContent = formatRp(total);
}
function refreshStartState(){
  const { total, colorCount } = calcCosts();
  const saldoCheck = isAdmin ? Number.MAX_SAFE_INTEGER : saldo;
  // ✅ Admin boleh start tanpa memilih warna
  const can = (isAdmin || colorCount > 0) && total <= saldoCheck;
  if (startBtn) startBtn.disabled = !can;
}
function refreshCostsAndStart(){
  refreshCostUI();
  refreshStartState();
}

window.addEventListener("color:update", (e)=>{
  palette  = e.detail.palette;
  selected = e.detail.selected;
  refreshCostsAndStart();
});

window.addEventListener("user:saldo", (e)=>{
  saldo   = Number(e.detail.saldo || 0);
  isAdmin = !!e.detail.isAdmin;
  refreshCostsAndStart();
});

window.addEventListener("user:profile", (e)=>{
  if (window.Game?.applyProfileStyle) window.Game.applyProfileStyle(e.detail);
});

startLenInput?.addEventListener("input", refreshCostsAndStart);

startBtn?.addEventListener("click", async ()=>{
  const { len, colorCount, total } = calcCosts();

  // ✅ Admin skip validasi “harus pilih warna”
  if (!isAdmin && colorCount <= 0) {
    alert("Pilih minimal satu warna dulu!");
    return;
  }

  const saldoCheck = isAdmin ? Number.MAX_SAFE_INTEGER : saldo;
  if (total > saldoCheck) {
    alert("Saldo tidak cukup!");
    return;
  }

  // Ambil warna (admin tak butuh; game-core akan override jadi pelangi)
  const colors = isAdmin ? [] : palette.filter((_, idx)=> selected[idx]);
  if (!colors.length && !isAdmin) colors.push("#58ff9b");

  if (!isAdmin && window.Saldo?.charge) {
    await window.Saldo.charge(total);
  }

  if (window.Game?.start) window.Game.start(colors, len);
  if (configPanel) configPanel.style.display = "none";
});

// Init
document.addEventListener("DOMContentLoaded", ()=>{
  refreshCostsAndStart();
  if (window.Game?.init) window.Game.init();
});
