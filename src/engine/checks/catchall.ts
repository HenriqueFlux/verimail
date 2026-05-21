import { KNOWN_CATCHALL_DOMAINS } from '../data/catchall-domains.js';

export function checkCatchAllCurated(domain: string): boolean {
  return KNOWN_CATCHALL_DOMAINS.has(domain);
}
