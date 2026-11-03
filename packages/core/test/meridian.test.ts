import { describe, expect, it } from 'vitest';
import {
  buildRoute,
  distanceToHandBody,
  findPoint,
  parseMeridian,
  resolveAnchor,
  tide,
  MeridianCurve,
} from '../src/index.js';
import liJson from '../../../content/meridians/hand-yangming-large-intestine.json';

const meridian = parseMeridian(liJson);
const M0 = ['LI1', 'LI3', 'LI4', 'LI5', 'LI11'] as const;

describe('schema', () => {
  it('解析手阳明大肠经 20 穴', () => {
    expect(meridian.points).toHaveLength(20);
    expect(meridian.points.map((p) => p.code)).toEqual(
      Array.from({ length: 20 }, (_, i) => `LI${i + 1}`),
    );
  });

  it('拒绝重复穴位编码', () => {
    const dup = JSON.parse(JSON.stringify(liJson)) as { points: Array<{ code: string }> };
    dup.points[1]!.code = dup.points[0]!.code;
    expect(() => parseMeridian(dup)).toThrow(/重复/);
  });

  it('M0 的五个穴位已标定', () => {
    for (const code of M0) {
      expect(findPoint(meridian, code).anchorStatus).toBe('authored');
    }
  });
});

describe('anatomy anchors', () => {
  it('已标定锚点贴合程序化体表（< 0.5mm）', () => {
    for (const code of M0) {
      const world = resolveAnchor(findPoint(meridian, code));
      expect(Math.abs(distanceToHandBody(world))).toBeLessThan(0.0005);
    }
  });
});

describe('meridian route', () => {
  const route = buildRoute(meridian, M0);

  it('曲线长度约 0.4m，五穴弧长严格递增', () => {
    expect(route.curve.length).toBeGreaterThan(0.38);
    expect(route.curve.length).toBeLessThan(0.45);
    for (let i = 1; i < route.stops.length; i++) {
      expect(route.stops[i]!.s).toBeGreaterThan(route.stops[i - 1]!.s);
    }
  });

  it('按弧长采样位置连续', () => {
    const a = route.curve.sampleAt(route.curve.length * 0.3);
    const b = route.curve.sampleAt(route.curve.length * 0.3 + 0.0005);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(0.0008);
  });

  it('控制点参数化可复现', () => {
    const again = new MeridianCurve(route.curve.controlPoints);
    expect(again.length).toBeCloseTo(route.curve.length, 6);
  });
});

describe('子午流注', () => {
  it('卯时大肠经当令，午时安静', () => {
    expect(tide('LI', 6)).toBeGreaterThan(0.9);
    expect(tide('LI', 12)).toBeCloseTo(0.15, 5);
    expect(tide('LI', 5)).toBeLessThan(tide('LI', 6));
  });
});
