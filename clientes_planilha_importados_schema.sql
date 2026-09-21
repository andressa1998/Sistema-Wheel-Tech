-- Importação em massa de clientes (planilha) na aba de Emissão de
-- Nota — só o usuário andressamiotto tem acesso a essa função.
--
-- O cadastro OFICIAL de clientes de NF-e (sistema externo, fora
-- deste repositório) exige CPF/CNPJ obrigatório pra salvar um
-- cliente (é exigência legal pra emitir nota). A planilha do usuário
-- não tem coluna de CPF/CNPJ — só nome/razão social, telefone,
-- celular, e-mail, cidade e estado. Por isso esses contatos ficam
-- guardados aqui, numa tabela própria, até alguém completar o
-- documento e "promover" o contato pra cliente oficial (o botão de
-- promover já pré-preenche nome/cidade/UF no cadastro oficial).

create table if not exists clientes_planilha_importados (
    id bigserial primary key,
    tipo_pessoa text,
    nome text not null,
    razao_social text,
    telefone text,
    celular text,
    email text,
    cidade text,
    estado text,
    documento text,
    cliente_nfe_id bigint,
    importado_por text,
    importado_em timestamptz not null default now()
);

create index if not exists idx_clientes_planilha_nome
    on clientes_planilha_importados (lower(nome));

alter table clientes_planilha_importados enable row level security;

drop policy if exists "clientes_planilha_importados_all" on clientes_planilha_importados;
create policy "clientes_planilha_importados_all" on clientes_planilha_importados for all using (true) with check (true);
