// /public/js/core/input.js
// Menyediakan GameInput global untuk kontrol: keyboard, pointer, joystick analog, dan boost.
// Dipakai oleh snake.js via window.GameInput

export const Input = {
  // public state
  keys: Object.create(null),
  boostHold: false,
  pointer: { x: 0, y: 0, down: false },
  joyState: { ax: 0, ay: 0, active: false },

  // internal refs
  _canvas: null,
  _joy: null,
  _knob: null,
  _boostBtn: null,

  init(canvas) {
    this._canvas = canvas;

    // --- Keyboard ---
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys[k] = true;
    }, { passive: true });

    addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    }, { passive: true });

    // --- Pointer (tapping/drag di layar buat aim) ---
    addEventListener('pointerdown', (e) => {
      this.pointer.down = true;
      this.pointer.x = e.clientX; this.pointer.y = e.clientY;
    }, { passive: true });

    addEventListener('pointermove', (e) => {
      this.pointer.x = e.clientX; this.pointer.y = e.clientY;
    }, { passive: true });

    addEventListener('pointerup', () => { this.pointer.down = false; }, { passive: true });
    addEventListener('pointercancel', () => { this.pointer.down = false; }, { passive: true });

    // --- Joystick (mobile) ---
    this._joy = document.getElementById('joy');
    this._knob = document.getElementById('knob');
    this._boostBtn = document.getElementById('boostBtn');

    // Pastikan overlay tidak memblokir input
    const overlay = document.querySelector('.overlay');
    if (overlay) overlay.style.pointerEvents = 'none';

    if (this._joy && this._knob) {
      // pastikan bisa menerima gesture
      this._joy.style.touchAction = 'none';
      this._joy.style.userSelect = 'none';
      // posisi awal knob
      this._setKnob(50, 50);

      const handleJoy = (e, type) => {
        const r = this._joy.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;

        let x, y;
        if (e.touches && e.touches[0]) { x = e.touches[0].clientX; y = e.touches[0].clientY; }
        else { x = e.clientX; y = e.clientY; }

        const dx = x - cx, dy = y - cy;
        const rad = r.width / 2;
        const mag = Math.hypot(dx, dy);
        const cl = (mag > rad) ? rad : mag;

        const nx = mag ? (dx / mag) * cl : 0;
        const ny = mag ? (dy / mag) * cl : 0;

        // set knob & state
        this._setKnob((nx / rad) * 50 + 50, (ny / rad) * 50 + 50);
        this.joyState.ax = (nx / rad);
        this.joyState.ay = (ny / rad);

        if (type === 'end') {
          this.joyState.ax = 0; this.joyState.ay = 0;
          this._setKnob(50, 50);
          this.joyState.active = false;
        } else {
          this.joyState.active = true;
        }
      };

      this._joy.addEventListener('pointerdown', (e) => {
        try { this._joy.setPointerCapture(e.pointerId); } catch {}
        handleJoy(e, 'start');
      }, { passive: true });

      this._joy.addEventListener('pointermove', (e) => {
        if (e.pressure > 0) handleJoy(e, 'move');
      }, { passive: true });

      this._joy.addEventListener('pointerup',   (e) => handleJoy(e, 'end'), { passive: true });
      this._joy.addEventListener('pointercancel',(e) => handleJoy(e, 'end'), { passive: true });
    }

    // --- Boost button (mobile) ---
    if (this._boostBtn) {
      this._boostBtn.addEventListener('pointerdown', () => { this.boostHold = true; }, { passive: true });
      this._boostBtn.addEventListener('pointerup',   () => { this.boostHold = false; }, { passive: true });
      this._boostBtn.addEventListener('pointercancel',() => { this.boostHold = false; }, { passive: true });
    }
  },

  _setKnob(cxPct, cyPct) {
    if (!this._knob) return;
    this._knob.style.left = cxPct + '%';
    this._knob.style.top  = cyPct + '%';
  },

  /**
   * Dipanggil snake.js untuk menentukan arah target pemain.
   * Urutan prioritas:
   * 1) Joystick aktif (|ax|+|ay| > 0.05)
   * 2) Pointer ditekan (arah dari kepala ke posisi pointer)
   * 3) WASD/Arrow keys
   * 4) null (biarkan ular melaju lurus)
   */
  getTargetAngleForPlayer(px, py) {
    // 1) Joystick
    if (this.joyState.active && (Math.abs(this.joyState.ax) + Math.abs(this.joyState.ay)) > 0.05) {
      return Math.atan2(this.joyState.ay, this.joyState.ax);
    }

    // 2) Pointer (tap/drag pada layar untuk mengarahkan kepala)
    if (this.pointer.down && typeof window.GameRender?.worldToScreen === 'function') {
      const head = window.GameRender.worldToScreen(px, py);
      const dx = this.pointer.x - head.x;
      const dy = this.pointer.y - head.y;
      return Math.atan2(dy, dx);
    }

    // 3) Keyboard
    let sx = 0, sy = 0;
    if (this.keys['w'] || this.keys['arrowup'])    sy -= 1;
    if (this.keys['s'] || this.keys['arrowdown'])  sy += 1;
    if (this.keys['a'] || this.keys['arrowleft'])  sx -= 1;
    if (this.keys['d'] || this.keys['arrowright']) sx += 1;
    if (sx || sy) return Math.atan2(sy, sx);

    // 4) Tidak ada input
    return null;
  }
};

// Agar snake.js yang mengakses window.GameInput langsung aman,
// game-core.js juga memasang bridge: window.GameInput = Input;
// (Tetapi kita pasang juga di sini jika dimuat lebih awal)
if (typeof window !== 'undefined' && !window.GameInput) {
  window.GameInput = Input;
  }
