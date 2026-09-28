-- Perfil do comprador nas Perguntas ML: guarda o ID numérico do
-- comprador (pra cruzar com vendas_nfe_cache) e o controle de
-- exclusão (soft delete, mantém histórico de perguntas excluídas).

alter table perguntas_ml
    add column if not exists comprador_id text,
    add column if not exists excluida boolean not null default false,
    add column if not exists excluida_por text,
    add column if not exists excluida_em timestamptz;

create index if not exists idx_perguntas_ml_comprador_id
    on perguntas_ml (comprador_id);
