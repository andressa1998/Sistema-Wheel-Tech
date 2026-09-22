-- Fluxo de "aguardando teste" nos Chamados: quando o admin corrige e
-- marca a resposta como pedido de teste, o chamado vai pro status
-- 'aguardando_teste' até quem abriu confirmar se funcionou ou não.

alter table chamados add column if not exists resultado_teste text check (resultado_teste in ('ok', 'falhou'));
alter table chamados add column if not exists testado_em timestamptz;
alter table chamados add column if not exists testado_por text;
alter table chamados add column if not exists observacao_teste text;
