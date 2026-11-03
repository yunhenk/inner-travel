import { distanceToSegment, distance, normalize, smoothstep, sub, type Vec3 } from '../math/vec3.js';

/**
 * 坐标系约定（右手系，单位：米）
 *
 * 世界 = 手部帧（hand.R）：
 *   +x 指向指尖（远端）
 *   +y 指向手背（背侧）
 *   +z 指向拇指侧（桡侧）
 *
 * 前臂帧（forearm.R）原点在肘部，坐标轴与世界同向（直臂姿态）。
 * 这两个帧都是 M0 的简化：正式的 GLB 基座会换成骨骼矩阵。
 */
export interface Frame {
  readonly name: string;
  readonly origin: Vec3;
}

export const HAND_FRAME: Frame = { name: 'hand.R', origin: [0, 0, 0] };
export const FOREARM_FRAME: Frame = { name: 'forearm.R', origin: [-0.255, 0, 0] };
/** 上臂帧原点在肘，+x 朝向手，向肩为 -x */
export const UPPERARM_FRAME: Frame = { name: 'upperarm.R', origin: [-0.255, 0, 0] };
export const SHOULDER_FRAME: Frame = { name: 'shoulder.R', origin: [-0.46, 0.035, 0.01] };
export const NECK_FRAME: Frame = { name: 'neck.R', origin: [-0.46, 0.06, 0.01] };
export const HEAD_FRAME: Frame = { name: 'head.R', origin: [-0.46, 0.16, 0.01] };

export const FRAMES: Record<string, Frame> = {
  [HAND_FRAME.name]: HAND_FRAME,
  [FOREARM_FRAME.name]: FOREARM_FRAME,
  [UPPERARM_FRAME.name]: UPPERARM_FRAME,
  [SHOULDER_FRAME.name]: SHOULDER_FRAME,
  [NECK_FRAME.name]: NECK_FRAME,
  [HEAD_FRAME.name]: HEAD_FRAME,
};

export const PALM = {
  /** 腕关节 x=0，掌指关节 x≈0.095 */
  xMin: 0,
  xMax: 0.095,
  /** 掌宽约 8.8cm */
  zHalf: 0.044,
  /** 掌骨指数（关节处最宽） */
  knuckleX: 0.089,
} as const;

/**
 * 手背高度场：掌骨与鱼际隆起构成基础地形。
 * 这是「身体基座」与「走廊地形」共用的基面，保证接缝不裂。
 */
export function palmDorsalY(x: number, z: number): number {
  const edge = Math.max(0, 1 - (z / 0.0455) ** 2);
  const base = 0.0126 * Math.sqrt(edge);

  // 腕部收窄
  const taper = 0.45 + 0.55 * smoothstep(-0.012, 0.016, x);

  // 掌指关节一排隆起
  const knuckle =
    0.0024 *
    Math.exp(-(((x - PALM.knuckleX) / 0.014) ** 2)) *
    Math.exp(-((z / 0.055) ** 2));

  // 鱼际（拇指根）隆起：合谷外侧的那道山脊
  const thenar =
    0.0034 *
    Math.exp(-((((x - 0.034) / 0.024) ** 2) + (((z - 0.039) / 0.015) ** 2)));

  // 小鱼际
  const hypothenar =
    0.0014 *
    Math.exp(-((((x - 0.028) / 0.030) ** 2) + (((z + 0.037) / 0.013) ** 2)));

  return base * taper + knuckle + thenar + hypothenar;
}

/** 手背法线（数值微分） */
export function palmDorsalNormal(x: number, z: number, eps = 0.0005): Vec3 {
  const dx = (palmDorsalY(x + eps, z) - palmDorsalY(x - eps, z)) / (2 * eps);
  const dz = (palmDorsalY(x, z + eps) - palmDorsalY(x, z - eps)) / (2 * eps);
  return normalize([-dx, 1, -dz]);
}

export interface FingerSpec {
  readonly name: string;
  readonly base: Vec3;
  readonly dir: Vec3;
  readonly length: number;
  readonly radius: number;
  /** 指甲端的收细比例 */
  readonly tipScale: number;
}

/**
 * 五根手指的胶囊近似。指尖朝 +x，略微下弯并张开。
 * 仅用于 M0 身体基座与锚点距离检查；真实手部网格在 M1 替换为 GLB。
 */
