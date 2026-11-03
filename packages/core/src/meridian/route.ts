import { frameToWorld, palmDorsalY } from '../anatomy/hand.js';
import { distance, type Vec3 } from '../math/vec3.js';
import type { Acupoint, Meridian } from '../schema/meridian.js';
import { MeridianCurve } from './curve.js';

export interface RouteStop {
  code: string;
  name: string;
  order: number;
  anchorStatus: 'placeholder' | 'authored';
  position: Vec3;
  /** 该穴位在曲线上的弧长 */
  s: number;
}

export interface Route {
  meridian: Meridian;
  curve: MeridianCurve;
  stops: RouteStop[];
  /** 起始弧长（第一个穴位） */
  s0: number;
  /** 结束弧长（最后一个穴位） */
  s1: number;
  stopAt(code: string): RouteStop;
  /** 距离给定弧长最近的穴位 */
  nearestStop(s: number): RouteStop;
}

/**
 * 把穴位锚点解算成世界坐标。手背上的点会贴合到手背高度场，
 * 避免内容里的 y 值与程序化基座差出几毫米。
 */
export function resolveAnchor(point: Acupoint): Vec3 {
  const world = frameToWorld(point.anchor.frame, point.anchor.local);
  const [x, y, z] = world;
  if (
    point.anchor.frame === 'hand.R' &&
    x >= 0 &&
    x <= 0.098 &&
    Math.abs(z) <= 0.044
  ) {
    const surfaceY = palmDorsalY(x, z);
    if (Math.abs(surfaceY - y) < 0.003) return [x, surfaceY, z];
  }
  return world;
}

export function buildRoute(meridian: Meridian, codes?: readonly string[]): Route {
  const wanted = codes ? new Set(codes) : null;
  const points = meridian.points
    .filter((p) => (wanted ? wanted.has(p.code) : true))
    .sort((a, b) => a.order - b.order);

  if (points.length < 2) throw new Error('构建经脉曲线至少需要 2 个穴位');

  const positions = points.map(resolveAnchor);
  const curve = new MeridianCurve(positions);

  const stops: RouteStop[] = points.map((point, i) => ({
    code: point.code,
    name: point.name,
    order: point.order,
    anchorStatus: point.anchorStatus,
    position: positions[i]!,
    s: curve.controlS[i]!,
  }));

  const byCode = new Map(stops.map((stop) => [stop.code, stop]));
  const route: Route = {
    meridian,
    curve,
    stops,
    s0: 0,
    s1: curve.length,
    stopAt(code: string) {
      const stop = byCode.get(code);
      if (!stop) throw new Error(`巡游路线上没有穴位：${code}`);
      return stop;
    },
    nearestStop(s: number) {
      let best = stops[0]!;
      let bestDistance = Math.abs(best.s - s);
      for (const stop of stops) {
        const d = Math.abs(stop.s - s);
        if (d < bestDistance) {
          best = stop;
          bestDistance = d;
        }
      }
      return best;
    },
  };
  return route;
}

/** 每个穴位到程序化体表的距离（米），用于内容校验 */
export function anchorSurfaceError(point: Acupoint, distanceToBody: (p: Vec3) => number): number {
  return distanceToBody(resolveAnchor(point));
}

export { distance };
