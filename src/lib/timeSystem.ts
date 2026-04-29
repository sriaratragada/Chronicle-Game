export type DayNightPhase = 'dawn' | 'day' | 'dusk' | 'night';

// 48 ticks = 1 in-game day. At 1500ms/tick, that's ~72 seconds per day.
export const TICKS_PER_DAY = 48;
export const TICKS_PER_HOUR = TICKS_PER_DAY / 24; // 2 ticks per hour

export function getHourFromTime(worldTime: number): number {
  return Math.floor((worldTime % TICKS_PER_DAY) / TICKS_PER_HOUR);
}

export function getDayNightPhase(worldTime: number): DayNightPhase {
  const hour = getHourFromTime(worldTime);
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 18) return 'day';
  if (hour >= 18 && hour < 20) return 'dusk';
  return 'night';
}

export function getDayNumber(worldTime: number): number {
  return Math.floor(worldTime / TICKS_PER_DAY) + 1;
}

export function getTimeString(worldTime: number): string {
  const hour = getHourFromTime(worldTime);
  const minute = Math.floor(((worldTime % TICKS_PER_HOUR) / TICKS_PER_HOUR) * 60);
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

// Lighting tint based on time of day: returns [r, g, b, alpha] overlay.
// Colors are interpolated smoothly across keyframe hours so there are no
// sudden jumps when the phase changes.
export function getLightingTint(worldTime: number): [number, number, number, number] {
  // Fractional hour in [0, 24)
  const hour = ((worldTime % TICKS_PER_DAY) / TICKS_PER_DAY) * 24;

  // Keyframes: [hour, r, g, b, alpha]
  // Arranged in ascending order and wrapped at 24h.
  const keyframes: [number, number, number, number, number][] = [
    [0,  10,  10,  40, 0.35], // midnight – deep night
    [5,  10,  10,  40, 0.35], // pre-dawn  – still dark
    [6,  255, 200, 140, 0.08], // dawn      – warm golden tint
    [7,  0,   0,   0,  0],    // morning   – clear daylight
    [18, 0,   0,   0,  0],    // late-day  – still clear
    [19, 200, 100, 50, 0.12], // dusk      – orange-red tint
    [20, 10,  10,  40, 0.35], // nightfall – deep night
    [24, 10,  10,  40, 0.35], // (wrap)    – deep night
  ];

  // Find the surrounding keyframes
  let lo = keyframes[0];
  let hi = keyframes[keyframes.length - 1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (hour >= keyframes[i][0] && hour < keyframes[i + 1][0]) {
      lo = keyframes[i];
      hi = keyframes[i + 1];
      break;
    }
  }

  const span = hi[0] - lo[0];
  const t = span > 0 ? (hour - lo[0]) / span : 0;

  return [
    Math.round(lo[1] + (hi[1] - lo[1]) * t),
    Math.round(lo[2] + (hi[2] - lo[2]) * t),
    Math.round(lo[3] + (hi[3] - lo[3]) * t),
    lo[4] + (hi[4] - lo[4]) * t,
  ];
}