export const FINGERS: readonly FingerSpec[] = [
  {
    name: 'index',
    base: [0.093, 0.0025, 0.0205],
    dir: normalize([0.995, -0.07, 0.06]),
    length: 0.074,
    radius: 0.0092,
    tipScale: 0.82,
  },
  {
    name: 'middle',
    base: [0.095, 0.0025, 0.0065],
    dir: normalize([0.998, -0.055, 0.015]),
    length: 0.081,
    radius: 0.0095,
    tipScale: 0.82,
  },
  {
    name: 'ring',
    base: [0.092, 0.0025, -0.0085],
    dir: normalize([0.996, -0.065, -0.028]),
    length: 0.076,
    radius: 0.009,
    tipScale: 0.82,
  },
  {
    name: 'little',
    base: [0.086, 0.0025, -0.0245],
    dir: normalize([0.988, -0.09, -0.055]),
    length: 0.06,
    radius: 0.0078,
    tipScale: 0.8,
  },
  {
    name: 'thumb',
    base: [0.026, 0.0015, 0.036],
    dir: normalize([0.72, -0.03, 0.69]),
    length: 0.057,
    radius: 0.0105,
    tipScale: 0.85,
  },
] as const;

export function fingerAxisTip(finger: FingerSpec): Vec3 {
  return [
    finger.base[0] + finger.dir[0] * finger.length,
    finger.base[1] + finger.dir[1] * finger.length,
    finger.base[2] + finger.dir[2] * finger.length,
  ];
}

export function fingerRadiusAt(finger: FingerSpec, u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return finger.radius * (1 - (1 - finger.tipScale) * t * t);
}

/** 前臂椭圆截面半径（沿 x 从腕到肘） */
export function forearmRadii(x: number): { y: number; z: number } {
  // x ∈ [-0.255, 0]
  const t = Math.min(1, Math.max(0, (0 - x) / 0.255));
  return {
    y: 0.0145 + 0.0055 * t,
    z: 0.0295 + 0.0035 * t,
  };
}

/** 点是否落在手掌（含手指）表面 1mm 以内 */
export function distanceToHandBody(p: Vec3): number {
  const [x, y, z] = p;
  let best = Number.POSITIVE_INFINITY;

  if (x >= -0.005 && x <= PALM.xMax + 0.01 && Math.abs(z) <= PALM.zHalf + 0.008) {
    best = Math.min(best, Math.abs(y - palmDorsalY(x, z)));
  }

  for (const finger of FINGERS) {
    const tip = fingerAxisTip(finger);
    const axis = sub(tip, finger.base);
    const denom = axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2];
    const rel = sub(p, finger.base);
    const u =
      denom < 1e-12
        ? 0
        : Math.min(1, Math.max(0, (rel[0] * axis[0] + rel[1] * axis[1] + rel[2] * axis[2]) / denom));
    const nearest: Vec3 = [
      finger.base[0] + axis[0] * u,
      finger.base[1] + axis[1] * u,
      finger.base[2] + axis[2] * u,
    ];
    const d = distanceToSegment(p, finger.base, tip);
    best = Math.min(best, d - fingerRadiusAt(finger, u));
  }

  // 腕与前臂
  if (x <= 0.005 && x >= -0.27) {
    const { y: ry, z: rz } = forearmRadii(x);
    const radial = Math.hypot(z / rz, y / ry);
    best = Math.min(best, Math.abs(radial - 1) * Math.min(ry, rz));
  }

  return best;
}

/** 把骨骼帧局部坐标变换到世界坐标（M0 只有平移） */
export function frameToWorld(frameName: string, local: Vec3): Vec3 {
  const frame = FRAMES[frameName];
  if (!frame) throw new Error(`未知骨骼帧：${frameName}`);
  return [
    frame.origin[0] + local[0],
    frame.origin[1] + local[1],
    frame.origin[2] + local[2],
  ];
}

export function worldToFrame(frameName: string, world: Vec3): Vec3 {
  const frame = FRAMES[frameName];
  if (!frame) throw new Error(`未知骨骼帧：${frameName}`);
  return sub(world, frame.origin);
}

/** 合谷在 hand.R 局部坐标中的位置（基于手背高度场取值） */
export const HEGU_LOCAL: Vec3 = [0.052, palmDorsalY(0.052, 0.028), 0.028];

/** 手背走廊在 hand.R 局部坐标里的包围盒（用于身体基座的「让位」遮罩） */
export const CORRIDOR_MASK = {
  xMin: -0.004,
  xMax: 0.1,
  zMin: 0.0,
  zMax: 0.056,
} as const;
