import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import type { EquipmentKind } from './equipment';

/** Original low-poly view models, sharing materials across equip changes. */
export function createEquipmentView(
  scene: Scene,
  camera: UniversalCamera,
  kind: EquipmentKind,
): TransformNode {
  const root = new TransformNode(`held-${kind}`, scene);
  root.parent = camera;
  root.position = new Vector3(0.23, -0.24, 0.55);
  root.scaling.setAll(0.65);
  const material = (name: string, color: string) => {
    const cached = scene.getMaterialByName(name) as StandardMaterial | null;
    if (cached) return cached;
    const value = new StandardMaterial(name, scene);
    value.diffuseColor = Color3.FromHexString(color);
    value.specularColor.set(0.12, 0.12, 0.12);
    return value;
  };
  const metal = material('equipment-steel', '#8c928d'),
    dark = material('equipment-charcoal', '#303a32'),
    olive = material('equipment-olive', '#65704a'),
    glove = material('equipment-glove', '#76775d');
  const attach = (
    mesh: ReturnType<typeof MeshBuilder.CreateBox>,
    mat: StandardMaterial,
    x: number,
    y: number,
    z: number,
  ) => {
    mesh.parent = root;
    mesh.material = mat;
    mesh.position.set(x, y, z);
    mesh.renderingGroupId = 1;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
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
  block('equipment-hand', 0.12, 0.13, 0.13, glove, 0, -0.07, -0.03);
  block('equipment-sleeve', 0.14, 0.13, 0.25, olive, 0.025, -0.15, -0.18).rotation.x = -0.35;
  if (kind === 'knife') {
    block('knife-grip', 0.045, 0.05, 0.2, dark, 0, -0.005, 0.04);
    block('knife-guard', 0.13, 0.03, 0.035, metal, 0, 0.005, 0.16);
    block('knife-blade', 0.055, 0.017, 0.3, metal, 0, 0.012, 0.32);
    const point = MeshBuilder.CreateCylinder(
      'knife-point',
      { diameterTop: 0, diameterBottom: 0.055, height: 0.1, tessellation: 3 },
      scene,
    );
    attach(point, metal, 0, 0.012, 0.52);
    point.rotation.x = Math.PI / 2;
    block('knife-spine', 0.015, 0.025, 0.28, dark, -0.025, 0.02, 0.3);
  } else {
    attach(
      MeshBuilder.CreateSphere('grenade-body', { diameter: 0.18, segments: 8 }, scene),
      olive,
      0,
      0.045,
      0.06,
    ).scaling.y = 1.25;
    block('grenade-cap', 0.08, 0.045, 0.07, dark, 0, 0.17, 0.06);
    block('grenade-lever', 0.035, 0.04, 0.17, metal, 0.045, 0.17, 0.1);
    const pin = MeshBuilder.CreateTorus(
      'grenade-pin',
      { diameter: 0.065, thickness: 0.012, tessellation: 10 },
      scene,
    );
    attach(pin, metal, -0.065, 0.17, 0.055);
    pin.rotation.z = Math.PI / 2;
  }
  return root;
}
