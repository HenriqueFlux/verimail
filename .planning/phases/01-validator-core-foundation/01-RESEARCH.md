# Phase 1: Validator Core + Foundation - Research

**Researched:** 2026-05-21
**Domain:** TypeScript validation engine, Cloudflare Workers, Supabase Auth + DB, DNS-over-HTTPS, GitHub Actions
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Result shape: `{ email: string, status: 'valid' | 'invalid' | 'risky', score: number, reason: string | null, suggestion?: string }`
- `reason` is `null` for valid; values: `syntax` / `no-domain` / `no-mx` / `disposable` / `role` / `catch-all` / `typo`
- Score model: valid=0, catch-all=50, invalid=100 (ALL non-catch-all failures = 100)
- Disposable list: bundle as `Set<string>` at deploy-time, package `disposable-email-domains-js` (~60k)
- Disposable update (INF-03): GitHub Action weekly — `npm update disposable-email-domains-js`, commit if diff, redeploy
- Catch-all detection: static curated list + MX heuristic (own MX server that is not Gmail/Outlook/Yahoo/ProtonMail/iCloud → risky)
- Typo detection: `@zootools/email-spell-checker` (1.9KB TS, ZooTools — includes UOL, BOL, Terra for BR)
- Stack: Cloudflare Workers (API + validation), Supabase (auth, DB, storage), TypeScript throughout
- DNS lookup: fetch to DNS-over-HTTPS (8.8.8.8 or 1.1.1.1)

### Claude's Discretion
- Estrutura de arquivos/módulos do validation engine (como organizar os checks internamente)
- Ordem exata dos checks (ex: sintaxe antes de DNS antes de disposable)
- Implementação do DNS lookup via fetch para DNS-over-HTTPS (qual endpoint: 8.8.8.8 vs 1.1.1.1)
- Lista de domínios populares para o typo checker (gmail, hotmail, yahoo, uol, hotmail.com.br etc.)
- Lista inicial de role-based prefixes (info, noreply, contato, sac, atendimento, faturamento, admin, suporte, vendas, financeiro etc.)
- Schema Supabase exato (campos, tipos, índices)
- Configuração do Supabase Auth (e-mail/senha, confirmação de e-mail: sim ou não para v1)
- Implementação do cron keep-alive (GitHub Action ping vs Supabase Edge Function vs CF Cron Trigger)

### Deferred Ideas (OUT OF SCOPE)
- Nenhuma ideia fora de escopo surgiu durante a discussão
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | Usuário pode criar conta com e-mail e senha | Supabase Auth email/password signup — `supabase.auth.signUp()` |
| AUTH-02 | Sessão persiste após fechar e reabrir o navegador | Supabase Auth `persistSession: true` default; localStorage-based session in browser |
| AUTH-03 | Usuário pode fazer logout de qualquer página | `supabase.auth.signOut()` — invalidates session token |
| VAL-01 | Sistema valida sintaxe do e-mail (formato RFC, caracteres proibidos) | Custom regex RFC 5321: local-part + domain, 254-char total, 64-char local-part limit |
| VAL-02 | Sistema verifica existência do domínio no DNS | DoH fetch to `1.1.1.1/dns-query?type=A` OR `type=MX` (NXDOMAIN = status 2 in DoH response) |
| VAL-03 | Sistema verifica registro MX do domínio | DoH fetch `type=MX`; `Answer` array non-empty = has MX |
| VAL-04 | Sistema detecta domínios descartáveis (≥60k domínios) | `disposable-email-domains-js` v1.11+, bundled as `Set<string>` at deploy |
| VAL-05 | Sistema detecta e-mails role-based | Hardcoded prefix `Set<string>` — info, admin, noreply, contato, sac, atendimento, etc. |
| VAL-06 | Sistema detecta typos em domínios comuns e sugere correção | `@zootools/email-spell-checker` — `run({email})` returns `{full, domain, address}` or `null` |
| VAL-07 | Sistema detecta domínios catch-all e marca como "risky" | 2-layer: static curated list + MX heuristic (non-shared-MX provider → risky) |
| VAL-08 | Sistema atribui score de risco 0–100 por e-mail | Deterministic from status: valid=0, risky=50, invalid=100 |
| VAL-09 | Sistema registra o motivo de reprovação por e-mail | First-failing-check reason field on the result object |
| INF-02 | Sistema mantém Supabase ativo via cron ping | GitHub Actions weekly cron hitting Supabase REST `/rest/v1/` endpoint |
| INF-03 | Lista de domínios descartáveis tem mecanismo de atualização periódica | GitHub Actions weekly: `npm update disposable-email-domains-js` + diff check + wrangler redeploy |
</phase_requirements>

---

## Summary

Phase 1 builds the validation engine as a pure TypeScript module and the infrastructure foundation (Supabase project, schema, auth, keep-alive cron). The validation engine is a fail-fast pipeline of in-memory checks followed by a single network call (DoH MX lookup). It must be designed to be imported by both the single-email HTTP handler and the bulk Queue consumer in later phases.

