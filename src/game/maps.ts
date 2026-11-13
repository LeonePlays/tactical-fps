import type { MapId } from './match-config';
import { box, type Solid, type Vec3 } from './physics';
import { ARENA_BLOCKS, ARENA_SOLIDS, SPAWNS } from '../network/arena';

export interface MapBlock {
  name: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}
/** Engine-independent geometry: render, physics, objectives and navigation share it. */
export interface MapDefinition {
  id: MapId;
  name: string;
  solids: readonly Solid[];
  /** Team Alpha uses even indices, Team Bravo odd indices. */
  spawns: readonly Vec3[];
  bombSite: Vec3;
  /** Raw inner wall limits; navigation applies its own body clearance. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  patrolPoints: readonly { x: number; z: number }[];
  blocks: readonly MapBlock[];
}

const urban: MapBlock[] = [];
const block = (name: string, x: number, y: number, z: number, w: number, h: number, d: number) =>
  urban.push({ name, x, y, z, w, h, d });
block('floor', 0, -0.5, 0, 48, 1, 48);
block('north-boundary', 0, 2.5, 24, 49, 5, 1);
block('south-boundary', 0, 2.5, -24, 49, 5, 1);
block('west-boundary', -24, 2.5, 0, 1, 5, 48);
block('east-boundary', 24, 2.5, 0, 1, 5, 48);

// A café with three full-height entrances: south street, central square and rear patio.
block('building-cafe-west-wall', -17, 2.2, 0, 0.4, 4.4, 14.4);
block('building-cafe-east-south-wall', -7, 2.2, -4.2, 0.4, 4.4, 5.6);
block('building-cafe-east-north-wall', -7, 2.2, 4.2, 0.4, 4.4, 5.6);
block('building-cafe-east-lintel', -7, 3.75, 0, 0.4, 1.3, 2.8);
block('building-cafe-south-west-wall', -15.4, 2.2, -7, 3.2, 4.4, 0.4);
block('building-cafe-south-east-wall', -8.6, 2.2, -7, 3.2, 4.4, 0.4);
block('building-cafe-south-lintel', -12, 3.75, -7, 3.6, 1.3, 0.4);
block('building-cafe-north-west-wall', -15.2, 2.2, 7, 3.6, 4.4, 0.4);
block('building-cafe-north-east-wall', -8.8, 2.2, 7, 3.6, 4.4, 0.4);
block('building-cafe-north-lintel', -12, 3.75, 7, 2.8, 1.3, 0.4);
block('building-cafe-roof', -12, 4.525, 0, 10.7, 0.25, 14.7);
block('cafe-counter', -15, 0.55, 2, 3, 1.1, 1.2);

// An offset covered market provides a different interior loop on the opposite side.
block('building-market-east-wall', 17, 2.4, 2, 0.4, 4.8, 14.4);
block('building-market-west-south-wall', 7, 2.4, -2.75, 0.4, 4.8, 4.5);
block('building-market-west-north-wall', 7, 2.4, 5.75, 0.4, 4.8, 6.5);
block('building-market-west-lintel', 7, 4, 1, 0.4, 1.6, 3);
block('building-market-south-west-wall', 8.6, 2.4, -5, 3.2, 4.8, 0.4);
block('building-market-south-east-wall', 15.4, 2.4, -5, 3.2, 4.8, 0.4);
block('building-market-south-lintel', 12, 4, -5, 3.6, 1.6, 0.4);
block('building-market-north-west-wall', 8.75, 2.4, 9, 3.5, 4.8, 0.4);
block('building-market-north-east-wall', 15.25, 2.4, 9, 3.5, 4.8, 0.4);
block('building-market-north-lintel', 12, 4, 9, 3, 1.6, 0.4);
block('building-market-roof', 12, 4.925, 2, 10.7, 0.25, 14.7);
block('market-stall-south', 14, 0.5, 1, 2.2, 1, 1.6);
block('market-stall-north', 14, 0.5, 5, 2.2, 1, 1.6);

// Recognizable, asymmetric cover interrupts long street sightlines without sealing routes.
block('fountain-base', 0, 0.4, 1, 3.2, 0.8, 3.2);
block('fountain-column', 0, 1.1, 1, 0.65, 0.6, 0.65);
block('cover-van', -2, 0.9, -12, 2.5, 1.8, 5);
block('cover-kiosk', -4, 0.65, 11, 2.6, 1.3, 2.4);
block('courtyard-planter-west', -19.7, 0.45, 12.5, 2.2, 0.9, 2.2);
block('courtyard-planter-east', 19.7, 0.45, -11, 2.2, 0.9, 2.2);

export const MAPS: Readonly<Record<MapId, MapDefinition>> = {
  industrial: {
    id: 'industrial',
    name: 'Complexo Ferro',
    blocks: ARENA_BLOCKS,
    solids: ARENA_SOLIDS,
    spawns: SPAWNS,
    bombSite: { x: 0, y: 0, z: 10 },
    bounds: { minX: -15.5, maxX: 15.5, minZ: -15.5, maxZ: 15.5 },
    patrolPoints: [
      { x: -12, z: -12 },
      { x: -12, z: 12 },
      { x: 12, z: 12 },
      { x: 12, z: -12 },
      { x: 0, z: 0 },
      { x: 0, z: 11 },
      { x: 0, z: -11 },
    ],
  },
  'old-quarter': {
    id: 'old-quarter',
    name: 'Bairro Antigo',
    blocks: urban,
    solids: urban.map((b) => box(b.x, b.y, b.z, b.w, b.h, b.d)),
    spawns: [
      { x: -18, y: 0.05, z: -19 },
      { x: 18, y: 0.05, z: 19 },
      { x: -12, y: 0.05, z: -19 },
      { x: 12, y: 0.05, z: 19 },
      { x: 12, y: 0.05, z: -19 },
      { x: -12, y: 0.05, z: 19 },
      { x: 18, y: 0.05, z: -19 },
      { x: -18, y: 0.05, z: 19 },
    ],
    bombSite: { x: 1, y: 0, z: 12 },
    bounds: { minX: -23.5, maxX: 23.5, minZ: -23.5, maxZ: 23.5 },
    patrolPoints: [
      { x: -20.5, z: -12 },
      { x: -20.5, z: 0 },
      { x: -20.5, z: 16 },
      { x: -12, z: 12 },
      { x: -12, z: 0 },
      { x: -4, z: -4 },
      { x: 1, z: -18 },
      { x: 3, z: -10 },
      { x: 4, z: 4 },
      { x: 1, z: 12 },
      { x: 20.5, z: 12 },
      { x: 20.5, z: 0 },
      { x: 20.5, z: -16 },
      { x: 12, z: -10 },
      { x: 11, z: 2 },
      { x: 12, z: 12 },
    ],
  },
};

export function getMap(id: MapId): MapDefinition {
  return MAPS[id] ?? MAPS.industrial;
}
