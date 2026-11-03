import * as THREE from 'three';
import { buildRoute, type Meridian, type Route } from '@inner/core';
import {
  M0_CODES,
  TerrainField,
  WindowTracker,
  buildCorridor,
  type ArchetypeChoice,
  type CorridorMeshData,
} from '@inner/scene-gen';
import { CorridorService } from './corridorService.js';
import {
  CameraRig,
  createArmLineView,
  createBodyAnchorView,
  createBodyView,
  createMarkerView,
  createMistView,
  createPressView,
  createQiView,
  createTerrainView,
  createWaterView,
  type ArmLineView,
  type BodyAnchorView,
  type BodyView,
  type MarkerView,
  type MistView,
  type PressView,
  type QiView,
  type TerrainView,
  type ViewMode,
  type WaterView,
} from '@inner/render';

export const TOUR_CODES = [
  'LI3', 'LI4', 'LI5', 'LI6', 'LI7', 'LI8', 'LI9', 'LI10', 'LI11',
] as const;

const CODES = TOUR_CODES;
const WINDOW_HALF = 0.035;

export interface SceneParams {
  valleyDepth: number;
  riverWidth: number;
  relief: number;
  fogDensity: number;
  archetype: ArchetypeChoice;
}

export interface SceneVisibility {
  terrain: boolean;
  water: boolean;
  body: boolean;
  ink: boolean;
  qi: boolean;
  mist: boolean;
  markers: boolean;
  labels: boolean;
}

export interface SceneHostOptions {
  meridian: Meridian;
  mode: ViewMode;
  params: SceneParams;
  visibility: SceneVisibility;
  onStats?: (fps: number) => void;
  onReady?: () => void;
  onStopChange?: (code: string) => void;
  onPressChange?: (active: boolean) => void;
  onTourArrive?: () => void;
}

interface Layers {
  terrain: TerrainView;
  water: WaterView;
  body: BodyView;
  qi: QiView;
  press: PressView;
  markers: MarkerView;
  mist: MistView;
  anchors: BodyAnchorView;
}

export class SceneHost {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly rig: CameraRig;
  private readonly meridian: Meridian;
  private readonly corridorService = new CorridorService();
  private readonly onStats?: (fps: number) => void;
  private readonly onReady?: () => void;
  private readonly onStopChange?: (code: string) => void;
  private readonly onPressChange?: (active: boolean) => void;
  private readonly onTourArrive?: () => void;
  private activeCode = 'LI4';

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly pressPoint = new THREE.Vector3();
  private readonly pressNormal = new THREE.Vector3(0, 1, 0);
  private pressActive = false;
  private pressStrength = 0;
  private overview = false;
  private pointerStart: { x: number; y: number } | null = null;
  private pressTimer: number | null = null;
  private lastTime = 0;
  private readonly resizeObserver: ResizeObserver;

  private readonly route: Route;
  private readonly field: TerrainField;
  private readonly fullField: TerrainField;
  private readonly windowTracker: WindowTracker;
  private readonly armLine: ArmLineView;
  private readonly codes: readonly string[];
  private corridor: CorridorMeshData | null = null;
  private layers: Layers | null = null;
  private params: SceneParams;
  private visibility: SceneVisibility;
  private mode: ViewMode;

  private readonly heguVec = new THREE.Vector3();
  private raf = 0;
  private disposed = false;
  private pendingRebuild = false;
  private paramsDirtyAt = 0;
  private rebuildToken = 0;
  private frames = 0;
  private lastStats = 0;

  constructor(container: HTMLElement, options: SceneHostOptions) {
    this.container = container;
    this.meridian = options.meridian;
    this.codes = CODES;
    this.params = { ...options.params };
    this.visibility = { ...options.visibility };
    this.mode = options.mode;
    this.onStats = options.onStats;
    this.onReady = options.onReady;
    this.onStopChange = options.onStopChange;
    this.onPressChange = options.onPressChange;
    this.onTourArrive = options.onTourArrive;

    this.route = buildRoute(this.meridian, this.codes);
    this.fullField = new TerrainField(this.route, this.fullOptions());
    this.field = this.fullField;
    this.windowTracker = new WindowTracker(
      this.route.stopAt('LI4').s,
      this.route.curve.length,
      WINDOW_HALF,
      0.005,
      0.012,
    );
    this.activeCode = 'LI4';

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '合谷微距山水场景');
    this.renderer.domElement.setAttribute('role', 'img');

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(
      new THREE.Color(this.field.palette.fog),
      this.params.fogDensity,
    );
    this.armLine = createArmLineView(this.route, this.field.palette.glow);
    this.scene.add(this.armLine.group);

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(58, width / height, 0.0005, 1.5);

    this.setupLights();