The technical work splits into two independent workstreams: (a) the pure engine — entirely unit-testable in Node.js without any Cloudflare APIs, no CF SDK needed; and (b) infrastructure — Supabase project creation, schema migration, auth configuration, and keep-alive cron. These can be parallelized.

The biggest implementation decision is the catch-all heuristic: without SMTP probing, the approach is "if the domain's MX record points to a shared email provider (Gmail, Outlook, Yahoo, ProtonMail, iCloud), mark as valid; otherwise mark as risky." This is the CONTEXT.md decision and the research confirms it is the right pattern given Workers' no-TCP constraint.

**Primary recommendation:** Build the validator engine as a standalone `src/engine/` directory with zero CF-specific imports. Test it with plain Vitest in Node mode. Wire it into CF Worker only at the HTTP handler level. This keeps tests fast and the engine portable.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@zootools/email-spell-checker` | latest (1.x) | Typo detection + suggestion | 1.9KB, 0 deps, TypeScript-native, includes POPULAR_DOMAINS extendable with BR domains |
| `disposable-email-domains-js` | 1.11+ | Disposable domain list | Wraps upstream 60k-domain list, updated weekly by maintainer, CC0 |
| `@supabase/supabase-js` | 2.106.x | Auth client (browser) + DB client (Worker) | Official SDK, Works in CF Workers via HTTP, no persistent connections |
| `wrangler` | 4.x | CF Workers CLI, deploy, secrets, cron triggers | Required for Workers+Pages deployment; v4 supports wrangler.jsonc |
| `vitest` | 2.x+ | Unit testing | Native ESM, fast, no transpile overhead; used without CF pool for engine tests |
| `typescript` | 5.4+ | Language | Required for Hono inference in Phase 2; engine module typed strictly |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@cloudflare/vitest-pool-workers` | 0.9.x | Integration tests inside Workers runtime | Only for tests that need CF bindings/env; NOT needed for engine unit tests |
| `supabase` (CLI) | latest | Schema migrations, local dev, `db push` | Running `supabase migration new` + `supabase db push` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@zootools/email-spell-checker` | `fast-levenshtein` + manual list | Extra code, no maintenance; email-spell-checker is purpose-built and smaller |
| `disposable-email-domains-js` | `mailchecker` (55k) | mailchecker is larger but noisier (more false positives); bad for B2B tool |
| DoH fetch to `1.1.1.1` | `node:dns` resolveMx | Both work; DoH fetch is more explicit, no `nodejs_compat` flag required, same latency (~1-3ms internal CF routing) |
| GitHub Action for keep-alive | CF Cron Trigger | CF Cron free tier: 5 triggers/account, 3/Worker — save these slots for future use; GH Action uses 0 CF budget |

**Installation:**
```bash
npm install @zootools/email-spell-checker disposable-email-domains-js @supabase/supabase-js
npm install -D wrangler typescript vitest @cloudflare/vitest-pool-workers
npm install -g supabase
```

---

## Architecture Patterns

### Recommended Project Structure

```
verimail/
├── src/
│   ├── engine/              # Pure TS — zero CF imports
│   │   ├── index.ts         # validateEmail() — main export
│   │   ├── checks/
│   │   │   ├── syntax.ts    # RFC 5321 regex, pure function
│   │   │   ├── role.ts      # prefix Set lookup, pure function
│   │   │   ├── disposable.ts# domain Set lookup, pure function
│   │   │   ├── typo.ts      # email-spell-checker wrapper
│   │   │   ├── mx.ts        # DoH fetch, async — only CF-aware file
│   │   │   └── catchall.ts  # heuristic: curated list + MX provider check
│   │   ├── data/
│   │   │   ├── role-prefixes.ts     # Set<string> of role prefixes
│   │   │   ├── catchall-domains.ts  # Set<string> of known catch-all domains
│   │   │   └── known-mx-providers.ts# Set<string> of shared MX providers
│   │   └── types.ts         # ValidationResult, CheckResult interfaces
│   ├── worker.ts            # CF Worker entry — imports engine, handles HTTP (Phase 2)
│   └── cron.ts              # CF scheduled handler — keep-alive ping (INF-02)
├── supabase/
│   ├── migrations/
│   │   └── 20260521000000_initial_schema.sql
│   └── config.toml
├── tests/
│   ├── engine/              # plain Vitest (Node pool)
│   │   ├── syntax.test.ts
│   │   ├── role.test.ts
│   │   ├── disposable.test.ts
│   │   ├── typo.test.ts
│   │   ├── mx.test.ts       # fetch mocked via vi.stubGlobal
│   │   ├── catchall.test.ts
│   │   └── validate-email.test.ts
│   └── vitest.config.ts     # no CF pool — standard Vitest Node pool
├── wrangler.jsonc
├── tsconfig.json
└── package.json
```

### Pattern 1: Fail-Fast Validation Pipeline

**What:** Run checks in order of cost. Pure in-memory checks first (CPU only), DNS fetch last. Return on first failure. Only valid emails reach the DNS check.

**When to use:** Always — this order is correct for CPU budget and latency.

**Pipeline order:**
1. Syntax check (pure, ~0.01ms) → returns `{ status: 'invalid', reason: 'syntax', score: 100 }`
2. Role-based check (pure, ~0.01ms) → returns `{ status: 'invalid', reason: 'role', score: 100 }`
3. Disposable check (pure, ~0.01ms Set lookup) → returns `{ status: 'invalid', reason: 'disposable', score: 100 }`
4. Typo check (pure, ~0.5ms Sift3 distance) → returns `{ status: 'invalid', reason: 'typo', score: 100, suggestion: 'gmail.com' }`
5. Catch-all curated list check (pure, ~0.01ms) → returns `{ status: 'risky', reason: 'catch-all', score: 50 }`
6. MX / domain check (async, ~50-300ms wall, ~1ms CPU) → `no-domain` (NXDOMAIN) or `no-mx` (NXDOMAIN for MX)
7. MX provider heuristic (pure, uses MX result from step 6) → `{ status: 'risky', reason: 'catch-all', score: 50 }` if not shared provider

**Example:**
```typescript
// Source: src/engine/index.ts
import type { ValidationResult } from './types.js';
import { checkSyntax } from './checks/syntax.js';
import { checkRole } from './checks/role.js';
import { checkDisposable } from './checks/disposable.js';
import { checkTypo } from './checks/typo.js';
import { checkCatchAllCurated } from './checks/catchall.js';
import { checkMx } from './checks/mx.js';

