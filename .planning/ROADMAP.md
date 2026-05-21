# Roadmap: Verimail

## Overview

Verimail é construído em três fases que seguem o fluxo natural de dependência do produto: primeiro o motor de validação puro e a infraestrutura base (sem UI, testável isoladamente); depois a camada de API e o pipeline assíncrono de bulk que expõem o motor ao mundo; por fim o dashboard SvelteKit que entrega a experiência completa ao usuário. Cada fase entrega uma capacidade coerente e verificável antes de a próxima começar.

## Phases

- [ ] **Phase 1: Validator Core + Foundation** - Motor de validação puro + schema Supabase + cron keep-alive + auth
- [ ] **Phase 2: API Worker + Bulk Pipeline** - API Hono, endpoints de validação, upload CSV, Cloudflare Queues consumer
- [ ] **Phase 3: Frontend Dashboard** - SvelteKit UI completa: auth, upload, resultados, histórico, download

## Phase Details

### Phase 1: Validator Core + Foundation
**Goal**: O motor de validação existe, está correto e pode ser exercitado via testes — a base técnica inteira está no ar antes de qualquer interface
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, VAL-01, VAL-02, VAL-03, VAL-04, VAL-05, VAL-06, VAL-07, VAL-08, VAL-09, INF-02, INF-03
**Success Criteria** (what must be TRUE):
  1. Um e-mail submetido ao módulo de validação retorna status (valid / invalid / risky / typo), score 0–100 e motivo correto para cada tipo de check (sintaxe, domínio, MX, disposable, role, catch-all, typo)
  2. A lista de domínios descartáveis está carregada em memória no Worker e tem mecanismo de atualização periódica funcional
  3. O projeto Supabase está ativo, schema criado (tabelas users, jobs, results, csv_files) e cron de keep-alive confirmado em execução
  4. Usuário consegue criar conta, fazer login e manter sessão ativa ao fechar e reabrir o navegador
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Validation engine: pure TypeScript checks (syntax, role, disposable, typo, MX, catch-all), validateEmail() integration, full Vitest unit test coverage
- [ ] 01-02-PLAN.md — Supabase schema migration (jobs + validation_results, RLS), auth configuration, GitHub Actions keep-alive (INF-02) and disposable list auto-update (INF-03)

### Phase 2: API Worker + Bulk Pipeline
**Goal**: A API Hono está no ar e processa validações — manual (inline) e bulk (CSV via Queue) — com resultados gravados no Supabase
**Depends on**: Phase 1
**Requirements**: INF-01, INP-01, INP-02
**Success Criteria** (what must be TRUE):
  1. Um POST com até 20 e-mails inline retorna resultados completos (status, score, motivo) em resposta síncrona
  2. Upload de CSV dispara job assíncrono via Cloudflare Queues; o Consumer Worker processa cada e-mail e grava resultados no Supabase sem estourar o limite de CPU de 10ms do Worker HTTP
  3. O job no Supabase transita de pending → processing → complete/failed de forma atômica e rastreável
**Plans**: TBD

Plans:
- [ ] 02-01: Hono API Worker — auth middleware, single-email + manual-batch endpoint (INP-01)
- [ ] 02-02: CSV upload + Queues producer + Consumer Worker (INF-01, INP-02)

### Phase 3: Frontend Dashboard
**Goal**: O usuário consegue usar o Verimail completo pelo navegador — desde o login até baixar a lista limpa
**Depends on**: Phase 2
**Requirements**: OUT-01, OUT-02, OUT-03, OUT-04
**Success Criteria** (what must be TRUE):
  1. Usuário faz login, cola ou digita e-mails na interface manual e vê resultado por e-mail (status, score, motivo) sem sair da página
  2. Usuário faz upload de CSV, aguarda processamento e vê estatísticas da lista (% válido, % inválido, % risky, breakdown por motivo)
  3. Usuário baixa CSV limpo contendo apenas e-mails válidos após qualquer job concluído
  4. Usuário acessa histórico de jobs anteriores e re-baixa resultado de qualquer job passado
**Plans**: TBD

Plans:
- [ ] 03-01: Auth UI + manual validation UI + results view (OUT-02)
- [ ] 03-02: CSV upload UI + job status polling + statistics panel (OUT-01)
- [ ] 03-03: Download clean CSV + job history page (OUT-03, OUT-04)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Validator Core + Foundation | 1/2 | In Progress|  |
| 2. API Worker + Bulk Pipeline | 0/2 | Not started | - |
| 3. Frontend Dashboard | 0/3 | Not started | - |
