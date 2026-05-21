---
phase: 1
slug: validator-core-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-21
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x |
| **Config file** | `tests/vitest.config.ts` — Wave 0 creates |
| **Quick run command** | `npx vitest run tests/engine` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds (all pure/mocked — no real network calls) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/engine`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| scaffold | 01-01 | 0 | — | setup | `npx vitest run tests/engine` (should pass 0 tests) | ❌ W0 | ⬜ pending |
| types | 01-01 | 1 | VAL-01..09 | type-check | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| syntax | 01-01 | 1 | VAL-01 | unit | `npx vitest run tests/engine/syntax.test.ts` | ❌ W0 | ⬜ pending |
| role | 01-01 | 1 | VAL-05 | unit | `npx vitest run tests/engine/role.test.ts` | ❌ W0 | ⬜ pending |
| disposable | 01-01 | 1 | VAL-04 | unit | `npx vitest run tests/engine/disposable.test.ts` | ❌ W0 | ⬜ pending |
| typo | 01-01 | 1 | VAL-06 | unit | `npx vitest run tests/engine/typo.test.ts` | ❌ W0 | ⬜ pending |
| mx | 01-01 | 1 | VAL-02, VAL-03 | unit (fetch mocked) | `npx vitest run tests/engine/mx.test.ts` | ❌ W0 | ⬜ pending |
| catchall | 01-01 | 1 | VAL-07 | unit (fetch mocked) | `npx vitest run tests/engine/catchall.test.ts` | ❌ W0 | ⬜ pending |
| validate-email | 01-01 | 2 | VAL-08, VAL-09 | unit (integration) | `npx vitest run tests/engine/validate-email.test.ts` | ❌ W0 | ⬜ pending |
| schema | 01-02 | 1 | — | manual | Verify via Supabase dashboard | manual | ⬜ pending |
| auth | 01-02 | 1 | AUTH-01..03 | manual | Create account + login flow in browser | manual | ⬜ pending |
| keepalive | 01-02 | 1 | INF-02 | manual | Trigger `workflow_dispatch` → check run success | manual | ⬜ pending |
| disposable-update | 01-02 | 2 | INF-03 | manual | Trigger GH Action → verify diff check + commit logic | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test files that must exist before implementation tasks run (test-first approach):

- [ ] `tests/vitest.config.ts` — Node pool config, no CF pool
- [ ] `tests/engine/syntax.test.ts` — stubs for VAL-01 (valid, invalid syntax, edge cases)
- [ ] `tests/engine/role.test.ts` — stubs for VAL-05 (role prefixes, global + BR)
- [ ] `tests/engine/disposable.test.ts` — stubs for VAL-04 (mailinator, guerrilla, legit domain)
- [ ] `tests/engine/typo.test.ts` — stubs for VAL-06 (gamil→gmail, hotmal→hotmail, uool→uol)
- [ ] `tests/engine/mx.test.ts` — stubs for VAL-02, VAL-03 (NXDOMAIN, no MX, Gmail MX, own MX)
- [ ] `tests/engine/catchall.test.ts` — stubs for VAL-07 (curated list, MX heuristic)
- [ ] `tests/engine/validate-email.test.ts` — stubs for VAL-08, VAL-09 (score, reason, full pipeline)
- [ ] Framework install: `npm install -D vitest typescript` — if no package.json yet

*All test files start as `.todo()` stubs — they must exist before Wave 1 implementation begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Criar conta com e-mail + senha | AUTH-01 | Requires live Supabase project; no local mock in Phase 1 | Open Supabase project → Auth → Create user via `supabase.auth.signUp()` call or dashboard. Verify user appears in Auth → Users. |
| Sessão persiste após fechar navegador | AUTH-02 | Browser session state — only testable manually | Login via Supabase client in browser console → close tab → reopen → call `supabase.auth.getSession()`. Expect non-null session. |
| Logout de qualquer página | AUTH-03 | Browser session — only testable manually | Call `supabase.auth.signOut()` in browser console → verify `getSession()` returns null. |
| Keep-alive cron atinge Supabase | INF-02 | Requires live GH Actions run | Trigger via `workflow_dispatch` in GitHub → confirm workflow runs successfully (exit 0). Verify last active timestamp in Supabase dashboard updates. |
| Atualização semanal da lista de descartáveis | INF-03 | Requires GH Actions environment + Wrangler deploy | Manually trigger the GH Action → confirm it checks for diff, commits if changed, skips if unchanged. Verify `disposable-email-domains-js` version in package.json after run. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING (❌ W0) references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
