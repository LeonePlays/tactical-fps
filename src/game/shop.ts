import type { EquipmentInventory } from './equipment';
import { WEAPONS, GUNS, isWeaponId, type WeaponId } from './ballistics';
import type { WeaponController } from './weapons';
const arsenal = Object.fromEntries(
  Object.entries(GUNS).map(([id, spec]) => [id, { label: spec.name, price: spec.price }]),
) as Record<WeaponId, { label: string; price: number }>;
export const SHOP = {
  primary: { label: 'Carabina T-04', price: WEAPONS.primary.price },
  secondary: { label: 'Pistola P-09', price: WEAPONS.secondary.price },
  primaryAmmo: { label: 'Munição primária (30)', price: 60 },
  secondaryAmmo: { label: 'Munição secundária (12)', price: 25 },
  armor: { label: 'Colete', price: 650 },
  grenade: { label: 'Granada HE', price: 300 },
  ...arsenal,
} as const;
export type BuyItem = keyof typeof SHOP;
export interface Wallet {
  money: number;
  armor: number;
}
export function buy(
  gun: WeaponController,
  wallet: Wallet,
  item: BuyItem,
  allowed: boolean,
  equipment?: EquipmentInventory,
  now = 0,
): string {
  if (!allowed) return 'Compra disponível na área inicial durante 90 segundos.';
  const selectedWeapon =
    item === 'primary' || item === 'secondary' ? gun.loadout[item] : isWeaponId(item) ? item : null;
  const price = selectedWeapon ? GUNS[selectedWeapon].price : SHOP[item].price;
  if (wallet.money < price) return 'Dinheiro insuficiente.';
  if (item === 'grenade') {
    if (!equipment || !equipment.addGrenade()) return 'Os dois slots de granada estão ocupados.';
  } else if (item === 'armor') {
    if (wallet.armor === 100) return 'Você já tem colete completo.';
    wallet.armor = 100;
  } else if (selectedWeapon) {
    const slot = GUNS[selectedWeapon].slot;
    if (gun.inventory[slot].owned && gun.idForSlot(slot) === selectedWeapon)
      return 'Você já possui essa arma.';
    gun.equip(selectedWeapon, now, false);
  } else {
    const slot = item === 'primaryAmmo' ? 'primary' : 'secondary',
      mag = gun.inventory[slot];
    if (!mag.owned) return 'Compre a arma primeiro.';
    const spec = gun.specForSlot(slot);
    if (mag.reserve === spec.reserve) return 'Reserva de munição completa.';
    mag.reserve = Math.min(spec.reserve, mag.reserve + spec.capacity);
  }
  wallet.money -= price;
  return 'Compra efetuada.';
}
export function damageWithArmor(wallet: Wallet, damage: number): number {
  const absorbed = Math.min(wallet.armor, damage * 0.5);
  wallet.armor -= absorbed;
  return damage - absorbed;
}
