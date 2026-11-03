import * as THREE from 'three';
import {
  FINGERS,
  FOREARM_FRAME,
  PALM,
  fingerAxisTip,
  forearmRadii,
  palmDorsalY,
  type FingerSpec,
} from '@inner/core';

export interface BodyView {
  group: THREE.Group;
  setVisible(visible: boolean): void;
  setEmphasis(enabled: boolean): void;
  dispose(): void;
}

const SKIN = '#e4c8b1';
const SKIN_SHADOW = '#c79c82';

/**
 * M0 的程序化身体基座：手掌 + 五指 + 前臂 + 一小段上臂。
 * 手背在走廊范围内挖空（交给地形接管），其余部分保持皮肤。
 * 这是「双象」里「体」的一层；M1 会换成带骨骼的 GLB。
 */
export function createBodyView(options: {
  /** 遮罩在 xMin/xMax 处的 z 中心 */
  zc0: number;
  zc1: number;
  spanUlnar: number;
  spanRadial: number;
}): BodyView {
  const group = new THREE.Group();
  group.name = 'BodyBase';

  const palmMaterial = createSkinMaterial({ ...options, withMask: true });
  const skinMaterial = createSkinMaterial({ ...options, withMask: false });
  skinMaterial.side = THREE.FrontSide;

  const palm = new THREE.Mesh(buildPalmGeometry(), palmMaterial);
  palm.name = 'Palm';
  palm.frustumCulled = false;
  group.add(palm);

  for (const finger of FINGERS) {
    group.add(createFinger(finger, skinMaterial));
  }

  group.add(createForearm(skinMaterial));
  group.add(createUpperArm(skinMaterial));
  group.add(createNeck(skinMaterial));
  group.add(createHead(skinMaterial));

  return {
    group,
    setVisible(visible: boolean) {
      group.visible = visible;
    },
    setEmphasis(enabled: boolean) {
      const opacity = enabled ? 0.58 : 0.34;
      palmMaterial.opacity = opacity;
      skinMaterial.opacity = opacity;
    },
    dispose() {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
        }
      });
      palmMaterial.dispose();
      skinMaterial.dispose();
    },
  };
}

function createSkinMaterial(options: {
  zc0: number;
  zc1: number;
  spanUlnar: number;
  spanRadial: number;
  withMask: boolean;
}): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(SKIN),
    roughness: 0.92,
    metalness: 0.0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });

  if (!options.withMask) return material;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uXMin = { value: -0.006 };
    shader.uniforms.uXMax = { value: 0.098 };
    shader.uniforms.uZC0 = { value: options.zc0 };
    shader.uniforms.uZC1 = { value: options.zc1 };
    shader.uniforms.uSpanU = { value: options.spanUlnar };
    shader.uniforms.uSpanR = { value: options.spanRadial };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLocalPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLocalPos = position;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLocalPos;
        uniform float uXMin;
        uniform float uXMax;
        uniform float uZC0;
        uniform float uZC1;
        uniform float uSpanU;
        uniform float uSpanR;`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (vLocalPos.x > uXMin && vLocalPos.x < uXMax) {
          float zc = mix(uZC0, uZC1, clamp((vLocalPos.x - uXMin) / max(1e-5, uXMax - uXMin), 0.0, 1.0));
          if (vLocalPos.z > zc - uSpanU && vLocalPos.z < zc + uSpanR) discard;
        }`,
      );
  };

  return material;
}

