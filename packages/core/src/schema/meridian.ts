import { z } from 'zod';

export const MERIDIAN_IDS = [
  'LU', 'LI', 'ST', 'SP', 'HT', 'SI',
  'BL', 'KI', 'PC', 'TE', 'GB', 'LR',
] as const;

export const FIVE_ELEMENTS = ['木', '火', '土', '金', '水'] as const;
export const WUSHU_STAGES = ['井', '荥', '输', '经', '合'] as const;
export const POINT_ROLES = ['原', '络', '郄', '募', '俞', '八会', '八脉交会'] as const;

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const AnchorSchema = z.object({
  /** 骨骼帧名，如 'hand.R'、'forearm.R' */
  frame: z.string().min(1),
  /** 骨骼局部坐标（米） */
  local: Vec3Schema,
  /** 体表法线（可选，用于初始朝向） */
  normal: Vec3Schema.optional(),
  /** 体表 UV（可选，用于贴图与快速投影） */
  uv: z.tuple([z.number(), z.number()]).optional(),
});

export const SceneImageSchema = z.object({
  tokens: z.array(z.string().min(1)).min(1).max(4),
  archetype: z.string().min(1),
  params: z.record(z.number()).default({}),
  modifiers: z.array(z.string()).default([]),
  seed: z.number().int().nonnegative(),
});

export const PointTextSchema = z.object({
  literal: z.string().min(1),
  imagery: z.string().min(1),
  qi: z.string().min(1),
  function: z.string().optional(),
  classics: z
    .array(
      z.object({
        source: z.string().min(1),
        quote: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .default([]),
  sceneCue: z.string().min(1),
});

export const AcupointSchema = z.object({
  code: z.string().regex(/^[A-Z]{2}\d{1,2}$/),
  name: z.string().min(1),
  pinyin: z.string().min(1),
  meridian: z.enum(MERIDIAN_IDS),
  order: z.number().int().positive(),
  location: z.string().min(1),
  anchor: AnchorSchema,
  anchorStatus: z.enum(['placeholder', 'authored']).default('placeholder'),
  wushu: z
    .object({
      stage: z.enum(WUSHU_STAGES),
      element: z.enum(FIVE_ELEMENTS),
    })
    .nullable(),
  roles: z.array(z.enum(POINT_ROLES)).default([]),
  image: SceneImageSchema,
  text: PointTextSchema,
});

export const MeridianSchema = z.object({
  schemaVersion: z.literal('0.1.0'),
  id: z.enum(MERIDIAN_IDS),
  name: z.string().min(1),
  shortName: z.string().optional(),
  element: z.enum(FIVE_ELEMENTS),
  organ: z.string().min(1),
  river: z.object({ name: z.string().min(1), source: z.string().min(1) }),
  schedule: z.object({
    branch: z.string().min(1),
    startHour: z.number().min(0).max(23),
    endHour: z.number().min(0).max(24),
  }),
  palette: z.object({
    primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    water: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  points: z.array(AcupointSchema).min(1),
});

export type Vec3Tuple = z.infer<typeof Vec3Schema>;
export type Anchor = z.infer<typeof AnchorSchema>;
export type SceneImage = z.infer<typeof SceneImageSchema>;
export type PointText = z.infer<typeof PointTextSchema>;
export type Acupoint = z.infer<typeof AcupointSchema>;
export type Meridian = z.infer<typeof MeridianSchema>;
export type MeridianId = (typeof MERIDIAN_IDS)[number];
export type FiveElement = (typeof FIVE_ELEMENTS)[number];
export type WushuStage = (typeof WUSHU_STAGES)[number];
export type PointRole = (typeof POINT_ROLES)[number];

/**
 * 解析一份经脉内容。CI 与运行时都会调用：CI 防止错误内容合入，
 * 运行时防止旧缓存或外部内容破坏场景。
 */
export function parseMeridian(input: unknown): Meridian {
  const result = MeridianSchema.safeParse(input);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('\n');
    throw new Error(`经脉内容校验失败：\n${detail}`);
  }
  const meridian = result.data;
  const codes = new Set<string>();
  for (const point of meridian.points) {
    if (codes.has(point.code)) {
      throw new Error(`经脉内容校验失败：穴位编码重复 ${point.code}`);
    }
    codes.add(point.code);
    if (point.meridian !== meridian.id) {
      throw new Error(
        `经脉内容校验失败：${point.code} 的 meridian 是 ${point.meridian}，与文件 ${meridian.id} 不符`,
      );
    }
  }
  return meridian;
}

export function findPoint(meridian: Meridian, code: string): Acupoint {
  const point = meridian.points.find((p) => p.code === code);
  if (!point) throw new Error(`穴位不存在：${code}`);
  return point;
}
