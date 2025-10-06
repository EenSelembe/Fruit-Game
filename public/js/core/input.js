// public/js/core/input.js
import { State } from './state.js';
import { screenToWorld } from './camera.js';

export const Input = {
  keys: Object.create(null),
  pointer: { x:0, y:0, down:false },
  joy: null, knob: null, joyState: { ax:0, ay:0, active:false },
  boostHold: false,

  bind(onQuickReset) {
    addEventListener('keydown', (e)=>{
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if ((k === 'r' || k === 'enter') && State.ui.canReset) onQuickReset();
    });
    addEventListener('keyup', (e)=>{ this.keys[e.key.toLowerCase()] = false; });

    addEventListener('pointerdown', (e)=>{ this.pointer.down = true; this.pointer.x=e.clientX; this.pointer.y=e.clientY; });
    addEventListener('pointermove',  (e)=>{ this.pointer.x=e.clientX; this.pointer.y=e.clientY; });
    addEventListener('pointerup',    ()=>{ this.pointer.down = false; });
    addEventListener('pointercancel',()=>{ this.pointer.down = false; });

    this.joy  = document.getElementById('joy');
    this.knob = document.getElementById('knob');
    if (this.joy && this.knob) {
      const setKnob = (cx,cy)=>{ this.knob.style.left = cx+'%'; this.knob.style.top = cy+'%'; };
      setKnob(50,50);
      const handleJoy = (e,type) => {
        const r = this.joy.getBoundingClientRect();
        const cx = r.left + r.width/2, cy = r.top + r.height/2;
        let x,y;
        if (e.touches && e.touches[0]) { x=e.touches[0].clientX; y=e.touches[0].clientY; }
        else { x=e.clientX; y=e.clientY; }
        const dx = x-cx, dy = y-cy, rad = r.width/2, mag = Math.hypot(dx,dy);
        const cl = mag>rad ? rad : mag;
        const nx = mag ? (dx/mag)*cl : 0, ny = mag ? (dy/mag)*cl : 0;
        setKnob((nx/rad)*50+50, (ny/rad)*50+50);
        this.joyState.ax = (nx/rad);
        this.joyState.ay = (ny/rad);
        if (type==='end') { this.joyState.ax=0; this.joyState.ay=0; setKnob(50,50); this.joyState.active=false; }
        else this.joyState.active = true;
      };
      this.joy.addEventListener('pointerdown',  e=>{ this.joy.setPointerCapture(e.pointerId); handleJoy(e,'start'); });
      this.joy.addEventListener('pointermove',  e=>{ if (e.pressure>0) handleJoy(e,'move'); });
      this.joy.addEventListener('pointerup',    e=>{ handleJoy(e,'end'); });
      this.joy.addEventListener('pointercancel',e=>{ handleJoy(e,'end'); });

      const boostBtn = document.getElementById('boostBtn');
      if (boostBtn) {
        boostBtn.addEventListener('pointerdown', ()=>{ this.boostHold=true; });
        boostBtn.addEventListener('pointerup',   ()=>{ this.boostHold=false; });
        boostBtn.addEventListener('pointercancel',()=>{ this.boostHold=false; });
      }
    }

    // dukung id 'reset' atau 'restart'
    const resetBtn = document.getElementById('reset') || document.getElementById('restart');
    if (resetBtn) {
      resetBtn.addEventListener('click', ()=>{
        if (State.ui.canReset) onQuickReset();
      });
    }
  },

  getTargetAngleForPlayer(headX, headY) {
    const k = this.keys;
    let steerX = 0, steerY = 0;
    if (k['w']||k['arrowup'])    steerY -= 1;
    if (k['s']||k['arrowdown'])  steerY += 1;
    if (k['a']||k['arrowleft'])  steerX -= 1;
    if (k['d']||k['arrowright']) steerX += 1;

    if (this.joyState.active && (Math.abs(this.joyState.ax)+Math.abs(this.joyState.ay))>0.05)
      return Math.atan2(this.joyState.ay, this.joyState.ax);

    if (this.pointer.down) {
      const w = screenToWorld(this.pointer.x, this.pointer.y);
      return Math.atan2(w.y - headY, w.x - headX);
    }

    if (steerX||steerY) return Math.atan2(steerY, steerX);
    return null;
  }
};
