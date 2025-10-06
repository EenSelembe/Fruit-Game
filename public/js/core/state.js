// public/js/core/state.js
import { WORLD_DEFAULT, FOOD_COUNT_DEFAULT } from './config.js';

export const State = {
  // canvas / view
  canvas: null, ctx: null, vw: 0, vh: 0, dpr: 1,

  // world & camera
  WORLD: { ...WORLD_DEFAULT },
  camera: { x: WORLD_DEFAULT.w/2, y: WORLD_DEFAULT.h/2, zoom: 1 },

  // entities
  foods: [],
  FOOD_COUNT: FOOD_COUNT_DEFAULT,
  snakes: [],
  snakesByUid: new Map(),
  player: null,

  // cache start
  lastColors: ['#58ff9b'],
  lastStartLen: 3,

  // UI refs
  ui: {
    elLen: null, elUsers: null, rankRowsEl: null,
    resetBtnEl: null, toastEl: null,
    canReset: false
  },

  // profil pemain aktif (nameplate)
  profile: {
    name: 'USER',
    textColor: '#ffffff',
    borderColor: '#000000',
    // Persist admin & paksa pelangi
    isAdminPersist: false,
    forceAdminRainbow: false
  }
};
