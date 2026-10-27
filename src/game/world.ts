import { ARENA_BLOCKS } from '../network/arena';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { box, type Solid } from './physics';

export interface TrainingTarget {
  id: number;
  root: Mesh;
  parts: Mesh[];
  downUntil: number;
}
export interface World {
  solids: Solid[];
  targets: TrainingTarget[];
  shadows: ShadowGenerator;
  spawn: { x: number; y: number; z: number };
}

export function createWorld(scene: Scene, arena = false): World {
  const solids: Solid[] = [];
  const staticMeshes: { mesh: Mesh; castsShadow: boolean }[] = [];
  scene.clearColor = Color4.FromHexString('#aeb6aeff');
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = Color3.FromHexString('#aeb6ae');
  scene.fogStart = 48;
  scene.fogEnd = 140;
  const ambient = new HemisphericLight('overcast-fill', new Vector3(0.2, 1, 0.1), scene);
  ambient.intensity = 0.78;
  ambient.groundColor = Color3.FromHexString('#444838');
  const sun = new DirectionalLight('afternoon-sun', new Vector3(-0.65, -1, 0.45), scene);
  sun.position = new Vector3(30, 45, -30);
  sun.intensity = 1.8;
  sun.diffuse = Color3.FromHexString('#ffe2af');
  const shadows = new ShadowGenerator(1024, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
  shadows.bias = 0.001;
  shadows.normalBias = 0.03;
  shadows.darkness = 0.3;
  sun.autoCalcShadowZBounds = false;
  sun.autoUpdateExtends = false;
  sun.orthoLeft = -48;
  sun.orthoRight = 48;
  sun.orthoTop = 48;
  sun.orthoBottom = -48;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 130;

  let seed = 42;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  function material(
    name: string,
    hex: string,
    pattern: 'concrete' | 'metal' | 'plain' = 'plain',
  ): StandardMaterial {
    const mat = new StandardMaterial(name, scene);
    mat.diffuseColor = Color3.FromHexString(hex);
    mat.specularColor = new Color3(0.06, 0.06, 0.05);
    if (pattern !== 'plain') {
      const tex = new DynamicTexture(
        `${name}-original-texture`,
        128,
        scene,
        false,
        Texture.NEAREST_SAMPLINGMODE,
      );
      const ctx = tex.getContext();
      ctx.fillStyle = '#bcbcbc';
      ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 3200; i++) {
        ctx.fillStyle = `rgba(25, 25, 20, ${random() * 0.24})`;
        ctx.fillRect(random() * 128, random() * 128, random() * 3 + 1, random() * 2 + 1);
      }
      if (pattern === 'metal') {
        for (let x = 0; x < 128; x += 16) {
          ctx.fillStyle = '#777974';
          ctx.fillRect(x, 0, 2, 128);
          ctx.fillStyle = '#ddddce';
          ctx.fillRect(x + 2, 0, 2, 128);
        }
      } else {
        ctx.strokeStyle = '#91958c';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, 128, 128);
      }
      tex.update();
      mat.diffuseTexture = tex;
    }
    return mat;
  }
  const concrete = material('weathered-concrete', '#8b8975', 'concrete');
  const ground = material('yard-asphalt', '#666c60', 'concrete');
  (ground.diffuseTexture as Texture).uScale = 22;
  (ground.diffuseTexture as Texture).vScale = 24;
  const green = material('faded-factory-green', '#5c6d59', 'metal');
  const rust = material('oxide-shipping-steel', '#9d5036', 'metal');
  const steel = material('dark-industrial-steel', '#373e39', 'metal');
  const pale = material('painted-ivory', '#c1baa2');
  const yellow = material('safety-yellow', '#c4ab49');
  const black = material('hazard-charcoal', '#272e28');
  const wood = material('packing-crate', '#927454', 'concrete');
  const red = material('target-orange', '#d16b38');
  const glass = material('dusty-window', '#8caca4');
  glass.emissiveColor = Color3.FromHexString('#1b2523');

  function block(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: StandardMaterial,
    solid = true,
    castsShadow = true,
  ): Mesh {
    const mesh = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.position.set(x, y, z);
    mesh.material = mat;
    mesh.receiveShadows = true;
    if (solid) solids.push(box(x, y, z, w, h, d));
    staticMeshes.push({ mesh, castsShadow });
    return mesh;
  }
  function cylinder(
    name: string,
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    mat: StandardMaterial,
    solid = true,
  ): Mesh {
    const mesh = MeshBuilder.CreateCylinder(
      name,
      { diameter: radius * 2, height, tessellation: 12 },
      scene,
    );
    mesh.position.set(x, y, z);
    mesh.material = mat;
    mesh.receiveShadows = true;
    staticMeshes.push({ mesh, castsShadow: true });
    if (solid) solids.push(box(x, y, z, radius * 2, height, radius * 2));
    return mesh;
  }
  function sign(
    text: string,
    x: number,
    y: number,
    z: number,
    width = 5,
    height = 1.2,
    facing = 0,
  ): void {
    const tex = new DynamicTexture(`sign-${text}`, { width: 1024, height: 256 }, scene, false);
    const ctx = tex.getContext();
    ctx.fillStyle = '#26342e';
    ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = '#a5b5a0';
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, 996, 228);
    tex.drawText(text, null, 157, 'bold 72px monospace', '#e1dfc3', '#26342e', true, true);
    const mat = new StandardMaterial(`sign-${text}-material`, scene);
    mat.diffuseTexture = tex;
    mat.emissiveColor = new Color3(0.25, 0.25, 0.2);
    mat.specularColor = Color3.Black();
    const mesh = MeshBuilder.CreatePlane(`sign-${text}`, { width, height }, scene);
    mesh.position.set(x, y, z);
    mesh.rotation.y = facing;
    mesh.material = mat;
  }

  if (arena) {
    for (const b of ARENA_BLOCKS)
      block(
        b.name,
        b.x,
        b.y,
        b.z,
        b.w,
        b.h,
        b.d,
        b.name === 'floor' ? ground : b.name.startsWith('crate') ? wood : concrete,
      );
    for (const { mesh } of staticMeshes) shadows.addShadowCaster(mesh);
    sign('FERRO / ARENA LOCAL', 0, 3, 15.4, 8, 1.2);
    return { solids, targets: [], shadows, spawn: { x: -12, y: 0.05, z: -12 } };
  }
  block('yard-foundation', 0, -0.5, 0, 56, 1, 64, ground, true, false);
  // Enclosed play area: north wall, sides, and the gated south entrance.
  block('north-boundary', 0, 2, 31, 56, 4, 1, concrete);
  block('west-boundary', -27.5, 2, 0, 1, 4, 64, concrete);
  block('east-boundary', 27.5, 2, 0, 1, 4, 64, concrete);
  block('south-boundary', 0, 2, -31, 56, 4, 1, concrete);
  block('entrance-gate', 0, 2.5, -30.35, 9, 5, 0.2, steel);
  sign('COMPLEXO FERRO // 04', 0, 4, -30.2, 7, 0.9, Math.PI);
  for (let z = -28; z < 31; z += 5) {
    block('wall-buttress-west', -26.8, 2.2, z, 0.8, 4.4, 0.7, concrete);
    block('wall-buttress-east', 26.8, 2.2, z, 0.8, 4.4, 0.7, concrete);
  }
  for (let z = -23; z < 29; z += 5) {
    block('lane-marking', 1, 0.012, z, 0.15, 0.024, 2.6, yellow, false, false);
  }
  block('loading-bay-yellow-outline', -17.6, 0.014, -15, 12, 0.028, 0.16, yellow, false, false);
  for (let i = 0; i < 9; i++) {
    const stripe = block(
      'loading-hazard-stripe',
      -23 + i * 1.35,
      0.018,
      -14.3,
      0.65,
      0.03,
      1.4,
      yellow,
      false,
      false,
    );
    stripe.rotation.y = -0.5;
  }

  // Warehouse A is a traversable interior, with an actual doorway and roof.
  block('warehouse-A-west', -24, 2.6, 3, 0.5, 5.2, 28, green);
  block('warehouse-A-east', -12, 2.6, 3, 0.5, 5.2, 28, green);
  block('warehouse-A-north', -18, 2.6, 17, 12.5, 5.2, 0.5, green);
  block('warehouse-A-front-left', -22.2, 2.6, -11, 4.1, 5.2, 0.5, green);
  block('warehouse-A-front-right', -13.8, 2.6, -11, 4.1, 5.2, 0.5, green);
  block('warehouse-A-door-lintel', -18, 4.6, -11, 4.4, 1.2, 0.5, green);
  block('warehouse-A-roof', -18, 5.3, 3, 13.5, 0.35, 29.5, steel);
  sign('ARMAZÉM  A', -18, 4.55, -11.28, 4, 0.7);
  for (let z = -7; z < 16; z += 7) {
    block('warehouse-window', -11.72, 3.5, z, 0.06, 1.2, 3, glass, false);
    block('warehouse-support', -12.5, 2.5, z, 0.3, 5, 0.3, steel);
    block('warehouse-support', -23.5, 2.5, z, 0.3, 5, 0.3, steel);
    block('warehouse-roof-truss', -18, 4.85, z, 11.5, 0.25, 0.25, steel);
  }
  block('interior-crates', -21, 0.8, 0, 3, 1.6, 3, wood);
  block('interior-crate-small', -15, 0.45, 6, 2, 0.9, 2, wood);
  block('interior-workbench', -21, 0.65, 12, 3, 1.3, 1.3, steel);

  // Eastern loading yard and original modular shipping containers.
  function container(
    x: number,
    z: number,
    length: number,
    mat: StandardMaterial,
    label: string,
  ): void {
    block(`container-${label}`, x, 1.55, z, 5.5, 3.1, length, mat);
    block('container-roof-rim', x, 3.15, z, 5.65, 0.15, length + 0.1, steel);
    for (const dx of [-2.2, 2.2])
      block('container-corner', x + dx, 1.55, z - length / 2 - 0.04, 0.15, 3, 0.1, steel, false);
    block('container-door-seam', x, 1.55, z - length / 2 - 0.06, 0.08, 2.8, 0.07, steel, false);
    sign(label, x, 2.2, z - length / 2 - 0.1, 3, 0.65);
  }
  container(17, -4, 12, rust, 'FR // 082');
  container(23, 14, 9, green, 'FR // 106');
  container(-4.5, 19, 9, rust, 'FR // 024');
  block('warehouse-B', 15, 3.8, 25, 15, 7.6, 10, concrete);
  block('warehouse-B-roof', 15, 7.7, 25, 16, 0.3, 11, steel);
  block('warehouse-B-rolling-door', 13, 2, 19.94, 5, 4, 0.08, steel, false);
  sign('SETOR 04 / EXPEDIÇÃO', 15, 5.8, 19.9, 8, 1);
  for (let x = 9; x < 22; x += 4)
    block('warehouse-B-window', x, 6.65, 19.9, 2.7, 0.65, 0.06, glass, false);

  function crate(x: number, z: number, size = 1.6, base = 0): void {
    block('cargo-crate', x, base + size / 2, z, size, size, size, wood);
    for (const dx of [-size / 2 + 0.09, size / 2 - 0.09]) {
      block(
        'crate-metal-banding',
        x + dx,
        base + size / 2,
        z,
        0.08,
        size + 0.02,
        size + 0.02,
        steel,
        false,
      );
    }
  }
  crate(-5, -4, 1.6);
  crate(-6.8, -4, 1.6);
  crate(-5.9, -4, 1.4, 1.6);
  crate(8, -17, 1.7);
  crate(10, -17, 1.4);
  crate(8, -17, 1.3, 1.7);
  crate(-7.5, 9, 1.4);
  crate(13, 12, 1.8);
  // Jumpable low packing blocks and concrete cover.
  block('low-packing-step', -3, 0.4, -5, 2, 0.8, 2, wood);
  block('cover-west', -6, 0.65, -14, 4, 1.3, 0.65, concrete);
  block('cover-north', 0, 0.65, 27, 5, 1.3, 0.65, concrete);
  block('cover-east', 7, 0.65, 15, 0.65, 1.3, 4, concrete);
  for (let i = 0; i < 3; i++) {
    cylinder('fuel-drum', -8 + i * 1.1, 0.6, 3, 0.48, 1.2, i === 1 ? rust : steel);
    cylinder('fuel-drum-rim', -8 + i * 1.1, 1.17, 3, 0.5, 0.08, black, false);
  }
  // Two low maintenance passages make crouching and going prone useful.
  for (const [z, clearance] of [
    [3, 1.25],
    [9, 0.65],
  ]) {
    block('service-passage-roof', 5, clearance + 0.2, z, 4, 0.4, 3, steel);
    block(
      'service-passage-left',
      2.8,
      (clearance + 0.4) / 2,
      z,
      0.4,
      clearance + 0.4,
      3.5,
      concrete,
    );
    block(
      'service-passage-right',
      7.2,
      (clearance + 0.4) / 2,
      z,
      0.4,
      clearance + 0.4,
      3.5,
      concrete,
    );
    sign(
      clearance > 1 ? 'CTRL / ABAIXE-SE' : 'Z / DEITE-SE',
      5,
      clearance + 0.21,
      z - 1.76,
      3.8,
      0.36,
    );
  }
  // Cooling towers and pipework provide a recognizable industrial skyline.
  for (const x of [-22, -15]) {
    cylinder('cooling-silo', x, 5, 24, 2.7, 10, pale);
    cylinder('silo-cap', x, 10, 24, 2.85, 0.4, steel, false);
    cylinder('silo-vent', x, 10.8, 24, 0.65, 1.5, steel, false);
    block('silo-number-plate', x, 5, 21.27, 2, 2, 0.1, green, false);
    sign(x === -22 ? '01' : '02', x, 5, 21.2, 1.7, 1.2);
  }
  cylinder('chimney', -22, 10, 37, 1.5, 20, concrete, false);
  cylinder('chimney-band', -22, 17, 37, 1.52, 2, rust, false);
  for (const x of [-10, 10]) block('overhead-pipe-support', x, 3.9, -0.5, 0.35, 7.8, 0.35, steel);
  const pipe = cylinder('overhead-pipeline', 0, 7.7, -0.5, 0.35, 21, rust, false);
  pipe.rotation.z = Math.PI / 2;
  block('pipe-crossbeam', 0, 7.2, -0.5, 21, 0.3, 0.5, steel);
  for (const x of [-10, 10]) {
    block('pipe-support-guard', x, 0.5, -0.5, 0.65, 1, 0.65, yellow);
  }
  for (const [x, z] of [
    [-25, -18],
    [25, -17],
    [25, 28],
  ]) {
    cylinder('yard-lamp-pole', x, 4.5, z, 0.1, 9, steel);
    block('yard-lamp', x, 9, z, 1.2, 0.22, 0.65, pale, false);
  }
  // Distant silhouettes are scenery outside the closed collision boundary.
  for (let i = 0; i < 7; i++) {
    block(
      'distant-industrial-building',
      -50 + i * 16,
      4 + (i % 3),
      52,
      12,
      8 + (i % 3) * 2,
      15,
      i % 2 ? green : concrete,
      false,
    );
  }

  // Batch static primitives by material to keep draw calls low on integrated GPUs.
  const groups = new Map<string, { meshes: Mesh[]; castsShadow: boolean }>();
  for (const { mesh, castsShadow } of staticMeshes) {
    const key = `${mesh.material!.id}:${castsShadow}`;
    const group = groups.get(key) ?? { meshes: [], castsShadow };
    group.meshes.push(mesh);
    groups.set(key, group);
  }
  for (const [name, group] of groups) {
    const merged = Mesh.MergeMeshes(group.meshes, true, true);
    if (!merged) continue;
    merged.name = `static-${name}`;
    merged.receiveShadows = true;
    merged.freezeWorldMatrix();
    if (group.castsShadow) shadows.addShadowCaster(merged);
  }
  // The directional-light projection is fixed; redraw only when targets change.
  const shadowMap = shadows.getShadowMap();
  if (shadowMap) shadowMap.refreshRate = 0;

  const targets: TrainingTarget[] = [];
  const positions = [
    [-8.5, 0, 14],
    [0, 0, 22],
    [10.5, 0, 10],
    [-18, 0, 9],
    [22, 0, -17],
    [0, 0, -8],
  ];
  positions.forEach(([x, y, z], id) => {
    const root = MeshBuilder.CreateBox(
      `target-${id}-base`,
      { width: 0.8, height: 0.12, depth: 0.6 },
      scene,
    );
    root.position.set(x, y + 0.06, z);
    root.material = steel;
    const parts: Mesh[] = [];
    const add = (mesh: Mesh, offset: Vector3, mat: StandardMaterial) => {
      mesh.parent = root;
      mesh.position.copyFrom(offset);
      mesh.material = mat;
      mesh.metadata = { targetId: id };
      mesh.receiveShadows = true;
      shadows.addShadowCaster(mesh);
      parts.push(mesh);
    };
    add(
      MeshBuilder.CreateBox(`target-${id}-stand`, { width: 0.08, height: 1, depth: 0.08 }, scene),
      new Vector3(0, 0.5, 0),
      steel,
    );
    add(
      MeshBuilder.CreateBox(`target-${id}-body`, { width: 0.68, height: 0.85, depth: 0.14 }, scene),
      new Vector3(0, 1.25, 0),
      red,
    );
    add(
      MeshBuilder.CreateCylinder(
        `target-${id}-head`,
        { diameter: 0.38, height: 0.15, tessellation: 12 },
        scene,
      ),
      new Vector3(0, 1.9, 0),
      red,
    );
    parts[2].rotation.x = Math.PI / 2;
    add(
      MeshBuilder.CreateBox(
        `target-${id}-bullseye`,
        { width: 0.23, height: 0.23, depth: 0.16 },
        scene,
      ),
      new Vector3(0, 1.35, -0.02),
      pale,
    );
    targets.push({ id, root, parts, downUntil: 0 });
  });

  return { solids, targets, shadows, spawn: { x: 0, y: 0.05, z: -22 } };
}

export function getTargetId(mesh: AbstractMesh | null): number | undefined {
  const metadata: unknown = mesh?.metadata;
  if (
    metadata &&
    typeof metadata === 'object' &&
    'targetId' in metadata &&
    typeof metadata.targetId === 'number'
  )
    return metadata.targetId;
  return undefined;
}
