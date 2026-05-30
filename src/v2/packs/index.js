import { getFinanceGuardPack } from './financeguard.js';
import { getHealthGuardPack } from './healthguard.js';

export function getV2Pack(packName) {
  if (packName === 'financeguard-core') return getFinanceGuardPack();
  if (packName === 'healthguard-core') return getHealthGuardPack();
  throw new Error(`Unknown v2 pack: ${packName}`);
}
