# Requirements: Verimail

**Defined:** 2026-05-21
**Core Value:** Reduzir bounces hard abaixo de 3% para que disparos no RD Station não causem bloqueio de conta — sem custo de infraestrutura.

## v1 Requirements

### Authentication

- [x] **AUTH-01**: Usuário pode criar conta com e-mail e senha
- [x] **AUTH-02**: Sessão persiste após fechar e reabrir o navegador
- [x] **AUTH-03**: Usuário pode fazer logout de qualquer página

### Validation Engine

- [x] **VAL-01**: Sistema valida sintaxe do e-mail (formato RFC, caracteres proibidos)
- [x] **VAL-02**: Sistema verifica existência do domínio no DNS
- [x] **VAL-03**: Sistema verifica registro MX do domínio (aceita e-mail)
- [x] **VAL-04**: Sistema detecta domínios descartáveis (≥60k domínios, lista open-source)
- [x] **VAL-05**: Sistema detecta e-mails role-based (info@, contato@, noreply@, sac@, atendimento@, faturamento@, admin@ etc.)
- [x] **VAL-06**: Sistema detecta typos em domínios comuns e sugere correção (gamil→gmail, hotmal→hotmail, uool→uol etc.)
- [x] **VAL-07**: Sistema detecta domínios catch-all e marca como "risky"
- [x] **VAL-08**: Sistema atribui score de risco 0–100 por e-mail
- [x] **VAL-09**: Sistema registra o motivo de reprovação por e-mail (syntax / no-domain / no-mx / disposable / role / catch-all / typo)

### Input

- [ ] **INP-01**: Usuário pode colar ou digitar uma lista de e-mails para validação manual (até 20 e-mails inline)
- [ ] **INP-02**: Usuário pode fazer upload de arquivo CSV com lista de e-mails para validação em bulk

### Output & Results

- [ ] **OUT-01**: Usuário vê estatísticas da lista: % válido, % inválido, % risky, breakdown por motivo
- [ ] **OUT-02**: Usuário vê resultado por e-mail: status, score, motivo
- [ ] **OUT-03**: Usuário pode baixar CSV limpo contendo apenas e-mails válidos
- [ ] **OUT-04**: Usuário tem acesso ao histórico de jobs de validação anteriores com download disponível

### Infrastructure

- [ ] **INF-01**: Validação bulk processada via fila assíncrona (Cloudflare Queues) para respeitar limite de CPU do Workers free tier
- [x] **INF-02**: Sistema mantém Supabase ativo via cron ping (evitar pausa por inatividade)
- [x] **INF-03**: Lista de domínios descartáveis tem mecanismo de atualização periódica

## v2 Requirements

### Authentication

- **AUTH-04**: Reset de senha via e-mail
- **AUTH-05**: Login por magic link (sem senha)

### API

- **API-01**: Endpoint REST para validação de e-mail único (integração externa)
- **API-02**: Gerenciamento de API keys por conta
- **API-03**: Rate limiting por API key

### Output

- **OUT-05**: Export no formato de colunas de importação do RD Station

### SaaS

- **SAAS-01**: Planos e cotas de uso por conta
- **SAAS-02**: Billing e pagamento
- **SAAS-03**: Página de onboarding / welcome

### Validation

- **VAL-10**: Verificação SMTP (requer VPS com porta 25 — fora do free tier)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Verificação SMTP (mailbox existe) | Requer VPS com porta 25 — planejado v2 com infraestrutura paga |
| Widget JS para formulários externos | Alta complexidade, não é o caso de uso primário |
| Integração direta RD Station API | v2 após validar produto com dashboard |
| Autenticação social (Google, LinkedIn) | Supabase suporta, mas não é necessário para v1 |
| Real-time validation durante digitação | UX incremental, não crítico para v1 |
| Notificações por e-mail ao terminar job | v2 — útil para listas grandes mas não bloqueante |
| Multi-tenancy / workspaces de equipe | v2 — começa como ferramenta individual |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| VAL-01 | Phase 1 | Complete |
| VAL-02 | Phase 1 | Complete |
| VAL-03 | Phase 1 | Complete |
| VAL-04 | Phase 1 | Complete |
| VAL-05 | Phase 1 | Complete |
| VAL-06 | Phase 1 | Complete |
| VAL-07 | Phase 1 | Complete |
| VAL-08 | Phase 1 | Complete |
| VAL-09 | Phase 1 | Complete |
| INF-02 | Phase 1 | Complete |
| INF-03 | Phase 1 | Complete |
| INF-01 | Phase 2 | Pending |
| INP-01 | Phase 2 | Pending |
| INP-02 | Phase 2 | Pending |
| OUT-01 | Phase 3 | Pending |
| OUT-02 | Phase 3 | Pending |
| OUT-03 | Phase 3 | Pending |
| OUT-04 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-21*
*Last updated: 2026-05-21 — VAL-01 through VAL-09 completed in plan 01-01*
