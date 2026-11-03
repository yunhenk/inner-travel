import type { WushuStage } from '../schema/meridian.js';
import type { Route } from './route.js';

export interface FlowStage {
  stage: WushuStage;
  /** 河宽系数 */
  width: number;
  /** 流速系数 */
  speed: number;
  /** 下切深度（米） */
  depth: number;
}

export const STAGE_FLOW: Record<WushuStage, FlowStage> = {
  井: { stage: '井', width: 0.35, speed: 0.15, depth: 0.0005 },
  荥: { stage: '荥', width: 0.55, speed: 0.3, depth: 0.001 },
  输: { stage: '输', width: 0.75, speed: 0.45, depth: 0.0015 },
  经: { stage: '经', width: 0.95, speed: 0.6, depth: 0.0025 },
  合: { stage: '合', width: 1.3, speed: 0.2, depth: 0.004 },
};

/** 曲线上每个五输节点的参数；非五输穴不参与插值 */
export function flowStagesAlong(route: Route): Array<{ s: number; flow: FlowStage }> {
  const stages: Array<{ s: number; flow: FlowStage }> = [];
  for (const stop of route.stops) {
    const point = route.meridian.points.find((p) => p.code === stop.code);
    if (!point?.wushu) continue;
    stages.push({ s: stop.s, flow: STAGE_FLOW[point.wushu.stage] });
  }
  stages.sort((a, b) => a.s - b.s);
  return stages;
}

/** 在 s 处插值五输参数；区间外沿用最近节点 */
export function flowAt(route: Route, s: number): FlowStage {
  const stages = flowStagesAlong(route);
  if (stages.length === 0) return STAGE_FLOW['经'];
  if (s <= stages[0]!.s) return stages[0]!.flow;
  const last = stages[stages.length - 1]!;
  if (s >= last.s) return last.flow;

  for (let i = 0; i < stages.length - 1; i++) {
    const a = stages[i]!;
    const b = stages[i + 1]!;
    if (s >= a.s && s <= b.s) {
      const t = (s - a.s) / Math.max(1e-9, b.s - a.s);
      const ease = t * t * (3 - 2 * t);
      return {
        stage: ease < 0.5 ? a.flow.stage : b.flow.stage,
        width: lerp(a.flow.width, b.flow.width, ease),
        speed: lerp(a.flow.speed, b.flow.speed, ease),
        depth: lerp(a.flow.depth, b.flow.depth, ease),
      };
    }
  }
  return last.flow;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
