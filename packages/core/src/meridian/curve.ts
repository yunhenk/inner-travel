import { distance, normalize, sub, type Vec3 } from '../math/vec3.js';

export interface CurveFrame {
  position: Vec3;
  tangent: Vec3;
  /** 近似的体表法线（世界 +y 投影到法平面） */
  normal: Vec3;
  /** 横向（T × N），走廊的 t 轴 */
  lateral: Vec3;
}

const UP: Vec3 = [0, 1, 0];

/**
 * 向心 Catmull-Rom 曲线 + 弧长参数化。
 *
 * 输入为穴位表面点，输出按弧长等距采样（默认 0.5mm）的曲线；
 * 后续走廊、水流、相机都只依赖弧长 s，不依赖控制点参数。
 */
export class MeridianCurve {
  readonly controlPoints: readonly Vec3[];
  /** 每个控制点对应的弧长 */
  readonly controlS: readonly number[];
  readonly length: number;
  /** 等弧长采样点（含首尾） */
  readonly samples: readonly Vec3[];
  readonly step: number;

  constructor(points: readonly Vec3[], step = 0.0005) {
    if (points.length < 2) throw new Error('经脉曲线至少需要 2 个穴位点');
    this.controlPoints = points;
    this.step = step;

    const dense: Vec3[] = [];
    const denseS: number[] = [0];
    const controlS: number[] = [0];
    let acc = 0;
    const controls = [points[0]!, ...points, points[points.length - 1]!];

    for (let i = 1; i < controls.length - 2; i++) {
      const p0 = controls[i - 1]!;
      const p1 = controls[i]!;
      const p2 = controls[i + 1]!;
      const p3 = controls[i + 2]!;
      if (i === 1) dense.push(p1);
      const subdivisions = 96;
      for (let k = 1; k <= subdivisions; k++) {
        const u = k / subdivisions;
        const p = catmullRomCentripetal(p0, p1, p2, p3, u);
        const prev = dense[dense.length - 1]!;
        acc += distance(prev, p);
        dense.push(p);
        denseS.push(acc);
      }
      controlS.push(acc);
    }

    this.length = acc;
    const count = Math.max(2, Math.ceil(acc / step) + 1);
    const actualStep = acc / (count - 1);
    const resampled: Vec3[] = [];
    let cursor = 0;
    for (let i = 0; i < count; i++) {
      const target = i * actualStep;
      while (cursor < denseS.length - 2 && denseS[cursor + 1]! < target) cursor++;
      const s0 = denseS[cursor]!;
      const s1 = denseS[cursor + 1]!;
      const p0 = dense[cursor]!;
      const p1 = dense[cursor + 1]!;
      const t = s1 - s0 < 1e-12 ? 0 : (target - s0) / (s1 - s0);
      resampled.push([
        p0[0] + (p1[0] - p0[0]) * t,
        p0[1] + (p1[1] - p0[1]) * t,
        p0[2] + (p1[2] - p0[2]) * t,
      ]);
    }
    this.samples = resampled;
    this.step = actualStep;
    this.controlS = controlS;
  }

  private indexAt(s: number): { i: number; t: number } {
    const clamped = Math.min(this.length, Math.max(0, s));
    const raw = clamped / this.step;
    const i = Math.min(this.samples.length - 2, Math.floor(raw));
    return { i, t: raw - i };
  }

  sampleAt(s: number): Vec3 {
    const { i, t } = this.indexAt(s);
    const a = this.samples[i]!;
    const b = this.samples[i + 1]!;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  tangentAt(s: number): Vec3 {
    const eps = Math.min(0.0008, this.length / 4);
    const a = this.sampleAt(Math.max(0, s - eps));
    const b = this.sampleAt(Math.min(this.length, s + eps));
    return normalize(sub(b, a));
  }

  frameAt(s: number): CurveFrame {
    const tangent = this.tangentAt(s);
    const normal = normalize([
      UP[0] - tangent[0] * tangent[1],
      UP[1] - tangent[1] * tangent[1],
      UP[2] - tangent[2] * tangent[1],
    ]);
    const lateral = normalize([
      tangent[1] * normal[2] - tangent[2] * normal[1],
      tangent[2] * normal[0] - tangent[0] * normal[2],
      tangent[0] * normal[1] - tangent[1] * normal[0],
    ]);
    return { position: this.sampleAt(s), tangent, normal, lateral };
  }

  /** 在弧长区间内按给定步长采样（含端点） */
  resample(s0: number, s1: number, step: number): Array<{ s: number; position: Vec3 }> {
    const start = Math.max(0, Math.min(this.length, s0));
    const end = Math.max(start, Math.min(this.length, s1));
    const count = Math.max(2, Math.ceil((end - start) / step) + 1);
    const out: Array<{ s: number; position: Vec3 }> = [];
    for (let i = 0; i < count; i++) {
      const s = start + ((end - start) * i) / (count - 1);
      out.push({ s, position: this.sampleAt(s) });
    }
    return out;
  }
}

function catmullRomCentripetal(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: number): Vec3 {
  const alpha = 0.5;
  const d1 = Math.pow(Math.max(1e-9, distance(p0, p1)), alpha);
  const d2 = Math.pow(Math.max(1e-9, distance(p1, p2)), alpha);
  const d3 = Math.pow(Math.max(1e-9, distance(p2, p3)), alpha);
  const t0 = 0;
  const t1 = t0 + d1;
  const t2 = t1 + d2;
  const t3 = t2 + d3;
  const t = t1 + (t2 - t1) * Math.min(1, Math.max(0, u));

  const a1 = mix2(t0, t1, t, p0, p1);
  const a2 = mix2(t1, t2, t, p1, p2);
  const a3 = mix2(t2, t3, t, p2, p3);
  const b1 = mix2(t0, t2, t, a1, a2);
  const b2 = mix2(t1, t3, t, a2, a3);
  return mix2(t1, t2, t, b1, b2);
}

function mix2(t0: number, t1: number, t: number, a: Vec3, b: Vec3): Vec3 {
  const d = t1 - t0;
  if (Math.abs(d) < 1e-12) return a;
  const w0 = (t1 - t) / d;
  const w1 = (t - t0) / d;
  return [a[0] * w0 + b[0] * w1, a[1] * w0 + b[1] * w1, a[2] * w0 + b[2] * w1];
}
