import { MAP_CATALOG, type MapId } from './map-catalog';
import type { MapBlock, MapDefinition } from './maps';
import { box, type Vec3 } from './physics';

type ExtraMapId = Exclude<MapId, 'industrial' | 'old-quarter'>;
type Point = { x: number; z: number };

/** Authored plans share construction tools, not their floor plans or collision lists. */
class Plan {
  readonly blocks: MapBlock[] = [];
  readonly landmarks: Point[] = [];
  private site?: Vec3;
  constructor(
    readonly id: ExtraMapId,
    readonly width = 48,
    readonly depth = 48,
  ) {
    this.add('floor', 0, -0.5, 0, width, 1, depth);
    this.add('north-boundary', 0, 2.5, depth / 2, width + 1, 5, 1);
    this.add('south-boundary', 0, 2.5, -depth / 2, width + 1, 5, 1);
    this.add('west-boundary', -width / 2, 2.5, 0, 1, 5, depth);
    this.add('east-boundary', width / 2, 2.5, 0, 1, 5, depth);
  }
  add(name: string, x: number, y: number, z: number, w: number, h: number, d: number) {
    this.blocks.push({ name, x, y, z, w, h, d });
    return this;
  }
  cover(name: string, x: number, z: number, w = 2.4, d = 1.4, h = 1.3) {
    return this.add(name, x, h / 2, z, w, h, d);
  }
  objective(x: number, z: number) {
    this.site = { x, y: 0, z };
    return this;
  }
  /** Three 3.2m doorways: north, south and east; walls/lintels/roof are shared solids. */
  house(name: string, x: number, z: number, w: number, d: number, h = 4.4) {
    const prefix = `building-${name}`;
    const gap = 3.2,
      doorHeight = 2.8,
      thickness = 0.4;
    for (const [side, sign] of [
      ['north', 1],
      ['south', -1],
    ] as const) {
      for (const s of [-1, 1])
        this.add(
          `${prefix}-${side}-${s < 0 ? 'west' : 'east'}-wall`,
          x + (s * (w + gap)) / 4,
          h / 2,
          z + (sign * d) / 2,
          (w - gap) / 2,
          h,
          thickness,
        );
      this.add(
        `${prefix}-${side}-lintel`,
        x,
        (h + doorHeight) / 2,
        z + (sign * d) / 2,
        gap,
        h - doorHeight,
        thickness,
      );
    }
    this.add(`${prefix}-west-wall`, x - w / 2, h / 2, z, thickness, h, d + thickness);
    for (const s of [-1, 1])
      this.add(
        `${prefix}-east-${s < 0 ? 'south' : 'north'}-wall`,
        x + w / 2,
        h / 2,
        z + (s * (d + gap)) / 4,
        thickness,
        h,
        (d - gap) / 2,
      );
    this.add(
      `${prefix}-east-lintel`,
      x + w / 2,
      (h + doorHeight) / 2,
      z,
      thickness,
      h - doorHeight,
      gap,
    );
    this.add(`${prefix}-roof`, x, h + 0.12, z, w + 0.6, 0.24, d + 0.6);
    this.landmarks.push({ x, z });
    return this;
  }
  finish(): MapDefinition {
    const solids = this.blocks.map((b) => box(b.x, b.y, b.z, b.w, b.h, b.d));
    const marginX = this.width / 2 - 5,
      marginZ = this.depth / 2 - 5;
    const spawns: Vec3[] = [];
    for (const x of [-marginX, -marginX * 0.58, marginX * 0.58, marginX]) {
      spawns.push({ x, y: 0.05, z: -marginZ }, { x: -x, y: 0.05, z: marginZ });
    }
    const free = (p: Point) =>
      !solids.some(
        (s) =>
          s.max.y > 0.1 &&
          s.min.y < 1.8 &&
          p.x > s.min.x - 0.6 &&
          p.x < s.max.x + 0.6 &&
          p.z > s.min.z - 0.6 &&
          p.z < s.max.z + 0.6,
      );
    const patrolPoints = [
      ...this.landmarks,
      ...[-16, -8, 0, 8, 16].flatMap((x) => [-15, -7, 1, 9, 15].map((z) => ({ x, z }))),
    ].filter(free);
    const bombSite = this.site ?? { x: 0, y: 0, z: this.depth / 2 - 7 };
    return {
      id: this.id,
      name: MAP_CATALOG.find((entry) => entry.id === this.id)!.name,
      blocks: this.blocks,
      solids,
      spawns,
      bombSite,
      bounds: {
        minX: -this.width / 2 + 0.5,
        maxX: this.width / 2 - 0.5,
        minZ: -this.depth / 2 + 0.5,
        maxZ: this.depth / 2 - 0.5,
      },
      patrolPoints,
    };
  }
}

