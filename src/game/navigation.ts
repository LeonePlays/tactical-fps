import { ARENA_SOLIDS, rayBox } from '../network/arena';
import { seedFor } from './ballistics';
import { type PlayerBody, type Solid, type Vec3 } from './physics';
import { getMap, type MapDefinition } from './maps';
import type { BotDifficulty } from './match-config';

type Point = { x: number; z: number };
const CLEARANCE = 0.44;
export interface NavigationBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function floorBounds(solids: readonly Solid[]): NavigationBounds {
  const floor = solids
    .filter((s) => s.max.y <= 0.1)
    .sort(
      (a, b) =>
        (b.max.x - b.min.x) * (b.max.z - b.min.z) - (a.max.x - a.min.x) * (a.max.z - a.min.z),
    )[0];
  const xs = solids.flatMap((s) => [s.min.x, s.max.x]);
  const zs = solids.flatMap((s) => [s.min.z, s.max.z]);
  return {
    minX: floor?.min.x ?? Math.min(-1, ...xs),
    maxX: floor?.max.x ?? Math.max(1, ...xs),
    minZ: floor?.min.z ?? Math.min(-1, ...zs),
    maxZ: floor?.max.z ?? Math.max(1, ...zs),
  };
}

/** Shared, static visibility graph around inflated cover corners. No renderer dependency. */
export class ArenaNavigation {
  private readonly obstacles: readonly Solid[];
  private readonly nodes: Point[] = [];
  private readonly edges: { to: number; cost: number }[][] = [];
  private readonly bounds: NavigationBounds;
  constructor(solids: readonly Solid[] = ARENA_SOLIDS, bounds = floorBounds(solids)) {
    this.bounds = {
      minX: bounds.minX + CLEARANCE,
      maxX: bounds.maxX - CLEARANCE,
      minZ: bounds.minZ + CLEARANCE,
      maxZ: bounds.maxZ - CLEARANCE,
    };
    // These maps have flat walkable floors: roofs and doorway lintels above a
    // standing operator must not seal an otherwise traversable interior in 2D.
    this.obstacles = solids.filter((solid) => solid.max.y > 0.1 && solid.min.y < 1.8);
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
      p.x >= this.bounds.minX &&
      p.x <= this.bounds.maxX &&
      p.z >= this.bounds.minZ &&
      p.z <= this.bounds.maxZ &&
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
  private safe(point: Point): Point | undefined {
    const p = {
      x: Math.max(this.bounds.minX, Math.min(this.bounds.maxX, point.x)),
      z: Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, point.z)),
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
    return this.nodes.reduce<Point | undefined>(
      (best, n) =>
        !best || Math.hypot(n.x - p.x, n.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z)
          ? n
          : best,
      undefined,
    );
  }
  path(from: Point, to: Point): Point[] {
    if (![from.x, from.z, to.x, to.z].every(Number.isFinite)) return [];
    const start = this.safe(from),
      goal = this.safe(to);
    if (!start || !goal) return [];
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

export type BotState =
  'patrol' | 'investigate' | 'pursue' | 'engage' | 'retreat' | 'regroup' | 'objective';
export interface BotProfile {
  reactionTime: number;
  visionRange: number;
  fieldOfView: number;
  turnSpeed: number;
  aimError: number;
  shotInterval: number;
  memorySeconds: number;
  preferredRange: number;
  retreatHealth: number;
  recoilControl: number;
}
/** Angles are radians; cadence is enforced by the authoritative Match. */
export const BOT_PROFILES: Readonly<Record<BotDifficulty, Readonly<BotProfile>>> = {
  easy: {
    reactionTime: 0.7,
    visionRange: 24,
    fieldOfView: (Math.PI * 105) / 180,
    turnSpeed: 1.8,
    aimError: 0.065,
    shotInterval: 0.75,
    memorySeconds: 3,
    preferredRange: 10,
    retreatHealth: 25,
    recoilControl: 0.15,
  },
  normal: {
    reactionTime: 0.38,
    visionRange: 36,
    fieldOfView: (Math.PI * 135) / 180,
    turnSpeed: 3.5,
    aimError: 0.025,
    shotInterval: 0.4,
    memorySeconds: 5,
    preferredRange: 13,
    retreatHealth: 35,
    recoilControl: 0.55,
  },
  hard: {
    reactionTime: 0.18,
    visionRange: 48,
    fieldOfView: (Math.PI * 155) / 180,
    turnSpeed: 5.2,
    aimError: 0.008,
    shotInterval: 0.2,
    memorySeconds: 7,
    preferredRange: 16,
    retreatHealth: 40,
    recoilControl: 0.85,
  },
};
export interface BotCandidate {
  id: string;
  body: PlayerBody;
}
export interface BotOptions {
  map: MapDefinition;
  difficulty: BotDifficulty;
  health?: number;
  allies?: readonly BotCandidate[];
  /** plant/defuse/objective commits near the site; escort/support follows allies. */
  role?: string;
}
export interface BotDecision {
  forward: number;
  right: number;
  yaw: number;
  pitch: number;
  visible: boolean;
  fire: boolean;
  state: BotState;
  targetId: string | null;
  shotInterval: number;
  aimError: number;
  recoilControl: number;
  /** Public tactical destination, useful for diagnostics without exposing hidden enemies. */
  goal: Point;
}
interface Brain {
  map: MapDefinition;
  path: Point[];
  nextPlan: number;
  lastSeen: Vec3 | null;
  lastSeenAt: number;
  targetId: string;
  reactAt: number;
  yaw: number;
  patrol: number;
  lastTime: number;
  lastPosition: Point;
  requestedMove: number;
  stuck: number;
  routeFailures: number;
  plannedGoal: Point | null;
  routeGoal: Point | null;
  plannedState: BotState;
  recoveryGoal: Point | null;
  recoveryUntil: number;
}
const brains = new WeakMap<PlayerBody, Brain>();
const graphs = new WeakMap<MapDefinition, ArenaNavigation>();
function graphFor(map: MapDefinition): ArenaNavigation {
  let graph = graphs.get(map);
  if (!graph) {
    graph = new ArenaNavigation(map.solids, map.bounds);
    graphs.set(map, graph);
  }
  return graph;
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
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const difference = (from: number, to: number) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));
const turn = (from: number, to: number, limit: number) =>
  from + Math.max(-limit, Math.min(limit, difference(from, to)));
const eyeOf = (body: PlayerBody) => ({ ...body.position, y: body.position.y + body.eyeHeight });

function patrolPoints(map: MapDefinition, graph: ArenaNavigation): readonly Point[] {
  const valid = map.patrolPoints.filter((p) => graph.walkable(p));
  return valid.length ? valid : map.spawns.filter((p) => graph.walkable(p));
}
function escapeGoal(body: PlayerBody, graph: ArenaNavigation, seed: number): Point | null {
  // Test actual routes instead of nudging/teleporting a stuck body through geometry.
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6 + (seed % 17) * 0.13;
    const point = {
      x: body.position.x + Math.sin(angle) * 1.7,
      z: body.position.z + Math.cos(angle) * 1.7,
    };
    if (!graph.walkable(point)) continue;
    const path = graph.path(body.position, point);
    if (path.length && distance(path.at(-1)!, point) < 0.1) return point;
  }
  return null;
}
function retreatGoal(
  body: PlayerBody,
  threat: Vec3,
  map: MapDefinition,
  graph: ArenaNavigation,
  allies: readonly BotCandidate[],
): Point {
  const away = Math.atan2(body.position.x - threat.x, body.position.z - threat.z);
  const candidates: Point[] = allies
    .filter((a) => a.body !== body && distance(a.body.position, body.position) > 2)
    .map((a) => ({ ...a.body.position }));
  for (const offset of [0, -0.65, 0.65, -1.2, 1.2])
    for (const length of [4, 7])
      candidates.push({
        x: body.position.x + Math.sin(away + offset) * length,
        z: body.position.z + Math.cos(away + offset) * length,
      });
  let best: Point = { ...body.position },
    score = -Infinity;
  for (const point of candidates) {
    if (!graph.walkable(point) || !graph.path(body.position, point).length) continue;
    const hidden = !canSee(
      { ...threat, y: threat.y + 1.6 },
      { ...point, y: body.position.y + body.eyeHeight },
      map.solids,
    );
    const value = distance(threat, point) - distance(body.position, point) * 0.3 + (hidden ? 8 : 0);
    if (value > score) {
      best = point;
      score = value;
    }
  }
  return best;
}

