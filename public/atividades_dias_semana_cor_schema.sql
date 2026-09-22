-- Controle de Atividades: permite escolher dias específicos da semana
-- (ex: seg/qua/sex) para atividades de frequência "semana", e uma cor
-- própria que é usada também no espelho do Calendário.

alter table atividades_colaboradores add column if not exists dias_semana integer[];
alter table atividades_colaboradores add column if not exists cor text;