export async function validateEmail(email: string): Promise<ValidationResult> {
  const syntaxResult = checkSyntax(email);
  if (!syntaxResult.valid) {
    return { email, status: 'invalid', score: 100, reason: 'syntax' };
  }

  const domain = email.split('@')[1].toLowerCase();

  const roleResult = checkRole(email);
  if (!roleResult.valid) {
    return { email, status: 'invalid', score: 100, reason: 'role' };
  }

  if (checkDisposable(domain)) {
    return { email, status: 'invalid', score: 100, reason: 'disposable' };
  }

  const typoResult = checkTypo(email);
  if (typoResult.suggestion) {
    return { email, status: 'invalid', score: 100, reason: 'typo', suggestion: typoResult.suggestion };
  }

  if (checkCatchAllCurated(domain)) {
    return { email, status: 'risky', score: 50, reason: 'catch-all' };
  }

  const mxResult = await checkMx(domain);
  if (!mxResult.hasDomain) {
    return { email, status: 'invalid', score: 100, reason: 'no-domain' };
  }
  if (!mxResult.hasMx) {
    return { email, status: 'invalid', score: 100, reason: 'no-mx' };
  }
  if (mxResult.isCatchAllHeuristic) {
    return { email, status: 'risky', score: 50, reason: 'catch-all' };
  }

  return { email, status: 'valid', score: 0, reason: null };
}
```

### Pattern 2: DoH Fetch for MX Lookup

**What:** Use Cloudflare's 1.1.1.1 DoH JSON API via `fetch()`. No `nodejs_compat` flag needed. Works in CF Workers and in Node.js tests (with fetch mocked).

**DoH response shape:**
- `Status: 0` = NOERROR (domain exists)
- `Status: 3` = NXDOMAIN (domain does not exist)
- `Answer` array present and non-empty = has MX records

**MX provider heuristic:** Extract the MX exchange hostname (e.g., `aspmx.l.google.com`). If it contains a known shared-provider pattern, the domain is NOT catch-all. If the MX points to the domain's own server (or an unknown provider), mark as risky/catch-all.

```typescript
// Source: src/engine/checks/mx.ts
const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

// Shared MX providers — domains using these are NOT catch-all by heuristic
const SHARED_MX_PROVIDERS: readonly string[] = [
  'google.com', 'googlemail.com',   // Gmail / Google Workspace
  'outlook.com', 'hotmail.com', 'protection.outlook.com', // Microsoft 365
  'yahoo.com', 'yahoodns.net',      // Yahoo
  'protonmail.ch', 'proton.me',     // ProtonMail
  'icloud.com', 'apple.com',        // iCloud
  'zoho.com',                       // Zoho
  'amazonses.com',                  // Amazon SES (transactional, not catch-all)
  'sendgrid.net', 'mailgun.org',    // ESPs
  'mimecast.com',                   // Mimecast
  'pphosted.com',                   // Proofpoint
];

