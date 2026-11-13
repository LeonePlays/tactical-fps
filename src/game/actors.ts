import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { ActorState } from '../network/protocol';
import { WEAPONS } from './ballistics';

export interface ActorModel {
  readonly root: TransformNode;
  update(state: ActorState): void;
  dispose(): void;
}

/** Original faceted operator, with rigid geometry batched per animated bone/material. */
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
    const rounded = /hand$|boot$|knee-pad$|face-cover$|goggles$/.test(name);
    const tapered =
      /jacket$|vest-front$|vest-back$|thigh$|shin$|upper-arm$|forearm$|magazine-pouch$/.test(name);
    const barrel = /barrel$|rifle-receiver$|rifle-handguard$/.test(name);
    const mesh = rounded
      ? MeshBuilder.CreateSphere(name, { diameter: 1, segments: 6 }, scene)
      : tapered || barrel
        ? MeshBuilder.CreateCylinder(
            name,
            { diameterTop: 1, diameterBottom: barrel ? 1 : 0.76, height: 1, tessellation: 8 },
            scene,
          )
        : MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, scene);
    if (rounded || tapered) mesh.scaling.set(size[0], size[1], size[2]);
    if (barrel) {
      mesh.scaling.set(size[0], size[2], size[1]);
      mesh.rotation.x = Math.PI / 2;
    }
    if (rounded || tapered || barrel) mesh.convertToFlatShadedMesh();
    mesh.parent = parent;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.material = mat;
    if (mat === cloth) clothParts.push(mesh);
    mesh.isPickable = false;
    return mesh;
  };
  const torso = node('operator-torso');
  part('operator-jacket', [0.47, 0.53, 0.29], [0, 0, 0], cloth, torso);
  part('operator-vest-front', [0.43, 0.38, 0.12], [0, 0.005, 0.135], armor, torso);
  part('operator-vest-back', [0.4, 0.4, 0.11], [0, 0.005, -0.14], armor, torso);
  const marking = part(
    'operator-unit-marking',
    [0.1, 0.055, 0.014],
    [-0.11, 0.09, 0.19],
    accent,
    torso,
  );
  for (const x of [-0.12, 0, 0.12]) {
    part('operator-magazine-pouch', [0.08, 0.13, 0.07], [x, -0.09, 0.19], dark, torso);
    part('operator-vest-strap', [0.04, 0.3, 0.025], [x, 0.055, 0.2], dark, torso);
  }
  const pelvis = part('operator-belt', [0.35, 0.17, 0.25], [0, 0.84, 0], dark);
  const head = node('operator-head');
  const face = MeshBuilder.CreateSphere('operator-face', { diameter: 0.255, segments: 6 }, scene);
  face.scaling.y = 1.1;
  face.convertToFlatShadedMesh();
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
  cap.convertToFlatShadedMesh();
  cap.material = helmet;
  cap.isPickable = false;
  part('operator-helmet-rim', [0.34, 0.035, 0.3], [0, 0.045, 0.025], helmet, head);
  part('operator-goggles', [0.24, 0.065, 0.035], [0, 0.025, 0.13], dark, head);
  part('operator-face-cover', [0.22, 0.09, 0.055], [0, -0.065, 0.1], armor, head);
  for (const side of [-1, 1])
    part('operator-ear-pad', [0.045, 0.1, 0.1], [side * 0.15, -0.015, 0], dark, head);
  const limbs = [-1, 1].map((side) => {
    const hip = node(`operator-hip-${side}`);
    hip.position.set(side * 0.105, 0.82, 0);
    part('operator-thigh', [0.185, 0.35, 0.205], [0, -0.175, 0], cloth, hip);
    const knee = node(`operator-knee-${side}`, hip);
    knee.position.y = -0.35;
    part('operator-shin', [0.145, 0.34, 0.16], [0, -0.17, 0], cloth, knee);
    part('operator-knee-pad', [0.15, 0.15, 0.07], [0, -0.035, 0.095], armor, knee);
    part('operator-boot', [0.175, 0.16, 0.29], [0, -0.33, 0.055], dark, knee);
    const shoulder = node(`operator-shoulder-${side}`);
    shoulder.position.set(side * 0.255, 1.38, 0);
    part('operator-upper-arm', [0.18, 0.27, 0.19], [0, -0.135, 0], cloth, shoulder);
    const elbow = node(`operator-elbow-${side}`, shoulder);
    elbow.position.y = -0.25;
    part('operator-forearm', [0.135, 0.25, 0.145], [0, -0.125, 0], cloth, elbow);
    part('operator-hand', [0.125, 0.135, 0.15], [0, -0.245, 0.025], glove, elbow);
    return { side, hip, knee, shoulder, elbow };
  });
  const weapon = node('operator-held-weapon');
  const rifle = node('operator-rifle', weapon);
  part('operator-rifle-receiver', [0.085, 0.1, 0.32], [0, 0, 0.04], dark, rifle);
  part('operator-rifle-grip', [0.055, 0.13, 0.065], [0, -0.095, -0.035], dark, rifle).rotation.x =
    -0.2;
  part('operator-rifle-stock', [0.075, 0.12, 0.19], [0, -0.015, -0.2], armor, rifle);
  part('operator-rifle-handguard', [0.075, 0.075, 0.22], [0, 0, 0.3], armor, rifle);
  part('operator-rifle-barrel', [0.026, 0.026, 0.22], [0, 0.01, 0.52], dark, rifle);
  const magazine = node('operator-rifle-magazine', rifle);
  part('operator-magazine-body', [0.06, 0.15, 0.07], [0, -0.1, 0.05], dark, magazine);
  const pistol = node('operator-sidearm', weapon);
  part('operator-pistol-slide', [0.075, 0.08, 0.25], [0, 0, 0.04], dark, pistol);
  part('operator-pistol-grip', [0.07, 0.15, 0.085], [0, -0.095, -0.025], armor, pistol).rotation.x =
    -0.22;
  const steel = material('operator-weapon-steel', '#858e89');
  const knife = node('operator-held-knife', weapon);
  part('operator-knife-grip', [0.045, 0.045, 0.14], [0, 0, 0.02], dark, knife);
  part('operator-knife-guard', [0.1, 0.025, 0.03], [0, 0, 0.11], dark, knife);
  const blade = MeshBuilder.CreateCylinder(
    'operator-knife-blade',
    { diameterTop: 0, diameterBottom: 0.055, height: 0.28, tessellation: 3 },
    scene,
  );
  blade.parent = knife;
  blade.position.set(0, 0, 0.25);
  blade.scaling.z = 0.2;
  blade.rotation.x = Math.PI / 2;
  blade.material = steel;
  blade.isPickable = false;
  const grenade = node('operator-held-grenade', weapon);
  const grenadeBody = MeshBuilder.CreateSphere(
    'operator-grenade-body',
    { diameter: 0.14, segments: 6 },
    scene,
  );
  grenadeBody.parent = grenade;
  grenadeBody.position.set(0, 0, 0.08);
  grenadeBody.scaling.y = 1.2;
  grenadeBody.material = helmet;
  grenadeBody.isPickable = false;
  part('operator-grenade-lever', [0.025, 0.04, 0.12], [0.03, 0.09, 0.09], steel, grenade);
  const flashMaterial = material('operator-muzzle-fire', '#ffe09b');
  flashMaterial.emissiveColor = Color3.FromHexString('#ffba42');
  flashMaterial.disableLighting = true;
  const flash = part(
    'operator-muzzle-flash',
    [0.075, 0.065, 0.15],
    [0, 0.01, 0.7],
    flashMaterial,
    weapon,
  );
  flash.setEnabled(false);

  // Bake local surfaces per rigid bone. Materials remain shared across every actor.
  for (const parent of [torso, head, rifle, pistol, knife, grenade]) {
    const groups = new Map<StandardMaterial, Mesh[]>();
    for (const mesh of parent.getChildMeshes(true) as Mesh[]) {
      const mat = mesh.material as StandardMaterial;
      if (mat === cloth || mesh === marking) continue;
      const list = groups.get(mat) ?? [];
      list.push(mesh);
      groups.set(mat, list);
    }
    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue;
      const name = meshes[0].name;
      for (const mesh of meshes) {
        mesh.parent = null;
        mesh.computeWorldMatrix(true);
      }
      const merged = Mesh.MergeMeshes(meshes, true, true);
      if (merged) {
        merged.name = name;
        merged.parent = parent;
        merged.isPickable = false;
      }
    }
  }
  let state: ActorState | undefined;
  let uniformTeam: ActorState['team'] | undefined;
  let placed = false;
  let phase = 0;
  let crouch = 0;
  let prone = 0;
  let clock = 0;
  let fireKick = 0;
  let draw = 0;
  let lastShots = -1;
  let previousTool: ActorState['tool'] | undefined;
  const destination = new Vector3();
  const observer = scene.onBeforeRenderObservable.add(() => {
    if (!state || state.health <= 0) return;
    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);
    const blend = 1 - Math.exp(-18 * dt);
    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    clock += dt;
    fireKick = Math.max(0, fireKick - dt * 8);
    draw = Math.max(0, draw - dt * 4);
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
    const airborne = state.grounded ? 0 : 1;
    const breathing = Math.sin(clock * 2.4) * 0.003 * (1 - prone);
    const bodyBob =
      (state.grounded ? Math.abs(Math.sin(phase)) * Math.min(speed, 0.7) * 0.018 : 0) + breathing;
    const reload = state.tool === 'firearm' && state.weaponState.reloadRemaining > 0;
    const progress = reload
      ? 1 - state.weaponState.reloadRemaining / WEAPONS[state.weapon].reload
      : 0;
    const reloadReach = reload ? Math.sin(progress * Math.PI) : 0;
    const aimPitch = Math.max(-0.85, Math.min(0.85, state.pitch ?? 0));
    torso.position.set(0, 1.17 - crouch * 0.43 - prone * 0.88 + bodyBob, prone * 0.1);
    torso.rotation.x = (prone * -Math.PI) / 2 + crouch * 0.14 + airborne * 0.06;
    torso.rotation.z = Math.sin(phase) * stride * 0.028;
    head.position.set(0, 1.59 - crouch * 0.67 - prone * 1.24 + bodyBob, prone * 0.43);
    head.rotation.x = prone * 0.08 + aimPitch * 0.7;
    pelvis.position.set(0, 0.84 - crouch * 0.4 - prone * 0.54, prone * -0.22);
    pelvis.rotation.x = (-prone * Math.PI) / 2;
    for (const limb of limbs) {
      const gait = sway * limb.side;
      limb.hip.position.set(limb.side * 0.105, 0.82 - crouch * 0.35 - prone * 0.53, -prone * 0.22);
      limb.hip.rotation.x =
        (1 - prone) * (gait - crouch * 1.1 - airborne * 0.25) +
        prone * (1.5 + Math.sin(phase + limb.side) * Math.min(speed, 1) * 0.08);
      limb.knee.rotation.x =
        (1 - prone) * (Math.max(0, -gait) * 0.65 + crouch * 1.75 + airborne * 0.55) + prone * 0.1;
      limb.shoulder.position.set(
        limb.side * 0.25,
        1.35 - crouch * 0.51 - prone * 1.02,
        prone * 0.15 + (limb.side < 0 ? 0.08 : 0),
      );
      limb.shoulder.rotation.x =
        -1.03 -
        prone * 0.4 +
        aimPitch * 0.65 +
        fireKick * 0.06 +
        (limb.side < 0 ? reloadReach * 0.85 : 0) +
        draw * 0.35;
      limb.shoulder.rotation.z = -limb.side * 0.38 + (limb.side < 0 ? reloadReach * 0.35 : 0);
      limb.elbow.rotation.x = -0.4 - (limb.side < 0 ? reloadReach * 0.75 : 0);
    }
    weapon.position.set(
      0.035,
      1.11 - crouch * 0.48 - prone * 0.73 - draw * 0.08,
      0.39 + prone * 0.2 - fireKick * 0.045,
    );
    weapon.rotation.x = aimPitch - fireKick * 0.08 + reloadReach * 0.25 + draw * 0.3;
    magazine.position.y = -reloadReach * 0.2;
    magazine.rotation.x = reloadReach * 0.3;
    flash.position.z = state.weapon === 'primary' ? 0.7 : 0.24;
    flash.setEnabled(fireKick > 0.65 && state.tool === 'firearm' && !reload);
    // Bone consumers also work before a rendered frame (preview and NullEngine tools).
    head.computeWorldMatrix(true);
  });
  return {
    root,
    update(next) {
      state = next;
      if (lastShots >= 0 && next.shots > lastShots) fireKick = 1;
      lastShots = next.shots;
      if (previousTool !== next.tool) {
        previousTool = next.tool;
        draw = 1;
      }
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
      rifle.setEnabled(next.tool === 'firearm' && next.weapon === 'primary');
      pistol.setEnabled(next.tool === 'firearm' && next.weapon === 'secondary');
      knife.setEnabled(next.tool === 'knife');
      grenade.setEnabled(next.tool === 'grenade' && next.grenades > 0);
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      root.dispose();
    },
  };
}
