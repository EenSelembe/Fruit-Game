// notif.js
let notifQueue = [];
let isShowing = false;

export function showWinNotif(nickname, amount) {
  notifQueue.push({
    nickname,
    amount: Number(amount).toLocaleString('id-ID')
  });
  processQueue();
}

function processQueue() {
  if (isShowing || notifQueue.length === 0) return;

  isShowing = true;
  const { nickname, amount } = notifQueue.shift();
  const container = document.getElementById('notifContainer');
  if (!container) {
    isShowing = false;
    return;
  }

  const el = document.createElement('div');
  el.className = 'notif';
  el.textContent = `${nickname} memenangkan Rp. ${amount}`;
  container.appendChild(el);

  setTimeout(() => {
    el.remove();
    isShowing = false;
    processQueue();
  }, 6000);
}
