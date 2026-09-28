-- Impede duas reclamações de frete com o mesmo número de transação
-- (o app já bloqueia isso na tela; este índice é a garantia no banco
-- contra duas pessoas salvando ao mesmo tempo).

create unique index if not exists idx_reclamacoes_frete_numero_transacao_unico
    on reclamacoes_frete (numero_transacao)
    where numero_transacao is not null and numero_transacao <> '';
