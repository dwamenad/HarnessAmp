import { getFinanceGuardPack } from './financeguard.js';

export function getV2Pack(packName) {
  if (packName === 'financeguard-core') return getFinanceGuardPack();
  throw new Error(`Unknown v2 pack: ${packName}`);
}
