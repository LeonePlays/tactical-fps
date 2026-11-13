import { createActor, type ActorModel } from './actors';
import type { MatchInput, MatchState } from '../network/protocol';
import { seedFor, shotDirection, spreadFor, type WeaponSlot } from './ballistics';
import {
  EquipmentInventory,
  blastHits,
  meleeTarget,
  stepGrenade,
  type GrenadeProjectile,
} from './equipment';
import { createEquipmentView, animateEquipmentView } from './equipment-view';
import { ROUND_RULES } from './rounds';
import { getMap } from './maps';
import type { MapId } from './match-config';
import { FixedStepClock } from '../core/fixed-step';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { WeaponController } from './weapons';
import { buy, SHOP, type BuyItem } from './shop';
import { ImpactPool } from './impacts';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Ray } from '@babylonjs/core/Culling/ray';
import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { GameAudio } from './audio';
import { PlayerBody, type Stance, type Vec3, type Solid } from './physics';
import { rayBox } from '../network/arena';
const canHearPosition = (solids: readonly Solid[], from: Vec3, to: Vec3) => {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  return (
    d < 0.01 ||
    !solids.some(
      (s) =>
        rayBox(
          { x: from.x, y: from.y + 1, z: from.z },
          { x: (to.x - from.x) / d, y: 0, z: (to.z - from.z) / d },
          s,
        ) <
        d - 0.1,
    )
  );
};
import { createWorld, getTargetId, type World } from './world';
import { createWeapon, animateWeapon } from './weapon';
import type { Settings } from '../core/settings';

export interface GameSnapshot {
  renderScale: number;
  shadows: boolean;
  map: MapId;
  tool: MatchInput['tool'];
  grenades: number;
  weapon: WeaponSlot;
  weaponVisible: boolean;
  fov: number;
  reserve: number;
  health: number;
  armor: number;
  money: number;
  buying: boolean;
  buyAllowed: boolean;
  buyMessage: string;
  deploying: boolean;
  spread: number;
  speed: number;
  impacts: number;
  radarSolids: World['solids'];
  contacts: { x: number; z: number }[];
  ammo: number;
  hits: number;
  shots: number;
  elapsed: number;
  reloading: boolean;
  stance: Stance;
  grounded: boolean;
  sprinting: boolean;
  position: Vec3;
  yaw: number;
  fps: number;
  hit: boolean;
}
export interface GameEvents {
  onLockChange(locked: boolean): void;
  onSnapshot(snapshot: GameSnapshot): void;
  onInput?(input: MatchInput): void;
  onTick?(dt: number): void;
  onScoreboard?(visible: boolean): void;
}

