// Orkestrator: hubungkan saldo+profil ↔ picker ↔ game
import { showToast, formatRupiah } from './helpers.js';
import { initSaldo, charge, isAdmin } from './saldo.js';
import { startMatch, resetMatch, setNameStyle } from './game-core.js';
import { initPicker, setBudget, bindStart, openConfig, closeConfig } from './picker.js';

// Saat tidak login → balik ke index
function redirectNoAuth(){
  showToast("Silakan login dulu melalui Home.", 2500);
  setTimeout(()=>window.location.href="index.html",1200);
}

// Inisialisasi picker (biaya) + tombol Start
initPicker({
  onChange: ()=>{} // tidak perlu apa2, hanya supaya biaya selalu update
});

// Sync saldo realtime → update badge & enable Start
initSaldo({
  onSaldoChange: (saldo, admin)=>{
    const s = admin ? "∞" : formatRupiah(saldo);
    const elSaldo = document.getElementById('saldo');
    const elSaldoModal = document.getElementById('saldoInModal');
    if (elSaldo) elSaldo.textContent = s;
    if (elSaldoModal) elSaldoModal.textContent = s;
    setBudget(saldo, admin);
  },
  onProfileChange: (nick)=>{
    // nick: { name, color, styleString, borderColorCanvas }
    const usernameSpan = document.getElementById('usernameSpan');
    if (usernameSpan){
      usernameSpan.setAttribute('style', nick.styleString);
      usernameSpan.textContent = nick.name;
    }
    setNameStyle(nick); // untuk nameplate di canvas
  },
  onNoAuthRedirect: redirectNoAuth
});

// Tampilkan config saat halaman dibuka
openConfig();

// Klik Start → cek budget & potong saldo → mulai game
bindStart(async ({ len, colorCount, total, colors })=>{
  if (colorCount<=0){ showToast('Pilih minimal satu warna.'); return; }
  if (!isAdmin() && document.getElementById('saldo').textContent !== '∞'){
    // Safety tambahan: kalau saldo belum cukup
    // (setBudget sudah mematikan tombol, tapi ini guard tambahan)
  }
  await charge(total);
  startMatch(colors.length?colors:['#58ff9b'], len);
  closeConfig();
  showToast(`Mulai! Dipotong ${formatRupiah(total)} (${colorCount} warna + panjang ${len}).`, 1800);
});

// Reset button sudah di-handle di game-core (listener)
