# Phase 1: Validator Core + Foundation - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Motor de validação TypeScript puro + schema Supabase + auth (criar conta, login, sessão persistente, logout) + cron keep-alive. Tudo testável via unit tests antes de qualquer interface. Fases 2 e 3 consomem este motor — a API shape definida aqui é o contrato.

</domain>

<decisions>
## Implementation Decisions

### Formato de resultado por e-mail

- 3 status possíveis: `valid` / `invalid` / `risky`
- Typo = `invalid` com campo `suggestion` opcional (ex: `suggestion: 'gmail.com'`) — presente só quando typo detectado
- Apenas o motivo principal (primeiro check que reprovou) — não array de todos os motivos
- O e-mail original sempre incluso no objeto retornado
- Estrutura TypeScript: `{ email: string, status: 'valid' | 'invalid' | 'risky', score: number, reason: string | null, suggestion?: string }`
- `reason` é `null` para e-mails válidos; valores: `syntax` / `no-domain` / `no-mx` / `disposable` / `role` / `catch-all` / `typo`

### Modelo de score/risco

- Score de risco (0 = seguro, 100 = bounce garantido)
- `valid` = score 0
- `risky` (catch-all) = score 50
- `invalid` = score 100 — aplica a TODOS os checks de falha: sintaxe, domínio, MX, disposable, role-based, typo
- Role-based (info@, noreply@, sac@ etc.) = `invalid`, score 100 — sem distinção de outros invalids
- Não há scores intermediários para diferentes tipos de falha — é binário: passou tudo (0), catch-all (50), falhou (100)

### Lista de domínios descartáveis

- Bundle no código como `Set<string>` no deploy-time — sem KV, sem fetch em runtime
- Pacote: `disposable-email-domains-js` (~60k domínios, CC0, atualização semanal pelo mantenedor)
- Atualização periódica (INF-03): GitHub Action semanal que puxa nova versão do pacote e só commita + deploya se houver diff na lista
- Nenhuma dependência de infraestrutura externa no path de validação — lookup é O(1) em memória

### Detecção de catch-all

- Estratégia em 2 camadas: (1) lista estática curada de domínios catch-all conhecidos + (2) heurística MX
- Heurística MX: domínio com servidor MX próprio (não Gmail / Outlook / Yahoo / ProtonMail / iCloud / outros grandes ESPs) → marca como `risky` (potencial catch-all)
- Lista curada hardcoded no código, atualizada manualmente quando necessário — sem fonte pública para automatizar
- Claude gera a lista inicial com os domínios corporativos mais comuns conhecidos por operar catch-all

### Claude's Discretion

- Estrutura de arquivos/módulos do validation engine (como organizar os checks internamente)
- Ordem exata dos checks (ex: sintaxe antes de DNS antes de disposable)
- Implementação do DNS lookup via fetch para DNS-over-HTTPS (qual endpoint: 8.8.8.8 vs 1.1.1.1)
- Lista de domínios populares para o typo checker (gmail, hotmail, yahoo, uol, hotmail.com.br etc.) — Claude define a lista inicial
- Lista inicial de role-based prefixes (info, noreply, contato, sac, atendimento, faturamento, admin, suporte, vendas, financeiro etc.)
- Schema Supabase exato (campos, tipos, índices) — desde que cubra users, jobs, results, csv_files
- Configuração do Supabase Auth (e-mail/senha, confirmação de e-mail: sim ou não para v1)
- Implementação do cron keep-alive (GitHub Action ping vs Supabase Edge Function vs CF Cron Trigger)

</decisions>

<specifics>
## Specific Ideas

- Referência de concorrente: safetymails.com — ver como apresentam status/score na UI (influencia nomenclatura)
- O objetivo final é reduzir bounces abaixo de 3% no RD Station — o score serve para o usuário filtrar sua lista com threshold configurável na UI
- Caso de uso primário: limpar CSV antes de importar no RD Station — o engine precisa processar listas, não apenas e-mails únicos

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets

- Nenhum código existente — projeto greenfield

### Established Patterns

- Nenhum padrão estabelecido — este é o ponto de partida

### Integration Points

- O validation engine (Fase 1) será consumido pelo Hono API Worker (Fase 2) como import direto
- O schema Supabase (Fase 1) é a fonte de dados de todas as fases subsequentes

</code_context>

<deferred>
## Deferred Ideas

- Nenhuma ideia fora de escopo surgiu durante a discussão

</deferred>

---

*Phase: 01-validator-core-foundation*
*Context gathered: 2026-05-21*
