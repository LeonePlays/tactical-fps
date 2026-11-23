import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';

/** Original training device, sharing the camera equipment rendering layer. */
export function createBombView(scene: Scene, camera: UniversalCamera): TransformNode {
  const root = new TransformNode('held-bomb', scene);
  root.parent = camera;
  root.position.set(0.23, -0.24, 0.55);
  const material = (name: string, color: string) => {
    const cached = scene.getMaterialByName(name) as StandardMaterial | null;
    if (cached) return cached;
    const mat = new StandardMaterial(name, scene);
    mat.diffuseColor = Color3.FromHexString(color);
    return mat;
  };
  const part = (name: string, size: number[], pos: number[], color: string) => {
    const mesh = MeshBuilder.CreateBox(
      name,
      { width: size[0], height: size[1], depth: size[2] },
      scene,
    );
    mesh.parent = root;
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.material = material(`held-${color}`, color);
    mesh.isPickable = false;
    mesh.renderingGroupId = 1;
    mesh.alwaysSelectAsActiveMesh = true;
  };
  part('device-case', [0.28, 0.13, 0.2], [0, 0, 0], '#56634a');
  part('device-display', [0.13, 0.012, 0.065], [-0.04, 0.071, -0.03], '#80ba83');
  for (let n = 0; n < 9; n++)
    part(
      'device-key',
      [0.024, 0.012, 0.024],
      [0.055 + (n % 3) * 0.027, 0.071, -0.05 + Math.floor(n / 3) * 0.03],
      '#242a25',
    );
  for (const x of [-0.1, 0.1]) part('device-strap', [0.018, 0.14, 0.21], [x, 0, 0], '#242a25');
  return root;
}
