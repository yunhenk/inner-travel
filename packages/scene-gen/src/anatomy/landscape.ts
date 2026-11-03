import { smoothstep } from '@inner/core';

export interface AnatomyContext {
  wristS: number;
  heguS: number;
  li11S: number;
}

/**
 * 解剖启发的附加位移（米）。不是医学精确分割，只把肌腹/肌间隔/血管
 * 翻译成山脊与沟，叠加在现有山谷上。
 */
export function anatomyDisplacement(s: number, t: number, ctx: AnatomyContext): number {
  const hand = 1 - smoothstep(ctx.wristS - 0.01, ctx.wristS + 0.025, s);
  const forearm =
    smoothstep(ctx.wristS - 0.005, ctx.wristS + 0.03, s) *
    (1 - smoothstep(ctx.li11S - 0.02, ctx.li11S + 0.006, s));

  let h = 0;

  if (hand > 0.001) {
    // 第一骨间背侧肌：沿合谷前后的一道路宽脊
    const muscle = Math.exp(-(((t - 0.004) / 0.0045) ** 2)) *
      Math.exp(-(((s - ctx.heguS) / 0.024) ** 2));
    // 骨间膜/肌间隔：肌腹之间的一道窄沟
    const septum = Math.exp(-(((t + 0.0065) / 0.0022) ** 2)) *
      Math.exp(-(((s - ctx.heguS) / 0.03) ** 2));
    h += 0.00062 * muscle * hand;
    h -= 0.00024 * septum * hand;
  }

  if (forearm > 0.001) {
    // 肱桡肌 / ECRL / ECRB 三道纵向肌腹
    for (const [center, amp] of [
      [-0.008, 0.00048],
      [0.0, 0.00056],
      [0.008, 0.00042],
    ] as const) {
      h += amp * Math.exp(-(((t - center) / 0.0028) ** 2)) * forearm;
    }
    // 桡动脉走行的浅槽
    h -= 0.00034 * Math.exp(-(((t + 0.011) / 0.0018) ** 2)) * forearm;
    // 腕部伸肌腱的短脊
    h += 0.0004 * Math.exp(-(((s - ctx.wristS) / 0.006) ** 2)) *
      Math.exp(-(((t - 0.002) / 0.0035) ** 2));
  }

  return h;
}
