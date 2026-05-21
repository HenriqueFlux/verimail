# Stack Research: Verimail

**Researched:** 2026-05-21
**Overall confidence:** HIGH (core stack verified against official docs; library versions verified against npm)

---

## Recommended Stack

| Layer | Technology | Version | Rationale | Confidence |
|-------|-----------|---------|-----------|------------|
| API / logic runtime | Cloudflare Workers | — (platform) | Pre-decided. Zero infra, 100k req/day free, global edge. | HIGH |
| API framework | Hono | 4.12.x (latest: 4.12.21) | Official CF Workers recommendation. ~14 KB minified, ultra-fast RegExpRouter, first-class TypeScript, built-in Zod validation middleware. Used in prod by Cloudflare itself. | HIGH |
| Auth | Supabase Auth | via @supabase/supabase-js 2.106.x | Pre-decided. 50k MAU free. Handles JWT, sessions, PKCE. No need to build auth. | HIGH |
| Database | Supabase Postgres | via @supabase/supabase-js 2.106.x | Pre-decided. 500 MB free. Row-level security. Handles users, validation history, quota. | HIGH |
| File storage | Supabase Storage | via @supabase/supabase-js 2.106.x | Pre-decided. 1 GB free. For uploaded CSVs and downloadable result files. 50 MB upload cap — fine for CSV lists. | HIGH |
| Frontend | SvelteKit | 2.x (latest stable) | Best fit for small-team SaaS dashboard. 93% dev satisfaction. Tiny JS output vs React/Next. Compiles to vanilla JS, no hydration overhead. Official adapter for CF Pages/Workers. | MEDIUM |
| Frontend styles | Tailwind CSS | 4.x | Pairs with SvelteKit, ships zero unused CSS, fastest utility-class DX. | HIGH |
| Frontend deployment | Cloudflare Pages | — (platform) | Free tier. Automatic CI/CD on push. Serves static + SSR via adapter-cloudflare. Zero config. | HIGH |
| DNS/MX lookup | node:dns (resolveMx) via Workers | — (runtime built-in) | Official CF supported path. Uses DoH at 1.1.1.1 under the hood. No external dependency. Requires `nodejs_compat` flag in wrangler.toml. | HIGH |
| DNS/MX lookup (fallback) | Cloudflare 1.1.1.1 DoH JSON API | — (HTTP API) | Fallback if node:dns gives trouble. GET `https://cloudflare-dns.com/dns-query?name={domain}&type=MX` with `Accept: application/dns-json`. First-party, free, reliable. | HIGH |
| Disposable domain detection | disposable-email-domains | via static JSON import | Canonical open-source list (~5–6k domains). CC0 licensed. Maintained community project. Load as a Set at Worker startup for O(1) lookup. | HIGH |
| Syntax validation | Custom regex (RFC 5321) | — | No library needed. Single regex for local-part + domain validation. Keeps bundle small. | HIGH |
| Typo detection | fast-levenshtein | 3.0.0 | Levenshtein distance against a hardcoded list of ~20 BR/global popular domains (gmail.com, hotmail.com, yahoo.com, uol.com.br, etc.). Sub-1ms. Tiny (1 KB). | MEDIUM |
| CLI / deployment | Wrangler | 4.93.x | v4 released March 2025. Required for Workers + Pages deployment, local dev, secrets management. | HIGH |
| TypeScript | TypeScript | 5.4+ | Required for Hono's type inference. `strict: true`. | HIGH |

---

## Key Libraries

### Validation logic (Cloudflare Worker)

```
npm install hono                          # API framework
npm install @supabase/supabase-js         # DB + auth client (Worker side)
npm install fast-levenshtein              # typo detection
```

**disposable-email-domains** — do NOT install the npm package; instead fetch the raw file from the GitHub repo and commit it as a static JSON (or use the `disposable-email-domains-js` npm package which wraps it):

```
npm install disposable-email-domains-js   # weekly-updated JS wrapper
```