export class Game {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: UniversalCamera;
  private readonly menuCamera: UniversalCamera;
  private readonly world: World;
  private weapon: TransformNode;
  private weaponMeshes: AbstractMesh[] = [];
  private muzzleFlash?: AbstractMesh;
  private readonly clock = new FixedStepClock();
  private previousPosition: Vec3 | undefined;
  private renderAlpha = 1;
  private matchId = 0;
  private readonly cameraCorrection = new Vector3();
  private readonly remoteAudio = new Map<
    string,
    { shots: number; footsteps: number; position: Vec3 }
  >();
  private damageUntil = 0;
  private gun = new WeaponController();
  private tool: MatchInput['tool'] = 'firearm';
  private readonly equipment = new EquipmentInventory();
  private toolReady = 0;
  private combatAllowed = true;
  private matchRound = 0;
  private readonly targetHealth = new Map<number, number>();
  private readonly trainingGrenades: { projectile: GrenadeProjectile; mesh: Mesh }[] = [];
  private readonly remoteGrenades = new Map<
    string,
    { mesh: Mesh; remaining: number; target: Vector3 }
  >();
  private readonly explosions: { mesh: Mesh; age: number; radius: number }[] = [];
  private bombSite?: Mesh;
  private bombMesh?: Mesh;
  private bombStatus = '';
  private get slot() {
    return this.gun.slot;
  }
  private flashUntil = 0;
  private fireSequence = 0;
  private reloadSequence = 0;
  private purchaseSequence = 0;
  private purchaseItem: BuyItem | null = null;
  private buying = false;
  private wallet = { money: 16000, armor: 0 };
  private buyAllowed = true;
  private buyMessage = '';
  private contacts: { x: number; z: number }[] = [];
  private stepDistance = 0;
  private impactCount = 0;
  private readonly impacts: ImpactPool;
  private netTimer = 0;
  private matchHealth = 100;
  private receivedMatch = false;
  private remotes = new Map<string, ActorModel>();
  private readonly audio = new GameAudio();
  private body: PlayerBody;
  private settings: Settings;
  private readonly keys = new Set<string>();
  private readonly listeners = new AbortController();
  private active = false;
  private discardFirstMouseMove = false;
  private requestedStance: Stance = 'standing';
  private yaw = 0;
  private pitch = 0;
  private elapsed = 0;
  private hits = 0;
  private shots = 0;
  private hitUntil = 0;
  private trigger = false;
  private recoil = 0;
  private hudTimer = 0;
  private hasStarted = false;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    settings: Settings,
    private readonly events: GameEvents,
    private readonly online = false,
    private readonly mapId: MapId = 'industrial',
    private readonly localMatch = false,
  ) {
    this.settings = { ...settings };
    this.engine = new Engine(
      canvas,
      false,
      { stencil: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' },
      false,
    );
    this.scene = new Scene(this.engine);
    this.scene.skipPointerMovePicking = true;
    this.camera = new UniversalCamera('player-camera', new Vector3(0, 1.62, -22), this.scene);
    this.camera.inputs.clear();
    this.camera.minZ = 0.04;
    this.camera.maxZ = 180;
    this.camera.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;
    this.menuCamera = new UniversalCamera('menu-camera', new Vector3(29, 18, -32), this.scene);
    this.menuCamera.inputs.clear();
    this.menuCamera.minZ = 0.1;
    this.menuCamera.maxZ = 200;
    this.menuCamera.fov = 0.95;
    this.menuCamera.setTarget(new Vector3(-1, 2, 5));
    this.world = createWorld(this.scene, online, this.mapId);
    this.body = new PlayerBody(this.world.solids, this.world.spawn);
    this.impacts = new ImpactPool(this.scene);
    this.weapon = createWeapon(this.scene, this.camera);
    this.cacheWeaponMeshes();
    this.weapon.setEnabled(false);
    this.scene.activeCamera = this.menuCamera;
    this.scene.setRenderingAutoClearDepthStencil(1, true, true, true);
    this.applySettings(settings);
    this.bindInputs();
    this.engine.runRenderLoop(() => this.frame());
  }

  private bindInputs(): void {
    const options = { signal: this.listeners.signal };
    window.addEventListener('resize', () => this.engine.resize(), options);
    document.addEventListener(
      'pointerlockchange',
      () => {
        this.active = document.pointerLockElement === this.canvas;
        this.keys.clear();
        this.trigger = false;
        this.buying = false;
        this.clock.reset();
        this.events.onScoreboard?.(false);
        this.audio.setMenu(!this.active);
        if (this.active) {
          // Some browsers warp the cursor when capturing it. Never turn the camera from that delta.
          this.discardFirstMouseMove = true;
          this.hasStarted = true;
          this.scene.activeCamera = this.camera;
          this.weapon.setEnabled(true);
          void this.audio.unlock();
        }
        this.events.onLockChange(this.active);
      },
      options,
    );
    document.addEventListener(
      'mousemove',
      (event) => {
        if (!this.active) return;
        if (this.discardFirstMouseMove) {
          this.discardFirstMouseMove = false;
          return;
        }
        const sensitivity = this.settings.sensitivity * 0.0018;
        this.yaw += event.movementX * sensitivity;
        this.pitch += event.movementY * sensitivity * (this.settings.invertY ? -1 : 1);
        this.pitch = Math.max(-1.48, Math.min(1.48, this.pitch));
      },
      options,
    );
    window.addEventListener(
      'keydown',
      (event) => {
        if (!this.active) return;
        if (event.code === 'Escape') {
          this.pause();
          return;
        }
        if (
          [
            'Space',
            'KeyW',
            'KeyA',
            'KeyS',
            'KeyD',
            'ShiftLeft',
            'ShiftRight',
            'ControlLeft',
            'ControlRight',
            'KeyZ',
            'KeyR',
            'Tab',
          ].includes(event.code)
        )
          event.preventDefault();
        if (event.code === 'Tab') {
          this.events.onScoreboard?.(true);
          return;
        }
        if (event.code === 'KeyB' && !event.repeat) {
          event.preventDefault();
          this.buying = !this.buying;
          this.keys.clear();
          this.trigger = false;
          this.emitSnapshot();
          return;
        }
        if (this.buying) {
          event.preventDefault();
          const items = Object.keys(SHOP) as BuyItem[];
          const index = Number(event.code.replace('Digit', '')) - 1;
          if (!event.repeat && items[index]) this.purchase(items[index]);
          return;
        }
        this.keys.add(event.code);
        if (event.repeat) return;
        if (event.code === 'ControlLeft' || event.code === 'ControlRight')
          this.requestedStance = this.requestedStance === 'crouching' ? 'standing' : 'crouching';
        if (event.code === 'KeyZ')
          this.requestedStance = this.requestedStance === 'prone' ? 'standing' : 'prone';
        if (event.code === 'KeyR') {
          this.reloadSequence++;
          this.reload();
        }
        if (event.code === 'Digit1') this.switchWeapon('primary');
        if (event.code === 'Digit2') this.switchWeapon('secondary');
        if (event.code === 'Digit3') this.switchTool('knife');
        if (event.code === 'Digit4') this.switchTool('grenade');
      },
      options,
    );
    window.addEventListener(
      'keyup',
      (event) => {
        this.keys.delete(event.code);
        if (event.code === 'Tab') this.events.onScoreboard?.(false);
      },
      options,
    );
    this.canvas.addEventListener(
      'mousedown',
      (event) => {
        if (!this.active) return;
        if (event.button === 0) {
          if (this.buying) return;
          this.trigger = true;
          this.fireSequence++;
          this.shoot();
        }
      },
      options,
    );
    window.addEventListener(
      'mouseup',
      () => {
        this.trigger = false;
      },
      options,
    );
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault(), options);
    window.addEventListener('blur', () => this.pause(), options);
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) this.pause();
      },
      options,
    );
  }

  async ready(): Promise<void> {
    await this.scene.whenReadyAsync();
  }

  async enter(): Promise<void> {
    // The event path also handles browsers whose requestPointerLock returns void.
    if (document.pointerLockElement === this.canvas) return;
    await new Promise<void>((resolve, reject) => {
      const controller = new AbortController();
      const cleanup = () => {
        clearTimeout(timeout);
        controller.abort();
      };
      const fail = () => {
        cleanup();
        reject(new Error('Pointer lock was not granted'));
      };
      const timeout = setTimeout(fail, 8000);
      document.addEventListener(
        'pointerlockchange',
        () => {
          if (document.pointerLockElement === this.canvas) {
            cleanup();
            resolve();
          }
        },
        { signal: controller.signal },
      );
      document.addEventListener('pointerlockerror', fail, { signal: controller.signal });
      try {
        // Invoke synchronously while the original click still grants activation.
        const request = this.canvas.requestPointerLock();
        if (request) void request.catch(fail);
      } catch {
        fail();
      }
    });
  }

  pause(): void {
    this.clock.reset();
    this.events.onScoreboard?.(false);
    this.keys.clear();
    this.trigger = false;
    this.buying = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  reset(): void {
    this.pause();
    this.body = new PlayerBody(this.world.solids, this.world.spawn);
    this.requestedStance = 'standing';
    this.yaw = 0;
    this.pitch = 0;
    this.elapsed = 0;
    this.previousPosition = undefined;
    this.cameraCorrection.setAll(0);
    this.gun = new WeaponController();
    this.equipment.reset(this.fireSequence);
    this.tool = 'firearm';
    this.toolReady = 0;
    this.targetHealth.clear();
    this.clearProjectiles();
    this.matchHealth = 100;
    this.combatAllowed = true;
    this.wallet = { money: 16000, armor: 0 };
    this.buyAllowed = true;
    this.buyMessage = '';
    this.buying = false;
    this.replaceWeapon();
    this.hits = 0;
    this.shots = 0;
    this.stepDistance = 0;
    this.impactCount = 0;
    this.impacts.clear();
    this.hitUntil = 0;
    this.recoil = 0;
    for (const target of this.world.targets) {
      target.downUntil = 0;
      target.parts.forEach((part) => part.setEnabled(true));
    }
    this.world.shadows.getShadowMap()?.resetRefreshCounter();
    this.syncCamera(1);
    this.emitSnapshot();
  }

  private trainingTargets() {
    return this.world.targets.map((target) => ({
      id: String(target.id),
      position: {
        x: target.root.position.x,
        y: target.root.position.y - 0.06,
        z: target.root.position.z,
      },
      height: 2.05,
      alive: target.downUntil === 0,
    }));
  }

  private damageTrainingTarget(id: string, damage: number): void {
    const target = this.world.targets.find((item) => String(item.id) === id);
    if (!target || target.downUntil) return;
    const health = (this.targetHealth.get(target.id) ?? 100) - damage;
    this.targetHealth.set(target.id, health);
    this.hitUntil = this.elapsed + 0.2;
    this.audio.play('hit');
    if (health > 0) return;
    target.downUntil = this.elapsed + 4;
    target.parts.forEach((part) => part.setEnabled(false));
    this.world.shadows.getShadowMap()?.resetRefreshCounter();
    this.hits++;
  }

  private useEquipment(): void {
    const origin = {
      x: this.body.position.x,
      y: this.body.position.y + this.body.eyeHeight,
      z: this.body.position.z,
    };
    const direction = shotDirection(this.yaw, this.pitch, 0, 0);
    if (this.tool === 'knife') {
      if (!this.equipment.swing(this.elapsed, this.fireSequence)) return;
      this.recoil = 1;
      this.audio.play('knife');
      if (!this.online) {
        const target = meleeTarget(origin, direction, this.world.solids, this.trainingTargets());
        if (target !== null) this.damageTrainingTarget(target, 45);
      }
    } else {
      const grenade = this.equipment.throw(
        this.elapsed,
        this.fireSequence,
        origin,
        direction,
        this.world.solids,
      );
      if (!grenade) return;
      this.recoil = 1;
      this.audio.play('throw');
      if (!this.online)
        this.trainingGrenades.push({
          projectile: grenade,
          mesh: this.createGrenadeMesh(grenade.position),
        });
    }
    this.emitSnapshot();
  }

  private effectMaterial(name: string, color: string): StandardMaterial {
    const cached = this.scene.getMaterialByName(name) as StandardMaterial | null;
    if (cached) return cached;
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.specularColor.set(0.08, 0.08, 0.08);
    return material;
  }

  private createGrenadeMesh(position: Vec3): Mesh {
    const mesh = MeshBuilder.CreateSphere(
      'thrown-grenade',
      { diameter: 0.18, segments: 8 },
      this.scene,
    );
    mesh.material = this.effectMaterial('thrown-grenade-olive', '#65704a');
    mesh.position.set(position.x, position.y, position.z);
    mesh.isPickable = false;
    return mesh;
  }

  private showExplosion(position: Vec3, radius = 6): void {
    const mesh = MeshBuilder.CreateSphere(
      'grenade-explosion',
      { diameter: 2, segments: 8 },
      this.scene,
    );
    const material = this.effectMaterial('explosion-fire', '#eeb759');
    material.emissiveColor = Color3.FromHexString('#bc6424');
    material.alpha = 0.65;
    mesh.material = material;
    mesh.position.set(position.x, position.y, position.z);
    mesh.scaling.setAll(0.15);
    mesh.isPickable = false;
    this.explosions.push({ mesh, age: 0, radius });
    this.audio.play('explosion');
  }

  private updateEffects(dt: number): void {
    if (this.active && !this.online) {
      for (let i = this.trainingGrenades.length - 1; i >= 0; i--) {
        const grenade = this.trainingGrenades[i];
        const explosion = stepGrenade(grenade.projectile, dt, this.world.solids);
        const position = grenade.projectile.position;
        grenade.mesh.position.set(position.x, position.y, position.z);
        grenade.mesh.rotation.x += dt * 8;
        if (!explosion) continue;
        for (const hit of blastHits(explosion, this.trainingTargets(), this.world.solids))
          this.damageTrainingTarget(hit.id, hit.damage);
        this.showExplosion(explosion.position, explosion.radius);
        grenade.mesh.dispose();
        this.trainingGrenades.splice(i, 1);
      }
    }
    for (const grenade of this.remoteGrenades.values())
      grenade.mesh.position.copyFrom(
        Vector3.Lerp(grenade.mesh.position, grenade.target, 1 - Math.exp(-25 * dt)),
      );
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const explosion = this.explosions[i];
      explosion.age += dt;
      const progress = explosion.age / 0.45;
      explosion.mesh.scaling.setAll(explosion.radius * (0.15 + Math.min(1, progress) * 0.85));
      explosion.mesh.visibility = Math.max(0, 1 - progress);
      if (progress >= 1) {
        explosion.mesh.dispose();
        this.explosions.splice(i, 1);
      }
    }
  }

  private clearProjectiles(): void {
    for (const grenade of this.trainingGrenades) grenade.mesh.dispose();
    this.trainingGrenades.length = 0;
    for (const grenade of this.remoteGrenades.values()) grenade.mesh.dispose();
    this.remoteGrenades.clear();
    for (const explosion of this.explosions) explosion.mesh.dispose();
    this.explosions.length = 0;
  }

  private syncObjectives(state: MatchState): void {
    const defuse = state.rounds.mode === 'defuse';
    if (defuse && !this.bombSite) {
      this.bombSite = MeshBuilder.CreateTorus(
        'bomb-site-a',
        { diameter: ROUND_RULES.siteRadius * 2, thickness: 0.09, tessellation: 48 },
        this.scene,
      );
      const site = getMap(this.mapId).bombSite;
      this.bombSite.position.set(site.x, site.y + 0.06, site.z);
      const material = this.effectMaterial('bomb-site-yellow', '#e0b951');
      material.emissiveColor = Color3.FromHexString('#826421');
      this.bombSite.material = material;
      this.bombSite.isPickable = false;
    }
    this.bombSite?.setEnabled(defuse);
    const bomb = state.rounds.bomb;
    if (bomb?.status === 'exploded' && this.bombStatus !== 'exploded')
      this.showExplosion(bomb.position, 9);
    this.bombStatus = bomb?.status ?? '';
    const visible = !!bomb && (bomb.status === 'planted' || bomb.status === 'dropped');
    if (visible && !this.bombMesh) {
      this.bombMesh = MeshBuilder.CreateBox(
        'bomb-device',
        { width: 0.4, height: 0.16, depth: 0.3 },
        this.scene,
      );
      this.bombMesh.material = this.effectMaterial('bomb-device-material', '#5d6950');
      this.bombMesh.isPickable = false;
      const light = MeshBuilder.CreateSphere(
        'bomb-status-light',
        { diameter: 0.08, segments: 6 },
        this.scene,
      );
      light.parent = this.bombMesh;
      light.position.set(0.12, 0.1, -0.06);
      const material = this.effectMaterial('bomb-status-red', '#f64b31');
      material.emissiveColor = Color3.FromHexString('#ff3a1c');
      light.material = material;
      light.isPickable = false;
    }
    this.bombMesh?.setEnabled(visible);
    if (visible && bomb && this.bombMesh)
      this.bombMesh.position.set(bomb.position.x, bomb.position.y + 0.11, bomb.position.z);
  }

  showMenu(): void {
    this.pause();
    this.scene.activeCamera = this.menuCamera;
    this.weapon.setEnabled(false);
    this.hasStarted = false;
  }

  applySettings(settings: Settings): void {
    this.settings = { ...settings };
    this.camera.fov = (settings.fov * Math.PI) / 180;
    this.audio.setMix(settings.volume, settings.effectsVolume, settings.musicVolume);
    this.scene.shadowsEnabled = settings.shadows !== 'off';
    this.world.shadows.filteringQuality =
      settings.shadows === 'high' ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
    this.world.shadows.usePercentageCloserFiltering = settings.shadows === 'high';
    this.world.shadows.getShadowMap()?.resetRefreshCounter();
    const density = Math.min(window.devicePixelRatio || 1, 1.5);
    const scale = (settings.renderScale || 1) * density * (settings.quality === 'low' ? 0.7 : 1);
    this.engine.setHardwareScalingLevel(1 / Math.max(0.35, Math.min(2, scale)));
    this.engine.resize();
  }

  private cacheWeaponMeshes(): void {
    this.weaponMeshes = this.weapon.getChildMeshes();
    this.muzzleFlash = this.weaponMeshes.find((mesh) => mesh.name === 'muzzle-flash');
  }

  private replaceWeapon(): void {
    this.weapon.dispose();
    this.weapon =
      this.tool === 'firearm'
        ? createWeapon(this.scene, this.camera, this.slot === 'secondary')
        : createEquipmentView(this.scene, this.camera, this.tool);
    this.cacheWeaponMeshes();
    this.weapon.setEnabled(this.hasStarted);
  }

  private switchWeapon(slot: WeaponSlot): void {
    if (!this.gun.inventory[slot].owned) {
      this.buyMessage = 'B · Compre a arma na área inicial.';
      return;
    }
    const changed = this.gun.switch(slot, this.elapsed);
    if (!changed && this.tool === 'firearm') return;
    this.tool = 'firearm';
    this.audio.play('deploy');
    this.equipment.observe(this.fireSequence);
    this.gun.resetTrigger(this.fireSequence);
    this.toolReady = this.elapsed + 0.25;
    this.trigger = false;
    this.replaceWeapon();
    this.emitSnapshot();
  }

  private switchTool(tool: 'knife' | 'grenade'): void {
    if (this.tool === tool) return;
    this.tool = tool;
    this.audio.play('deploy');
    this.trigger = false;
    this.recoil = 0;
    this.equipment.observe(this.fireSequence);
    this.gun.resetTrigger(this.fireSequence);
    this.toolReady = this.elapsed + 0.25;
    this.replaceWeapon();
    this.emitSnapshot();
  }

  private purchase(item: BuyItem): void {
    this.purchaseSequence++;
    this.purchaseItem = item;
    if (this.online) this.buyMessage = 'Aguardando confirmação da compra…';
    else this.buyMessage = buy(this.gun, this.wallet, item, this.buyAllowed, this.equipment);
    this.emitSnapshot();
  }

  private reload(): void {
    if (this.tool !== 'firearm' || !this.combatAllowed) return;
    if (this.gun.reload(this.elapsed)) this.audio.play('reload');
  }

  private shoot(): void {
    if (
      !this.active ||
      this.buying ||
      !this.combatAllowed ||
      this.elapsed < this.toolReady ||
      (this.online && this.matchHealth <= 0)
    )
      return;
    if (this.tool !== 'firearm') {
      this.useEquipment();
      return;
    }
    if (this.gun.ammo === 0) {
      this.reload();
      return;
    }
    const shot = this.gun.fire(
      this.elapsed,
      this.trigger,
      this.fireSequence,
      { yaw: this.yaw, pitch: this.pitch },
      { speed: this.body.speed, grounded: this.body.grounded, stance: this.body.stance },
    );
    if (!shot) return;
    this.shots++;
    this.flashUntil = this.elapsed + 0.045;
    this.recoil = 1;
    this.audio.play('shot', this.slot);
    const direction = new Vector3(shot.direction.x, shot.direction.y, shot.direction.z);
    const eye = new Vector3(
      this.body.position.x,
      this.body.position.y + this.body.eyeHeight,
      this.body.position.z,
    );
    const ray = new Ray(eye, direction, 100);
    const picked = this.scene.pickWithRay(
      ray,
      (mesh) => mesh.isEnabled() && mesh.isPickable && mesh.isVisible,
    );
    const id = getTargetId(picked?.pickedMesh ?? null);
    if (id !== undefined && !this.online) {
      const target = this.world.targets[id];
      if (target.downUntil === 0) {
        target.downUntil = this.elapsed + 4;
        target.parts.forEach((part) => part.setEnabled(false));
        this.world.shadows.getShadowMap()?.resetRefreshCounter();
        this.hits++;
        this.hitUntil = this.elapsed + 0.2;
        this.audio.play('hit');
      }
    } else if (picked?.hit && picked.pickedPoint && picked.pickedMesh?.isVisible) {
      const normal = picked.getNormal(true);
      if (normal) {
        this.impacts.add(picked.pickedPoint, normal, this.elapsed);
        this.impactCount++;
        this.audio.play('impact');
      }
    }
    this.emitSnapshot();
  }

  private currentInput(): MatchInput {
    const active = this.active && !this.buying && this.matchHealth > 0 && this.combatAllowed;
    return {
      tool: this.tool,
      interact: active && this.keys.has('KeyE'),
      forward: active ? Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS')) : 0,
      right: active ? Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')) : 0,
      sprint: active && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')),
      jump: active && this.keys.has('Space'),
      stance: this.requestedStance,
      yaw: this.yaw,
      pitch: this.pitch,
      fire: active && this.trigger,
      fireSequence: this.fireSequence,
      reloadSequence: this.reloadSequence,
      buySequence: this.purchaseSequence,
      buyItem: this.purchaseItem,
      reload: active && this.tool === 'firearm' && this.keys.has('KeyR'),
      weapon: this.slot,
    };
  }

  private simulate(dt: number): void {
    this.elapsed += dt;
    this.previousPosition = { ...this.body.position };
    const wasGrounded = this.body.grounded;
    const beforeX = this.body.position.x,
      beforeZ = this.body.position.z;
    if (!this.localMatch && (!this.online || (this.matchHealth > 0 && this.combatAllowed)))
      this.body.step(this.currentInput(), this.yaw, dt);
    this.gun.update(this.elapsed, dt);
    if (this.trigger) this.shoot();
    // Offline actors share a single authoritative simulation at60Hz, avoiding20Hz corrections.
    if (this.online && this.localMatch) {
      this.events.onInput?.(this.currentInput());
      this.events.onTick?.(dt);
    }
    this.stepDistance += Math.hypot(this.body.position.x - beforeX, this.body.position.z - beforeZ);
    if (this.body.grounded && this.body.sprinting && this.stepDistance > 1.25) {
      this.audio.play('step');
      this.stepDistance = 0;
    }
    if (!wasGrounded && this.body.grounded) this.audio.play('land');
    if (!this.online) {
      this.buyAllowed =
        this.elapsed <= 90 &&
        Math.hypot(
          this.body.position.x - this.world.spawn.x,
          this.body.position.z - this.world.spawn.z,
        ) <= 6;
      for (const target of this.world.targets) {
        if (!target.downUntil || this.elapsed < target.downUntil) continue;
        target.downUntil = 0;
        this.targetHealth.delete(target.id);
        target.parts.forEach((part) => part.setEnabled(true));
        this.world.shadows.getShadowMap()?.resetRefreshCounter();
      }
    }
    this.impacts.update(this.elapsed);
    this.updateEffects(dt);
    this.recoil = Math.max(0, this.recoil - dt * 7);
  }

  private frame(): void {
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.25);
    if (this.active) {
      this.renderAlpha = this.clock.advance(dt, (step) => this.simulate(step));
      this.cameraCorrection.scaleInPlace(Math.exp(-18 * dt));
      this.syncCamera(1 - Math.exp(-22 * dt));
      this.muzzleFlash?.setEnabled(this.elapsed < this.flashUntil);
      const bob =
        this.body.moving && this.body.grounded
          ? Math.sin(this.elapsed * (this.body.sprinting ? 15 : 10)) * 0.006
          : 0;
      const reloading = this.tool === 'firearm' && this.gun.reloading;
      const ws = this.gun.snapshot(this.elapsed);
      const reloadDuration = this.slot === 'primary' ? 2.45 : 2.2;
      const reloadProgress = reloading ? 1 - ws.reloadRemaining / reloadDuration : 0;
      const reloadDip = reloading ? Math.sin(Math.min(1, reloadProgress) * Math.PI) : 0;
      const deploying = this.elapsed < this.toolReady || ws.deployRemaining > 0;
      const deployDip = deploying
        ? Math.min(0.3, Math.max(this.toolReady - this.elapsed, ws.deployRemaining) * 0.32)
        : 0;
      this.weapon.position.y = -0.24 + bob - reloadDip * 0.16 - deployDip;
      this.weapon.position.z = 0.55 - this.recoil * (this.tool === 'knife' ? -0.16 : 0.035);
      this.weapon.rotation.x =
        -this.recoil * (this.tool === 'knife' ? 0.75 : 0.07) - reloadDip * 0.5 + deployDip;
      this.weapon.rotation.z =
        reloadDip * 0.18 + (this.body.moving ? Math.sin(this.elapsed * 7) * 0.008 : 0);
      if (this.tool === 'firearm')
        animateWeapon(this.weapon, this.elapsed, this.recoil, reloading, deploying);
      else animateEquipmentView(this.weapon, this.elapsed, this.recoil);
      if (this.tool === 'grenade')
        this.weapon.setEnabled(this.hasStarted && this.equipment.grenades > 0);
    } else {
      this.clock.reset();
      if (!this.localMatch) this.updateEffects(dt);
      if (!this.hasStarted) {
        const urban = this.mapId === 'old-quarter';
        this.menuCamera.position.x =
          (urban ? 35 : 29) + Math.sin(performance.now() * 0.00004) * 1.4;
        this.menuCamera.position.y = urban ? 23 : 18;
        this.menuCamera.position.z = urban ? -39 : -32;
        this.menuCamera.setTarget(new Vector3(-1, 2, 5));
      }
    }
    // Remote rooms keep sending neutral input while paused; offline rooms do not advance.
    if (this.online && !this.localMatch) {
      this.netTimer += dt;
      if (this.netTimer >= 0.05) {
        this.netTimer %= 0.05;
        this.events.onInput?.(this.currentInput());
      }
    }
    this.hudTimer += dt;
    if (this.hudTimer >= 0.05) {
      this.hudTimer %= 0.05;
      this.emitSnapshot();
    }
    this.scene.render();
  }

  applyMatch(state: MatchState): void {
    const own = state.actors.find((a) => a.id === state.self);
    if (!own) return;
    const serverRestart = this.receivedMatch && state.matchId !== this.matchId;
    if (serverRestart) {
      this.elapsed = 0;
      this.hitUntil = 0;
      this.flashUntil = 0;
      this.damageUntil = 0;
      this.canvas.classList.remove('taking-damage');
    }
    if (
      !this.localMatch &&
      this.receivedMatch &&
      !serverRestart &&
      this.matchHealth > 0 &&
      own.health > 0
    ) {
      const dx = this.body.position.x - own.position.x,
        dz = this.body.position.z - own.position.z;
      if (Math.hypot(dx, dz) < 2) {
        this.cameraCorrection.x += dx;
        this.cameraCorrection.z += dz;
        if (this.cameraCorrection.lengthSquared() > 0.04)
          this.cameraCorrection.normalize().scaleInPlace(0.2);
      } else this.cameraCorrection.setAll(0);
    }
    this.body.position = { ...own.position };
    this.body.velocityX = own.velocity.x;
    this.body.velocityY = own.velocity.y;
    this.body.velocityZ = own.velocity.z;
    this.body.grounded = own.grounded;
    this.body.stance = own.stance;
    this.body.moving = this.body.speed > 0.1;
    this.body.sprinting =
      this.body.moving &&
      own.stance === 'standing' &&
      !this.keys.has('ShiftLeft') &&
      !this.keys.has('ShiftRight');
    this.contacts = state.actors
      .filter((a) => a.id !== state.self && a.health > 0)
      .map((a) => ({ x: a.position.x, z: a.position.z }));
    this.wallet = { money: own.money, armor: own.armor };
    this.buyAllowed = own.buyAllowed;
    if (own.buySequence === this.purchaseSequence) this.buyMessage = own.buyMessage;
    const newRound = this.receivedMatch && state.rounds.round !== this.matchRound;
    const respawn =
      !this.receivedMatch || (this.matchHealth <= 0 && own.health > 0) || newRound || serverRestart;
    this.matchRound = state.rounds.round;
    this.matchId = state.matchId;
    this.combatAllowed = state.rounds.phase === 'active';
    if (!this.combatAllowed) this.trigger = false;
    if (own.health <= 0) {
      this.keys.clear();
      this.trigger = false;
      this.body.moving = false;
      this.body.sprinting = false;
    }
    if (respawn) {
      this.gun = new WeaponController(seedFor(own.id) + own.deaths);
      this.gun.slot = own.weapon;
      this.gun.resetTrigger(this.fireSequence);
      this.equipment.reset(this.fireSequence);
      this.tool = 'firearm';
      this.trigger = false;
      this.keys.clear();
      this.requestedStance = own.stance;
      this.previousPosition = { ...own.position };
      this.cameraCorrection.setAll(0);
      this.recoil = 0;
      this.toolReady = this.elapsed;
      this.clearProjectiles();
      this.replaceWeapon();
    }
    this.equipment.grenades = own.grenades;
    if (own.weapon === this.slot) this.gun.reconcile(own.weaponState, this.elapsed);
    if (own.hits > this.hits) {
      this.hitUntil = this.elapsed + 0.2;
      this.audio.play('hit');
    }
    this.hits = own.hits;
    this.shots = own.shots;
    if (respawn) {
      this.yaw = own.yaw;
      this.pitch = 0;
      this.syncCamera(1);
    }
    if (this.receivedMatch && own.health < this.matchHealth) {
      this.damageUntil = this.elapsed + 0.3;
      this.canvas.classList.add('taking-damage');
    }
    if (this.elapsed >= this.damageUntil) this.canvas.classList.remove('taking-damage');
    this.receivedMatch = true;
    this.matchHealth = own.health;
    this.syncObjectives(state);
    for (const grenade of state.grenades) {
      let visual = this.remoteGrenades.get(grenade.id);
      if (!visual) {
        visual = {
          mesh: this.createGrenadeMesh(grenade.position),
          target: new Vector3(),
          remaining: grenade.remaining,
        };
        this.remoteGrenades.set(grenade.id, visual);
      }
      visual.target.set(grenade.position.x, grenade.position.y, grenade.position.z);
      visual.remaining = grenade.remaining;
    }
    const grenadeIds = new Set(state.grenades.map((grenade) => grenade.id));
    for (const [id, visual] of this.remoteGrenades) {
      if (grenadeIds.has(id)) continue;
      if (visual.remaining <= 0.2 && !newRound) this.showExplosion(visual.target);
      visual.mesh.dispose();
      this.remoteGrenades.delete(id);
    }
    for (const actor of state.actors) {
      if (actor.id === state.self) continue;
      let model = this.remotes.get(actor.id);
      if (!model) {
        model = createActor(this.scene, actor.bot);
        this.remotes.set(actor.id, model);
      }
      model.update(state.config.mode === 'deathmatch' ? { ...actor, team: 'bravo' } : actor);
      const previous = this.remoteAudio.get(actor.id);
      if (previous && actor.health > 0) {
        const distance = Math.hypot(
          actor.position.x - own.position.x,
          actor.position.z - own.position.z,
        );
        const gain = Math.max(0, 1 - distance / 42) * 0.7;
        const dx = actor.position.x - own.position.x,
          dz = actor.position.z - own.position.z;
        const pan = Math.max(
          -1,
          Math.min(1, (dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw)) / Math.max(distance, 1)),
        );
        if (
          actor.shots > previous.shots &&
          canHearPosition(this.world.solids, own.position, actor.position)
        )
          this.audio.play('shot', actor.weapon, gain, pan);
        previous.footsteps += Math.hypot(
          actor.position.x - previous.position.x,
          actor.position.z - previous.position.z,
        );
        if (
          actor.grounded &&
          actor.stance === 'standing' &&
          Math.hypot(actor.velocity.x, actor.velocity.z) > 3.5 &&
          previous.footsteps > 1.4
        ) {
          this.audio.play('step', actor.weapon, gain * 0.5, pan);
          previous.footsteps = 0;
        }
      }
      this.remoteAudio.set(actor.id, {
        shots: actor.shots,
        footsteps: previous?.footsteps || 0,
        position: { ...actor.position },
      });
    }
    for (const [id, mesh] of this.remotes)
      if (!state.actors.some((a) => a.id === id)) {
        mesh.dispose();
        this.remotes.delete(id);
        this.remoteAudio.delete(id);
      }
  }

  private syncCamera(smoothing: number): void {
    const from = this.previousPosition ?? this.body.position;
    const alpha = this.active && (!this.online || this.localMatch) ? this.renderAlpha : 1;
    this.camera.position.x =
      from.x + (this.body.position.x - from.x) * alpha + this.cameraCorrection.x;
    this.camera.position.z =
      from.z + (this.body.position.z - from.z) * alpha + this.cameraCorrection.z;
    const targetHeight = from.y + (this.body.position.y - from.y) * alpha + this.body.eyeHeight;
    this.camera.position.y += (targetHeight - this.camera.position.y) * smoothing;
    this.camera.rotation.set(
      this.pitch + (this.tool === 'firearm' ? this.gun.recoil.pitch : 0),
      this.yaw + (this.tool === 'firearm' ? this.gun.recoil.yaw : 0),
      0,
    );
  }

  private emitSnapshot(): void {
    this.events.onSnapshot({
      renderScale: 1 / this.engine.getHardwareScalingLevel(),
      shadows: this.scene.shadowsEnabled,
      map: this.mapId,
      tool: this.tool,
      grenades: this.equipment.grenades,
      weapon: this.slot,
      weaponVisible: this.weaponMeshes.some(
        (mesh) => mesh.isEnabled() && this.scene.getActiveMeshes().indexOf(mesh) >= 0,
      ),
      fov: this.settings.fov,
      reserve: this.gun.reserve,
      health: this.matchHealth,
      armor: this.wallet.armor,
      money: this.wallet.money,
      buying: this.buying,
      buyAllowed: this.buyAllowed,
      buyMessage: this.buyMessage,
      deploying:
        this.elapsed < this.toolReady ||
        (this.tool === 'firearm' && this.gun.isDeploying(this.elapsed)),
      speed: this.body.speed,
      spread: spreadFor(
        { speed: this.body.speed, grounded: this.body.grounded, stance: this.body.stance },
        this.gun.burst,
      ),
      impacts: this.impactCount,
      radarSolids: this.world.solids,
      contacts: this.contacts,
      ammo: this.gun.ammo,
      hits: this.hits,
      shots: this.shots,
      elapsed: this.elapsed,
      reloading: this.tool === 'firearm' && this.gun.reloading,
      stance: this.body.stance,
      grounded: this.body.grounded,
      sprinting: this.body.sprinting,
      position: { ...this.body.position },
      yaw: this.yaw,
      fps: Math.round(this.engine.getFps()),
      hit: this.hitUntil > this.elapsed,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pause();
    this.listeners.abort();
    this.audio.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
