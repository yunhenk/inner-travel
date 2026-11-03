import {
  flowAt,
  hashSeed,
  mulberry32,
  palmDorsalY,
  smoothstep,
  type FlowStage,
  type Route,
  type Vec3,
} from '@inner/core';
import { fbm2, ridged2 } from '../noise.js';

export interface TerrainOptions {
  seed: number;
  /** 谷深倍率，1 为设计基准 */
  valleyDepth: number;
  /** 河宽倍率 */
  riverWidth: number;
  /** 地形位移总倍率 */
  relief: number;
  /** 细节（皴法与噪声）倍率 */
  detail: number;
  /** 潮位 0.15–1，影响水位与湿润带 */
  tide: number;
}

export const DEFAULT_TERRAIN: TerrainOptions = {
  seed: 10404,
  valleyDepth: 1,
  riverWidth: 1,
  relief: 1,
  detail: 1,
  tide: 0.55,
};

/**
 * 合谷走廊的参数域：
 *   s 沿经（三间 → 阳溪），t 横向；
 *   t 为负指向拇指侧（桡侧），为正指向手掌中心（尺侧）。
 *   （曲线横向 B = T × N 在世界中指向 -z，故此处 t 的符号与之相反。）
 */
export interface CorridorDomain {
  s0: number;
  s1: number;
  tMin: number;
  tMax: number;
  /** 合谷在曲线上的弧长 */
  heguS: number;
  /** 两侧山脊的距离（米） */
  ridgeOffset: number;
}

export interface TerrainSample {
  position: Vec3;
  /** 基面高度（未位移的皮肤） */
  baseY: number;
  displacement: number;
  /** 该点的水面高度（河/潭），无则 undefined */
  waterY?: number;
  wet: number;
  concavity: number;
}

/**
 * 合谷本地地形场。所有高度都是米，位移上限 ~6mm。
 * 不依赖 three，便于单测与离线烘焙。
 */
export class TerrainField {
  readonly route: Route;
  readonly domain: CorridorDomain;
  readonly options: TerrainOptions;
  readonly palette: TerrainPalette;

  private readonly seedA: number;
  private readonly seedB: number;
  private readonly poolS: number;
  private readonly flowCache = new Map<number, FlowStage>();

  constructor(route: Route, options: Partial<TerrainOptions> = {}) {
    this.route = route;
    this.options = { ...DEFAULT_TERRAIN, ...options };
    this.seedA = hashSeed('corridor', this.options.seed);
    this.seedB = hashSeed('pool', this.options.seed);

    const li3 = route.stopAt('LI3');
    const li5 = route.stopAt('LI5');
    const hegu = route.stopAt('LI4');
    this.poolS = hegu.s;

    const s0 = Math.max(0, li3.s - 0.004);
    const s1 = Math.min(route.curve.length, li5.s + 0.006);
    this.domain = {
      s0,
      s1,
      tMin: -0.0125,
      tMax: 0.0245,
      heguS: hegu.s,
      ridgeOffset: 0.0078,
    };
    this.palette = buildPalette(route);
  }

  /** 合谷汇水潭中心 */
  get heguS(): number {
    return this.poolS;
  }

  /** 基面：手背高度场 */
  baseAt(x: number, z: number): number {
    return palmDorsalY(x, z);
  }

  /** 从 (s,t) 求世界位置；y 重新投影到手背基面，再叠加位移 */
  pointAt(s: number, t: number): Vec3 {
    const frame = this.route.curve.frameAt(s);
    const x = frame.position[0] + frame.lateral[0] * t;
    const z = frame.position[2] + frame.lateral[2] * t;
    const baseY = this.baseAt(x, z);
    // 抬高 0.12mm，避免与身体基座在接缝处 z-fighting
    return [x, baseY + this.displacementAt(s, t) + 0.00012, z];
  }

  displacementAt(s: number, t: number): number {
    const { s0, s1, heguS, ridgeOffset } = this.domain;
    const o = this.options;

    const ds = s - heguS;

    // 谷沿经向的包络：合谷最深，向两端收
    const env = 0.22 + 0.78 * smoothstep(0.05, 0.008, Math.abs(ds));
    // 谷口在合谷稍近掌指关节一侧收束
    const mouth = 1 + 0.22 * Math.exp(-(((ds - 0.012) / 0.014) ** 2));

    const amp = 0.003 * o.valleyDepth * o.relief * env;
    const sigmaC = 0.0034;
    // 合谷处两脊略近；沿经轻微蛇行，避免过于规整
    const w =
      (ridgeOffset - 0.0011 * Math.exp(-((ds / 0.013) ** 2))) *
      mouth *
      (1 + 0.07 * Math.sin(s * 120 + 0.6));

    let h = -amp * Math.exp(-((t / sigmaC) ** 2));
    h += amp * 0.64 * Math.exp(-(((t + w) / 0.0019) ** 2));
    h += amp * 0.64 * Math.exp(-(((t - w) / 0.0019) ** 2));

    // 掌骨与鱼际的次级隆起（外圈山肩）
    h += 0.0007 * o.relief * Math.exp(-(((t - 0.0165) / 0.0055) ** 2)) * env;
    h += 0.0005 * o.relief * Math.exp(-(((t + 0.0175) / 0.006) ** 2)) * env;

    // 河道下切：五输阶段决定深度与宽度
    const flow = this.flowAtCached(s);
    const wr = 0.0012 * o.riverWidth * (0.55 + 0.45 * flow.width);
    const depth = (0.00025 + flow.depth * 0.2) * env * o.relief;
    h -= depth * Math.exp(-((t / wr) ** 2));

    // 合谷汇水潭
    const pool = Math.exp(-(((ds / 0.0055) ** 2) + ((t / 0.0034) ** 2)));
    h -= 0.0018 * pool * (0.65 + 0.35 * o.valleyDepth) * o.relief;

    // 皴法细节
    const grain =
      (fbm2(s * 520 + 3.1, t * 520 - 7.7, 4, this.seedA) - 0.5) * 0.00072 * o.detail;
    const grooves =
      Math.sin(t * 2600 + fbm2(s * 160, t * 160, 2, this.seedB) * 8) * 0.000025 * o.detail;
    const ridgeDetail =
      (ridged2(s * 300, t * 300, 3, this.seedA + 5) - 0.5) * 0.00042 * o.detail;
    // 山坡上的岩脊，只出现在河谷两侧
    const outcrop =
      Math.max(0, ridged2(s * 420, t * 420, 2, this.seedA + 9) - 0.45) *
      smoothstep(ridgeOffset * 0.55, ridgeOffset * 1.6, Math.abs(t)) *
      0.0016;
    h += (grain + grooves + ridgeDetail + outcrop) * env * o.relief;

    // 边缘归零，接回皮肤
    const edgeT =
      smoothstep(this.domain.tMin, this.domain.tMin + 0.006, t) *
      smoothstep(this.domain.tMax, this.domain.tMax - 0.005, t);
    const edgeS =
      smoothstep(s0, s0 + 0.004, s) * smoothstep(s1, s1 - 0.004, s);

    return h * edgeT * edgeS;
  }

