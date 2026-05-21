# Pitfalls Research: Verimail

**Domain:** Email validation SaaS — DNS/MX-only, no SMTP, Cloudflare Workers + Supabase
**Researched:** 2026-05-21
**Overall confidence:** HIGH (Cloudflare limits verified against official docs; domain pitfalls verified against multiple independent sources)

---

## Critical Pitfalls

These will cause rework, lost user trust, or infrastructure failure if not addressed in the relevant phase.

---

### CRITICAL-1: Workers Free Tier CPU Limit Kills Bulk Validation

**What goes wrong:** The Cloudflare Workers free tier enforces a 10ms CPU time limit per invocation. Bulk CSV processing — even a 500-row file — involves per-email regex checks, fuzzy typo comparisons, and in-memory disposable list lookups. This CPU work accumulates fast. The request dies mid-list with a `Worker exceeded CPU time limit` error. The user gets no output, no partial result, and no error message they understand.

**Why it happens:** Developers assume "waiting on DNS fetch" is what takes time in a Worker. It is. But pure CPU work — iterating a 50k-entry array per email for disposable detection, running Levenshtein distance for typo checks — counts toward the 10ms cap regardless of how little wall time it appears to consume.

**Consequences:** Silent failures on any list larger than ~50 emails. No graceful degradation unless explicitly designed for it.

**Prevention:** Design the bulk validation flow as async from day one. Upload CSV → enqueue → process in background → write results → notify. Cloudflare Queues is now available on the free plan (as of February 2026). The queue consumer handler has no CPU time limit, only a wall time limit measured in minutes. This sidesteps the 10ms cap entirely.

**Warning signs:**
- Testing with 10-20 email inputs works; testing with 200 inputs errors
- `Worker exceeded CPU time limit` appears in Workers logs
- Bulk validation works on paid tier but fails on free

**Phase:** Address in the bulk CSV validation phase (before shipping any list upload feature). Do not add file upload to a synchronous Worker handler.

---

### CRITICAL-2: Supabase Free Tier Pauses After 7 Days of Inactivity

**What goes wrong:** Supabase automatically pauses free-tier projects after 7 days of no activity. When a user hits the app after a pause, they see errors or a blank state — Supabase is not responding. Resuming takes ~30 seconds after clicking a button in the Supabase dashboard, but this is a manual action. A user who discovers the product for the first time during a paused window bounces immediately.

**Why it happens:** Supabase's free tier is designed for development, not production. The inactivity policy is enforced by Supabase's infrastructure automatically.

**Consequences:** Silent downtime. Users who try the product while it is paused will not retry. This is especially damaging during early traction when you cannot afford lost evaluations.

**Prevention:** Keep a lightweight ping alive via a scheduled Cloudflare Worker cron job (every 3-4 days) that makes a lightweight read query against Supabase. This counts as activity and prevents the pause. Alternatively, move to Supabase Pro ($25/mo) before any real user traffic. Do not build an SLA-dependent product on a free Supabase project.

**Warning signs:**
- App returns 503 or empty data unexpectedly
- No user activity in the last 6-7 days
- Supabase dashboard shows project status as "Paused"

**Phase:** Address before any external user testing. The cron ping should be part of the initial infrastructure setup phase.

---

### CRITICAL-3: Catch-All Domains Reported as "Valid" — Users Will Still Bounce

**What goes wrong:** Approximately 30-50% of B2B domains are configured as catch-all (they accept mail to any address at their domain, whether the mailbox exists or not). DNS/MX lookup returns a valid result for all of them. Verimail marks every email at these domains as valid. Users import the "clean" list into RD Station, send a campaign, and experience a 9-23% bounce rate — the exact problem they paid to solve.

**Why it happens:** MX record presence only proves the domain can receive mail. It says nothing about whether `joao.silva@empresa.com.br` actually exists. Without SMTP verification (which Verimail explicitly excludes), catch-all domains are a structural blind spot.

**Consequences:** Product fails its core promise. Users blame Verimail for the bounces. Churn and credibility damage in a word-of-mouth market (BR email marketing is a small community).

