import { getFinanceGuardPack } from './financeguard.js';
import { getHealthGuardPack } from './healthguard.js';
import { getCustomerCareGuardPack } from './customercareguard.js';
import { getLegalGuardPack } from './legalguard.js';

export function getV2Pack(packName) {
  if (packName === 'financeguard-core') return getFinanceGuardPack();
  if (packName === 'healthguard-core') return getHealthGuardPack();
  if (packName === 'customercareguard-core') return getCustomerCareGuardPack();
  if (packName === 'legalguard-core') return getLegalGuardPack();
  throw new Error(`Unknown v2 pack: ${packName}`);
}
