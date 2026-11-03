import type { MeridianId } from '../schema/meridian.js';

/** 十二经当令时辰（子午流注），小时取左闭右开 */
export const SCHEDULE: Record<MeridianId, [number, number]> = {
  LU: [3, 5],
  LI: [5, 7],
  ST: [7, 9],
  SP: [9, 11],
  HT: [11, 13],
  SI: [13, 15],
  BL: [15, 17],
  KI: [17, 19],
  PC: [19, 21],
  TE: [21, 23],
  GB: [23, 1],
  LR: [1, 3],
};

export const TIDE_MIN = 0.15;
export const TIDE_MAX = 1;

function windowPhase(hour: number, start: number, end: number): number {
  const span = (end - start + 24) % 24 || 24;
  const offset = (hour - start + 24) % 24;
  return offset / span;
}

/**
 * 潮位：当令经涨潮，余经安静。
 * 只驱动水位、速度、雾、亮度，不触发地形重建。
 */
export function tide(meridian: MeridianId, hour: number): number {
  const [start, end] = SCHEDULE[meridian];
  const inWindow =
    start < end ? hour >= start && hour < end : hour >= start || hour < end;
  if (!inWindow) return TIDE_MIN;
  const phase = windowPhase(hour, start, end);
  // 当令时段中段最高
  return TIDE_MIN + (TIDE_MAX - TIDE_MIN) * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2));
}
