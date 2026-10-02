-- Escada automática de preços por classificação de reposição
-- (fácil / médio / difícil). Usada por public/escada_automatica.js.
-- Rodar uma vez no SQL Editor do Supabase.

-- Liga/desliga geral (linha única, id = 1).
CREATE TABLE IF NOT EXISTS public.escada_auto_config (
    id integer PRIMARY KEY DEFAULT 1,
    ligado boolean NOT NULL DEFAULT true,
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_por text
);
INSERT INTO public.escada_auto_config (id, ligado) VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

-- Classificação escolhida por fornecedor ou por categoria.
-- Vale a seleção mais recente (definido_em) entre as que pegam o produto.
CREATE TABLE IF NOT EXISTS public.escada_auto_classificacao (
    id bigserial PRIMARY KEY,
    tipo text NOT NULL CHECK (tipo IN ('fornecedor', 'categoria')),
    chave text NOT NULL,
    nome text,
    classificacao text NOT NULL CHECK (classificacao IN ('facil', 'medio', 'dificil')),
    definido_em timestamptz NOT NULL DEFAULT now(),
    definido_por text,
    UNIQUE (tipo, chave)
);

-- Estado de cada produto na escada: último estoque visto e os degraus
-- já aplicados (com o preço antes/depois de cada MLB, para desfazer).
CREATE TABLE IF NOT EXISTS public.escada_auto_estado (
    produto_id text PRIMARY KEY,
    produto_sku text,
    produto_nome text,
    ultimo_estoque integer NOT NULL DEFAULT 0,
    degraus jsonb NOT NULL DEFAULT '[]'::jsonb,
    ultimo_aviso_sem_venda timestamptz,
    versao integer NOT NULL DEFAULT 0,
    atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Avisos para o usuário (alteração feita, recomendação, pendência).
CREATE TABLE IF NOT EXISTS public.escada_auto_avisos (
    id bigserial PRIMARY KEY,
    produto_id text NOT NULL,
    produto_sku text,
    produto_nome text,
    tipo text NOT NULL,          -- aplicado | manual | promocao | reposicao | sem_venda
    classificacao text,
    niveis jsonb,                -- degraus envolvidos
    mlbs jsonb,                  -- [{mlb, antes, depois, ok, erro, motivo}]
    detalhe text,
    status text NOT NULL DEFAULT 'pendente',   -- pendente | resolvido | desfeito
    visto boolean NOT NULL DEFAULT false,
    criado_em timestamptz NOT NULL DEFAULT now(),
    resolvido_em timestamptz,
    resolvido_por text
);
CREATE INDEX IF NOT EXISTS escada_auto_avisos_status_idx ON public.escada_auto_avisos (status, criado_em DESC);
CREATE INDEX IF NOT EXISTS escada_auto_avisos_produto_idx ON public.escada_auto_avisos (produto_id);

-- Anúncios em cupom do vendedor. A API do Mercado Livre não informa
-- cupons, então a lista é mantida à mão. mlb = '*' vale para todos.
CREATE TABLE IF NOT EXISTS public.anuncios_em_cupom (
    id bigserial PRIMARY KEY,
    mlb text NOT NULL,
    descricao text,
    valido_ate date,
    criado_em timestamptz NOT NULL DEFAULT now(),
    criado_por text
);
