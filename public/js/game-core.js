// game-core.js
// inti gameplay snake.io versi smooth + buah-buahan

window.Game = (function(){
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  let width, height, centerX, centerY;
  let running = false;
  let snake = [];
  let direction = {x:1, y:0};
  let speed = 2.5;
  let foods = [];
  let colors = ["#58ff9b"];
  let baseLen = 3;
  let growCount = 0;
  let nickname = "User";

  // buah-buahan emoji
  const FRUITS = ["🍎","🍌","🍇","🍊","🍓","🍉","🍍","🥝","🍒","🍋","🥭","🍐"];

  // ==== setup canvas ====
  function resize(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    width = canvas.width;
    height = canvas.height;
    centerX = width/2;
    centerY = height/2;
  }
  window.addEventListener("resize", resize);
  resize();

  // ==== buat makanan ====
  function spawnFruits(n=25){
    foods = [];
    for(let i=0;i<n;i++){
      foods.push({
        x: Math.random()*width,
        y: Math.random()*height,
        fruit: FRUITS[Math.floor(Math.random()*FRUITS.length)],
        size: 22 + Math.random()*6
      });
    }
  }

  // ==== buat ular ====
  function makeSnake(startLen){
    snake = [];
    for(let i=0;i<startLen;i++){
      snake.push({
        x: centerX - i*10,
        y: centerY,
        size: 12,
      });
    }
  }

  // ==== update posisi ====
  function update(){
    if(!running) return;
    const head = {...snake[0]};
    head.x += direction.x * speed;
    head.y += direction.y * speed;

    snake.unshift(head);
    if(growCount > 0){
      growCount--;
    }else{
      snake.pop();
    }

    // jika keluar layar → masuk sisi lain
    if(head.x < 0) head.x = width;
    if(head.x > width) head.x = 0;
    if(head.y < 0) head.y = height;
    if(head.y > height) head.y = 0;

    // cek makan buah
    for(let i=0;i<foods.length;i++){
      const f = foods[i];
      const dx = f.x - head.x;
      const dy = f.y - head.y;
      if(Math.sqrt(dx*dx + dy*dy) < f.size){
        foods.splice(i,1);
        growCount += 10;
        spawnOneFruit();
        break;
      }
    }

    // ubah ukuran tubuh tergantung panjang
    const targetSize = 10 + Math.min(40, snake.length/3);
    snake.forEach((s,i)=>{ s.size = targetSize; });
  }

  function spawnOneFruit(){
    foods.push({
      x: Math.random()*width,
      y: Math.random()*height,
      fruit: FRUITS[Math.floor(Math.random()*FRUITS.length)],
      size: 22 + Math.random()*6
    });
  }

  // ==== gambar ====
  function draw(){
    ctx.clearRect(0,0,width,height);

    // gambar makanan
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "24px system-ui";
    foods.forEach(f=>{
      ctx.fillText(f.fruit, f.x, f.y);
    });

    // gambar ular smooth (lengkung)
    if(snake.length > 1){
      ctx.beginPath();
      ctx.moveTo(snake[0].x, snake[0].y);
      for(let i=1;i<snake.length-2;i++){
        const xc = (snake[i].x + snake[i+1].x) / 2;
        const yc = (snake[i].y + snake[i+1].y) / 2;
        ctx.quadraticCurveTo(snake[i].x, snake[i].y, xc, yc);
      }
      ctx.strokeStyle = colors[0];
      ctx.lineWidth = snake[0].size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    // kepala
    const head = snake[0];
    ctx.beginPath();
    ctx.arc(head.x, head.y, head.size/1.8, 0, Math.PI*2);
    ctx.fillStyle = colors[0];
    ctx.fill();

    // nickname
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#fff";
    ctx.fillText(nickname, head.x, head.y - head.size - 6);
  }

  // ==== loop ====
  function loop(){
    if(!running) return;
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // ==== input analog ====
  const joy = document.getElementById("joy");
  const knob = document.getElementById("knob");
  let center = {x:0,y:0};
  let dragging = false;

  joy.addEventListener("touchstart",(e)=>{
    dragging = true;
    const t = e.touches[0];
    center = {x:t.clientX,y:t.clientY};
  });
  joy.addEventListener("touchmove",(e)=>{
    if(!dragging) return;
    const t = e.touches[0];
    const dx = t.clientX - center.x;
    const dy = t.clientY - center.y;
    const dist = Math.min(40, Math.hypot(dx,dy));
    const angle = Math.atan2(dy,dx);
    direction.x = Math.cos(angle);
    direction.y = Math.sin(angle);
    knob.style.transform = `translate(${Math.cos(angle)*dist}px,${Math.sin(angle)*dist}px)`;
  });
  joy.addEventListener("touchend",()=>{
    dragging = false;
    knob.style.transform = "translate(0,0)";
  });

  // ==== event user:profile ====
  window.addEventListener("user:profile", (e)=>{
    nickname = e.detail.name || "User";
  });

  // ==== fungsi publik ====
  function startGame(selectedColors, startLen){
    running = true;
    colors = selectedColors.length ? selectedColors : ["#58ff9b"];
    baseLen = startLen || 3;
    makeSnake(baseLen);
    spawnFruits(30);
    loop();
  }

  return { startGame };
})();
