import type { MapDefinition } from '../game/maps';

export const THEME_NAMES: Readonly<Record<string, string>> = {
  industrial: 'INDUSTRIAL',
  urban: 'URBANO',
  desert: 'DESERTO',
  forest: 'FLORESTA',
  snow: 'NEVE',
  harbor: 'PORTUÁRIO',
  laboratory: 'PESQUISA',
  ruins: 'FORTIFICAÇÃO',
};

export const WEAPON_KINDS: Readonly<Record<string, string>> = {
  carbine: 'Carabina',
  assault: 'Fuzil de assalto',
  smg: 'Submetralhadora',
  dmr: 'Precisão semiautomática',
  shotgun: 'Escopeta',
  sniper: 'Precisão de ferrolho',
  lmg: 'Metralhadora leve',
  pistol: 'Pistola',
  'heavy-pistol': 'Pistola pesada',
  'compact-pistol': 'Pistola compacta',
};

/** Preview is drawn from the same volumes used by collision and navigation. */
export function drawMapPreview(canvas: HTMLCanvasElement, map: MapDefinition): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  const bounds = map.bounds;
  const scale = Math.min(
    (width - 24) / (bounds.maxX - bounds.minX),
    (height - 20) / (bounds.maxZ - bounds.minZ),
  );
  const cx = width / 2;
  const cz = height / 2;
  const midX = (bounds.minX + bounds.maxX) / 2;
  const midZ = (bounds.minZ + bounds.maxZ) / 2;
  const x = (value: number) => cx + (value - midX) * scale;
  const z = (value: number) => cz - (value - midZ) * scale;
  context.fillStyle = '#101b19';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#96b7a20f';
  context.lineWidth = 1;
  for (let grid = 0; grid < width; grid += 16) {
    context.beginPath();
    context.moveTo(grid, 0);
    context.lineTo(grid, height);
    context.stroke();
  }
  for (let grid = 0; grid < height; grid += 16) {
    context.beginPath();
    context.moveTo(0, grid);
    context.lineTo(width, grid);
    context.stroke();
  }
  for (const block of map.blocks) {
    if (block.y + block.h / 2 < 0.15 || block.y - block.h / 2 >= 1.8) continue;
    context.fillStyle = block.h > 2 ? '#71897b' : '#536c5e';
    context.fillRect(
      x(block.x - block.w / 2),
      z(block.z + block.d / 2),
      block.w * scale,
      block.d * scale,
    );
  }
  context.strokeStyle = '#a9c4b266';
  context.strokeRect(
    x(bounds.minX),
    z(bounds.maxZ),
    (bounds.maxX - bounds.minX) * scale,
    (bounds.maxZ - bounds.minZ) * scale,
  );
  map.spawns.forEach((spawn, index) => {
    context.fillStyle = index % 2 === 0 ? '#7eb8e3' : '#e5a16e';
    context.beginPath();
    context.arc(x(spawn.x), z(spawn.z), 2.2, 0, Math.PI * 2);
    context.fill();
  });
  context.fillStyle = '#e2cf80';
  context.font = 'bold 11px monospace';
  context.textAlign = 'center';
  context.fillText('A', x(map.bombSite.x), z(map.bombSite.z) + 4);
  context.fillStyle = '#a7baac';
  context.font = '9px monospace';
  context.textAlign = 'left';
  context.fillText('N ↑', 8, 13);
}
