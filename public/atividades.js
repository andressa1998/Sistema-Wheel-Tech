// ================================================================
// CONTROLE DE ATIVIDADES — WHEEL TECH
// ================================================================
//
// Substitui o Trello para a coordenação designar atividades diárias,
// semanais ou mensais para cada colaborador. Cada um só vê as suas
// próprias atividades; administradores veem e gerenciam as de todo
// mundo, além de um relatório com gráfico de acompanhamento.
//
// Atividades atrasadas (prazo passou sem conclusão) são prorrogadas
// automaticamente para hoje, com uma observação explicando o motivo
// — a atividade original fica marcada como "prorrogada" no histórico,
// e vira uma nova atividade "pendente" com prazo hoje.
//
// Cada atividade também é espelhada em agenda_eventos (tipo:'tarefa'),
// pra aparecer no Calendário/"Tarefas de hoje" sem trabalho duplicado.
// ================================================================

(() => {
    'use strict';

    const CFG_ATIV = {
        tabela: 'atividades_colaboradores',
        tabelaAgenda: 'agenda_eventos'
    };

    const CORES_PRIORIDADE = {
        normal: '#0875ee',
        importante: '#fd7e14',
        urgente: '#dc3545'
    };

    const NOMES_PRIORIDADE = {
        normal: 'Normal',
        importante: 'Importante',
        urgente: 'Urgente'
    };

    const NOMES_FREQUENCIA = {
        dia: 'Dia todo',
        semana: 'Semana toda',
        mes: 'Mês todo'
    };

    let atividadesCache = [];
    let filtroStatusAtiv = 'ativas'; // ativas | concluidas | todas
    let filtroColaboradorAtiv = '';
    let filtroBuscaAtiv = '';
    let jaProrrogouHoje = false;

    // ============================================================
    // USUÁRIO / PERMISSÃO
    // ============================================================

    function usuarioAtualAtiv() {
        return window.currentUser || null;
    }

    function usernameAtiv(usuario = usuarioAtualAtiv()) {
        if (!usuario) return '';
        return String(usuario.username || usuario.name || '').trim().toLowerCase();
    }

    function ehAdminAtiv() {
        const u = usuarioAtualAtiv();
        return !!u && u.role === 'Administrador';
    }

    function nomeExibicaoUsuarioAtiv(username) {
        const alvo = String(username || '').trim().toLowerCase();
        const lista = obterColaboradoresAtiv();
        const achado = lista.find(u => u.username === alvo);
        return achado ? achado.name : (username || '—');
    }

    function obterColaboradoresAtiv() {
        const mapear = u => ({
            username: String(u.username || '').trim().toLowerCase(),
            name: u.name || u.username,
            role: u.role || '',
            avatar: u.avatar || (u.name || u.username || 'U').charAt(0).toUpperCase(),
            avatarFoto: u.avatarFoto || u.avatar_foto || null
        });

        if (Array.isArray(window.SYSTEM_USERS) && window.SYSTEM_USERS.length) {
            return window.SYSTEM_USERS
                .map(mapear)
                .filter(u => u.username)
                .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
        }
        try {
            if (typeof SYSTEM_USERS !== 'undefined' && Array.isArray(SYSTEM_USERS)) {
                return SYSTEM_USERS
                    .map(mapear)
                    .filter(u => u.username)
                    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
            }
        } catch (e) {}
        return [];
    }

    function renderizarAvatarColaboradorAtiv(username) {
        const colaborador = obterColaboradoresAtiv().find(u => u.username === username);
        const nome = colaborador ? colaborador.name : nomeExibicaoUsuarioAtiv(username);
        const letra = (colaborador?.avatar || nome || 'U').charAt(0).toUpperCase();

        if (colaborador?.avatarFoto) {
            return `<div class="ativ-grupo-avatar"><img src="${colaborador.avatarFoto}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;"></div>`;
        }
        return `<div class="ativ-grupo-avatar">${escapeAtiv(letra)}</div>`;
    }

    // ============================================================
    // DATAS
    // ============================================================

    function isoDataAtiv(d) {
        return d.toISOString().slice(0, 10);
    }

    function hojeIsoAtiv() {
        return isoDataAtiv(new Date());
    }

    function formatarDataBrAtiv(iso) {
        if (!iso) return '—';
        const [ano, mes, dia] = String(iso).split('-');
        return `${dia}/${mes}/${ano}`;
    }

    function calcularPeriodoAtiv(frequencia, dataReferenciaIso) {
        const data = new Date(`${dataReferenciaIso}T00:00:00`);

        if (frequencia === 'semana') {
            const diaSemana = data.getDay(); // 0 = domingo
            const diffSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
            const inicio = new Date(data);
            inicio.setDate(data.getDate() + diffSegunda);
            const fim = new Date(inicio);
            fim.setDate(inicio.getDate() + 6);
            return { data_inicio: isoDataAtiv(inicio), data_fim: isoDataAtiv(fim) };
        }

        if (frequencia === 'mes') {
            const inicio = new Date(data.getFullYear(), data.getMonth(), 1);
            const fim = new Date(data.getFullYear(), data.getMonth() + 1, 0);
            return { data_inicio: isoDataAtiv(inicio), data_fim: isoDataAtiv(fim) };
        }

        return { data_inicio: dataReferenciaIso, data_fim: dataReferenciaIso };
    }

    function periodoTextoAtiv(atividade) {
        if (atividade.data_inicio === atividade.data_fim) {
            return formatarDataBrAtiv(atividade.data_inicio);
        }
        return `${formatarDataBrAtiv(atividade.data_inicio)} a ${formatarDataBrAtiv(atividade.data_fim)}`;
    }

    // ============================================================
    // ESPELHO NO CALENDÁRIO (agenda_eventos)
    // ============================================================

    async function criarEspelhoAgendaAtiv(atividade) {
        try {
            const { data, error } = await window.supabaseClient
                .from(CFG_ATIV.tabelaAgenda)
                .insert([{
                    titulo: atividade.titulo,
                    tipo: 'tarefa',
                    responsavel: nomeExibicaoUsuarioAtiv(atividade.designado_para),
                    data_inicio: atividade.data_inicio,
                    data_fim: atividade.data_fim,
                    descricao: atividade.descricao || null,
                    cor: CORES_PRIORIDADE[atividade.prioridade] || CORES_PRIORIDADE.normal,
                    dia_inteiro: true,
                    destaque: atividade.prioridade === 'urgente',
                    criado_por: atividade.criado_por,
                    criado_em: new Date().toISOString(),
                    atualizado_em: new Date().toISOString()
                }])
                .select()
                .single();

            if (error) throw error;
            return data?.id || null;

        } catch (error) {
            console.warn('⚠️ [Atividades] Não foi possível espelhar no calendário:', error);
            return null;
        }
    }

    async function removerEspelhoAgendaAtiv(agendaEventoId) {
        if (!agendaEventoId) return;
        try {
            await window.supabaseClient
                .from(CFG_ATIV.tabelaAgenda)
                .delete()
                .eq('id', agendaEventoId);
        } catch (error) {
            console.warn('⚠️ [Atividades] Não foi possível remover espelho do calendário:', error);
        }
        try {
            await window.carregarAgendaSemanal?.();
        } catch (e) {}
    }

    // ============================================================
    // PRORROGAÇÃO AUTOMÁTICA
    //
    // Roda toda vez que a tela abre (idempotente por natureza: uma
    // vez prorrogada, o status deixa de ser "pendente", então a
    // query de atrasadas nunca mais pega a mesma atividade de novo —
    // não depende de nenhum controle de horário/última execução).
    // ============================================================

    async function executarProrrogacaoAutomaticaAtiv() {
        if (jaProrrogouHoje) return;

        try {
            const hoje = hojeIsoAtiv();

            const { data: atrasadas, error } = await window.supabaseClient
                .from(CFG_ATIV.tabela)
                .select('*')
                .eq('status', 'pendente')
                .lt('data_fim', hoje);

            if (error) throw error;

            if (!Array.isArray(atrasadas) || !atrasadas.length) {
                jaProrrogouHoje = true;
                return;
            }

            console.log(`⏭️ [Atividades] Prorrogando ${atrasadas.length} atividade(s) atrasada(s)...`);

            for (const antiga of atrasadas) {

                const novaObservacao =
                    `Prorrogada automaticamente — não foi concluída até ${formatarDataBrAtiv(antiga.data_fim)}, então foi movida para hoje.`;

                const novaAtividade = {
                    titulo: antiga.titulo,
                    descricao: antiga.descricao,
                    categoria: antiga.categoria,
                    prioridade: antiga.prioridade,
                    designado_para: antiga.designado_para,
                    designado_por: antiga.designado_por,
                    frequencia: 'dia',
                    data_inicio: hoje,
                    data_fim: hoje,
                    status: 'pendente',
                    prorrogada_de_id: antiga.id,
                    observacao: novaObservacao,
                    criado_por: 'sistema',
                    criado_em: new Date().toISOString(),
                    atualizado_em: new Date().toISOString()
                };

                novaAtividade.agenda_evento_id = await criarEspelhoAgendaAtiv(novaAtividade);

                const { error: erroInsercao } = await window.supabaseClient
                    .from(CFG_ATIV.tabela)
                    .insert([novaAtividade]);

                if (erroInsercao) {
                    console.warn('⚠️ [Atividades] Erro criando prorrogação:', erroInsercao);
                    continue;
                }

                await window.supabaseClient
                    .from(CFG_ATIV.tabela)
                    .update({ status: 'prorrogada', atualizado_em: new Date().toISOString() })
                    .eq('id', antiga.id);

                await removerEspelhoAgendaAtiv(antiga.agenda_evento_id);
            }

            console.log('✅ [Atividades] Prorrogação automática concluída.');
            jaProrrogouHoje = true;

        } catch (error) {
            console.warn('⚠️ [Atividades] Erro na prorrogação automática:', error);
        }
    }

    // ============================================================
    // CARREGAR ATIVIDADES
    // ============================================================

    async function carregarAtividadesAtiv() {

        const lista = document.getElementById('ativLista');
        if (lista) {
            lista.innerHTML = `<div class="text-center py-5 text-muted"><div class="spinner"></div> Carregando...</div>`;
        }

        try {

            await executarProrrogacaoAutomaticaAtiv();

            let query = window.supabaseClient
                .from(CFG_ATIV.tabela)
                .select('*')
                .order('prioridade', { ascending: true })
                .order('data_fim', { ascending: true });

            if (!ehAdminAtiv()) {
                query = query.eq('designado_para', usernameAtiv());
            }

            const { data, error } = await query;
            if (error) throw error;

            atividadesCache = data || [];
            renderizarListaAtividadesAtiv();
            atualizarResumoAtiv();

        } catch (error) {
            console.error('❌ [Atividades] Erro carregando atividades:', error);
            if (lista) {
                lista.innerHTML = `<div class="text-center py-5 text-danger">Erro ao carregar atividades: ${escapeAtiv(error.message)}</div>`;
            }
        }
    }

    function escapeAtiv(texto) {
        const div = document.createElement('div');
        div.textContent = String(texto ?? '');
        return div.innerHTML;
    }

    // ============================================================
    // RESUMO NO TOPO
    // ============================================================

    function atualizarResumoAtiv() {
        const base = ehAdminAtiv()
            ? atividadesCache
            : atividadesCache.filter(a => a.designado_para === usernameAtiv());

        const pendentes = base.filter(a => a.status === 'pendente').length;
        const concluidas = base.filter(a => a.status === 'concluida').length;
        const prorrogadas = base.filter(a => a.status === 'prorrogada').length;
        const hoje = hojeIsoAtiv();
        const atrasadasHoje = base.filter(a => a.status === 'pendente' && a.data_fim < hoje).length;

        const el = document.getElementById('ativResumo');
        if (el) {
            el.innerHTML = `
                <span class="badge badge-warning">${pendentes} pendente(s)</span>
                <span class="badge badge-success">${concluidas} concluída(s)</span>
                <span class="badge" style="background:#6f1d91;color:#fff;">${prorrogadas} prorrogada(s)</span>
                ${atrasadasHoje ? `<span class="badge badge-danger">${atrasadasHoje} atrasada(s) agora</span>` : ''}
            `;
        }
    }

    // ============================================================
    // FILTROS + RENDER DA LISTA
    // ============================================================

    function atividadesFiltradasAtiv() {
        let lista = ehAdminAtiv()
            ? [...atividadesCache]
            : atividadesCache.filter(a => a.designado_para === usernameAtiv());

        if (filtroStatusAtiv === 'ativas') {
            lista = lista.filter(a => a.status === 'pendente');
        } else if (filtroStatusAtiv === 'concluidas') {
            lista = lista.filter(a => a.status === 'concluida');
        } else if (filtroStatusAtiv === 'prorrogadas') {
            lista = lista.filter(a => a.status === 'prorrogada');
        }

        if (filtroColaboradorAtiv && ehAdminAtiv()) {
            lista = lista.filter(a => a.designado_para === filtroColaboradorAtiv);
        }

        if (filtroBuscaAtiv) {
            const termo = filtroBuscaAtiv.toLowerCase();
            lista = lista.filter(a =>
                (a.titulo || '').toLowerCase().includes(termo) ||
                (a.descricao || '').toLowerCase().includes(termo) ||
                nomeExibicaoUsuarioAtiv(a.designado_para).toLowerCase().includes(termo)
            );
        }

        return lista;
    }

    function renderizarListaAtividadesAtiv() {
        const container = document.getElementById('ativLista');
        if (!container) return;

        const lista = atividadesFiltradasAtiv();

        if (!lista.length) {
            container.innerHTML = `<div class="text-center py-5 text-muted"><i class="fas fa-clipboard-check fa-2x mb-2" style="opacity:.4;"></i><br>Nenhuma atividade encontrada.</div>`;
            return;
        }

        if (!ehAdminAtiv()) {
            container.innerHTML = lista.map(renderizarCardAtividadeAtiv).join('');
            return;
        }

        // Visão admin: agrupada por colaborador designado, com avatar e nome no topo de cada grupo.
        const grupos = new Map();
        lista.forEach(a => {
            if (!grupos.has(a.designado_para)) grupos.set(a.designado_para, []);
            grupos.get(a.designado_para).push(a);
        });

        const ordemColaboradores = obterColaboradoresAtiv()
            .map(u => u.username)
            .filter(username => grupos.has(username));
        grupos.forEach((_, username) => {
            if (!ordemColaboradores.includes(username)) ordemColaboradores.push(username);
        });

        container.innerHTML = ordemColaboradores.map(username => {
            const atividadesDoGrupo = grupos.get(username);
            const concluidasGrupo = atividadesDoGrupo.filter(a => a.status === 'concluida').length;

            return `
                <div class="ativ-grupo">
                    <div class="ativ-grupo-header">
                        ${renderizarAvatarColaboradorAtiv(username)}
                        <div>
                            <div class="ativ-grupo-nome">${escapeAtiv(nomeExibicaoUsuarioAtiv(username))}</div>
                            <div class="ativ-grupo-contagem">${concluidasGrupo} de ${atividadesDoGrupo.length} concluída(s)</div>
                        </div>
                    </div>
                    <div class="ativ-grupo-corpo">
                        ${atividadesDoGrupo.map(renderizarCardAtividadeAtiv).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderizarCardAtividadeAtiv(a) {
        const hoje = hojeIsoAtiv();
        const admin = ehAdminAtiv();
        const atrasada = a.status === 'pendente' && a.data_fim < hoje;
        const concluida = a.status === 'concluida';
        const prorrogada = a.status === 'prorrogada';
        const corPrioridade = CORES_PRIORIDADE[a.prioridade] || CORES_PRIORIDADE.normal;

        return `
            <div class="ativ-card ${concluida ? 'ativ-concluida' : ''} ${atrasada ? 'ativ-atrasada' : ''}" style="border-left-color:${corPrioridade};">
                <div class="ativ-card-check">
                    <input
                        type="checkbox"
                        ${concluida ? 'checked' : ''}
                        ${prorrogada ? 'disabled' : ''}
                        onchange="window.alternarConclusaoAtividade(${a.id}, this.checked)"
                        title="${concluida ? 'Marcar como não concluída' : 'Marcar como concluída'}"
                    >
                </div>
                <div class="ativ-card-corpo">
                    <div class="ativ-card-topo">
                        <strong class="${concluida ? 'ativ-titulo-riscado' : ''}">${escapeAtiv(a.titulo)}</strong>
                        <span class="ativ-badge-prioridade" style="background:${corPrioridade};">${NOMES_PRIORIDADE[a.prioridade] || 'Normal'}</span>
                        ${a.categoria ? `<span class="ativ-badge-categoria">${escapeAtiv(a.categoria)}</span>` : ''}
                    </div>
                    ${a.descricao ? `<div class="ativ-descricao">${escapeAtiv(a.descricao)}</div>` : ''}
                    <div class="ativ-meta">
                        <span><i class="fas fa-calendar"></i> ${NOMES_FREQUENCIA[a.frequencia] || a.frequencia} · ${periodoTextoAtiv(a)}</span>
                        <span><i class="fas fa-user-tie"></i> Designado por ${escapeAtiv(nomeExibicaoUsuarioAtiv(a.designado_por))}</span>
                        ${concluida && a.concluida_em ? `<span class="text-success"><i class="fas fa-check-circle"></i> Concluída em ${new Date(a.concluida_em).toLocaleString('pt-BR')}</span>` : ''}
                    </div>
                    ${a.observacao ? `<div class="ativ-observacao"><i class="fas fa-exclamation-triangle"></i> ${escapeAtiv(a.observacao)}</div>` : ''}
                </div>
                ${admin ? `
                    <div class="ativ-card-acoes">
                        <button class="btn btn-sm btn-outline-secondary" onclick="window.abrirModalEditarAtividade(${a.id})" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="window.excluirAtividade(${a.id})" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // ============================================================
    // CONCLUIR / DESMARCAR
    // ============================================================

    window.alternarConclusaoAtividade = async function (id, concluida) {
        const atividade = atividadesCache.find(a => a.id === id);
        if (!atividade) return;

        try {
            const usuario = usuarioAtualAtiv();

            const atualizacao = concluida
                ? {
                    status: 'concluida',
                    concluida_em: new Date().toISOString(),
                    concluida_por: usernameAtiv(usuario),
                    atualizado_em: new Date().toISOString()
                }
                : {
                    status: 'pendente',
                    concluida_em: null,
                    concluida_por: null,
                    atualizado_em: new Date().toISOString()
                };

            const { error } = await window.supabaseClient
                .from(CFG_ATIV.tabela)
                .update(atualizacao)
                .eq('id', id);

            if (error) throw error;

            Object.assign(atividade, atualizacao);
            renderizarListaAtividadesAtiv();
            atualizarResumoAtiv();

            if (concluida) {
                await removerEspelhoAgendaAtiv(atividade.agenda_evento_id);
                atividade.agenda_evento_id = null;
                await window.supabaseClient
                    .from(CFG_ATIV.tabela)
                    .update({ agenda_evento_id: null })
                    .eq('id', id);
            } else {
                atividade.agenda_evento_id = await criarEspelhoAgendaAtiv(atividade);
                await window.supabaseClient
                    .from(CFG_ATIV.tabela)
                    .update({ agenda_evento_id: atividade.agenda_evento_id })
                    .eq('id', id);
            }

            showToast(concluida ? '✅ Atividade concluída!' : '↩️ Atividade reaberta.', 'success');

        } catch (error) {
            console.error('❌ [Atividades] Erro ao atualizar conclusão:', error);
            showToast('Erro ao atualizar: ' + error.message, 'error');
            renderizarListaAtividadesAtiv();
        }
    };

    // ============================================================
    // MODAL: NOVA / EDITAR ATIVIDADE (ADMIN)
    // ============================================================

    function criarModalAtividadeAtiv() {
        if (document.getElementById('modalAtividade')) return;

        const modal = document.createElement('div');
        modal.id = 'modalAtividade';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:560px;">
                <h3 style="margin-top:0;"><i class="fas fa-clipboard-list"></i> <span id="ativModalTitulo">Nova Atividade</span></h3>
                <input type="hidden" id="ativFormId">

                <div class="form-group">
                    <label>Título *</label>
                    <input type="text" id="ativFormTitulo" class="form-control" placeholder="Ex.: Separar pedidos do dia" required>
                </div>

                <div class="form-group">
                    <label>Descrição</label>
                    <textarea id="ativFormDescricao" class="form-control" rows="2" placeholder="Detalhes da atividade (opcional)"></textarea>
                </div>

                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Categoria (opcional)</label>
                            <input type="text" id="ativFormCategoria" class="form-control" placeholder="Ex.: Estoque, Atendimento...">
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Prioridade</label>
                            <select id="ativFormPrioridade" class="form-control">
                                <option value="normal">Normal</option>
                                <option value="importante">Importante</option>
                                <option value="urgente">Urgente</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label>Designar para *</label>
                    <div id="ativFormColaboradores" style="display:grid; grid-template-columns:repeat(2,1fr); gap:6px; max-height:160px; overflow-y:auto; border:1px solid #dee2e6; border-radius:8px; padding:10px;"></div>
                    <small class="text-muted">Marque um ou mais colaboradores — uma atividade é criada para cada um.</small>
                </div>

                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Duração</label>
                            <select id="ativFormFrequencia" class="form-control" onchange="window.alternarCamposDataAtividade()">
                                <option value="dia">Dia todo</option>
                                <option value="semana">Semana toda</option>
                                <option value="mes">Mês todo</option>
                            </select>
                        </div>
                    </div>
                    <div class="col-md-6" id="ativFormDataUnicaWrapper">
                        <div class="form-group">
                            <label>Data *</label>
                            <input type="date" id="ativFormData" class="form-control">
                        </div>
                    </div>
                </div>

                <div class="row" id="ativFormDataIntervaloWrapper" style="display:none;">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Data início *</label>
                            <input type="date" id="ativFormDataInicio" class="form-control">
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Data fim *</label>
                            <input type="date" id="ativFormDataFim" class="form-control">
                        </div>
                    </div>
                </div>

                <div class="d-flex justify-content-end gap-2 mt-3">
                    <button class="btn btn-secondary" onclick="window.fecharModalAtividade()">Cancelar</button>
                    <button class="btn btn-primary" id="ativBtnSalvar" onclick="window.salvarAtividade()">
                        <i class="fas fa-save"></i> Salvar
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    function popularColaboradoresModalAtiv(selecionados = []) {
        const container = document.getElementById('ativFormColaboradores');
        if (!container) return;
        const colaboradores = obterColaboradoresAtiv();
        container.innerHTML = colaboradores.map(u => `
            <label style="display:flex; align-items:center; gap:6px; font-weight:400; margin:0;">
                <input type="checkbox" value="${u.username}" ${selecionados.includes(u.username) ? 'checked' : ''}>
                ${escapeAtiv(u.name)}
            </label>
        `).join('');
    }

    window.alternarCamposDataAtividade = function () {
        const frequencia = document.getElementById('ativFormFrequencia')?.value || 'dia';
        const wrapperUnico = document.getElementById('ativFormDataUnicaWrapper');
        const wrapperIntervalo = document.getElementById('ativFormDataIntervaloWrapper');
        if (!wrapperUnico || !wrapperIntervalo) return;

        if (frequencia === 'dia') {
            wrapperUnico.style.display = '';
            wrapperIntervalo.style.display = 'none';
            return;
        }

        wrapperUnico.style.display = 'none';
        wrapperIntervalo.style.display = '';

        const inicioAtual = document.getElementById('ativFormDataInicio').value;
        const referencia = inicioAtual || document.getElementById('ativFormData').value || hojeIsoAtiv();
        const { data_inicio, data_fim } = calcularPeriodoAtiv(frequencia, referencia);
        document.getElementById('ativFormDataInicio').value = data_inicio;
        document.getElementById('ativFormDataFim').value = data_fim;
    };

    window.abrirModalNovaAtividade = function () {
        if (!ehAdminAtiv()) {
            showToast('🔒 Apenas administradores podem designar atividades.', 'warning');
            return;
        }
        criarModalAtividadeAtiv();
        document.getElementById('ativModalTitulo').textContent = 'Nova Atividade';
        document.getElementById('ativFormId').value = '';
        document.getElementById('ativFormTitulo').value = '';
        document.getElementById('ativFormDescricao').value = '';
        document.getElementById('ativFormCategoria').value = '';
        document.getElementById('ativFormPrioridade').value = 'normal';
        document.getElementById('ativFormFrequencia').value = 'dia';
        document.getElementById('ativFormData').value = hojeIsoAtiv();
        document.getElementById('ativFormDataInicio').value = '';
        document.getElementById('ativFormDataFim').value = '';
        popularColaboradoresModalAtiv([]);
        window.alternarCamposDataAtividade();
        document.getElementById('modalAtividade').classList.remove('hidden');
    };

    window.abrirModalEditarAtividade = function (id) {
        const atividade = atividadesCache.find(a => a.id === id);
        if (!atividade) return;
        criarModalAtividadeAtiv();
        document.getElementById('ativModalTitulo').textContent = 'Editar Atividade';
        document.getElementById('ativFormId').value = atividade.id;
        document.getElementById('ativFormTitulo').value = atividade.titulo || '';
        document.getElementById('ativFormDescricao').value = atividade.descricao || '';
        document.getElementById('ativFormCategoria').value = atividade.categoria || '';
        document.getElementById('ativFormPrioridade').value = atividade.prioridade || 'normal';
        document.getElementById('ativFormFrequencia').value = atividade.frequencia || 'dia';
        document.getElementById('ativFormData').value = atividade.data_inicio;
        document.getElementById('ativFormDataInicio').value = atividade.data_inicio;
        document.getElementById('ativFormDataFim').value = atividade.data_fim;
        popularColaboradoresModalAtiv([atividade.designado_para]);
        window.alternarCamposDataAtividade();
        document.getElementById('modalAtividade').classList.remove('hidden');
    };

    window.fecharModalAtividade = function () {
        document.getElementById('modalAtividade')?.classList.add('hidden');
    };

    window.salvarAtividade = async function () {
        const id = document.getElementById('ativFormId').value;
        const titulo = document.getElementById('ativFormTitulo').value.trim();
        const descricao = document.getElementById('ativFormDescricao').value.trim();
        const categoria = document.getElementById('ativFormCategoria').value.trim();
        const prioridade = document.getElementById('ativFormPrioridade').value;
        const frequencia = document.getElementById('ativFormFrequencia').value;
        const colaboradoresSelecionados = Array.from(
            document.querySelectorAll('#ativFormColaboradores input:checked')
        ).map(el => el.value);

        let data_inicio, data_fim;
        if (frequencia === 'dia') {
            data_inicio = document.getElementById('ativFormData').value;
            data_fim = data_inicio;
        } else {
            data_inicio = document.getElementById('ativFormDataInicio').value;
            data_fim = document.getElementById('ativFormDataFim').value;
        }

        if (!titulo) {
            showToast('Informe o título da atividade.', 'warning');
            return;
        }
        if (!data_inicio || !data_fim) {
            showToast('Informe a data (ou o período) da atividade.', 'warning');
            return;
        }
        if (data_fim < data_inicio) {
            showToast('A data fim não pode ser anterior à data início.', 'warning');
            return;
        }
        if (!colaboradoresSelecionados.length) {
            showToast('Selecione ao menos um colaborador.', 'warning');
            return;
        }

        const btn = document.getElementById('ativBtnSalvar');
        const htmlOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        try {

            if (id) {
                // Edição: mantém 1 único colaborador (o primeiro marcado).
                const atualizacao = {
                    titulo,
                    descricao: descricao || null,
                    categoria: categoria || null,
                    prioridade,
                    designado_para: colaboradoresSelecionados[0],
                    frequencia,
                    data_inicio,
                    data_fim,
                    atualizado_em: new Date().toISOString()
                };

                const { error } = await window.supabaseClient
                    .from(CFG_ATIV.tabela)
                    .update(atualizacao)
                    .eq('id', id);

                if (error) throw error;

                showToast('✅ Atividade atualizada!', 'success');

            } else {

                for (const username of colaboradoresSelecionados) {

                    const nova = {
                        titulo,
                        descricao: descricao || null,
                        categoria: categoria || null,
                        prioridade,
                        designado_para: username,
                        designado_por: usernameAtiv(),
                        frequencia,
                        data_inicio,
                        data_fim,
                        status: 'pendente',
                        criado_por: usernameAtiv(),
                        criado_em: new Date().toISOString(),
                        atualizado_em: new Date().toISOString()
                    };

                    nova.agenda_evento_id = await criarEspelhoAgendaAtiv(nova);

                    const { error } = await window.supabaseClient
                        .from(CFG_ATIV.tabela)
                        .insert([nova]);

                    if (error) throw error;
                }

                showToast(`✅ ${colaboradoresSelecionados.length} atividade(s) designada(s)!`, 'success');
            }

            window.fecharModalAtividade();
            await carregarAtividadesAtiv();

        } catch (error) {
            console.error('❌ [Atividades] Erro ao salvar:', error);
            showToast('Erro ao salvar: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = htmlOriginal;
        }
    };

    window.excluirAtividade = async function (id) {
        const atividade = atividadesCache.find(a => a.id === id);
        if (!atividade) return;
        if (!confirm(`Excluir a atividade "${atividade.titulo}"?`)) return;

        try {
            const { error } = await window.supabaseClient
                .from(CFG_ATIV.tabela)
                .delete()
                .eq('id', id);

            if (error) throw error;

            await removerEspelhoAgendaAtiv(atividade.agenda_evento_id);
            showToast('🗑️ Atividade excluída.', 'success');
            await carregarAtividadesAtiv();

        } catch (error) {
            console.error('❌ [Atividades] Erro ao excluir:', error);
            showToast('Erro ao excluir: ' + error.message, 'error');
        }
    };

    // ============================================================
    // FILTROS (UI)
    // ============================================================

    window.filtrarAtividades = function () {
        filtroStatusAtiv = document.getElementById('ativFiltroStatus')?.value || 'ativas';
        filtroColaboradorAtiv = document.getElementById('ativFiltroColaborador')?.value || '';
        filtroBuscaAtiv = String(document.getElementById('ativBusca')?.value || '').trim().toLowerCase();
        renderizarListaAtividadesAtiv();
    };

    // ============================================================
    // RELATÓRIO (ADMIN) — GRÁFICO DE PIZZA + POR COLABORADOR
    // ============================================================

    window.abrirRelatorioAtividades = function () {
        if (!ehAdminAtiv()) {
            showToast('🔒 Apenas administradores podem ver o relatório.', 'warning');
            return;
        }

        let modal = document.getElementById('modalRelatorioAtividades');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'modalRelatorioAtividades';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:820px;">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h3 style="margin:0;"><i class="fas fa-chart-pie"></i> Relatório de Atividades</h3>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalRelatorioAtividades').remove()">Fechar</button>
                </div>
                <div class="row">
                    <div class="col-md-5">
                        <canvas id="ativGraficoPizza" height="220"></canvas>
                    </div>
                    <div class="col-md-7">
                        <div id="ativRelatorioPorColaborador"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        montarRelatorioAtividadesAtiv();
    };

    function montarRelatorioAtividadesAtiv() {
        const total = atividadesCache.length;
        const concluidas = atividadesCache.filter(a => a.status === 'concluida').length;
        const pendentes = atividadesCache.filter(a => a.status === 'pendente').length;
        const prorrogadas = atividadesCache.filter(a => a.status === 'prorrogada').length;

        const ctx = document.getElementById('ativGraficoPizza');
        if (ctx && typeof Chart !== 'undefined') {
            if (window.ativGraficoPizza && typeof window.ativGraficoPizza.destroy === 'function') {
                window.ativGraficoPizza.destroy();
            }
            window.ativGraficoPizza = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: ['Concluídas', 'Pendentes', 'Prorrogadas'],
                    datasets: [{
                        data: [concluidas, pendentes, prorrogadas],
                        backgroundColor: ['#198754', '#ffc107', '#6f1d91'],
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { position: 'bottom' },
                        title: { display: true, text: `${total} atividade(s) no total` }
                    }
                }
            });
        }

        const porColaborador = new Map();
        obterColaboradoresAtiv().forEach(u => {
            porColaborador.set(u.username, { nome: u.name, concluidas: 0, pendentes: 0, prorrogadas: 0 });
        });
        atividadesCache.forEach(a => {
            if (!porColaborador.has(a.designado_para)) {
                porColaborador.set(a.designado_para, { nome: nomeExibicaoUsuarioAtiv(a.designado_para), concluidas: 0, pendentes: 0, prorrogadas: 0 });
            }
            const registro = porColaborador.get(a.designado_para);
            if (a.status === 'concluida') registro.concluidas++;
            else if (a.status === 'pendente') registro.pendentes++;
            else if (a.status === 'prorrogada') registro.prorrogadas++;
        });

        const container = document.getElementById('ativRelatorioPorColaborador');
        if (!container) return;

        const linhas = [...porColaborador.values()]
            .filter(r => r.concluidas + r.pendentes + r.prorrogadas > 0)
            .sort((a, b) => (b.concluidas + b.pendentes + b.prorrogadas) - (a.concluidas + a.pendentes + a.prorrogadas));

        if (!linhas.length) {
            container.innerHTML = `<p class="text-muted text-center py-4">Nenhuma atividade registrada ainda.</p>`;
            return;
        }

        container.innerHTML = `
            <table class="table table-sm">
                <thead>
                    <tr><th>Colaborador</th><th class="text-center">Concluídas</th><th class="text-center">Pendentes</th><th class="text-center">Prorrogadas</th><th>% concluído</th></tr>
                </thead>
                <tbody>
                    ${linhas.map(r => {
                        const totalLinha = r.concluidas + r.pendentes + r.prorrogadas;
                        const percentual = totalLinha ? Math.round((r.concluidas / totalLinha) * 100) : 0;
                        return `
                            <tr>
                                <td>${escapeAtiv(r.nome)}</td>
                                <td class="text-center text-success">${r.concluidas}</td>
                                <td class="text-center text-warning">${r.pendentes}</td>
                                <td class="text-center" style="color:#6f1d91;">${r.prorrogadas}</td>
                                <td>
                                    <div class="progress" style="height:16px;">
                                        <div class="progress-bar bg-success" style="width:${percentual}%;">${percentual}%</div>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    // ============================================================
    // CSS
    // ============================================================

    function injetarCssAtiv() {
        if (document.getElementById('atividadesCSS')) return;
        const style = document.createElement('style');
        style.id = 'atividadesCSS';
        style.textContent = `
            .ativ-card {
                display: flex;
                gap: 12px;
                align-items: flex-start;
                background: #fff;
                border: 1px solid #e9ecef;
                border-left: 4px solid #0875ee;
                border-radius: 10px;
                padding: 14px 16px;
                margin-bottom: 10px;
            }
            .ativ-card.ativ-concluida { opacity: .6; background: #f8f9fa; }
            .ativ-card.ativ-atrasada { border-left-color: #dc3545 !important; background: #fff8f8; }
            .ativ-card-check { padding-top: 3px; }
            .ativ-card-check input { width: 20px; height: 20px; cursor: pointer; }
            .ativ-card-corpo { flex: 1; min-width: 0; }
            .ativ-card-topo { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
            .ativ-titulo-riscado { text-decoration: line-through; color: #6c757d; }
            .ativ-badge-prioridade { color: #fff; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
            .ativ-badge-categoria { background: #e9ecef; color: #495057; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
            .ativ-descricao { font-size: 13px; color: #495057; margin-bottom: 6px; }
            .ativ-meta { display: flex; gap: 16px; flex-wrap: wrap; font-size: 11px; color: #6c757d; }
            .ativ-observacao { margin-top: 6px; font-size: 11px; color: #6f1d91; background: #f7edfb; border-radius: 6px; padding: 5px 9px; display: inline-block; }
            .ativ-card-acoes { display: flex; flex-direction: column; gap: 6px; }
            .ativ-grupo { margin-bottom: 24px; }
            .ativ-grupo-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px solid #e9ecef; }
            .ativ-grupo-avatar { width: 38px; height: 38px; border-radius: 50%; background: #0875ee; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px; flex-shrink: 0; overflow: hidden; }
            .ativ-grupo-nome { font-weight: 700; font-size: 14px; color: #212529; }
            .ativ-grupo-contagem { font-size: 11px; color: #6c757d; }
        `;
        document.head.appendChild(style);
    }

    // ============================================================
    // TELA
    // ============================================================

    function criarTelaAtividadesAtiv() {
        if (document.getElementById('atividadesSystem')) return;

        const div = document.createElement('div');
        div.id = 'atividadesSystem';
        div.className = 'hidden';
        div.innerHTML = `
            <header class="main-header">
                <div class="container">
                    <div class="header-content">
                        <h1 style="display:flex; align-items:center; gap:10px;">
                            <img src="logo.png" alt="Wheel Tech" style="height:35px; width:auto;">
                            Controle de Atividades
                        </h1>
                    </div>
                </div>
            </header>

            <div class="container">
                <div class="card mb-3">
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div>
                            <h3 style="margin:0;"><i class="fas fa-list-check"></i> Atividades</h3>
                            <div id="ativResumo" class="mt-2 d-flex gap-2 flex-wrap"></div>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-secondary" onclick="voltarParaMenu()">
                                <i class="fas fa-arrow-left"></i> Voltar
                            </button>
                            <button class="btn btn-info" onclick="window.__carregarAtividadesModulo()">
                                <i class="fas fa-sync-alt"></i> Atualizar
                            </button>
                            <button class="btn btn-outline-primary" id="ativBtnRelatorio" onclick="window.abrirRelatorioAtividades()">
                                <i class="fas fa-chart-pie"></i> Relatório
                            </button>
                            <button class="btn btn-success" id="ativBtnNova" onclick="window.abrirModalNovaAtividade()">
                                <i class="fas fa-plus"></i> Nova Atividade
                            </button>
                        </div>
                    </div>
                </div>

                <div class="card mb-3">
                    <div class="d-flex flex-wrap gap-2 align-items-center">
                        <select id="ativFiltroStatus" class="form-control form-control-sm" style="width:160px;" onchange="window.filtrarAtividades()">
                            <option value="ativas">Pendentes</option>
                            <option value="concluidas">Concluídas</option>
                            <option value="prorrogadas">Prorrogadas</option>
                            <option value="todas">Todas</option>
                        </select>
                        <select id="ativFiltroColaborador" class="form-control form-control-sm" style="width:180px; display:none;" onchange="window.filtrarAtividades()">
                            <option value="">Todos os colaboradores</option>
                        </select>
                        <input type="text" id="ativBusca" class="form-control form-control-sm" placeholder="🔍 Buscar atividade..." style="flex:1; min-width:200px;" oninput="window.filtrarAtividades()">
                    </div>
                </div>

                <div id="ativLista"></div>
            </div>
        `;
        document.body.appendChild(div);

        if (ehAdminAtiv()) {
            const filtroColab = document.getElementById('ativFiltroColaborador');
            if (filtroColab) {
                filtroColab.style.display = '';
                filtroColab.innerHTML = '<option value="">Todos os colaboradores</option>' +
                    obterColaboradoresAtiv().map(u => `<option value="${u.username}">${escapeAtiv(u.name)}</option>`).join('');
            }
        } else {
            document.getElementById('ativBtnNova')?.remove();
            document.getElementById('ativBtnRelatorio')?.remove();
        }
    }

    window.__carregarAtividadesModulo = carregarAtividadesAtiv;

    window.abrirSistemaAtividades = async function () {
        const usuario = usuarioAtualAtiv();
        if (!usuario) {
            showToast('⚠️ Faça login primeiro', 'warning');
            return;
        }

        injetarCssAtiv();
        criarTelaAtividadesAtiv();
        criarModalAtividadeAtiv();

        if (typeof esconderTodosOsSistemas === 'function') {
            esconderTodosOsSistemas('atividadesSystem');
        }
        document.getElementById('atividadesSystem')?.classList.remove('hidden');

        await carregarAtividadesAtiv();
    };

    // ============================================================
    // CARD DE RESUMO NO MENU PRINCIPAL (SÓ ADMINISTRADORES)
    // ============================================================

    async function atualizarCardResumoAtividadesDashboardAtiv() {
        const card = document.getElementById('wtAtividadesRelatorioCard');
        if (!card) return;

        if (!ehAdminAtiv()) {
            card.style.display = 'none';
            return;
        }

        card.style.display = '';

        try {
            const { data, error } = await window.supabaseClient
                .from(CFG_ATIV.tabela)
                .select('status');

            if (error) throw error;

            const linhas = data || [];
            const concluidas = linhas.filter(a => a.status === 'concluida').length;
            const pendentes = linhas.filter(a => a.status === 'pendente').length;
            const prorrogadas = linhas.filter(a => a.status === 'prorrogada').length;
            const total = concluidas + pendentes + prorrogadas;
            const percentual = total ? Math.round((concluidas / total) * 100) : 0;

            const percentualEl = document.getElementById('wtAtivGoalPercent');
            const valorEl = document.getElementById('wtAtivGoalValue');
            const totalEl = document.getElementById('wtAtivGoalTotal');
            const ring = document.getElementById('wtAtivGoalRing');
            const barra = document.getElementById('wtAtivGoalProgress');

            if (!total) {
                if (percentualEl) percentualEl.textContent = '—';
                if (valorEl) valorEl.textContent = 'Nenhuma atividade cadastrada';
                if (totalEl) totalEl.textContent = 'Designe atividades para a equipe';
                ring?.style.setProperty('--wt-goal', '0%');
                barra?.style.setProperty('--wt-goal', '0%');
                return;
            }

            if (percentualEl) percentualEl.textContent = `${percentual}%`;
            if (valorEl) valorEl.textContent = `${concluidas} de ${total} concluída(s)`;
            if (totalEl) totalEl.textContent = `${pendentes} pendente(s) · ${prorrogadas} prorrogada(s)`;
            ring?.style.setProperty('--wt-goal', `${percentual}%`);
            barra?.style.setProperty('--wt-goal', `${percentual}%`);

        } catch (error) {
            console.warn('⚠️ [Atividades] Erro ao atualizar card do dashboard:', error);
        }
    }

    window.atualizarCardResumoAtividadesDashboard = atualizarCardResumoAtividadesDashboardAtiv;

    const menuSystemAtiv = document.getElementById('menuSystem');
    if (menuSystemAtiv) {
        new MutationObserver(() => {
            if (!menuSystemAtiv.classList.contains('hidden')) atualizarCardResumoAtividadesDashboardAtiv();
        }).observe(menuSystemAtiv, { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('load', () => setTimeout(() => {
        if (!document.getElementById('menuSystem')?.classList.contains('hidden')) atualizarCardResumoAtividadesDashboardAtiv();
    }, 1500));
    window.setInterval(() => {
        if (!document.getElementById('menuSystem')?.classList.contains('hidden')) atualizarCardResumoAtividadesDashboardAtiv();
    }, 60000);

})();
