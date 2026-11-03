import { buildRoute, parseMeridian } from '@inner/core';
import { buildCorridor, M0_CODES } from '@inner/scene-gen';
import li from '../content/meridians/hand-yangming-large-intestine.json';
const m = parseMeridian(li);
const route = buildRoute(m, M0_CODES);
for (let i = 0; i < 3; i++) {
  const t0 = performance.now();
  const c = buildCorridor(route);
  console.log('build', (performance.now() - t0).toFixed(1), 'ms', c.rows, 'x', c.cols);
}
