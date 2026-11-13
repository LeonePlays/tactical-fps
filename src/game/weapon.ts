import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';

interface WeaponAnimation {
  body: TransformNode;
  magazine: TransformNode;
  action: TransformNode;
  hand: TransformNode;
  magazineBase: Vector3;
  actionBase: Vector3;
  handBase: Vector3;
  pistol: boolean;
  reloadStart: number;
  deployStart: number;
  lastTime: number;
  wasReloading: boolean;
  wasDeploying: boolean;
}
const animations = new WeakMap<TransformNode, WeaponAnimation>();

/** Original faceted view models; moving assemblies stay separate from material batches. */
export function createWeapon(scene: Scene, camera: UniversalCamera, pistol = false): TransformNode {
  const root = new TransformNode(pistol ? 'pistol-view' : 'carbine', scene);
  root.parent = camera;
  root.position = new Vector3(0.23, -0.24, 0.55);
  root.scaling.setAll(0.65);
  const material = (name: string, color: string, shine = 0.1) => {
    const cached = scene.getMaterialByName(name) as StandardMaterial | null;
    if (cached) return cached;
    const value = new StandardMaterial(name, scene);
    value.diffuseColor = Color3.FromHexString(color);
    value.specularColor.set(shine, shine, shine);
    value.specularPower = 42;
    return value;
  };
  const steel = material('view-blued-steel', '#343e40', 0.4);
  const edge = material('view-machined-steel', '#7a8581', 0.5);
  const polymer = material('view-olive-polymer', '#46533e', 0.09);
  const rubber = material('view-textured-rubber', '#242c28', 0.025);
  const glove = material('view-tactical-gloves', '#827d65', 0.03);
  const fabric = material('view-operator-sleeves', '#52624b', 0.025);
  const sight = material('view-iron-sight-dot', '#cfdb9a', 0.08);
  sight.emissiveColor.set(0.16, 0.2, 0.08);
  const body = new TransformNode('weapon-body-assembly', scene);
  const magazine = new TransformNode('weapon-magazine', scene);
  const action = new TransformNode(pistol ? 'pistol-slide' : 'carbine-bolt', scene);
  const triggerHand = new TransformNode('weapon-trigger-hand', scene);
  const supportHand = new TransformNode('weapon-support-hand', scene);
  const batches = new Map<string, { parent: TransformNode; meshes: Mesh[] }>();
  const attach = (mesh: Mesh, mat: StandardMaterial, parent = body, position = [0, 0, 0]) => {
    mesh.parent = parent;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.renderingGroupId = 1;
    const key = `${parent.uniqueId}:${mat.uniqueId}`;
    const batch = batches.get(key) ?? { parent, meshes: [] };
    batch.meshes.push(mesh);
    batches.set(key, batch);
    return mesh;
  };
  // Extruded convex side profiles give bevels and sloped stocks/grips actual silhouettes.
  const profile = (
    name: string,
    width: number,
    outline: readonly (readonly [number, number])[],
    mat: StandardMaterial,
    parent = body,
    position = [0, 0, 0],
  ) => {
    const points = [...outline];
    const area = points.reduce(
      (sum, p, i) =>
        sum + p[0] * points[(i + 1) % points.length][1] - points[(i + 1) % points.length][0] * p[1],
      0,
    );
    if (area < 0) points.reverse();
    const positions: number[] = [],
      normals: number[] = [],
      indices: number[] = [];
    for (const side of [-1, 1]) {
      const offset = positions.length / 3;
      for (const [y, z] of points) {
        positions.push((side * width) / 2, y, z);
        normals.push(side, 0, 0);
      }
      for (let i = 1; i < points.length - 1; i++)
        indices.push(offset, offset + (side > 0 ? i + 1 : i), offset + (side > 0 ? i : i + 1));
    }
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length],
        offset = positions.length / 3;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (const [x, p] of [
        [-width / 2, a],
        [width / 2, a],
        [width / 2, b],
        [-width / 2, b],
      ] as const) {
        positions.push(x, p[0], p[1]);
        normals.push(0, (b[1] - a[1]) / length, (a[0] - b[0]) / length);
      }
      indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    }
    const mesh = new Mesh(name, scene),
      data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.indices = indices;
    data.uvs = positions.flatMap((_, index) => (index % 3 === 0 ? [0, 0] : []));
    data.applyToMesh(mesh);
    return attach(mesh, mat, parent, position);
  };
  const bevel = (
    name: string,
    w: number,
    h: number,
    d: number,
    mat: StandardMaterial,
    position: number[],
    parent = body,
    chamfer = Math.min(h, d) * 0.16,
  ) =>
    profile(
      name,
      w,
      [
        [-h / 2 + chamfer, -d / 2],
        [h / 2 - chamfer, -d / 2],
        [h / 2, -d / 2 + chamfer],
        [h / 2, d / 2 - chamfer],
        [h / 2 - chamfer, d / 2],
        [-h / 2 + chamfer, d / 2],
        [-h / 2, d / 2 - chamfer],
        [-h / 2, -d / 2 + chamfer],
      ],
      mat,
      parent,
      position,
    );
  const cylinder = (
    name: string,
    diameter: number,
    height: number,
    mat: StandardMaterial,
    position: number[],
    parent = body,
    axis: 'x' | 'y' | 'z' = 'z',
  ) => {
    const mesh = attach(
      MeshBuilder.CreateCylinder(name, { diameter, height, tessellation: 10 }, scene),
      mat,
      parent,
      position,
    );
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    return mesh;
  };
  const rounded = (
    name: string,
    size: number[],
    mat: StandardMaterial,
    position: number[],
    parent: TransformNode,
  ) => {
    const mesh = attach(
      MeshBuilder.CreateSphere(name, { diameter: 1, segments: 6 }, scene),
      mat,
      parent,
      position,
    );
    mesh.scaling.set(size[0], size[1], size[2]);
    return mesh;
  };
  // Rounded glove palms, finger wraps and octagonal cuffs replace disconnected box hands.
  for (const [hand, supporting] of [
    [triggerHand, false],
    [supportHand, true],
  ] as const) {
    rounded('glove-palm', [0.11, 0.135, 0.13], glove, [0, 0, 0], hand);
    rounded('glove-knuckle-panel', [0.09, 0.045, 0.12], rubber, [0.012, 0.04, 0.005], hand);
    rounded('glove-thumb', [0.045, 0.08, 0.075], glove, [-0.047, 0.02, 0.02], hand).rotation.z =
      -0.4;
    for (let finger = 0; finger < 3; finger++)
      rounded(
        'wrapped-glove-finger',
        [0.095, 0.022, 0.04],
        glove,
        [0, -0.025 + finger * 0.024, 0.058],
        hand,
      );
    const sleeve = cylinder(
      'operator-sleeve',
      supporting ? 0.13 : 0.15,
      supporting ? 0.25 : 0.29,
      fabric,
      [supporting ? -0.035 : 0.02, -0.07, -0.16],
      hand,
    );
    sleeve.rotation.x += supporting ? 0.3 : -0.2;
    cylinder('glove-cuff', 0.135, 0.045, rubber, [0, -0.035, -0.07], hand);
  }

  if (pistol) {
    bevel('pistol-slide-shell', 0.078, 0.075, 0.325, steel, [0, 0, 0], action, 0.014);
    bevel('pistol-slide-top', 0.057, 0.014, 0.27, edge, [0, 0.039, 0.005], action, 0.003);
    bevel(
      'pistol-ejection-port',
      0.002,
      0.028,
      0.065,
      rubber,
      [-0.04, 0.006, 0.028],
      action,
      0.004,
    );
    for (let i = 0; i < 6; i++)
      bevel(
        'pistol-slide-serration',
        0.082,
        0.05,
        0.003,
        rubber,
        [0, -0.001, -0.132 + i * 0.008],
        action,
        0.001,
      );
    bevel('pistol-frame', 0.07, 0.055, 0.24, polymer, [0, -0.025, 0.015]);
    profile(
      'pistol-grip-frame',
      0.074,
      [
        [-0.055, -0.105],
        [-0.065, -0.025],
        [-0.22, -0.065],
        [-0.23, -0.145],
      ],
      polymer,
    );
    bevel('pistol-grip-texture', 0.077, 0.12, 0.05, rubber, [0, -0.14, -0.1]).rotation.x = -0.23;
    bevel('pistol-magazine', 0.057, 0.15, 0.065, steel, [0, 0, 0], magazine);
    bevel('pistol-magazine-base', 0.078, 0.025, 0.08, rubber, [0, -0.078, 0], magazine);
    const guard = attach(
      MeshBuilder.CreateTorus(
        'pistol-trigger-guard',
        { diameter: 0.075, thickness: 0.009, tessellation: 12 },
        scene,
      ),
      polymer,
      body,
      [0, -0.075, 0.025],
    );
    guard.rotation.z = Math.PI / 2;
    guard.scaling.z = 1.1;
    bevel('pistol-trigger', 0.012, 0.035, 0.014, steel, [0, -0.072, 0.025]);
    cylinder('pistol-muzzle', 0.041, 0.012, edge, [0, 0, 0.168], action);
    cylinder('pistol-bore', 0.025, 0.013, rubber, [0, 0, 0.169], action);
    for (const side of [-1, 1])
      bevel('pistol-rear-sight', 0.014, 0.023, 0.022, rubber, [side * 0.023, 0.05, -0.12], action);
    bevel('pistol-front-sight', 0.012, 0.022, 0.018, rubber, [0, 0.05, 0.14], action);
    bevel('pistol-sight-dot', 0.007, 0.009, 0.004, sight, [0, 0.053, 0.129], action, 0.001);
  } else {
    bevel('carbine-upper-receiver', 0.095, 0.11, 0.36, steel, [0, 0.022, 0.015], body, 0.022);
    bevel('carbine-lower-receiver', 0.085, 0.075, 0.27, polymer, [0, -0.057, -0.025], body, 0.014);
    profile(
      'carbine-stock',
      0.09,
      [
        [-0.07, -0.35],
        [0.06, -0.35],
        [0.07, -0.22],
        [0.035, -0.15],
        [-0.035, -0.15],
      ],
      polymer,
    );
    bevel('carbine-butt-pad', 0.105, 0.145, 0.028, rubber, [0, -0.005, -0.35], body, 0.009);
    bevel('carbine-cheek-piece', 0.085, 0.035, 0.14, rubber, [0, 0.061, -0.265], body, 0.007);
    profile(
      'carbine-pistol-grip',
      0.07,
      [
        [-0.075, -0.16],
        [-0.075, -0.09],
        [-0.235, -0.125],
        [-0.215, -0.2],
      ],
      rubber,
    );
    profile(
      'carbine-curved-magazine',
      0.065,
      [
        [0.06, -0.048],
        [0.06, 0.048],
        [-0.06, 0.045],
        [-0.19, 0.015],
        [-0.2, -0.055],
        [-0.065, -0.065],
      ],
      steel,
      magazine,
    );
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++)
        bevel(
          'magazine-stamped-rib',
          0.003,
          0.13,
          0.005,
          edge,
          [side * 0.034, -0.05, -0.033 + i * 0.024],
          magazine,
          0.001,
        );
    bevel('carbine-handguard', 0.09, 0.095, 0.28, polymer, [0, 0.012, 0.32], body, 0.024);
    for (let i = 0; i < 6; i++)
      bevel(
        'handguard-vent-band',
        0.094,
        0.068,
        0.008,
        rubber,
        [0, 0.018, 0.215 + i * 0.038],
        body,
        0.009,
      );
    bevel('carbine-top-rail', 0.054, 0.017, 0.48, rubber, [0, 0.085, 0.12], body, 0.004);
    for (let i = 0; i < 10; i++)
      bevel('rail-tooth', 0.061, 0.009, 0.016, steel, [0, 0.097, -0.075 + i * 0.044], body, 0.002);
    bevel('carbine-action-port', 0.003, 0.043, 0.11, rubber, [-0.049, 0.032, -0.005], body, 0.007);
    bevel('carbine-bolt-carrier', 0.004, 0.03, 0.07, edge, [0, 0, 0], action, 0.005);
    cylinder('carbine-charging-handle', 0.013, 0.03, steel, [-0.012, 0.002, -0.04], action, 'x');
    cylinder('carbine-selector', 0.022, 0.006, edge, [-0.047, -0.05, -0.08], body, 'x');
    cylinder('carbine-barrel', 0.034, 0.27, steel, [0, 0.015, 0.565]);
    cylinder('barrel-collar', 0.055, 0.035, edge, [0, 0.015, 0.445]);
    cylinder('carbine-flash-hider', 0.047, 0.065, rubber, [0, 0.015, 0.69]);
    cylinder('carbine-bore', 0.023, 0.002, rubber, [0, 0.015, 0.724]);
    for (const side of [-1, 1])
      bevel(
        'rear-sight-post',
        0.014,
        0.052,
        0.026,
        steel,
        [side * 0.027, 0.12, -0.13],
        body,
        0.004,
      );
    bevel('front-sight-base', 0.062, 0.07, 0.025, steel, [0, 0.065, 0.44], body, 0.005);
    bevel('front-sight-post', 0.014, 0.045, 0.015, rubber, [0, 0.117, 0.44], body, 0.003);
    bevel('front-sight-dot', 0.007, 0.009, 0.004, sight, [0, 0.124, 0.43], body, 0.001);
  }
  // All batching happens before assemblies receive parent/root transforms.
  for (const batch of batches.values()) {
    const merged = Mesh.MergeMeshes(batch.meshes, true, true);
    if (!merged) continue;
    merged.name = `${batch.parent.name}-${merged.material?.name ?? 'surface'}`;
    merged.parent = batch.parent;
    merged.renderingGroupId = 1;
    merged.isPickable = false;
    merged.alwaysSelectAsActiveMesh = true;
  }
  body.parent = root;
  magazine.parent = body;
  action.parent = body;
  triggerHand.parent = root;
  supportHand.parent = root;
  magazine.position.set(0, pistol ? -0.145 : -0.14, pistol ? -0.09 : 0.035);
  action.position.set(pistol ? 0 : -0.052, pistol ? 0.043 : 0.032, pistol ? 0.033 : -0.005);
  triggerHand.position.set(0.035, pistol ? -0.17 : -0.185, pistol ? -0.105 : -0.15);
  supportHand.position.set(
    pistol ? -0.06 : -0.035,
    pistol ? -0.16 : -0.095,
    pistol ? -0.055 : 0.29,
  );
  const flash = MeshBuilder.CreateSphere(
    'muzzle-flash',
    { diameter: pistol ? 0.08 : 0.095, segments: 4 },
    scene,
  );
  flash.parent = body;
  flash.position.set(0, pistol ? 0.043 : 0.015, pistol ? 0.26 : 0.78);
  flash.scaling.set(0.8, 0.65, 1.7);
  const fire = material('view-muzzle-flame', '#ffbd61', 0);
  fire.emissiveColor.set(1, 0.58, 0.12);
  fire.disableLighting = true;
  flash.material = fire;
  flash.isPickable = false;
  flash.renderingGroupId = 1;
  flash.alwaysSelectAsActiveMesh = true;
  flash.setEnabled(false);
  animations.set(root, {
    body,
    magazine,
    action,
    hand: supportHand,
    magazineBase: magazine.position.clone(),
    actionBase: action.position.clone(),
    handBase: supportHand.position.clone(),
    pistol,
    reloadStart: 0,
    deployStart: 0,
    lastTime: -1,
    wasReloading: false,
    wasDeploying: false,
  });
  return root;
}

