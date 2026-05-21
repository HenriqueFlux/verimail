# Architecture Research: Verimail

**Domain:** Email validation SaaS
**Researched:** 2026-05-21
**Confidence:** HIGH (verified against Cloudflare and Supabase official docs)

---

## System Components

### 1. Frontend (Cloudflare Pages)

**Responsibility:** UI for all user-facing interactions — auth, manual input, CSV upload, results dashboard, history, download.

**Boundary:** Talks only to the API Worker via HTTP. Never touches Supabase directly from the browser. Does not hold validation logic.

**Key pages:**
- `/login` — magic link or email/pass via Supabase Auth
- `/validate` — manual textarea input
- `/upload` — CSV upload form
- `/jobs/:id` — result view for a single validation job
- `/history` — list of past jobs

---

### 2. API Worker (Cloudflare Workers — HTTP handler)

**Responsibility:** All HTTP endpoints. Auth verification, request validation, job creation, result retrieval. Thin orchestration layer — does not do heavy validation itself.

**Boundary:**
- Receives requests from the frontend
- Verifies Supabase JWT on every protected route
- Writes job records to Supabase Postgres
- Triggers async processing: either enqueues messages to Cloudflare Queue (bulk) or calls Validator Worker inline (single/small)
- Reads results from Postgres for response

**Endpoints:**
```
POST /validate/single    — inline, returns result immediately
POST /jobs               — creates job, enqueues CSV for async processing
GET  /jobs               — list user's jobs
GET  /jobs/:id           — job status + results
GET  /jobs/:id/download  — signed URL to cleaned CSV in Supabase Storage
```

**CPU constraint:** Free tier is 10ms CPU per request. The API Worker only orchestrates — it does not execute validation loops. Inline single-email validation is feasible within 10ms because it has no loops; bulk goes to the queue immediately.

---

### 3. Validator Core (shared module, not a separate Worker)

**Responsibility:** The pure validation pipeline for a single email address. Imported as a module by both the API Worker (for single validation) and the Queue Consumer Worker.

**Pipeline (in order, fail-fast):**

| Step | Check | Method | Confidence |
|------|-------|--------|------------|
| 1 | Syntax | Regex against RFC 5321 | HIGH — pure CPU, no I/O |
| 2 | Role-based | Prefix list match (info, admin, noreply, support, sales...) | HIGH — in-memory |
| 3 | Disposable domain | Set lookup against bundled `disposable-email-domains` list | HIGH — in-memory |
| 4 | Typo detection | Levenshtein distance against top-20 BR/global domains | MEDIUM — in-memory |
| 5 | Domain / MX existence | DNS-over-HTTPS fetch to `https://cloudflare-dns.com/dns-query?name=<domain>&type=MX` | HIGH — official Cloudflare DoH JSON API |

**Output per email:**
```typescript
{
  email: string,
  status: "valid" | "invalid" | "risky",
  score: number,          // 0-100
  reason: string | null,  // first failing check
  checks: {
    syntax: boolean,
    role: boolean,
    disposable: boolean,
    typo: { detected: boolean, suggestion: string | null },
    mx: boolean
  }
}
```

**DNS lookup implementation:** Use `fetch` directly against the Cloudflare DoH JSON API. This is the most reliable approach in Workers — no TCP/UDP restriction applies to HTTPS fetch. `node:dns` is also available with the `nodejs_compat` flag (and `resolveMx` works), but the DoH fetch approach is more explicit and avoids implicit subrequest routing surprises.

```
GET https://cloudflare-dns.com/dns-query?name=gmail.com&type=MX
Accept: application/dns-json
```

Response `Answer` array being non-empty = domain has MX records = can receive mail.

**MX caching:** Cache MX results per domain in a Map (in-memory, per invocation). Bulk lists often have many emails from the same domain (e.g., 500 `@gmail.com`). Cache within the consumer invocation window eliminates redundant DoH fetches.

---

### 4. Queue Consumer Worker (Cloudflare Workers — queue handler)

**Responsibility:** Process validation batches from the queue. One worker, invoked by Cloudflare Queues when messages arrive.