**Prevention:** Detect and explicitly label catch-all domains. Query the domain's MX record, then attempt a probe connection — if the server accepts any address (e.g., `definitely-not-real-999@domain.com`), flag the domain as `catch-all`. Surface this as a distinct status in results: not "valid", not "invalid" — `risky: catch-all`. Let users decide whether to include or exclude these in the downloaded CSV. Educate users in the UI that catch-all means "domain accepts mail, mailbox existence unverifiable."

**Warning signs:**
- Users report bounces despite exporting "clean" list
- High percentage of results marked valid from large corporate or B2B domains (these are disproportionately catch-all)
- SafetyMails (the BR competitor) surfaces this distinction in their output

**Phase:** Must be in the first functional validation phase. Missing this makes the product misleading from day one.

---

## Common Mistakes

---

### MISTAKE-1: Overly Strict Regex That Rejects Valid Addresses

**What goes wrong:** Common regex patterns reject RFC 5321-valid addresses. Examples: `user+tag@domain.com` (plus addressing used heavily by Gmail users), `user@subdomain.domain.com`, addresses with hyphens or dots before the @. A Brazilian marketing list will have plenty of `contato+rdstation@empresa.com.br`.

**Prevention:** Use a well-tested, RFC-aligned library for syntax validation rather than hand-rolling regex. The rule is: if it passes the RFC, pass it through syntax checks and let MX/DNS do the heavier lifting.

**Warning signs:**
- Valid Gmail addresses with `+` tags rejected
- Corporate subdomains (mail.empresa.com.br) marked as syntax error

**Phase:** Core validation logic phase. Lock this down with a test suite of edge-case addresses before shipping.

---

### MISTAKE-2: Disposable List Loaded at Request Time (Memory and Latency)

**What goes wrong:** The `disposable-email-domains` list is 50k+ domain entries. Loading it from a file or GitHub URL on every request adds 100-400ms latency per validation call and risks hitting Workers memory limits. On a bulk job with 1000 emails, this compounds into seconds of avoidable overhead.

**Prevention:** Bundle the list as a static asset at build/deploy time. Use a `Set` for O(1) lookup. For the background queue consumer, load once at startup into memory, not per-email. Consider KV storage for the list if it needs to be updateable without redeployment.

**Warning signs:**
- Bulk validation noticeably slower than expected
- Workers memory warnings in logs
- Cold-start latency spikes on first request

**Phase:** Core validation logic phase.

---

### MISTAKE-3: Treating "No MX Record" as Definitive Proof of Invalid Email

**What goes wrong:** Some legitimate domains temporarily lack MX records due to DNS propagation delays (up to 48 hours during a migration), misconfiguration, or outbound-only mail setups (e.g., transactional senders using SendGrid with a domain that has no inbound MX). Marking these as invalid will cause false negatives — valid contacts dropped from the list.

**Prevention:** Return a `no-mx` status rather than hard-flagging as "invalid." Let users choose whether to exclude these. Document in the UI that no-MX means "cannot receive mail right now — may be misconfigured or migrating." Reserve "invalid" for definitive failures: syntax errors, NXDOMAIN (domain does not exist at all).

**Warning signs:**
- Users report that valid contacts at known companies are being rejected
- Domains with recent DNS changes consistently flagged

**Phase:** Core validation logic phase. Define your status taxonomy (valid / invalid / risky / unknown) before writing the first validation function.

---

### MISTAKE-4: Storing Raw Email Lists in Supabase Without Retention Policy

**What goes wrong:** Users upload CSV files containing email addresses of third parties. These addresses are personal data under LGPD. Without a deletion policy, Verimail accumulates PII indefinitely. The 1 GB Supabase Storage free limit will also be exhausted by raw CSV storage over time. Additionally, if a user deletes their account, the raw list data may persist.

**Prevention:** Define a retention policy at build time (e.g., raw CSVs deleted 30 days after upload, or immediately after the result CSV is downloaded). Store only the validation results (email, status, reason), not the original raw CSV, unless storage is needed for re-download. Implement account deletion cascade: user deleted → all associated lists and results deleted.

**Warning signs:**
- Supabase Storage bucket growing unbounded
- User requests account deletion but data remains

**Phase:** Data model / auth phase. Define this before the first CSV upload is stored.

---

## Cloudflare Workers Gotchas

---

### WORKERS-1: 50 Subrequest Limit on Free Tier Caps Per-Request DNS Lookups

