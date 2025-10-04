// controller.js — menyatukan Firebase (profil/saldo), picker, game, dan networking

import "./firebase-boot.js";
import "./picker.js";

let saldo = 0;
let isAdmin = false;

const PRICE_COLOR = 10000;
const PRICE_LEN = 5000;

const startBtn = document.getElementById("startBtn");
const startLenInput = document.getElementById("startLenInput");
const costColorEl = document.getElementById("costColor");
const costLenEl = document.getElementById("costLen");
const costTotalEl = document.getElementById("costTotal");
const configPanel = document.getElementById("configPanel");

let palette = window.ColorPicker?.palette || ['#ffffff'];
let selected = window.ColorPicker?.selected || [false,false,false,false,false];

function formatRp(n){ n=Math.max(0,Math.floor(Number(n)||0)); return "Rp "+n.toLocaleString("id-ID"); }
function calcCosts(){
  const len = Math.max(1, Math.min(300, parseInt(startLenInput.value || '3', 10)));
  const colorCount = selected.filter(Boolean).length;
  const cColor = colorCount * PRICE_COLOR;
  const cLen = len * PRICE_LEN;
  return { len, colorCount, cColor, cLen, total:cColor+cLen };
}
function refreshCostUI(){ const {cColor,cLen,total}=calcCosts(); costColorEl.textContent=formatRp(cColor); costLenEl.textContent=formatRp(cLen); costTotalEl.textContent=formatRp(total); }
function refreshStartState(){
  const { total, colorCount } = calcCosts();
  const saldoCheck = isAdmin ? Number.MAX_SAFE_INTEGER : saldo;
  // admin tidak butuh pilih warna (auto pelangi) -> tetap aktif
  const can = (isAdmin ? true : (colorCount > 0)) && total <= saldoCheck;
  startBtn.disabled = !can;
}
function refreshCostsAndStart(){ refreshCostUI(); refreshStartState(); }

window.addEventListener("color:update", (e)=>{ palette=e.detail.palette; selected=e.detail.selected; refreshCostsAndStart(); });

window.addEventListener("user:saldo",(e)=>{ saldo=Number(e.detail.saldo||0); isAdmin=!!e.detail.isAdmin; refreshCostsAndStart(); });

// Terima style & uid untuk Game + Net
window.addEventListener("user:profile",(e)=>{
  const style = e.detail || {};
  if (window.Game?.applyProfileStyle) window.Game.applyProfileStyle(style);
  const uid = window.App?.profile?.id;
  if (uid && window.Game?.setLocalIdentity) window.Game.setLocalIdentity(uid);

  // Start networking setelah kita punya uid
  if (uid && window.Net?.start) {
    window.Net.start({
      uid,
      isAdmin: (uid===window.App?.ADMIN_UID),
      name: style.name || "USER",
      // hook ke Game
      upsertRemote: (rid, state)=>window.Game.upsertRemote(rid, state),
      removeRemote: (rid)=>window.Game.removeRemote(rid),
      replaceOfflineBots: (list)=>window.Game.replaceOfflineBots(list),
      getPublishStates: ()=>window.Game.getPublishStates()
    });
  }
});

startLenInput.addEventListener("input", refreshCostsAndStart);

startBtn.addEventListener("click", async ()=>{
  const { len, colorCount, total } = calcCosts();
  const saldoCheck = isAdmin ? Number.MAX_SAFE_INTEGER : saldo;

  if (!isAdmin && colorCount <= 0) { alert("Pilih minimal satu warna dulu!"); return; }
  if (total > saldoCheck) { alert("Saldo tidak cukup!"); return; }

  let colors = [];
  if (isAdmin) {
    // admin: warna diabaikan (di Game dipaksa pelangi). tetap kirim 1 warna placeholder.
    colors = ["#58ff9b"];
  } else {
    colors = palette.filter((_, idx)=>selected[idx]);
    if (!colors.length) colors = ["#58ff9b"];
  }

  if (!isAdmin && window.Saldo?.charge) await window.Saldo.charge(total);

  if (window.Game && typeof window.Game.start === "function") window.Game.start(colors, len);
  configPanel.style.display = "none";
});

document.addEventListener("DOMContentLoaded", ()=>{
  refreshCostsAndStart();
  if (window.Game?.init) window.Game.init();
});