**Boundary:**
- Receives batches of up to 100 messages from the queue
- Each message = one email + metadata (job_id, user_id, email_index)
- Calls Validator Core for each email in the batch
- Writes results to Supabase Postgres (`validation_results` table)
- On last email of a job: updates job status to `completed`, generates clean CSV, uploads to Supabase Storage

**CPU limits for queue consumers:** Queue consumer Workers are NOT subject to the 10ms free-tier CPU limit. They run under the same limits as Paid plan Workers — 30s CPU per invocation, 15 minutes wall clock. This is the critical architectural reason why bulk processing belongs in the queue consumer, not the API Worker.

**Batch size:** 100 messages per consumer invocation (Cloudflare Queues default max). At 100 emails/batch with ~2ms per email (syntax+lookup), a batch completes well within 30s CPU.

---

### 5. Supabase Postgres (database)

**Responsibility:** Persistent storage for users (via Supabase Auth), jobs, per-email results, job state tracking.

**Boundary:** API Worker and Queue Consumer write/read via supabase-js HTTP client. Never accessed directly from the browser.

---

### 6. Supabase Storage (file storage)

**Responsibility:** Store uploaded CSVs (input) and generated clean CSVs (output).

**Boundary:** Frontend uploads directly to Supabase Storage using a presigned upload URL obtained from the API Worker. Consumer Worker writes output CSV and stores it. API Worker generates a time-limited signed URL for download.

**Buckets:**
- `uploads/` — raw input CSVs (private, user-scoped)
- `results/` — cleaned output CSVs (private, user-scoped)

---

## Data Flow

### Single email validation (inline)

```
Browser
  → POST /validate/single { email }
    → API Worker: verify JWT
    → API Worker: call Validator Core
      → syntax check (CPU)
      → role check (CPU)
      → disposable check (CPU)
      → MX check (fetch to cloudflare-dns.com)
    ← result: { status, score, reason, checks }
  ← 200 { result }
Browser renders result
```

Wall time: ~100-300ms (dominated by the DoH fetch round-trip). CPU: <5ms. Fits free tier.

---

### Bulk CSV validation (async)

```
Phase 1 — Upload & Job Creation
Browser
  → POST /jobs { filename, row_count }
    → API Worker: verify JWT
    → API Worker: INSERT job row (status=pending)
    → API Worker: create Supabase Storage presigned upload URL
  ← 201 { job_id, upload_url }
Browser
  → PUT <upload_url> [CSV file bytes] (direct to Supabase Storage)
  → POST /jobs/:id/start
    → API Worker: read CSV from Supabase Storage
    → API Worker: parse CSV, extract emails
    → API Worker: enqueue one message per email to Cloudflare Queue
    → API Worker: UPDATE job.status = "processing"
  ← 202 Accepted

Phase 2 — Processing (async, no browser connection)
Cloudflare Queue
  → delivers batch of 100 messages to Consumer Worker
    → Consumer Worker: for each email, call Validator Core
    → Consumer Worker: bulk INSERT results to Postgres
    → Consumer Worker: repeat for next batch
  [... repeats until all emails processed ...]

Phase 3 — Completion (triggered by Consumer Worker)
Consumer Worker detects last batch of a job
  → Consumer Worker: build clean CSV (valid emails only)
  → Consumer Worker: upload to Supabase Storage results/
  → Consumer Worker: UPDATE job.status = "completed", result_url = <storage path>

Phase 4 — Download
Browser polls GET /jobs/:id until status = "completed"
  → API Worker: generate signed download URL from Supabase Storage
  ← { status: "completed", download_url }
Browser
  → GET <download_url> (direct from Supabase Storage)
```

---

## Bulk Validation Strategy

### The core constraint

Free-tier Workers: 10ms CPU per HTTP request. A 10,000-email CSV cannot be processed inline — it requires a separate execution context with more headroom.

### Solution: Cloudflare Queues with Consumer Worker

Queue consumers run under Paid-equivalent limits (30s CPU / 15min wall clock) even on the free plan (as of February 2026 when Queues became available on the free plan). This is not a workaround — it is the official architecture recommendation.

