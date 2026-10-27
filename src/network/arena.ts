import { box, type Vec3, type Solid } from '../game/physics';
export const ARENA_BLOCKS = [
  { name: 'floor', x: 0, y: -0.5, z: 0, w: 32, h: 1, d: 32 },
  { name: 'north', x: 0, y: 2, z: 16, w: 33, h: 4, d: 1 },
  { name: 'south', x: 0, y: 2, z: -16, w: 33, h: 4, d: 1 },
  { name: 'east', x: 16, y: 2, z: 0, w: 1, h: 4, d: 32 },
  { name: 'west', x: -16, y: 2, z: 0, w: 1, h: 4, d: 32 },
  { name: 'cover-a', x: -5, y: 1, z: 0, w: 3, h: 2, d: 6 },
  { name: 'cover-b', x: 5, y: 1, z: 0, w: 3, h: 2, d: 6 },
  { name: 'crate-a', x: 0, y: 0.6, z: 6, w: 3, h: 1.2, d: 2 },
  { name: 'crate-b', x: 0, y: 0.6, z: -6, w: 3, h: 1.2, d: 2 },
];
export const ARENA_SOLIDS = ARENA_BLOCKS.map((b) => box(b.x, b.y, b.z, b.w, b.h, b.d));
export const SPAWNS: Vec3[] = [
  { x: -12, y: 0.05, z: -12 },
  { x: 12, y: 0.05, z: 12 },
  { x: 12, y: 0.05, z: -12 },
  { x: -12, y: 0.05, z: 12 },
  { x: 0, y: 0.05, z: -12 },
  { x: 0, y: 0.05, z: 12 },
  { x: -12, y: 0.05, z: 0 },
  { x: 12, y: 0.05, z: 0 },
];
export function rayBox(origin: Vec3, dir: Vec3, solid: Solid): number {
  let near = 0,
    far = 100;
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs(dir[axis]) < 1e-8) {
      if (origin[axis] < solid.min[axis] || origin[axis] > solid.max[axis]) return Infinity;
      continue;
    }
    const a = (solid.min[axis] - origin[axis]) / dir[axis],
      b = (solid.max[axis] - origin[axis]) / dir[axis];
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return Infinity;
  }
  return near;
}
