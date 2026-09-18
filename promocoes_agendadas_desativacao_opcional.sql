-- Permite promoções agendadas sem data de desativação (ficam ativas
-- até o fim da promoção em si, sem precisar de uma data fixa pra
-- desativar). A data de ativação continua obrigatória.
--
-- O check constraint de período (data_desativacao > data_ativacao),
-- se existir, não precisa mudar: no Postgres, uma comparação com
-- NULL nunca "viola" um CHECK — ela é tratada como desconhecida e
-- passa normalmente.

alter table promocoes_agendadas
    alter column data_desativacao drop not null;
