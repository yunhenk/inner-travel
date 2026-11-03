import { describe, expect, it } from 'vitest';
import { buildRoute, parseMeridian } from '@inner/core';
import {
  ARCHETYPES,
  ARCHETYPE_OPTIONS,
  M0_CODES,
  buildCorridor,
} from '../src/index.js';
import liJson from '../../../content/meridians/hand-yangming-large-intestine.json';

const meridian = parseMeridian(liJson);
const route = buildRoute(meridian, M0_CODES);
const heguS = route.stopAt('LI4').s;

describe('场景原型', () => {
  it('六个原型与「随经」选项齐全', () => {
    expect(Object.keys(ARCHETYPES)).toHaveLength(6);
    expect(ARCHETYPE_OPTIONS.map((option) => option.id)).toEqual([
      'auto',
      'valley',
      'stream',
      'gorge',
      'pool',
      'well',
      'pass',
    ]);
  });

  it('随经在三间为溪、合谷为谷、阳溪为峡', () => {
    const corridor = buildCorridor(route, { archetype: 'auto' });
    const field = corridor.field;
    const at3 = field.paramsAt(route.stopAt('LI3').s);
    const at4 = field.paramsAt(heguS);
    const at5 = field.paramsAt(route.stopAt('LI5').s);

    expect(at3.ridgeOffset).toBeGreaterThan(at4.ridgeOffset);
    expect(at5.ridgeOffset).toBeLessThan(at4.ridgeOffset);
    expect(at3.valleyAmp).toBeLessThan(at4.valleyAmp);
  });

  it('峡比谷更窄更深，溪比谷更宽更浅', () => {
    expect(ARCHETYPES.gorge.ridgeOffset).toBeLessThan(ARCHETYPES.valley.ridgeOffset);
    expect(ARCHETYPES.gorge.valleyAmp).toBeGreaterThan(ARCHETYPES.valley.valleyAmp);
    expect(ARCHETYPES.stream.ridgeOffset).toBeGreaterThan(ARCHETYPES.valley.ridgeOffset);
    expect(ARCHETYPES.stream.valleyAmp).toBeLessThan(ARCHETYPES.valley.valleyAmp);
  });

  it('固定原型能生成合法地形，且谷底低于山脊', () => {
    for (const id of ['valley', 'stream', 'gorge', 'pool', 'well', 'pass'] as const) {
      const corridor = buildCorridor(route, { archetype: id });
      const field = corridor.field;
      const center = field.pointAt(heguS, 0)[1];
      const p = field.paramsAt(heguS);
      const left = field.pointAt(heguS, -p.ridgeOffset)[1];
      const right = field.pointAt(heguS, p.ridgeOffset)[1];
      expect(center).toBeLessThan(left);
      expect(center).toBeLessThan(right);
      expect(Number.isFinite(center)).toBe(true);
    }
  });

  it('同参数的原型生成结果确定', () => {
    const a = buildCorridor(route, { archetype: 'gorge' });
    const b = buildCorridor(route, { archetype: 'gorge' });
    expect(a.terrain.positions).toEqual(b.terrain.positions);
  });
});