function buildPalmGeometry(): THREE.BufferGeometry {
  const nx = 96;
  const nz = 52;
  const x0 = -0.012;
  const x1 = PALM.xMax + 0.003;
  const z0 = -PALM.zHalf;
  const z1 = PALM.zHalf;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const topAt = (x: number, z: number) => palmDorsalY(x, z);
  const bottomAt = (x: number, z: number) => {
    const edge = Math.max(0, 1 - (z / 0.0455) ** 2);
    return -(0.0102 * Math.sqrt(edge) + 0.0006);
  };

  const topOffset = 0;
  for (let j = 0; j <= nz; j++) {
    const z = z0 + ((z1 - z0) * j) / nz;
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      positions.push(x, topAt(x, z), z);
      uvs.push(i / nx, j / nz);
    }
  }
  const bottomOffset = positions.length / 3;
  for (let j = 0; j <= nz; j++) {
    const z = z0 + ((z1 - z0) * j) / nz;
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      positions.push(x, bottomAt(x, z), z);
      uvs.push(i / nx, j / nz);
    }
  }

  const stride = nx + 1;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = topOffset + j * stride + i;
      const b = topOffset + j * stride + i + 1;
      const c = topOffset + (j + 1) * stride + i;
      const d = topOffset + (j + 1) * stride + i + 1;
      indices.push(a, c, b, b, c, d);

      const e = bottomOffset + j * stride + i;
      const f = bottomOffset + j * stride + i + 1;
      const g = bottomOffset + (j + 1) * stride + i;
      const h = bottomOffset + (j + 1) * stride + i + 1;
      indices.push(e, f, g, f, h, g);
    }
  }

  // 四周侧壁
  const addWall = (
    topA: number,
    topB: number,
    bottomA: number,
    bottomB: number,
    flip: boolean,
  ) => {
    if (!flip) {
      indices.push(topA, topB, bottomA, topB, bottomB, bottomA);
    } else {
      indices.push(topA, bottomA, topB, topB, bottomA, bottomB);
    }
  };

  for (let i = 0; i < nx; i++) {
    addWall(topOffset + i, topOffset + i + 1, bottomOffset + i, bottomOffset + i + 1, false);
    const j = nz;
    addWall(
      topOffset + j * stride + i + 1,
      topOffset + j * stride + i,
      bottomOffset + j * stride + i + 1,
      bottomOffset + j * stride + i,
      false,
    );
  }
  for (let j = 0; j < nz; j++) {
    addWall(
      topOffset + (j + 1) * stride,
      topOffset + j * stride,
      bottomOffset + (j + 1) * stride,
      bottomOffset + j * stride,
      false,
    );
    addWall(
      topOffset + j * stride + nx,
      topOffset + (j + 1) * stride + nx,
      bottomOffset + j * stride + nx,
      bottomOffset + (j + 1) * stride + nx,
      false,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createFinger(finger: FingerSpec, material: THREE.Material): THREE.Mesh {
  const tip = fingerAxisTip(finger);
  const dir = new THREE.Vector3(
    tip[0] - finger.base[0],
    tip[1] - finger.base[1],
    tip[2] - finger.base[2],
  ).normalize();
  const capsuleRadius = finger.radius * 0.97;
  const bodyLength = Math.max(0.001, finger.length - capsuleRadius * 2);
  const geometry = new THREE.CapsuleGeometry(capsuleRadius, bodyLength, 8, 18);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  mesh.position.set(
    finger.base[0] + dir.x * finger.length * 0.5,
    finger.base[1] + dir.y * finger.length * 0.5,
    finger.base[2] + dir.z * finger.length * 0.5,
  );
  mesh.name = `Finger-${finger.name}`;
  mesh.frustumCulled = false;
  return mesh;
}

function createForearm(material: THREE.Material): THREE.Mesh {
  const rings = 26;
  const segments = 30;
  const xStart = 0.012;
  const xEnd = -0.258;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const x = xStart + ((xEnd - xStart) * r) / rings;
    const { y: ry, z: rz } = forearmRadii(x);
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      positions.push(x, Math.sin(a) * ry, Math.cos(a) * rz);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * segments + s;
      const b = r * segments + (s + 1) % segments;
      const c = (r + 1) * segments + s;
      const d = (r + 1) * segments + (s + 1) % segments;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Forearm';

  const elbow = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material);
  elbow.scale.set(0.02, 0.021, 0.034);
  elbow.position.set(FOREARM_FRAME.origin[0], 0, 0);
  elbow.name = 'Elbow';
  mesh.add(elbow);

  mesh.frustumCulled = false;
  return mesh;
}

function createNeck(material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(0.029, 0.034, 0.1, 20, 1, true);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(-0.46, 0.105, 0.01);
  mesh.name = 'Neck';
  mesh.frustumCulled = false;
  return mesh;
}

function createHead(material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(1, 28, 20);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(0.062, 0.072, 0.062);
  mesh.position.set(-0.46, 0.18, 0.015);
  mesh.name = 'Head';
  mesh.frustumCulled = false;
  return mesh;
}

function createUpperArm(material: THREE.Material): THREE.Group {
  const from = new THREE.Vector3(-0.255, 0, 0);
  const to = new THREE.Vector3(-0.46, 0.035, 0.01);
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = dir.length();
  dir.normalize();

  const group = new THREE.Group();
  group.name = 'UpperArm';

  const geometry = new THREE.CapsuleGeometry(0.034, Math.max(0.01, length - 0.02), 6, 18);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  mesh.position.copy(from).addScaledVector(dir, length * 0.5);
  mesh.name = 'UpperArmMesh';
  mesh.frustumCulled = false;
  group.add(mesh);

  // 肩球放在世界坐标的肩点，避免作为上臂 mesh 的子节点被二次变换
  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.042, 20, 14), material);
  shoulder.position.copy(to);
  shoulder.name = 'Shoulder';
  group.add(shoulder);
  return group;
}

export { SKIN_SHADOW };
