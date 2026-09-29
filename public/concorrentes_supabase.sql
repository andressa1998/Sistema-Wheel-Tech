-- Aba Concorrentes (concorrentes.js): vendedores do Mercado Livre
-- acompanhados e o histórico de coletas (situação, total de
-- negociações, anúncios ativos e nível MercadoLíder).

create table if not exists concorrentes_ml (
    id bigint generated always as identity primary key,
    nickname text not null,
    criado_em timestamptz not null default now()
);

alter table concorrentes_ml
    add column if not exists ml_user_id text,
    add column if not exists permalink text,
    add column if not exists ultima_consulta timestamptz,
    add column if not exists ultimo_erro text;

create unique index if not exists idx_concorrentes_ml_user_id
    on concorrentes_ml (ml_user_id)
    where ml_user_id is not null;

create table if not exists concorrentes_ml_historico (
    id bigint generated always as identity primary key,
    concorrente_id bigint not null references concorrentes_ml(id) on delete cascade,
    coletado_em timestamptz not null default now(),
    ativo boolean not null,
    total_negociacoes integer not null,
    anuncios_ativos integer,
    nivel text not null,
    origem text not null default 'API'
);

-- Anúncios ativos pode não estar disponível em algumas coletas.
alter table concorrentes_ml_historico
    alter column anuncios_ativos drop not null;

create index if not exists idx_concorrentes_ml_historico_concorrente
    on concorrentes_ml_historico (concorrente_id, coletado_em);

-- Origem aceita: coleta automática (API) ou medição manual.
alter table concorrentes_ml_historico
    drop constraint if exists concorrentes_ml_historico_origem_check;
alter table concorrentes_ml_historico
    add constraint concorrentes_ml_historico_origem_check
    check (origem in ('API', 'Manual'));

-- Permissões (RLS): a tela lê, cadastra, atualiza e exclui.
alter table concorrentes_ml enable row level security;
alter table concorrentes_ml_historico enable row level security;

drop policy if exists concorrentes_ml_select on concorrentes_ml;
drop policy if exists concorrentes_ml_insert on concorrentes_ml;
drop policy if exists concorrentes_ml_update on concorrentes_ml;
drop policy if exists concorrentes_ml_delete on concorrentes_ml;
create policy concorrentes_ml_select on concorrentes_ml for select to anon, authenticated using (true);
create policy concorrentes_ml_insert on concorrentes_ml for insert to anon, authenticated with check (true);
create policy concorrentes_ml_update on concorrentes_ml for update to anon, authenticated using (true) with check (true);
create policy concorrentes_ml_delete on concorrentes_ml for delete to anon, authenticated using (true);

drop policy if exists concorrentes_ml_historico_select on concorrentes_ml_historico;
drop policy if exists concorrentes_ml_historico_insert on concorrentes_ml_historico;
drop policy if exists concorrentes_ml_historico_delete on concorrentes_ml_historico;
create policy concorrentes_ml_historico_select on concorrentes_ml_historico for select to anon, authenticated using (true);
create policy concorrentes_ml_historico_insert on concorrentes_ml_historico for insert to anon, authenticated with check (true);
create policy concorrentes_ml_historico_delete on concorrentes_ml_historico for delete to anon, authenticated using (true);