export interface MxResult {
  hasDomain: boolean;
  hasMx: boolean;
  isCatchAllHeuristic: boolean;
  mxHosts: string[];
}

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
      // NXDOMAIN
      return { hasDomain: false, hasMx: false, isCatchAllHeuristic: false, mxHosts: [] };
    }

    const answers = data.Answer ?? [];
    const mxHosts = answers.map(a => a.data.toLowerCase().replace(/^\d+\s+/, '').replace(/\.$/, ''));

    if (mxHosts.length === 0) {
      return { hasDomain: true, hasMx: false, isCatchAllHeuristic: false, mxHosts: [] };
    }

    const usesSharedProvider = mxHosts.some(host =>
      SHARED_MX_PROVIDERS.some(provider => host.endsWith(provider))
    );

    return {
      hasDomain: true,
      hasMx: true,
      isCatchAllHeuristic: !usesSharedProvider,
      mxHosts,
    };
  } catch {
    // Network error → treat as domain not found to avoid false positives
    return { hasDomain: false, hasMx: false, isCatchAllHeuristic: false, mxHosts: [] };
  }
}
```

### Pattern 3: Disposable Domain Set (bundled at deploy)

**What:** Import the `disposable-email-domains-js` package, which exposes `isDisposableEmailDomain(domain: string): boolean`. At module load time it internally hydrates a Set from its bundled list. No runtime fetching.

```typescript
// Source: src/engine/checks/disposable.ts
import { isDisposableEmailDomain } from 'disposable-email-domains-js';

export function checkDisposable(domain: string): boolean {
  return isDisposableEmailDomain(domain);
}
```

**Bundle impact:** The package bundles ~60k domains as a static data structure. Estimated 200-400KB uncompressed, well within the 3MB CF Worker bundle limit. Wrangler tree-shakes unused code but not static data — no issue here.

**Verify at deploy time:** `npx wrangler deploy --dry-run` to confirm bundle size stays under 3MB.

### Pattern 4: Typo Detection with @zootools/email-spell-checker

**What:** `run({email})` returns `null` when no typo detected, or `{ address, domain, full }` when a suggestion exists. Extend `POPULAR_DOMAINS` with Brazilian providers.

```typescript
// Source: src/engine/checks/typo.ts
import emailSpellChecker from '@zootools/email-spell-checker';

// Brazilian domains not in the default list
const BR_DOMAINS = [
  'uol.com.br', 'bol.com.br', 'terra.com.br', 'ig.com.br',
  'r7.com', 'globomail.com', 'hotmail.com.br', 'yahoo.com.br',
  'outlook.com.br',
];

const EXTENDED_DOMAINS = [...emailSpellChecker.POPULAR_DOMAINS, ...BR_DOMAINS];

export interface TypoResult {
  suggestion: string | null;
}

export function checkTypo(email: string): TypoResult {
  const result = emailSpellChecker.run({
    email,
    domains: EXTENDED_DOMAINS,
  });
  return { suggestion: result ? result.domain : null };
}
```

**Return type:** When a typo is found, `suggestion` is the corrected domain (e.g., `'gmail.com'`). The `suggestion` field in the final `ValidationResult` should be the full corrected email (`result.full`), not just the domain.

### Pattern 5: Supabase Client in CF Worker

**Two client modes:**
1. **User-scoped** (API Worker, HTTP handlers): Reads Bearer token from `Authorization` header, creates client with that token → respects RLS
2. **Service role** (Consumer Worker / cron): Uses `SUPABASE_SERVICE_ROLE_KEY` secret → bypasses RLS

```typescript
// User-scoped (API Worker) — for HTTP handlers verifying user requests
import { createClient } from '@supabase/supabase-js';