  /** 不含边缘衰减的局部谷深，用于 UI 显示 */
  valleyDepthAt(s: number): number {
    const ds = Math.abs(s - this.poolS);
    return 0.0026 * this.options.valleyDepth * (0.22 + 0.78 * smoothstep(0.05, 0.008, ds));
  }

  /** 河道中心水面高度（相对世界 y） */
  riverWaterY(s: number): number {
    const p = this.pointAt(s, 0);
    return p[1] + 0.00018;
  }

  /** 合谷潭面高度 */
  poolWaterY(): number {
    const p = this.pointAt(this.poolS, 0);
    return p[1] + 0.00055;
  }

  /** 局部水面高度：河道为主，合谷处平滑过渡到潭面 */
  waterYAt(s: number): number {
    const ds = s - this.poolS;
    const poolMix = Math.exp(-((ds / 0.0075) ** 2));
    return this.riverWaterY(s) + (this.poolWaterY() - this.riverWaterY(s)) * poolMix;
  }

  /** 水面与地形的交线：返回 (s) 行的左右湿边，t 坐标 */
  wettedSpan(s: number, step = 0.0002): { left: number; right: number } {
    const level = this.waterYAt(s);
    let left = 0;
    for (let t = -step; t >= this.domain.tMin; t -= step) {
      if (this.pointAt(s, t)[1] > level) {
        left = t + step;
        break;
      }
      left = t;
    }
    let right = 0;
    for (let t = step; t <= this.domain.tMax; t += step) {
      if (this.pointAt(s, t)[1] > level) {
        right = t - step;
        break;
      }
      right = t;
    }
    return { left, right };
  }

  wetAt(s: number, t: number, y: number): number {
    return 1 - smoothstep(0.00005, 0.0014, y - this.waterYAt(s));
  }

  private flowAtCached(s: number): FlowStage {
    const key = Math.round(s * 1e6);
    const hit = this.flowCache.get(key);
    if (hit) return hit;
    const flow = flowAt(this.route, s);
    this.flowCache.set(key, flow);
    return flow;
  }

  /** 2D 曲率（负为凹），用于墨线积墨 */
  concavityAt(s: number, t: number): number {
    const d = 0.0007;
    const h = this.displacementAt(s, t);
    const hs = (this.displacementAt(s + d, t) + this.displacementAt(s - d, t)) * 0.5;
    const ht = (this.displacementAt(s, t + d) + this.displacementAt(s, t - d)) * 0.5;
    const laplace = (hs + ht) * 0.5 - h;
    return Math.max(0, Math.min(1, laplace / 0.0006));
  }

  /** 从世界 x 求经脉的近似横向中心（供身体基座让位遮罩） */
  centerZAt(x: number): number {
    const stops = this.route.stops;
    const first = stops[0]!;
    const last = stops[stops.length - 1]!;
    const t = (x - first.position[0]) / Math.max(1e-6, last.position[0] - first.position[0]);
    return first.position[2] + (last.position[2] - first.position[2]) * Math.max(0, Math.min(1, t));
  }

  /** 采样整片走廊（供单测/预览） */
  sample(s: number, t: number): TerrainSample {
    const p = this.pointAt(s, t);
    return {
      position: p,
      baseY: this.baseAt(p[0], p[2]),
      displacement: p[1] - this.baseAt(p[0], p[2]),
      waterY: this.waterYAt(s),
      wet: this.wetAt(s, t, p[1]),
      concavity: this.concavityAt(s, t),
    };
  }
}

export interface TerrainPalette {
  soil: string;
  moss: string;
  rock: string;
  wet: string;
  fog: string;
  ink: string;
  water: string;
  glow: string;
}

function buildPalette(route: Route): TerrainPalette {
  return {
    soil: '#8a7358',
    moss: '#5b6a42',
    rock: '#938b79',
    wet: '#2e3a2f',
    fog: '#e8e1cf',
    ink: '#24271f',
    water: route.meridian.palette.water,
    glow: route.meridian.palette.accent,
  };
}

/** 便于内容/测试复现的随机种子 */
export function corridorSeed(seed: number, code: string): number {
  return hashSeed(code, seed) >>> 0;
}

export function makeRng(seed: number): () => number {
  return mulberry32(seed);
}
