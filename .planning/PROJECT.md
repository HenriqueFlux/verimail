# Verimail

## What This Is

Verimail é um validador de e-mails web que limpa listas antes de disparos no RD Station, eliminando bounces causados por endereços com sintaxe inválida, domínios inexistentes, sem registro MX, descartáveis ou de role. Opera 100% em free tier (Cloudflare Workers + Supabase) — sem verificação SMTP. Começa como ferramenta interna, com visão de SaaS público.

## Core Value

Reduzir bounces hard o suficiente para que disparos no RD Station não causem bloqueio de conta — sem custo de infraestrutura.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Usuário pode criar conta e fazer login
- [ ] Usuário pode fazer upload de CSV com lista de e-mails
- [ ] Usuário pode colar/digitar e-mails para validação manual
- [ ] Sistema valida cada e-mail (sintaxe, domínio, MX, disposable, role-based, typo)
- [ ] Usuário vê score e motivo por e-mail
- [ ] Usuário vê estatísticas da lista (% válido, % inválido, breakdown por motivo)
- [ ] Usuário pode baixar CSV limpo (apenas e-mails válidos)
- [ ] Histórico de validações por conta

### Out of Scope

- Verificação SMTP (mailbox existe) — requer VPS com porta 25; planejado para v2
- API REST pública — v2 após validar produto com dashboard
- Widget de formulário (JS snippet) — v2
- Billing/planos pagos — v2 quando abrir SaaS
- Real-time validation em formulários externos — v2

## Context

- **Stack decidida**: Cloudflare Workers (API + lógica) + Supabase (auth, DB, storage)
- **DNS/MX lookup**: Cloudflare Workers via fetch para DNS-over-HTTPS (8.8.8.8 ou Cloudflare 1.1.1.1)
- **Lista disposable**: open-source `disposable-email-domains` (~50k domínios)
- **Typo detection**: comparação fuzzy com lista de domínios populares (gmail, hotmail, yahoo, uol etc.)
- **Caso de uso primário**: limpar lista CSV antes de importar no RD Station Marketing
- **Mercado-alvo inicial**: agências e operadores de email marketing BR
- **Concorrente de referência**: SafetyMails (safetymails.com)

## Constraints

- **Tech Stack**: Cloudflare Workers + Supabase — free tier como piso; sem VPS/servidor dedicado
- **Sem SMTP**: Não verifica existência real da caixa postal — limitação conhecida e aceita para v1
- **Custo zero**: Infraestrutura deve caber nos free tiers (Workers 100k req/dia, Supabase 50k rows)
- **Mercado**: Brasil — português, LGPD awareness, integração RD Station como caso de uso principal

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Cloudflare Workers sem VPS | Free tier, zero infra, suficiente para 80% dos bounces | — Pending |
| Dashboard antes de API | Valida produto com usuários reais antes de abrir API pública | — Pending |
| Multi-tenant com auth | Permite histórico, cotas e evolução para SaaS | — Pending |
| Sem SMTP v1 | Complexidade e custo não justificados para o caso de uso de RD Station | — Pending |

---
*Last updated: 2026-05-21 after initialization*
