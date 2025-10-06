// public/js/core/config.js
export const RAINBOW = ["#ff0055","#ff7b00","#ffee00","#00d26a","#00b3ff","#6950ff"];
export const DEFAULT_PLAYER_COLOR = "#58ff9b";
export const WORLD_DEFAULT = { w: 4200, h: 4200, grid: 90 };
export const FOOD_COUNT_DEFAULT = 1400;

// Palet multi-warna untuk bot
export const BOT_PALETTES = [
  ["#79a7ff", "#79ffd1"],
  ["#ff7b00", "#ffee00"],
  ["#ff4d6d", "#a06cff"],
  ["#00d26a", "#00b3ff"],
  ["#ff0055", "#6950ff"],
  ["#ffee00", "#00d26a", "#00b3ff"],
  ["#ff8a00", "#ff2d55", "#8e44ad"]
];

// Parameter AI bot
export const AI = {
  FOOD_SENSE: 520,
  DANGER_RADIUS: 110,
  DANGER_WEIGHT: 1.25,
  KILL_SENSE: 420,
  BOOST_DANGER: 0.55,
  BOOST_HUNT: 0.35,
  JITTER: 0.18
};
