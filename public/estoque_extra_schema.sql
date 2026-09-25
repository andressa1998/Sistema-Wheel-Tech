-- Estoque extra: itens guardados em locais físicos separados
-- (Buraco, Mezanino, Parte de baixo, etc.), fora da contagem
-- normal da tabela produtos_estoque. Lista editável pela Andressa.

create table if not exists estoque_extra (
    id bigint generated always as identity primary key,
    localizacao text not null,
    texto text not null,
    produto_id bigint references produtos_estoque(id) on delete set null,
    ativo boolean not null default true,
    criado_por text,
    criado_em timestamptz not null default now(),
    atualizado_por text,
    atualizado_em timestamptz not null default now()
);

create index if not exists idx_estoque_extra_produto
    on estoque_extra (produto_id)
    where ativo = true;

create index if not exists idx_estoque_extra_ativo
    on estoque_extra (localizacao)
    where ativo = true;
