import * as THREE from 'three';
import { buildRoute, type Meridian } from '@inner/core';
import {
  M0_CODES,
  buildCorridor,
  type CorridorMeshData,
} from '@inner/scene-gen';
import {
  CameraRig,
  createBodyView,
  createMarkerView,
  createMistView,
  createQiView,
  createTerrainView,
  createWaterView,
  type BodyView,
  type MarkerView,
  type MistView,
  type QiView,
  type TerrainView,
  type ViewMode,
  type WaterView,
} from '@inner/render';

export interface SceneParams {
  valleyDepth: number;
  riverWidth: number;
  relief: number;
  fogDensity: number;
}

export interface SceneVisibility {
  terrain: boolean;
  water: boolean;
  body: boolean;
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
}

interface Layers {
  terrain: TerrainView;
  water: WaterView;
  body: BodyView;
  qi: QiView;
  markers: MarkerView;
  mist: MistView;
}

export class SceneHost {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly rig: CameraRig;
  private readonly meridian: Meridian;
  private readonly onStats?: (fps: number) => void;
  private readonly onReady?: () => void;
  private readonly onStopChange?: (code: string) => void;
  private activeCode = 'LI4';
  private lastTime = 0;
  private readonly resizeObserver: ResizeObserver;

  private corridor: CorridorMeshData;
  private layers: Layers;
  private params: SceneParams;
  private visibility: SceneVisibility;
  private mode: ViewMode;

  private readonly heguVec = new THREE.Vector3();
  private raf = 0;
  private disposed = false;
  private pendingRebuild = false;
  private paramsDirtyAt = 0;
  private frames = 0;
  private lastStats = 0;

  constructor(container: HTMLElement, options: SceneHostOptions) {
    this.container = container;
    this.meridian = options.meridian;
    this.params = { ...options.params };
    this.visibility = { ...options.visibility };
    this.mode = options.mode;
    this.onStats = options.onStats;
    this.onReady = options.onReady;
    this.onStopChange = options.onStopChange;

    const route = buildRoute(this.meridian, M0_CODES);
    this.corridor = buildCorridor(route, {
      valleyDepth: this.params.valleyDepth,
      riverWidth: this.params.riverWidth,
      relief: this.params.relief,
      tide: 0.55,
    });

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
      new THREE.Color(this.corridor.field.palette.fog),
      this.params.fogDensity,
    );

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(58, width / height, 0.0005, 1.5);

    this.setupLights();

    const hegu = new THREE.Vector3(
      this.corridor.hegu[0],
      this.corridor.hegu[1],
      this.corridor.hegu[2],
    );
    this.heguVec.set(this.corridor.hegu[0], this.corridor.hegu[1], this.corridor.hegu[2]);
    this.rig = new CameraRig({
      camera: this.camera,
      domElement: this.renderer.domElement,
      field: this.corridor.field,
      hegu,
      mode: this.mode,
    });

    this.layers = this.createLayers();
    this.applyVisibility();

