import { describe, expect, it } from 'vitest';
import { buildRoute, parseMeridian } from '@inner/core';
import { M0_CODES, buildCorridor, buildQiPath } from '../src/index.js';
import liJson from '../../../content/meridians/hand-yangming-large-intestine.json';

const meridian = parseMeridian(liJson);
const route = buildRoute(meridian, M0_CODES);
const corridor = buildCorridor(route);
const field = corridor.field;

describe('气粒子路径', () => {
  const path = buildQiPath(field, { samples: 128 });

  it('纹理尺寸与数据完整', () => {
    expect(path.width).toBe(128);
    expect(path.data.length).toBe(128 * 4 * 4);
    for (const value of path.data) expect(Number.isFinite(value)).toBe(true);
  });

  it('位置贴合谷底中线并略微抬升', () => {
    for (let i = 0; i < path.width; i += 17) {
      const s = path.s0 + ((path.s1 - path.s0) * i) / (path.width - 1);
      const expected = field.pointAt(s, 0);
      const row = (0 * path.width + i) * 4;
      expect(path.data[row]!).toBeCloseTo(expected[0], 6);
      expect(path.data[row + 1]!).toBeCloseTo(expected[1] + 0.0006, 6);
      expect(path.data[row + 2]!).toBeCloseTo(expected[2], 6);
    }
  });

  it('法线与副法线正交且为单位向量', () => {
    for (let i = 0; i < path.width; i += 13) {
      const n = [path.data[(path.width + i) * 4]!, path.data[(path.width + i) * 4 + 1]!, path.data[(path.width + i) * 4 + 2]!];
      const b = [path.data[(2 * path.width + i) * 4]!, path.data[(2 * path.width + i) * 4 + 1]!, path.data[(2 * path.width + i) * 4 + 2]!];
      expect(Math.hypot(n[0]!, n[1]!, n[2]!)).toBeCloseTo(1, 4);
      expect(Math.hypot(b[0]!, b[1]!, b[2]!)).toBeCloseTo(1, 4);
      expect(n[0]! * b[0]! + n[1]! * b[1]! + n[2]! * b[2]!).toBeCloseTo(0, 4);
    }
  });

  it('合谷落在路径中段且结果确定', () => {
    expect(path.poolU).toBeGreaterThan(0.3);
    expect(path.poolU).toBeLessThan(0.7);
    const again = buildQiPath(field, { samples: 128 });
    expect(again.data).toEqual(path.data);
  });
});
