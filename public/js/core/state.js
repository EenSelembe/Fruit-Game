// public/js/core/state.js
import { WORLD_DEFAULT, FOOD_COUNT_DEFAULT } from './config.js';

const LS = typeof localStorage !== 'undefined' ? localStorage : null;
const ls = (k, df) => (LS ? LS.getItem(k) : null) ?? df;
const toBool = (v) => String(v) === '1';

export const State = {
  canvas: null, ctx: null, vw: 0, vh: 0, dpr: 1,
  WORLD: { ...WORLD_DEFAULT },
  camera: { x: WORLD_DEFAULT.w/2, y: WORLD_DEFAULT.h/2, zoom: 1 },
  foods: [],
  FOOD_COUNT: FOOD_COUNT_DEFAULT,
  snakes: [],
  snakesByUid: new Map(),
  player: null,
  lastColors: ['#58ff9b'],
  lastStartLen: 3,
  ui: { elLen: null, elUsers: null, rankRowsEl: null, resetBtnEl: null, toastEl: null, canReset: false },
  profile: {
    name: 'USER',
    textColor: '#ffffff',
    borderColor: '#000000',
    isAdminPersist: toBool(ls('snake_isAdminPersist','0')),
    forceAdminRainbow: toBool(ls('snake_forceAdminRainbow','0'))
  }
};
