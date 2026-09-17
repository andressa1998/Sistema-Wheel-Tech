// ================================================================
// SUGESTÕES DE MELHORIA — WHEEL TECH
// ================================================================
//
// Antes vivia dentro do módulo de Feedback — agora é um módulo
// próprio. Qualquer usuário pode enviar uma sugestão. Só
// administradores decidem o status (aguardando/aprovado/reprovado)
// e preenchem o prêmio (a ideia aprovada pode ganhar um prêmio
// inicial e, se dela sair resultado de verdade, uma segunda
// premiação — dinheiro, produto ou serviço).
//
// Reaproveita a tabela feedback_sugestoes que o módulo antigo já
// usava, então as sugestões já enviadas continuam aparecendo aqui.
// ================================================================

(() => {
    'use strict';

    const CFG_SUG = {
        tabela: 'feedback_sugestoes'
    };

    const STATUS_SUG = {
        aguardando: { texto: 'Aguardando', icone: '⏳', classe: 'sug-status-aguardando' },
        aprovado: { texto: 'Aprovado', icone: '✅', classe: 'sug-status-aprovado' },
        reprovado: { texto: 'Reprovado', icone: '❌', classe: 'sug-status-reprovado' }
    };

    let sugestoesCache = [];
    let filtroStatusSug = 'todas';
    let filtroBuscaSug = '';

    // ============================================================
    // HELPERS / PERMISSÃO
    // ============================================================

    function escSug(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function usuarioAtualSug() {
        return window.currentUser || null;
    }

    function usernameSug() {
        const u = usuarioAtualSug();
        if (!u) return '';
        return String(u.username || u.name || '').trim().toLowerCase();
    }

    function ehAdminSug() {
        const u = usuarioAtualSug();
        return !!u && u.role === 'Administrador';
    }

    function podeVerSugestao(s) {
        if (ehAdminSug()) return true;
        const u = usuarioAtualSug();
        if (!u) return false;
        if (s.usuario_username && s.usuario_username === usernameSug()) return true;
        // Sugestões antigas não têm usuario_username salvo — cai pro nome.
        if (!s.usuario_username && s.usuario_nome === u.name) return true;
        return false;
    }

    function cfgStatusSug(status) {
        return STATUS_SUG[status] || STATUS_SUG.aguardando;
    }

    function fmtDataHoraSug(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleString('pt-BR');
    }

    // ============================================================
    // CARREGAR
    // ============================================================

    async function carregarSugestoesSug() {
        const container = document.getElementById('sugLista');
        if (container) container.innerHTML = `<div class="text-center py-5 text-muted"><div class="spinner"></div> Carregando...</div>`;

        try {
            const { data, error } = await window.supabaseClient
                .from(CFG_SUG.tabela)
                .select('*')
                .order('data_criacao', { ascending: false });

            if (error) throw error;

            sugestoesCache = (data || []).filter(podeVerSugestao);
            renderizarListaSug();
            atualizarResumoSug();

        } catch (error) {
            console.error('❌ [Sugestões] Erro ao carregar:', error);
            if (container) container.innerHTML = `<div class="text-center py-5 text-danger">Erro ao carregar: ${escSug(error.message)}</div>`;
        }
    }

    function atualizarResumoSug() {
        const aguardando = sugestoesCache.filter(s => (s.status || 'aguardando') === 'aguardando').length;
        const aprovadas = sugestoesCache.filter(s => s.status === 'aprovado').length;
        const reprovadas = sugestoesCache.filter(s => s.status === 'reprovado').length;

        const el = document.getElementById('sugResumo');
        if (el) {
            el.innerHTML = `
                <span class="badge" style="background:#ffc107;color:#212529;">${aguardando} aguardando</span>
                <span class="badge badge-success">${aprovadas} aprovada(s)</span>
                <span class="badge badge-danger">${reprovadas} reprovada(s)</span>
            `;
        }
    }

    // ============================================================
    // FILTROS + LISTA
    // ============================================================

    function sugestoesFiltradasSug() {
        let lista = [...sugestoesCache];

        if (filtroStatusSug !== 'todas') {
            lista = lista.filter(s => (s.status || 'aguardando') === filtroStatusSug);
        }

        if (filtroBuscaSug) {
            const termo = filtroBuscaSug.toLowerCase();
            lista = lista.filter(s =>
                (s.sugestao || '').toLowerCase().includes(termo) ||
                (s.usuario_nome || '').toLowerCase().includes(termo)
            );
        }

        return lista;
    }

    function renderizarListaSug() {
        const container = document.getElementById('sugLista');
        if (!container) return;

        const lista = sugestoesFiltradasSug();

        if (!lista.length) {
            container.innerHTML = `<div class="text-center py-5 text-muted"><i class="fas fa-lightbulb fa-2x mb-2" style="opacity:.4;"></i><br>Nenhuma sugestão encontrada.</div>`;
            return;
        }

        container.innerHTML = lista.map(renderizarCardSug).join('');
    }

    function renderizarCardSug(s) {
        const st = cfgStatusSug(s.status);
        const admin = ehAdminSug();

        return `
            <div class="sug-card" onclick="window.abrirDetalhesSugestao(${s.id})">
                <div class="sug-card-topo">
                    <span class="sug-badge-status ${st.classe}">${st.icone} ${escSug(st.texto)}</span>
                    ${s.premio ? `<span class="sug-badge-premio"><i class="fas fa-trophy"></i> Premiada</span>` : ''}
                </div>
                <p class="sug-card-texto">${escSug((s.sugestao || '').slice(0, 160))}${(s.sugestao || '').length > 160 ? '…' : ''}</p>
                <div class="sug-card-rodape">
                    <span><i class="fas fa-user"></i> ${escSug(s.usuario_nome || '—')}</span>
                    <span>${fmtDataHoraSug(s.data_criacao)}</span>
                </div>
            </div>
        `;
    }

    window.filtrarSugestoes = function () {
        filtroStatusSug = document.getElementById('sugFiltroStatus')?.value || 'todas';
        filtroBuscaSug = String(document.getElementById('sugBusca')?.value || '').trim().toLowerCase();
        renderizarListaSug();
    };

    // ============================================================
    // NOVA SUGESTÃO (TODOS OS USUÁRIOS)
    // ============================================================

    function criarModalNovaSugestaoSug() {
        if (document.getElementById('modalNovaSugestaoSug')) return;

        const modal = document.createElement('div');
        modal.id = 'modalNovaSugestaoSug';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:520px;">
                <h3 style="margin-top:0;"><i class="fas fa-lightbulb"></i> Nova Sugestão de Melhoria</h3>
                <div class="form-group">
                    <label>Descreva sua ideia *</label>
                    <textarea id="sugFormTexto" class="form-control" rows="5" placeholder="Conte sua sugestão de melhoria..."></textarea>
                </div>
                <div class="d-flex justify-content-end gap-2 mt-3">
                    <button class="btn btn-secondary" onclick="window.fecharModalNovaSugestao()">Cancelar</button>
                    <button class="btn btn-primary" id="sugBtnEnviar" onclick="window.enviarNovaSugestao()">
                        <i class="fas fa-paper-plane"></i> Enviar
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    window.abrirModalNovaSugestao = function () {
        criarModalNovaSugestaoSug();
        document.getElementById('sugFormTexto').value = '';
        document.getElementById('modalNovaSugestaoSug').classList.remove('hidden');
    };

    window.fecharModalNovaSugestao = function () {
        document.getElementById('modalNovaSugestaoSug')?.classList.add('hidden');
    };

    window.enviarNovaSugestao = async function () {
        const texto = document.getElementById('sugFormTexto').value.trim();
        if (!texto) {
            showToast('Descreva sua sugestão.', 'warning');
            return;
        }

        const usuario = usuarioAtualSug();
        const btn = document.getElementById('sugBtnEnviar');
        const htmlOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        try {
            const { error } = await window.supabaseClient
                .from(CFG_SUG.tabela)
                .insert([{
                    usuario_nome: usuario.name,
                    usuario_username: usernameSug(),
                    sugestao: texto,
                    data_criacao: new Date().toISOString(),
                    status: 'aguardando'
                }]);

            if (error) throw error;

            showToast('✅ Sugestão enviada! Aguarde a avaliação.', 'success');
            window.fecharModalNovaSugestao();
            await carregarSugestoesSug();

        } catch (error) {
            console.error('❌ [Sugestões] Erro ao enviar:', error);
            showToast('Erro ao enviar: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = htmlOriginal;
        }
    };

    // ============================================================
    // DETALHES
    // ============================================================

    window.abrirDetalhesSugestao = function (id) {
        const s = sugestoesCache.find(x => x.id === id);
        if (!s) return;

        let modal = document.getElementById('modalDetalhesSugestao');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'modalDetalhesSugestao';
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal-content" style="max-width:600px;" id="sugDetalhesConteudo"></div>`;
        document.body.appendChild(modal);

        renderizarDetalhesSug(s);
    };

    function renderizarDetalhesSug(s) {
        const container = document.getElementById('sugDetalhesConteudo');
        if (!container) return;

        const st = cfgStatusSug(s.status);
        const admin = ehAdminSug();

        container.innerHTML = `
            <div class="d-flex justify-content-between align-items-start mb-2">
                <h3 style="margin:0;"><i class="fas fa-lightbulb"></i> Sugestão</h3>
                <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalDetalhesSugestao').remove()">Fechar</button>
            </div>

            <div class="mb-2"><span class="sug-badge-status ${st.classe}">${st.icone} ${escSug(st.texto)}</span></div>

            <div style="background:#f8f9fa; padding:14px; border-radius:8px; margin-bottom:14px; white-space:pre-wrap;">${escSug(s.sugestao)}</div>

            <div class="d-flex flex-wrap gap-3 mb-3" style="font-size:13px; color:#6c757d;">
                <div><strong>Enviada por:</strong> ${escSug(s.usuario_nome || '—')}</div>
                <div><strong>Em:</strong> ${fmtDataHoraSug(s.data_criacao)}</div>
                ${s.avaliado_por ? `<div><strong>Avaliada por:</strong> ${escSug(s.avaliado_por)} em ${fmtDataHoraSug(s.avaliado_em)}</div>` : ''}
            </div>

            ${admin ? `
                <div class="form-group">
                    <label>Status</label>
                    <select id="sugDetStatus" class="form-control" style="max-width:260px;">
                        <option value="aguardando" ${(s.status || 'aguardando') === 'aguardando' ? 'selected' : ''}>⏳ Aguardando</option>
                        <option value="aprovado" ${s.status === 'aprovado' ? 'selected' : ''}>✅ Aprovado</option>
                        <option value="reprovado" ${s.status === 'reprovado' ? 'selected' : ''}>❌ Reprovado</option>
                    </select>
                    <button class="btn btn-sm btn-primary mt-1" onclick="window.salvarStatusSugestao(${s.id})"><i class="fas fa-save"></i> Salvar status</button>
                </div>

                <div class="form-group">
                    <label>Prêmio <small class="text-muted">(dado quando aprovada)</small></label>
                    <input type="text" id="sugDetPremio" class="form-control" value="${escSug(s.premio || '')}" placeholder="Ex.: R$ 200,00, vale-presente, folga...">
                </div>

                <div class="form-group">
                    <label>Segunda premiação <small class="text-muted">(se a ideia deu resultado de verdade — dinheiro, produto ou serviço)</small></label>
                    <input type="text" id="sugDetPremioAdicional" class="form-control" value="${escSug(s.premio_adicional || '')}" placeholder="Ex.: R$ 500,00 pelo resultado gerado">
                </div>
                <button class="btn btn-sm btn-outline-primary" onclick="window.salvarPremiosSugestao(${s.id})"><i class="fas fa-save"></i> Salvar prêmios</button>

                <div class="mt-3" style="border-top:1px solid #eef2f7; padding-top:12px;">
                    <button class="btn btn-outline-danger btn-sm" onclick="window.excluirSugestaoSug(${s.id})"><i class="fas fa-trash"></i> Excluir sugestão</button>
                </div>
            ` : `
                ${s.premio ? `<div class="mb-2"><strong>🏆 Prêmio:</strong> ${escSug(s.premio)}</div>` : ''}
                ${s.premio_adicional ? `<div class="mb-2"><strong>🏆 Segunda premiação:</strong> ${escSug(s.premio_adicional)}</div>` : ''}
            `}
        `;
    }

    window.salvarStatusSugestao = async function (id) {
        const status = document.getElementById('sugDetStatus').value;
        try {
            const { error } = await window.supabaseClient
                .from(CFG_SUG.tabela)
                .update({
                    status,
                    avaliado_por: usuarioAtualSug().name,
                    avaliado_em: new Date().toISOString()
                })
                .eq('id', id);
            if (error) throw error;

            showToast('✅ Status atualizado!', 'success');
            await carregarSugestoesSug();
            const atualizada = sugestoesCache.find(s => s.id === id);
            if (atualizada) renderizarDetalhesSug(atualizada);

        } catch (error) {
            showToast('Erro ao salvar status: ' + error.message, 'error');
        }
    };

    window.salvarPremiosSugestao = async function (id) {
        const premio = document.getElementById('sugDetPremio').value.trim();
        const premioAdicional = document.getElementById('sugDetPremioAdicional').value.trim();
        try {
            const { error } = await window.supabaseClient
                .from(CFG_SUG.tabela)
                .update({
                    premio: premio || null,
                    premio_adicional: premioAdicional || null
                })
                .eq('id', id);
            if (error) throw error;

            showToast('✅ Prêmios salvos!', 'success');
            await carregarSugestoesSug();
            const atualizada = sugestoesCache.find(s => s.id === id);
            if (atualizada) renderizarDetalhesSug(atualizada);

        } catch (error) {
            showToast('Erro ao salvar prêmios: ' + error.message, 'error');
        }
    };

    window.excluirSugestaoSug = async function (id) {
        if (!ehAdminSug()) {
            showToast('🔒 Apenas administradores podem excluir sugestões.', 'warning');
            return;
        }
        if (!confirm('Excluir esta sugestão?')) return;

        try {
            const { error } = await window.supabaseClient
                .from(CFG_SUG.tabela)
                .delete()
                .eq('id', id);
            if (error) throw error;

            showToast('🗑️ Sugestão excluída.', 'success');
            document.getElementById('modalDetalhesSugestao')?.remove();
            await carregarSugestoesSug();

        } catch (error) {
            showToast('Erro ao excluir: ' + error.message, 'error');
        }
    };

    // ============================================================
    // EXPORTAR EXCEL
    // ============================================================

    window.exportarSugestoesExcelSug = function () {
        const lista = sugestoesFiltradasSug();
        if (!lista.length) {
            showToast('⚠️ Nenhuma sugestão para exportar.', 'warning');
            return;
        }
        const linhas = lista.map(s => ({
            'Usuário': s.usuario_nome || '',
            'Sugestão': s.sugestao || '',
            'Status': cfgStatusSug(s.status).texto,
            'Prêmio': s.premio || '',
            'Segunda Premiação': s.premio_adicional || '',
            'Avaliado por': s.avaliado_por || '',
            'Avaliado em': s.avaliado_em || '',
            'Data': s.data_criacao || ''
        }));
        const ws = XLSX.utils.json_to_sheet(linhas);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sugestoes');
        XLSX.writeFile(wb, `sugestoes_melhorias_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // ============================================================
    // CSS
    // ============================================================

    function injetarCssSug() {
        if (document.getElementById('sugestoesCSS')) return;
        const style = document.createElement('style');
        style.id = 'sugestoesCSS';
        style.textContent = `
            .sug-card { background: #fff; border: 1px solid #e9ecef; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; cursor: pointer; transition: .15s; }
            .sug-card:hover { border-color: #bdd9ff; box-shadow: 0 4px 14px rgba(8,43,91,.08); }
            .sug-card-topo { display: flex; gap: 8px; margin-bottom: 6px; }
            .sug-card-texto { margin: 0 0 8px; color: #333; font-size: 13px; }
            .sug-card-rodape { display: flex; justify-content: space-between; font-size: 11px; color: #6c757d; }
            .sug-badge-status { display: inline-block; font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 999px; }
            .sug-status-aguardando { background: #fff3cd; color: #856404; }
            .sug-status-aprovado { background: #d1e7dd; color: #0f5132; }
            .sug-status-reprovado { background: #f8d7da; color: #721c24; }
            .sug-badge-premio { display: inline-block; font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: #fff3cd; color: #856404; }
        `;
        document.head.appendChild(style);
    }

    // ============================================================
    // TELA
    // ============================================================

    function criarTelaSugestoesSug() {
        if (document.getElementById('sugestoesSystem')) return;

        const div = document.createElement('div');
        div.id = 'sugestoesSystem';
        div.className = 'hidden';
        div.innerHTML = `
            <header class="main-header">
                <div class="container">
                    <div class="header-content">
                        <h1 style="display:flex; align-items:center; gap:10px;">
                            <img src="logo.png" alt="Wheel Tech" style="height:35px; width:auto;">
                            Sugestões de Melhoria
                        </h1>
                    </div>
                </div>
            </header>

            <div class="container">
                <div class="card mb-3">
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div>
                            <h3 style="margin:0;"><i class="fas fa-lightbulb"></i> Sugestões</h3>
                            <div id="sugResumo" class="mt-2 d-flex gap-2 flex-wrap"></div>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-secondary" onclick="voltarParaMenu()"><i class="fas fa-arrow-left"></i> Voltar</button>
                            <button class="btn btn-info" onclick="window.__carregarSugestoesModulo()"><i class="fas fa-sync-alt"></i> Atualizar</button>
                            <button class="btn btn-outline-primary" onclick="window.exportarSugestoesExcelSug()"><i class="fas fa-file-excel"></i> Exportar Excel</button>
                            <button class="btn btn-success" onclick="window.abrirModalNovaSugestao()"><i class="fas fa-plus"></i> Nova Sugestão</button>
                        </div>
                    </div>
                </div>

                <div class="card mb-3">
                    <div class="d-flex flex-wrap gap-2 align-items-center">
                        <select id="sugFiltroStatus" class="form-control form-control-sm" style="width:170px;" onchange="window.filtrarSugestoes()">
                            <option value="todas">Todos os status</option>
                            <option value="aguardando">Aguardando</option>
                            <option value="aprovado">Aprovado</option>
                            <option value="reprovado">Reprovado</option>
                        </select>
                        <input type="text" id="sugBusca" class="form-control form-control-sm" placeholder="🔍 Buscar sugestão..." style="flex:1; min-width:200px;" oninput="window.filtrarSugestoes()">
                    </div>
                </div>

                <div id="sugLista"></div>
            </div>
        `;
        document.body.appendChild(div);
    }

    window.__carregarSugestoesModulo = carregarSugestoesSug;

    window.abrirSistemaSugestoes = async function () {
        if (!usuarioAtualSug()) {
            showToast('⚠️ Faça login primeiro', 'warning');
            return;
        }

        injetarCssSug();
        criarTelaSugestoesSug();
        criarModalNovaSugestaoSug();

        if (typeof esconderTodosOsSistemas === 'function') {
            esconderTodosOsSistemas('sugestoesSystem');
        }
        document.getElementById('sugestoesSystem')?.classList.remove('hidden');

        await carregarSugestoesSug();
    };

})();
