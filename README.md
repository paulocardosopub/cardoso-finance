# Cardoso Finance V2

Base V0.1 de gestão patrimonial pessoal, familiar e empresarial, com foco em holdings e imóveis.

## Executar localmente

```bash
npm install
copy .env.example .env.local
npm run dev
```

O projeto abre em `http://localhost:3000`. A interface usa exclusivamente os dados iniciais importados da planilha enviada. Quando as variáveis existirem, o cliente Supabase estará pronto para persistência real.

Após o deploy, o site público fica em `https://paulocardosopub.github.io/cardoso-finance/`.

Durante a implantação, o site exibe uma tela de acesso provisória. A senha temporária é `17011941`; ela será substituída pelo login Supabase na próxima etapa.

Os dados iniciais de imóveis foram importados de `dados imoveis.xlsx` e organizados em 21 prédios/grupos e suas unidades, mantendo lojas, kitnets, apartamentos, salas, terrenos e itens compostos.

## Supabase

1. Crie um projeto no Supabase.
2. Copie a URL e a chave pública para `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon
```

3. Aplique `supabase/migrations/202608200001_initial_schema.sql` pelo SQL Editor ou pela Supabase CLI.

A migration cria as entidades multi-organização, função segura para criação de organizações, trigger de perfis, índices, políticas RLS e bucket privado `organization-documents`.

## Estrutura

- `app/`: rotas App Router (dashboard, autenticação, imóveis, financeiro e organização)
- `components/`: shell, navegação e visualizações reutilizáveis
- `lib/`: dados iniciais importados, formatação e cliente Supabase
- `supabase/migrations/`: schema versionado, RLS, Storage e funções
- `supabase/seed/`: seeds opcionais para dados reais após a criação do usuário
- `types/`: tipos de domínio compartilhados

## Validação

```bash
npm run typecheck
npm run lint
npm run build
```

## Estado da V0.1

A fatia local e pública navegável está pronta para validação visual e de fluxo. O próximo passo de produto é conectar os formulários de organizações, imóveis, unidades, locações e financeiro aos CRUDs Supabase usando o schema já versionado.
