# Features Research: Verimail

**Domain:** Email list validation SaaS / bounce reduction tool
**Researched:** 2026-05-21
**Confidence:** HIGH for table stakes and differentiators (verified against ZeroBounce, NeverBounce, SafetyMails, Bouncer, and Snov.io); MEDIUM for scoring model weights (no service publishes exact formulas)

---

## Table Stakes

Features users expect in ANY email validator. Missing one = product feels broken or unprofessional.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Syntax validation | Absolute baseline — every tool does this | Low | RFC 5322 check; regex is not enough, use a proper parser |
| Domain existence check | Without a valid domain, email is dead | Low | DNS A/AAAA record lookup |
| MX record check | No MX = no mail server = undeliverable | Low | DNS MX query; Cloudflare Workers DNS-over-HTTPS handles this |
| Disposable email detection | Users expect trash to be caught | Medium | List-based (disposable-email-domains ~50k entries); must be kept current |
| Role-based address detection | info@, contato@, suporte@, vendas@ — low engagement, high complaints | Low | Pattern list + common PT-BR variants |
| CSV upload + download | Primary workflow for bulk validation | Medium | Upload CSV, validate, return cleaned CSV with status column |
| Per-email status with reason | Users need to know WHY an email failed, not just that it did | Low | "Invalid syntax", "No MX record", "Disposable domain", etc. |
| List statistics summary | % valid, % invalid, breakdown by failure reason | Low | Aggregate counts after validation run |
| Validation history | Users run lists weekly; they expect to find old runs | Medium | Per-account job history with redownload of results |
| Auth (login/account) | Required for history, quotas, and future billing | Medium | Supabase Auth handles this; email+password minimum |
| Manual entry (paste emails) | For testing single addresses or small batches | Low | Textarea input, same validation pipeline |

**Critical context for v1:** RD Station Marketing's own docs state the acceptable hard bounce threshold is 3%. Above that, campaigns get interrupted and accounts risk suspension. Users importing to RD Station will accept Verimail as "good enough" if it pushes hard bounces below that line — they do not need SMTP verification for this goal.

---

## Differentiators

Features that create competitive advantage. Not universally expected, but drive preference and retention.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Typo suggestion | "Did you mean gmail.com?" — reduces false invalids and recovers fixable emails | Medium | Fuzzy match against popular BR domains (gmail, hotmail, yahoo, uol, bol, terra, ig, outlook). Use `email-spell-checker` (1.9 KB, TypeScript) or custom levenshtein. Returns suggested correction alongside INVALID status. |
| Risk score per email (0–100) | Moves beyond binary valid/invalid into a deliverability gradient | High | See Scoring Model section. ZeroBounce and SafetyMails both do this. It's becoming table stakes fast. |
| "Safe to send" / "Risky" / "Do not send" segmentation | Actionable 3-bucket output users can act on without thinking | Low | Derived from risk score. Provides cleaner UX than raw scores alone. |
| PT-BR localization | SafetyMails is dominant in BR; a PT-BR native experience reduces friction vs. English tools | Low | UI, error messages, help docs in Portuguese. Common BR role prefixes: contato@, atendimento@, vendas@, sac@, nfe@. |
| RD Station-specific export | CSV pre-formatted for RD Station import (column headers matching their template) | Low-Medium | RD Station expects specific columns. A one-click "Export for RD Station" removes user friction entirely. High perceived value for target segment. |
| Catch-all domain flagging with guidance | Catch-all domains (accept-all) return valid on MX check but may bounce. Flag them separately and explain the risk. | Medium | Can't verify individual mailbox without SMTP. Honest communication: "Domain accepts all email — individual mailbox unverified." |
| Duplicate detection | Lists often have repeated addresses. Auto-deduplicate before validating and report count. | Low | Simple set dedup before processing. Small feature, users notice when it's missing. |
| Downloadable clean list vs. full annotated list | Two download modes: (1) clean-only CSV for direct import, (2) full CSV with status column for analysis | Low | Users uploading to RD Station want clean-only. Analysts want annotated. Both are trivially generated from the same data. |

