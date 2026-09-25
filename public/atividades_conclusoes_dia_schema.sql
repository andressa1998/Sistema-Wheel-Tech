-- Controle de Atividades: conclusão por dia das atividades "Semana toda" / "Mês todo".
--
-- Essas atividades são recorrentes dentro do próprio prazo: a pessoa marca
-- que fez HOJE, e no dia seguinte a atividade volta a pedir ação (até
-- vencer o prazo). Uma linha aqui = "fulano concluiu esta atividade neste
-- dia". A tabela atividades_colaboradores continua tendo só uma linha por
-- atividade (o período inteiro); ela não guarda mais a conclusão do dia.
create table if not exists atividades_conclusoes_dia (
    id bigint generated always as identity primary key,
    atividade_id bigint not null references atividades_colaboradores(id) on delete cascade,
    data date not null,
    concluido_por text,
    concluido_em timestamptz not null default now(),
    unique (atividade_id, data)
);

create index if not exists atividades_conclusoes_dia_atividade_idx
    on atividades_conclusoes_dia (atividade_id);

create index if not exists atividades_conclusoes_dia_data_idx
    on atividades_conclusoes_dia (data);
