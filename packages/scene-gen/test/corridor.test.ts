import { describe, expect, it } from 'vitest';
import { buildRoute, parseMeridian } from '@inner/core';
import { buildCorridor, M0_CODES } from '../src/index.js';
import liJson from '../../../content/meridians/hand-yangming-large-intestine.json';

const meridian = parseMeridian(liJson);
const route = buildRoute(meridian, M0_CODES);

describe('合谷走廊', () => {
  const corridor = buildCorridor(route);
  const field = corridor.field;
  const heguS = field.heguS;

  it('网格规模与索引合法', () => {
    expect(corridor.rows).toBeGreaterThan(100);
    expect(corridor.cols).toBeGreaterThan(60);
    const vertexCount = corridor.terrain.positions.length / 3;
    expect(vertexCount).toBe(corridor.rows * corridor.cols);
    for (const index of corridor.terrain.indices) {
      expect(index).toBeLessThan(vertexCount);
    }
  });

  it('所有顶点有限且落在手背附近', () => {
    for (let i = 0; i < corridor.terrain.positions.length; i += 3) {
      const x = corridor.terrain.positions[i]!;
      const y = corridor.terrain.positions[i + 1]!;
      const z = corridor.terrain.positions[i + 2]!;
      expect(Number.isFinite(x + y + z)).toBe(true);
      expect(Math.abs(y)).toBeLessThan(0.02);
      expect(z).toBeGreaterThan(-0.01);
      expect(z).toBeLessThan(0.06);
    }
  });

  it('合谷谷底低于两侧山脊', () => {
    const center = field.pointAt(heguS, 0)[1];
    const left = field.pointAt(heguS, -0.0078)[1];
    const right = field.pointAt(heguS, 0.0078)[1];
    expect(center).toBeLessThan(left - 0.002);
    expect(center).toBeLessThan(right - 0.002);
  });

  it('位移振幅不超过 6.5mm', () => {
    let max = 0;
    for (const s of corridor.sValues) {
      for (const t of corridor.tValues) {
        max = Math.max(max, Math.abs(field.displacementAt(s, t)));
      }
    }
    expect(max).toBeLessThan(0.0065);
    expect(max).toBeGreaterThan(0.003);
  });

  it('潭面低于岸线，水面不会漫出', () => {
    const water = field.poolWaterY();
    for (let t = -0.012; t <= 0.024; t += 0.0004) {
      if (Math.abs(t) > 0.0045) {
        const p = field.pointAt(heguS, t);
        expect(p[1]).toBeGreaterThan(water);
      }
    }
  });

  it('同一参数生成完全一致（确定性）', () => {
    const again = buildCorridor(route);
    expect(again.terrain.positions).toEqual(corridor.terrain.positions);
    expect(again.wet).toEqual(corridor.wet);
  });

  it('水面网格贴合河道，宽度为正', () => {
    const positions = corridor.water.river.positions;
    const rows = positions.length / 3 / 9;
    expect(rows).toBeGreaterThan(50);
    const span = field.wettedSpan(heguS);
    expect(span.right - span.left).toBeGreaterThan(0.0012);
  });
});