---

## Anti-Features (v1)

Things to deliberately NOT build in v1, with explicit reasoning.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| SMTP verification (mailbox ping) | Requires VPS with port 25 open, ISP reputation management, IP warming, retry logic, greylisting bypass. This is a separate product. Cloudflare Workers cannot open TCP sockets. | Flag catch-all domains; document the limitation honestly. Users targeting RD Station do not need this for bounce reduction below 3%. |
| Public REST API | API requires rate-limiting, key management, versioning, docs, DX. Pre-product-market-fit this is a distraction. | Build dashboard first. Validate with real users. API is v2 after understanding actual usage patterns. |
| Zapier / native integrations | Integration maintenance is ongoing work. No PMF signal yet. | Document the export/import CSV workflow for RD Station. One-click RD Station export is sufficient. |
| Billing and credit system | Premature monetization before the product proves value. Adds auth/payment complexity. | Free tool for internal + early users. Add billing in v2 when SaaS-ing. |
| Real-time form widget (JS snippet) | Different product with different latency/embedding requirements. | Separate v2 feature. Core value is bulk list cleaning, not form protection. |
| Email Finder / lead enrichment | Different product category (prospecting). Dilutes focus. | Stay in the "clean my existing list" lane. |
| Blacklist monitoring | Useful for domain owners, not for list cleaners. Different user job-to-be-done. | Not relevant to RD Station bounce reduction use case. |
| Inbox placement testing | Requires relationship with seed networks. Complex and expensive. | Out of scope for v1 and v2. |
| Team/workspace features | No evidence of team use case in v1. Adds auth complexity. | Single-user accounts only. Add teams if users request it post-launch. |
| Mobile-optimized heavy experience | CSV validation is a desktop workflow. Users are at a computer with spreadsheets. | Responsive-enough to not break on mobile, but optimize for desktop. |

---

## Feature Dependencies

Which features must exist before others can be built.

```
Auth (login/account)
  └── Validation history       (requires user identity to attach jobs to)
  └── Billing / quotas (v2)    (requires user identity)

CSV upload
  └── Validation pipeline      (upload triggers processing)
      └── Per-email status     (pipeline output)
          └── List statistics  (aggregate of per-email results)
          └── Risk score       (enrichment of per-email status)
              └── Safe/Risky/Do-not-send segmentation (derived from score)
          └── Typo suggestion  (enrichment of per-email status)
          └── Duplicate detection (pre-pipeline step)
      └── CSV download (clean) (filtered view of results)
      └── CSV download (annotated) (full results with status column)
      └── RD Station export    (formatted view of clean results)

Manual entry
  └── Same validation pipeline (reuses pipeline, different input method)

Catch-all flagging
  └── MX check                 (catch-all requires MX to return valid first)
```

**Critical path for v1 (shortest path to value):**

```
Auth → CSV upload → Validation pipeline → Per-email status → List stats → CSV download (clean)
```

Everything else is additive. Ship the critical path first.

---

## Scoring Model

How to assign a risk score to each email address. No service publishes exact formulas, but the factors are consistent across the industry.

### Recommended Model for Verimail

Use a 0–100 score where **higher = safer to send**. Invert from "risk score" convention (most tools use low number = safe) to make the UI more intuitive: "Score: 82 — Safe to send."

Three output buckets derived from score:
- **Safe (70–100):** Include in clean export
- **Risky (30–69):** Flag; user decides
- **Do not send (0–29):** Exclude from clean export

### Scoring Factors and Suggested Weights