    this.renderer.setSize(width, height, false);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.loop);

    (window as unknown as { __SCENE__?: SceneHost }).__SCENE__ = this;
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

  private createLayers(): Layers {
    const terrain = createTerrainView(this.corridor);
    const water = createWaterView(this.corridor);
    const mist = createMistView(this.corridor.field);
    const markers = createMarkerView(this.corridor.field.route, this.corridor.field);
    const qi = createQiView(this.corridor.field);
    const body = createBodyView({
      zc0: zCenterAt(this.corridor, -0.006),
      zc1: zCenterAt(this.corridor, 0.098),
      spanUlnar: 0.0205,
      spanRadial: 0.0105,
    });

    terrain.setFogDensity(this.params.fogDensity);
    water.setFogDensity(this.params.fogDensity);
    qi.setPixelScale(this.qiPixelScale());

    this.scene.add(body.group, terrain.group, water.group, mist.group, markers.group, qi.group);
    return { terrain, water, body, markers, mist, qi };
  }

  private disposeLayers(): void {
    this.scene.remove(
      this.layers.body.group,
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
    this.layers.body.dispose();
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.rig.setMode(mode);
  }

  setParams(params: Partial<SceneParams>): void {
    this.params = { ...this.params, ...params };
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = this.params.fogDensity;
    }
    this.pendingRebuild = true;
    this.paramsDirtyAt = performance.now();
  }

  setVisibility(visibility: Partial<SceneVisibility>): void {
    this.visibility = { ...this.visibility, ...visibility };
    this.applyVisibility();
  }

  resetCamera(): void {
    this.rig.reset();
  }

  private applyVisibility(): void {
    if (!this.layers) return;
    this.layers.terrain.group.visible = this.visibility.terrain;
    this.layers.water.group.visible = this.visibility.water;
    this.layers.body.group.visible = this.visibility.body;
    this.layers.qi.group.visible = this.visibility.qi;
    this.layers.mist.group.visible = this.visibility.mist;
    this.layers.markers.group.visible = this.visibility.markers;
    this.layers.markers.setLabelsVisible(this.visibility.labels);
  }

  private rebuildTerrain(): void {
    this.pendingRebuild = false;
    const route = this.corridor.field.route;
    const corridor = buildCorridor(route, {
      valleyDepth: this.params.valleyDepth,
      riverWidth: this.params.riverWidth,
      relief: this.params.relief,
      tide: 0.55,
    });

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

    this.heguVec.set(corridor.hegu[0], corridor.hegu[1], corridor.hegu[2]);
    this.rig.setField(corridor.field, this.heguVec);
    this.applyVisibility();
  }

  private resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.layers.qi.setPixelScale(this.qiPixelScale());
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    if (this.pendingRebuild && performance.now() - this.paramsDirtyAt > 120) {
      this.rebuildTerrain();
    }

    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const time = now / 1000;

    this.rig.update(dt, time);
    const stop = this.corridor.field.route.nearestStop(this.rig.getFocusS());
    if (stop.code !== this.activeCode) {
      this.activeCode = stop.code;
      this.onStopChange?.(stop.code);
    }
    const showContext = this.mode === 'observe';
    this.layers.body.group.visible = this.visibility.body && showContext;
    this.layers.markers.group.visible = this.visibility.markers && showContext;
    this.layers.markers.setLabelsVisible(this.visibility.labels && showContext);
    const near = this.camera.position.distanceTo(this.heguVec) < 0.045;
    this.layers.mist.group.visible = this.visibility.mist && !near;
    this.layers.water.update(time);
    this.layers.mist.update(time);
    const qiOpacity = this.mode === 'fly' ? 0.78 : this.mode === 'dwell' ? 0.72 : 0.42;
    this.layers.qi.update(time, 0.62, this.visibility.qi ? qiOpacity : 0);
    this.layers.terrain.material.uniforms.uTime!.value = time;
    this.renderer.render(this.scene, this.camera);

    if (!document.documentElement.dataset.sceneReady) {
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

  private qiPixelScale(): number {
    const fov = (this.camera.fov * Math.PI) / 180;
    return this.renderer.domElement.height / (2 * Math.tan(fov / 2));
  }

  getTriangleCount(): number {
    const terrain = this.corridor.terrain.indices.length / 3;
    const water =
      this.corridor.water.river.indices.length / 3 + this.corridor.water.pool.indices.length / 3;
    return Math.round(terrain + water);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.rig.dispose();
    this.disposeLayers();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    delete (window as unknown as { __SCENE__?: SceneHost }).__SCENE__;
  }
}

function zCenterAt(corridor: CorridorMeshData, x: number): number {
  const route = corridor.field.route;
  const a = route.stopAt('LI3');
  const b = route.stopAt('LI5');
  const t = (x - a.position[0]) / Math.max(1e-6, b.position[0] - a.position[0]);
  return a.position[2] + (b.position[2] - a.position[2]) * Math.max(0, Math.min(1, t));
}
