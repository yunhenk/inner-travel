import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { TerrainField } from '@inner/scene-gen';

export type ViewMode = 'observe' | 'fly' | 'dwell';

export interface CameraRigOptions {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  field: TerrainField;
  /** 合谷谷底世界坐标 */
  hegu: THREE.Vector3;
  mode?: ViewMode;
}

/**
 * 三境相机：
 *   观（observe）自由环绕；游（fly）贴谷飞行；驻（dwell）在合谷缓慢环视。
 * 游的路径是弧长 s 的乒乓插值，转弯侧倾很小，避免晕动。
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  mode: ViewMode;

  private field: TerrainField;
  private readonly hegu: THREE.Vector3;
  private s: number;
  private direction = 1;
  private initializedFly = false;
  private touring = false;
  private overview = false;
  private tourTargetS = 0;
  private tourLookDir = 1;
  private tourArrived = false;
  private tmpTarget = new THREE.Vector3();
  private reducedMotion: boolean;

  constructor(options: CameraRigOptions) {
    this.camera = options.camera;
    this.field = options.field;
    this.hegu = options.hegu.clone();
    this.mode = options.mode ?? 'observe';
    this.s = this.field.domain.s0 + 0.02;
    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    this.controls = new OrbitControls(this.camera, options.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.7;
    this.controls.panSpeed = 0.5;
    this.controls.minDistance = 0.0055;
    this.controls.maxDistance = 0.32;
    this.controls.maxPolarAngle = 1.47;
    this.controls.target.copy(this.hegu);
    this.camera.fov = 58;
    this.camera.near = 0.0005;
    this.camera.far = 1.5;
    this.camera.updateProjectionMatrix();

    this.applyMode(this.mode);
  }

  setMode(mode: ViewMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.applyMode(mode);
  }

  /** 回到当前模式的默认机位 */
  reset(): void {
    if (this.overview) {
      this.applyOverview();
      return;
    }
    this.applyMode(this.mode);
  }

  /** 全身示意视角：看手 → 前臂 → 肩 → 颈/头，用于 20 穴总览 */
  setOverview(enabled: boolean): void {
    if (this.overview === enabled) return;
    this.overview = enabled;
    if (enabled) {
      this.applyOverview();
    } else {
      this.controls.enabled = this.mode !== 'fly';
      this.applyMode(this.mode);
    }
  }

  isOverview(): boolean {
    return this.overview;
  }

  /** 当前关注弧长：游为相机所在 s，观/驻为合谷 */
  getFocusS(): number {
    return this.mode === 'fly' && !this.overview ? this.s : this.field.heguS;
  }

  /** 进入逐穴巡游：相机沿 s 滑向目标，不再乒乓往返 */
  beginTour(): void {
    this.touring = true;
    this.tourArrived = false;
    this.tourLookDir = 1;
  }

  /** 设置巡游目标弧长；靠近走廊端头时改为回望谷内 */
  goTo(s: number): void {
    const { s0, s1 } = this.field.domain;
    this.tourTargetS = THREE.MathUtils.clamp(s, s0 + 0.004, s1 - 0.008);
    this.tourLookDir = this.tourTargetS > s1 - 0.02 ? -1 : 1;
    this.tourArrived = false;
  }

  endTour(): void {
    this.touring = false;
    this.tourArrived = false;
  }

  isTouring(): boolean {
    return this.touring;
  }

  /** 取走一次「已到达」事件 */
  consumeTourArrival(): boolean {
    if (!this.tourArrived) return false;
    this.tourArrived = false;
    return true;
  }

  /** 地形参数变化后重绑地形场（走廊拓扑不变） */
  setField(field: TerrainField, hegu: THREE.Vector3): void {
    this.field = field;
    this.hegu.copy(hegu);
    if (!this.overview && (this.mode === 'observe' || this.mode === 'dwell')) {
      this.controls.target.copy(hegu);
    }
  }

  private applyMode(mode: ViewMode): void {
    this.controls.enabled = mode !== 'fly';
    this.controls.autoRotate = false;

    if (mode === 'observe') {
      if (this.field.surface === 'forearm') {
        this.camera.position.copy(this.hegu).add(new THREE.Vector3(0.008, 0.022, 0.028));
        this.controls.target.copy(this.hegu).add(new THREE.Vector3(-0.006, -0.002, 0));
      } else {
        this.camera.position.copy(this.hegu).add(new THREE.Vector3(0.024, 0.008, 0.002));
        this.controls.target.copy(this.hegu).add(new THREE.Vector3(-0.012, -0.001, 0));
      }
      this.controls.update();
    } else if (mode === 'dwell') {
      if (this.field.surface === 'forearm') {
        this.camera.position.copy(this.hegu).add(new THREE.Vector3(0.003, 0.012, 0.018));
        this.controls.target.copy(this.hegu);
      } else {
        this.camera.position.copy(this.hegu).add(new THREE.Vector3(0.0085, 0.0042, 0.0028));
        this.controls.target.copy(this.hegu);
      }
      this.controls.update();
    } else {
      this.initializedFly = false;
      this.s = this.field.domain.s0 + 0.02;
      this.direction = 1;
    }
  }

  update(dt: number, elapsed: number): void {
    if (this.overview) {
      this.camera.lookAt(this.controls.target);
      return;
    }
    if (this.mode === 'fly') {
      this.updateFly(dt, elapsed);
      return;
    }
    this.controls.update();
  }

  private applyOverview(): void {
    this.controls.enabled = false;
    this.camera.position.set(0.34, 0.3, 0.62);
    this.controls.target.set(-0.17, 0.08, 0.015);
    this.camera.lookAt(this.controls.target);
    this.camera.updateProjectionMatrix();
  }

  private updateFly(dt: number, elapsed: number): void {
    const { s0, s1 } = this.field.domain;
    const lookDir = this.touring ? this.tourLookDir : this.direction;

    if (this.touring) {
      const step = (this.reducedMotion ? 0.004 : 0.016) * dt;
      const dist = this.tourTargetS - this.s;
      if (Math.abs(dist) <= step) {
        this.s = this.tourTargetS;
        if (!this.tourArrived) this.tourArrived = true;
      } else {
        this.s += Math.sign(dist) * step;
      }
    } else {
      const start = s0 + 0.02;
      const end = s1 - 0.03;
      const speed = this.reducedMotion ? 0.002 : 0.011;
      this.s += speed * dt * this.direction;
      if (this.s >= end) {
        this.s = end;
        this.direction = -1;
      } else if (this.s <= start) {
        this.s = start;
        this.direction = 1;
      }
    }

    const p = this.field.pointAt(this.s, 0);
    const aheadDistance = this.touring ? 0.014 : 0.011;
    const ahead = this.field.pointAt(
      THREE.MathUtils.clamp(this.s + aheadDistance * lookDir, s0 + 0.002, s1 - 0.002),
      0,
    );

    const bob = Math.sin(elapsed * 0.55) * 0.0006;
    const targetPos =
      this.field.surface === 'forearm'
        ? new THREE.Vector3(p[0], p[1] + 0.009, p[2] + 0.011)
        : new THREE.Vector3(
            p[0],
            p[1] + (this.reducedMotion ? 0.006 : 0.0058 + bob),
            p[2],
          );

    const lookTarget = new THREE.Vector3(
      ahead[0],
      ahead[1] + 0.0012,
      ahead[2],
    );
    this.tmpTarget.copy(lookTarget);

    if (!this.initializedFly) {
      this.camera.position.copy(targetPos);
      this.initializedFly = true;
    } else {
      const k = 1 - Math.exp(-dt * 5.5);
      this.camera.position.lerp(targetPos, k);
      this.controls.target.lerp(this.tmpTarget, k);
    }
    // 平滑 lookAt，避免曲线切向抖动直接传给相机
    const look = this.controls.target.clone().sub(this.camera.position).normalize();
    const desiredQuat = quatFromLook(look);
    this.camera.quaternion.slerp(desiredQuat, 1 - Math.exp(-dt * 6));
    this.controls.target.copy(this.tmpTarget);
  }

  dispose(): void {
    this.controls.dispose();
  }
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const lookMatrix = new THREE.Matrix4();
const lookQuat = new THREE.Quaternion();

function quatFromLook(direction: THREE.Vector3): THREE.Quaternion {
  lookMatrix.lookAt(new THREE.Vector3(0, 0, 0), direction, Y_AXIS);
  return lookQuat.setFromRotationMatrix(lookMatrix).clone();
}

