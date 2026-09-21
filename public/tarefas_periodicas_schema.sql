-- Este arquivo substitui a tentativa anterior de criar um sistema de
-- tarefas periódicas do zero. Descobrimos que o módulo "Controle de
-- Atividades" (tabela atividades_colaboradores) já cobre isso — admin
-- designa atividades diárias/semanais/mensais, com prorrogação
-- automática de atrasadas. O painel "Minhas tarefas de hoje" do menu
-- inicial passou a ler direto dessa tabela existente.
--
-- Rode este DROP só se você chegou a rodar a versão antiga deste
-- arquivo (que criava a tabela tarefas_periodicas). Se nunca rodou,
-- não precisa rodar nada — é seguro rodar mesmo assim (idempotente).

drop table if exists tarefas_periodicas;
