import { describe, expect, it } from 'vitest';
import { buildRoute, parseMeridian } from '@inner/core';
import { TerrainField } from '../src/index.js';
import li from '../../../content/meridians/hand-yangming-large-intestine.json';

const route = buildRoute(parseMeridian(li), ['LI3','LI4','LI5','LI6','LI7','LI8','LI9','LI10','LI11']);
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
const off = new TerrainField(route, { segment });
const on = new TerrainField(route, { segment, anatomy: true });
const hegu = route.stopAt('LI4').s;

describe('解剖叠加层', () => {
  it('第一骨间背侧肌处更高，肌间隔处更低', () => {
    const muscle = on.displacementAt(hegu, 0.004) - off.displacementAt(hegu, 0.004);
    const septum = on.displacementAt(hegu, -0.0065) - off.displacementAt(hegu, -0.0065);
    expect(muscle).toBeGreaterThan(0.0002);
    expect(septum).toBeLessThan(0);
  });

  it('前臂肌腹/桡动脉沟有解剖差异', () => {
    const s = wrist + 0.035;
    const belly = on.displacementAt(s, 0) - off.displacementAt(s, 0);
    const artery = on.displacementAt(s, -0.011) - off.displacementAt(s, -0.011);
    expect(belly).toBeGreaterThan(0.0002);
    expect(artery).toBeLessThan(0);
  });

  it('关闭时完全回到原有地形', () => {
    const a = off.displacementAt(hegu, 0.004);
    const again = new TerrainField(route, { segment }).displacementAt(hegu, 0.004);
    expect(a).toBe(again);
  });
});
