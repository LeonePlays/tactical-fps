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
  jump: boolean;
  stance: Stance;
}
export const HEIGHT: Record<Stance, number> = { standing: 1.8, crouching: 1.12, prone: 0.55 };
export const SPEED = { walk: 4.2, sprint: 7, crouching: 2.2, prone: 1.15 };
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
  moving = false;
  sprinting = false;
  private jumpHeld = false;

  constructor(
    private readonly solids: readonly Solid[],
    spawn: Vec3,
  ) {
    this.position = { ...spawn };
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
    const wantsJump = input.jump && !this.jumpHeld;
    this.jumpHeld = input.jump;
    if (wantsJump && this.grounded && this.stance !== 'prone') {
      this.velocityY = this.stance === 'crouching' ? 4.5 : 6.8;
      this.grounded = false;
    }
    const norm = Math.max(1, Math.hypot(input.forward, input.right));
    this.moving = norm > 0 && (input.forward !== 0 || input.right !== 0);
    this.sprinting = input.sprint && this.stance === 'standing' && input.forward > 0 && this.moving;
    const speed =
      this.stance === 'prone'
        ? SPEED.prone
        : this.stance === 'crouching'
          ? SPEED.crouching
          : this.sprinting
            ? SPEED.sprint
            : SPEED.walk;
    const dx = ((Math.sin(yaw) * input.forward + Math.cos(yaw) * input.right) / norm) * speed;
    const dz = ((Math.cos(yaw) * input.forward - Math.sin(yaw) * input.right) / norm) * speed;
    // Substeps prevent tunnelling through thin geometry even after a slow frame.
    const dt = Math.max(0, Math.min(elapsed, 0.1));
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < steps; i++) {
      const sub = dt / steps;
      this.moveAxis('x', dx * sub);
      this.moveAxis('z', dz * sub);
      this.velocityY -= 22 * sub;
      this.grounded = false;
      this.moveVertical(this.velocityY * sub);
    }
  }

  private moveAxis(axis: 'x' | 'z', amount: number): void {
    this.position[axis] += amount;
    for (const solid of this.solids) {
      if (!this.overlaps(this.position, solid)) continue;
      if (amount > 0) this.position[axis] = solid.min[axis] - RADIUS;
      if (amount < 0) this.position[axis] = solid.max[axis] + RADIUS;
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
