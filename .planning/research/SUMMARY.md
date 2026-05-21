# Research Summary: Verimail

**Synthesized:** 2026-05-21
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md, PROJECT.md

---

## Stack (Recommended)

| Layer | Technology | Notes |
|-------|-----------|-------|
| API runtime | Cloudflare Workers (Hono 4.12.x) | Free 100k req/day; Hono is official CF recommendation |
| Auth | Supabase Auth via supabase-js 2.106.x | 50k MAU free; handles JWT + sessions |
| Database | Supabase Postgres via supabase-js | 500 MB / 50k rows free; RLS built-in |
| File storage | Supabase Storage via supabase-js | 1 GB free; 50 MB upload cap (fine for CSV) |
| Async bulk processing | Cloudflare Queues + Consumer Worker | Free since Feb 2026; bypasses 10ms CPU cap |
| DNS/MX lookup | Cloudflare 1.1.1.1 DoH JSON API via fetch | Preferred over node:dns -- no compat flag, explicit behavior |
| Disposable detection | disposable-email-domains-js (bundled at deploy) | ~5-6k domains; loaded as Set for O(1) lookup |
| Typo detection | fast-levenshtein 3.0.0 against top-20 BR/global domains | Sub-1ms; covers gmail, hotmail, uol, terra etc. |
| Syntax validation | Custom RFC 5321 regex | No library; must handle + tags, subdomains, hyphens |
| Frontend | SvelteKit 2.x + Tailwind 4.x | Tiny output, official CF Pages adapter |
| Frontend deploy | Cloudflare Pages | Free CI/CD on push; static + SSR |
| CLI/deploy | Wrangler 4.93.x | v4 required for Workers + Pages |
| Language | TypeScript 5.4+ strict | Required for Hono type inference |

---

## Table Stakes (v1 must-haves)

- Syntax validation (RFC 5321-compliant -- must accept user+tag@domain.com, subdomains, hyphens)
- Domain existence check (DNS A/AAAA record)
- MX record check (no MX = undeliverable; return no-mx status, not invalid)
- Disposable email detection (list-based, bundled at deploy, updated weekly)
- Role-based address detection (global: info@, admin@, noreply@; PT-BR: contato@, atendimento@, vendas@, sac@, nfe@)
- Catch-all domain detection and labeling (must be risky, not valid -- omitting this is a showstopper)
- Typo suggestion (e.g., gmial.com suggests gmail.com)
- Per-email risk score 0-100 with Safe / Risky / Do Not Send segmentation
- Per-email status with reason code
- Duplicate detection (dedup before validation pipeline, report count)
- CSV upload + async processing (queue-based -- never synchronous for bulk)
- Manual email entry (textarea, same pipeline)
- List statistics summary (% per status, breakdown by reason)
- CSV download: clean-only AND annotated with status column
- Validation job history with re-download
- Auth (email + password minimum via Supabase Auth)
- LGPD-compliant ToS and Privacy Policy before any external user access
- Upload consent checkbox confirming legal basis for processing the addresses
- Raw CSV deletion after processing completes (LGPD data minimization)
- Supabase keep-alive cron (prevents free-tier project pause after 7 days inactivity)

---

## Key Architectural Decisions

1. **Bulk validation is async via Cloudflare Queues, never inline.** Free-tier Workers have a hard 10ms CPU cap. Any CSV above ~50 emails will exceed it synchronously. Queue consumers run under paid-equivalent limits (30s CPU) on the free plan. This is not optional -- it defines the entire bulk flow.

2. **Enqueue one message per email, not one per job.** Enables natural fan-out, per-email retry on failure, and automatic batch sizing by Cloudflare Queues (100 msgs/batch). A 10k-email file = 100 consumer invocations.

3. **DoH fetch (not node:dns) for MX lookups.** The Cloudflare 1.1.1.1 DoH JSON API via fetch is explicit, requires no nodejs_compat flag, routes internally within CF infrastructure (~1-3ms), and has a known response shape.

4. **CSV parsed in the API Worker during /jobs/:id/start, not in the consumer.** Synchronous parsing gives the user immediate feedback (row count, format errors). The consumer receives clean pre-extracted emails only.

5. **Supabase is the single source of truth for job state.** Job completion detected via atomic SQL counter increment. No Durable Objects, no sentinel messages.

6. **Service role key lives only in the Consumer Worker, not the API Worker.** API Worker uses user-scoped Supabase access (JWT). Consumer Worker uses the service role key in Worker secrets. Minimizes blast radius of a leaked key.