The JSON is loaded once at Worker initialization into a `Set<string>` for O(1) domain lookup.

### Frontend (SvelteKit on Cloudflare Pages)

```
npm create svelte@latest dashboard
npm install @sveltejs/adapter-cloudflare
npm install tailwindcss @tailwindcss/vite
npm install @supabase/supabase-js         # auth + storage on browser side
```

### Dev tooling

```
npm install -D wrangler                   # Workers CLI (v4)
npm install -D typescript                 # TS 5.4+
npm install -D @cloudflare/vitest-pool-workers  # unit tests in Workers runtime
```

---

## DNS/MX Lookup Strategy

### Recommended: `node:dns` module (native Workers)

Cloudflare Workers support the Node.js `dns` module via the `nodejs_compat` compatibility flag. All `node:dns` functions are available **except** `lookup`, `lookupService`, and `resolve` (those throw "Not implemented"). `resolveMx()` is available.

**wrangler.toml configuration required:**

```toml
compatibility_flags = ["nodejs_compat"]
compatibility_date = "2024-09-23"
```

Setting `compatibility_date` to 2024-09-23 or later automatically enables `nodejs_compat_v2`.

**Implementation pattern:**

```typescript
import { promises as dns } from "node:dns";

async function hasMxRecord(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false; // NXDOMAIN or no MX = undeliverable
  }
}
```

Each `resolveMx()` call counts as **1 subrequest** against the free tier's 50 subrequest/request limit. Critically, **await time on DNS calls does NOT count toward the 10ms CPU budget** — only JavaScript execution time counts. This makes batch validation viable.

### Fallback: Cloudflare 1.1.1.1 DoH JSON API

If `node:dns` behaves unexpectedly in production, fall back to:

