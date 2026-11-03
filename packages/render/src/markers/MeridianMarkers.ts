import * as THREE from 'three';
import { type Route } from '@inner/core';
import type { TerrainField } from '@inner/scene-gen';

export interface MarkerView {
  group: THREE.Group;
  setLabelsVisible(visible: boolean): void;
  dispose(): void;
}

/** 经脉线 + 穴位环 + 名称牌，帮助读者把山水读回身体 */
export function createMarkerView(route: Route, field: TerrainField): MarkerView {
  const group = new THREE.Group();
  group.name = 'MeridianMarkers';

  const accent = new THREE.Color(route.meridian.palette.accent);

  const labels: THREE.Sprite[] = [];
  for (const stop of route.stops) {
    const ground = field.pointAt(stop.s, 0);
    const position = new THREE.Vector3(ground[0], ground[1] + 0.0004, ground[2]);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.0008, 0.00012, 6, 24),
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    ring.position.copy(position);
    ring.rotation.x = Math.PI / 2;
    ring.name = `Anchor-${stop.code}`;
    group.add(ring);

    const label = makeLabel(`${stop.name} ${stop.code}`, accent);
    label.position.copy(position).add(new THREE.Vector3(0, 0.0042, 0));
    label.scale.set(0.0042, 0.00105, 1);
    label.name = `Label-${stop.code}`;
    group.add(label);
    labels.push(label);
  }

  return {
    group,
    setLabelsVisible(visible: boolean) {
      for (const label of labels) label.visible = visible;
    },
    dispose() {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const m = child.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
        if (child instanceof THREE.Sprite) {
          child.material.map?.dispose();
          child.material.dispose();
        }
      });
    },
  };
}

function makeLabel(text: string, color: THREE.Color): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '600 54px "Songti SC", "Noto Serif CJK SC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(245,240,228,0.72)';
  roundRect(ctx, 8, 24, 496, 80, 18);
  ctx.fill();
  ctx.fillStyle = `#${color.getHexString()}`;
  ctx.fillText(text, 256, 66);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 20;
  return sprite;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
