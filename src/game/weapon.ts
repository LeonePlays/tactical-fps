import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';

/** Original low-poly carbine, built entirely from primitives. */
export function createWeapon(scene: Scene, camera: UniversalCamera, pistol = false): TransformNode {
  const root = new TransformNode('carbine', scene);
  root.parent = camera;
  root.position = new Vector3(0.23, -0.24, 0.55);
  root.scaling.setAll(0.65);
  const metal = new StandardMaterial('carbine-gunmetal', scene);
  metal.diffuseColor = Color3.FromHexString('#272e2b');
  metal.specularColor.set(0.3, 0.3, 0.3);
  const grip = new StandardMaterial('carbine-olive-polymer', scene);
  grip.diffuseColor = Color3.FromHexString('#555a3f');
  grip.specularColor.set(0.04, 0.04, 0.04);
  const sight = new StandardMaterial('carbine-sight', scene);
  sight.diffuseColor = Color3.FromHexString('#b6cd77');
  sight.emissiveColor.set(0.3, 0.4, 0.15);
  const part = (name: string, size: number[], position: number[], mat: StandardMaterial) => {
    const mesh = MeshBuilder.CreateBox(
      name,
      { width: size[0], height: size[1], depth: size[2] },
      scene,
    );
    mesh.parent = root;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.renderingGroupId = 1;
    return mesh;
  };
  const glove = new StandardMaterial('operator-gloves', scene);
  glove.diffuseColor = Color3.FromHexString('#6d7059');
  glove.specularColor.set(0.02, 0.02, 0.02);
  part('trigger-hand', [0.09, 0.12, 0.12], [0.025, -0.16, -0.12], glove);
  part('right-sleeve', [0.12, 0.11, 0.23], [0.04, -0.2, -0.27], grip).rotation.x = -0.35;
  if (pistol) {
    part('pistol-slide', [0.075, 0.075, 0.3], [0, 0.015, 0.03], metal);
    part('pistol-frame', [0.065, 0.055, 0.24], [0, -0.045, 0.015], grip);
    part('pistol-grip', [0.075, 0.16, 0.09], [0, -0.13, -0.065], grip).rotation.x = -0.22;
    part('pistol-trigger-guard', [0.052, 0.025, 0.08], [0, -0.095, 0.03], metal);
    part('pistol-front-sight', [0.012, 0.023, 0.02], [0, 0.065, 0.14], sight);
    part('pistol-rear-sight', [0.055, 0.022, 0.025], [0, 0.065, -0.1], metal);
    part('support-hand', [0.09, 0.095, 0.1], [-0.045, -0.135, -0.04], glove);
    const flash = part('muzzle-flash', [0.09, 0.06, 0.12], [0, 0.015, 0.24], sight);
    const fire = new StandardMaterial('pistol-muzzle-light', scene);
    fire.emissiveColor.set(1, 0.65, 0.1);
    fire.disableLighting = true;
    flash.material = fire;
    flash.setEnabled(false);
    return root;
  }
  part('support-hand', [0.1, 0.1, 0.14], [-0.02, -0.07, 0.27], glove);
  part('left-sleeve', [0.1, 0.11, 0.27], [-0.08, -0.16, 0.15], grip).rotation.z = -0.5;
  part('receiver', [0.09, 0.12, 0.38], [0, 0, 0], metal);
  part('handguard', [0.085, 0.09, 0.3], [0, 0, 0.3], grip);
  part('stock', [0.09, 0.15, 0.22], [0, -0.015, -0.24], grip);
  part('magazine', [0.06, 0.2, 0.09], [0, -0.14, 0.02], metal).rotation.x = -0.2;
  part('pistol-grip', [0.065, 0.15, 0.07], [0, -0.13, -0.13], grip).rotation.x = -0.25;
  part('rail', [0.05, 0.025, 0.4], [0, 0.07, 0.1], metal);
  part('rear-sight', [0.05, 0.07, 0.03], [0, 0.1, -0.12], metal);
  part('front-sight', [0.02, 0.1, 0.025], [0, 0.09, 0.39], metal);
  part('sight-dot', [0.008, 0.012, 0.01], [0, 0.145, 0.37], sight);
  const barrel = MeshBuilder.CreateCylinder(
    'carbine-barrel',
    { diameter: 0.035, height: 0.25, tessellation: 10 },
    scene,
  );
  barrel.parent = root;
  barrel.position.set(0, 0.005, 0.54);
  barrel.rotation.x = Math.PI / 2;
  barrel.material = metal;
  barrel.isPickable = false;
  barrel.alwaysSelectAsActiveMesh = true;
  barrel.renderingGroupId = 1;
  const flash = part('muzzle-flash', [0.1, 0.06, 0.16], [0, 0.005, pistol ? 0.2 : 0.72], sight);
  const fire = new StandardMaterial('muzzle-light', scene);
  fire.emissiveColor.set(1, 0.65, 0.1);
  fire.disableLighting = true;
  flash.material = fire;
  flash.setEnabled(false);
  return root;
}