**What goes wrong:** Free-tier Workers are limited to 50 external fetch subrequests per invocation. Each DNS-over-HTTPS lookup for an MX record is one subrequest. If a synchronous validation endpoint tries to validate 60 emails in a single request, it exhausts the subrequest budget and subsequent DNS lookups silently fail or return errors, causing remaining emails to be marked with incorrect statuses.

Note: As of February 2026, paid Workers have a configurable limit up to 10 million subrequests. The free tier remains at 50.

**Prevention:** Enforce strict per-request input limits (e.g., max 20 emails for synchronous validation). Route bulk jobs through the queue consumer worker, which runs outside the 50-request HTTP context. Cache MX lookup results in KV by domain for 1 hour to avoid redundant lookups when a bulk list contains many addresses at the same domain.

**Warning signs:**
- Last N emails in a batch always fail DNS check
- Logs show subrequest errors or DNS timeouts at predictable thresholds

**Phase:** Bulk validation architecture phase.

---

### WORKERS-2: No Persistent In-Memory State Between Requests

**What goes wrong:** Developers assume a global variable (e.g., a pre-loaded disposable domains `Set`) persists between Worker invocations. It does not. Each Worker invocation may spin up a new isolate. The disposable list must be re-initialized, adding latency and CPU cost on every cold start.

**Prevention:** Use Cloudflare KV for the disposable domain list if it needs to survive between invocations. For the queue consumer (bulk processing), the isolate will typically stay warm during a batch, so in-memory loading is acceptable there. For the HTTP handler, keep the in-memory check fast by using a minimal, bundled list.

**Warning signs:**
- First request always slower than subsequent requests (acceptable), but performance is inconsistent
- Memory-heavy global initialization causes CPU time limit to be hit at request start

**Phase:** Core validation logic phase.

---

### WORKERS-3: No Direct TCP/SMTP — DNS-over-HTTPS Is the Only DNS Option

**What goes wrong:** Workers run in a sandboxed environment. There is no `net.lookup` or native DNS API. All DNS queries must go through fetch calls to a DNS-over-HTTPS endpoint (Cloudflare 1.1.1.1 JSON API or Google 8.8.8.8). This is fine for MX checks, but developers sometimes reach for Node.js DNS modules expecting them to work. They do not.

Note: Cloudflare Workers does expose a `nodejs_compat` flag with a `dns` module, but this resolves via Workers' internal DNS, not arbitrary TCP to port 53. SMTP connections (port 25) are impossible in Workers regardless.

**Prevention:** Write the DNS lookup module targeting the DoH JSON API from day one. Test it in the actual Workers environment, not locally with Node.js, where native DNS works differently. Never plan for SMTP-level verification inside a Worker.

**Warning signs:**
- Code works locally but fails on `wrangler dev` or deployed
- `dns.resolve` calls throw unexpectedly in Workers environment

**Phase:** Core validation logic phase. Establish the DoH fetch wrapper before building any MX check logic.

---

### WORKERS-4: Cloudflare 1.1.1.1 DoH Rate Limiting Is Undocumented

**What goes wrong:** Cloudflare does not publish a specific rate limit for the public 1.1.1.1 DoH JSON API. The documentation only states it will not rate-limit "typical Internet-facing applications" but may rate-limit "security scanning use-cases or proxied traffic." Bulk validation is indistinguishable from scanning at high volumes.

**Prevention:** Cache MX lookup results in KV with a TTL matching the DNS TTL (typically 3600s). This reduces the actual DoH request rate dramatically: a 1000-email list from a corporate domain might trigger 1 DoH lookup, not 1000. Monitor for HTTP 429 responses from the DoH endpoint. If rate limiting occurs at scale, implement a secondary fallback to Google's DoH endpoint (8.8.8.8). For very high volumes, evaluate Cloudflare's commercial DNS resolver options.

**Warning signs:**
- HTTP 429 or connection resets from `1.1.1.1/dns-query`
- DNS lookups start returning errors during bulk processing peaks

**Phase:** Bulk validation architecture phase.

---

## DNS/MX Lookup Traps

---

### DNS-1: Stale Cache Serving Wrong MX Result During DNS Migration

**What goes wrong:** When a domain migrates its email provider (e.g., from G Suite to Microsoft 365), MX records propagate over 24-48 hours. During this window, some DNS resolvers return the old record, some return the new. The Cloudflare DoH resolver may return a cached response within the DNS TTL. If a user validates a list during a migration window, a valid domain gets flagged as having no mail server, or the old server is tested and considered unhealthy.