function createUserClient(env: Env, authToken: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${authToken}` },
    },
    auth: { persistSession: false },  // Workers are stateless
  });
}

// Service role (Consumer Worker / cron) — bypasses RLS
function createServiceClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
```

**JWT verification:** Call `supabase.auth.getUser(token)` — this makes a request to Supabase Auth server and validates the token server-side. This is more secure than manual JWT decoding (avoids key management). Extract token from `Authorization: Bearer <token>` header.

```typescript
// Middleware pattern for CF Worker HTTP handler
async function requireAuth(request: Request, env: Env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7);
  const adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) return null;
  return { user, token };
}
```

### Pattern 6: Supabase Keep-Alive Cron

**Recommended: GitHub Actions** (saves CF cron trigger slots; GH Actions free minutes ample for 1 curl/week)

```yaml
# .github/workflows/supabase-keepalive.yml
name: Supabase Keep-Alive

on:
  schedule:
    - cron: '0 12 * * 3'   # Every Wednesday at 12:00 UTC (mid-week, 3.5 days between)
  workflow_dispatch:         # Manual trigger for testing

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase REST API
        run: |
          curl -sf -X GET \
            "${{ secrets.SUPABASE_URL }}/rest/v1/" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

**Required GitHub secrets:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`

**Why Wednesday noon UTC:** Ping on Wednesday means the project is touched on days 0, 3.5 — never reaching the 7-day threshold. Alternative: `0 0 * * 1,4` (Monday and Thursday midnight).

**Alternative: CF Cron Trigger** — valid, but uses 1 of 5 free cron slots per account. Prefer GH Actions to preserve CF cron budget for future phases.

### Pattern 7: Supabase Schema Migration

```bash
# One-time setup
supabase init                    # creates supabase/ directory
supabase login
supabase link --project-ref <ref>
supabase migration new initial_schema
# Edit supabase/migrations/TIMESTAMP_initial_schema.sql
supabase db push                 # applies to remote
```

### Anti-Patterns to Avoid

- **Never load disposable list per-request from URL.** Load it once at module initialization (it's bundled). See WORKERS-2 pitfall.
- **Never run bulk validation inline in HTTP handler.** Engine is fine for single email in HTTP handler; bulk always goes through Queue (Phase 2).
- **Never import CF Worker APIs (`env`, `Env` type) inside `src/engine/`.** Engine must be testable in plain Node.js Vitest without any CF runtime.
- **Never use `supabase.auth.getSession()` server-side.** Use `auth.getUser(token)` — getSession reads cached data, getUser validates server-side.
- **Never hardcode Supabase keys in source.** Always use `wrangler secret put` for Workers, GitHub Secrets for Actions.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Typo/fuzzy domain matching | Custom Levenshtein + domain list | `@zootools/email-spell-checker` | Sift3 algorithm, 39+ domains, BR TLDs, 0 deps, 1.9KB — custom list maintenance is ongoing |
| Disposable domain detection | Manually curated list | `disposable-email-domains-js` | 60k+ domains maintained weekly upstream; false negatives if you hand-roll |
| Auth token lifecycle | JWT decode + verify manually | `supabase.auth.getUser(token)` | Handles token expiry, rotation, revocation — manual decode misses revoked tokens |
| Schema migrations | Raw SQL scripts committed manually | `supabase migration new` + `supabase db push` | Migration history table, idempotent, rollback support |

**Key insight:** The engine's complexity is in the heuristics (catch-all detection, typo detection), not the infrastructure plumbing. Don't spend time on tooling — invest it in the domain logic.

---

## Common Pitfalls

### Pitfall 1: Typo Check Triggering on Intentional Non-Standard Domains

**What goes wrong:** A corporate domain like `empresa.com.br` gets flagged as a typo for `empresa.com`. The typo checker uses string distance — short similar domains false-positive.

**Why it happens:** The Sift3 algorithm has a distance threshold. Company domains that are 1-2 characters from a popular domain trigger suggestions.

**How to avoid:** Only act on typo suggestions when the distance is for clearly mistyped common domains. The `email-spell-checker` library's default threshold is calibrated for common mistakes (gamil, gmaik, hotmal). Test with your actual expected inputs. If false positives appear, the `domains` parameter can be tuned.

**Warning signs:** Corporate domains like `empresa.com.br` getting `suggestion: 'empresa.com'` in tests.

### Pitfall 2: MX Heuristic Over-Flagging Legitimate B2B Domains

**What goes wrong:** A company with its own mail server (own MX like `mail.empresa.com.br`) gets flagged as catch-all risky even though the mailbox is real.

**Why it happens:** The heuristic is conservative by design — "own MX server = potentially catch-all." This is correct behavior but users must understand it.

**How to avoid:** Document clearly in UI that `risky/catch-all` means "cannot verify mailbox exists, domain accepts mail." The score 50 lets users decide. Don't change the heuristic — it's the right call for the product promise.

**Warning signs:** Users complaining that corporate emails are flagged as risky. This is expected behavior — educate via UI copy.

### Pitfall 3: DoH Response Parsing — MX Data Field Format

**What goes wrong:** The `data` field in a DoH MX answer includes a priority number: `"10 aspmx.l.google.com."` — not just the hostname. String comparisons against provider patterns fail if you don't strip the priority.

**Why it happens:** The DoH JSON API returns the raw MX RDATA which includes priority + exchange in one string.

**How to avoid:** Parse each answer's `data` field: split on first space, take the second part, strip trailing dot.
```typescript
// Parse "10 aspmx.l.google.com." → "aspmx.l.google.com"
const mxHost = answer.data.split(' ')[1].replace(/\.$/, '').toLowerCase();
```

**Warning signs:** All domains being flagged as catch-all even when they use Gmail/Outlook.

### Pitfall 4: Supabase Client Created with `persistSession: true` in Worker

**What goes wrong:** Workers are stateless — there is no persistent storage for sessions between invocations. Creating a client without `persistSession: false` causes the SDK to attempt localStorage operations that don't exist in the Workers runtime, throwing errors.

**Why it happens:** `@supabase/supabase-js` defaults assume a browser environment.

**How to avoid:** Always pass `auth: { persistSession: false }` when creating Supabase clients inside CF Workers.

**Warning signs:** `localStorage is not defined` or similar errors in Worker logs.

### Pitfall 5: Disposable Check Case Sensitivity

**What goes wrong:** `isDisposableEmailDomain('Mailinator.COM')` returns `false` while `isDisposableEmailDomain('mailinator.com')` returns `true`.

**Why it happens:** The Set is lowercase; domain from email may be mixed case if not normalized.

**How to avoid:** Always lowercase the domain before all checks. Normalize at the entry point of `validateEmail()`:
```typescript
const domain = email.split('@')[1]?.toLowerCase();
```

### Pitfall 6: Weekly GH Action Not Triggering After 60 Days

**What goes wrong:** GitHub disables scheduled workflows for repos with no activity in 60 days.

**Why it happens:** GitHub's inactivity policy for scheduled workflows.

**How to avoid:** Add `workflow_dispatch:` trigger so the workflow stays active (as shown in pattern above). Also: any commit to the repo within 60 days resets the timer. Since the INF-03 disposable list update is a weekly commit, this keeps the keep-alive action alive automatically.

---

## Code Examples

Verified patterns from official sources:

### RFC 5321 Syntax Check

```typescript
// Source: RFC 5321 §4.1.2 + verified against common test cases
// Local-part: [a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]
// Domain: labels separated by dots, each 1-63 chars, valid chars [a-zA-Z0-9-]
// Total length: ≤254 chars; local-part: ≤64 chars

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export function checkSyntax(email: string): { valid: boolean } {
  if (email.length > 254) return { valid: false };
  if (!email.includes('@')) return { valid: false };
  return { valid: EMAIL_REGEX.test(email) };
}
```

### Role-Based Prefixes (initial list)

```typescript
// Source: Claude's Discretion — covers global + Brazilian role prefixes
export const ROLE_PREFIXES = new Set([
  // Global
  'info', 'admin', 'administrator', 'noreply', 'no-reply', 'support',
  'help', 'contact', 'sales', 'marketing', 'billing', 'abuse',
  'postmaster', 'webmaster', 'hostmaster', 'root', 'security',
  'legal', 'privacy', 'hr', 'careers', 'jobs', 'team', 'hello',
  // Brazilian
  'contato', 'atendimento', 'sac', 'suporte', 'vendas', 'faturamento',
  'financeiro', 'juridico', 'rh', 'cadastro', 'cobranca', 'ouvidoria',
  'nfe', 'fiscal', 'comercial', 'operacional', 'recepcao',
]);

export function checkRole(email: string): { valid: boolean } {
  const local = email.split('@')[0].toLowerCase();
  return { valid: !ROLE_PREFIXES.has(local) };
}
```

### Initial Curated Catch-All Domains List

```typescript
// Source: Claude's Discretion — known corporate domains that operate catch-all
// Update manually when users report false negatives
export const KNOWN_CATCHALL_DOMAINS = new Set([
  // Large Brazilian corporate catch-alls (commonly reported)
  'embratel.com.br',
  'petrobras.com.br',
  // Add more as discovered via user feedback
  // Keep this list small and high-confidence only
]);
```

Note: This curated list starts small. The MX heuristic carries the weight. The list grows over time via user feedback.

### Supabase Schema (Full SQL)

```sql
-- Source: Architecture research + CONTEXT.md decisions
-- Run via: supabase/migrations/20260521000000_initial_schema.sql

-- Validation jobs
CREATE TABLE public.jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  source           TEXT NOT NULL CHECK (source IN ('csv', 'manual')),
  filename         TEXT,                        -- original CSV filename (nullable for manual)
  total_emails     INTEGER NOT NULL DEFAULT 0,
  processed_emails INTEGER NOT NULL DEFAULT 0,
  valid_count      INTEGER,
  invalid_count    INTEGER,
  risky_count      INTEGER,
  input_path       TEXT,                        -- Supabase Storage path (csv source only)
  result_path      TEXT,                        -- Supabase Storage path (cleaned CSV output)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);

-- Per-email validation results
CREATE TABLE public.validation_results (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('valid', 'invalid', 'risky')),
  score            SMALLINT NOT NULL CHECK (score IN (0, 50, 100)),
  reason           TEXT CHECK (reason IN (
                     'syntax', 'no-domain', 'no-mx', 'disposable',
                     'role', 'catch-all', 'typo'
                   )),
  suggestion       TEXT,                        -- typo correction (e.g. 'gmail.com')
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for query patterns
CREATE INDEX idx_jobs_user_id     ON public.jobs(user_id);
CREATE INDEX idx_jobs_status      ON public.jobs(status);
CREATE INDEX idx_results_job_id   ON public.validation_results(job_id);
CREATE INDEX idx_results_job_status ON public.validation_results(job_id, status);

-- Row Level Security
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_results ENABLE ROW LEVEL SECURITY;

-- Users see only their own jobs
CREATE POLICY "users_own_jobs" ON public.jobs
  FOR ALL USING (auth.uid() = user_id);

-- Users see only results for their jobs
CREATE POLICY "users_own_results" ON public.validation_results
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  );
```

### Wrangler Config (wrangler.jsonc)

```jsonc
// Source: CF Workers docs — recommended format for Wrangler v4
{
  "name": "verimail-worker",
  "main": "src/worker.ts",
  "compatibility_date": "2024-09-23",
  // nodejs_compat NOT needed if using DoH fetch approach for DNS
  // Add it only if using node:dns resolveMx
  "compatibility_flags": [],
  "triggers": {
    "crons": []   // Keep-alive handled by GH Actions; no cron triggers needed Phase 1
  }
}
```

### Vitest Config for Engine Tests (Node pool, no CF runtime)

```typescript
// Source: Vitest docs — standard config, no CF pool needed
// tests/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/engine/**/*.test.ts'],
    environment: 'node',
    // NO @cloudflare/vitest-pool-workers pool here
    // Engine tests mock fetch via vi.stubGlobal('fetch', mockFn)
  },
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node:dns` resolveMx | DoH fetch to 1.1.1.1 | Available since Workers launch | More explicit, no compat flag, same latency via CF internal routing |
| CF Queues (paid only) | CF Queues on free plan | February 2026 | Bulk processing viable on free tier — architectural foundation for Phase 2 |
| Wrangler v3 TOML | Wrangler v4 JSONC recommended | March 2025 | `wrangler.jsonc` is now the preferred config format; TOML still works |
| `@supabase/supabase-js` v1 | v2.106.x | — | v2 is stable, typed, HTTP-based (no persistent connections — CF Workers compatible) |

**Deprecated/outdated:**
- `deep-email-validator`: Does SMTP internally — incompatible with Workers, do not use
- `check-disposable-email`: Fetches list from GitHub at runtime — broken in Workers cold starts

---

## Open Questions

1. **Typo detection false positive rate with BR corporate domains**
   - What we know: `email-spell-checker` is calibrated for consumer email typos
   - What's unclear: Whether corporate `.com.br` domains trigger false suggestions against `.com` equivalents
   - Recommendation: Build a test suite with real BR corporate domains before shipping; tune `domains` array if needed

2. **`disposable-email-domains-js` exact export API**
   - What we know: exports `isDisposableEmailDomain(domain)` and `isDisposableEmail(email)` → boolean
   - What's unclear: Whether it works as a pure ESM import in CF Workers without bundling issues
   - Recommendation: `wrangler deploy --dry-run` in Wave 0 to confirm bundle compatibility; fallback is importing the raw JSON list directly

3. **Supabase Auth — email confirmation for v1**
   - What we know: Supabase Auth supports disabling email confirmation in project settings
   - What's unclear: Best choice for v1 internal use (confirmation adds friction; skip is fine for internal tool)
   - Recommendation: Disable email confirmation in Supabase Auth settings for v1 (Auth → Email → confirm email = OFF)

4. **Catch-all heuristic false positive rate on custom MX servers**
   - What we know: The heuristic is conservative — any non-shared-provider MX = risky
   - What's unclear: Real-world false positive rate among BR B2B lists
   - Recommendation: Accept it as a known limitation; document in UI; refine `SHARED_MX_PROVIDERS` list based on feedback

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | `tests/vitest.config.ts` |
| Quick run command | `npx vitest run tests/engine` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VAL-01 | Syntax validation: valid emails pass, invalid fail | unit | `npx vitest run tests/engine/syntax.test.ts` | Wave 0 |
| VAL-01 | Edge cases: `user+tag@domain.com`, subdomain, hyphen | unit | same | Wave 0 |
| VAL-02 | Domain check: NXDOMAIN → `no-domain` reason | unit (fetch mocked) | `npx vitest run tests/engine/mx.test.ts` | Wave 0 |
| VAL-03 | MX check: no MX record → `no-mx` reason | unit (fetch mocked) | same | Wave 0 |
| VAL-04 | Disposable: `mailinator.com` → invalid/disposable | unit | `npx vitest run tests/engine/disposable.test.ts` | Wave 0 |
| VAL-05 | Role-based: `info@`, `sac@`, `contato@` → invalid/role | unit | `npx vitest run tests/engine/role.test.ts` | Wave 0 |
| VAL-06 | Typo: `gamil.com` → suggestion `gmail.com` | unit | `npx vitest run tests/engine/typo.test.ts` | Wave 0 |
| VAL-07 | Catch-all heuristic: own MX → risky/catch-all | unit (fetch mocked MX) | `npx vitest run tests/engine/catchall.test.ts` | Wave 0 |
| VAL-07 | Catch-all curated: known domain → risky/catch-all | unit | same | Wave 0 |
| VAL-08 | Score: valid=0, risky=50, invalid=100 | unit (integration via validateEmail) | `npx vitest run tests/engine/validate-email.test.ts` | Wave 0 |
| VAL-09 | Reason field: first failing check returned | unit (integration) | same | Wave 0 |
| AUTH-01 | Supabase signUp creates user | manual (Supabase dashboard) | N/A — manual | N/A |
| AUTH-02 | Session persists after page reload | manual (browser test) | N/A — manual | N/A |
| AUTH-03 | signOut invalidates session | manual (browser test) | N/A — manual | N/A |
| INF-02 | Keep-alive ping reaches Supabase | manual (trigger workflow_dispatch) | N/A — manual | N/A |
| INF-03 | Weekly update: new package version → commit | manual (run GH Action, verify) | N/A — manual | N/A |

### Pure vs Network-Dependent Checks

| Check | Type | Network Call | How to Test |
|-------|------|-------------|-------------|
| Syntax | Pure | None | Direct unit test |
| Role-based | Pure | None | Direct unit test |
| Disposable | Pure (in-memory Set) | None | Direct unit test |
| Typo | Pure (Sift3 in-memory) | None | Direct unit test |
| Catch-all curated | Pure (in-memory Set) | None | Direct unit test |
| MX lookup | Async | DoH fetch | Mock `fetch` via `vi.stubGlobal` |
| MX heuristic | Pure (uses MX result) | None | Test with pre-fetched MX data |

### How to Mock DoH Fetch in Tests

```typescript
// tests/engine/mx.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkMx } from '../../src/engine/checks/mx.js';

describe('checkMx', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns hasMx=true for domain with Gmail MX', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        Status: 0,
        Answer: [{ data: '10 aspmx.l.google.com.' }],
      }),
    } as Response);

    const result = await checkMx('example.com');
    expect(result.hasDomain).toBe(true);
    expect(result.hasMx).toBe(true);
    expect(result.isCatchAllHeuristic).toBe(false); // Gmail = shared provider
  });

  it('returns isCatchAllHeuristic=true for own MX server', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        Status: 0,
        Answer: [{ data: '10 mail.empresa.com.br.' }],
      }),
    } as Response);

    const result = await checkMx('empresa.com.br');
    expect(result.isCatchAllHeuristic).toBe(true);
  });

  it('returns NXDOMAIN for nonexistent domain', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ Status: 3 }),  // NXDOMAIN
    } as Response);

    const result = await checkMx('notareal-domain-xyz.com');
    expect(result.hasDomain).toBe(false);
  });
});
```

### Sampling Rate

- **Per task commit:** `npx vitest run tests/engine`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/engine/syntax.test.ts` — covers VAL-01
- [ ] `tests/engine/role.test.ts` — covers VAL-05
- [ ] `tests/engine/disposable.test.ts` — covers VAL-04
- [ ] `tests/engine/typo.test.ts` — covers VAL-06
- [ ] `tests/engine/mx.test.ts` — covers VAL-02, VAL-03
- [ ] `tests/engine/catchall.test.ts` — covers VAL-07
- [ ] `tests/engine/validate-email.test.ts` — covers VAL-08, VAL-09 (integration)
- [ ] `tests/vitest.config.ts` — Vitest config (Node pool, no CF pool)
- [ ] Framework install: `npm install -D vitest` — if not yet in package.json

---

## Sources

### Primary (HIGH confidence)

- [Cloudflare Workers node:dns docs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/) — confirmed `resolveMx` available, DNS = 1 subrequest
- [Cloudflare 1.1.1.1 DoH JSON API](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/) — MX endpoint, response format, Status codes
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) — free tier: 100k req/day, 50 subrequests, 10ms CPU, 5 cron triggers/account
- [Cloudflare Cron Triggers config](https://developers.cloudflare.com/workers/configuration/cron-triggers/) — wrangler.toml `[triggers]` syntax, `scheduled` handler signature
- [Cloudflare GitHub Actions deploy](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) — `cloudflare/wrangler-action@v3` YAML
- [Supabase local development + migrations](https://supabase.com/docs/guides/local-development/overview) — `supabase init`, `migration new`, `db push` flow
- [Supabase + CF Workers integration](https://developers.cloudflare.com/workers/databases/third-party-integrations/supabase/) — `createClient` in Worker, anon vs service role
- [Cloudflare Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/) — pool setup, test APIs

### Secondary (MEDIUM confidence)

- `@zootools/email-spell-checker` README — `run()` return type, `POPULAR_DOMAINS` extension pattern — verified via GitHub
- `disposable-email-domains-js` GitHub — `isDisposableEmailDomain()` API confirmed; bundle size estimated ~200-400KB (not officially stated)
- GitHub Actions cron + Supabase ping pattern — verified against multiple community guides (DEV.to, natt.sh) — endpoint `GET /rest/v1/` with anon key

### Tertiary (LOW confidence)

- MX data field format `"10 hostname."` — inferred from DoH spec + community usage; should be verified with a test request during implementation
- `email-spell-checker` coverage of BR domains (UOL, BOL, Terra) — README states 39+ domains but doesn't list them; BR extension via `domains` param is the safe path regardless

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified against npm/GitHub, CF APIs verified against official docs
- Architecture: HIGH — patterns derived from official CF Workers and Supabase docs
- Pitfalls: HIGH — sourced from prior project research (PITFALLS.md) which was already verified against official docs
- Validation architecture: HIGH — Vitest mock patterns are standard; engine test isolation is straightforward

**Research date:** 2026-05-21
**Valid until:** 2026-08-21 (stable stack; disposable-email-domains-js version should be re-verified if planning resumes after 90 days)
