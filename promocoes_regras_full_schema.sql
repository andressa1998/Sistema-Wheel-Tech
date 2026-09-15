-- ============================================================
-- REGRAS DE PROMOÇÃO POR "DIAS SEM VENDER NO FULL"
--
-- Usada pelo botão "🏷️ Promoção" na aba Gerenciamento de Anúncios.
-- Em vez de agendar uma promoção para uma DATA fixa, o usuário pode
-- criar uma regra do tipo: "quando este MLB ficar N dias sem vender
-- no FULL, agende esta promoção". O motor em promocoes_manager.js
-- (avaliarRegrasPromocoesFull) fica checando essa condição em
-- segundo plano e, quando ela é atendida, cria automaticamente um
-- registro em `promocoes_agendadas` com ativação imediata — a
-- partir daí o aviso "promoção pronta para ativar" (o mesmo modal
-- que já existe para os agendamentos por data) aparece normalmente
-- para Bruna/Ronald.
--
-- Rode este script manualmente no SQL Editor do Supabase.
-- ============================================================

create table if not exists promocoes_regras_full (
    id bigint generated always as identity primary key,

    -- Identificação do item (mesma convenção de "chave" usada na
    -- tabela gerenciamento_anuncios_ml: "{item_id}:{variation_id||0}")
    mlb text not null,
    chave text not null,
    variation_id text,
    titulo text,

    -- Promoção escolhida (mesmos campos de promocoes_agendadas)
    promotion_id text not null,
    promotion_name text,
    promotion_type text not null,
    valor_final numeric not null,

    -- Condição da regra
    dias_sem_venda integer not null,

    -- aguardando_condicao | disparando | agendada | cancelada | erro
    status text not null default 'aguardando_condicao',

    criada_por text,
    criado_em timestamptz not null default now(),

    -- Preenchidos quando a condição é atendida e a regra "dispara"
    disparada_em timestamptz,
    agendamento_id bigint references promocoes_agendadas(id),

    -- Preenchido se o motor tentar disparar e falhar
    erro text,

    cancelada_por text,
    cancelada_em timestamptz
);

create index if not exists idx_promocoes_regras_full_status
    on promocoes_regras_full(status);

create index if not exists idx_promocoes_regras_full_chave
    on promocoes_regras_full(chave);
