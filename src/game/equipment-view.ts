import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import type { EquipmentKind } from './equipment';

const animations = new WeakMap<
  TransformNode,
  { body: TransformNode; hand: TransformNode; kind: EquipmentKind }
>();

/** Original blade bevels and a segmented HE body, without imported models or textures. */
export function createEquipmentView(
  scene: Scene,
  camera: UniversalCamera,
  kind: EquipmentKind,
): TransformNode {
  const root = new TransformNode(`held-${kind}`, scene);
  root.parent = camera;
  root.position = new Vector3(0.23, -0.24, 0.55);
  root.scaling.setAll(0.65);
  const material = (name: string, color: string, shine = 0.1) => {
    const cached = scene.getMaterialByName(name) as StandardMaterial | null;
    if (cached) return cached;
    const value = new StandardMaterial(name, scene);
    value.diffuseColor = Color3.FromHexString(color);
    value.specularColor.set(shine, shine, shine);
    value.specularPower = 48;
    return value;
  };
  const steel = material('equipment-satin-steel', '#a6b0aa', 0.48);
  const edge = material('equipment-polished-edge', '#d6dad0', 0.65);
  const dark = material('equipment-grip-rubber', '#29332f', 0.035);
  const olive = material('equipment-olive-enamel', '#62744a', 0.17);
  const seam = material('equipment-dark-seams', '#3b4a30', 0.04);
  const marking = material('equipment-yellow-marking', '#d1bd66', 0.05);
  const glove = material('view-tactical-gloves', '#827d65', 0.03);
  const fabric = material('view-operator-sleeves', '#52624b', 0.025);
  const body = new TransformNode(`equipment-${kind}-assembly`, scene);
  const hand = new TransformNode('equipment-gloved-hand', scene);
  const batches = new Map<string, { meshes: Mesh[]; parent: TransformNode }>();
  const attach = (
    mesh: Mesh,
    mat: StandardMaterial,
    x: number,
    y: number,
    z: number,
    parent = body,
  ) => {
    mesh.parent = parent;
    mesh.material = mat;
    mesh.position.set(x, y, z);
    mesh.renderingGroupId = 1;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    const key = `${parent.uniqueId}:${mat.uniqueId}`;
    const batch = batches.get(key) ?? { meshes: [], parent };
    batch.meshes.push(mesh);
    batches.set(key, batch);
    return mesh;
  };
  const block = (
    name: string,
    w: number,
    h: number,
    d: number,
    mat: StandardMaterial,
    x: number,
    y: number,
    z: number,
  ) => attach(MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene), mat, x, y, z);
  const cylinder = (
    name: string,
    diameter: number,
    height: number,
    mat: StandardMaterial,
    x: number,
    y: number,
    z: number,
    forward = false,
  ) => {
    const mesh = attach(
      MeshBuilder.CreateCylinder(name, { diameter, height, tessellation: 10 }, scene),
      mat,
      x,
      y,
      z,
    );
    if (forward) mesh.rotation.x = Math.PI / 2;
    return mesh;
  };
  const sphere = (
    name: string,
    size: number[],
    mat: StandardMaterial,
    x: number,
    y: number,
    z: number,
    parent = body,
  ) => {
    const mesh = attach(
      MeshBuilder.CreateSphere(name, { diameter: 1, segments: 6 }, scene),
      mat,
      x,
      y,
      z,
      parent,
    );
    mesh.scaling.set(size[0], size[1], size[2]);
    return mesh;
  };
  sphere('equipment-palm', [0.115, 0.14, 0.13], glove, 0, -0.045, 0, hand);
  sphere('equipment-thumb', [0.045, 0.09, 0.08], glove, -0.052, -0.01, 0.025, hand).rotation.z =
    -0.4;
  sphere('equipment-knuckle-pad', [0.1, 0.03, 0.105], dark, 0.015, 0.01, -0.015, hand);
  for (let i = 0; i < 3; i++)
    sphere('equipment-finger', [0.1, 0.024, 0.045], glove, 0, -0.025 - i * 0.027, 0.052, hand);
  const sleeve = attach(
    MeshBuilder.CreateCylinder(
      'equipment-sleeve',
      { diameterTop: 0.13, diameterBottom: 0.17, height: 0.3, tessellation: 8 },
      scene,
    ),
    fabric,
    0.02,
    -0.13,
    -0.18,
    hand,
  );
  sleeve.rotation.x = Math.PI / 2 - 0.35;
  attach(
    MeshBuilder.CreateCylinder(
      'equipment-cuff',
      { diameter: 0.14, height: 0.045, tessellation: 10 },
      scene,
    ),
    dark,
    0.005,
    -0.08,
    -0.07,
    hand,
  ).rotation.x = Math.PI / 2;
  if (kind === 'knife') {
    cylinder('knife-rubber-handle', 0.06, 0.2, dark, 0, 0.012, 0.045, true);
    for (let i = 0; i < 6; i++)
      cylinder('knife-handle-ring', 0.064, 0.008, seam, 0, 0.012, -0.035 + i * 0.03, true);
    cylinder('knife-pommel', 0.066, 0.025, steel, 0, 0.012, -0.066, true);
    const guard = cylinder('knife-guard', 0.13, 0.022, steel, 0, 0.012, 0.153, true);
    guard.scaling.y = 0.44;
    const positions = [
      -0.033, 0, 0.169, -0.039, 0, 0.435, 0, 0, 0.615, 0.039, 0, 0.435, 0.033, 0, 0.169, 0, 0.017,
      0.183, 0, 0.017, 0.43, 0, -0.01, 0.183, 0, -0.01, 0.43,
    ];
    const indices = [
      0, 5, 6, 0, 6, 1, 1, 6, 2, 2, 6, 3, 3, 6, 5, 3, 5, 4, 0, 1, 8, 0, 8, 7, 1, 2, 8, 2, 3, 8, 3,
      4, 7, 3, 7, 8, 0, 7, 5, 0, 5, 4, 4, 5, 7,
    ];
    const mesh = new Mesh('knife-ridged-blade', scene),
      vertex = new VertexData(),
      normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    vertex.positions = positions;
    vertex.indices = indices;
    vertex.normals = normals;
    vertex.uvs = positions.flatMap((_, index) => (index % 3 === 0 ? [0, 0] : []));
    vertex.applyToMesh(mesh);
    mesh.convertToFlatShadedMesh();
    attach(mesh, steel, 0, 0.012, 0);
    // A narrow brighter bevel runs along the sharpened edge rather than painting a flat slab.
    const bevel = MeshBuilder.CreateCylinder(
      'knife-edge-highlight',
      { diameterTop: 0.001, diameterBottom: 0.006, height: 0.27, tessellation: 3 },
      scene,
    );
    attach(bevel, edge, 0.036, 0.012, 0.302);
    bevel.rotation.x = Math.PI / 2;
    cylinder('knife-handle-fastener', 0.012, 0.063, steel, 0, 0.012, 0.04).rotation.z = Math.PI / 2;
  } else {
    const grenade = sphere('grenade-faceted-body', [0.21, 0.26, 0.21], olive, 0, 0.07, 0.075);
    grenade.convertToFlatShadedMesh();
    for (let i = 0; i < 4; i++) {
      const y = -0.015 + i * 0.055;
      const radius = Math.sqrt(Math.max(0.2, 1 - Math.pow((y - 0.07) / 0.13, 2)));
      attach(
        MeshBuilder.CreateTorus(
          'grenade-body-groove',
          { diameter: 0.21 * radius, thickness: 0.006, tessellation: 12 },
          scene,
        ),
        seam,
        0,
        y,
        0.075,
      );
    }
    cylinder('grenade-fuse-collar', 0.09, 0.036, dark, 0, 0.205, 0.075);
    cylinder('grenade-fuse-cap', 0.067, 0.027, steel, 0, 0.23, 0.075);
    block('grenade-spoon-top', 0.027, 0.018, 0.13, steel, 0.035, 0.25, 0.11).rotation.z = 0.12;
    block('grenade-spoon-side', 0.018, 0.17, 0.035, steel, 0.094, 0.16, 0.155).rotation.z = 0.48;
    const pin = attach(
      MeshBuilder.CreateTorus(
        'grenade-pull-ring',
        { diameter: 0.072, thickness: 0.008, tessellation: 12 },
        scene,
      ),
      steel,
      -0.07,
      0.225,
      0.072,
    );
    pin.rotation.z = Math.PI / 2;
    block('grenade-he-stripe', 0.13, 0.013, 0.012, marking, 0, 0.075, -0.019);
    for (const x of [-0.027, 0, 0.027])
      block('grenade-label-mark', 0.01, 0.023, 0.012, dark, x, 0.04, -0.027);
  }
  for (const batch of batches.values()) {
    const merged = Mesh.MergeMeshes(batch.meshes, true, true);
    if (!merged) continue;
    merged.name = `${kind}-${batch.parent === hand ? 'glove' : 'body'}-${merged.material?.name ?? 'surface'}`;
    merged.parent = batch.parent;
    merged.renderingGroupId = 1;
    merged.isPickable = false;
    merged.alwaysSelectAsActiveMesh = true;
  }
  body.parent = root;
  hand.parent = root;
  animations.set(root, { body, hand, kind });
  return root;
}

/** Local assembly accents; world/camera recoil remains owned by Game. */
export function animateEquipmentView(root: TransformNode, time: number, recoil: number): void {
  const state = animations.get(root);
  if (!state) return;
  const punch = Number.isFinite(recoil) ? Math.max(0, Math.min(1, recoil)) : 0;
  state.body.rotation.set(
    state.kind === 'knife' ? -punch * 0.22 : punch * 0.16,
    0,
    state.kind === 'knife' ? punch * 0.12 : -punch * 0.08,
  );
  state.body.position.y = Number.isFinite(time) ? Math.sin(time * 2.5) * 0.0015 : 0;
  state.hand.rotation.x = -punch * 0.1;
}
