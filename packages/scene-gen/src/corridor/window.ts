/**
 * 焦点窗口：只生成相机附近的走廊 tile，远处降级为经线/穴位点。
 * 这是 LOD 的最小单元；后续可扩成多 tile 管理器。
 */
export interface CorridorWindow {
  centerS: number;
  s0: number;
  s1: number;
}

export function planCorridorWindow(
  focusS: number,
  routeLength: number,
  half = 0.04,
  step = 0.005,
): CorridorWindow {
  const safeHalf = Math.max(0.01, half);
  const safeStep = Math.max(1e-5, step);
  const clamped = Math.min(routeLength, Math.max(0, focusS));
  const centerS = Math.round(clamped / safeStep) * safeStep;
  return {
    centerS,
    s0: Math.max(0, centerS - safeHalf),
    s1: Math.min(routeLength, centerS + safeHalf),
  };
}

export class WindowTracker {
  private window: CorridorWindow;
  private readonly half: number;
  private readonly step: number;
  private readonly margin: number;

  constructor(focusS: number, routeLength: number, half = 0.04, step = 0.005, margin = 0.012) {
    this.half = half;
    this.step = step;
    this.margin = margin;
    this.window = planCorridorWindow(focusS, routeLength, half, step);
  }

  get current(): CorridorWindow {
    return this.window;
  }

  /** 焦点离窗口中心超过半宽减 margin 时，返回新窗口；否则返回 null */
  update(focusS: number, routeLength: number): CorridorWindow | null {
    if (Math.abs(focusS - this.window.centerS) < this.half - this.margin) return null;
    this.window = planCorridorWindow(focusS, routeLength, this.half, this.step);
    return this.window;
  }
}
