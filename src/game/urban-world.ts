import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';
import type { MapDefinition } from './maps';
import type { World } from './world';

type Surface = 'asphalt' | 'plaster' | 'brick' | 'paving' | 'tile' | 'plain';

/** Original street scenery. Only the shared map blocks become pickable solid surfaces. */
export function createUrbanWorld(scene: Scene, definition: MapDefinition): World {
  scene.clearColor = Color4.FromHexString('#bad0d6ff');
  scene.fogMode = 3;
  scene.fogColor = Color3.FromHexString('#d4d4c5');
  scene.fogStart = 52;
  scene.fogEnd = 120;
  const ambient = new HemisphericLight('quarter-sky', new Vector3(0.25, 1, 0.15), scene);
  ambient.intensity = 0.83;
  ambient.groundColor = Color3.FromHexString('#5c594e');
  const sun = new DirectionalLight('quarter-afternoon', new Vector3(-0.55, -1, 0.38), scene);
  sun.position.set(28, 42, -25);
  sun.intensity = 1.45;
  sun.diffuse = Color3.FromHexString('#ffe5bb');
  sun.autoCalcShadowZBounds = false;
  sun.autoUpdateExtends = false;
  sun.orthoLeft = -42;
  sun.orthoRight = 42;
  sun.orthoTop = 42;
  sun.orthoBottom = -42;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 110;
  const shadows = new ShadowGenerator(1024, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
  shadows.bias = 0.001;
  shadows.normalBias = 0.025;
  shadows.darkness = 0.32;

  let seed = 713;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const makeMaterial = (name: string, color: string, surface: Surface = 'plain') => {
    const material = new StandardMaterial(`quarter-${name}`, scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.specularColor.set(0.035, 0.035, 0.035);
    if (surface === 'plain') return material;
    const texture = new DynamicTexture(
      `quarter-${name}-original`,
      128,
      scene,
      false,
      Texture.NEAREST_SAMPLINGMODE,
    );
    const context = texture.getContext();
    context.fillStyle = '#bcbab2';
    context.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1800; i++) {
      context.fillStyle = `rgba(${random() > 0.5 ? '245,240,218' : '30,30,25'},${random() * 0.2})`;
      context.fillRect(random() * 128, random() * 128, 1 + random() * 2, 1 + random() * 2);
    }
    if (surface === 'brick' || surface === 'paving') {
      const height = surface === 'brick' ? 16 : 21;
      for (let row = -1; row < 9; row++) {
        for (let column = -1; column < 6; column++) {
          const x = column * 32 + (row % 2 ? 16 : 0),
            y = row * height;
          context.fillStyle = `rgba(25,25,20,${0.03 + random() * 0.12})`;
          context.fillRect(x + 1, y + 1, 30, height - 2);
          context.strokeStyle = surface === 'brick' ? '#d3ccba' : '#777970';
          context.lineWidth = surface === 'brick' ? 1 : 2;
          context.strokeRect(x, y, 32, height);
        }
      }
    } else if (surface === 'tile') {
      for (let y = 0; y < 128; y += 16) {
        context.fillStyle = '#8d7965';
        context.fillRect(0, y, 128, 3);
        for (let x = 0; x < 128; x += 16) {
          context.strokeStyle = '#d1bd99';
          context.beginPath();
          context.moveTo(x, y + 3);
          context.lineTo(x + 2, y + 15);
          context.stroke();
        }
      }
    } else if (surface === 'plaster') {
      context.fillStyle = 'rgba(65,56,40,0.12)';
      context.fillRect(0, 113, 128, 15);
    }
    texture.update();
    texture.uScale = surface === 'asphalt' ? 14 : 2;
    texture.vScale = surface === 'asphalt' ? 14 : 2;
    material.diffuseTexture = texture;
    return material;
  };
  const asphalt = makeMaterial('asphalt', '#515653', 'asphalt');
  const plaster = [
    makeMaterial('warm-stucco', '#d7c4a0', 'plaster'),
    makeMaterial('ochre-stucco', '#c9ad7e', 'plaster'),
    makeMaterial('blue-stucco', '#8dadae', 'plaster'),
  ];
  const brick = makeMaterial('old-brick', '#aa7357', 'brick');
  const paving = makeMaterial('limestone-paving', '#c1bca9', 'paving');
  const roof = makeMaterial('terracotta', '#ad6144', 'tile');
  const trim = makeMaterial('ivory-trim', '#e0d7bd');
  const dark = makeMaterial('painted-charcoal', '#303c39');
  const shutters = makeMaterial('teal-shutters', '#416c68');
  const glass = makeMaterial('window-glass', '#567779');
  glass.emissiveColor.set(0.055, 0.095, 0.1);
  const metal = makeMaterial('street-metal', '#4d5b50');
  const van = makeMaterial('delivery-van', '#c8c8b4');
  const wood = makeMaterial('market-wood', '#967752', 'plaster');
  const awning = makeMaterial('awning-red', '#b55d48');
  const yellow = makeMaterial('road-paint', '#e0d2a3');
  const water = makeMaterial('fountain-water', '#659594');
  water.specularColor.set(0.4, 0.4, 0.35);
  const entries: { mesh: Mesh; castsShadow: boolean }[] = [];
  const box = (
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: StandardMaterial,
    pickable = false,
    castsShadow = false,
  ) => {
    const mesh = MeshBuilder.CreateBox(`quarter-${name}`, { width: w, height: h, depth: d }, scene);
    mesh.position.set(x, y, z);
    mesh.material = material;
    mesh.isPickable = pickable;
    mesh.receiveShadows = true;
    entries.push({ mesh, castsShadow });
    return mesh;
  };
  const textSign = (text: string, x: number, y: number, z: number, width: number, facing = 0) => {
    const texture = new DynamicTexture(
      `quarter-sign-${text}`,
      { width: 512, height: 128 },
      scene,
      false,
    );
    texture.drawText(text, null, 84, 'bold 48px monospace', '#eee1bd', '#345854', true, true);
    const material = new StandardMaterial(`quarter-sign-${text}`, scene);
    material.diffuseTexture = texture;
    material.emissiveColor.set(0.2, 0.2, 0.15);
    material.specularColor.set(0, 0, 0);
    const mesh = MeshBuilder.CreatePlane(
      `quarter-sign-${text}`,
      { width, height: width / 4 },
      scene,
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = facing;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
  };
  const gabledRoof = (
    x: number,
    y: number,
    z: number,
    width: number,
    depth: number,
    rise: number,
    wall: StandardMaterial,
  ) => {
    const angle = Math.atan2(rise, width / 2);
    for (const side of [-1, 1]) {
      const panel = box(
        'pitched-terracotta-roof',
        x + (side * width) / 4,
        y + rise / 2,
        z,
        Math.hypot(width / 2, rise) + 0.12,
        0.16,
        depth + 0.2,
        roof,
      );
      panel.rotation.z = -side * angle;
    }
    const mesh = new Mesh('quarter-townhouse-gables', scene);
    const positions = [
      -width / 2,
      0,
      -depth / 2,
      width / 2,
      0,
      -depth / 2,
      0,
      rise,
      -depth / 2,
      -width / 2,
      0,
      depth / 2,
      width / 2,
      0,
      depth / 2,
      0,
      rise,
      depth / 2,
    ];
    const indices = [0, 2, 1, 3, 4, 5],
      normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    data.uvs = [0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 0.5, 1];
    data.applyToMesh(mesh);
    mesh.position.set(x, y, z);
    mesh.material = wall;
    mesh.isPickable = false;
    entries.push({ mesh, castsShadow: false });
  };
  const facade = (block: MapDefinition['blocks'][number], material: StandardMaterial) => {
    const horizontal = block.w >= block.d;
    const span = horizontal ? block.w : block.d;
    if (span < 2.6 || Math.min(block.w, block.d) > 1.2 || block.h < 3.2) return;
    const bottom = block.y - block.h / 2;
    for (const direction of [-1, 1]) {
      const face =
        (horizontal ? block.z : block.x) +
        direction * ((horizontal ? block.d : block.w) / 2 + 0.012);
      for (let height = bottom + 2.25; height < bottom + block.h - 0.55; height += 2.4) {
        const count = Math.max(1, Math.floor(span / 2.5));
        for (let i = 0; i < count; i++) {
          const along = ((i + 0.5) * span) / count - span / 2;
          const x = horizontal ? block.x + along : face,
            z = horizontal ? face : block.z + along;
          box(
            'window-frame',
            x,
            height,
            z,
            horizontal ? 1.08 : 0.022,
            1.22,
            horizontal ? 0.022 : 1.08,
            trim,
          );
          box(
            'window-pane',
            x + (horizontal ? 0 : direction * 0.014),
            height,
            z + (horizontal ? direction * 0.014 : 0),
            horizontal ? 0.86 : 0.012,
            1.02,
            horizontal ? 0.012 : 0.86,
            glass,
          );
          box(
            'window-mullion',
            x + (horizontal ? 0 : direction * 0.025),
            height,
            z + (horizontal ? direction * 0.025 : 0),
            horizontal ? 0.035 : 0.014,
            1.04,
            horizontal ? 0.014 : 0.035,
            trim,
          );
          for (const side of [-1, 1])
            box(
              'window-shutter',
              x + (horizontal ? side * 0.66 : direction * 0.01),
              height,
              z + (horizontal ? direction * 0.01 : side * 0.66),
              horizontal ? 0.22 : 0.025,
              1.15,
              horizontal ? 0.025 : 0.22,
              shutters,
            );
          box(
            'window-sill',
            x,
            height - 0.66,
            z,
            horizontal ? 1.23 : 0.06,
            0.08,
            horizontal ? 0.06 : 1.23,
            material,
          );
        }
      }
      box(
        'facade-base-course',
        horizontal ? block.x : face,
        bottom + 0.24,
        horizontal ? face : block.z,
        horizontal ? span : 0.035,
        0.48,
        horizontal ? 0.035 : span,
        paving,
      );
    }
  };
  const physicalMaterial = (name: string) => {
    if (name === 'floor') return asphalt;
    if (/curb|pavement|sidewalk|step|fountain|plaza/.test(name)) return paving;
    if (/roof/.test(name)) return roof;
    if (/van/.test(name)) return van;
    if (/stall|bench|crate|counter|kiosk/.test(name)) return wood;
    if (/bin|gate|fence/.test(name)) return metal;
    if (/brick|boundary|planter/.test(name)) return brick;
    let hash = 0;
    for (const letter of name.split('-').slice(0, 2).join('-')) hash += letter.charCodeAt(0);
    return plaster[hash % plaster.length];
  };
  for (const block of definition.blocks) {
    const material = physicalMaterial(block.name);
    box(
      block.name,
      block.x,
      block.y,
      block.z,
      block.w,
      block.h,
      block.d,
      material,
      true,
      block.name !== 'floor',
    );
    if (/building/.test(block.name) && !/roof|lintel/.test(block.name)) facade(block, trim);
    if (/roof/.test(block.name)) {
      box(
        'roof-coping',
        block.x,
        block.y + block.h / 2 + 0.014,
        block.z,
        block.w,
        0.028,
        block.d,
        roof,
      );
    }
    if (/van/.test(block.name) && block.h > 1) {
      const alongZ = block.d >= block.w;
      const width = alongZ ? block.w : block.d,
        length = alongZ ? block.d : block.w;
      const bottom = block.y - block.h / 2;
      for (const side of [-1, 1]) {
        for (const end of [-1, 1]) {
          const wheel = MeshBuilder.CreateCylinder(
            'quarter-van-wheel',
            { diameter: 0.66, height: 0.12, tessellation: 10 },
            scene,
          );
          wheel.position.set(
            block.x + (alongZ ? side * (width / 2 - 0.03) : end * length * 0.3),
            bottom + 0.34,
            block.z + (alongZ ? end * length * 0.3 : side * (width / 2 - 0.03)),
          );
          wheel.rotation[alongZ ? 'z' : 'x'] = Math.PI / 2;
          wheel.material = dark;
          wheel.isPickable = false;
          entries.push({ mesh: wheel, castsShadow: false });
        }
        box(
          'van-side-window',
          block.x + (alongZ ? side * (width / 2 + 0.008) : length * 0.25),
          block.y + block.h * 0.22,
          block.z + (alongZ ? length * 0.25 : side * (width / 2 + 0.008)),
          alongZ ? 0.012 : length * 0.2,
          block.h * 0.3,
          alongZ ? length * 0.2 : 0.012,
          glass,
        );
      }
      box(
        'van-windshield',
        block.x + (alongZ ? 0 : length / 2 + 0.008),
        block.y + block.h * 0.2,
        block.z + (alongZ ? length / 2 + 0.008 : 0),
        alongZ ? width * 0.8 : 0.012,
        block.h * 0.33,
        alongZ ? 0.012 : width * 0.8,
        glass,
      );
    }
    if (/market.*roof|stall.*roof|awning/.test(block.name)) {
      for (let i = 0; i < 8; i++)
        box(
          'market-striped-canopy',
          block.x - block.w / 2 + (block.w * (i + 0.5)) / 8,
          block.y - block.h / 2 - 0.012,
          block.z,
          block.w / 8 - 0.01,
          0.022,
          block.d,
          i % 2 ? trim : awning,
        );
    }
    if (/fountain/.test(block.name)) {
      box(
        'fountain-blue-inset',
        block.x,
        block.y + block.h / 2 + 0.015,
        block.z,
        block.w * 0.82,
        0.025,
        block.d * 0.82,
        water,
      );
    }
    if (/market-stall/.test(block.name)) {
      for (const strip of [-1, 0, 1])
        box(
          'market-counter-stripe',
          block.x + (strip * block.w) / 3.5,
          block.y + block.h / 2 + 0.012,
          block.z,
          block.w / 7,
          0.022,
          block.d * 0.9,
          strip ? awning : trim,
        );
      for (const side of [-1, 1])
        box(
          'market-crate-rim',
          block.x + side * (block.w / 2 - 0.03),
          block.y + block.h / 2 - 0.08,
          block.z,
          0.06,
          0.16,
          block.d,
          dark,
        );
    }
    if (/planter/.test(block.name)) {
      box(
        'planter-green-inset',
        block.x,
        block.y + block.h / 2 - 0.06,
        block.z,
        block.w * 0.76,
        0.14,
        block.d * 0.76,
        shutters,
      );
      for (const side of [-1, 1])
        for (const offset of [-0.45, 0, 0.45])
          box(
            'planter-flowers',
            block.x + offset,
            block.y + block.h / 2 + 0.012,
            block.z + side * 0.45,
            0.13,
            0.025,
            0.13,
            awning,
          );
    }
  }

  // Flat paint/tile overlays share the real street floor and never add collision volumes.
  box('pedestrian-square-paving', 0, 0.008, 1, 12.4, 0.012, 14, paving);
  box('north-courtyard-paving', 0, 0.008, 13, 13.4, 0.012, 9.6, paving);
  box('cafe-interior-floor', -12, 0.009, 0, 9.6, 0.014, 13.6, paving);
  box('market-interior-floor', 12, 0.009, 2, 9.6, 0.014, 13.6, paving);
  for (const x of [-21.9, 21.9]) box('sidewalk-tile-strip', x, 0.008, 0, 2.8, 0.012, 46.7, paving);
  for (const z of [-20.8, 20.8]) box('street-edge-paving', 0, 0.008, z, 40.9, 0.012, 2.4, paving);
  for (const x of [-5.9, 5.9]) box('plaza-stone-border', x, 0.018, 1, 0.2, 0.012, 14, trim);
  for (const z of [-15.9, -15.3, -14.7, -14.1])
    box('street-crossing-paint', 9, 0.009, z, 3.4, 0.014, 0.22, yellow);

  // Readable neighborhood façades rise behind the playable boundary walls.
  for (const x of [-30.5, 30.5]) {
    for (const z of [-16, -2, 12]) {
      const height = z === -2 ? 12 : 9.5;
      box('side-townhouse', x, height / 2, z, 12, height, 12.5, plaster[z === -2 ? 2 : 0]);
      gabledRoof(x, height, z, 12.5, 13, 2.4, plaster[z === -2 ? 2 : 0]);
      for (const wy of [3.5, 6.3, 8.8])
        for (const wz of [-3.6, 0, 3.6])
          box(
            'side-townhouse-window',
            x - Math.sign(x) * 6.01,
            wy,
            z + wz,
            0.025,
            1.35,
            1.3,
            glass,
          );
      box('side-townhouse-cornice', x, height - 0.18, z, 12.1, 0.18, 12.6, trim);
    }
  }

  // Background roofs sit behind the closed collision perimeter and cannot intercept shots.
  for (const side of [-1, 1]) {
    for (let i = -2; i <= 2; i++) {
      const x = i * 12,
        z = side * 33,
        height = 9 + ((i + 3) % 3) * 1.5;
      box('distant-townhouse', x, height / 2, z, 11, height, 13, plaster[(i + 3) % plaster.length]);
      gabledRoof(x, height, z, 11.4, 13.4, 2.1 + (i % 2) * 0.3, plaster[(i + 3) % plaster.length]);
      for (const wx of [-3.7, 0, 3.7])
        for (const wy of [3.3, 6.4])
          box('distant-window', x + wx, wy, z - side * 6.51, 1.4, 1.6, 0.03, glass);
    }
  }
  const groups = new Map<string, { meshes: Mesh[]; pickable: boolean; castsShadow: boolean }>();
  for (const entry of entries) {
    const key = `${entry.mesh.material!.id}:${entry.mesh.isPickable}:${entry.castsShadow}`;
    const group = groups.get(key) ?? {
      meshes: [],
      pickable: entry.mesh.isPickable,
      castsShadow: entry.castsShadow,
    };
    group.meshes.push(entry.mesh);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    const merged = Mesh.MergeMeshes(group.meshes, true, true);
    if (!merged) continue;
    merged.name = `quarter-static-${key}`;
    merged.isPickable = group.pickable;
    merged.receiveShadows = true;
    merged.freezeWorldMatrix();
    if (group.castsShadow) shadows.addShadowCaster(merged);
  }
  textSign('BAIRRO ANTIGO', 0, 3.1, definition.bounds.minZ + 0.025, 6, Math.PI);
  textSign('PRACA / MERCADO', 0, 2.8, definition.bounds.maxZ - 0.025, 6);
  textSign('CAFE AURORA', -12, 3.72, -7.225, 3.2);
  textSign('MERCADO DA PRACA', 12, 4.02, -5.225, 3.2);
  textSign('JORNAIS', -4, 0.92, 9.785, 2);
  // A few bright street markings stay flush to the road and have no collision or picking.
  const openGround = (x: number, z: number) =>
    !definition.solids.some(
      (solid) =>
        solid.max.y > 0.25 &&
        solid.min.y < 1.8 &&
        x > solid.min.x - 0.1 &&
        x < solid.max.x + 0.1 &&
        z > solid.min.z - 0.1 &&
        z < solid.max.z + 0.1,
    );
  // Kept separate from map physics; markings never resemble traversable obstacles.
  const markings: Mesh[] = [];
  for (let z = definition.bounds.minZ + 3; z <= definition.bounds.maxZ - 3; z += 3) {
    if (!openGround(0, z)) continue;
    const mesh = MeshBuilder.CreateBox(
      'quarter-road-dash',
      { width: 0.1, height: 0.012, depth: 1.25 },
      scene,
    );
    mesh.position.set(0, 0.008, z);
    mesh.material = yellow;
    mesh.isPickable = false;
    markings.push(mesh);
  }
  if (markings.length) {
    const merged = Mesh.MergeMeshes(markings, true, true);
    if (merged) {
      merged.isPickable = false;
      merged.freezeWorldMatrix();
    }
  }
  const shadowMap = shadows.getShadowMap();
  if (shadowMap) shadowMap.refreshRate = 0;
  return {
    solids: [...definition.solids],
    targets: [],
    shadows,
    spawn: { ...definition.spawns[0] },
  };
}
