import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { mapInfo } from './map-catalog';
import type { MapBlock, MapDefinition } from './maps';
import type { World } from './world';

type Theme =
  'industrial' | 'urban' | 'desert' | 'forest' | 'snow' | 'harbor' | 'laboratory' | 'ruins';
type Surface =
  | 'paving'
  | 'concrete'
  | 'brick'
  | 'metal'
  | 'wood'
  | 'sand'
  | 'snow'
  | 'soil'
  | 'tile'
  | 'asphalt';
const PALETTES: Record<
  Theme,
  {
    sky: string;
    haze: string;
    wall: string;
    ground: string;
    accent: string;
    roof: string;
    sun: string;
    surface: Surface;
  }
> = {
  industrial: {
    sky: '#9cb7c6',
    haze: '#c8cbc2',
    wall: '#b0b2a6',
    ground: '#535d58',
    accent: '#557169',
    roof: '#525e5e',
    sun: '#ffe7c4',
    surface: 'asphalt',
  },
  urban: {
    sky: '#9dbfd3',
    haze: '#d4d4bf',
    wall: '#cbb58e',
    ground: '#8b9085',
    accent: '#426d6b',
    roof: '#98553d',
    sun: '#ffe8c2',
    surface: 'paving',
  },
  desert: {
    sky: '#b0cbd6',
    haze: '#e0d0ab',
    wall: '#c6a574',
    ground: '#bea16f',
    accent: '#597778',
    roof: '#917551',
    sun: '#fff1d3',
    surface: 'sand',
  },
  forest: {
    sky: '#a6bcbc',
    haze: '#b4beb0',
    wall: '#9b9e88',
    ground: '#777b63',
    accent: '#4f6650',
    roof: '#4d5a4f',
    sun: '#f6e9ce',
    surface: 'soil',
  },
  snow: {
    sky: '#afc5d6',
    haze: '#dce3e6',
    wall: '#a9b7b6',
    ground: '#e1e5dd',
    accent: '#6e868b',
    roof: '#8c9b9f',
    sun: '#f0f5ff',
    surface: 'snow',
  },
  harbor: {
    sky: '#91b5c7',
    haze: '#b6cbce',
    wall: '#aeb9b4',
    ground: '#536365',
    accent: '#377a84',
    roof: '#536a72',
    sun: '#ffe9d0',
    surface: 'asphalt',
  },
  laboratory: {
    sky: '#adc2cb',
    haze: '#c4d3d4',
    wall: '#d6ded9',
    ground: '#939f9c',
    accent: '#3c7d86',
    roof: '#727e7f',
    sun: '#eff6fb',
    surface: 'tile',
  },
  ruins: {
    sky: '#9eb9c7',
    haze: '#c6c4af',
    wall: '#b8af95',
    ground: '#8c9381',
    accent: '#677353',
    roof: '#847d68',
    sun: '#ffe4ba',
    surface: 'paving',
  },
};

