import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { ActorState } from '../network/protocol';

export interface ActorModel {
  readonly root: TransformNode;
  update(state: ActorState): void;
  dispose(): void;
}

/** Original articulated operator. Materials are shared per scene; no imported assets. */
export function createActor(scene: Scene, bot: boolean): ActorModel {
  const root = new TransformNode(bot ? 'bot-operator' : 'player-operator', scene);
  const material = (name: string, color: string) => {
    const existing = scene.getMaterialByName(name) as StandardMaterial | null;
    if (existing) return existing;
    const result = new StandardMaterial(name, scene);
    result.diffuseColor = Color3.FromHexString(color);
    result.specularColor.set(0.06, 0.06, 0.06);
    return result;
  };
  const uniforms = {
    alpha: material('operator-blue-cloth', '#526d7d'),
    bravo: material('operator-rust-cloth', '#976442'),
  };
  const markings = {
    alpha: material('operator-blue-marking', '#81b0c6'),
    bravo: material('operator-rust-marking', '#d48b4a'),
  };
  const cloth = bot ? uniforms.bravo : uniforms.alpha;
  const clothParts: Mesh[] = [];
  const armor = material('operator-vest', '#3a4237');
  const helmet = material('operator-helmet', '#4d5546');
  const glove = material('operator-glove', '#777a5d');
  const dark = material('operator-dark', '#232925');
  const skin = material('operator-skin', '#ac9579');
  const accent = bot ? markings.bravo : markings.alpha;
  const node = (name: string, parent = root) => {
    const part = new TransformNode(name, scene);
    part.parent = parent;
    return part;
  };
  const part = (
    name: string,
    size: readonly number[],
    position: readonly number[],
    mat: StandardMaterial,
    parent = root,
  ) => {
    const mesh = MeshBuilder.CreateBox(
      name,
      { width: size[0], height: size[1], depth: size[2] },
      scene,
    );
    mesh.parent = parent;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.material = mat;
    if (mat === cloth) clothParts.push(mesh);
    mesh.isPickable = false;
    return mesh;
  };
  const torso = node('operator-torso');
  part('operator-jacket', [0.4, 0.48, 0.25], [0, 0, 0], cloth, torso);
  part('operator-vest-front', [0.43, 0.34, 0.06], [0, 0.015, 0.15], armor, torso);
  part('operator-vest-back', [0.36, 0.37, 0.06], [0, 0, -0.15], armor, torso);
  const marking = part(
    'operator-unit-marking',
    [0.1, 0.055, 0.014],
    [-0.11, 0.09, 0.19],
    accent,
    torso,
  );
  for (const x of [-0.12, 0, 0.12])
    part('operator-magazine-pouch', [0.075, 0.115, 0.05], [x, -0.09, 0.2], dark, torso);
  const pelvis = part('operator-belt', [0.35, 0.17, 0.25], [0, 0.84, 0], dark);
  const head = node('operator-head');
  const face = MeshBuilder.CreateSphere('operator-face', { diameter: 0.27, segments: 8 }, scene);
  face.parent = head;
  face.position.y = 0.005;
  face.material = skin;
  face.isPickable = false;
  const cap = MeshBuilder.CreateSphere(
    'operator-helmet-shell',
    { diameter: 0.33, segments: 8 },
    scene,
  );
  cap.parent = head;
  cap.position.y = 0.085;
  cap.scaling.y = 0.65;
  cap.material = helmet;
  cap.isPickable = false;
  part('operator-helmet-rim', [0.34, 0.035, 0.3], [0, 0.045, 0.025], helmet, head);
  part('operator-goggles', [0.24, 0.065, 0.035], [0, 0.025, 0.13], dark, head);
  part('operator-face-cover', [0.22, 0.09, 0.055], [0, -0.065, 0.1], armor, head);
  const limbs = [-1, 1].map((side) => {
    const hip = node(`operator-hip-${side}`);
    hip.position.set(side * 0.105, 0.82, 0);
    part('operator-thigh', [0.15, 0.35, 0.17], [0, -0.175, 0], cloth, hip);
    const knee = node(`operator-knee-${side}`, hip);
    knee.position.y = -0.35;
    part('operator-shin', [0.13, 0.34, 0.15], [0, -0.17, 0], cloth, knee);
    part('operator-knee-pad', [0.14, 0.12, 0.035], [0, -0.035, 0.095], armor, knee);
    part('operator-boot', [0.155, 0.14, 0.25], [0, -0.33, 0.035], dark, knee);
    const shoulder = node(`operator-shoulder-${side}`);
    shoulder.position.set(side * 0.255, 1.38, 0);
    part('operator-upper-arm', [0.14, 0.27, 0.16], [0, -0.135, 0], cloth, shoulder);
    const elbow = node(`operator-elbow-${side}`, shoulder);
    elbow.position.y = -0.25;
    part('operator-forearm', [0.115, 0.25, 0.14], [0, -0.125, 0], cloth, elbow);
    part('operator-hand', [0.12, 0.12, 0.14], [0, -0.245, 0.025], glove, elbow);
    return { side, hip, knee, shoulder, elbow };
  });
  const weapon = node('operator-held-weapon');
  part('operator-rifle-receiver', [0.075, 0.09, 0.32], [0, 0, 0.04], dark, weapon);
  part('operator-rifle-grip', [0.055, 0.13, 0.065], [0, -0.095, -0.035], dark, weapon);
  const rifleParts = [
    part('operator-rifle-stock', [0.075, 0.12, 0.19], [0, -0.015, -0.2], armor, weapon),
    part('operator-rifle-handguard', [0.075, 0.075, 0.22], [0, 0, 0.3], armor, weapon),
    part('operator-rifle-barrel', [0.026, 0.026, 0.22], [0, 0.01, 0.52], dark, weapon),
    part('operator-rifle-magazine', [0.06, 0.15, 0.07], [0, -0.1, 0.05], dark, weapon),
  ];
  let state: ActorState | undefined;
  let uniformTeam: ActorState['team'] | undefined;
  let placed = false;
  let phase = 0;
  let crouch = 0;
  let prone = 0;
  const destination = new Vector3();
  const observer = scene.onBeforeRenderObservable.add(() => {
    if (!state || state.health <= 0) return;
    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);
    const blend = 1 - Math.exp(-18 * dt);
    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    phase += speed * dt * 4.4;
    const desiredCrouch = state.stance === 'crouching' ? 1 : 0;
    const desiredProne = state.stance === 'prone' ? 1 : 0;
    crouch += (desiredCrouch - crouch) * blend;
    prone += (desiredProne - prone) * blend;
    root.position.x += (destination.x - root.position.x) * blend;
    root.position.y += (destination.y - root.position.y) * blend;
    root.position.z += (destination.z - root.position.z) * blend;
    const yawDifference = Math.atan2(
      Math.sin(state.yaw - root.rotation.y),
      Math.cos(state.yaw - root.rotation.y),
    );
    root.rotation.y += yawDifference * blend;
    const stride = state.grounded ? Math.min(speed / 5, 0.65) * (1 - prone) : 0;
    const sway = Math.sin(phase) * stride;
    const bodyBob = state.grounded ? Math.abs(Math.sin(phase)) * Math.min(speed, 0.7) * 0.018 : 0;
    torso.position.set(0, 1.17 - crouch * 0.43 - prone * 0.88 + bodyBob, prone * 0.1);
    torso.rotation.x = (prone * -Math.PI) / 2 + crouch * 0.14;
    head.position.set(0, 1.59 - crouch * 0.67 - prone * 1.24 + bodyBob, prone * 0.43);
    head.rotation.x = prone * 0.08;
    pelvis.position.set(0, 0.84 - crouch * 0.4 - prone * 0.54, prone * -0.22);
    pelvis.rotation.x = (-prone * Math.PI) / 2;
    for (const limb of limbs) {
      const gait = sway * limb.side;
      limb.hip.position.set(limb.side * 0.105, 0.82 - crouch * 0.35 - prone * 0.53, -prone * 0.22);
      limb.hip.rotation.x = (1 - prone) * (gait - crouch * 1.1) + prone * 1.5;
      limb.knee.rotation.x =
        (1 - prone) * (Math.max(0, -gait) * 0.65 + crouch * 1.75) + prone * 0.1;
      limb.shoulder.position.set(
        limb.side * 0.25,
        1.35 - crouch * 0.51 - prone * 1.02,
        prone * 0.15,
      );
      limb.shoulder.rotation.x = -1.03 + prone * -0.4;
      limb.shoulder.rotation.z = limb.side * 0.12;
      limb.elbow.rotation.x = -0.4;
    }
    weapon.position.set(0.035, 1.11 - crouch * 0.48 - prone * 0.73, 0.39 + prone * 0.2);
    weapon.rotation.x = 0;
  });
  return {
    root,
    update(next) {
      state = next;
      if (uniformTeam !== next.team) {
        uniformTeam = next.team;
        for (const mesh of clothParts) mesh.material = uniforms[next.team];
        marking.material = markings[next.team];
      }
      root.setEnabled(next.health > 0);
      destination.set(next.position.x, next.position.y, next.position.z);
      if (!placed || Vector3.DistanceSquared(root.position, destination) > 16) {
        root.position.copyFrom(destination);
        root.rotation.y = next.yaw;
        placed = true;
      }
      for (const mesh of rifleParts) mesh.setEnabled(next.weapon === 'primary');
      weapon.scaling.z = next.weapon === 'primary' ? 1 : 0.7;
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      root.dispose();
    },
  };
}
