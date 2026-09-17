-- Controle de Atividades (diárias/semanais/mensais) — Wheel Tech
--
-- A coordenação designa atividades para cada colaborador (dia todo,
-- semana toda ou mês todo). O colaborador marca como concluída. Se o
-- prazo passar sem conclusão, o sistema prorroga automaticamente para
-- hoje, mantendo o histórico da atividade original.

create table if not exists atividades_colaboradores (
    id bigserial primary key,

    titulo text not null,
    descricao text,
    categoria text,
    prioridade text not null default 'normal', -- normal | importante | urgente

    designado_para text not null,   -- username do colaborador responsável
    designado_por text not null,    -- username de quem criou/designou

    frequencia text not null default 'dia', -- dia | semana | mes
    data_inicio date not null,
    data_fim date not null,

    status text not null default 'pendente', -- pendente | concluida | prorrogada | cancelada
    concluida_em timestamptz,
    concluida_por text,

    prorrogada_de_id bigint references atividades_colaboradores(id) on delete set null,
    observacao text, -- ex.: "Prorrogada automaticamente — não concluída até 17/09/2026."

    agenda_evento_id bigint, -- espelho em agenda_eventos (calendário), quando existir

    criado_por text not null,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

create index if not exists idx_atividades_designado_para on atividades_colaboradores(designado_para);
create index if not exists idx_atividades_status on atividades_colaboradores(status);
create index if not exists idx_atividades_data_fim on atividades_colaboradores(data_fim);
create index if not exists idx_atividades_prorrogada_de on atividades_colaboradores(prorrogada_de_id);

alter table atividades_colaboradores enable row level security;

drop policy if exists "atividades_colaboradores_all" on atividades_colaboradores;
create policy "atividades_colaboradores_all"
    on atividades_colaboradores
    for all
    using (true)
    with check (true);