export function createAdditionalMaps(): Record<ExtraMapId, MapDefinition> {
  const maps = {} as Record<ExtraMapId, MapDefinition>;
  const save = (plan: Plan) => {
    maps[plan.id] = plan.finish();
  };

  // Port: two staggered container rows and a west-side office, with a broad east flank.
  const docks = new Plan('dockyard', 52, 48).house('port-office', -15, -3, 8, 10);
  docks
    .cover('container-blue-1', -4, -9, 3, 9, 2.8)
    .cover('container-rust-2', 7, -5, 9, 3, 2.8)
    .cover('container-blue-3', 4, 8, 3, 9, 2.8)
    .cover('container-rust-4', 14, 9, 7, 3, 2.8)
    .cover('crate-customs', -9, 12, 2, 2)
    .cover('barrel-port', 13, -13, 1.2, 1.2, 1.5);
  save(docks.objective(-15, -3));

  // Refinery: tank islands interrupt sightlines; the maintenance shed forms the inside route.
  const refinery = new Plan('refinery').house('maintenance', -12, 7, 8, 9);
  for (const [i, x, z] of [
    [1, 2, -9],
    [2, 10, -5],
    [3, 4, 5],
    [4, 13, 10],
  ])
    refinery.cover(`pillar-refinery-tank-${i}`, x, z, 3.6, 3.6, 4.5);
  refinery
    .cover('pipe-valve-south', -11, -9, 6, 1.5, 1.8)
    .cover('barricade-manifold', 0, 12, 3.5, 1, 1.2)
    .cover('crate-pump-controls', -1, 0, 2, 2, 1.4);
  save(refinery.objective(-12, 7));

  // Sandstone: a walk-through fortress at the center, plus offset low defensive walls.
  const sandstone = new Plan('sandstone').house('sandstone-fort', 0, -1, 12, 12, 5.2);
  sandstone
    .cover('barricade-west-outwork', -13, -8, 1.2, 8, 1.5)
    .cover('barricade-east-outwork', 13, 5, 1.2, 9, 1.5)
    .cover('crate-supply-southwest', -10, 8, 2, 2)
    .cover('crate-supply-northeast', 9, -11, 3, 2)
    .cover('pillar-watchpoint-west', -15, 9, 2.5, 2.5, 3.8);
  save(sandstone.objective(0, 2));

  // Bazaar: separate galleries flank an obstructed pedestrian market, rather than a courtyard.
  const bazaar = new Plan('bazaar', 52, 48)
    .house('spice-gallery', -14, -3, 8, 12)
    .house('cloth-gallery', 14, 4, 8, 12);
  for (const [i, x, z, w] of [
    [1, -3, -10, 4],
    [2, 3, -3, 3],
    [3, -3, 4, 4],
    [4, 2, 11, 3],
  ])
    bazaar.cover(`crate-market-stall-${i}`, x, z, w, 1.5, 1.3);
  bazaar.cover('planter-market-entry', -8, 13, 2, 2, 0.8);
  save(bazaar.objective(14, 4));

  // Forest compound: two unequal huts across diagonal log emplacements.
  const forest = new Plan('pine-outpost', 52, 52)
    .house('forest-barracks', -12, -8, 10, 8)
    .house('forest-radio', 11, 7, 8, 7);
  forest
    .cover('barricade-log-west', -12, 7, 7, 1.2, 1.1)
    .cover('barricade-log-center', 0, -1, 1.2, 7, 1.1)
    .cover('barricade-log-east', 12, -9, 6, 1.2, 1.1)
    .cover('crate-radio-cases', 0, 11, 2, 2);
  for (const [i, x, z] of [
    [1, -19, 2],
    [2, 18, -1],
    [3, 1, -14],
  ])
    forest.cover(`pillar-pine-${i}`, x, z, 0.9, 0.9, 5.5);
  save(forest.objective(11, 7));

  // Alpine depot: one wide transit hall and a sequence of exterior material stacks.
  const alpine = new Plan('alpine-depot', 52, 48).house('alpine-depot', -4, 0, 18, 12, 5);
  alpine
    .cover('container-insulated-east', 15, 4, 3, 10, 2.6)
    .cover('crate-alpine-south', -13, -12, 3, 3, 1.5)
    .cover('crate-alpine-north', -12, 12, 3, 3, 1.5)
    .cover('barricade-snow-equipment', 9, -11, 5, 1.2, 1.1)
    .cover('crate-indoor-rations', -8, 2, 2, 2);
  save(alpine.objective(-2, 0));

  // Lab: opposite room wings, glasshouse-like dividers and a traversable central cross.
  const lab = new Plan('research-lab')
    .house('research-west-wing', -11, -5, 9, 13, 4)
    .house('research-east-wing', 11, 5, 9, 13, 4);
  lab
    .cover('barricade-lab-divider-north', -3, 9, 1, 6, 1.8)
    .cover('barricade-lab-divider-south', 3, -9, 1, 6, 1.8)
    .cover('crate-instrument-west', -12, -3, 2, 1.2, 1)
    .cover('crate-instrument-east', 12, 3, 2, 1.2, 1)
    .cover('pillar-lab-terminal', 0, 0, 1.2, 1.2, 2.2);
  save(lab.objective(-11, -5));

  // Reactor: enclosed center with a reactor column, surrounded by an open service ring.
  const reactor = new Plan('reactor', 52, 52).house('reactor-containment', 0, 0, 16, 16, 5.5);
  reactor
    .cover('pillar-reactor-core', 0, 0, 3.2, 3.2, 4.5)
    .cover('pipe-west-coolant', -14, -6, 2, 8, 1.8)
    .cover('pipe-east-coolant', 14, 6, 2, 8, 1.8)
    .cover('crate-reactor-console', 5, 4, 2, 1, 1.3)
    .cover('barricade-south-transformer', 4, -14, 5, 2.5, 1.7)
    .cover('crate-north-transformer', -6, 13, 3, 2.5, 1.7);
  save(reactor.objective(4, 0));

  // Fort: four separate gates into an open inner bailey; deliberately no central roof.
  const fort = new Plan('old-fort', 52, 52);
  for (const side of [-1, 1])
    for (const offset of [-7, 7]) {
      fort.add(`building-fort-${side}-${offset}-north-wall`, offset, 2.4, side * 11, 8, 4.8, 1.1);
      fort.add(`building-fort-${side}-${offset}-east-wall`, side * 11, 2.4, offset, 1.1, 4.8, 8);
    }
  fort
    .cover('pillar-fort-corner-nw', -11, 11, 2.5, 2.5, 5.5)
    .cover('pillar-fort-corner-se', 11, -11, 2.5, 2.5, 5.5)
    .cover('barricade-fallen-masonry', -3, 2, 6, 1.5, 1.1)
    .cover('crate-fort-cache', 5, -4, 2.4, 2.4, 1.3);
  save(fort.objective(0, 6));

  // Rail terminal: staggered train cars give parallel routes linked by three cross aisles.
  const rail = new Plan('rail-terminal', 52, 56).house('signal-office', -16, 3, 7, 8, 4.2);
  rail
    .cover('container-railcar-west-south', -7, -10, 3, 10, 2.8)
    .cover('container-railcar-west-north', -7, 7, 3, 10, 2.8)
    .cover('container-railcar-east-south', 6, -4, 3, 12, 2.8)
    .cover('container-railcar-east-north', 6, 14, 3, 7, 2.8)
    .cover('crate-platform-east', 15, -11, 3, 3, 1.2)
    .cover('barrel-signal-oil', -15, -9, 1.2, 1.2, 1.5);
  save(rail.objective(-16, 3));

  // Shipyard: broad central maintenance dock and a narrow, separately sheltered east route.
  const shipyard = new Plan('shipyard', 56, 48).house('naval-workshop', 15, -1, 8, 12, 4.8);
  shipyard
    .cover('container-maintenance-hull', -5, 1, 8, 13, 2.4)
    .cover('crate-dock-engine', -15, -9, 3, 4, 1.8)
    .cover('crate-dock-cable', -14, 12, 4, 2, 1.3)
    .cover('barrel-shipyard-1', 3, -12, 1.2, 1.2, 1.5)
    .cover('barricade-dock-tools', 4, 11, 5, 1.2, 1.3);
  save(shipyard.objective(15, -1));

  // Desert base: two diagonal compounds and an offset generator form a dogleg central route.
  const desert = new Plan('desert-compound', 52, 52)
    .house('desert-command', -11, 7, 10, 10)
    .house('desert-barracks', 11, -7, 9, 10);
  desert
    .cover('container-field-generator', 2, 4, 3, 5, 2.4)
    .cover('barricade-sandbags-south', -11, -10, 7, 1.4, 1.1)
    .cover('barricade-sandbags-north', 12, 11, 6, 1.4, 1.1)
    .cover('barrel-desert-fuel', -3, -7, 1.2, 1.2, 1.4);
  save(desert.objective(-11, 7));

  // Canal: the low channel parapets force crossings at west, center and east gaps.
  const canal = new Plan('canal', 56, 48).house('canal-pumphouse', -15, 10, 9, 7, 4.5);
  for (const z of [-3.5, 3.5]) {
    canal.cover(`barricade-channel-west-${z}`, -13, z, 10, 0.8, 1.5);
    canal.cover(`barricade-channel-center-${z}`, 0, z, 7, 0.8, 1.5);
    canal.cover(`barricade-channel-east-${z}`, 13, z, 10, 0.8, 1.5);
  }
  canal
    .cover('pipe-canal-valve', 13, -11, 3, 2, 1.5)
    .cover('crate-canal-machinery', 7, 11, 2, 3, 1.4);
  save(canal.objective(-15, 10));

  // Bunker: two protected rooms overlap in depth but not in space, with short slalom defenses.
  const bunker = new Plan('concrete-bunker')
    .house('bunker-west', -11, 2, 9, 15, 3.8)
    .house('bunker-east', 11, -3, 9, 15, 3.8);
  bunker
    .cover('barricade-blast-baffle-a', -1, -10, 5, 1, 2.2)
    .cover('barricade-blast-baffle-b', 2, -3, 4, 1, 2.2)
    .cover('barricade-blast-baffle-c', -2, 5, 4, 1, 2.2)
    .cover('barricade-blast-baffle-d', 2, 12, 5, 1, 2.2);
  save(bunker.objective(11, -3));

  // Observatory: a large northwest station, an opposite instrument hut and off-center antennae.
  const observatory = new Plan('observatory', 56, 52)
    .house('observatory-dome', -10, 5, 13, 12, 5.2)
    .house('instrument-control', 13, -7, 8, 8, 4);
  observatory
    .cover('pillar-atlas-antenna', 7, 7, 2, 2, 6)
    .cover('crate-optics-case', -13, -10, 3, 2, 1.2)
    .cover('barricade-atlas-supplies', 2, -11, 4, 1.5, 1.4)
    .cover('crate-satellite-battery', 16, 10, 2.5, 2.5, 1.5);
  save(observatory.objective(-10, 5));

  // Border: three independent checkpoint gates, each with a different approach to cover.
  const border = new Plan('border-crossing', 56, 48).house('border-inspection', -14, -8, 8, 8, 4);
  for (const [index, x, w] of [
    [1, -17, 8],
    [2, -5, 7],
    [3, 7, 7],
    [4, 19, 6],
  ])
    border.cover(`barricade-border-wall-${index}`, x, 2, w, 1.2, 3.3);
  border
    .cover('crate-border-documents', -3, -9, 2, 2, 1.3)
    .cover('container-border-cargo', 12, -10, 7, 3, 2.5)
    .cover('barricade-border-north', 8, 12, 6, 1.3, 1.4)
    .cover('barrel-border-fuel', -12, 11, 1.3, 1.3, 1.5);
  save(border.objective(-14, -8));

  // Village: three usable homes of different footprints; the eastern house sits farther north.
  const village = new Plan('village', 56, 56)
    .house('village-west', -13, -6, 9, 9, 4.8)
    .house('village-east', 13, 6, 9, 11, 4.6)
    .house('village-north', -8, 12, 8, 7, 4.4);
  village
    .cover('planter-olive-square', 0, 1, 3, 3, 0.9)
    .cover('crate-village-produce', 4, -10, 3, 2, 1.2)
    .cover('barricade-village-stone', 7, 14, 4, 1, 1.3);
  save(village.objective(-8, 12));

  // Drainage plant: long channel dividers with offset gaps and a covered treatment chamber.
  const drain = new Plan('storm-drain', 48, 56).house('drain-treatment', -11, 5, 8, 11, 4.2);
  drain
    .cover('barricade-drain-wall-west-south', -3, -10, 0.8, 10, 2.3)
    .cover('barricade-drain-wall-west-north', -3, 9, 0.8, 11, 2.3)
    .cover('barricade-drain-wall-east-south', 8, -5, 0.8, 12, 2.3)
    .cover('barricade-drain-wall-east-north', 8, 15, 0.8, 7, 2.3)
    .cover('pipe-drain-intake', 14, 2, 3, 3, 2.1)
    .cover('crate-drain-tools', 1, 0, 2, 2, 1.2);
  for (const [index, x, z] of [
    [1, -14, -12],
    [2, 14, -14],
    [3, 14, 13],
  ])
    drain.cover(`pillar-drain-support-${index}`, x, z, 1, 1, 4.5);
  save(drain.objective(-11, 5));

  return maps;
}