/**
 * Shared finite-state bot controller. Perception uses only its FOV/LOS; lost
 * opponents contribute a frozen last-seen position, never their live location.
 * Map graphs are cached independently; callers may still use the legacy five arguments.
 */
export function botDecision(
  body: PlayerBody,
  candidates: readonly BotCandidate[],
  id: string,
  time: number,
  objective?: Point,
  options?: BotOptions,
): BotDecision {
  const map = options?.map ?? getMap('industrial');
  const profile = BOT_PROFILES[options?.difficulty ?? 'normal'] ?? BOT_PROFILES.normal;
  const graph = graphFor(map);
  const patrol = patrolPoints(map, graph);
  const allies = options?.allies ?? [];
  const seed = seedFor(id);
  let brain = brains.get(body);
  if (!brain || brain.map !== map || time < brain.lastTime) {
    brain = {
      map,
      path: [],
      nextPlan: 0,
      lastSeen: null,
      lastSeenAt: -Infinity,
      targetId: '',
      reactAt: time + profile.reactionTime,
      yaw: Math.atan2(-body.position.x, -body.position.z),
      patrol: seed % Math.max(1, patrol.length),
      lastTime: time,
      lastPosition: { ...body.position },
      requestedMove: 0,
      stuck: 0,
      routeFailures: 0,
      plannedGoal: null,
      routeGoal: null,
      plannedState: 'patrol',
      recoveryGoal: null,
      recoveryUntil: 0,
    };
    brains.set(body, brain);
  }
  const dt = Math.max(0.001, Math.min(0.1, time - brain.lastTime || 0.02));
  brain.lastTime = time;
  const eye = eyeOf(body);
  let target: BotCandidate | undefined,
    targetDistance = Infinity,
    targetScore = Infinity;
  for (const candidate of candidates) {
    if (candidate.body === body) continue;
    const d = distance(candidate.body.position, body.position);
    if (d > profile.visionRange) continue;
    const yaw = Math.atan2(
      candidate.body.position.x - body.position.x,
      candidate.body.position.z - body.position.z,
    );
    if (Math.abs(difference(brain.yaw, yaw)) > profile.fieldOfView / 2) continue;
    if (!canSee(eye, eyeOf(candidate.body), map.solids)) continue;
    const score = d * (candidate.id === brain.targetId ? 0.82 : 1);
    if (score < targetScore) {
      target = candidate;
      targetDistance = d;
      targetScore = score;
    }
  }
  if (target) {
    if (brain.targetId !== target.id || time - brain.lastSeenAt > 0.6)
      brain.reactAt = time + profile.reactionTime * (1 + (seed % 7) * 0.025);
    brain.targetId = target.id;
    brain.lastSeen = { ...target.body.position };
    brain.lastSeenAt = time;
  }
  const remembers = !!brain.lastSeen && time - brain.lastSeenAt < profile.memorySeconds;
  // A stable leader explores while support follows. Mutual following otherwise
  // makes two allies repeatedly meet, separate and turn back without advancing.
  const nearestAlly = [...allies]
    .filter((a) => a.body !== body && (options?.role !== 'support' || a.id.localeCompare(id) < 0))
    .sort(
      (a, b) => distance(a.body.position, body.position) - distance(b.body.position, body.position),
    )[0];
  const committedRole = ['plant', 'defuse', 'objective', 'carrier'].includes(options?.role ?? '');
  const commitObjective =
    objective &&
    committedRole &&
    (distance(body.position, objective) < 6 || !target || targetDistance > 14);
  let state: BotState, goal: Point;
  if ((options?.health ?? 100) <= profile.retreatHealth && remembers && brain.lastSeen) {
    state = 'retreat';
    // Retreat only uses the most recent legitimate observation.
    goal =
      brain.plannedState === 'retreat' && brain.plannedGoal && time < brain.nextPlan
        ? brain.plannedGoal
        : retreatGoal(body, brain.lastSeen, map, graph, allies);
  } else if (objective && (!target || commitObjective)) {
    state = 'objective';
    goal = objective;
  } else if (target) {
    state = targetDistance > profile.preferredRange ? 'pursue' : 'engage';
    goal = { ...target.body.position };
  } else if (remembers && brain.lastSeen) {
    state = 'investigate';
    goal = brain.lastSeen;
  } else if (
    nearestAlly &&
    ['escort', 'support'].includes(options?.role ?? '') &&
    distance(nearestAlly.body.position, body.position) > 4
  ) {
    state = 'regroup';
    goal = nearestAlly.body.position;
  } else {
    state = 'patrol';
    goal = patrol[brain.patrol] ?? body.position;
    if (distance(goal, body.position) < 1.1 && patrol.length) {
      brain.patrol = (brain.patrol + 1) % patrol.length;
      goal = patrol[brain.patrol];
    }
  }

  const displacement = distance(body.position, brain.lastPosition);
  brain.lastPosition = { ...body.position };
  // A collision zeroes PlayerBody.moving, so remember commanded motion instead.
  if (brain.requestedMove > 0.15 && displacement < Math.max(0.002, dt * 0.12)) brain.stuck += dt;
  else brain.stuck = Math.max(0, brain.stuck - dt * 2);
  if (brain.stuck > 0.7) {
    brain.recoveryGoal = escapeGoal(body, graph, seed + brain.routeFailures++);
    brain.recoveryUntil = time + 1.5;
    brain.nextPlan = 0;
    brain.stuck = 0;
  }
  if (
    brain.recoveryGoal &&
    time < brain.recoveryUntil &&
    distance(body.position, brain.recoveryGoal) > 0.3
  )
    goal = brain.recoveryGoal;
  else brain.recoveryGoal = null;
  if (
    time >= brain.nextPlan ||
    brain.plannedState !== state ||
    !brain.plannedGoal ||
    distance(goal, brain.plannedGoal) > 1
  ) {
    brain.path = graph.path(body.position, goal);
    brain.plannedGoal = { ...goal };
    brain.routeGoal = { ...goal };
    brain.plannedState = state;
    brain.nextPlan = time + 0.65;
    if (!brain.path.length && distance(body.position, goal) > 1) {
      // An enclosed/impossible destination must not make the bot push a wall forever.
      for (let i = 1; i <= patrol.length; i++) {
        const index = (brain.patrol + i + brain.routeFailures) % patrol.length;
        const fallback = patrol[index];
        const route = graph.path(body.position, fallback);
        if (!route.length || distance(route.at(-1)!, body.position) < 0.5) continue;
        brain.patrol = index;
        brain.path = route;
        brain.routeGoal = { ...fallback };
        brain.routeFailures++;
        break;
      }
    }
  }
  while (brain.path.length > 1 && graph.clear(body.position, brain.path[1])) brain.path.shift();
  while (brain.path.length && distance(body.position, brain.path[0]) < 0.25) brain.path.shift();
  let dx = 0,
    dz = 0;
  if (state !== 'engage') {
    const waypoint = brain.path[0];
    if (waypoint) {
      dx = waypoint.x - body.position.x;
      dz = waypoint.z - body.position.z;
      const length = Math.hypot(dx, dz) || 1;
      const speed = Math.min(state === 'retreat' ? 1 : 0.8, Math.max(0.3, length / 3));
      dx = (dx / length) * speed;
      dz = (dz / length) * speed;
    }
  } else if (target && Math.floor(time * 1.3 + (seed % 10)) % 5 === 0) {
    const side = seed % 2 ? 1 : -1;
    const angle = Math.atan2(
      target.body.position.x - body.position.x,
      target.body.position.z - body.position.z,
    );
    const point = {
      x: body.position.x + Math.cos(angle) * side,
      z: body.position.z - Math.sin(angle) * side,
    };
    if (graph.walkable(point) && graph.clear(body.position, point)) {
      dx = Math.cos(angle) * side * 0.4;
      dz = -Math.sin(angle) * side * 0.4;
    }
  }
  // Friendly separation has access to allies only, never unseen hostile positions.
  if (state !== 'objective')
    for (const ally of allies) {
      const d = distance(body.position, ally.body.position);
      if (ally.body === body || d < 0.01 || d >= 1.15) continue;
      const strength = (1.15 - d) * 0.75;
      dx += ((body.position.x - ally.body.position.x) / d) * strength;
      dz += ((body.position.z - ally.body.position.z) / d) * strength;
    }
  const movement = Math.hypot(dx, dz);
  if (movement > 1) {
    dx /= movement;
    dz /= movement;
  }
  const aimYaw = target
    ? Math.atan2(target.body.position.x - body.position.x, target.body.position.z - body.position.z)
    : movement > 0.01
      ? Math.atan2(dx, dz)
      : brain.yaw + (state === 'investigate' ? 0.45 * dt : 0);
  brain.yaw = turn(brain.yaw, aimYaw, profile.turnSpeed * dt);
  const angle = Math.abs(difference(brain.yaw, aimYaw));
  const phase = (seed % 1009) * 0.017;
  const scale = profile.aimError * (1 + body.speed * 0.025);
  const yawError = target
    ? (Math.sin(time * 2.8 + phase) * 0.7 + Math.sin(time * 5.3 + phase * 2) * 0.3) * scale
    : 0;
  const pitchError = target ? Math.sin(time * 3.7 + phase + 1.1) * scale * 0.6 : 0;
  const yaw = brain.yaw + yawError;
  const pitch = target
    ? Math.atan2(eye.y - eyeOf(target.body).y, Math.max(0.001, targetDistance)) + pitchError
    : 0;
  brain.requestedMove = Math.hypot(dx, dz);
  return {
    forward: dx * Math.sin(yaw) + dz * Math.cos(yaw),
    right: dx * Math.cos(yaw) - dz * Math.sin(yaw),
    yaw,
    pitch,
    visible: !!target,
    fire: !!target && angle < 0.1 && time >= brain.reactAt && state !== 'objective',
    state,
    targetId: target?.id ?? (remembers ? brain.targetId : null),
    shotInterval: profile.shotInterval,
    aimError: profile.aimError,
    recoilControl: profile.recoilControl,
    goal: { x: (brain.routeGoal ?? goal).x, z: (brain.routeGoal ?? goal).z },
  };
}
