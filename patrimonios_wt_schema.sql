-- Patrimônios WT — Wheel Tech
--
-- Controle dos equipamentos/patrimônios da empresa (notebooks,
-- Kindles, etc.), espelhando a planilha usada hoje. A garantia é
-- guardada como data de vencimento pra poder avisar quando estiver
-- acabando. O anexo da NF-e fica salvo em base64 direto na linha
-- (mesmo padrão já usado no sistema pra foto de avatar), sem
-- precisar de bucket de storage.

create table if not exists patrimonios_wt (
    id bigserial primary key,

    numero_serie text,
    equipamento text not null,
    esta_com text,
    setor text,
    numero_patrimonio text,

    garantia_vencimento date,
    data_compra date,
    valor numeric,

    nfe_numero text,
    nfe_arquivo_nome text,
    nfe_arquivo_tipo text,
    nfe_arquivo_base64 text,

    marca text,
    localizacao text,
    status text not null default 'ativo', -- ativo | inativo | manutencao | baixado
    validado_em date,
    observacoes text,

    criado_por text,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

create index if not exists idx_patrimonios_status on patrimonios_wt(status);
create index if not exists idx_patrimonios_garantia on patrimonios_wt(garantia_vencimento);

alter table patrimonios_wt enable row level security;

drop policy if exists "patrimonios_wt_all" on patrimonios_wt;
create policy "patrimonios_wt_all"
    on patrimonios_wt
    for all
    using (true)
    with check (true);
