import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { MatchInput, MatchState } from '../network/protocol';
import { WEAPONS, spread, type WeaponSlot } from './ballistics';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Ray } from '@babylonjs/core/Culling/ray';
import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { GameAudio } from './audio';
import { PlayerBody, type Stance, type Vec3 } from './physics';
import { createWorld, getTargetId, type World } from './world';
import { createWeapon } from './weapon';
import type { Settings } from '../core/settings';

export interface GameSnapshot {
  weapon: WeaponSlot;
  weaponVisible: boolean;
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
}

export class Game {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: UniversalCamera;
  private readonly menuCamera: UniversalCamera;
  private readonly world: World;
  private weapon: TransformNode;
  private slot: WeaponSlot = 'primary';
  private magazines = { primary: 30, secondary: 12 };
  private heat = 0;
  private flashUntil = 0;
  private fireUntil = 0;
  private netTimer = 0;
  private matchHealth = 100;
  private receivedMatch = false;
  private remotes = new Map<string, Mesh>();
  private actorMaterials = new Map<boolean, StandardMaterial>();
  private readonly audio = new GameAudio();
  private body: PlayerBody;
  private settings: Settings;
  private readonly keys = new Set<string>();
  private readonly listeners = new AbortController();
  private active = false;
  private requestedStance: Stance = 'standing';
  private yaw = 0;
  private pitch = 0;
  private elapsed = 0;
  private ammo = 30;
  private hits = 0;
  private shots = 0;
  private reloadUntil = 0;
  private nextShotAt = 0;
  private hitUntil = 0;
  private trigger = false;
  private recoil = 0;
  private hudTimer = 0;
  private hasStarted = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    settings: Settings,
    private readonly events: GameEvents,
    private readonly online = false,
  ) {
    this.settings = { ...settings };
    this.engine = new Engine(
      canvas,
      false,
      { stencil: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' },
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
    this.world = createWorld(this.scene, online);
    this.body = new PlayerBody(this.world.solids, this.world.spawn);
    this.weapon = createWeapon(this.scene, this.camera);
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
        if (this.active) {
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
        this.keys.add(event.code);
        if (event.repeat) return;
        if (event.code === 'ControlLeft' || event.code === 'ControlRight')
          this.requestedStance = this.requestedStance === 'crouching' ? 'standing' : 'crouching';
        if (event.code === 'KeyZ')
          this.requestedStance = this.requestedStance === 'prone' ? 'standing' : 'prone';
        if (event.code === 'KeyR') this.reload();
        if (event.code === 'Digit1') this.switchWeapon('primary');
        if (event.code === 'Digit2') this.switchWeapon('secondary');
      },
      options,
    );
    window.addEventListener('keyup', (event) => this.keys.delete(event.code), options);
    this.canvas.addEventListener(
      'mousedown',
      (event) => {
        if (!this.active) return;
        if (event.button === 0) {
          this.trigger = true;
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
    this.keys.clear();
    this.trigger = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  reset(): void {
    this.pause();
    this.body = new PlayerBody(this.world.solids, this.world.spawn);
    this.requestedStance = 'standing';
    this.yaw = 0;
    this.pitch = 0;
    this.elapsed = 0;
    this.switchWeapon('primary');
    this.magazines = { primary: 30, secondary: 12 };
    this.ammo = 30;
    this.heat = 0;
    this.hits = 0;
    this.shots = 0;
    this.reloadUntil = 0;
    this.nextShotAt = 0;
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

  showMenu(): void {
    this.pause();
    this.scene.activeCamera = this.menuCamera;
    this.weapon.setEnabled(false);
    this.hasStarted = false;
  }

  applySettings(settings: Settings): void {
    this.settings = { ...settings };
    this.camera.fov = (settings.fov * Math.PI) / 180;
    this.audio.volume = settings.volume;
    this.scene.shadowsEnabled = settings.quality === 'high';
    this.engine.setHardwareScalingLevel(
      settings.quality === 'low' ? 1.5 : 1 / Math.min(window.devicePixelRatio || 1, 1.5),
    );
    this.engine.resize();
  }

  private switchWeapon(slot: WeaponSlot): void {
    this.magazines[this.slot] = this.ammo;
    this.slot = slot;
    this.ammo = this.magazines[slot];
    this.reloadUntil = 0;
    this.trigger = false;
    this.nextShotAt = this.elapsed + 0.25;
    this.weapon.dispose();
    this.weapon = createWeapon(this.scene, this.camera, slot === 'secondary');
    this.emitSnapshot();
  }

  private reload(): void {
    if (this.reloadUntil || this.ammo === WEAPONS[this.slot].capacity) return;
    this.reloadUntil = this.elapsed + WEAPONS[this.slot].reload;
    this.audio.play('reload');
  }

  private shoot(): void {
    if (this.online && this.matchHealth <= 0) return;
    if (!this.active || this.reloadUntil || this.elapsed < this.nextShotAt) return;
    if (!this.ammo) {
      this.reload();
      return;
    }
    this.ammo--;
    this.shots++;
    const spec = WEAPONS[this.slot];
    this.nextShotAt = this.elapsed + spec.interval;
    if (!spec.automatic) this.trigger = false;
    this.flashUntil = this.elapsed + 0.045;
    this.fireUntil = this.elapsed + 0.075;
    this.recoil = 1;
    this.audio.play('shot');
    const aimSpread =
      !this.body.moving && this.body.grounded && this.heat === 0
        ? 0
        : spread(this.body.moving, this.body.grounded, this.body.stance, this.heat);
    const direction = this.camera.getForwardRay().direction.clone();
    direction.x += (Math.random() - 0.5) * aimSpread;
    direction.y += (Math.random() - 0.5) * aimSpread;
    direction.normalize();
    this.heat = Math.min(6, this.heat + 1);
    this.pitch = Math.max(-1.48, this.pitch - spec.kick);
    this.yaw += (Math.random() - 0.5) * spec.kick * 0.35;
    const ray = new Ray(this.camera.globalPosition.clone(), direction, 100);
    const picked = this.scene.pickWithRay(
      ray,
      (mesh) => mesh.isEnabled() && mesh.isPickable && mesh.isVisible,
    );
    const id = getTargetId(picked?.pickedMesh ?? null);
    if (id !== undefined) {
      const target = this.world.targets[id];
      if (target.downUntil === 0) {
        target.downUntil = this.elapsed + 4;
        target.parts.forEach((part) => part.setEnabled(false));
        this.world.shadows.getShadowMap()?.resetRefreshCounter();
        this.hits++;
        this.hitUntil = this.elapsed + 0.2;
        this.audio.play('hit');
      }
    }
    this.emitSnapshot();
  }

  private frame(): void {
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05);
    if (this.active) {
      this.elapsed += dt;
      if (!this.online || this.matchHealth > 0)
        this.body.step(
          {
            forward: Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS')),
            right: Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')),
            sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
            jump: this.keys.has('Space'),
            stance: this.requestedStance,
          },
          this.yaw,
          dt,
        );
      this.syncCamera(1 - Math.exp(-18 * dt));
      if (this.reloadUntil && this.elapsed >= this.reloadUntil) {
        this.ammo = WEAPONS[this.slot].capacity;
        this.reloadUntil = 0;
      }
      if (this.trigger) this.shoot();
      for (const target of this.world.targets) {
        if (target.downUntil && this.elapsed >= target.downUntil) {
          target.downUntil = 0;
          target.parts.forEach((part) => part.setEnabled(true));
          this.world.shadows.getShadowMap()?.resetRefreshCounter();
        }
      }
      this.heat = Math.max(0, this.heat - dt * 4);
      this.weapon
        .getChildMeshes()
        .find((mesh) => mesh.name === 'muzzle-flash')
        ?.setEnabled(this.elapsed < this.flashUntil);
      this.recoil = Math.max(0, this.recoil - dt * 7);
      const bob =
        this.body.moving && this.body.grounded
          ? Math.sin(this.elapsed * (this.body.sprinting ? 15 : 10)) * 0.007
          : 0;
      this.weapon.position.y = -0.24 + bob - (this.reloadUntil ? 0.18 : 0);
      this.weapon.position.z = 0.55 - this.recoil * 0.035;
      this.weapon.rotation.x = -this.recoil * 0.07 + (this.reloadUntil ? -0.5 : 0);
    } else if (!this.hasStarted) {
      this.menuCamera.position.x = 29 + Math.sin(performance.now() * 0.00004) * 1.4;
      this.menuCamera.setTarget(new Vector3(-1, 2, 5));
    }
    if (this.online) {
      this.netTimer += dt;
      if (this.netTimer >= 0.05) {
        this.netTimer = 0;
        const active = this.active && this.matchHealth > 0;
        this.events.onInput?.({
          forward: active ? Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS')) : 0,
          right: active ? Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')) : 0,
          sprint: active && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')),
          jump: active && this.keys.has('Space'),
          stance: this.requestedStance,
          yaw: this.yaw,
          pitch: this.pitch,
          fire: active && (this.trigger || this.elapsed < this.fireUntil),
          reload: active && this.keys.has('KeyR'),
          weapon: this.slot,
        });
      }
    }
    this.hudTimer += dt;
    if (this.hudTimer >= 0.05) {
      this.hudTimer = 0;
      this.emitSnapshot();
    }
    this.scene.render();
  }

  applyMatch(state: MatchState): void {
    const own = state.actors.find((a) => a.id === state.self);
    if (!own) return;
    this.body.position = { ...own.position };
    if (!this.receivedMatch || (this.matchHealth <= 0 && own.health > 0)) {
      this.yaw = own.yaw;
      this.pitch = 0;
      this.syncCamera(1);
    }
    this.receivedMatch = true;
    this.matchHealth = own.health;
    if (own.weapon === this.slot) this.ammo = own.ammo;
    for (const actor of state.actors) {
      if (actor.id === state.self) continue;
      let mesh = this.remotes.get(actor.id);
      if (!mesh) {
        mesh = MeshBuilder.CreateBox(
          `actor-${actor.id}`,
          { width: 0.65, height: 1, depth: 0.65 },
          this.scene,
        );
        let material = this.actorMaterials.get(actor.bot);
        if (!material) {
          material = new StandardMaterial(`actor-${actor.bot}`, this.scene);
          material.diffuseColor = Color3.FromHexString(actor.bot ? '#c8743a' : '#528cb0');
          this.actorMaterials.set(actor.bot, material);
        }
        mesh.material = material;
        mesh.isPickable = false;
        this.remotes.set(actor.id, mesh);
        const head = MeshBuilder.CreateSphere(
          `actor-head-${actor.id}`,
          { diameter: 0.34, segments: 8 },
          this.scene,
        );
        head.parent = mesh;
        head.position.y = 0.42;
        head.material = material;
        head.isPickable = false;
      }
      const height = { standing: 1.8, crouching: 1.12, prone: 0.55 }[actor.stance];
      mesh.scaling.y = height;
      mesh.position.set(actor.position.x, actor.position.y + height / 2, actor.position.z);
      mesh.rotation.y = actor.yaw;
      mesh.setEnabled(actor.health > 0);
    }
    for (const [id, mesh] of this.remotes)
      if (!state.actors.some((a) => a.id === id)) {
        mesh.dispose();
        this.remotes.delete(id);
      }
  }

  private syncCamera(smoothing: number): void {
    this.camera.position.x = this.body.position.x;
    this.camera.position.z = this.body.position.z;
    const targetHeight = this.body.position.y + this.body.eyeHeight;
    this.camera.position.y += (targetHeight - this.camera.position.y) * smoothing;
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private emitSnapshot(): void {
    this.events.onSnapshot({
      weapon: this.slot,
      weaponVisible: this.weapon
        .getChildMeshes()
        .some((mesh) => mesh.isEnabled() && this.scene.getActiveMeshes().indexOf(mesh) >= 0),
      ammo: this.ammo,
      hits: this.hits,
      shots: this.shots,
      elapsed: this.elapsed,
      reloading: this.reloadUntil > 0,
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
    this.pause();
    this.listeners.abort();
    this.audio.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
