import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';
import type { ActorState } from '../network/protocol';
import { weaponIdForSlot, weaponSpec } from './ballistics';

export interface ActorModel {
  readonly root: TransformNode;
  update(state: ActorState): void;
  dispose(): void;
}

/** Original articulated operators; rigid surfaces are batched per bone and material. */
export function createActor(scene: Scene, bot: boolean): ActorModel {
  const root = new TransformNode(bot ? 'bot-operator' : 'player-operator', scene);
  const material = (name: string, color: string) => {
    const existing = scene.getMaterialByName(name) as StandardMaterial | null;
    if (existing) return existing;
    const result = new StandardMaterial(name, scene);
    result.diffuseColor = Color3.FromHexString(color);
    result.specularColor.set(0.06, 0.06, 0.06);
    if (/cloth|vest|helmet|worn-leather/.test(name)) {
      const pixels = new Uint8Array(64 * 64 * 3);
      let seed = 29;
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          const weave = ((x + (y % 2)) % 3 === 0 ? -10 : 4) + ((seed >>> 27) - 16) * 0.5;
          const value = Math.round(228 + weave);
          const index = (y * 64 + x) * 3;
          pixels[index] = pixels[index + 1] = pixels[index + 2] = value;
        }
      const texture = RawTexture.CreateRGBTexture(
        pixels,
        64,
        64,
        scene,
        true,
        false,
        Texture.TRILINEAR_SAMPLINGMODE,
      );
      texture.name = `${name}-original-weave`;
      result.diffuseTexture = texture;
    }
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
  const accentParts: Mesh[] = [];
  const armor = material('operator-vest', '#3a4237');
  const helmet = material('operator-helmet', '#4d5546');
  const glove = material('operator-glove', '#777a5d');
  const dark = material('operator-dark', '#232925');
  const skinTones = ['#c3a58b', '#a58669', '#80634e', '#604b3d'].map((color, index) =>
    material(`operator-skin-${index}`, color),
  );
  const skin = skinTones[0];
  const skinParts: Mesh[] = [];
  const leather = material('operator-worn-leather', '#545044');
  const lens = material('operator-smoked-lens', '#456675');
  lens.specularColor.set(0.48, 0.58, 0.6);
  lens.specularPower = 64;
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
    if (mat === accent) accentParts.push(mesh);
    if (mat === skin) skinParts.push(mesh);
    mesh.isPickable = false;
    return mesh;
  };
  const torso = node('operator-torso');
  part('operator-jacket', [0.47, 0.53, 0.29], [0, 0, 0], cloth, torso);
  part('operator-vest-front', [0.43, 0.38, 0.12], [0, 0.005, 0.135], armor, torso);
  part('operator-vest-back', [0.4, 0.4, 0.11], [0, 0.005, -0.14], armor, torso);
  part('operator-unit-marking', [0.1, 0.055, 0.014], [-0.11, 0.09, 0.19], accent, torso);
  for (const x of [-0.12, 0, 0.12]) {
    part('operator-magazine-pouch', [0.08, 0.13, 0.07], [x, -0.09, 0.19], dark, torso);
    part('operator-vest-strap', [0.04, 0.3, 0.025], [x, 0.055, 0.2], dark, torso);
  }
  for (const side of [-1, 1]) {
    part(
      'operator-carrier-shoulder-strap',
      [0.065, 0.1, 0.32],
      [side * 0.155, 0.2, 0],
      armor,
      torso,
    );
    part('operator-carrier-buckle', [0.05, 0.05, 0.025], [side * 0.155, 0.15, 0.2], leather, torso);
    part('operator-vest-side-panel', [0.035, 0.25, 0.21], [side * 0.225, -0.04, 0], armor, torso);
    part(
      'operator-team-shoulder-tab',
      [0.07, 0.025, 0.2],
      [side * 0.17, 0.265, 0.01],
      accent,
      torso,
    );
  }
  for (let row = 0; row < 4; row++)
    part(
      'operator-carrier-webbing',
      [0.39, 0.012, 0.018],
      [0, 0.105 - row * 0.043, 0.201],
      leather,
      torso,
    );
  part('operator-radio-body', [0.07, 0.12, 0.045], [0.13, 0.13, 0.205], dark, torso);
  part('operator-radio-antenna', [0.012, 0.14, 0.012], [0.15, 0.25, 0.205], dark, torso);
  part('operator-medical-pouch', [0.13, 0.14, 0.075], [-0.13, -0.08, -0.23], armor, torso);
  part('operator-backpack-panel', [0.29, 0.3, 0.07], [0.025, 0.005, -0.22], leather, torso);
  const pelvis = part('operator-belt', [0.35, 0.17, 0.25], [0, 0.84, 0], dark);
  const beltGear = node('operator-belt-equipment');
  part('operator-belt-buckle', [0.085, 0.045, 0.03], [0, 0, 0.145], leather, beltGear);
  part('operator-drop-leg-holster', [0.08, 0.19, 0.12], [0.23, -0.11, 0.015], armor, beltGear);
  part('operator-utility-pouch', [0.12, 0.14, 0.1], [-0.2, -0.04, -0.035], leather, beltGear);
  part('operator-belt-grenade', [0.065, 0.095, 0.07], [-0.115, -0.035, 0.155], helmet, beltGear);
  const head = node('operator-head');
  const face = MeshBuilder.CreateSphere('operator-face', { diameter: 0.255, segments: 6 }, scene);
  face.scaling.y = 1.1;
  face.convertToFlatShadedMesh();
  face.parent = head;
  face.position.y = 0.005;
  face.material = skin;
  skinParts.push(face);
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
  for (const side of [-1, 1]) {
    part('operator-goggle-lens', [0.087, 0.041, 0.014], [side * 0.056, 0.028, 0.155], lens, head);
    part(
      'operator-helmet-side-rail',
      [0.025, 0.04, 0.15],
      [side * 0.165, 0.07, -0.015],
      dark,
      head,
    );
    part('operator-headset-cup', [0.045, 0.095, 0.08], [side * 0.17, -0.015, -0.015], armor, head);
    part('operator-headset-bracket', [0.018, 0.12, 0.018], [side * 0.18, 0.025, -0.03], dark, head);
    part('operator-cheek', [0.055, 0.05, 0.055], [side * 0.079, -0.035, 0.102], skin, head);
  }
  part('operator-nose', [0.035, 0.055, 0.055], [0, -0.012, 0.143], skin, head);
  part('operator-helmet-front-mount', [0.065, 0.055, 0.025], [0, 0.11, 0.16], dark, head);
  part(
    'operator-headset-microphone-arm',
    [0.012, 0.015, 0.14],
    [-0.16, -0.08, 0.07],
    dark,
    head,
  ).rotation.y = 0.3;
  part('operator-headset-microphone', [0.025, 0.025, 0.045], [-0.12, -0.08, 0.14], dark, head);
  part('operator-face-cover', [0.22, 0.09, 0.055], [0, -0.065, 0.1], armor, head);
  for (const side of [-1, 1])
    part('operator-ear-pad', [0.045, 0.1, 0.1], [side * 0.15, -0.015, 0], dark, head);
  const limbs = [-1, 1].map((side) => {
    const hip = node(`operator-hip-${side}`);
    hip.position.set(side * 0.105, 0.82, 0);
    part('operator-thigh', [0.185, 0.39, 0.205], [0, -0.195, 0], cloth, hip);
    const knee = node(`operator-knee-${side}`, hip);
    knee.position.y = -0.39;
    part('operator-shin', [0.145, 0.34, 0.16], [0, -0.17, 0], cloth, knee);
    part('operator-knee-pad', [0.15, 0.15, 0.07], [0, -0.035, 0.095], armor, knee);
    part('operator-knee-strap', [0.16, 0.035, 0.18], [0, -0.035, 0.005], dark, knee);
    const ankle = node(`operator-ankle-${side}`, knee);
    ankle.position.y = -0.35;
    part('operator-boot', [0.175, 0.16, 0.29], [0, 0, 0.055], leather, ankle);
    part('operator-boot-sole', [0.18, 0.035, 0.3], [0, -0.066, 0.055], dark, ankle);
    part('operator-boot-toe', [0.17, 0.07, 0.08], [0, 0, 0.178], dark, ankle);
    const shoulder = node(`operator-shoulder-${side}`);
    shoulder.position.set(side * 0.255, 1.38, 0);
    part('operator-upper-arm', [0.18, 0.27, 0.19], [0, -0.135, 0], cloth, shoulder);
    part(
      'operator-arm-unit-patch',
      [0.015, 0.075, 0.09],
      [side * 0.09, -0.105, 0.005],
      accent,
      shoulder,
    );
    const elbow = node(`operator-elbow-${side}`, shoulder);
    elbow.position.y = -0.25;
    part('operator-forearm', [0.135, 0.25, 0.145], [0, -0.125, 0], cloth, elbow);
    part('operator-hand', [0.125, 0.135, 0.15], [0, -0.245, 0.025], glove, elbow);
    part('operator-glove-knuckles', [0.1, 0.035, 0.1], [0, -0.205, 0.055], dark, elbow);
    part('operator-wrist-cuff', [0.14, 0.04, 0.14], [0, -0.175, 0.01], leather, elbow);
    if (side < 0)
      part('operator-wrist-watch', [0.075, 0.035, 0.065], [0, -0.17, 0.085], dark, elbow);
    return { side, hip, knee, ankle, shoulder, elbow };
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
  const rifleMagazine = part(
    'operator-magazine-body',
    [0.06, 0.15, 0.07],
    [0, -0.1, 0.05],
    dark,
    magazine,
  );
  const scope = node('operator-rifle-scope', rifle);
  part('operator-scope-barrel', [0.055, 0.055, 0.24], [0, 0.11, 0.1], dark, scope);
  part('operator-scope-front-lens', [0.05, 0.05, 0.012], [0, 0.11, 0.226], lens, scope);
  part('operator-scope-rear-lens', [0.05, 0.05, 0.012], [0, 0.11, -0.026], lens, scope);
  for (const z of [0.015, 0.15])
    part('operator-scope-mount', [0.06, 0.06, 0.025], [0, 0.07, z], dark, scope);
  const drum = node('operator-lmg-drum', magazine);
  const drumBody = MeshBuilder.CreateCylinder(
    'operator-drum-magazine',
    { diameter: 0.17, height: 0.11, tessellation: 12 },
    scene,
  );
  drumBody.parent = drum;
  drumBody.position.set(0, -0.1, 0.05);
  drumBody.rotation.z = Math.PI / 2;
  drumBody.material = armor;
  drumBody.isPickable = false;
  const bipod = node('operator-rifle-bipod', rifle);
  for (const side of [-1, 1])
    part(
      'operator-folded-bipod-leg',
      [0.016, 0.18, 0.022],
      [side * 0.05, -0.07, 0.43],
      dark,
      bipod,
    ).rotation.z = side * 0.18;
  const pump = node('operator-shotgun-pump', rifle);
  part('operator-pump-handguard', [0.105, 0.09, 0.18], [0, -0.025, 0.33], leather, pump);
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
  const bomb = node('operator-held-bomb', weapon);
  part('operator-objective-case', [0.24, 0.11, 0.16], [0, 0.015, 0.07], armor, bomb);
  part('operator-objective-screen', [0.1, 0.015, 0.04], [-0.035, 0.08, 0.07], lens, bomb);
  for (const x of [-0.08, 0.08])
    part('operator-objective-strap', [0.015, 0.12, 0.17], [x, 0.015, 0.07], dark, bomb);
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
  for (const parent of [
    torso,
    head,
    beltGear,
    rifle,
    pistol,
    knife,
    grenade,
    bomb,
    scope,
    bipod,
    pump,
    ...limbs.flatMap((limb) => [limb.hip, limb.knee, limb.ankle, limb.shoulder, limb.elbow]),
  ]) {
    const groups = new Map<StandardMaterial, Mesh[]>();
    for (const mesh of parent.getChildMeshes(true) as Mesh[]) {
      const mat = mesh.material as StandardMaterial;
      if (mat === cloth || accentParts.includes(mesh) || skinParts.includes(mesh)) continue;
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
  let locomotion = 0;
  let aimPitch = 0;
  let landing = 0;
  let wasGrounded: boolean | undefined;
  let identity: string | undefined;
  let lastShots = -1;
  let previousTool: ActorState['tool'] | undefined;
  let previousWeaponId = '';
  const destination = new Vector3();
  const observer = scene.onBeforeRenderObservable.add(() => {
    if (!state || state.health <= 0) return;
    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);
    const blend = 1 - Math.exp(-18 * dt);
    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    locomotion += (speed - locomotion) * (1 - Math.exp(-12 * dt));
    aimPitch += (Math.max(-0.85, Math.min(0.85, state.pitch ?? 0)) - aimPitch) * blend;
    if (wasGrounded === false && state.grounded)
      landing = Math.min(1, Math.abs(state.velocity.y) * 0.15 + 0.45);
    wasGrounded = state.grounded;
    landing = Math.max(0, landing - dt * 5);
    clock += dt;
    fireKick = Math.max(0, fireKick - dt * 8);
    draw = Math.max(0, draw - dt * 4);
    phase += locomotion * dt * 4.4;
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
    const stride = state.grounded ? Math.min(locomotion / 5, 0.65) * (1 - prone) : 0;
    const sway = Math.sin(phase) * stride;
    const airborne = state.grounded ? 0 : 1;
    const breathing = Math.sin(clock * 2.4) * 0.003 * (1 - prone);
    const bodyBob =
      (state.grounded ? Math.abs(Math.sin(phase)) * Math.min(locomotion, 0.7) * 0.012 : 0) +
      breathing -
      landing * 0.035;
    const reload = state.tool === 'firearm' && state.weaponState.reloadRemaining > 0;
    const spec = weaponSpec(
      weaponIdForSlot(state.weaponState.inventory[state.weapon].weaponId, state.weapon),
    );
    const progress = reload ? 1 - state.weaponState.reloadRemaining / spec.reload : 0;
    const reloadReach = reload ? Math.sin(progress * Math.PI) : 0;
    const forward =
      (state.velocity.x * Math.sin(state.yaw) + state.velocity.z * Math.cos(state.yaw)) /
      Math.max(speed, 0.01);
    const sideways =
      (state.velocity.x * Math.cos(state.yaw) - state.velocity.z * Math.sin(state.yaw)) /
      Math.max(speed, 0.01);
    torso.position.set(0, 1.17 - crouch * 0.43 - prone * 0.88 + bodyBob, prone * 0.1);
    torso.rotation.x = (prone * -Math.PI) / 2 + crouch * 0.14 + airborne * 0.06;
    torso.rotation.z = Math.sin(phase) * stride * 0.028;
    torso.rotation.y = -sideways * stride * 0.12;
    head.position.set(0, 1.59 - crouch * 0.67 - prone * 1.24 + bodyBob, prone * 0.43);
    head.rotation.x = prone * 0.08 + aimPitch * 0.7;
    pelvis.position.set(0, 0.84 - crouch * 0.4 - prone * 0.54, prone * -0.22);
    pelvis.rotation.x = (-prone * Math.PI) / 2;
    beltGear.position.copyFrom(pelvis.position);
    beltGear.rotation.copyFrom(pelvis.rotation);
    for (const limb of limbs) {
      const gait = sway * limb.side;
      const hipHeight = 0.82 - crouch * 0.35 - prone * 0.53 - landing * 0.025;
      limb.hip.position.set(limb.side * 0.105, hipHeight, -prone * 0.22);
      if (state.grounded && prone < 0.5) {
        // Two-link IK keeps the planted boot on the ground during stand/crouch transitions.
        // Only the swinging foot lifts; no raycasts or object allocation per leg/frame.
        const lift = Math.max(0, Math.sin(phase + (limb.side < 0 ? Math.PI : 0))) * stride * 0.13;
        const footZ = gait * 0.44 * forward;
        const down = hipHeight - 0.085 - lift;
        const distance = Math.max(0.1, Math.min(0.739, Math.hypot(down, footZ)));
        const kneeAngle = Math.acos(
          Math.max(
            -1,
            Math.min(1, (distance * distance - 0.39 * 0.39 - 0.35 * 0.35) / (2 * 0.39 * 0.35)),
          ),
        );
        limb.hip.rotation.x =
          Math.atan2(-footZ, down) -
          Math.atan2(0.35 * Math.sin(kneeAngle), 0.39 + 0.35 * Math.cos(kneeAngle));
        limb.knee.rotation.x = kneeAngle;
        limb.hip.rotation.z = -sideways * gait * 0.15;
        limb.ankle.rotation.x = -limb.hip.rotation.x - limb.knee.rotation.x;
        limb.ankle.rotation.z = -limb.hip.rotation.z;
      } else {
        limb.hip.rotation.x =
          (1 - prone) * (-0.25 - crouch * 0.6) +
          prone * (1.5 + Math.sin(phase + limb.side) * Math.min(locomotion, 1) * 0.08);
        limb.knee.rotation.x = (1 - prone) * 0.55 + prone * 0.1;
        limb.hip.rotation.z = 0;
        limb.ankle.rotation.x = prone * 0.2 - (1 - prone) * 0.15;
        limb.ankle.rotation.z = 0;
      }
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
    flash.position.z = state.weapon === 'primary' ? 0.7 * rifle.scaling.z : 0.24 * pistol.scaling.z;
    flash.setEnabled(fireKick > 0.65 && state.tool === 'firearm' && !reload);
    // Bone consumers also work before a rendered frame (preview and NullEngine tools).
    head.computeWorldMatrix(true);
  });
  return {
    root,
    update(next) {
      state = next;
      if (identity !== next.id) {
        identity = next.id;
        let hash = 2166136261;
        for (let i = 0; i < identity.length; i++)
          hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619);
        const style = (hash >>> 0) % skinTones.length;
        for (const mesh of skinParts) mesh.material = skinTones[style];
        root.metadata = { operatorStyle: style, skinTone: skinTones[style].name };
      }
      if (lastShots >= 0 && next.shots > lastShots) fireKick = 1;
      lastShots = next.shots;
      if (previousTool !== next.tool) {
        previousTool = next.tool;
        draw = 1;
      }
      const weaponId = weaponIdForSlot(
        next.weaponState.inventory[next.weapon].weaponId,
        next.weapon,
      );
      if (previousWeaponId !== weaponId) {
        previousWeaponId = weaponId;
        const kind = weaponSpec(weaponId).kind;
        rifle.scaling.set(
          kind === 'lmg' ? 1.15 : kind === 'smg' ? 0.85 : 1,
          kind === 'lmg' ? 1.1 : 1,
          kind === 'sniper'
            ? 1.35
            : kind === 'dmr'
              ? 1.18
              : kind === 'smg'
                ? 0.7
                : kind === 'shotgun'
                  ? 1.12
                  : 1,
        );
        pistol.scaling.setAll(
          kind === 'heavy-pistol' ? 1.15 : kind === 'compact-pistol' ? 0.85 : 1,
        );
        scope.setEnabled(kind === 'dmr' || kind === 'sniper');
        drum.setEnabled(kind === 'lmg');
        rifleMagazine.setEnabled(kind !== 'lmg' && kind !== 'sniper' && kind !== 'shotgun');
        bipod.setEnabled(kind === 'lmg' || kind === 'sniper');
        pump.setEnabled(kind === 'shotgun');
      }
      if (uniformTeam !== next.team) {
        uniformTeam = next.team;
        for (const mesh of clothParts) mesh.material = uniforms[next.team];
        for (const mesh of accentParts) mesh.material = markings[next.team];
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
      bomb.setEnabled(next.tool === 'bomb');
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      root.dispose();
    },
  };
}