**Prevention:** This is mostly unavoidable at the DNS layer. Mitigate by showing DNS TTL in the result metadata where possible. Use the status `no-mx` rather than `invalid` so users understand the condition is potentially transient. Do not cache results in KV for longer than the DNS TTL returned by the resolver.

**Phase:** Core validation logic phase. Purely a labeling and documentation concern, not a code bug.

---

### DNS-2: MX Record Points to CNAME — Technically Invalid but Common

**What goes wrong:** RFC 2181 prohibits MX records from pointing to a CNAME target. However, some real-world domains violate this (e.g., `mail IN MX 10 mailhost.example.com` where `mailhost` is a CNAME). Strict validation would reject these as invalid. But these domains receive mail fine, because most MTA implementations handle the CNAME resolution anyway. Rejecting them creates false negatives.

**Prevention:** Treat CNAME-pointed MX as `risky` not `invalid`. Document the deviation, flag it for the user, but do not discard the email from the clean export.

**Phase:** Core validation logic phase.

---

### DNS-3: Missing De-duplication Before DNS Lookups

**What goes wrong:** A 5000-row CSV for a company like RD Station might contain 3000 emails at `gmail.com`, `hotmail.com`, `yahoo.com.br`. Without deduplication by domain before the DNS phase, Verimail will fire 3000 MX lookup requests for domains where 1 lookup suffices. This burns subrequest budget, adds latency, and risks rate limiting.

**Prevention:** Group emails by domain before the DNS/MX phase. Perform one MX lookup per unique domain, cache the result, apply it to all emails at that domain.

**Phase:** Bulk validation architecture phase. This is a performance requirement that shapes the processing pipeline design.

---

## Disposable List Maintenance

---

### DISPOSABLE-1: Bundled Static List Goes Stale Within Weeks

**What goes wrong:** The `disposable-email-domains` GitHub list (~50k domains) is bundled at deploy time. New disposable services spin up constantly. A domain valid today may be a disposable tomorrow, or vice versa. After 4-6 weeks without updating, the bundled list misses newly popular disposable services and the accuracy of this check degrades meaningfully.

**Why it happens:** Committing a static file and deploying once is the path of least resistance. But disposable email infrastructure is adversarial — it actively changes to evade blocklists.

**Consequences:** Users who validate against a stale list will still get disposable addresses in their "clean" export. Their bounce rates remain high. The core value proposition degrades silently.

**Prevention:** Implement an automated weekly update pipeline. The best candidate is `disposable/disposable-email-domains` (GitHub), which auto-updates daily. Set up a Cloudflare Worker cron or GitHub Action to pull the latest list weekly, store it in KV, and update the deployed Worker's lookup source. Treat the list as data, not code — it should update independently of deployments.

**Warning signs:**
- Users recognize known disposable domains (guerrillamail, mailinator, tempmail) slipping through
- The commit hash for the bundled list is weeks or months old

**Phase:** Address in the disposable detection phase. Build the update mechanism alongside the initial list integration, not as a follow-up task.

---

### DISPOSABLE-2: Treating All Flagged Disposable Domains as Hard Invalid

**What goes wrong:** Some domains in public disposable lists are false positives — legitimate email providers or regional services that got added incorrectly. Treating every match as a hard "invalid" will cause the user to drop valid contacts.

**Prevention:** Use `disposable` as a status flag, not a synonym for invalid. Let users configure whether to exclude disposable addresses in their export. For v1, flag and show in results; make the download default to excluding them, but do not delete them from the result view. Periodically audit flagged positives from user feedback.

**Phase:** Core validation logic phase. The output taxonomy decision (valid / invalid / disposable / risky / unknown) must be made before building the results UI.

---

## Data and Privacy (LGPD)

---

### LGPD-1: Verimail Is a Data Processor Under LGPD

**What goes wrong:** Users upload CSV files containing email addresses of Brazilian contacts. These are personal data under LGPD (Lei 13.709/2018). Verimail processes them on behalf of the user (the data controller). This makes Verimail a **operador** (processor) under LGPD, with legal obligations: must process only as instructed, must maintain security measures, must assist the controller in responding to data subject rights requests, and must be named in a data processing agreement (DPA) with the controller.

