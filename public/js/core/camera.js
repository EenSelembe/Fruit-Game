// public/js/core/camera.js
import { State } from './state.js';

export function resize() {
  const { canvas } = State;
  State.vw = innerWidth; State.vh = innerHeight;
  State.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width  = State.vw * State.dpr;
  canvas.height = State.vh * State.dpr;
  canvas.style.width  = State.vw + 'px';
  canvas.style.height = State.vh + 'px';
  State.ctx.setTransform(State.dpr,0,0,State.dpr,0,0);
}

export function worldToScreen(x,y) {
  const { camera } = State;
  return {
    x: (x - camera.x) * camera.zoom + State.vw/2,
    y: (y - camera.y) * camera.zoom + State.vh/2
  };
}

export function screenToWorld(x,y) {
  const { camera } = State;
  return {
    x: (x - State.vw/2)/camera.zoom + camera.x,
    y: (y - State.vh/2)/camera.zoom + camera.y
  };
}