**Throughput math:**
- 100 emails/batch, ~2ms CPU/email = ~200ms CPU per batch
- Well within 30s limit, ample headroom for DoH latency
- 10,000-email file = 100 batches = ~100 consumer invocations
- Queue free tier: 10,000 ops/day. Each email = 1 write (producer) + 1 read + 1 delete (consumer) = 3 ops. A 3,000-email file = 9,000 ops, near the daily free limit.

**Free tier queue ceiling:** ~3,000 emails/day before hitting the 10,000 ops/day limit. This is an important constraint for v1 — acceptable for internal tooling, needs monitoring before opening to general public.

### Tracking job completion

The Consumer Worker must know when it has processed the last email in a job to trigger the completion step. Two approaches:

**Option A (recommended): Counter in Postgres.** Job row has `total_emails` and `processed_emails` (incremented atomically via `UPDATE ... SET processed = processed + $1 WHERE id = $job_id`). After each batch write, check if `processed_emails >= total_emails`.

**Option B: Sentinel message.** Enqueue a special "end of job" message after all email messages. Consumer detects it and triggers completion. Less reliable if messages arrive out of order.

Option A is simpler and consistent with the Supabase-as-source-of-truth design.

### In-invocation MX domain cache

Within a single consumer invocation (one batch of 100), cache DoH results by domain. Many marketing lists are domain-homogeneous (hundreds of `@gmail.com`, `@hotmail.com`). A `Map<domain, boolean>` in the consumer closure eliminates most duplicate DoH fetches.

### CSV parsing location

Parse CSV in the API Worker during the `/jobs/:id/start` step, not in the consumer. This way:
1. Validation (email count, format of file) happens synchronously, giving immediate user feedback
2. The consumer receives clean, pre-extracted emails — no CSV parsing overhead per batch
3. Failure surface is smaller in the consumer

If the CSV is too large to hold in memory in a single Worker invocation (128MB limit), stream-parse using a line-by-line approach before enqueuing.

---

## Database Schema (draft)

```sql
-- Users managed by Supabase Auth (auth.users table)

-- Validation jobs
CREATE TABLE jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','completed','failed')),
  source        TEXT NOT NULL CHECK (source IN ('csv', 'manual')),
  filename      TEXT,                        -- original CSV name
  total_emails  INTEGER NOT NULL DEFAULT 0,
  processed_emails INTEGER NOT NULL DEFAULT 0,
  valid_count   INTEGER,
  invalid_count INTEGER,
  risky_count   INTEGER,
  input_path    TEXT,                        -- Supabase Storage path
  result_path   TEXT,                        -- Supabase Storage path (cleaned CSV)
  created_at    TIMESTAMPTZ DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

-- Per-email results
CREATE TABLE validation_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('valid','invalid','risky')),
  score         SMALLINT NOT NULL,            -- 0-100
  reason        TEXT,                         -- first failing check label
  check_syntax  BOOLEAN NOT NULL,
  check_role    BOOLEAN NOT NULL,
  check_disposable BOOLEAN NOT NULL,
  check_mx      BOOLEAN NOT NULL,
  typo_suggestion TEXT,                       -- e.g. "gmail.com" when "gmial.com"
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_results_job_id ON validation_results(job_id);
CREATE INDEX idx_results_status ON validation_results(job_id, status);
```

**Row budget (Supabase free tier: 50,000 rows):**
- Each job validation result = 1 row in `validation_results`
- 5 jobs × 1,000 emails = 5,000 rows — comfortable for internal use
- At scale, add a retention policy (delete results older than N days)

**Row Level Security (RLS):**
- `jobs`: user sees only `WHERE user_id = auth.uid()`
- `validation_results`: user sees only results for jobs they own (join or policy)
- Consumer Worker uses the Supabase service role key (bypasses RLS) — kept only in Worker secrets

---

## Build Order

Components have hard dependencies. Build in this order:

### Stage 1 — Foundation (nothing works without this)
1. **Supabase project setup** — Auth, Postgres, Storage buckets, RLS policies
2. **Validator Core module** — the pure validation pipeline (no Workers yet, testable in Node)
3. **Database schema migration** — `jobs` and `validation_results` tables

