import type { MxResult } from '../types.js';
import { SHARED_MX_PROVIDERS } from '../data/known-mx-providers.js';

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

export { type MxResult };

export async function checkMx(domain: string): Promise<MxResult> {
  try {
    const res = await fetch(
      `${DOH_ENDPOINT}?name=${encodeURIComponent(domain)}&type=MX`,
      { headers: { Accept: 'application/dns-json' } }
    );

    if (!res.ok) {
      return { hasDomain: false, hasMx: false, isCatchAllHeuristic: false, mxHosts: [] };
    }

    const data = await res.json() as { Status: number; Answer?: Array<{ data: string }> };

    if (data.Status === 3) {
      // NXDOMAIN — domain does not exist
      return { hasDomain: false, hasMx: false, isCatchAllHeuristic: false, mxHosts: [] };
    }

    const answers = data.Answer ?? [];
    // Parse MX data field: "10 aspmx.l.google.com." → "aspmx.l.google.com"
    const mxHosts = answers.map((a) => a.data.split(' ')[1].replace(/\.$/, '').toLowerCase());

    if (mxHosts.length === 0) {
      return { hasDomain: true, hasMx: false, isCatchAllHeuristic: false, mxHosts: [] };
    }

    const usesSharedProvider = mxHosts.some((host) =>
      SHARED_MX_PROVIDERS.some((provider) => host.endsWith(provider))
    );

    return {
      hasDomain: true,
      hasMx: true,
      isCatchAllHeuristic: !usesSharedProvider,
      mxHosts,
    };
  } catch {
    // Network error — treat as domain not found to avoid false positives
    return { hasDomain: false, hasMx: false, isCatchAllHeuristic: false, mxHosts: [] };
  }
}
