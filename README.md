# Cardoso Finance V2

Base V0.1 de gestão patrimonial pessoal, familiar e empresarial, com foco em holdings e imóveis.

## Executar localmente

```bash
npm install
copy .env.example .env.local
npm run dev
```

O projeto abre em `http://localhost:3000`. Sem variáveis do Supabase, a interface usa dados de demonstração para permitir a validação do produto e da navegação. Quando as variáveis existirem, o cliente Supabase estará pronto para persistência real.

## Supabase

1. Crie um projeto no Supabase.
2. Copie a URL e a chave pública para `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon
```

3. Aplique `supabase/migrations/202608200001_initial_schema.sql` pelo SQL Editor ou pela Supabase CLI.
4. Para dados demonstrativos, crie um usuário em Auth e substitua o UUID em `supabase/seed/demo.sql` antes de executá-lo.

A migration cria as entidades multi-organização, função segura para criação de organizações, trigger de perfis, índices, políticas RLS e bucket privado `organization-documents`.

## Estrutura

- `app/`: rotas App Router (dashboard, autenticação, imóveis, financeiro e organização)
- `components/`: shell, navegação e visualizações reutilizáveis
- `lib/`: dados de demonstração, formatação e cliente Supabase
- `supabase/migrations/`: schema versionado, RLS, Storage e funções
- `supabase/seed/`: seed opcional de demonstração
- `types/`: tipos de domínio compartilhados

## Validação

```bash
npm run typecheck
npm run lint
npm run build
```

## Estado da V0.1

A fatia local navegável está pronta para validação visual e de fluxo. O próximo passo de integração é conectar os formulários de autenticação e CRUD às tabelas Supabase usando o schema já versionado. Publicação no GitHub e aplicação das migrations exigem credenciais/repositório autorizados, que não estão presentes nesta sessão.