    const heguPoint = this.field.pointAt(this.field.heguS, 0);
    const hegu = new THREE.Vector3(heguPoint[0], heguPoint[1], heguPoint[2]);
    this.heguVec.copy(hegu);
    this.rig = new CameraRig({
      camera: this.camera,
      domElement: this.renderer.domElement,
      field: this.field,
      hegu,
      mode: this.mode,
    });

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);

    this.renderer.setSize(width, height, false);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    void this.loadInitial();

    (window as unknown as { __SCENE__?: SceneHost }).__SCENE__ = this;
  }

  private fullOptions() {
    return this.segmentOptions(
      Math.max(0, this.route.stopAt('LI3').s - 0.004),
      Math.min(this.route.curve.length, this.route.stopAt('LI11').s + 0.006),
    );
  }

  private windowOptions(window: { s0: number; s1: number }) {
    return this.segmentOptions(window.s0, window.s1);
  }

  private segmentOptions(s0: number, s1: number) {
    return {
      valleyDepth: this.params.valleyDepth,
      riverWidth: this.params.riverWidth,
      relief: this.params.relief,
      archetype: this.params.archetype,
      tide: 0.55,
      segment: {
        surface: 'arm' as const,
        s0,
        s1,
        focusS: this.route.stopAt('LI4').s,
        autoS: [
          this.route.stopAt('LI3').s,
          this.route.stopAt('LI6').s,
          this.route.stopAt('LI11').s,
        ] as [number, number, number],
        tMin: -0.0125,
        tMax: 0.018,
        ridgeOffset: 0.0078,
      },
    };
  }

  private async loadInitial(): Promise<void> {
    const window = this.windowTracker.current;
    const options = this.windowOptions(window);
    const field = new TerrainField(this.route, options);
    try {
      const data = await this.corridorService.build(this.meridian, this.codes, options);
      if (this.disposed) return;
      this.swapCorridor({ field, ...data });
    } catch (error) {
      console.error('首屏走廊异步生成失败，回退主线程', error);
      if (this.disposed) return;
      this.swapCorridor(buildCorridor(this.route, options));
    }
  }

  private setupLights(): void {
    const hemi = new THREE.HemisphereLight('#f8f2e4', '#6d6455', 1.15);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fff1d6', 1.9);
    sun.position.set(-0.45, 0.82, 0.36);
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight('#cfd8d2', 0.35);
    fill.position.set(0.5, 0.25, -0.6);
    this.scene.add(fill);
  }

  private createLayers(corridor: CorridorMeshData): Layers {
    const terrain = createTerrainView(corridor);
    const water = createWaterView(corridor);
    const mist = createMistView(corridor.field);
    const markers = createMarkerView(corridor.field.route, corridor.field);
    const qi = createQiView(corridor.field);
    const press = createPressView(corridor.field.palette.glow);
    const anchors = createBodyAnchorView(this.meridian.points, corridor.field.palette.glow);
    const body = createBodyView({
      zc0: zCenterAt(corridor, -0.006),
      zc1: zCenterAt(corridor, 0.098),
      spanUlnar: 0.0205,
      spanRadial: 0.0105,
    });

    terrain.setFogDensity(this.params.fogDensity);
    water.setFogDensity(this.params.fogDensity);
    qi.setPixelScale(this.qiPixelScale());

    this.scene.add(
      body.group,
      terrain.group,
      water.group,
      mist.group,
      markers.group,
      qi.group,
      press.group,
      anchors.group,
    );
    return { terrain, water, body, markers, mist, qi, press, anchors };
  }

  private disposeLayers(): void {
    if (!this.layers) return;
    this.scene.remove(
      this.layers.body.group,
      this.layers.terrain.group,
      this.layers.water.group,
      this.layers.mist.group,
      this.layers.markers.group,
      this.layers.qi.group,
      this.layers.press.group,
      this.layers.anchors.group,
    );
    this.layers.terrain.dispose();
    this.layers.water.dispose();
    this.layers.mist.dispose();
    this.layers.markers.dispose();
    this.layers.qi.dispose();
    this.layers.press.dispose();
    this.layers.body.dispose();
    this.layers.anchors.dispose();
  }

  setMode(mode: ViewMode): void {
    if (this.overview) this.setOverview(false);
    this.mode = mode;
    if (mode !== 'fly') this.rig.endTour();
    this.rig.setMode(mode);
  }

  startTour(): void {
    this.setMode('fly');
    this.rig.beginTour();
  }

  stopTour(): void {
    this.rig.endTour();
  }

  goToStop(code: string): void {
    const stop = this.route.stopAt(code);
    const offset =
      code === 'LI11'
        ? -0.008
        : code === 'LI6'
          ? 0.004
          : code === 'LI5'
            ? -0.008
            : code === 'LI3'
              ? 0.004
              : 0;
    this.rig.goTo(stop.s + offset);
  }

  setParams(params: Partial<SceneParams>): void {
    this.params = { ...this.params, ...params };
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = this.params.fogDensity;
    }
    this.pendingRebuild = true;
    this.paramsDirtyAt = performance.now();
    this.rebuildToken += 1;
  }

  setVisibility(visibility: Partial<SceneVisibility>): void {
    this.visibility = { ...this.visibility, ...visibility };
    this.applyVisibility();
  }

  resetCamera(): void {
    this.rig.reset();
  }

  setOverview(enabled: boolean): void {
    if (this.overview === enabled) return;
    this.overview = enabled;
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = enabled ? 0.45 : this.params.fogDensity;
    }
    this.rig.setOverview(enabled);
    this.applyVisibility();
  }

  /**
   * 标签开关在所有镜头生效；穴位环只在观/逐穴巡游显示，
   * 普通「游」保持干净画面（除非用户主动打开标签）。
   */
  private updateMarkerVisibility(): void {
    if (!this.layers) return;
    const showRings =
      this.visibility.markers && (this.mode === 'observe' || this.rig.isTouring());
    const showLabels = this.visibility.labels;
    this.layers.markers.group.visible = showRings || showLabels;
    this.layers.markers.setRingsVisible(showRings);
    this.layers.markers.setLabelsVisible(showLabels);
  }

  private applyVisibility(): void {
    if (!this.layers) return;
    if (this.overview) {
      this.layers.terrain.group.visible = false;
      this.layers.water.group.visible = false;
      this.layers.qi.group.visible = false;
      this.layers.mist.group.visible = false;
      this.layers.markers.group.visible = false;
      this.layers.body.group.visible = true;
      this.layers.body.setEmphasis(true);
      this.layers.anchors.group.visible = true;
      this.layers.anchors.setActive(this.activeCode);
      this.armLine.group.visible = false;
      return;
    }
    this.layers.body.setEmphasis(false);
    this.layers.anchors.group.visible = false;
    this.armLine.group.visible = true;
    this.layers.terrain.group.visible = this.visibility.terrain;
    this.layers.terrain.setInk(this.visibility.ink);
    this.layers.water.group.visible = this.visibility.water;
    this.layers.body.group.visible = this.visibility.body && this.mode === 'observe';
    this.layers.qi.group.visible = this.visibility.qi;
    this.layers.mist.group.visible = this.visibility.mist;
    this.updateMarkerVisibility();
  }

  private rebuildTerrain(): void {
    this.pendingRebuild = false;
    this.rebuildWindow(this.windowTracker.current);
  }

  private rebuildWindow(window: { s0: number; s1: number }): void {
    const options = this.windowOptions(window);
    const field = new TerrainField(this.route, options);
    const token = ++this.rebuildToken;
    this.corridorService
      .build(this.meridian, this.codes, options)
      .then((data) => {
        if (this.disposed || token !== this.rebuildToken) return;
        this.swapCorridor({ field, ...data });
      })
      .catch((error) => {
        console.error('走廊窗口异步生成失败，回退主线程', error);
        if (this.disposed || token !== this.rebuildToken) return;
        this.swapCorridor(buildCorridor(this.route, options));
      });
  }

  private swapCorridor(corridor: CorridorMeshData): void {
    if (!this.layers) {
      this.corridor = corridor;
      this.layers = this.createLayers(corridor);
    } else {
      this.scene.remove(
        this.layers.terrain.group,
        this.layers.water.group,
        this.layers.mist.group,
        this.layers.markers.group,
        this.layers.qi.group,
      );
      this.layers.terrain.dispose();
      this.layers.water.dispose();
      this.layers.mist.dispose();
      this.layers.markers.dispose();
      this.layers.qi.dispose();

      this.corridor = corridor;
      const terrain = createTerrainView(corridor);
      const water = createWaterView(corridor);
      const mist = createMistView(corridor.field);
      const markers = createMarkerView(corridor.field.route, corridor.field);
      const qi = createQiView(corridor.field);
      terrain.setFogDensity(this.params.fogDensity);
      water.setFogDensity(this.params.fogDensity);
      qi.setPixelScale(this.qiPixelScale());

      this.scene.add(terrain.group, water.group, mist.group, markers.group, qi.group);
      this.layers = {
        ...this.layers,
        terrain,
        water,
        mist,
        markers,
        qi,
      };
    }

    this.applyVisibility();
  }

  private resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.layers?.qi.setPixelScale(this.qiPixelScale());
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    if (
      this.pendingRebuild &&
      this.corridor &&
      performance.now() - this.paramsDirtyAt > 120
    ) {
      this.rebuildTerrain();
    }

    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const time = now / 1000;

    this.rig.update(dt, time);
    const focusS = this.rig.getFocusS();
    this.armLine.setFocus(focusS);
    const nextWindow = this.windowTracker.update(focusS, this.route.curve.length);
    if (nextWindow) this.rebuildWindow(nextWindow);

    const layers = this.layers;
    if (layers && this.corridor) {
      if (this.rig.consumeTourArrival()) this.onTourArrive?.();
      const stop = this.route.nearestStop(this.rig.getFocusS());
      if (stop.code !== this.activeCode) {
        this.activeCode = stop.code;
        this.onStopChange?.(stop.code);
      }
      layers.anchors.setActive(this.activeCode);
      if (!this.overview) {
        layers.body.group.visible = this.visibility.body && this.mode === 'observe';
        this.updateMarkerVisibility();
        const near = this.camera.position.distanceTo(this.heguVec) < 0.045;
        layers.mist.group.visible = this.visibility.mist && !near;
      }
      layers.water.update(time);
      layers.mist.update(time);
      const qiOpacity = this.mode === 'fly' ? 0.8 : this.mode === 'dwell' ? 0.62 : 0.42;
      const pressTarget = this.pressActive ? 1 : 0;
      this.pressStrength += (pressTarget - this.pressStrength) * (1 - Math.exp(-dt * 7));
      if (!this.pressActive && this.pressStrength < 0.01) this.pressStrength = 0;
      const attract = this.pressStrength > 0.01 ? this.pressPoint : null;
      layers.qi.update(
        time,
        0.62,
        this.visibility.qi ? qiOpacity : 0,
        attract,
        this.pressStrength,
      );
      layers.water.setRipple(attract, this.pressStrength, time);
      layers.press.update(attract, this.pressNormal, this.pressStrength, time);
      layers.terrain.material.uniforms.uTime!.value = time;
    }
    this.renderer.render(this.scene, this.camera);

    if (
      this.corridor &&
      this.layers &&
      !document.documentElement.dataset.sceneReady
    ) {
      document.documentElement.dataset.sceneReady = 'true';
      (window as unknown as { __SCENE_READY__?: boolean }).__SCENE_READY__ = true;
      this.onReady?.();
    }

    this.frames++;
    if (time - this.lastStats > 0.5) {
      const fps = Math.round(this.frames / (time - this.lastStats));
      this.onStats?.(fps);
      this.frames = 0;
      this.lastStats = time;
    }
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (this.pressActive) this.endPress();
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.clearPressTimer();
    this.pressTimer = window.setTimeout(() => {
      this.pressTimer = null;
      if (this.pointerStart) this.beginPress(this.pointerStart.x, this.pointerStart.y);
    }, 180);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.pointerStart) return;
    const dx = event.clientX - this.pointerStart.x;
    const dy = event.clientY - this.pointerStart.y;
    if (dx * dx + dy * dy > 25) {
      this.clearPressTimer();
      this.pointerStart = null;
      if (this.pressActive) this.endPress();
    }
  };

  private onPointerUp = (): void => {
    this.clearPressTimer();
    this.pointerStart = null;
    if (this.pressActive) this.endPress();
  };

  private clearPressTimer(): void {
    if (this.pressTimer !== null) {
      window.clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }

  private beginPress(clientX: number, clientY: number): void {
    if (!this.layers || this.overview) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObject(this.layers.terrain.mesh, false);
    const hit = hits[0];
    if (!hit) return;
    this.pressPoint.copy(hit.point);
    if (hit.face) {
      this.pressNormal.copy(hit.face.normal).normalize();
    } else {
      this.pressNormal.set(0, 1, 0);
    }
    this.pressActive = true;
    this.onPressChange?.(true);
  }

  private endPress(): void {
    this.pressActive = false;
    this.onPressChange?.(false);
  }

  private qiPixelScale(): number {
    const fov = (this.camera.fov * Math.PI) / 180;
    return this.renderer.domElement.height / (2 * Math.tan(fov / 2));
  }

  getTriangleCount(): number {
    if (!this.corridor) return 0;
    const terrain = this.corridor.terrain.indices.length / 3;
    const water =
      this.corridor.water.river.indices.length / 3 + this.corridor.water.pool.indices.length / 3;
    return Math.round(terrain + water);
  }

  dispose(): void {
    this.disposed = true;
    this.corridorService.dispose();
    this.clearPressTimer();
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.rig.dispose();
    this.armLine.dispose();
    this.disposeLayers();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    delete (window as unknown as { __SCENE__?: SceneHost }).__SCENE__;
  }
}

function zCenterAt(corridor: CorridorMeshData, x: number): number {
  const stops = corridor.field.route.stops;
  const a = stops[0]!;
  const b = stops[stops.length - 1]!;
  const t = (x - a.position[0]) / Math.max(1e-6, b.position[0] - a.position[0]);
  return a.position[2] + (b.position[2] - a.position[2]) * Math.max(0, Math.min(1, t));
}
