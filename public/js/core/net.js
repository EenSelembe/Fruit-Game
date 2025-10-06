// public/js/core/net.js
import { State } from './state.js';
import { RAINBOW } from './config.js';
import { createSnake, registerSnake } from './snake.js';

export function netUpsert(uid, state) {
  if (!uid) return;
  if (State.player && State.player.uid === uid) return;

  let s = State.snakesByUid.get(uid);
  if (!s) {
    const uinfo = window.Presence?.UserDir.get(uid);
    const name  = state?.name || uinfo?.name || 'USER';
    const cols  = state?.colors && state.colors.length ? state.colors : ['#79a7ff'];
    const nameColor = uinfo?.style?.color || '#fff';
    const borderCol = uinfo?.style?.borderColor || '#000';

    s = createSnake(cols,
      state?.x ?? Math.random()*State.WORLD.w,
      state?.y ?? Math.random()*State.WORLD.h,
      false,
      state?.length ?? state?.len ?? 3,
      name,
      uid,
      nameColor,
      borderCol
    );
    s.isRemote = true;
    if (uinfo?.isAdmin) { s.colors = RAINBOW.slice(); s.isAdminRainbow = true; }
    registerSnake(s);
  }

  if (typeof state.x === 'number') s.x = state.x;
  if (typeof state.y === 'number') s.y = state.y;
  if (typeof state.dir === 'number') s.dir = state.dir;
  if (typeof state.length === 'number') s.length = Math.max(1, Math.floor(state.length));
  else if (typeof state.len === 'number') s.length = Math.max(1, Math.floor(state.len));
  if (Array.isArray(state.colors) && state.colors.length) s.colors = state.colors.slice();
  if (typeof state.name === 'string') s.name = state.name;

  if (!s.path || !s.path.length) s.path = [{ x: s.x, y: s.y }];
}

export function netRemove(uid) {
  if (!uid) return;
  const s = State.snakesByUid.get(uid);
  if (!s) return;
  s.isRemote = false;
  s.isBot = true;
  s.aiTarget = { x: Math.random()*State.WORLD.w, y: Math.random()*State.WORLD.h };
}