Failing to acknowledge this creates compliance exposure for both Verimail and its users, particularly as ANPD enforcement matures.

**Prevention:** Ship a Terms of Service and Privacy Policy before accepting any user uploads. The ToS must include a data processing addendum (or equivalent language) covering: purpose limitation (validation only), retention (delete after X days), security measures, and no secondary use of uploaded data. Do not use uploaded email lists for any other purpose — not even to enrich your own disposable domain database.

**Warning signs:**
- No privacy policy on the site
- No defined retention period for uploaded CSVs
- ToS makes no mention of data processing on behalf of the user

**Phase:** Before any public or beta user access. This is a legal gate, not a feature.

---

### LGPD-2: Storing Raw Uploaded CSVs Creates Unnecessary PII Liability

**What goes wrong:** Storing the original user-uploaded CSV in Supabase Storage means Verimail holds raw, unprocessed personal data. This data needs to be secured, its retention justified, and it must be deleted on request. If the Supabase project is compromised, all uploaded CSVs are exposed. The 1 GB free storage limit will also be exhausted by raw file accumulation.

**Prevention:** Delete the raw uploaded CSV immediately after validation processing completes. Store only the validation results (email address, status code, reason tag, timestamp). The downloadable clean CSV is generated from the results table, not from the stored original file. This minimizes PII surface area, satisfies LGPD data minimization principle, and avoids the storage cap problem.

**Warning signs:**
- Supabase Storage bucket grows proportionally to uploads over time
- Raw files remain in storage after the user downloads their results
- No delete trigger exists in the processing pipeline

**Phase:** Data model / auth phase. Define the storage lifecycle before writing the first file upload handler.

---

### LGPD-3: No Consent or Legal Basis for the Lists Users Upload

**What goes wrong:** Users may upload lists purchased from brokers, scraped from the web, or collected without documented consent. Verimail cannot control this — but it must not facilitate it unknowingly. If Verimail's ToS implies it validates "any email list," it becomes implicated in processing data without legal basis. ANPD enforcement has focused on e-mail marketing since 2024.

**Prevention:** ToS must state clearly that users are responsible for having legal basis (consent or legitimate interest) for the contacts they upload. Include a checkbox acknowledgment at upload time: "I confirm I have permission to process these email addresses." This does not prevent misuse, but it transfers legal responsibility appropriately and signals LGPD awareness to legitimate users.

**Phase:** Before any public or beta user access. UI checkbox can be added to the CSV upload interface.

---

## Phase Mapping Summary

| Pitfall | Phase to Address | Severity |
|---------|-----------------|----------|
| CRITICAL-1: Workers CPU limit on bulk | Bulk CSV validation architecture | Showstopper |
| CRITICAL-2: Supabase pauses on inactivity | Infrastructure setup / first deploy | Showstopper |
| CRITICAL-3: Catch-all domains marked valid | Core validation logic | Showstopper |
| MISTAKE-1: Strict regex false negatives | Core validation logic | High |
| MISTAKE-2: Disposable list loaded per-request | Core validation logic | High |
| MISTAKE-3: No-MX marked hard invalid | Core validation logic | High |
| MISTAKE-4: No CSV retention policy | Data model / auth setup | High |
| WORKERS-1: 50 subrequest free tier limit | Bulk validation architecture | Showstopper |
| WORKERS-2: No persistent in-memory state | Core validation logic | Medium |
| WORKERS-3: No TCP/SMTP in Workers | Core validation logic (docs) | Medium |
| WORKERS-4: 1.1.1.1 DoH undocumented rate limit | Bulk validation architecture | High |
| DNS-1: Stale cache during migration | Core validation logic (labeling) | Medium |
| DNS-2: MX points to CNAME | Core validation logic | Low |
| DNS-3: No domain-level DNS dedup | Bulk validation architecture | High |
| DISPOSABLE-1: Bundled list goes stale | Disposable detection + maintenance | High |
| DISPOSABLE-2: All disposable = hard invalid | Core validation logic | Medium |
| LGPD-1: Verimail is a data processor | Pre-launch legal / ToS | Showstopper |
| LGPD-2: Raw CSV stored unnecessarily | Data model / auth setup | High |
| LGPD-3: No consent acknowledgment at upload | CSV upload UI | High |