*Deliverable: Can validate a single email in a test script. Schema exists.*

### Stage 2 — API surface (makes the system reachable)
4. **API Worker scaffold** — Hono or itty-router, JWT verification middleware, health endpoint
5. **Single email endpoint** (`POST /validate/single`) — inline Validator Core call
6. **Job creation endpoint** (`POST /jobs`) — creates job row, returns presigned upload URL

*Deliverable: Can call the API, single validation works end-to-end.*

### Stage 3 — Bulk pipeline (the hard part)
7. **Queue setup** — Cloudflare Queue, Consumer Worker wrangler binding
8. **CSV ingestion** — `/jobs/:id/start` parses CSV, enqueues email messages
9. **Consumer Worker** — processes batches, writes results, tracks completion counter
10. **Completion step** — Consumer generates clean CSV, uploads to Storage, updates job status

*Deliverable: Upload a 100-email CSV and get a cleaned file back.*

### Stage 4 — Frontend
11. **Auth pages** — login, magic link flow
12. **Upload/manual validation UI** — job creation, status polling
13. **Results view** — per-email breakdown, statistics
14. **History page** — list of past jobs with download links

*Deliverable: Full user-facing product.*

### Stage 5 — Hardening
15. **Rate limiting** — prevent abuse of the single validation endpoint (Cloudflare rate limiting rules or Worker-side counter)
16. **Error handling** — dead letter queue, failed job status, user-visible error messages
17. **Monitoring** — Cloudflare Workers Analytics + Supabase logs review

---

## Architecture Diagram (text)

```
[Browser]
    |
    | HTTPS
    v
[Cloudflare Pages]  (static frontend)
    |
    | fetch()
    v
[API Worker]  ←→  [Supabase Auth]  (JWT verification)
    |    |
    |    | supabase-js (HTTP)
    |    v
    |  [Supabase Postgres]  (jobs, validation_results)
    |    |
    |    | presigned URLs
    |    v
    |  [Supabase Storage]  (uploads/, results/)
    |
    | enqueue (one msg per email)
    v
[Cloudflare Queue]
    |
    | push (batch of 100)
    v
[Consumer Worker]
    |  \
    |   → Validator Core (inline call per email)
    |         |
    |         → DoH fetch → https://cloudflare-dns.com/dns-query
    |
    | supabase-js (service role)
    → [Supabase Postgres]  (INSERT results, UPDATE job)
    → [Supabase Storage]  (PUT cleaned CSV)
```

---

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Queue consumer for bulk, not inline Worker | Queue consumers bypass the 10ms free-tier CPU cap; this is the only viable path on free tier |
| Enqueue one message per email (not one per job) | Enables fan-out parallelism, natural batch sizing by the queue, and simple retry on individual failures |
| DoH fetch (not node:dns) for MX lookups | Explicit, no compatibility flag required, predictable behavior; `node:dns.resolveMx` is available but adds flag dependency |
| Supabase as source of truth for job state | Avoids Durable Objects complexity; counter-increment via SQL UPDATE is atomic and sufficient |
| CSV parsed in API Worker, not consumer | Synchronous validation feedback to user; consumer receives clean data only |
| Service role key only in Consumer Worker | API Worker only needs user-scoped access; keeps blast radius of a leaked key small |

---

## Sources

- [Cloudflare Queues Limits](https://developers.cloudflare.com/queues/platform/limits/) — batch size, retention
- [Cloudflare Queues on Free Plan (Feb 2026)](https://developers.cloudflare.com/changelog/post/2026-02-04-queues-free-plan/) — confirmed free tier availability
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) — 10ms free / 30s paid CPU
- [Cloudflare DoH JSON API](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/) — MX lookup endpoint and format
- [Cloudflare Workers node:dns](https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/) — compatibility status
- [Supabase + Cloudflare Workers integration](https://developers.cloudflare.com/workers/databases/third-party-integrations/supabase/) — official integration docs
- [How Queues Works](https://developers.cloudflare.com/queues/reference/how-queues-works/) — producer/consumer model
- [Supabase Queues / pgmq](https://supabase.com/docs/guides/queues) — considered but not used (Cloudflare Queue is simpler for this topology)
