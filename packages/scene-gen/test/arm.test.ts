import { describe, expect, it } from 'vitest';
import { buildRoute, parseMeridian, type Vec3 } from '@inner/core';
import { TerrainField, buildCorridor } from '../src/index.js';
import li from '../../../content/meridians/hand-yangming-large-intestine.json';

const meridian = parseMeridian(li);
const route = buildRoute(meridian, ['LI3', 'LI4', 'LI5', 'LI6', 'LI7', 'LI8', 'LI9', 'LI10', 'LI11']);
const wrist = route.stopAt('LI5').s;
const segment = {
  surface: 'arm' as const,
  s0: Math.max(0, route.stopAt('LI3').s - 0.004),
  s1: Math.min(route.curve.length, route.stopAt('LI11').s + 0.006),
  focusS: route.stopAt('LI4').s,
  autoS: [route.stopAt('LI3').s, route.stopAt('LI6').s, route.stopAt('LI11').s] as [number, number, number],
  tMin: -0.0125,
  tMax: 0.018,
  ridgeOffset: 0.0078,
};
const field = new TerrainField(route, { segment });

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe('连续手臂曲面', () => {
  it('腕口两侧位置连续，没有峭壁式跳变', () => {
    const a = field.pointAt(wrist - 0.0005, 0);
    const b = field.pointAt(wrist + 0.0005, 0);
    expect(distance(a, b)).toBeLessThan(0.002);
  });

  it('腕前法线接近朝上，腕后过渡到桡侧', () => {
    const before = field.normalAt(wrist - 0.01, 0);
    const after = field.normalAt(wrist + 0.035, 0);
    expect(before[1]).toBeGreaterThan(0.8);
    expect(after[2]).toBeGreaterThan(0.5);
  });

  it('窗口走廊能生成合法网格，且不包含远端水池', () => {
    const windowField = new TerrainField(route, {
      segment: { ...segment, s0: wrist + 0.02, s1: wrist + 0.08 },
    });
    const corridor = buildCorridor(route, {
      segment: { ...segment, s0: wrist + 0.02, s1: wrist + 0.08 },
    });
    expect(corridor.field).toBeInstanceOf(TerrainField);
    expect(windowField.pointAt(wrist + 0.04, 0).every(Number.isFinite)).toBe(true);
    expect(corridor.water.pool.indices.length).toBe(0);
    expect(corridor.terrain.indices.length).toBeGreaterThan(0);
  });
});
