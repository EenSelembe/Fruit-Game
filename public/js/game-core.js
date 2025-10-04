// game-core.js — Snake.io smooth + multi buah + warna + nickname sinkron
// menerima window.Game.startGame(colors, startLen)

window.Game = (function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const rankPanel = document.getElementById("rankPanel");
  const lenEl = document.getElementById("len");
  const userCountEl = document.getElementById("userCount");

  // ====== Canvas setup ======
  let W, H;
  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  // ====== Game state ======
  let snake = [];
  let foods = [];
  let angle = 0;
  let vel = 2.6;
  let grow = 0;
  let running = false;
  let usernameStyle = null;

  // ====== Gambar buah ======
  const fruitImgs = {};
  const fruitList = [
    "🍎", "🍊", "🍇", "🍉", "🍓", "🍒", "🍌", "🍍", "🥭", "🍋", "🥝"
  ];

  function spawnFruit() {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const emoji = fruitList[Math.floor(Math.random() * fruitList.length)];
    foods.push({ x, y, emoji });
  }

  // spawn awal buah banyak
  function initFoods() {
    foods = [];
    for (let i = 0; i < 25; i++) spawnFruit();
  }

  // ====== Kontrol Joystick ======
  const joy = document.getElementById("joy");
  const knob = document.getElementById("knob");
  let joyActive = false;
  let joyStart = { x: 0, y: 0 };

  function setupJoystick() {
    const joyRect = joy.getBoundingClientRect();
    const cx = joyRect.left + joyRect.width / 2;
    const cy = joyRect.top + joyRect.height / 2;

    function moveKnob(e) {
      const rect = joy.getBoundingClientRect();
      const touch = e.touches ? e.touches[0] : e;
      const dx = touch.clientX - cx;
      const dy = touch.clientY - cy;
      const dist = Math.min(40, Math.sqrt(dx * dx + dy * dy));
      const ang = Math.atan2(dy, dx);
      knob.style.transform = `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px)`;
      angle = ang;
    }

    joy.addEventListener("touchstart", (e) => {
      joyActive = true;
      moveKnob(e);
    });
    joy.addEventListener("touchmove", (e) => {
      if (joyActive) moveKnob(e);
    });
    joy.addEventListener("touchend", () => {
      joyActive = false;
      knob.style.transform = "translate(0,0)";
    });
  }

  setupJoystick();

  // ====== Gambar nickname ======
  function drawNickname(x, y) {
    if (!window.App?.profileStyle) return;
    const u = window.App.profileStyle;
    const name = u.name || "User";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = u.color || "#fff";
    ctx.fillText(name, x, y - 12);
  }

  // ====== Loop ======
  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(0, 0, W, H);

    // update posisi
    const head = snake[0];
    const newX = head.x + Math.cos(angle) * vel;
    const newY = head.y + Math.sin(angle) * vel;
    snake.unshift({ x: newX, y: newY });
    if (grow > 0) {
      grow--;
    } else {
      snake.pop();
    }

    // collision buah
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      const dx = f.x - head.x;
      const dy = f.y - head.y;
      if (dx * dx + dy * dy < 25 * 25) {
        foods.splice(i, 1);
        spawnFruit();
        grow += 10;
        eaten++;
        if (eaten % 10 === 0) {
          size += 1.2;
        }
        lenEl.textContent = snake.length.toString();
      }
    }

    // batasi panjang array agar ringan
    if (snake.length > 1000) snake.splice(1000);

    // gambar buah
    ctx.font = "28px serif";
    foods.forEach((f) => {
      ctx.fillText(f.emoji, f.x, f.y);
    });

    // gambar ular
    for (let i = snake.length - 1; i >= 0; i--) {
      const seg = snake[i];
      const color = colors[i % colors.length];
      const sz = size * (1 + i / (snake.length * 5));
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(seg.x, seg.y, sz, 0, Math.PI * 2);
      ctx.fill();
    }

    // kepala & nickname
    const headPos = snake[0];
    drawNickname(headPos.x, headPos.y);
  }

  // ====== Start ======
  let colors = ["#58ff9b"];
  let size = 6;
  let eaten = 0;

  function startGame(selectedColors, startLen) {
    colors = selectedColors.length ? selectedColors : ["#58ff9b"];
    size = 6;
    eaten = 0;
    grow = 0;
    angle = 0;
    snake = [];

    // posisi awal di tengah
    const x0 = W / 2;
    const y0 = H / 2;
    for (let i = 0; i < startLen; i++) {
      snake.push({ x: x0 - i * 8, y: y0 });
    }

    initFoods();
    lenEl.textContent = startLen;
    running = true;
    loop();
  }

  return { startGame };
})();