7. **Domain-level MX caching within each consumer invocation.** A Map of domain to boolean in the consumer closure avoids duplicate DoH fetches within a batch. Critical for domain-homogeneous lists (hundreds of @gmail.com).

8. **Frontend never talks to Supabase directly.** All requests go through the API Worker. Browser holds only a Supabase session token for auth.

9. **Output taxonomy is 5 statuses, not 2.** valid / invalid (syntax fail, NXDOMAIN) / risky (catch-all, role, disposable, no-MX) / typo (correctable) / unknown (transient DNS issue). Binary valid/invalid causes the catch-all problem that destroys the product promise.

10. **Disposable list is data, not code.** Bundled at deploy-time as a Set, but updated via automated weekly cron. The list becomes stale within 4-6 weeks without a refresh mechanism.

---

## Critical Pitfalls

- **Synchronous bulk validation on free Workers will silently fail.** A 500-email CSV hits the 10ms CPU cap. Use Queues from day one -- retrofitting async is painful.
- **Catch-all domains marked valid destroys the product promise.** 30-50% of B2B domains are catch-all. Users will experience the same bounce rates they paid to avoid. Flag catch-all as risky explicitly.
- **Supabase free project pauses after 7 days inactivity.** External users who try during a pause will not return. Deploy the keep-alive cron before any external access.
- **No LGPD ToS is a legal gate.** Verimail is a data processor under LGPD. No public access without ToS, DPA language, and upload consent checkbox.
- **Free Queue budget caps at ~3,000 emails/day.** 10,000 ops/day free; each email = 3 ops. A single 5k-email job exhausts the daily quota. Acceptable for internal use; hard ceiling before opening to users.
- **50 subrequest cap on API Worker HTTP invocations.** Synchronous multi-email endpoints must cap at 20 emails max; all bulk via Queue consumer.
- **Bundled disposable list goes stale in weeks.** Build the weekly update mechanism alongside the initial integration, not as a follow-up task.
- **Storing raw CSVs without a deletion policy violates LGPD and exhausts 1 GB storage.** Delete raw input CSVs immediately after the consumer writes results.
- **Overly strict regex rejects valid addresses.** user+tag@domain.com and subdomain addresses are common in Brazilian lists. Lock down edge cases with a test suite before shipping.

---

## Open Questions

1. **Queue daily ops budget vs. intended usage volume.** Free tier supports ~3,000 emails/day. Define the threshold at which paid Queues becomes necessary before launch.

2. **Catch-all detection mechanism.** Pure DNS/MX check cannot confirm catch-all without an SMTP probe. Is an inferred approach (probe random-string mailbox) feasible in Workers? If not, flag via known catch-all domain list only -- lower coverage.

3. **CSV parsing boundary.** Browser-side parse and preview before upload (better UX, less Worker pressure) vs. raw upload and Worker validates format. Decide before building the upload UI.

4. **Supabase row retention policy.** 50k free-tier row limit. Define a retention period (e.g., delete results older than 90 days) before row budget becomes a constraint.

5. **Disposable list update mechanism.** GitHub Action (update bundled asset, redeploy) vs. CF Worker cron (store list in KV). KV avoids redeployment but adds KV dependency. Decide before building the disposable detection module.

6. **RD Station export column mapping.** Verify the exact expected column headers in RD Station CSV import before implementing -- do not assume.

---

## Constraints Confirmed

| Constraint | Impact on Roadmap |
|-----------|-------------------|
| 10ms CPU cap on free Workers HTTP handlers | Bulk validation must be async via Queue from Phase 1 -- no shortcuts |
| 50 subrequests per Worker HTTP invocation | Single-email endpoint capped at 20 emails max; all bulk via Queue consumer |
| 10,000 Queue ops/day free (~3,000 emails/day) | Internal-only safe; opening to users requires paid plan or strict quotas |
| Queue consumer: 30s CPU (not 10ms) on free plan | Bulk processing is viable on free plan -- confirmed as of Feb 2026 |
| Supabase free project pauses after 7 days inactivity | Keep-alive cron is an infrastructure requirement, not optional |
| Supabase Storage: 1 GB free, 50 MB upload cap | Raw CSVs must be deleted post-processing; results-only storage is sufficient |
| Supabase Postgres: 50,000 rows free | Retention policy required; ~50 jobs x 1k emails before hitting limit |
| No TCP/SMTP outbound from Workers | SMTP verification is impossible in Workers; v1 scope confirmed |
| LGPD data processor obligations | ToS + DPA + consent checkbox are legal gates before any public access |
| No persistent in-memory state between Worker invocations | Disposable list must be bundled or read from KV; never loaded per-request |
