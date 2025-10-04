// /public/js/helpers.js
// Kumpulan util: math kecil, gradient parser, dan gambar nickname pill di Canvas
// -> Expose sebagai window.Helpers

(function(){
  const Helpers = {};

  /* ===== Math kecil ===== */
  Helpers.clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  Helpers.lerp  = (a,b,t)=>a+(b-a)*t;

  /* ===== Parsing warna ===== */
  // Ambil semua color token (hex/rgb/rgba/hsl) dari linear-gradient(...)
  function extractColorStops(gradStr){
    // contoh: linear-gradient(90deg, #ff0000 0%, rgba(0,0,255,.8) 100%)
    const inside = String(gradStr||'').replace(/^.*?\((.*)\)\s*$/,'$1'); // ambil isi di dalam (...)
    const parts = inside.split(/,(?![^(]*\))/g).map(s=>s.trim()); // split koma di level-atas
    // buang token pertama jika itu sudut (mis: 90deg / to right)
    let iStart = 0;
    if (/(deg|turn|rad)|\bto\b/i.test(parts[0])) iStart = 1;

    const stops = [];
    for (let i=iStart;i<parts.length;i++){
      const p = parts[i];
      const m = p.match(/(#(?:[0-9a-f]{3,8})|rgba?\([^)]*\)|hsla?\([^)]*\))/i);
      if(!m) continue;
      // posisi persentase (opsional)
      const pm = p.replace(m[0],'').match(/(-?\d+\.?\d*)\s*%/);
      const pos = pm ? Math.max(0, Math.min(100, parseFloat(pm[1]))) / 100 : null;
      stops.push({ color: m[0], pos });
    }
    if (stops.length===0) return null;

    // isi posisi yang null secara merata
    let known = stops.filter(s=>s.pos!=null);
    if (known.length===0){
      const step = 1/(stops.length-1);
      stops.forEach((s,idx)=> s.pos = (stops.length===1?0.5: idx*step));
    } else {
      // simple fill: set nulls by linear interpolation
      let lastKnown = -1;
      for(let i=0;i<stops.length;i++){
        if(stops[i].pos==null) continue;
        if(lastKnown<0){
          for(let j=0;j<i;j++) stops[j].pos = (i===0?0 : (j/i)*stops[i].pos);
        }else{
          const span = i-lastKnown;
          const d = stops[i].pos - stops[lastKnown].pos;
          for(let j=1;j<span;j++){
            stops[lastKnown+j].pos = stops[lastKnown].pos + d*(j/span);
          }
        }
        lastKnown = i;
      }
      // tail
      if(lastKnown < stops.length-1){
        const start = stops[lastKnown].pos;
        const span  = (stops.length-1) - lastKnown;
        for(let j=1;j<=span;j++){
          stops[lastKnown+j].pos = start + (1-start)*(j/span);
        }
      }
    }
    return stops;
  }

  // Buat CanvasGradient dari CSS linear-gradient (tanpa sudut "to right" kompleks — pakai 0deg=atas→bawah default)
  function gradientFromString(ctx, x, y, w, h, gradStr){
    const m = String(gradStr||'').match(/(-?\d+\.?\d*)\s*deg/i); // ambil sudut derajat (opsional)
    const angleDeg = m ? parseFloat(m[1]) : 90; // default CSS: 180? Tapi untuk label kecil, 90deg (kiri→kanan) terlihat oke
    const ang = (angleDeg-90) * Math.PI/180; // canvas 0deg = kanan
    const cx = x + w/2, cy = y + h/2;
    const len = Math.hypot(w,h)/2;
    const x0 = cx - Math.cos(ang)*len, y0 = cy - Math.sin(ang)*len;
    const x1 = cx + Math.cos(ang)*len, y1 = cy + Math.sin(ang)*len;

    const stops = extractColorStops(gradStr);
    if(!stops) return null;

    const g = ctx.createLinearGradient(x0,y0,x1,y1);
    stops.forEach(s=> g.addColorStop(Math.max(0,Math.min(1,s.pos)), s.color));
    return g;
  }

  // Ambil warna pertama dari gradient string (fallback untuk stroke canvas)
  function firstColorOfGradient(gradStr){
    const m = String(gradStr||'').match(/(#(?:[0-9a-f]{3,8})|rgba?\([^)]*\)|hsla?\([^)]*\))/i);
    return m ? m[0] : '#000';
  }

  /* ===== UI: rounded rect ===== */
  function roundRectPath(ctx, x, y, w, h, r){
    r = Math.max(0, Math.min(r, Math.min(w,h)/2));
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r);
    ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r);
    ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
  }

  /* ===== Gambar nickname pill di canvas =====
     style: { color, bgColor, bgGradient, borderColor, borderGradient }
  */
  Helpers.drawNicknamePill = function(ctx, centerX, bottomY, text, style, zoom=1){
    const fontPx = Math.max(10, 12*zoom);
    ctx.font = `${fontPx}px system-ui,Segoe UI,Arial`;
    const padX = 10*zoom, padY = 6*zoom, radius = 8*zoom;

    const metrics = ctx.measureText(text||'USER');
    const textW = Math.max(14*zoom, metrics.width);
    const w = textW + padX*2;
    const h = fontPx + padY*2;

    const x = Math.round(centerX - w/2);
    const y = Math.round(bottomY - h);

    // isi (background)
    let fillStyle = style?.bgColor || 'rgba(0,0,0,.35)';
    if (style?.bgGradient) {
      const g = gradientFromString(ctx, x, y, w, h, style.bgGradient);
      if (g) fillStyle = g;
    }
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.fillStyle = fillStyle;
    ctx.fill();

    // border
    let strokeStyle = style?.borderColor || '#000';
    if (style?.borderGradient) {
      const gs = gradientFromString(ctx, x, y, w, h, style.borderGradient);
      if (gs) strokeStyle = gs;
      else strokeStyle = firstColorOfGradient(style.borderGradient);
    }
    ctx.lineWidth = Math.max(1, 1.5*zoom);
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();

    // teks
    ctx.fillStyle = style?.color || '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text||'USER', Math.round(centerX), Math.round(y + h/2 + 0.5));

    return { x, y, w, h };
  };

  // expose
  window.Helpers = Helpers;
})();