/** Deterministic local assembly motion; the owning Game keeps control of root bob/recoil. */
export function animateWeapon(
  root: TransformNode,
  time: number,
  recoil: number,
  reloading: boolean,
  deploying: boolean,
): void {
  const state = animations.get(root);
  if (!state || !Number.isFinite(time)) return;
  if (time < state.lastTime) {
    state.wasReloading = false;
    state.wasDeploying = false;
  }
  if (reloading && !state.wasReloading) state.reloadStart = time;
  if (deploying && !state.wasDeploying) state.deployStart = time;
  state.lastTime = time;
  state.wasReloading = reloading;
  state.wasDeploying = deploying;
  const duration = state.pistol ? 2.2 : 2.45;
  const progress = reloading ? Math.max(0, Math.min(1, (time - state.reloadStart) / duration)) : 0;
  const lift = reloading ? Math.sin(progress * Math.PI) : 0;
  const magazineTravel = reloading
    ? Math.sin(Math.PI * Math.min(1, Math.max(0, (progress - 0.08) / 0.78)))
    : 0;
  const punch = Number.isFinite(recoil) ? Math.max(0, Math.min(1, recoil)) : 0;
  state.magazine.position.copyFrom(state.magazineBase);
  state.magazine.position.y -= magazineTravel * (state.pistol ? 0.24 : 0.31);
  state.magazine.position.x -= magazineTravel * 0.07;
  state.magazine.rotation.set(-magazineTravel * 0.2, 0, -magazineTravel * 0.18);
  state.action.position.copyFrom(state.actionBase);
  state.action.position.z -= punch * (state.pistol ? 0.045 : 0.055);
  if (reloading && progress > 0.85)
    state.action.position.z -= Math.sin(((progress - 0.85) / 0.15) * Math.PI) * 0.04;
  state.hand.position.copyFrom(state.handBase);
  state.hand.position.y -= magazineTravel * 0.22;
  state.hand.position.z -= lift * (state.pistol ? 0.02 : 0.2);
  state.hand.position.x -= lift * 0.035;
  state.hand.rotation.set(lift * 0.4, 0, lift * -0.16);
  const deploy = deploying ? Math.exp(-Math.max(0, time - state.deployStart) * 5) : 0;
  state.body.rotation.set(-lift * 0.16 + deploy * 0.3, lift * -0.12, lift * -0.24 + deploy * 0.12);
}