```typescript
async function hasMxRecord(domain: string): Promise<boolean> {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`,
    { headers: { Accept: "application/dns-json" } }
  );
  const data = await res.json() as { Status: number; Answer?: unknown[] };
  return data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0;
}
```

Both approaches route internally within Cloudflare's network — the DNS request never leaves CF infrastructure, so latency is minimal (~1–3ms).

### Subrequest budget awareness

Free tier: 50 subrequests per Worker invocation. For batch CSV validation, **do not validate one email per Worker request**. Instead:

- Accept the full CSV upload to Supabase Storage in one request
- Process validation in a Cloudflare Queue consumer (or batch endpoint) that handles N emails per invocation
- Each validation check = 1 DNS subrequest + potential Supabase write

Recommended: validate up to 40 emails per Worker invocation (leaves headroom for Supabase reads/writes).

---

## Disposable Email Lists

### Primary: `disposable-email-domains` (ivolo/disposable-email-domains)

- **URL:** https://github.com/disposable-email-domains/disposable-email-domains
- **Size:** ~5,000–6,000 domains (conservative, high-precision list)
- **License:** CC0 (unrestricted use)
- **Format:** One domain per line in `disposable_email_blocklist.conf`
- **NPM wrapper:** `disposable-email-domains-js` (v1.20.x, weekly updates)
- **Maintenance:** Community-maintained, 1,115+ commits, active since 2014
- **Usage in Workers:** Import as JSON/Set at module init for O(1) lookup. Bundle size impact is ~50–80 KB uncompressed — acceptable within 3 MB Worker limit.

### Secondary: `mailchecker` (FGRibreau/mailchecker)

- **URL:** https://github.com/FGRibreau/mailchecker
- **npm:** `mailchecker` v6.0.20
- **Coverage:** 55,000+ domains — broader but more false positives
- **Recommendation:** Use only for secondary check or if primary misses a provider. The larger Set increases startup/memory cost.

### Decision: Use `disposable-email-domains-js` as primary

The smaller, higher-precision list (~5k domains) is better for a B2B email marketing tool. False positives (rejecting a real domain) are more damaging than false negatives in this use case. If a domain is genuinely disposable but not on the list, MX lookup will still catch it if the domain has no mail server.

---

## What NOT to Use

| Technology | Reason to Avoid |
|-----------|----------------|
| **deep-email-validator** (npm) | Does SMTP verification internally — not compatible with Workers (no raw TCP). Overkill and wrong execution model. |
| **Cloudflare D1** (for this project) | Supabase is pre-decided. D1 would add complexity without benefit. Avoid mixing two DB systems. |
| **Cloudflare KV** (as primary DB) | Eventually consistent, key-value only. Not suitable for relational data (users, history, results). Use Supabase Postgres instead. |
| **Next.js** | React ecosystem overhead (~400+ KB gzipped JS for dashboards). SvelteKit is faster, smaller, and equally capable for this scope. |
| **Astro** | Good for content sites, not for interactive SaaS dashboards with real-time result tables, file uploads, and auth flows. |
| **Raw fetch to 8.8.8.8** (Google DoH) | Works, but 1.1.1.1 is Cloudflare's own resolver. Internal routing = lower latency. No reason to use a third-party resolver. |
| **SMTP verification (v1)** | Requires port 25 outbound which is blocked on Workers. Requires VPS. Explicitly out of scope. |
| **Cloudflare Queues for v1** | Adds architecture complexity. Batch endpoint approach is sufficient for MVP. Revisit if processing > 10k emails/job. |
| **`check-disposable-email` npm** | Fetches domain list from GitHub at runtime — broken in Workers (no cold CDN fetching at startup), and introduces network dependency per validation. Use static bundled list instead. |

---

## Open Questions

1. **CSV processing boundary**: Should CSV parsing happen in the Worker or in the browser (pre-upload)? Browser-side parsing reduces Worker subrequest pressure and lets the user preview before submitting. Decision needed before Phase 1.

2. **Rate limiting strategy**: Free tier is 100k req/day total. A single user uploading a 5k-email CSV creates 5k DNS subrequests internally. Need to decide per-account daily quota before opening to multiple users.

3. **Supabase project inactivity pause**: Free tier pauses projects after 7 days of inactivity. This is fine for internal use (tool is used regularly) but is a risk for early SaaS. Mitigation: a scheduled Cloudflare Worker cron that pings Supabase once a day.

4. **`disposable-email-domains-js` bundle impact**: At ~50–80 KB, it fits the 3 MB Worker limit easily, but it must be bundled at deploy time (not fetched at runtime). Verify Wrangler bundles it correctly with `wrangler deploy --dry-run`.

5. **node:dns resolveMx reliability in production**: Community reports confirm it works, but it's technically marked as "not officially documented for production use" in some older threads. If flaky, swap to the DoH JSON API fallback — the code change is minimal (as shown above).

---

## Sources

- Cloudflare Workers `node:dns` docs: https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/
- Cloudflare 1.1.1.1 DoH JSON API: https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Hono framework for Workers: https://hono.dev/docs/getting-started/cloudflare-workers
- Hono latest on npm: https://www.npmjs.com/package/hono (v4.12.21)
- @supabase/supabase-js npm: v2.106.0 (May 2026)
- disposable-email-domains: https://github.com/disposable-email-domains/disposable-email-domains
- disposable-email-domains-js: https://www.npmjs.com/package/disposable-email-domains-js
- mailchecker: https://github.com/FGRibreau/mailchecker (v6.0.20, 55k+ domains)
- SvelteKit adapter-cloudflare: https://svelte.dev/docs/kit/adapter-cloudflare
- Cloudflare Pages SvelteKit guide: https://developers.cloudflare.com/pages/framework-guides/deploy-a-svelte-kit-site/
- Wrangler v4: https://developers.cloudflare.com/changelog/post/2025-03-13-wrangler-v4/
- CF Workers CPU vs wall time: https://developers.cloudflare.com/changelog/2025-04-09-workers-timing/
- Supabase free tier limits: https://supabase.com/pricing
