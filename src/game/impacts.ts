import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
/** Bounded pool; no per-shot materials, textures or unbounded mesh growth. */
export class ImpactPool {
  private cursor = 0;
  private readonly entries: { mesh: Mesh; expires: number }[] = [];
  constructor(scene: Scene, count = 64) {
    const material = new StandardMaterial('bullet-impact', scene);
    material.diffuseColor = Color3.FromHexString('#191914');
    material.disableLighting = true;
    material.emissiveColor = Color3.FromHexString('#191914');
    for (let i = 0; i < count; i++) {
      const mesh = MeshBuilder.CreateDisc(
        `impact-${i}`,
        { radius: 0.035, tessellation: 8, sideOrientation: Mesh.DOUBLESIDE },
        scene,
      );
      mesh.material = material;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.entries.push({ mesh, expires: 0 });
    }
  }
  add(point: Vector3, normal: Vector3, now: number) {
    const entry = this.entries[this.cursor++ % this.entries.length];
    entry.mesh.position.copyFrom(point).addInPlace(normal.scale(0.006));
    entry.mesh.lookAt(point.add(normal));
    entry.expires = now + 20;
    entry.mesh.setEnabled(true);
  }
  update(now: number) {
    for (const entry of this.entries)
      if (entry.expires && now >= entry.expires) {
        entry.mesh.setEnabled(false);
        entry.expires = 0;
      }
  }
  clear() {
    for (const entry of this.entries) {
      entry.mesh.setEnabled(false);
      entry.expires = 0;
    }
  }
}