/** Original reusable surface/detail vocabulary; collision always comes from the selected map. */
export function createCatalogWorld(scene: Scene, definition: MapDefinition): World {
  const theme = mapInfo(definition.id).theme as Theme;
  const palette = PALETTES[theme] ?? PALETTES.industrial;
  const { bounds } = definition;
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  let seed =
    [...definition.id].reduce(
      (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619),
      2166136261,
    ) >>> 0;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const textures = typeof document !== 'undefined';
  scene.clearColor = Color4.FromHexString(`${palette.sky}ff`);
  scene.fogMode = 3;
  scene.fogColor = Color3.FromHexString(palette.haze);
  scene.fogStart = Math.max(width, depth) * 1.15;
  scene.fogEnd = Math.max(width, depth) * 2.4;
  const fill = new HemisphericLight('catalog-skylight', new Vector3(0.2, 1, 0.25), scene);
  fill.intensity = theme === 'laboratory' ? 0.88 : 0.74;
  fill.groundColor = Color3.FromHexString(theme === 'snow' ? '#8c979c' : '#51574d');
  const sun = new DirectionalLight('catalog-sun', new Vector3(-0.48, -1, 0.32), scene);
  sun.position.set(32, 55, -32);
  sun.diffuse = Color3.FromHexString(palette.sun);
  sun.intensity = theme === 'snow' ? 1.18 : 1.45;
  sun.autoCalcShadowZBounds = false;
  sun.autoUpdateExtends = false;
  const extent = Math.max(width, depth) * 0.8;
  sun.orthoLeft = -extent;
  sun.orthoRight = extent;
  sun.orthoBottom = -extent;
  sun.orthoTop = extent;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 140;
  const shadows = new ShadowGenerator(1024, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
  shadows.bias = 0.001;
  shadows.normalBias = 0.025;
  shadows.darkness = 0.3;

  const material = (name: string, color: string, surface?: Surface, scale = 1) => {
    const mat = new StandardMaterial(`catalog-${name}`, scene);
    mat.diffuseColor = Color3.FromHexString(color);
    mat.specularColor.set(0.045, 0.045, 0.045);
    mat.specularPower = 38;
    if (!surface || !textures) return mat;
    const tex = new DynamicTexture(
      `catalog-${name}-original`,
      256,
      scene,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    const ctx = tex.getContext();
    ctx.fillStyle = surface === 'asphalt' ? '#aaada4' : '#c3c2ba';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3500; i++) {
      ctx.fillStyle = `rgba(${random() > 0.48 ? '255,254,245' : '42,43,36'},${random() * (surface === 'snow' ? 0.09 : 0.17)})`;
      ctx.fillRect(random() * 256, random() * 256, 1 + random() * 2, 1 + random() * 2);
    }
    if (surface === 'brick' || surface === 'paving' || surface === 'tile') {
      const h = surface === 'brick' ? 24 : surface === 'tile' ? 64 : 48;
      const w = surface === 'brick' ? 64 : h;
      ctx.strokeStyle = surface === 'brick' ? '#dbd5c2' : '#90958e';
      ctx.lineWidth = surface === 'tile' ? 2 : 3;
      for (let row = -1; row < 12; row++)
        for (let col = -1; col < 7; col++) {
          const x = col * w + (surface === 'brick' && row % 2 ? w / 2 : 0),
            y = row * h;
          ctx.fillStyle = `rgba(46,46,37,${random() * 0.14})`;
          ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
          ctx.strokeRect(x, y, w, h);
        }
    } else if (surface === 'metal' || surface === 'wood') {
      for (let x = 0; x < 256; x += surface === 'metal' ? 24 : 40) {
        ctx.fillStyle = surface === 'metal' ? '#a0a49c' : '#999785';
        ctx.fillRect(x, 0, 3, 256);
        ctx.fillStyle = '#dedfd2';
        ctx.fillRect(x + 3, 0, 2, 256);
        if (surface === 'metal')
          for (const y of [12, 242]) {
            ctx.fillStyle = '#777f79';
            ctx.fillRect(x + 10, y, 3, 3);
          }
      }
      if (surface === 'wood')
        for (let i = 0; i < 100; i++) {
          ctx.fillStyle = '#b4b19c';
          ctx.fillRect(random() * 256, random() * 256, 1, 12 + random() * 50);
        }
    } else if (surface === 'concrete' || surface === 'asphalt') {
      ctx.strokeStyle = surface === 'asphalt' ? '#636d65' : '#879087';
      ctx.lineWidth = surface === 'asphalt' ? 1.8 : 2;
      ctx.strokeRect(0, 0, 256, 256);
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        const x = random() * 256,
          y = random() * 256;
        ctx.moveTo(x, y);
        ctx.lineTo(x + 8, y + 13);
        ctx.lineTo(x + 4, y + 26);
        ctx.lineTo(x + 16, y + 42);
        ctx.stroke();
      }
      if (surface === 'asphalt')
        for (let n = 0; n < 6; n++) {
          const x = 20 + random() * 190,
            y = random() * 210;
          ctx.strokeStyle = 'rgba(48,55,49,0.23)';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x - 12, y + 14, x - 5, y + 40);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + 9, y);
          ctx.quadraticCurveTo(x - 3, y + 14, x + 4, y + 40);
          ctx.stroke();
        }
    } else if (surface === 'sand') {
      for (let row = -2; row < 28; row++) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = row % 2 ? 'rgba(255,241,197,0.32)' : 'rgba(116,93,50,0.25)';
        ctx.beginPath();
        for (let x = -8; x <= 264; x += 8) {
          const y = row * 11 + Math.sin(x * 0.04 + row * 0.5) * 4;
          if (x < 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      for (let n = 0; n < 40; n++) {
        ctx.fillStyle = 'rgba(82,74,48,0.21)';
        ctx.fillRect(random() * 256, random() * 256, 2 + random() * 5, 1 + random() * 2);
      }
    } else if (surface === 'soil' || surface === 'snow') {
      for (let n = 0; n < 70; n++) {
        ctx.fillStyle = surface === 'soil' ? 'rgba(55,65,32,0.22)' : 'rgba(98,123,131,0.13)';
        ctx.beginPath();
        ctx.arc(random() * 256, random() * 256, 2 + random() * 10, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    tex.uScale = scale;
    tex.vScale = scale;
    // DynamicTexture otherwise clamps UVs outside0..1, flattening all tiled world surfaces.
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    tex.anisotropicFilteringLevel = 4;
    tex.update();
    mat.diffuseTexture = tex;
    if (name === 'ground' || name === 'wall' || name === 'stone') {
      const bump = tex.clone();
      bump.name = `catalog-${name}-normal-original`;
      bump.level = name === 'ground' ? 0.28 : 0.35;
      bump.uScale = tex.uScale;
      bump.vScale = tex.vScale;
      bump.anisotropicFilteringLevel = 4;
      bump.gammaSpace = false;
      const source = ctx.getImageData(0, 0, 256, 256).data;
      const normal = bump.getContext().getImageData(0, 0, 256, 256);
      const height = new Float32Array(256 * 256);
      for (let pixel = 0; pixel < height.length; pixel++) {
        const offset = pixel * 4;
        height[pixel] =
          (source[offset] * 0.2126 + source[offset + 1] * 0.7152 + source[offset + 2] * 0.0722) /
          255;
      }
      // A tiled finite difference produces tangent-space normals, not grayscale bump colors.
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++) {
          const dx = (height[y * 256 + ((x + 255) & 255)] - height[y * 256 + ((x + 1) & 255)]) * 2;
          const dy = (height[((y + 255) & 255) * 256 + x] - height[((y + 1) & 255) * 256 + x]) * 2;
          const length = Math.hypot(dx, dy, 1);
          const offset = (y * 256 + x) * 4;
          normal.data[offset] = Math.round(((dx / length) * 0.5 + 0.5) * 255);
          normal.data[offset + 1] = Math.round(((dy / length) * 0.5 + 0.5) * 255);
          normal.data[offset + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
          normal.data[offset + 3] = 255;
        }
      bump.getContext().putImageData(normal, 0, 0);
      bump.update();
      mat.bumpTexture = bump;
    }
    return mat;
  };
  // Box face UVs are measured per2m; the ground tile repeats every4m for readable detail.
  const ground = material('ground', palette.ground, palette.surface, 0.5);
  const wall = material(
    'wall',
    palette.wall,
    theme === 'ruins' || theme === 'desert' ? 'brick' : theme === 'urban' ? 'concrete' : 'brick',
  );
  const stone = material('stone', theme === 'snow' ? '#b9c2bd' : '#a7aa95', 'paving');
  const metal = material('structural-metal', '#788381', 'metal');
  const accent = material('painted-metal', palette.accent, 'metal');
  const roof = material(
    'roof',
    palette.roof,
    theme === 'urban' || theme === 'desert' ? 'tile' : 'metal',
  );
  const wood = material('wood', '#9f8661', 'wood');
  const dark = material('rubber-charcoal', '#303b38');
  const trim = material('trim', theme === 'snow' ? '#e1e8e6' : '#d0cbb5');
  const glass = material('glass', theme === 'laboratory' ? '#699fa6' : '#64858b');
  glass.specularColor.set(0.35, 0.42, 0.4);
  glass.emissiveColor.set(0.04, 0.065, 0.07);
  const yellow = material('marking', '#d8bd65');
  const foliage = material('foliage', theme === 'snow' ? '#6d8175' : '#526b49');
  const water = material('water', '#4c7f89');
  water.specularColor.set(0.55, 0.58, 0.6);

  const entries: { mesh: Mesh; casts: boolean }[] = [];
  const add = (
    mesh: Mesh,
    mat: StandardMaterial,
    x: number,
    y: number,
    z: number,
    pickable = false,
    casts = false,
  ) => {
    mesh.position.set(x, y, z);
    mesh.material = mat;
    mesh.isPickable = pickable;
    mesh.receiveShadows = true;
    entries.push({ mesh, casts });
    return mesh;
  };
  const box = (
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: StandardMaterial,
    pickable = false,
    casts = false,
  ) => {
    const uv = [
      new Vector4(0, 0, w / 2, h / 2),
      new Vector4(0, 0, w / 2, h / 2),
      new Vector4(0, 0, d / 2, h / 2),
      new Vector4(0, 0, d / 2, h / 2),
      new Vector4(0, 0, w / 2, d / 2),
      new Vector4(0, 0, w / 2, d / 2),
    ];
    return add(
      MeshBuilder.CreateBox(
        `catalog-${name}`,
        { width: w, height: h, depth: d, faceUV: uv },
        scene,
      ),
      mat,
      x,
      y,
      z,
      pickable,
      casts,
    );
  };
  const cylinder = (
    name: string,
    x: number,
    y: number,
    z: number,
    diameter: number,
    h: number,
    mat: StandardMaterial,
    top = diameter,
  ) =>
    add(
      MeshBuilder.CreateCylinder(
        `catalog-${name}`,
        { diameterBottom: diameter, diameterTop: top, height: h, tessellation: 12 },
        scene,
      ),
      mat,
      x,
      y,
      z,
    );
  const surfaceFor = (block: MapBlock) => {
    const name = block.name;
    if (name === 'floor') return ground;
    if (/roof/.test(name)) return roof;
    if (/container|pipe/.test(name)) return accent;
    if (/barrel|pillar|tank|gate/.test(name)) return metal;
    if (/crate|bench|counter|stall|barricade-wood/.test(name)) return wood;
    if (/planter|barricade|boundary|step|platform/.test(name)) return stone;
    return wall;
  };
  let windowBudget = 100;
  const facade = (b: MapBlock) => {
    const alongX = b.w >= b.d;
    const length = alongX ? b.w : b.d;
    const thickness = alongX ? b.d : b.w;
    if (thickness > 1.2 || length < 2 || b.h < 2.8) return;
    for (const side of [-1, 1]) {
      const face = (alongX ? b.z : b.x) + side * (thickness / 2 + 0.012);
      const count = Math.min(5, Math.floor(length / 2.6));
      for (let i = 0; i < count && windowBudget > 0; i++, windowBudget--) {
        const along = -length / 2 + (length * (i + 0.5)) / count;
        const x = alongX ? b.x + along : face,
          z = alongX ? face : b.z + along;
        const y = b.y - b.h / 2 + Math.min(2, b.h * 0.6);
        box('window-frame', x, y, z, alongX ? 1.15 : 0.035, 1.18, alongX ? 0.035 : 1.15, dark);
        box(
          'window-glass',
          x + (alongX ? 0 : side * 0.025),
          y,
          z + (alongX ? side * 0.025 : 0),
          alongX ? 1.01 : 0.018,
          1.04,
          alongX ? 0.018 : 1.01,
          glass,
        );
        box(
          'window-center-bar',
          x + (alongX ? 0 : side * 0.038),
          y,
          z + (alongX ? side * 0.038 : 0),
          alongX ? 0.045 : 0.02,
          1.04,
          alongX ? 0.02 : 0.045,
          trim,
        );
        box('window-sill', x, y - 0.64, z, alongX ? 1.28 : 0.11, 0.09, alongX ? 0.11 : 1.28, stone);
        if (theme === 'urban' || theme === 'desert')
          for (const s of [-1, 1])
            box(
              'window-shutter',
              x + (alongX ? s * 0.68 : side * 0.02),
              y,
              z + (alongX ? side * 0.02 : s * 0.68),
              alongX ? 0.2 : 0.035,
              1.1,
              alongX ? 0.035 : 0.2,
              accent,
            );
      }
      box(
        'wall-base',
        alongX ? b.x : face,
        b.y - b.h / 2 + 0.16,
        alongX ? face : b.z,
        alongX ? length : 0.04,
        0.32,
        alongX ? 0.04 : length,
        stone,
      );
      box(
        'wall-cornice',
        alongX ? b.x : face,
        b.y + b.h / 2 - 0.08,
        alongX ? face : b.z,
        alongX ? length : 0.075,
        0.15,
        alongX ? 0.075 : length,
        trim,
      );
    }
  };
  for (const b of definition.blocks) {
    const tank = /barrel|pillar-refinery-tank|pillar-reactor-core/.test(b.name);
    if (tank) {
      const shell = cylinder(b.name, b.x, b.y, b.z, Math.min(b.w, b.d), b.h, surfaceFor(b));
      shell.isPickable = true;
      entries[entries.length - 1].casts = true;
      // A protective square frame makes the conservative AABB collision envelope visible.
      for (const x of [-1, 1])
        for (const z of [-1, 1])
          box(
            'tank-frame',
            b.x + x * (b.w / 2 - 0.035),
            b.y,
            b.z + z * (b.d / 2 - 0.035),
            0.07,
            b.h,
            0.07,
            dark,
            true,
          );
      for (const sign of [-1, 1]) {
        box(
          'tank-frame-cap',
          b.x,
          b.y + sign * (b.h / 2 - 0.035),
          b.z,
          b.w,
          0.07,
          b.d,
          metal,
          true,
        );
        cylinder(
          'tank-metal-band',
          b.x,
          b.y + sign * b.h * 0.28,
          b.z,
          Math.min(b.w, b.d) + 0.012,
          0.065,
          dark,
        );
      }
    } else box(b.name, b.x, b.y, b.z, b.w, b.h, b.d, surfaceFor(b), true, b.name !== 'floor');
    if (/building/.test(b.name) && !/roof|lintel/.test(b.name)) facade(b);
    if (/lintel/.test(b.name)) {
      const alongX = b.w > b.d;
      const length = alongX ? b.w : b.d;
      for (const end of [-1, 1])
        box(
          'door-frame',
          b.x + (alongX ? (end * length) / 2 : 0),
          (b.y - b.h / 2) / 2,
          b.z + (alongX ? 0 : (end * length) / 2),
          alongX ? 0.09 : b.w + 0.03,
          b.y - b.h / 2,
          alongX ? b.d + 0.03 : 0.09,
          trim,
        );
    }
    if (/roof/.test(b.name)) {
      box(
        'roof-edge',
        b.x,
        b.y + b.h / 2 + 0.035,
        b.z,
        b.w + 0.12,
        0.07,
        b.d + 0.12,
        theme === 'snow' ? trim : roof,
      );
      if ((theme === 'urban' || theme === 'forest' || theme === 'snow') && b.w > 4 && b.d > 4) {
        const rise = 1.3,
          angle = Math.atan2(rise, b.w / 2);
        for (const side of [-1, 1]) {
          const panel = box(
            'pitched-roof',
            b.x + (side * b.w) / 4,
            b.y + b.h / 2 + rise / 2,
            b.z,
            Math.hypot(b.w / 2, rise),
            0.12,
            b.d + 0.22,
            theme === 'snow' ? trim : roof,
          );
          panel.rotation.z = -side * angle;
        }
      }
    }
    if (/container/.test(b.name)) {
      const alongZ = b.d > b.w,
        length = Math.max(b.w, b.d),
        cross = Math.min(b.w, b.d);
      for (const side of [-1, 1]) {
        const faceX = b.x + (alongZ ? side * (cross / 2 + 0.01) : 0),
          faceZ = b.z + (alongZ ? 0 : side * (cross / 2 + 0.01));
        for (let offset = -length / 2 + 0.2; offset < length / 2; offset += 0.48)
          box(
            'container-rib',
            faceX + (alongZ ? 0 : offset),
            b.y,
            faceZ + (alongZ ? offset : 0),
            alongZ ? 0.035 : 0.045,
            b.h - 0.15,
            alongZ ? 0.045 : 0.035,
            metal,
          );
        for (const h of [-1, 1])
          box(
            'container-rail',
            faceX,
            b.y + h * (b.h / 2 - 0.07),
            faceZ,
            alongZ ? 0.07 : length,
            0.1,
            alongZ ? length : 0.07,
            dark,
          );
      }
      for (const side of [-1, 1])
        box(
          'container-locking-bar',
          b.x + (alongZ ? side * cross * 0.25 : length / 2 + 0.015),
          b.y,
          b.z + (alongZ ? length / 2 + 0.015 : side * cross * 0.25),
          0.045,
          b.h * 0.8,
          0.045,
          trim,
        );
    }
    if (/crate/.test(b.name))
      for (const side of [-1, 1]) {
        box(
          'crate-reinforcement',
          b.x,
          b.y,
          b.z + side * (b.d / 2 + 0.013),
          b.w * 0.84,
          0.12,
          0.025,
          dark,
        ).rotation.z = 0.5;
        for (const end of [-1, 1])
          box(
            'crate-edge',
            b.x + end * (b.w / 2 - 0.05),
            b.y,
            b.z + side * (b.d / 2 + 0.012),
            0.09,
            b.h,
            0.025,
            wood,
          );
      }
    if (/pillar-pine/.test(b.name)) {
      for (let tier = 0; tier < 3; tier++)
        cylinder(
          'pine-foliage',
          b.x,
          b.y + b.h * (0.25 + tier * 0.18),
          b.z,
          2.5 - tier * 0.45,
          2,
          foliage,
          0,
        );
    }
    if (/pillar-fort/.test(b.name))
      for (const side of [-1, 1])
        for (const end of [-1, 1])
          box(
            'fort-merlon',
            b.x + side * b.w * 0.32,
            b.y + b.h / 2 + 0.35,
            b.z + end * b.d * 0.32,
            b.w * 0.24,
            0.7,
            b.d * 0.24,
            stone,
          );
    if (/roof/.test(b.name) && /observatory-dome/.test(b.name)) {
      const dome = add(
        MeshBuilder.CreateSphere(
          'catalog-observatory-dome',
          { diameter: 1, segments: 16, slice: 0.5 },
          scene,
        ),
        trim,
        b.x,
        b.y + b.h / 2,
        b.z,
      );
      dome.scaling.set(b.w * 0.73, b.w * 0.73, b.d * 0.73);
      box(
        'dome-observation-slit',
        b.x,
        b.y + b.h / 2 + 2.8,
        b.z - 0.4,
        0.55,
        0.035,
        b.d * 0.5,
        dark,
      );
    }
    if (/pillar-atlas-antenna/.test(b.name)) {
      const dish = add(
        MeshBuilder.CreateSphere(
          'catalog-radio-dish',
          { diameter: 1, segments: 12, slice: 0.35 },
          scene,
        ),
        trim,
        b.x,
        b.y + b.h / 2 + 1.2,
        b.z,
      );
      dish.scaling.set(3.6, 1.1, 3.6);
      dish.rotation.x = -0.35;
      cylinder('antenna-feed', b.x, b.y + b.h / 2 + 2, b.z, 0.09, 2.2, metal);
    }
    if (/pipe/.test(b.name)) {
      const alongX = b.w > b.d;
      const tube = cylinder(
        'pipe-conduit',
        b.x,
        b.y + b.h / 2 + 0.08,
        b.z,
        0.13,
        Math.max(b.w, b.d) * 0.9,
        metal,
      );
      tube.rotation[alongX ? 'z' : 'x'] = Math.PI / 2;
    }
    if (/planter/.test(b.name))
      box('planter-soil', b.x, b.y + b.h / 2 + 0.005, b.z, b.w * 0.8, 0.015, b.d * 0.8, foliage);
    if (/barricade/.test(b.name))
      for (let i = -1; i <= 1; i++) {
        const mark = box(
          'hazard-stripe',
          b.x + i * b.w * 0.24,
          b.y + b.h * 0.25,
          b.z - b.d / 2 - 0.012,
          b.w * 0.09,
          Math.min(b.h * 0.35, 0.35),
          0.018,
          yellow,
        );
        mark.rotation.z = -0.28;
      }
  }

  if (definition.id === 'rail-terminal')
    for (const x of [-7, 6]) {
      for (const offset of [-0.65, 0.65])
        box('rail-track', x + offset, 0.016, 0, 0.055, 0.024, depth - 2, metal);
      for (let z = -depth / 2 + 1; z < depth / 2 - 1; z += 1.1)
        box('rail-sleeper', x, 0.008, z, 1.8, 0.012, 0.16, wood);
    }
  if (definition.id === 'canal')
    for (const x of [-13, 0, 13]) {
      const channelLength = x === 0 ? 7 : 10;
      // The water is a shallow surface treatment, not a fake gap or uncollidable drop.
      box('shallow-channel-water', x, 0.006, 0, channelLength, 0.008, 6, water);
    }

  // All substantial scenery below is behind the closed physical boundary.
  const tree = (x: number, z: number, height: number, snowy = false) => {
    cylinder('pine-trunk', x, height / 2, z, 0.36, height, wood);
    for (let tier = 0; tier < 3; tier++)
      cylinder(
        'pine-crown',
        x,
        height * 0.5 + tier * height * 0.18,
        z,
        height * (0.62 - tier * 0.13),
        height * 0.47,
        snowy && tier === 2 ? trim : foliage,
        0,
      );
  };
  if (theme === 'forest' || theme === 'snow') {
    for (const side of [-1, 1])
      for (let n = 0; n < 10; n++) {
        tree(
          side * (width / 2 + 4 + random() * 12),
          -depth / 2 + (n * depth) / 9,
          6 + random() * 6,
          theme === 'snow',
        );
        if (n < 7)
          tree(
            -width / 2 + (n * width) / 6,
            side * (depth / 2 + 7 + random() * 7),
            7 + random() * 5,
            theme === 'snow',
          );
      }
  } else if (theme === 'harbor') {
    box('harbor-water', 0, -0.15, bounds.maxZ + 22, width + 60, 0.1, 38, water);
    for (const x of [-width / 2 - 7, width / 2 + 8]) {
      box('crane-mast', x, 9, 8, 0.8, 18, 0.8, accent);
      box('crane-crossbeam', x, 17.5, 8, 13, 0.55, 0.65, yellow);
      cylinder('crane-cable', x + 5, 12, 8, 0.055, 10, dark);
      for (const h of [3, 6, 9, 12, 15]) box('crane-crossbrace', x, h, 8, 2.6, 0.16, 0.2, metal);
    }
    box('cargo-ship-hull', 1, 2, bounds.maxZ + 24, 35, 5, 9, dark);
    for (let i = 0; i < 5; i++)
      box('ship-cargo-stack', -12 + i * 5.3, 6, bounds.maxZ + 24, 4.8, 3, 6, i % 2 ? accent : roof);
  } else if (theme === 'industrial' || theme === 'laboratory') {
    for (let i = 0; i < 4; i++) {
      cylinder('distant-storage-tank', bounds.maxX + 7 + i * 6, 5, 4 + i * 3, 4.4, 10, metal);
      cylinder('storage-tank-cap', bounds.maxX + 7 + i * 6, 10.1, 4 + i * 3, 4.6, 0.3, trim);
    }
    for (const x of [-width / 2 - 8, -width / 2 - 14]) {
      cylinder('factory-chimney', x, 10, depth / 3, 1.8, 20, roof);
      cylinder('chimney-safety-band', x, 17, depth / 3, 1.84, 1, trim);
    }
  } else if (theme === 'desert') {
    for (const side of [-1, 1])
      for (let i = 0; i < 5; i++) {
        const mesh = add(
          MeshBuilder.CreateSphere('catalog-dune', { diameter: 1, segments: 10 }, scene),
          ground,
          -width / 2 + (i * width) / 4,
          0.5,
          side * (depth / 2 + 14),
        );
        mesh.scaling.set(18 + random() * 10, 16 + random() * 10, 17 + random() * 6);
      }
    for (const side of [-1, 1]) {
      const x = side * (width / 2 + 8),
        z = -6;
      cylinder('palm-trunk', x, 3.5, z, 0.5, 7, wood, 0.3);
      for (let i = 0; i < 7; i++) {
        const angle = (i * Math.PI * 2) / 7;
        const leaf = box(
          'palm-frond',
          x + Math.cos(angle) * 1.3,
          7.1,
          z + Math.sin(angle) * 1.3,
          3,
          0.06,
          0.38,
          foliage,
        );
        leaf.rotation.y = -angle;
        leaf.rotation.z = 0.16;
      }
    }
  } else {
    for (const side of [-1, 1])
      for (let i = -1; i <= 1; i++) {
        const h = theme === 'ruins' ? 5 + (i + 1) * 1.2 : 8 + (i + 1) * 1.6;
        const b: MapBlock = {
          name: 'building-distant-wall',
          x: side * (width / 2 + 7),
          y: h / 2,
          z: (i * depth) / 2.7,
          w: 11,
          h,
          d: 10,
        };
        box(b.name, b.x, b.y, b.z, b.w, b.h, b.d, wall);
        box('distant-cornice', b.x, h, b.z, 11.2, 0.22, 10.2, trim);
        for (let row = 0; row < Math.floor(h / 2.7); row++)
          for (const col of [-1, 0, 1])
            box(
              'distant-window',
              b.x - side * 5.52,
              2 + row * 2.7,
              b.z + col * 2.8,
              0.03,
              1.25,
              1.1,
              theme === 'ruins' ? dark : glass,
            );
        if (theme === 'ruins')
          for (const x of [-3, 0, 3])
            cylinder('ruin-column', b.x + x, 3.2, b.z - 5.2, 0.7, 6.4, stone);
      }
  }
  // Surface-level sidewalks, drains and paint add legibility without changing collision.
  const openGround = (x: number, z: number) =>
    !definition.solids.some(
      (solid) =>
        solid.max.y > 0.1 &&
        solid.min.y < 1.8 &&
        x > solid.min.x - 0.6 &&
        x < solid.max.x + 0.6 &&
        z > solid.min.z - 0.6 &&
        z < solid.max.z + 0.6,
    );
  const paved = !['forest', 'snow', 'desert'].includes(theme);
  for (const side of [-1, 1]) {
    for (let z = bounds.minZ + 1.1; z < bounds.maxZ - 1; z += 2) {
      const x = side < 0 ? bounds.minX + 2.1 : bounds.maxX - 2.1;
      if (!openGround(x, z)) continue;
      box('perimeter-path-pavers', x, 0.012, z, 1.65, 0.018, 1.98, stone);
      if (paved) box('flush-curb-edge', x - side * 0.88, 0.02, z, 0.12, 0.028, 1.98, trim);
    }
    for (let x = bounds.minX + 1; x < bounds.maxX - 1; x += 2) {
      const z = side < 0 ? bounds.minZ + 2.1 : bounds.maxZ - 2.1;
      if (!openGround(x, z)) continue;
      box('spawn-approach-paving', x, 0.012, z, 1.98, 0.018, 1.6, stone);
    }
  }
  if (paved) {
    for (let z = bounds.minZ + 5; z < bounds.maxZ - 4; z += 4)
      if (openGround(0, z))
        box(
          'broken-road-line',
          0,
          0.019,
          z,
          0.1,
          0.012,
          1.5,
          theme === 'laboratory' ? accent : yellow,
        );
    for (const x of [-width * 0.34, width * 0.34])
      for (const z of [-depth * 0.27, depth * 0.27]) {
        if (!openGround(x, z)) continue;
        box('drain-frame', x, 0.019, z, 1.12, 0.012, 0.72, metal);
        for (let offset = -0.4; offset <= 0.4; offset += 0.16)
          box('drain-opening', x + offset, 0.027, z, 0.075, 0.009, 0.55, dark);
      }
  }
  for (let i = 0; i < 28; i++) {
    const x = bounds.minX + 1 + random() * (width - 2),
      z = bounds.minZ + 1 + random() * (depth - 2);
    if (!openGround(x, z)) continue;
    const decal = box(
      'small-ground-debris',
      x,
      0.014,
      z,
      0.08 + random() * 0.18,
      0.008,
      0.08 + random() * 0.12,
      i % 3 === 0 ? trim : theme === 'snow' ? stone : dark,
    );
    decal.rotation.y = random() * Math.PI;
  }
  // Flush route strips supply contrast without inventing physical obstacles.
  for (const spawn of definition.spawns)
    box(
      'spawn-ground-inlay',
      spawn.x,
      0.008,
      spawn.z,
      1.5,
      0.012,
      1.5,
      theme === 'laboratory' ? accent : stone,
    );
  const site = definition.bombSite;
  for (const side of [-1, 1]) {
    box('objective-ground-stripe', site.x + side * 1.8, 0.009, site.z, 0.07, 0.012, 3.6, yellow);
    box('objective-ground-stripe', site.x, 0.009, site.z + side * 1.8, 3.6, 0.012, 0.07, yellow);
  }

  const groups = new Map<string, { meshes: Mesh[]; pickable: boolean; casts: boolean }>();
  for (const entry of entries) {
    const key = `${entry.mesh.material!.id}:${entry.mesh.isPickable}:${entry.casts}`;
    const group = groups.get(key) ?? {
      meshes: [],
      pickable: entry.mesh.isPickable,
      casts: entry.casts,
    };
    group.meshes.push(entry.mesh);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    const merged = Mesh.MergeMeshes(group.meshes, true, true);
    if (!merged) continue;
    merged.name = `catalog-static-${key}`;
    merged.isPickable = group.pickable;
    merged.receiveShadows = true;
    merged.freezeWorldMatrix();
    if (group.casts) shadows.addShadowCaster(merged);
  }
  if (textures) {
    const sky = MeshBuilder.CreateSphere(
      'catalog-sky',
      { diameter: 290, segments: 16, sideOrientation: Mesh.BACKSIDE },
      scene,
    );
    const skyMat = new StandardMaterial('catalog-sky-material', scene);
    const skyTex = new DynamicTexture(
      'catalog-sky-gradient-original',
      { width: 512, height: 256 },
      scene,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    const context = skyTex.getContext(),
      gradient = context.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#6e98b0');
    gradient.addColorStop(0.48, palette.haze);
    gradient.addColorStop(0.58, palette.sky);
    gradient.addColorStop(1, '#628da9');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 10; i++) {
      const x = 20 + random() * 470,
        y = i % 2 ? 25 + random() * 40 : 180 + random() * 45;
      for (let puff = 0; puff < 5; puff++) {
        context.save();
        context.translate(x + puff * 7, y + Math.sin(puff) * 3);
        context.scale(2.1, 0.65);
        context.fillStyle = 'rgba(255,255,247,0.12)';
        context.beginPath();
        context.arc(0, 0, 5 + random() * 4, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }
    skyTex.update();
    skyMat.emissiveTexture = skyTex;
    skyMat.emissiveColor.set(1, 1, 1);
    skyMat.disableLighting = true;
    skyMat.fogEnabled = false;
    sky.material = skyMat;
    sky.infiniteDistance = true;
    sky.isPickable = false;
    const signTexture = new DynamicTexture(
      'catalog-entry-sign-original',
      { width: 1024, height: 256 },
      scene,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    signTexture.drawText(
      mapInfo(definition.id).name.toLocaleUpperCase('pt-BR'),
      null,
      155,
      'bold 60px sans-serif',
      '#e4e5d6',
      '#304442',
      true,
      true,
    );
    const signMaterial = new StandardMaterial('catalog-entry-sign', scene);
    signMaterial.diffuseTexture = signTexture;
    signMaterial.emissiveColor.set(0.11, 0.13, 0.1);
    signMaterial.backFaceCulling = false;
    const sign = MeshBuilder.CreatePlane('catalog-entry-name', { width: 7, height: 1.75 }, scene);
    sign.position.set(0, 3.4, bounds.minZ + 0.02);
    sign.rotation.y = Math.PI;
    sign.material = signMaterial;
    sign.isPickable = false;
    sign.freezeWorldMatrix();
  }
  return {
    solids: [...definition.solids],
    targets: [],
    shadows,
    spawn: { ...definition.spawns[0] },
  };
}
