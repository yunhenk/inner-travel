import { buildRoute, type Meridian, type Route } from '@inner/core';
import { buildCorridor, type CorridorBuildOptions, type CorridorMeshData } from './corridor/build.js';

/** M0 只做手 + 前臂的一段：商阳、三间、合谷、阳溪、曲池 */
export const M0_CODES = ['LI1', 'LI3', 'LI4', 'LI5', 'LI11'] as const;

export interface M0Scene {
  route: Route;
  corridor: CorridorMeshData;
}

export function buildM0Scene(
  meridian: Meridian,
  options: CorridorBuildOptions = {},
): M0Scene {
  const route = buildRoute(meridian, M0_CODES);
  const corridor = buildCorridor(route, options);
  return { route, corridor };
}