| Factor | Weight | Rationale |
|--------|--------|-----------|
| Syntax valid | Gate (0 if fail) | Non-negotiable. Invalid syntax = not an email address. |
| Domain exists (DNS A/AAAA) | Gate (0 if fail) | No domain = guaranteed bounce. |
| MX record exists | -40 pts if absent | Highest bounce signal after syntax. Most important non-gate check. |
| Disposable domain | -60 pts | Near-certain engagement void or temp address. |
| Role-based address | -20 pts | Shared inbox; low engagement, higher complaint risk. BR variants: contato@, atendimento@, vendas@, sac@, nfe@, no-reply@, noreply@ |
| Catch-all domain | -15 pts | Can't verify mailbox without SMTP. Moderate risk. |
| Typo detected (correctable) | -10 pts + suggest correction | Not invalid, but likely wrong. Show suggestion. |
| Known free provider (gmail, hotmail, uol) | 0 pts (neutral) | Common in BR; not a risk signal on its own. |
| Common TLD (.com, .com.br, .org, .net) | +5 pts | Minor positive signal. |

**Starting score:** 100. Apply deductions. Floor at 0.

**Example calculations:**
- `joao@gmail.com` → 100 (no deductions) → Safe
- `contato@empresa.com.br` → 100 - 20 (role) = 80 → Safe (borderline — show flag in UI)
- `fulano@mailinator.com` → 100 - 60 (disposable) = 40 → Risky
- `user@nodomain.xyz` (no MX) → 100 - 40 = 60 → Risky
- `info@catch-all-domain.com` → 100 - 20 (role) - 15 (catch-all) = 65 → Risky
- `user@gmil.com` (typo, no MX) → 100 - 40 - 10 = 50 + suggest `gmail.com` → Risky

### Notes on Scoring

- Gates (syntax, domain) are binary: fail = score 0, stop processing, return "INVALID".
- All other checks can stack. A role-based address on a catch-all domain scores lower than either alone.
- Catch-all detection: attempt MX resolution; if MX exists and a probe for a random-string mailbox would "succeed" (inferred from accept-all behavior), flag as catch-all. Without SMTP, this is inferred from known catch-all domain lists or domain behavior signals.
- Do not silently apply typo corrections. Score the email as-written and surface the suggestion separately. Let the user decide whether to fix their list.
- The scoring model is a v1 approximation. It lacks behavioral data (engagement history) and identity signals (social presence) that premium tools use. This is an honest limitation — document it.

### What This Model Covers vs. What It Cannot Cover

| Signal | Covered in v1 | Reason |
|--------|--------------|--------|
| Syntax | Yes | Local check |
| Domain DNS | Yes | DNS-over-HTTPS via CF Workers |
| MX record | Yes | DNS-over-HTTPS via CF Workers |
| Disposable domain | Yes | Open-source list |
| Role-based | Yes | Pattern matching |
| Catch-all domain | Partial | List-based or inference; no SMTP probe |
| Mailbox existence | No | Requires SMTP (v2) |
| Engagement history | No | Requires historical send data |
| Spam trap | No | Requires proprietary spam trap network |
| Domain reputation | No | Requires 3rd-party reputation API |
| Identity/social signals | No | Out of scope entirely |

---

## Sources

- ZeroBounce vs NeverBounce feature comparison: [Snov.io](https://snov.io/blog/neverbounce-vs-zerobounce/), [Sparkle.io](https://sparkle.io/blog/zerobounce-vs-neverbounce/)
- SafetyMails feature overview: [safetymails.com](https://www.safetymails.com/)
- Email risk score factors: [verified.email](https://verified.email/blog/email-verification/email-risk-score), [IPQS](https://www.ipqualityscore.com/fraud-prevention/email-risk-scoring)
- Bounce rate benchmarks and RD Station threshold (3% hard bounce): [RD Station blog](https://www.rdstation.com/blog/marketing/hard-soft-bounce-email/), [Verified.email benchmarks](https://verified.email/blog/email-deliverability/email-bounce-rate-benchmark)
- Typo correction library: [email-spell-checker (ZooTools)](https://github.com/ZooTools/email-spell-checker), [mailcheck](https://github.com/mailcheck/mailcheck)
- Top tools feature comparison: [Sparkle honest test](https://sparkle.io/blog/best-email-verification-tools/), [Snov.io best services](https://snov.io/blog/best-email-verification-services/)
- CSV UX patterns: [importcsv.com](https://www.importcsv.com/blog/data-import-ux)
