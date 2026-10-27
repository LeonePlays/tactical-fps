export const WEAPONS = {
  primary: {
    name: 'CARABINA T-04',
    capacity: 30,
    interval: 0.14,
    reload: 1.7,
    kick: 0.012,
    automatic: true,
  },
  secondary: {
    name: 'PISTOLA P-09',
    capacity: 12,
    interval: 0.25,
    reload: 1.2,
    kick: 0.025,
    automatic: false,
  },
} as const;
export type WeaponSlot = keyof typeof WEAPONS;
export function spread(moving: boolean, grounded: boolean, stance: string, heat: number): number {
  return (
    (grounded ? (moving ? 0.018 : 0.001) : 0.045) *
      (stance === 'prone' ? 0.4 : stance === 'crouching' ? 0.65 : 1) +
    heat * 0.003
  );
}
