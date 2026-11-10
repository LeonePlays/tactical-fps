import type { GameSnapshot } from '../game/game';
import { WEAPONS } from '../game/ballistics';
import { EQUIPMENT } from '../game/equipment';
import { rayBox } from '../network/arena';
export class ClassicHud {
  private nodes = new Map<string, HTMLElement>();
  private readonly radar: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly crosshair: HTMLElement;
  private readonly ammoLabel: HTMLElement;
  private readonly scoreLabel: HTMLElement;
  constructor(private readonly root: HTMLElement) {
    root.querySelectorAll<HTMLElement>('[id]').forEach((node) => this.nodes.set(node.id, node));
    this.radar = this.node('radar') as HTMLCanvasElement;
    this.context = this.radar.getContext('2d');
    this.crosshair = this.node('crosshair');
    this.ammoLabel = root.querySelector('.hud-ammo .label')!;
    this.scoreLabel = root.querySelector('.hud-score .label')!;
  }
  private node(id: string) {
    return this.nodes.get(id)!;
  }
  private text(id: string, value: string) {
    const node = this.node(id);
    if (node.textContent !== value) node.textContent = value;
  }
  update(state: GameSnapshot, showFps: boolean, kills?: number, dynamicCrosshair = true) {
    const firearm = state.tool === 'firearm';
    this.text(
      'ammo-count',
      firearm
        ? String(state.ammo).padStart(2, '0')
        : state.tool === 'knife'
          ? '—'
          : String(state.grenades),
    );
    this.text('reserve-count', firearm ? String(state.reserve) : '—');
    this.text('health-count', String(Math.ceil(state.health)));
    this.text('armor-count', String(Math.ceil(state.armor)));
    this.text('money-count', `$${state.money}`);
    this.text('hit-count', String(kills ?? state.hits).padStart(2, '0'));
    this.text('accuracy', state.shots ? `${Math.round((state.hits / state.shots) * 100)}%` : '—');
    this.text(
      'session-time',
      `${Math.floor(state.elapsed / 60)
        .toString()
        .padStart(2, '0')}:${Math.floor(state.elapsed % 60)
        .toString()
        .padStart(2, '0')}`,
    );
    this.text(
      'stance-label',
      { standing: 'EM PÉ', crouching: 'AGACHADO', prone: 'DEITADO' }[state.stance],
    );
    this.text(
      'movement-label',
      !state.grounded
        ? 'NO AR'
        : state.speed < 0.1
          ? 'PARADO'
          : state.sprinting
            ? 'CORRENDO'
            : 'ANDANDO',
    );
    this.text(
      'reload-label',
      !firearm
        ? state.tool === 'knife'
          ? 'CLIQUE · GOLPE'
          : state.grenades
            ? 'CLIQUE · LANÇAR'
            : 'SEM GRANADA · B / 6 COMPRAR'
        : state.reloading
          ? 'RECARREGANDO…'
          : state.deploying
            ? 'EQUIPANDO…'
            : 'R · RECARREGAR',
    );
    this.text(
      'bearing',
      `${Math.round(((((state.yaw * 180) / Math.PI) % 360) + 360) % 360)
        .toString()
        .padStart(3, '0')}°`,
    );
    this.text('coordinates', `X ${state.position.x.toFixed(1)} / Z ${state.position.z.toFixed(1)}`);
    this.text('fps-counter', `${state.fps} FPS`);
    this.node('fps-counter').hidden = !showFps;
    this.node('hit-marker').hidden = !state.hit;
    this.ammoLabel.textContent = firearm
      ? WEAPONS[state.weapon].name
      : EQUIPMENT[state.tool === 'knife' ? 'knife' : 'grenade'].name;
    this.scoreLabel.textContent = kills === undefined ? 'ALVOS' : 'ELIMINAÇÕES';
    this.node('buy-panel').hidden = !state.buying;
    this.text(
      'buy-zone',
      state.buyAllowed
        ? 'ÁREA DE COMPRA · início da sessão/vida (90 s)'
        : 'FORA DA ÁREA OU TEMPO DE COMPRA',
    );
    this.text('buy-message', state.buyMessage);
    const gap = !dynamicCrosshair
      ? 5
      : 4 +
        Math.min(
          24,
          (state.spread * window.innerWidth) / (2 * Math.tan((state.fov * Math.PI) / 360)),
        );
    this.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    Object.assign(this.root.dataset, {
      tool: state.tool,
      grenades: String(state.grenades),
      elapsed: String(state.elapsed),
      position: JSON.stringify(state.position),
      stance: state.stance,
      grounded: String(state.grounded),
      weaponVisible: String(state.weaponVisible),
      speed: state.speed.toFixed(3),
      spread: state.spread.toFixed(5),
      impacts: String(state.impacts),
      deploying: String(state.deploying),
    });
    if (!this.root.hidden) this.drawRadar(state);
  }
  private drawRadar(state: GameSnapshot) {
    const ctx = this.context;
    if (!ctx) return;
    const size = this.radar.width,
      center = size / 2,
      scale = 4;
    const x = (n: number) => center + (n - state.position.x) * scale,
      z = (n: number) => center - (n - state.position.z) * scale;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#16221dcc';
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.rect(2, 2, size - 4, size - 4);
    ctx.clip();
    ctx.fillStyle = '#788775';
    for (const solid of state.radarSolids) {
      if (solid.max.y <= 0.01) continue;
      ctx.fillRect(
        x(solid.min.x),
        z(solid.max.z),
        (solid.max.x - solid.min.x) * scale,
        (solid.max.z - solid.min.z) * scale,
      );
    }
    const origin = {
      ...state.position,
      y: state.position.y + { standing: 1.62, crouching: 0.94, prone: 0.39 }[state.stance],
    };
    ctx.fillStyle = '#e49b70';
    for (const contact of state.contacts) {
      const dx = contact.x - state.position.x,
        dz = contact.z - state.position.z,
        distance = Math.hypot(dx, dz);
      if (distance > 12 || distance === 0) continue;
      const dir = { x: dx / distance, y: 0, z: dz / distance };
      if (state.radarSolids.some((s) => rayBox(origin, dir, s) < distance)) continue;
      ctx.fillRect(x(contact.x) - 2, z(contact.z) - 2, 4, 4);
    }
    ctx.translate(center, center);
    ctx.rotate(state.yaw);
    ctx.fillStyle = '#c5dd80';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-4, 5);
    ctx.lineTo(4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#b4c690';
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    ctx.fillStyle = '#d2d6ad';
    ctx.font = '10px monospace';
    ctx.fillText('N', size / 2 - 3, 12);
  }
}
