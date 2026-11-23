import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { WeaponId } from './ballistics';

type Position = number[];
type Outline = readonly (readonly [number, number])[];
type Surface = StandardMaterial;
interface Workshop {
  body: TransformNode;
  magazine: TransformNode;
  action: TransformNode;
  steel: Surface;
  edge: Surface;
  polymer: Surface;
  rubber: Surface;
  wood: Surface;
  brass: Surface;
  glass: Surface;
  bevel(
    name: string,
    w: number,
    h: number,
    d: number,
    mat: Surface,
    position: Position,
    parent?: TransformNode,
    chamfer?: number,
  ): Mesh;
  profile(
    name: string,
    width: number,
    outline: Outline,
    mat: Surface,
    parent?: TransformNode,
    position?: Position,
  ): Mesh;
  cylinder(
    name: string,
    diameter: number,
    height: number,
    mat: Surface,
    position: Position,
    parent?: TransformNode,
    axis?: 'x' | 'y' | 'z',
  ): Mesh;
}
export interface VariantPose {
  muzzleZ: number;
  muzzleY: number;
  supportZ: number;
  actionZ: number;
  actionY: number;
  magazineZ: number;
  magazineY: number;
}

/** Original assembled silhouettes. Geometry, not a tint or a stretched copy, identifies each gun. */
export function buildWeaponVariant(id: WeaponId, shop: Workshop): VariantPose {
  const {
    body,
    magazine,
    action,
    steel,
    edge,
    polymer,
    rubber,
    wood,
    brass,
    glass,
    bevel,
    profile,
    cylinder,
  } = shop;
  const compact = id === 'smg9';
  const shotgun = id === 'sg12';
  const longRifle = id === 'dmr14' || id === 'sr8';
  const heavy = id === 'lmg60';
  const muzzle = compact
    ? 0.5
    : shotgun
      ? 1.05
      : id === 'sr8'
        ? 1.23
        : longRifle
          ? 1.08
          : heavy
            ? 1.1
            : 0.86;
  const receiverLength = compact ? 0.3 : heavy ? 0.46 : longRifle ? 0.43 : 0.38;
  const receiverWidth = heavy ? 0.135 : shotgun ? 0.09 : compact ? 0.08 : 0.105;
  bevel(
    `${id}-receiver`,
    receiverWidth,
    heavy ? 0.14 : 0.105,
    receiverLength,
    steel,
    [0, 0.02, 0.025],
    body,
    0.022,
  );
  bevel(`${id}-feed-port`, 0.004, 0.04, 0.1, rubber, [-receiverWidth / 2 - 0.002, 0.025, 0.065]);
  bevel(`${id}-port-bolt`, 0.005, 0.028, 0.07, edge, [0, 0, 0], action, 0.005);
  cylinder(
    `${id}-safety-lever`,
    0.022,
    0.008,
    edge,
    [-receiverWidth / 2, -0.038, -0.085],
    body,
    'x',
  );
  profile(
    `${id}-grip`,
    0.075,
    [
      [-0.055, -0.145],
      [-0.06, -0.07],
      [-0.23, -0.11],
      [-0.22, -0.19],
    ],
    id === 'ar47' ? wood : rubber,
  );
  for (let i = 0; i < 4; i++)
    bevel(`${id}-grip-serration`, 0.079, 0.008, 0.055, rubber, [0, -0.1 - i * 0.025, -0.13]);
  cylinder(`${id}-trigger`, 0.009, 0.035, steel, [0, -0.075, -0.04], body, 'y');
  for (const side of [-1, 1])
    bevel(`${id}-guard-side`, 0.009, 0.055, 0.11, steel, [side * 0.032, -0.085, -0.026]);
  bevel(`${id}-guard-bottom`, 0.07, 0.009, 0.1, steel, [0, -0.113, -0.026]);

  if (compact) {
    for (const side of [-1, 1])
      cylinder('smg-folding-stock-rail', 0.014, 0.27, edge, [side * 0.038, 0.012, -0.25]);
    bevel('smg-skeletal-butt', 0.095, 0.12, 0.018, rubber, [0, -0.027, -0.39]);
    bevel('smg-vented-foregrip', 0.105, 0.09, 0.16, polymer, [0, 0, 0.25]);
    for (let i = 0; i < 4; i++)
      bevel('smg-forward-vent', 0.11, 0.016, 0.012, rubber, [0, 0.015, 0.19 + i * 0.032]);
    bevel('smg-straight-magazine', 0.054, 0.25, 0.07, steel, [0, -0.02, 0], magazine);
    for (const side of [-1, 1])
      bevel(
        'smg-magazine-channel',
        0.003,
        0.21,
        0.01,
        rubber,
        [side * 0.028, -0.02, -0.015],
        magazine,
      );
    cylinder('smg-short-barrel', 0.038, 0.16, steel, [0, 0.018, 0.39]);
    cylinder('smg-muzzle-collar', 0.052, 0.045, rubber, [0, 0.018, 0.47]);
    cylinder('smg-muzzle-opening', 0.025, 0.004, rubber, [0, 0.018, 0.495]);
  } else {
    const wooden = id === 'ar47' || id === 'dmr14' || shotgun;
    profile(
      `${id}-shaped-stock`,
      heavy ? 0.13 : 0.105,
      [
        [-0.065, -0.44],
        [0.075, -0.44],
        [0.07, -0.28],
        [0.035, -0.15],
        [-0.028, -0.15],
        [-0.11, -0.35],
      ],
      wooden ? wood : polymer,
    );
    bevel(`${id}-recoil-pad`, 0.117, 0.155, 0.026, rubber, [0, -0.003, -0.443]);
    if (id === 'sr8') {
      bevel('sr8-adjustable-cheek-rest', 0.108, 0.045, 0.19, rubber, [0, 0.087, -0.32]);
      cylinder('sr8-cheek-post', 0.013, 0.05, edge, [0, 0.063, -0.3], body, 'y');
      cylinder('sr8-bolt-arm', 0.013, 0.08, steel, [-0.085, 0.018, 0.005], action, 'x');
      cylinder('sr8-bolt-handle', 0.038, 0.042, rubber, [-0.13, 0.018, 0.005], action, 'y');
    }
    if (shotgun) {
      cylinder('sg12-main-barrel', 0.05, 0.78, steel, [0, 0.048, 0.63]);
      cylinder('sg12-magazine-tube', 0.047, 0.62, steel, [0, -0.017, 0.55]);
      cylinder('sg12-barrel-band', 0.064, 0.025, edge, [0, 0.045, 0.9]);
      cylinder('sg12-dark-bore', 0.036, 0.004, rubber, [0, 0.048, 1.022]);
      bevel('sg12-pump-fore-end', 0.105, 0.09, 0.24, wood, [0, 0, 0], action, 0.024);
      for (let i = 0; i < 8; i++)
        bevel(
          'sg12-pump-groove',
          0.109,
          0.07,
          0.008,
          rubber,
          [0, 0, -0.1 + i * 0.028],
          action,
          0.008,
        );
      cylinder('sg12-loading-shell', 0.029, 0.07, brass, [0, 0, 0], magazine);
      bevel('sg12-shell-carrier', 0.012, 0.07, 0.2, polymer, [0.061, 0.005, 0.04]);
      for (let i = 0; i < 4; i++)
        cylinder(
          'sg12-side-shell',
          0.027,
          0.07,
          brass,
          [0.07, 0.012, -0.025 + i * 0.044],
          body,
          'y',
        );
    } else {
      const length = heavy ? 0.34 : id === 'sr8' ? 0.35 : longRifle ? 0.36 : 0.27;
      bevel(
        `${id}-fore-end`,
        heavy ? 0.12 : 0.1,
        heavy ? 0.11 : 0.085,
        length,
        wooden ? wood : polymer,
        [0, 0.002, 0.2 + length / 2],
        body,
        0.018,
      );
      for (let i = 0; i < (heavy ? 8 : 5); i++)
        bevel(`${id}-fore-end-vent`, heavy ? 0.125 : 0.105, 0.018, 0.016, rubber, [
          0,
          0.023,
          0.25 + i * 0.04,
        ]);
      cylinder(`${id}-barrel`, id === 'sr8' ? 0.045 : 0.036, muzzle - 0.46, steel, [
        0,
        0.026,
        (muzzle + 0.42) / 2,
      ]);
      cylinder(`${id}-muzzle-brake`, id === 'sr8' ? 0.065 : 0.052, 0.07, rubber, [
        0,
        0.026,
        muzzle - 0.035,
      ]);
      cylinder(`${id}-bore`, 0.024, 0.003, rubber, [0, 0.026, muzzle + 0.003]);
      if (id === 'ar47') {
        cylinder('ar47-gas-piston', 0.03, 0.41, steel, [0, 0.095, 0.43]);
        bevel('ar47-gas-block', 0.062, 0.11, 0.035, steel, [0, 0.066, 0.66]);
        profile(
          'ar47-banana-magazine',
          0.07,
          [
            [0.055, -0.04],
            [0.055, 0.05],
            [-0.11, 0.07],
            [-0.27, 0.025],
            [-0.29, -0.055],
            [-0.1, -0.06],
          ],
          steel,
          magazine,
        );
        for (const side of [-1, 1])
          for (let i = 0; i < 3; i++)
            bevel(
              'ar47-magazine-flute',
              0.003,
              0.2,
              0.005,
              edge,
              [side * 0.036, -0.09, -0.025 + i * 0.025],
              magazine,
            );
      } else if (heavy) {
        bevel('lmg60-box-magazine', 0.18, 0.2, 0.18, polymer, [0, -0.03, 0], magazine, 0.017);
        bevel('lmg60-ammo-box-lid', 0.185, 0.023, 0.19, steel, [0, 0.075, 0], magazine);
        for (let i = 0; i < 6; i++) {
          cylinder(
            'lmg60-linked-round',
            0.017,
            0.08,
            brass,
            [-0.08 - i * 0.017, 0.048 - i * 0.008, 0.075],
            body,
          );
          bevel('lmg60-belt-link', 0.01, 0.022, 0.019, steel, [
            -0.08 - i * 0.017,
            0.048 - i * 0.008,
            0.06,
          ]);
        }
        for (const side of [-1, 1])
          cylinder('lmg60-folded-bipod', 0.017, 0.31, edge, [side * 0.059, -0.01, 0.7]);
        bevel('lmg60-carry-handle', 0.03, 0.03, 0.2, rubber, [0, 0.18, 0.08]);
        for (const z of [-0.015, 0.17])
          cylinder('lmg60-handle-post', 0.015, 0.09, steel, [0, 0.12, z], body, 'y');
      } else {
        bevel(
          `${id}-short-magazine`,
          0.075,
          id === 'sr8' ? 0.11 : 0.15,
          0.115,
          steel,
          [0, 0, 0],
          magazine,
        );
        bevel(
          `${id}-magazine-floorplate`,
          0.083,
          0.018,
          0.12,
          rubber,
          [0, id === 'sr8' ? -0.055 : -0.075, 0],
          magazine,
        );
      }
    }
  }
  if (longRifle) {
    bevel(`${id}-optic-rail`, 0.055, 0.022, 0.3, rubber, [0, 0.097, 0.04]);
    const opticLength = id === 'sr8' ? 0.36 : 0.26;
    cylinder(`${id}-optic-body`, 0.073, opticLength, rubber, [0, 0.175, 0.03]);
    cylinder(`${id}-objective-bell`, id === 'sr8' ? 0.105 : 0.09, 0.065, steel, [
      0,
      0.175,
      0.03 + opticLength / 2,
    ]);
    cylinder(`${id}-objective-glass`, id === 'sr8' ? 0.084 : 0.07, 0.003, glass, [
      0,
      0.175,
      0.065 + opticLength / 2,
    ]);
    cylinder(`${id}-ocular-ring`, 0.086, 0.04, steel, [0, 0.175, 0.01 - opticLength / 2]);
    cylinder(`${id}-ocular-glass`, 0.064, 0.003, glass, [0, 0.175, -0.011 - opticLength / 2]);
    for (const z of [-0.05, 0.11]) {
      cylinder(`${id}-scope-ring`, 0.083, 0.024, steel, [0, 0.175, z]);
      bevel(`${id}-optic-mount`, 0.05, 0.05, 0.035, steel, [0, 0.115, z]);
    }
    cylinder(`${id}-elevation-turret`, 0.035, 0.04, edge, [0, 0.225, 0.035], body, 'y');
    cylinder(`${id}-windage-turret`, 0.03, 0.035, edge, [-0.05, 0.175, 0.035], body, 'x');
  } else {
    bevel(`${id}-rear-sight`, 0.06, 0.035, 0.025, rubber, [0, 0.102, -0.13]);
    for (const side of [-1, 1])
      bevel(`${id}-front-sight-ear`, 0.012, 0.058, 0.025, steel, [
        side * 0.022,
        0.105,
        compact ? 0.35 : shotgun ? 0.92 : 0.68,
      ]);
    bevel(`${id}-front-sight-blade`, 0.008, 0.038, 0.008, edge, [
      0,
      0.105,
      compact ? 0.35 : shotgun ? 0.92 : 0.68,
    ]);
  }
  return {
    muzzleZ: muzzle + 0.025,
    muzzleY: shotgun ? 0.048 : 0.026,
    supportZ: compact ? 0.23 : shotgun ? 0.41 : 0.34,
    actionZ: shotgun ? 0.43 : -0.005,
    actionY: shotgun ? -0.014 : 0.032,
    magazineZ: compact ? 0.045 : shotgun ? 0.13 : 0.04,
    magazineY: shotgun ? -0.085 : heavy ? -0.17 : -0.14,
  };
}
