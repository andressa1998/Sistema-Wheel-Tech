-- Projetos/Tarefas — Wheel Tech
--
-- A coordenação (administradores) cria um projeto e designa um
-- destinatário. Só o destinatário escolhe o prazo (máx. 2 meses),
-- preenche o checklist de passo a passo e os custos (previsto x
-- final). Um projeto pode ser público (todos veem, só o
-- destinatário edita) ou particular (só administradores veem).
-- Só o usuário "ronald" pode excluir um projeto.

create table if not exists projetos_categorias (
    id bigserial primary key,
    nome text not null unique,
    criado_por text,
    criado_em timestamptz not null default now()
);

create table if not exists projetos_tarefas (
    id bigserial primary key,

    titulo text not null,
    descricao text,
    categoria text,

    destinatario text not null,   -- username de quem vai executar o projeto
    designado_por text not null,  -- username do administrador que criou

    prazo date,                   -- só o destinatário define (máx. 2 meses a partir de hoje)
    prazo_definido_em timestamptz,

    visibilidade text not null default 'publico', -- publico | particular

    status text not null default 'pendente_prazo', -- pendente_prazo | em_andamento | concluido

    checklist jsonb not null default '[]'::jsonb, -- [{ id, texto, concluido }]

    custo_previsto numeric,
    custo_final numeric,

    concluido_em timestamptz,

    criado_por text not null,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

create index if not exists idx_projetos_destinatario on projetos_tarefas(destinatario);
create index if not exists idx_projetos_status on projetos_tarefas(status);
create index if not exists idx_projetos_visibilidade on projetos_tarefas(visibilidade);

alter table projetos_tarefas enable row level security;

drop policy if exists "projetos_tarefas_all" on projetos_tarefas;
create policy "projetos_tarefas_all"
    on projetos_tarefas
    for all
    using (true)
    with check (true);

alter table projetos_categorias enable row level security;

drop policy if exists "projetos_categorias_all" on projetos_categorias;
create policy "projetos_categorias_all"
    on projetos_categorias
    for all
    using (true)
    with check (true);
