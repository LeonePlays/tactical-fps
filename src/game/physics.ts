/** Deterministic kinematic body. Coordinates describe feet, in metres. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Solid {
  min: Vec3;
  max: Vec3;
}
export type Stance = 'standing' | 'crouching' | 'prone';
export interface MovementInput {
  forward: number;
  right: number;
  sprint: boolean;
  walk?: boolean;
  aiming?: boolean;
  jump: boolean;
  stance: Stance;
}
export const HEIGHT: Record<Stance, number> = { standing: 1.8, crouching: 1.12, prone: 0.55 };
// Metres/second, scaled from a 250 units/s classic run at 0.0254 m/unit.
export const SPEED = { run: 6.35, sprint: 8.255, walk: 3.302, crouching: 2.117, prone: 1.15 };
export const MOVEMENT = {
  groundAcceleration: 5,
  airAcceleration: 10,
  friction: 4,
  stopSpeed: 1.905,
  airWishCap: 0.762,
  gravity: 20.32,
  jumpSpeed: 6.8,
  maxAirSpeed: 50.8,
} as const;
const RADIUS = 0.3;
const EPSILON = 0.00001;

export function box(x: number, y: number, z: number, w: number, h: number, d: number): Solid {
  return {
    min: { x: x - w / 2, y: y - h / 2, z: z - d / 2 },
    max: { x: x + w / 2, y: y + h / 2, z: z + d / 2 },
  };
}

export class PlayerBody {
  position: Vec3;
  stance: Stance = 'standing';
  grounded = false;
  velocityY = 0;
  velocityX = 0;
  velocityZ = 0;
  moving = false;
  sprinting = false;
  private jumpHeld = false;

  constructor(
    private readonly solids: readonly Solid[],
    spawn: Vec3,
  ) {
    this.position = { ...spawn };
  }

  get speed() {
    return Math.hypot(this.velocityX, this.velocityZ);
  }

  get height() {
    return HEIGHT[this.stance];
  }
  get eyeHeight() {
    return this.height - (this.stance === 'prone' ? 0.16 : 0.18);
  }

  private overlaps(p: Vec3, solid: Solid, height = this.height): boolean {
    return (
      p.x + RADIUS > solid.min.x + EPSILON &&
      p.x - RADIUS < solid.max.x - EPSILON &&
      p.z + RADIUS > solid.min.z + EPSILON &&
      p.z - RADIUS < solid.max.z - EPSILON &&
      p.y + height > solid.min.y + EPSILON &&
      p.y < solid.max.y - EPSILON
    );
  }

  canUseStance(stance: Stance): boolean {
    return !this.solids.some((solid) => this.overlaps(this.position, solid, HEIGHT[stance]));
  }

  step(input: MovementInput, yaw: number, elapsed: number): void {
    if (this.canUseStance(input.stance)) this.stance = input.stance;
    const dt = Number.isFinite(elapsed) ? Math.max(0, Math.min(elapsed, 0.1)) : 0;
    if (!dt) return;
    const wantsJump = input.jump && !this.jumpHeld;
    this.jumpHeld = input.jump;
    if (wantsJump && this.grounded && this.stance !== 'prone') {
      this.velocityY = this.stance === 'crouching' ? 4.5 : MOVEMENT.jumpSpeed;
      this.grounded = false;
    }
    const maxSpeed =
      this.stance === 'prone'
        ? SPEED.prone
        : this.stance === 'crouching'
          ? SPEED.crouching
          : input.walk || input.aiming
            ? SPEED.walk
            : input.sprint
              ? SPEED.sprint
              : SPEED.run;
    const magnitude = Math.hypot(input.forward, input.right);
    const norm = Math.max(1, magnitude);
    const wishX = (Math.sin(yaw) * input.forward + Math.cos(yaw) * input.right) / (magnitude || 1);
    const wishZ = (Math.cos(yaw) * input.forward - Math.sin(yaw) * input.right) / (magnitude || 1);
    const wishSpeed = (maxSpeed * magnitude) / norm;
    const steps = Math.max(1, Math.ceil(dt * 120));
    for (let i = 0; i < steps; i++) {
      const sub = dt / steps;
      if (this.grounded) {
        const speed = this.speed;
        const nextSpeed = Math.max(
          0,
          speed - Math.max(speed, Math.min(MOVEMENT.stopSpeed, maxSpeed)) * MOVEMENT.friction * sub,
        );
        const scale = speed > 0 ? nextSpeed / speed : 0;
        this.velocityX *= scale;
        this.velocityZ *= scale;
      }
      const current = this.velocityX * wishX + this.velocityZ * wishZ;
      const cappedWish = this.grounded ? wishSpeed : Math.min(wishSpeed, MOVEMENT.airWishCap);
      const add = Math.max(0, cappedWish - current);
      const acceleration = this.grounded ? MOVEMENT.groundAcceleration : MOVEMENT.airAcceleration;
      const amount = Math.min(add, acceleration * wishSpeed * sub);
      this.velocityX += wishX * amount;
      this.velocityZ += wishZ * amount;
      if (this.speed > MOVEMENT.maxAirSpeed) {
        const scale = MOVEMENT.maxAirSpeed / this.speed;
        this.velocityX *= scale;
        this.velocityZ *= scale;
      }
      this.moveAxis('x', this.velocityX * sub);
      this.moveAxis('z', this.velocityZ * sub);
      this.velocityY -= MOVEMENT.gravity * sub;
      this.grounded = false;
      this.moveVertical(this.velocityY * sub);
    }
    this.moving = this.speed > 0.1;
    this.sprinting =
      this.stance === 'standing' && !!input.sprint && !input.walk && !input.aiming && this.moving;
  }

  private moveAxis(axis: 'x' | 'z', amount: number): void {
    this.position[axis] += amount;
    for (const solid of this.solids) {
      if (!this.overlaps(this.position, solid)) continue;
      const rise = solid.max.y - this.position.y;
      if (amount && this.grounded && this.stance !== 'prone' && rise > EPSILON && rise <= 0.3) {
        const raised = { ...this.position, y: solid.max.y };
        if (!this.solids.some((obstacle) => this.overlaps(raised, obstacle))) {
          this.position.y = raised.y;
          continue;
        }
      }
      if (amount > 0) this.position[axis] = solid.min[axis] - RADIUS;
      if (amount < 0) this.position[axis] = solid.max[axis] + RADIUS;
      if (amount !== 0) {
        if (axis === 'x') this.velocityX = 0;
        else this.velocityZ = 0;
      }
    }
  }

  private moveVertical(amount: number): void {
    this.position.y += amount;
    for (const solid of this.solids) {
      if (!this.overlaps(this.position, solid)) continue;
      if (amount < 0) {
        this.position.y = solid.max.y;
        this.grounded = true;
      } else if (amount > 0) {
        this.position.y = solid.min.y - this.height;
      }
      this.velocityY = 0;
    }
  }
}
