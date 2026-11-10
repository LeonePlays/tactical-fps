import { ARENA_SOLIDS, rayBox } from '../network/arena';
import { seedFor } from './ballistics';
import { type PlayerBody, type Solid, type Vec3 } from './physics';

type Point = { x: number; z: number };
const CLEARANCE = 0.44;
const LIMIT = 15.03;

/** Shared, static visibility graph around inflated cover corners. No renderer dependency. */
export class ArenaNavigation {
  private readonly obstacles: readonly Solid[];
  private readonly nodes: Point[] = [];
  private readonly edges: { to: number; cost: number }[][] = [];
  constructor(solids: readonly Solid[] = ARENA_SOLIDS) {
    this.obstacles = solids.filter((solid) => solid.max.y > 0.1);
    for (const solid of this.obstacles) {
      const margin = CLEARANCE + 0.16;
      for (const x of [solid.min.x - margin, solid.max.x + margin]) {
        for (const z of [solid.min.z - margin, solid.max.z + margin]) {
          const p = { x, z };
          if (this.walkable(p)) this.nodes.push(p);
        }
      }
    }
    this.nodes.forEach(() => this.edges.push([]));
    for (let i = 0; i < this.nodes.length; i++)
      for (let j = i + 1; j < this.nodes.length; j++) {
        if (!this.clear(this.nodes[i], this.nodes[j])) continue;
        const cost = Math.hypot(
          this.nodes[i].x - this.nodes[j].x,
          this.nodes[i].z - this.nodes[j].z,
        );
        this.edges[i].push({ to: j, cost });
        this.edges[j].push({ to: i, cost });
      }
  }
  walkable(p: Point): boolean {
    return (
      Math.abs(p.x) <= LIMIT &&
      Math.abs(p.z) <= LIMIT &&
      !this.obstacles.some(
        (s) =>
          p.x >= s.min.x - CLEARANCE &&
          p.x <= s.max.x + CLEARANCE &&
          p.z >= s.min.z - CLEARANCE &&
          p.z <= s.max.z + CLEARANCE,
      )
    );
  }
  clear(from: Point, to: Point): boolean {
    for (const solid of this.obstacles) {
      let near = 0,
        far = 1;
      for (const axis of ['x', 'z'] as const) {
        const delta = to[axis] - from[axis];
        if (Math.abs(delta) < 1e-8) {
          if (
            from[axis] < solid.min[axis] - CLEARANCE ||
            from[axis] > solid.max[axis] + CLEARANCE
          ) {
            far = -1;
            break;
          }
        } else {
          const a = (solid.min[axis] - CLEARANCE - from[axis]) / delta;
          const b = (solid.max[axis] + CLEARANCE - from[axis]) / delta;
          near = Math.max(near, Math.min(a, b));
          far = Math.min(far, Math.max(a, b));
        }
      }
      if (near <= far && far >= 0 && near <= 1) return false;
    }
    return true;
  }
  private safe(point: Point): Point {
    const p = {
      x: Math.max(-LIMIT, Math.min(LIMIT, point.x)),
      z: Math.max(-LIMIT, Math.min(LIMIT, point.z)),
    };
    if (this.walkable(p)) return p;
    // Correct a body touching cover (physical radius .30) to graph clearance (.44).
    for (let attempt = 0; attempt < 4; attempt++) {
      for (const s of this.obstacles) {
        if (
          p.x < s.min.x - CLEARANCE ||
          p.x > s.max.x + CLEARANCE ||
          p.z < s.min.z - CLEARANCE ||
          p.z > s.max.z + CLEARANCE
        )
          continue;
        const candidates = [
          { x: s.min.x - CLEARANCE - 0.02, z: p.z },
          { x: s.max.x + CLEARANCE + 0.02, z: p.z },
          { x: p.x, z: s.min.z - CLEARANCE - 0.02 },
          { x: p.x, z: s.max.z + CLEARANCE + 0.02 },
        ].filter((q) => this.walkable(q));
        candidates.sort(
          (a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
        );
        if (candidates[0]) Object.assign(p, candidates[0]);
      }
      if (this.walkable(p)) return p;
    }
    return this.nodes.reduce(
      (best, n) =>
        Math.hypot(n.x - p.x, n.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z) ? n : best,
      { x: 0, z: 0 },
    );
  }
  path(from: Point, to: Point): Point[] {
    const start = this.safe(from),
      goal = this.safe(to);
    const approach = Math.hypot(start.x - from.x, start.z - from.z) > 0.08 ? [start] : [];
    if (this.clear(start, goal)) return [...approach, goal];
    const points = [...this.nodes, start, goal],
      n = points.length,
      startIndex = n - 2,
      goalIndex = n - 1;
    const links = this.edges.map((edge) => edge.slice());
    links.push([], []);
    for (const i of [startIndex, goalIndex])
      for (let j = 0; j < i; j++)
        if (this.clear(points[i], points[j])) {
          const cost = Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z);
          links[i].push({ to: j, cost });
          links[j].push({ to: i, cost });
        }
    const costs = Array(n).fill(Infinity) as number[],
      previous = Array(n).fill(-1) as number[],
      visited = new Set<number>();
    costs[startIndex] = 0;
    while (visited.size < n) {
      let current = -1;
      for (let i = 0; i < n; i++)
        if (!visited.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
      if (current < 0 || !Number.isFinite(costs[current])) break;
      if (current === goalIndex) {
        const result: Point[] = [];
        for (let at = current; at !== startIndex; at = previous[at]) result.unshift(points[at]);
        return [...approach, ...result];
      }
      visited.add(current);
      for (const edge of links[current]) {
        const next = costs[current] + edge.cost;
        if (next < costs[edge.to]) {
          costs[edge.to] = next;
          previous[edge.to] = current;
        }
      }
    }
    return approach;
  }
}

const navigation = new ArenaNavigation();
const PATROL: Point[] = [
  { x: -11, z: -11 },
  { x: 0, z: -11 },
  { x: 11, z: -11 },
  { x: 11, z: 0 },
  { x: 11, z: 11 },
  { x: 0, z: 11 },
  { x: -11, z: 11 },
  { x: -11, z: 0 },
  { x: 0, z: 0 },
];
interface Brain {
  path: Point[];
  nextPlan: number;
  lastSeen: Point | null;
  lastSeenAt: number;
  targetId: string;
  reactAt: number;
  yaw: number;
  patrol: number;
  lastTime: number;
  lastPosition: Point;
  stuck: number;
}
const brains = new WeakMap<PlayerBody, Brain>();
export interface BotCandidate {
  id: string;
  body: PlayerBody;
}

export function canSee(from: Vec3, to: Vec3, solids: readonly Solid[] = ARENA_SOLIDS): boolean {
  const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  if (distance < 0.001) return true;
  const direction = {
    x: (to.x - from.x) / distance,
    y: (to.y - from.y) / distance,
    z: (to.z - from.z) / distance,
  };
  return !solids.some((s) => rayBox(from, direction, s) < distance - 0.05);
}
const turn = (from: number, to: number, limit: number) =>
  from + Math.max(-limit, Math.min(limit, Math.atan2(Math.sin(to - from), Math.cos(to - from))));

/** LOS perception, reaction delay, last-seen search and patrolling; no live wall tracking. */
export function botDecision(
  body: PlayerBody,
  candidates: readonly BotCandidate[],
  id: string,
  time: number,
  objective?: Point,
) {
  let brain = brains.get(body);
  if (!brain) {
    brain = {
      path: [],
      nextPlan: 0,
      lastSeen: null,
      lastSeenAt: -Infinity,
      targetId: '',
      reactAt: time + 0.35,
      yaw: Math.atan2(-body.position.x, -body.position.z),
      patrol: seedFor(id) % PATROL.length,
      lastTime: time,
      lastPosition: { ...body.position },
      stuck: 0,
    };
    brains.set(body, brain);
  }
  const dt = Math.max(0.01, Math.min(0.1, time - brain.lastTime));
  brain.lastTime = time;
  const eye = { ...body.position, y: body.position.y + body.eyeHeight };
  let target: BotCandidate | undefined,
    distance = Infinity;
  for (const candidate of candidates) {
    const d = Math.hypot(
      candidate.body.position.x - body.position.x,
      candidate.body.position.z - body.position.z,
    );
    if (d > 36 || d >= distance) continue;
    const p = {
      ...candidate.body.position,
      y: candidate.body.position.y + candidate.body.eyeHeight,
    };
    if (canSee(eye, p)) {
      target = candidate;
      distance = d;
    }
  }
  if (target) {
    if (brain.targetId !== target.id || time - brain.lastSeenAt > 0.6)
      brain.reactAt = time + 0.32 + (seedFor(id) % 12) * 0.01;
    brain.targetId = target.id;
    brain.lastSeen = { ...target.body.position };
    brain.lastSeenAt = time;
  }
  let goal: Point;
  if (objective && !target) goal = objective;
  else if (
    brain.lastSeen &&
    time - brain.lastSeenAt < 5 &&
    Math.hypot(brain.lastSeen.x - body.position.x, brain.lastSeen.z - body.position.z) > 0.8
  )
    goal = brain.lastSeen;
  else {
    goal = PATROL[brain.patrol];
    if (Math.hypot(goal.x - body.position.x, goal.z - body.position.z) < 1.1) {
      brain.patrol = (brain.patrol + 1) % PATROL.length;
      goal = PATROL[brain.patrol];
    }
  }
  const displacement = Math.hypot(
    body.position.x - brain.lastPosition.x,
    body.position.z - brain.lastPosition.z,
  );
  brain.lastPosition = { ...body.position };
  if (body.moving && displacement < 0.015) brain.stuck += dt;
  else brain.stuck = 0;
  if (time >= brain.nextPlan || brain.stuck > 0.7) {
    brain.path = navigation.path(body.position, goal);
    brain.nextPlan = time + 0.65;
    brain.stuck = 0;
  }
  while (brain.path.length > 1 && navigation.clear(body.position, brain.path[1]))
    brain.path.shift();
  while (
    brain.path.length &&
    Math.hypot(brain.path[0].x - body.position.x, brain.path[0].z - body.position.z) < 0.22
  )
    brain.path.shift();
  let dx = 0,
    dz = 0;
  if (!target || distance > 9) {
    const waypoint = brain.path[0];
    if (waypoint) {
      dx = waypoint.x - body.position.x;
      dz = waypoint.z - body.position.z;
      const length = Math.hypot(dx, dz) || 1;
      const speed = Math.min(0.78, Math.max(0.42, length / 3));
      dx = (dx / length) * speed;
      dz = (dz / length) * speed;
    }
  } else if (Math.floor(time * 1.5 + (seedFor(id) % 10)) % 4 === 0) {
    const side = seedFor(id) % 2 ? 1 : -1;
    const sideYaw = Math.atan2(
      target.body.position.x - body.position.x,
      target.body.position.z - body.position.z,
    );
    const q = {
      x: body.position.x + Math.cos(sideYaw) * side,
      z: body.position.z - Math.sin(sideYaw) * side,
    };
    if (navigation.clear(body.position, q)) {
      dx = Math.cos(sideYaw) * side * 0.42;
      dz = -Math.sin(sideYaw) * side * 0.42;
    }
  }
  const aimYaw = target
    ? Math.atan2(target.body.position.x - body.position.x, target.body.position.z - body.position.z)
    : Math.atan2(dx || Math.sin(brain.yaw), dz || Math.cos(brain.yaw));
  brain.yaw = turn(brain.yaw, aimYaw, 3.5 * dt);
  const angle = Math.abs(Math.atan2(Math.sin(aimYaw - brain.yaw), Math.cos(aimYaw - brain.yaw)));
  const pitch = target
    ? Math.atan2(eye.y - target.body.position.y - target.body.eyeHeight, distance)
    : 0;
  return {
    forward: dx * Math.sin(brain.yaw) + dz * Math.cos(brain.yaw),
    right: dx * Math.cos(brain.yaw) - dz * Math.sin(brain.yaw),
    yaw: brain.yaw,
    pitch,
    visible: !!target,
    fire: !!target && angle < 0.1 && time >= brain.reactAt,
  };
}
