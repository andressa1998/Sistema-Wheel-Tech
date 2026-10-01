/* ============================================================
   WHEEL TECH · RECLAMAÇÕES DE CLIENTES
   ------------------------------------------------------------
   Módulo novo: reclamações que compradores abrem contra a
   Wheel Tech no Mercado Livre (API de "claims" / mediações —
   diferente da API de reembolsos, que o sistema já usa em
   outro módulo).

   Segue o mesmo padrão do módulo de Chamados (chamados.js):
   tela e modais montados via JS (não em index.html), uma
   tabela "pai" (a reclamação) + uma tabela de mensagens
   (o histórico de conversa da reclamação).
   ============================================================ */
(function () {
    'use strict';

    const CFG_RC = {
        tabela: 'reclamacoes_clientes',
        tabelaMensagens: 'reclamacoes_clientes_mensagens',
        admins: ['andressamiotto', 'ronald', 'leticia']
    };

    // ============================================================
    // STATUS (fluxo interno da Wheel Tech — não é o status do ML)
    // ============================================================

    const STATUS_RC = {
        aberta: { texto: 'Aberta', icone: '🔴', classe: 'rc-status-aberta' },
        em_andamento: { texto: 'Em andamento', icone: '🟡', classe: 'rc-status-andamento' },
        resolvida: { texto: 'Resolvida', icone: '🟢', classe: 'rc-status-resolvida' },
        fechada: { texto: 'Fechada', icone: '⚪', classe: 'rc-status-fechada' }
    };

    function cfgStatusRC(status) {
        return STATUS_RC[status] || { texto: status || 'Desconhecido', icone: '❔', classe: 'rc-status-aberta' };
    }

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function nl(v) {
        return esc(v).replace(/\n/g, '<br>');
    }

    function fmtData(v) {
        if (!v) return '—';
        const d = new Date(v);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    // Número da venda (order_id do ML) como link direto para a venda
    // no painel do Mercado Livre — evita ter que buscar manualmente.
    function linkVendaRC(numeroVenda) {
        const numero = String(numeroVenda || '').trim();
        if (!numero) return '—';
        const url = `https://vendedores.mercadolivre.com.br/vendas/${encodeURIComponent(numero)}/detalhe`;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" title="Abrir venda no Mercado Livre"><code>${esc(numero)}</code> <i class="fas fa-external-link-alt" style="font-size:10px;"></i></a>`;
    }

    function sb() { return window.supabaseClient || null; }

    function usuarioAtual() { return window.currentUser || null; }

    function ehAdmin() {
        const u = usuarioAtual();
        const username = String(u?.username || u?.login || '').toLowerCase();
        return CFG_RC.admins.includes(username) || String(u?.role || '').toLowerCase() === 'administrador';
    }

    // ============================================================
    // ESTILO
    // ============================================================

    function instalarEstiloRC() {
        if (document.getElementById('rcEstilo')) return;
        const st = document.createElement('style');
        st.id = 'rcEstilo';
        st.textContent = `
            .rc-status-aberta{background:#fde8ea;color:#a61b29;}
            .rc-status-andamento{background:#fff6db;color:#8a6d00;}
            .rc-status-resolvida{background:#e3f7e8;color:#1c7a34;}
            .rc-status-fechada{background:#eceff1;color:#555;}
            .rc-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap;}
            .rc-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100050;display:flex;align-items:center;justify-content:center;}
            .rc-overlay.hidden-rc{display:none;}
            .rc-modal{background:#fff;width:95%;max-width:760px;max-height:92vh;overflow-y:auto;border-radius:12px;padding:22px;}
            .rc-thread{background:#f6f7f9;border-radius:10px;padding:14px;max-height:340px;overflow-y:auto;margin:14px 0;}
            .rc-msg{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:10px;font-size:13px;}
            .rc-msg.equipe{background:#eef8ff;border-color:#b8e2f7;margin-left:24px;}
            .rc-msg-meta{font-size:11px;color:#6c757d;margin-bottom:4px;display:flex;justify-content:space-between;gap:10px;}
            #reclamacoesClientesTable th{cursor:default;}
            .rc-sync-spin{animation:rc-spin 1s linear infinite;}
            @keyframes rc-spin{to{transform:rotate(360deg);}}
            .rc-modal.rc-modal-relatorio{max-width:900px;}
            .rc-rel-resumo{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0 18px;}
            .rc-rel-card{border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px;background:#f8fafc;min-width:160px;}
            .rc-rel-card small{display:block;color:#64748b;font-size:11px;}
            .rc-rel-card strong{font-size:20px;display:block;margin-top:2px;color:#0f172a;}
            .rc-rel-tabela{width:100%;font-size:13px;border-collapse:collapse;}
            .rc-rel-tabela th{text-align:left;padding:6px 8px;border-bottom:2px solid #e2e8f0;color:#475569;}
            .rc-rel-tabela td{padding:7px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle;}
            .rc-rel-barra{height:8px;background:#eef2f7;border-radius:6px;overflow:hidden;min-width:80px;}
            .rc-rel-barra span{display:block;height:100%;background:#0d6efd;}

            .rc-acomp{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:18px;box-shadow:0 1px 3px rgba(15,23,42,.05);}
            .rc-acomp-header{display:flex;align-items:center;gap:8px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #f1f5f9;}
            .rc-acomp-header h5{margin:0;font-size:15px;font-weight:700;color:#1e293b;display:flex;align-items:center;gap:8px;}
            .rc-acomp-header h5 i{color:#94a3b8;}
            .rc-acomp-flag{margin-left:auto;font-size:11px;font-weight:700;padding:5px 12px;border-radius:20px;white-space:nowrap;}
            .rc-acomp-flag.on{background:#fde8ea;color:#a61b29;}
            .rc-acomp-flag.off{background:#eef2f7;color:#64748b;}
            .rc-field{margin-bottom:18px;}
            .rc-field:last-child{margin-bottom:0;}
            .rc-field>label{display:block;font-size:12.5px;font-weight:700;color:#334155;margin-bottom:8px;}
            .rc-field>label i{color:#94a3b8;margin-right:5px;width:14px;text-align:center;}
            .rc-field small{display:block;color:#94a3b8;font-size:11px;margin-top:6px;}
            .rc-pills{display:flex;gap:8px;flex-wrap:wrap;}
            .rc-pill{position:relative;cursor:pointer;}
            .rc-pill input{position:absolute;opacity:0;inset:0;margin:0;width:100%;height:100%;cursor:pointer;}
            .rc-pill span{display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border-radius:20px;border:1.5px solid #e2e8f0;background:#f8fafc;font-size:12.5px;font-weight:600;color:#64748b;transition:.15s;}
            .rc-pill:hover span{border-color:#cbd5e1;}
            .rc-pill input:checked + span{border-color:#0d6efd;background:#eaf2ff;color:#0d6efd;}
            .rc-pill.rc-pill-danger input:checked + span{border-color:#dc3545;background:#fde8ea;color:#a61b29;}
            .rc-pill.rc-pill-success input:checked + span{border-color:#198754;background:#e3f7e8;color:#1c7a34;}
            .rc-money{position:relative;max-width:220px;}
            .rc-money::before{content:'R$';position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:12.5px;font-weight:700;color:#94a3b8;pointer-events:none;}
            .rc-money input{padding-left:34px !important;}
            .rc-subcard{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-top:12px;}
            .rc-subcard-titulo{font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.03em;margin-bottom:12px;display:flex;align-items:center;gap:6px;}
            .rc-envios-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
            .rc-envios-grid .full{grid-column:1/-1;}
            .rc-envios-grid label{display:block;font-size:11px;font-weight:600;color:#64748b;margin-bottom:4px;}
            .rc-envio-item{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:8px;font-size:12.5px;}
            .rc-envio-item .rc-envio-info strong{color:#1e293b;}
            .rc-envio-item .rc-envio-meta{color:#64748b;margin-top:3px;line-height:1.5;}
            .rc-envio-item .rc-envio-meta i{width:14px;color:#94a3b8;}

            .rc-rel-tabs{display:flex;gap:8px;margin-bottom:18px;border-bottom:1px solid #e2e8f0;padding-bottom:14px;flex-wrap:wrap;}
            .rc-rel-tab{background:#f8fafc;border:1px solid #e2e8f0;color:#64748b;border-radius:20px;padding:8px 16px;font-size:12.5px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:.15s;}
            .rc-rel-tab:hover{border-color:#cbd5e1;color:#334155;}
            .rc-rel-tab.active{background:#0d6efd;border-color:#0d6efd;color:#fff;}
        `;
        document.head.appendChild(st);
    }

    // ============================================================
    // TELA PRINCIPAL
    // ============================================================

    function criarTelaRC() {
        if (document.getElementById('reclamacoesClientesSystem')) return;

        const div = document.createElement('div');
        div.id = 'reclamacoesClientesSystem';
        div.className = 'hidden';
        div.innerHTML = `
            <header class="main-header">
                <div class="container">
                    <div class="header-content">
                        <h1 style="display:flex;align-items:center;gap:10px;">
                            <img src="logo.png" alt="Wheel Tech" style="height:35px;width:auto;">
                            <span>Reclamações de Clientes</span>
                        </h1>
                    </div>
                </div>
            </header>

            <div class="container">
                <div class="card mb-4">
                    <div class="card-header">
                        <h2 class="card-title"><i class="fas fa-user-shield"></i> Reclamações abertas por clientes no Mercado Livre</h2>
                        <div class="d-flex gap-2 align-items-center">
                            <span class="badge badge-info" id="rcContagem">0</span>
                            <button class="btn btn-primary" id="rcBtnSincronizar" onclick="window.sincronizarReclamacoesClientesML()">
                                <i class="fas fa-sync-alt"></i> Sincronizar com o Mercado Livre
                            </button>
                            <button class="btn btn-outline-success" onclick="window.exportarReclamacoesClientesExcel()">
                                <i class="fas fa-file-excel"></i> Exportar Excel
                            </button>
                            <button class="btn btn-outline-primary" onclick="window.abrirRelatoriosRC()">
                                <i class="fas fa-chart-bar"></i> Relatórios
                            </button>
                        </div>
                    </div>

                    <div class="d-flex flex-wrap gap-2 align-items-center" style="padding:0 20px 15px;">
                        <button class="btn btn-sm btn-primary active" data-filtro-rc="todas" onclick="window.filtrarReclamacoesClientes('todas')">Todas</button>
                        <button class="btn btn-sm btn-outline-danger" data-filtro-rc="aberta" onclick="window.filtrarReclamacoesClientes('aberta')">Abertas</button>
                        <button class="btn btn-sm btn-outline-warning" data-filtro-rc="em_andamento" onclick="window.filtrarReclamacoesClientes('em_andamento')">Em andamento</button>
                        <button class="btn btn-sm btn-outline-success" data-filtro-rc="resolvida" onclick="window.filtrarReclamacoesClientes('resolvida')">Resolvidas</button>
                        <button class="btn btn-sm btn-outline-secondary" data-filtro-rc="fechada" onclick="window.filtrarReclamacoesClientes('fechada')">Fechadas</button>
                        <div style="flex:1;min-width:200px;margin-left:auto;">
                            <input type="text" id="rcBusca" class="form-control form-control-sm" placeholder="🔍 Buscar por venda, cliente ou motivo..." oninput="window.filtrarReclamacoesClientes()">
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="table table-striped" id="reclamacoesClientesTable">
                            <thead>
                                <tr>
                                    <th>Venda</th>
                                    <th>Cliente</th>
                                    <th>Motivo</th>
                                    <th>Valor</th>
                                    <th>Status</th>
                                    <th>Responsável</th>
                                    <th>Aberta em</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody id="reclamacoesClientesBody">
                                <tr><td colspan="8" class="text-center py-5">Clique em "Sincronizar com o Mercado Livre" para carregar as reclamações.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }

    // ============================================================
    // MODAL DE DETALHES / CONVERSA
    // ============================================================

    function criarModalDetalhesRC() {
        if (document.getElementById('rcModalDetalhes')) return;

        const overlay = document.createElement('div');
        overlay.id = 'rcModalDetalhes';
        overlay.className = 'rc-overlay hidden-rc';
        overlay.innerHTML = `
            <div class="rc-modal">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px;">
                    <div>
                        <h3 style="margin:0;"><i class="fas fa-user-shield"></i> Reclamação <span id="rcDetTitulo"></span></h3>
                        <div style="font-size:12px;color:#6c757d;margin-top:4px;" id="rcDetSubtitulo"></div>
                    </div>
                    <button onclick="window.fecharDetalhesReclamacaoCliente()" style="background:none;border:none;font-size:22px;cursor:pointer;">&times;</button>
                </div>

                <div id="rcDetCorpo">
                    <div class="text-center py-4"><span class="spinner"></span> Carregando...</div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', e => {
            if (e.target === overlay) window.fecharDetalhesReclamacaoCliente();
        });
    }

    function criarModalRelatoriosRC() {
        if (document.getElementById('rcModalRelatorios')) return;

        const overlay = document.createElement('div');
        overlay.id = 'rcModalRelatorios';
        overlay.className = 'rc-overlay hidden-rc';
        overlay.innerHTML = `
            <div class="rc-modal rc-modal-relatorio">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:14px;">
                    <h3 style="margin:0;"><i class="fas fa-chart-bar"></i> Relatórios</h3>
                    <div class="d-flex gap-2 align-items-center">
                        <button class="btn btn-sm btn-outline-success" onclick="window.exportarRelatorioAtualRC()">
                            <i class="fas fa-file-excel"></i> Exportar
                        </button>
                        <button onclick="window.fecharRelatoriosRC()" style="background:none;border:none;font-size:22px;cursor:pointer;">&times;</button>
                    </div>
                </div>
                <div class="rc-rel-tabs">
                    <button class="rc-rel-tab" data-aba-rel="motivos" onclick="window.trocarAbaRelatorioRC('motivos')"><i class="fas fa-list"></i> Motivos das reclamações</button>
                    <button class="rc-rel-tab" data-aba-rel="reputacao" onclick="window.trocarAbaRelatorioRC('reputacao')"><i class="fas fa-star-half-alt"></i> Reputação</button>
                    <button class="rc-rel-tab" data-aba-rel="envios" onclick="window.trocarAbaRelatorioRC('envios')"><i class="fas fa-truck"></i> Envio de correios</button>
                </div>
                <div id="rcRelatoriosCorpo">
                    <div class="text-center py-4"><span class="spinner"></span> Carregando...</div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', e => {
            if (e.target === overlay) window.fecharRelatoriosRC();
        });
    }

    let abaRelatorioAtualRC = 'motivos';

    window.abrirRelatoriosRC = function (aba) {
        criarModalRelatoriosRC();
        document.getElementById('rcModalRelatorios')?.classList.remove('hidden-rc');
        window.trocarAbaRelatorioRC(aba || abaRelatorioAtualRC || 'motivos');
    };

    window.fecharRelatoriosRC = function () {
        document.getElementById('rcModalRelatorios')?.classList.add('hidden-rc');
    };

    window.trocarAbaRelatorioRC = function (aba) {
        abaRelatorioAtualRC = aba;
        document.querySelectorAll('.rc-rel-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.abaRel === aba));

        if (aba === 'motivos') renderizarRelatorioMotivosRC();
        else if (aba === 'reputacao') window.gerarRelatorioReputacaoRC();
        else if (aba === 'envios') window.gerarRelatorioEnviosCorreioRC();
    };

    window.exportarRelatorioAtualRC = function () {
        if (abaRelatorioAtualRC === 'motivos') window.exportarRelatorioMotivosRCExcel();
        else if (abaRelatorioAtualRC === 'reputacao') window.exportarRelatorioReputacaoRCExcel();
        else if (abaRelatorioAtualRC === 'envios') window.exportarRelatorioEnviosCorreioRCExcel();
    };

    // ============================================================
    // ABRIR SISTEMA
    // ============================================================

    window.abrirSistemaReclamacoesClientes = async function () {
        if (!usuarioAtual()) {
            showToast?.('⚠️ Faça login primeiro', 'warning');
            return;
        }

        instalarEstiloRC();
        criarTelaRC();
        criarModalDetalhesRC();

        if (typeof esconderTodosOsSistemas === 'function') {
            esconderTodosOsSistemas('reclamacoesClientesSystem');
        } else {
            document.getElementById('menuSystem')?.classList.add('hidden');
        }

        document.getElementById('reclamacoesClientesSystem')?.classList.remove('hidden');

        const u = usuarioAtual();
        const nomeEl = document.getElementById('rcUserName');
        const avatarEl = document.getElementById('rcUserAvatar');
        const roleEl = document.getElementById('rcUserRole');
        if (nomeEl) nomeEl.textContent = u.name || 'Usuário';
        if (avatarEl) avatarEl.textContent = u.avatar || (u.name || 'U').charAt(0).toUpperCase();
        if (roleEl) roleEl.textContent = u.role || '';

        await window.carregarReclamacoesClientes();
    };

    // ============================================================
    // CARREGAR / RENDERIZAR LISTA
    // ============================================================

    let reclamacoesCache = [];
    let filtroAtualRC = 'todas';

    window.carregarReclamacoesClientes = async function () {
        const cli = sb();
        const tbody = document.getElementById('reclamacoesClientesBody');
        if (!cli || !tbody) return;

        try {
            const { data, error } = await cli
                .from(CFG_RC.tabela)
                .select('*')
                .order('ml_criado_em', { ascending: false });

            if (error) throw error;

            reclamacoesCache = data || [];
            renderizarReclamacoesClientes();

        } catch (error) {
            console.error('❌ [Reclamações Clientes] Erro ao carregar:', error);
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Erro ao carregar: ${esc(error.message)}</td></tr>`;
        }
    };

    window.filtrarReclamacoesClientes = function (novoFiltro) {
        if (novoFiltro) {
            filtroAtualRC = novoFiltro;
            document.querySelectorAll('[data-filtro-rc]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.filtroRc === novoFiltro);
            });
        }
        renderizarReclamacoesClientes();
    };

    window.exportarReclamacoesClientesExcel = function() {
        if (!Array.isArray(reclamacoesCache) || reclamacoesCache.length === 0) {
            showToast('Nenhuma reclamação para exportar', 'warning');
            return;
        }
        const dados = reclamacoesCache.map(r => ({
            'Venda': r.numero_venda || '',
            'Cliente': r.comprador_nome || r.comprador_nickname || '',
            'Motivo': r.motivo || '',
            'Valor': r.valor ?? '',
            'Status': cfgStatusRC(r.status).texto,
            'Responsável': r.responsavel || '',
            'Aberta em': r.ml_criado_em || r.criado_em || ''
        }));
        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Reclamacoes_Clientes');
        XLSX.writeFile(wb, `reclamacoes_clientes_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast(`✅ ${dados.length} registro(s) exportado(s)!`, 'success');
    };

    // ============================================================
    // RELATÓRIO DE MOTIVOS
    // ============================================================

    let graficoMotivosRC = null;
    let motivosAgrupadosRC = [];

    function agruparPorMotivoRC() {
        const mapa = new Map();
        reclamacoesCache.forEach(r => {
            const chave = String(r.motivo || '').trim() || 'Não informado';
            mapa.set(chave, (mapa.get(chave) || 0) + 1);
        });
        return Array.from(mapa.entries())
            .map(([motivo, quantidade]) => ({ motivo, quantidade }))
            .sort((a, b) => b.quantidade - a.quantidade);
    }

    function renderizarRelatorioMotivosRC() {
        const corpo = document.getElementById('rcRelatoriosCorpo');
        if (!corpo) return;

        motivosAgrupadosRC = agruparPorMotivoRC();
        const total = reclamacoesCache.length;

        if (!total) {
            corpo.innerHTML = `<div class="text-center text-muted py-5">Nenhuma reclamação carregada ainda. Sincronize com o Mercado Livre primeiro.</div>`;
            return;
        }

        const maisUsado = motivosAgrupadosRC[0];

        corpo.innerHTML = `
            <div class="rc-rel-resumo">
                <div class="rc-rel-card"><small>Total de reclamações</small><strong>${total}</strong></div>
                <div class="rc-rel-card"><small>Motivos diferentes</small><strong>${motivosAgrupadosRC.length}</strong></div>
                <div class="rc-rel-card" style="background:#eef6ff;border-color:#b6d4fe;"><small>Motivo mais usado</small><strong style="font-size:14px;line-height:1.3;">${esc(maisUsado.motivo)} <span style="color:#0d6efd;">(${maisUsado.quantidade})</span></strong></div>
            </div>
            <div style="height:${Math.max(220, motivosAgrupadosRC.length * 34)}px; max-height:420px; overflow-y:auto; margin-bottom:20px;">
                <canvas id="rcGraficoMotivos"></canvas>
            </div>
            <div class="table-responsive">
                <table class="rc-rel-tabela">
                    <thead><tr><th>Motivo</th><th style="text-align:right;">Quantidade</th><th>% do total</th></tr></thead>
                    <tbody>
                        ${motivosAgrupadosRC.map(m => {
                            const pct = total ? Math.round((m.quantidade / total) * 1000) / 10 : 0;
                            return `
                                <tr>
                                    <td>${esc(m.motivo)}</td>
                                    <td style="text-align:right;font-weight:700;">${m.quantidade}</td>
                                    <td>
                                        <div style="display:flex;align-items:center;gap:8px;">
                                            <div class="rc-rel-barra" style="flex:1;"><span style="width:${pct}%;"></span></div>
                                            <small style="color:#64748b;min-width:42px;">${pct}%</small>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        desenharGraficoMotivosRC();
    }

    function desenharGraficoMotivosRC() {
        const canvas = document.getElementById('rcGraficoMotivos');
        if (!canvas || typeof Chart === 'undefined') return;

        if (graficoMotivosRC) {
            graficoMotivosRC.destroy();
            graficoMotivosRC = null;
        }

        // Barra horizontal: o primeiro item da lista (já ordenada do mais
        // pro menos usado) fica no topo do gráfico.
        const dados = motivosAgrupadosRC;
        const cores = dados.map((_, i) => i === 0 ? '#0d6efd' : 'rgba(13,110,253,0.55)');

        graficoMotivosRC = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: dados.map(m => m.motivo.length > 60 ? m.motivo.slice(0, 57) + '…' : m.motivo),
                datasets: [{
                    label: 'Reclamações',
                    data: dados.map(m => m.quantidade),
                    backgroundColor: cores,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (itens) => dados[itens[0].dataIndex]?.motivo || ''
                        }
                    }
                },
                scales: {
                    x: { beginAtZero: true, ticks: { precision: 0 } }
                }
            }
        });
    }

    window.exportarRelatorioMotivosRCExcel = function () {
        if (!motivosAgrupadosRC.length) {
            showToast('Nenhum dado para exportar', 'warning');
            return;
        }
        const total = reclamacoesCache.length;
        const dados = motivosAgrupadosRC.map(m => ({
            'Motivo': m.motivo,
            'Quantidade': m.quantidade,
            '% do total': total ? Math.round((m.quantidade / total) * 1000) / 10 : 0
        }));
        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Motivos');
        XLSX.writeFile(wb, `reclamacoes_clientes_motivos_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast('✅ Relatório exportado!', 'success');
    };

    // ============================================================
    // RELATÓRIO DE REPUTAÇÃO
    // ============================================================

    let relatorioReputacaoRC = { porUsuario: [], custos: [], totalCustos: 0 };

    function formatarDuracaoRC(ms) {
        if (ms == null || isNaN(ms) || ms < 0) return '—';
        const horas = ms / 3600000;
        if (horas < 24) return `${horas.toFixed(1)}h`;
        return `${(horas / 24).toFixed(1)}d`;
    }

    window.abrirRelatorioReputacaoRC = function () {
        criarModalRelatorioReputacaoRC();
        document.getElementById('rcModalRelatorioReputacao')?.classList.remove('hidden-rc');
        window.gerarRelatorioReputacaoRC();
    };

    window.fecharRelatorioReputacaoRC = function () {
        document.getElementById('rcModalRelatorioReputacao')?.classList.add('hidden-rc');
    };

    function seletorPeriodoRepHtml(periodoDias) {
        return `
            <div class="d-flex justify-content-end align-items-center gap-2 mb-3">
                <label style="font-size:12px;margin:0;">Período:</label>
                <select id="rcRepPeriodo" class="form-control form-control-sm" style="width:auto;" onchange="window.gerarRelatorioReputacaoRC()">
                    <option value="30" ${periodoDias === 30 ? 'selected' : ''}>Últimos 30 dias</option>
                    <option value="90" ${periodoDias === 90 ? 'selected' : ''}>Últimos 90 dias</option>
                    <option value="365" ${periodoDias === 365 ? 'selected' : ''}>Último ano</option>
                    <option value="0" ${periodoDias === 0 ? 'selected' : ''}>Todo o período</option>
                </select>
            </div>
        `;
    }

    window.gerarRelatorioReputacaoRC = function () {
        const corpo = document.getElementById('rcRelatoriosCorpo');
        if (!corpo) return;

        const periodoDias = parseInt(document.getElementById('rcRepPeriodo')?.value ?? '90', 10);
        const limite = periodoDias ? Date.now() - periodoDias * 86400000 : null;

        const lista = reclamacoesCache.filter(r => {
            if (!r.afeta_reputacao) return false;
            if (!limite) return true;
            const data = new Date(r.ml_criado_em || r.criado_em).getTime();
            return !isNaN(data) && data >= limite;
        });

        if (!lista.length) {
            corpo.innerHTML = seletorPeriodoRepHtml(periodoDias) +
                `<div class="text-center text-muted py-5">Nenhuma reclamação marcada como "afeta reputação" no período selecionado.</div>`;
            relatorioReputacaoRC = { porUsuario: [], custos: [], totalCustos: 0 };
            return;
        }

        // Agrupamento por responsável: total, resolvidas, tempo médio de resolução.
        const mapaUsuario = new Map();
        lista.forEach(r => {
            const chave = r.responsavel || 'Sem responsável definido';
            if (!mapaUsuario.has(chave)) mapaUsuario.set(chave, { responsavel: chave, total: 0, resolvidas: 0, somaMs: 0 });
            const item = mapaUsuario.get(chave);
            item.total++;
            if (r.data_resolucao) {
                item.resolvidas++;
                const inicio = new Date(r.ml_criado_em || r.criado_em).getTime();
                const fim = new Date(r.data_resolucao).getTime();
                if (!isNaN(inicio) && !isNaN(fim) && fim >= inicio) item.somaMs += (fim - inicio);
            }
        });
        const porUsuario = Array.from(mapaUsuario.values())
            .map(item => ({ ...item, tempoMedioMs: item.resolvidas ? item.somaMs / item.resolvidas : null }))
            .sort((a, b) => b.total - a.total);

        // Custos com erros nossos.
        const custos = lista
            .filter(r => r.erro_nosso === true && r.custo != null && Number(r.custo) > 0)
            .sort((a, b) => new Date(b.ml_criado_em || b.criado_em) - new Date(a.ml_criado_em || a.criado_em));
        const totalCustos = custos.reduce((soma, r) => soma + Number(r.custo || 0), 0);

        relatorioReputacaoRC = { porUsuario, custos, totalCustos };

        corpo.innerHTML = seletorPeriodoRepHtml(periodoDias) + `
            <div class="rc-rel-resumo">
                <div class="rc-rel-card"><small>Reclamações c/ reputação afetada</small><strong>${lista.length}</strong></div>
                <div class="rc-rel-card"><small>Resolvidas</small><strong>${lista.filter(r => r.data_resolucao).length}</strong></div>
                <div class="rc-rel-card" style="background:#fff0f0;border-color:#f1b0b0;"><small>Custo total (erro nosso)</small><strong style="color:#a61b29;">R$ ${totalCustos.toFixed(2)}</strong></div>
            </div>

            <h4 style="font-size:14px;">Tempo de resolução e quantidade, por responsável</h4>
            <div class="table-responsive mb-4">
                <table class="rc-rel-tabela">
                    <thead><tr><th>Responsável</th><th style="text-align:right;">Total</th><th style="text-align:right;">Resolvidas</th><th style="text-align:right;">Pendentes</th><th style="text-align:right;">Tempo médio</th></tr></thead>
                    <tbody>
                        ${porUsuario.map(u => `
                            <tr>
                                <td>${esc(u.responsavel)}</td>
                                <td style="text-align:right;font-weight:700;">${u.total}</td>
                                <td style="text-align:right;">${u.resolvidas}</td>
                                <td style="text-align:right;">${u.total - u.resolvidas}</td>
                                <td style="text-align:right;">${formatarDuracaoRC(u.tempoMedioMs)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <h4 style="font-size:14px;">Custos com erros nossos</h4>
            ${custos.length === 0
                ? '<div class="text-muted py-3">Nenhuma reclamação com erro nosso e custo registrado no período.</div>'
                : `<div class="table-responsive">
                    <table class="rc-rel-tabela">
                        <thead><tr><th>Data</th><th>Responsável</th><th>Venda</th><th>Motivo</th><th>Solução</th><th style="text-align:right;">Custo</th></tr></thead>
                        <tbody>
                            ${custos.map(r => `
                                <tr>
                                    <td>${fmtData(r.ml_criado_em || r.criado_em)}</td>
                                    <td>${esc(r.responsavel || '—')}</td>
                                    <td>${esc(r.numero_venda || '—')}</td>
                                    <td>${esc(r.motivo || '—')}</td>
                                    <td>${esc(r.solucao_interna || '—')}</td>
                                    <td style="text-align:right;font-weight:700;">R$ ${Number(r.custo).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div style="text-align:right;font-weight:700;margin-top:8px;">Total: R$ ${totalCustos.toFixed(2)} em ${custos.length} reclamação(ões) com erro nosso e custo registrado.</div>
                </div>`
            }
        `;
    };

    window.exportarRelatorioReputacaoRCExcel = function () {
        if (!relatorioReputacaoRC.porUsuario.length && !relatorioReputacaoRC.custos.length) {
            showToast('Nenhum dado para exportar', 'warning');
            return;
        }
        const wb = XLSX.utils.book_new();

        const dadosUsuario = relatorioReputacaoRC.porUsuario.map(u => ({
            'Responsável': u.responsavel,
            'Total': u.total,
            'Resolvidas': u.resolvidas,
            'Pendentes': u.total - u.resolvidas,
            'Tempo médio de resolução': formatarDuracaoRC(u.tempoMedioMs)
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dadosUsuario), 'Por responsavel');

        const dadosCustos = relatorioReputacaoRC.custos.map(r => ({
            'Data': fmtData(r.ml_criado_em || r.criado_em),
            'Responsável': r.responsavel || '',
            'Venda': r.numero_venda || '',
            'Motivo': r.motivo || '',
            'Solução': r.solucao_interna || '',
            'Custo': Number(r.custo || 0)
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dadosCustos), 'Custos erro nosso');

        XLSX.writeFile(wb, `reclamacoes_clientes_reputacao_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast('✅ Relatório exportado!', 'success');
    };

    // ============================================================
    // RELATÓRIO DE ENVIO DE CORREIOS
    // ============================================================

    let dadosEnviosCorreioRC = null; // cache: todos os envios já com a reclamação (erro_nosso) embutida
    let relatorioEnviosCorreioRC = { porMes: [], anoSelecionado: null, totalErro: 0, totalAcerto: 0 };
    let graficoEnviosCorreioRC = null;

    async function carregarTodosEnviosCorreioRC() {
        const cli = sb();
        const todos = [];
        let inicio = 0;
        let continuar = true;
        while (continuar) {
            const { data, error } = await cli
                .from('reclamacoes_clientes_envios_correio')
                .select('*, reclamacoes_clientes(erro_nosso, numero_venda, responsavel)')
                .order('data_postagem', { ascending: true })
                .range(inicio, inicio + 999);
            if (error) throw error;
            todos.push(...(data || []));
            if (!data || data.length < 1000) continuar = false;
            else inicio += 1000;
        }

        // Envios por correio das Vendas Vendedores (vendas_vendedores.js)
        // entram como uma terceira categoria. Lidos direto da tabela da
        // venda — sem cópia — para o frete preenchido depois na venda já
        // aparecer aqui. Sem data de postagem, vale a data da venda.
        try {
            let inicioVV = 0;
            while (true) {
                const { data, error } = await cli
                    .from('vendas_vendedores')
                    .select('id, criado_em, data_postagem, valor_frete, codigo_rastreio, nome_destinatario, cliente_nome')
                    .eq('forma_entrega', 'correio')
                    .neq('status', 'cancelada')
                    .range(inicioVV, inicioVV + 999);
                if (error) throw error;
                (data || []).forEach(v => {
                    const criado = v.criado_em ? new Date(v.criado_em) : null;
                    const dataVenda = criado && !isNaN(criado.getTime())
                        ? `${criado.getFullYear()}-${String(criado.getMonth() + 1).padStart(2, '0')}-${String(criado.getDate()).padStart(2, '0')}`
                        : null;
                    todos.push({
                        origem: 'venda_vendedor',
                        venda_vendedor_id: v.id,
                        data_postagem: v.data_postagem || dataVenda,
                        valor_frete: v.valor_frete,
                        codigo_rastreio: v.codigo_rastreio,
                        nome_cliente: v.nome_destinatario || v.cliente_nome
                    });
                });
                if (!data || data.length < 1000) break;
                inicioVV += 1000;
            }
        } catch (error) {
            console.warn('⚠️ [Reclamações Clientes] Envios das Vendas Vendedores não carregados:', error);
        }

        dadosEnviosCorreioRC = todos;
    }

    // Chamado pelo módulo Vendas Vendedores ao salvar/editar/cancelar
    // uma venda com envio por correio.
    window.invalidarRelatorioEnviosCorreioRC = function () {
        dadosEnviosCorreioRC = null;
    };

    function ehEnvioVendaRC(e) {
        return e.origem === 'venda_vendedor';
    }

    window.gerarRelatorioEnviosCorreioRC = async function () {
        const corpo = document.getElementById('rcRelatoriosCorpo');
        if (!corpo) return;

        if (!dadosEnviosCorreioRC) {
            corpo.innerHTML = `<div class="text-center py-4"><span class="spinner"></span> Carregando...</div>`;
            try {
                await carregarTodosEnviosCorreioRC();
            } catch (error) {
                corpo.innerHTML = `<div class="text-danger py-4">Erro ao carregar: ${esc(error.message)}</div>`;
                return;
            }
        }

        if (!dadosEnviosCorreioRC.length) {
            corpo.innerHTML = `<div class="text-center text-muted py-5">Nenhum envio de correio registrado ainda (reclamações ou vendas vendedores).</div>`;
            relatorioEnviosCorreioRC = { porMes: [], anoSelecionado: null, totalErro: 0, totalAcerto: 0 };
            return;
        }

        const anos = Array.from(new Set(dadosEnviosCorreioRC
            .map(e => e.data_postagem ? new Date(e.data_postagem + 'T00:00').getFullYear() : null)
            .filter(a => a != null))).sort((a, b) => b - a);

        if (!anos.length) {
            corpo.innerHTML = `<div class="text-center text-muted py-5">Nenhum envio com data de postagem preenchida ainda.</div>`;
            relatorioEnviosCorreioRC = { porMes: [], anoSelecionado: null, totalErro: 0, totalAcerto: 0 };
            return;
        }

        const anoSelectAtual = document.getElementById('rcEnvioAno');
        const anoSelecionado = anoSelectAtual && anos.includes(parseInt(anoSelectAtual.value, 10))
            ? parseInt(anoSelectAtual.value, 10)
            : anos[0];

        renderizarRelatorioEnviosCorreioRC(anos, anoSelecionado);
    };

    function renderizarRelatorioEnviosCorreioRC(anos, anoSelecionado) {
        const corpo = document.getElementById('rcRelatoriosCorpo');
        if (!corpo) return;

        const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const doAno = dadosEnviosCorreioRC.filter(e => e.data_postagem && new Date(e.data_postagem + 'T00:00').getFullYear() === anoSelecionado);

        const porMes = nomesMeses.map((nome, idx) => {
            const doMes = doAno.filter(e => new Date(e.data_postagem + 'T00:00').getMonth() === idx);
            const comFrete = doMes.filter(e => e.valor_frete != null);
            const erro = comFrete
                .filter(e => !ehEnvioVendaRC(e) && e.reclamacoes_clientes?.erro_nosso === true)
                .reduce((s, e) => s + Number(e.valor_frete), 0);
            const acerto = comFrete
                .filter(e => !ehEnvioVendaRC(e) && e.reclamacoes_clientes?.erro_nosso !== true)
                .reduce((s, e) => s + Number(e.valor_frete), 0);
            const vendas = comFrete
                .filter(ehEnvioVendaRC)
                .reduce((s, e) => s + Number(e.valor_frete), 0);
            return {
                mes: nome, qtd: doMes.length, qtdVendas: doMes.filter(ehEnvioVendaRC).length,
                erro, acerto, vendas, total: erro + acerto + vendas, semFrete: doMes.length - comFrete.length
            };
        });

        const totalErro = porMes.reduce((s, m) => s + m.erro, 0);
        const totalAcerto = porMes.reduce((s, m) => s + m.acerto, 0);
        const totalVendas = porMes.reduce((s, m) => s + m.vendas, 0);
        const totalSemFrete = porMes.reduce((s, m) => s + m.semFrete, 0);

        relatorioEnviosCorreioRC = { porMes, anoSelecionado, totalErro, totalAcerto, totalVendas };

        corpo.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-3" style="gap:10px;">
                <div style="font-size:12px;color:#6c757d;max-width:520px;">Custo dos envios pelo correio: os feitos por causa de reclamações (separados entre erro nosso e as demais — erro externo ou ainda não definido) e os das Vendas Vendedores.</div>
                <div class="d-flex gap-2 align-items-center">
                    <label style="font-size:12px;margin:0;">Ano:</label>
                    <select id="rcEnvioAno" class="form-control form-control-sm" style="width:auto;" onchange="window.gerarRelatorioEnviosCorreioRC()">
                        ${anos.map(a => `<option value="${a}" ${a === anoSelecionado ? 'selected' : ''}>${a}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div class="rc-rel-resumo">
                <div class="rc-rel-card"><small>Envios no ano</small><strong>${doAno.length}</strong></div>
                <div class="rc-rel-card" style="background:#fff0f0;border-color:#f1b0b0;"><small>Gasto com erro nosso</small><strong style="color:#a61b29;">R$ ${totalErro.toFixed(2)}</strong></div>
                <div class="rc-rel-card" style="background:#e3f7e8;border-color:#b7e4c7;"><small>Gasto com acerto</small><strong style="color:#1c7a34;">R$ ${totalAcerto.toFixed(2)}</strong></div>
                <div class="rc-rel-card" style="background:#eaf2ff;border-color:#b6d0f7;"><small>Gasto com vendas vendedores</small><strong style="color:#0d6efd;">R$ ${totalVendas.toFixed(2)}</strong></div>
                <div class="rc-rel-card"><small>Total gasto no ano</small><strong>R$ ${(totalErro + totalAcerto + totalVendas).toFixed(2)}</strong></div>
                ${totalSemFrete ? `<div class="rc-rel-card" style="background:#fff8e1;border-color:#ffe0a3;"><small>Frete ainda não preenchido</small><strong style="color:#8a6d00;">${totalSemFrete}</strong></div>` : ''}
            </div>

            <div style="height:280px;margin-bottom:20px;">
                <canvas id="rcGraficoEnviosCorreio"></canvas>
            </div>

            <div class="table-responsive">
                <table class="rc-rel-tabela">
                    <thead><tr><th>Mês</th><th style="text-align:right;">Envios</th><th style="text-align:right;">Erro nosso</th><th style="text-align:right;">Acerto</th><th style="text-align:right;">Vendas vendedores</th><th style="text-align:right;">Total</th></tr></thead>
                    <tbody>
                        ${porMes.map(m => `
                            <tr>
                                <td>${m.mes}</td>
                                <td style="text-align:right;">${m.qtd}${m.qtdVendas ? ` <small style="color:#64748b;">(${m.qtdVendas} de vendas)</small>` : ''}</td>
                                <td style="text-align:right;color:#a61b29;">${m.erro ? 'R$ ' + m.erro.toFixed(2) : '—'}</td>
                                <td style="text-align:right;color:#1c7a34;">${m.acerto ? 'R$ ' + m.acerto.toFixed(2) : '—'}</td>
                                <td style="text-align:right;color:#0d6efd;">${m.vendas ? 'R$ ' + m.vendas.toFixed(2) : '—'}</td>
                                <td style="text-align:right;font-weight:700;">R$ ${m.total.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        desenharGraficoEnviosCorreioRC(porMes);
    }

    function desenharGraficoEnviosCorreioRC(porMes) {
        const canvas = document.getElementById('rcGraficoEnviosCorreio');
        if (!canvas || typeof Chart === 'undefined') return;

        if (graficoEnviosCorreioRC) {
            graficoEnviosCorreioRC.destroy();
            graficoEnviosCorreioRC = null;
        }

        graficoEnviosCorreioRC = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: porMes.map(m => m.mes),
                datasets: [
                    { label: 'Erro nosso', data: porMes.map(m => m.erro), backgroundColor: '#dc3545', borderRadius: 4 },
                    { label: 'Acerto', data: porMes.map(m => m.acerto), backgroundColor: '#198754', borderRadius: 4 },
                    { label: 'Vendas vendedores', data: porMes.map(m => m.vendas), backgroundColor: '#0d6efd', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => 'R$ ' + v } }
                }
            }
        });
    }

    window.exportarRelatorioEnviosCorreioRCExcel = function () {
        if (!relatorioEnviosCorreioRC.porMes || !relatorioEnviosCorreioRC.porMes.length) {
            showToast('Nenhum dado para exportar', 'warning');
            return;
        }
        const dados = relatorioEnviosCorreioRC.porMes.map(m => ({
            'Ano': relatorioEnviosCorreioRC.anoSelecionado,
            'Mês': m.mes,
            'Envios': m.qtd,
            'Gasto com erro nosso': m.erro,
            'Gasto com acerto': m.acerto,
            'Envios de vendas vendedores': m.qtdVendas,
            'Gasto com vendas vendedores': m.vendas,
            'Total': m.total,
            'Sem frete preenchido': m.semFrete
        }));
        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `Envios_${relatorioEnviosCorreioRC.anoSelecionado}`);
        XLSX.writeFile(wb, `reclamacoes_clientes_envios_correio_${relatorioEnviosCorreioRC.anoSelecionado}.xlsx`);
        showToast('✅ Relatório exportado!', 'success');
    };

    function renderizarReclamacoesClientes() {
        const tbody = document.getElementById('reclamacoesClientesBody');
        const contagem = document.getElementById('rcContagem');
        if (!tbody) return;

        const busca = String(document.getElementById('rcBusca')?.value || '').trim().toLowerCase();

        let lista = reclamacoesCache.slice();

        if (filtroAtualRC !== 'todas') {
            lista = lista.filter(r => r.status === filtroAtualRC);
        }

        if (busca) {
            lista = lista.filter(r => [r.numero_venda, r.comprador_nome, r.comprador_nickname, r.motivo]
                .some(campo => String(campo || '').toLowerCase().includes(busca)));
        }

        if (contagem) contagem.textContent = String(reclamacoesCache.length);

        if (lista.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">Nenhuma reclamação encontrada.</td></tr>`;
            return;
        }

        tbody.innerHTML = lista.map(r => {
            const st = cfgStatusRC(r.status);
            return `
                <tr>
                    <td>${linkVendaRC(r.numero_venda)}</td>
                    <td>${esc(r.comprador_nome || r.comprador_nickname || '—')}</td>
                    <td style="max-width:220px;">${esc(r.motivo || '—')}</td>
                    <td>${r.valor != null ? 'R$ ' + Number(r.valor).toFixed(2) : '—'}</td>
                    <td><span class="rc-badge ${st.classe}">${st.icone} ${esc(st.texto)}</span>${r.afeta_reputacao ? ' <span class="rc-badge" style="background:#a61b29;color:#fff;">⭐ Reputação</span>' : ''}</td>
                    <td>${esc(r.responsavel || '—')}</td>
                    <td>${fmtData(r.ml_criado_em || r.criado_em)}</td>
                    <td>
                        <button class="btn btn-sm btn-info" onclick="window.abrirDetalhesReclamacaoCliente(${r.id})" title="Ver conversa">
                            <i class="fas fa-comments"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ============================================================
    // SINCRONIZAR COM O MERCADO LIVRE
    //
    // IMPORTANTE: a API de "claims"/mediações do Mercado Livre é
    // uma integração NOVA neste sistema (nenhum outro módulo já
    // usava). O endpoint e os nomes de campo abaixo seguem a
    // documentação oficial da API de pós-venda do ML, mas como
    // não há como testar contra a API real a partir daqui, o
    // primeiro clique em "Sincronizar" deve ser conferido: abra o
    // console (F12) e veja se aparecem os logs "📋 [Reclamações
    // ML]". Se a Mercado Livre responder com um formato diferente
    // do esperado, o log mostra a resposta crua para ajustarmos.
    // ============================================================

    // Versão "crua": nunca lança erro, sempre devolve {status, corpo}.
    // Usada pelo diagnóstico, que precisa inspecionar respostas de erro.
    async function chamarMLProxyBruto(url, token) {
        const proxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
        const response = await fetch(proxy, { cache: 'no-store' });
        const texto = await response.text();

        let corpo;
        try {
            corpo = JSON.parse(texto);
        } catch {
            corpo = { _respostaNaoJson: texto.slice(0, 300) };
        }

        return { status: response.status, ok: response.ok, corpo };
    }

    async function chamarMLProxy(url, token) {
        const { status, ok, corpo } = await chamarMLProxyBruto(url, token);

        if (!ok) {
            console.error('❌ [Reclamações ML] Falha na URL:', url, '| Resposta:', corpo);
            const motivo = corpo?.message || corpo?.error || corpo?._respostaNaoJson || `Erro HTTP ${status}`;
            throw new Error(`${motivo} — URL tentada: ${url}`);
        }

        return corpo;
    }

    async function obterTokenESellerRC() {
        let token = localStorage.getItem('ml_access_token');

        if (!token && typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }

        if (!token) {
            throw new Error('Token do Mercado Livre não disponível. Conecte o Mercado Livre antes de sincronizar.');
        }

        // ml_user_id nem sempre fica salvo no localStorage (depende de como
        // o token foi conectado). Em vez de depender disso, buscamos o
        // vendedor direto na API (mesmo caminho usado no Gerenciamento de
        // Anúncios) e guardamos em cache pra não repetir a chamada.
        let sellerId = localStorage.getItem('ml_user_id');

        if (!sellerId) {
            const me = await chamarMLProxy('https://api.mercadolibre.com/users/me', token);
            sellerId = me?.id ? String(me.id) : null;

            if (sellerId) {
                localStorage.setItem('ml_user_id', sellerId);
            }
        }

        if (!sellerId) {
            throw new Error('Não foi possível identificar o vendedor no Mercado Livre. Reconecte o Mercado Livre.');
        }

        return { token, sellerId };
    }

    function mapearStatusClaimML(claim) {
        // A Wheel Tech usa um fluxo próprio (aberta/em_andamento/
        // resolvida/fechada). Reclamações NOVAS sempre entram como
        // "aberta" — o status do ML fica guardado à parte
        // (status_ml/stage_ml) só como referência; quem avança o
        // status interno é a equipe, pela tela de detalhes.
        const statusMl = String(claim?.status || '').toLowerCase();
        if (statusMl === 'closed') return 'fechada';
        return null; // null = não mexe no status interno já existente
    }

    // ---- cache de motivos (reason_id -> texto legível) ----
    // Ex.: "PDD9549" -> "Llegó lo que compré en buenas condiciones pero no lo quiero"
    const cacheMotivosRC = {};

    async function obterMotivoLegivelRC(reasonId, token) {
        if (!reasonId) return 'Não informado';
        if (cacheMotivosRC[reasonId]) return cacheMotivosRC[reasonId];

        try {
            const dados = await chamarMLProxy(
                `https://api.mercadolibre.com/post-purchase/v1/claims/reasons/${encodeURIComponent(reasonId)}`,
                token
            );
            const texto = dados?.detail || dados?.name || reasonId;
            cacheMotivosRC[reasonId] = texto;
            return texto;
        } catch (erro) {
            console.warn(`⚠️ [Reclamações ML] Motivo ${reasonId} não encontrado:`, erro);
            return reasonId;
        }
    }

    // ---- dados do pedido (nome do comprador + valor) ----
    // A claim NÃO traz nome do comprador nem valor — só user_id dos
    // players. Quando resource === "order", buscamos a order pra
    // completar esses dados (mesmo endpoint já usado em outros
    // módulos do sistema).
    async function obterDadosOrderRC(orderId, token) {
        if (!orderId) return null;

        try {
            const order = await chamarMLProxy(
                `https://api.mercadolibre.com/orders/${encodeURIComponent(orderId)}`,
                token
            );

            const total = Array.isArray(order?.order_items)
                ? order.order_items.reduce((soma, item) =>
                    soma + (Number(item?.unit_price || 0) * Number(item?.quantity || 1)), 0)
                : Number(order?.total_amount || 0);

            return {
                comprador_nome: order?.buyer?.first_name
                    ? `${order.buyer.first_name} ${order.buyer.last_name || ''}`.trim()
                    : (order?.buyer?.nickname || null),
                comprador_nickname: order?.buyer?.nickname || null,
                valor: total || null
            };
        } catch (erro) {
            console.warn(`⚠️ [Reclamações ML] Pedido ${orderId} não encontrado:`, erro);
            return null;
        }
    }

    // Quando o recurso da claim é um "shipment" (ex.: cancelamentos,
    // mediações), o resource_id é o ID do ENVIO — não da venda. Usar
    // esse número direto no link "/vendas/.../detalhe" abre uma venda
    // errada (ou nem abre). É preciso resolver o order_id real a
    // partir do envio antes de montar o link e buscar os dados.
    async function resolverOrderIdDeShipmentRC(shipmentId, token) {
        if (!shipmentId) return null;

        try {
            const envio = await chamarMLProxy(
                `https://api.mercadolibre.com/shipments/${encodeURIComponent(shipmentId)}`,
                token
            );

            const orderId =
                envio?.order_id ||
                (Array.isArray(envio?.order_ids) ? envio.order_ids[0] : null) ||
                (Array.isArray(envio?.orders) ? envio.orders[0]?.id : null) ||
                null;

            return orderId ? String(orderId) : null;

        } catch (erro) {
            console.warn(`⚠️ [Reclamações ML] Não foi possível resolver a venda do envio ${shipmentId}:`, erro);
            return null;
        }
    }

    // ============================================================
    // ESTRATÉGIA: BUSCAR DIRETO NAS RECLAMAÇÕES DA CONTA
    //
    // Uma tentativa anterior de filtrar direto pela conta (em vez de
    // percorrer venda por venda) usava os nomes de parâmetro errados
    // ("players.user_id"/"players[user_id]") e por isso a API
    // rejeitava com "atLeastOneFilterProvided". Os nomes corretos,
    // revelados pela própria mensagem de erro do ML ao tentar outra
    // combinação inválida, são "player_role" + "player_user_id" (sem
    // ponto, sem colchetes) — com isso dá pra listar TODAS as
    // reclamações da conta direto, sem depender de já termos a venda
    // sincronizada em vendas_nfe_cache nem de adivinhar uma janela de
    // dias (testado: a API não filtra por data nesse endpoint, e a
    // ordenação retornada não é cronológica — nem os últimos 1000
    // registros garantem cobrir o mais recente).
    // ============================================================

    async function obterTotalClaimsContaRC(sellerId, token) {
        const url = `https://api.mercadolibre.com/post-purchase/v1/claims/search?player_role=respondent&player_user_id=${encodeURIComponent(sellerId)}&limit=1`;
        const resposta = await chamarMLProxy(url, token);
        return Number(resposta?.paging?.total) || 0;
    }

    async function buscarPaginaClaimsContaRC(sellerId, token, offset, limite = 100) {
        const url = `https://api.mercadolibre.com/post-purchase/v1/claims/search?player_role=respondent&player_user_id=${encodeURIComponent(sellerId)}&limit=${limite}&offset=${offset}`;

        try {
            const resposta = await chamarMLProxy(url, token);
            return Array.isArray(resposta?.data) ? resposta.data : [];
        } catch (erro) {
            console.warn(`⚠️ [Reclamações ML] Falha buscando página (offset ${offset}):`, erro.message);
            return [];
        }
    }

    // Varre TODAS as páginas da conta (não é possível filtrar por data
    // ou pular direto pras mais recentes — a única forma confiável de
    // não perder nenhuma é passar por tudo). Como cada página já traz
    // os dados completos da claim, isso é rápido (segundos, não
    // minutos): o custo pesado de verdade é o enriquecimento por
    // claim (pedido/comprador/motivo/mensagens), que fica a cargo de
    // quem chama esta função decidir se precisa ou não.
    async function buscarTodasClaimsRC(sellerId, token, aoProgredir) {
        const total = await obterTotalClaimsContaRC(sellerId, token);
        if (total === 0) return [];

        const TAMANHO_PAGINA = 100;
        const CONCORRENCIA = 8;
        const offsets = [];
        for (let off = 0; off < total; off += TAMANHO_PAGINA) offsets.push(off);

        const todas = [];
        let verificadas = 0;

        for (let i = 0; i < offsets.length; i += CONCORRENCIA) {
            const lote = offsets.slice(i, i + CONCORRENCIA);

            const resultadosLote = await Promise.all(
                lote.map(off => buscarPaginaClaimsContaRC(sellerId, token, off, TAMANHO_PAGINA))
            );

            for (const claims of resultadosLote) {
                todas.push(...claims);
            }

            verificadas = Math.min(total, verificadas + lote.length * TAMANHO_PAGINA);
            aoProgredir?.(verificadas, total);
        }

        return todas;
    }

    window.sincronizarReclamacoesClientesML = async function () {
        const btn = document.getElementById('rcBtnSincronizar');
        const cli = sb();

        if (!cli) {
            showToast?.('❌ Supabase não conectado', 'error');
            return;
        }

        const iconeOriginal = btn?.innerHTML;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-sync-alt rc-sync-spin"></i> Sincronizando...';
        }

        try {
            const { token, sellerId } = await obterTokenESellerRC();

            btn && (btn.innerHTML = '<i class="fas fa-sync-alt rc-sync-spin"></i> Listando reclamações...');

            const claims = await buscarTodasClaimsRC(sellerId, token, (feitas, totalClaims) => {
                if (btn) {
                    btn.innerHTML = `<i class="fas fa-sync-alt rc-sync-spin"></i> Listando reclamações ${feitas}/${totalClaims}...`;
                }
            });

            if (claims.length === 0) {
                showToast?.('ℹ️ Nenhuma reclamação encontrada na conta.', 'info');
                await window.carregarReclamacoesClientes();
                return;
            }

            // A API não filtra por data neste endpoint (testado — o parâmetro
            // é ignorado), então a listagem traz TODO o histórico da conta
            // (milhares de reclamações desde 2019). Como o objetivo daqui é
            // acompanhar reclamações recentes (não montar um arquivo
            // histórico completo), filtra por data_created no lado do
            // sistema, depois de já termos a lista completa e confiável.
            const JANELA_DIAS = 90;
            const limiteData = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000);
            const claimsRecentes = claims.filter(claim => {
                const dataClaim = new Date(claim?.date_created || 0);
                return !isNaN(dataClaim.getTime()) && dataClaim >= limiteData;
            });

            // Já temos, numa consulta só, a data de atualização (last_updated) de
            // tudo que já está no banco. Reclamações sem mudança desde a última
            // sincronização são puladas — só quem é nova ou mudou (ex.: status)
            // passa pelo enriquecimento (que faz várias chamadas por claim).
            // Paginado porque o Supabase corta em 1000 linhas por página —
            // e essa tabela deve passar disso com o histórico completo.
            const cli = sb();
            const mapaExistentes = new Map();
            {
                const TAMANHO_PAGINA = 1000;
                let inicio = 0;
                while (true) {
                    const { data: pagina, error } = await cli
                        .from(CFG_RC.tabela)
                        .select('ml_claim_id, ml_atualizado_em')
                        .range(inicio, inicio + TAMANHO_PAGINA - 1);

                    if (error || !pagina || pagina.length === 0) break;
                    pagina.forEach(r => mapaExistentes.set(r.ml_claim_id, r.ml_atualizado_em));
                    if (pagina.length < TAMANHO_PAGINA) break;
                    inicio += TAMANHO_PAGINA;
                }
            }

            const claimsParaProcessar = claimsRecentes.filter(claim => {
                const claimId = String(claim?.id ?? '');
                const atualEm = mapaExistentes.get(claimId);
                return !atualEm || atualEm !== claim?.last_updated;
            });

            let sincronizadas = 0;
            let comErro = 0;

            for (let i = 0; i < claimsParaProcessar.length; i++) {
                const claim = claimsParaProcessar[i];
                if (btn) {
                    btn.innerHTML = `<i class="fas fa-sync-alt rc-sync-spin"></i> Sincronizando ${i + 1}/${claimsParaProcessar.length}...`;
                }
                try {
                    await sincronizarUmaClaimRC(claim, token);
                    sincronizadas++;
                } catch (erroClaim) {
                    comErro++;
                    console.error(`❌ [Reclamações ML] Falha na claim ${claim?.id}:`, erroClaim);
                }
            }

            await window.carregarReclamacoesClientes();

            const puladas = claimsRecentes.length - claimsParaProcessar.length;
            showToast?.(
                comErro > 0
                    ? `⚠️ ${sincronizadas} reclamação(ões) sincronizada(s), ${comErro} com erro (veja o console).`
                    : `✅ ${sincronizadas} nova(s)/atualizada(s) sincronizada(s) — ${puladas} já estavam em dia (${claimsRecentes.length} nos últimos ${JANELA_DIAS} dias).`,
                comErro > 0 ? 'warning' : 'success'
            );

        } catch (error) {
            console.error('❌ [Reclamações ML] Erro ao sincronizar:', error);
            showToast?.('❌ Erro ao sincronizar: ' + error.message, 'error');

        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = iconeOriginal;
            }
        }
    };

    async function sincronizarUmaClaimRC(claim, token) {
        const cli = sb();

        const claimId = String(claim?.id ?? '');
        if (!claimId) throw new Error('Claim sem id, ignorada.');

        // ---- registro já existe? preserva status/responsável internos ----
        const { data: existente } = await cli
            .from(CFG_RC.tabela)
            .select('id, status, responsavel')
            .eq('ml_claim_id', claimId)
            .maybeSingle();

        const resourceId = claim?.resource_id || null;

        const complainant = (Array.isArray(claim?.players) ? claim.players : [])
            .find(p => String(p?.role || '').toLowerCase() === 'complainant');

        // A claim não traz nome/valor — só busca a order quando o
        // recurso da reclamação é realmente um pedido. Quando o
        // recurso é um "shipment" (cancelamentos, mediações), o
        // resource_id é o ID do ENVIO, não da venda — resolve o
        // order_id real antes de usá-lo como número da venda.
        let numeroVenda = resourceId ? String(resourceId) : null;
        let dadosOrder = null;

        if (claim?.resource === 'order' && resourceId) {
            dadosOrder = await obterDadosOrderRC(resourceId, token);

        } else if (claim?.resource === 'shipment' && resourceId) {
            const orderIdResolvido = await resolverOrderIdDeShipmentRC(resourceId, token);
            if (orderIdResolvido) {
                numeroVenda = orderIdResolvido;
                dadosOrder = await obterDadosOrderRC(orderIdResolvido, token);
            }
        }

        const motivo = await obterMotivoLegivelRC(claim?.reason_id, token);

        const dados = {
            ml_claim_id: claimId,
            numero_venda: numeroVenda,
            comprador_nome: dadosOrder?.comprador_nome || null,
            comprador_nickname: dadosOrder?.comprador_nickname || null,
            motivo,
            tipo: claim?.type || claim?.resource || null,
            status_ml: claim?.status || null,
            stage_ml: claim?.stage || null,
            valor: dadosOrder?.valor ?? null,
            dados_ml: claim,
            ml_criado_em: claim?.date_created || null,
            ml_atualizado_em: claim?.last_updated || null,
            atualizado_em: new Date().toISOString()
        };

        const statusMapeado = mapearStatusClaimML(claim);
        if (!existente && statusMapeado) {
            dados.status = statusMapeado;
        } else if (!existente) {
            dados.status = 'aberta';
        }

        let reclamacaoId;

        if (existente) {
            const { error: erroUpdate } = await cli
                .from(CFG_RC.tabela)
                .update(dados)
                .eq('id', existente.id);
            if (erroUpdate) throw erroUpdate;
            reclamacaoId = existente.id;

        } else {
            const { data: inserida, error: erroInsert } = await cli
                .from(CFG_RC.tabela)
                .insert([{ ...dados, criado_em: new Date().toISOString() }])
                .select('id')
                .single();
            if (erroInsert) throw erroInsert;
            reclamacaoId = inserida.id;
        }

        // ---- mensagens da claim ----
        // "return" (devolução) não tem mensagens — a API devolve erro
        // nesse caso, por isso o try/catch aqui não é tratado como
        // falha da sincronização da reclamação em si.
        try {
            const urlMsgs = `https://api.mercadolibre.com/post-purchase/v1/claims/${claimId}/messages`;
            const respMsgs = await chamarMLProxy(urlMsgs, token);
            const mensagens = Array.isArray(respMsgs) ? respMsgs : (Array.isArray(respMsgs?.results) ? respMsgs.results : []);

            for (const msg of mensagens) {
                // A API identifica cada mensagem por um "hash" único
                // (não tem campo "id"). Usamos ele pra não duplicar.
                const mlMessageId = String(msg?.hash || msg?.id || msg?.message_id || '');
                if (!mlMessageId) continue;

                const { data: msgExistente } = await cli
                    .from(CFG_RC.tabelaMensagens)
                    .select('id')
                    .eq('reclamacao_id', reclamacaoId)
                    .eq('ml_message_id', mlMessageId)
                    .maybeSingle();

                if (msgExistente) continue;

                const ehRespondent = String(msg?.sender_role || '').toLowerCase() === 'respondent';

                await cli.from(CFG_RC.tabelaMensagens).insert([{
                    reclamacao_id: reclamacaoId,
                    ml_message_id: mlMessageId,
                    origem: 'mercado_livre',
                    autor_role: msg?.sender_role || null,
                    autor_nome: ehRespondent ? 'Wheel Tech' : (dadosOrder?.comprador_nickname || complainant?.user_id || 'Cliente'),
                    mensagem: msg?.message || '',
                    criado_em: msg?.date_created || new Date().toISOString(),
                    sincronizada_ml: true
                }]);
            }
        } catch (erroMsgs) {
            // Não interrompe a sincronização da reclamação por falha nas mensagens
            // (ex.: reclamações do tipo "return" não têm mensagens).
            console.warn(`⚠️ [Reclamações ML] Mensagens da claim ${claimId}:`, erroMsgs);
        }
    }

    // ============================================================
    // DETALHES / CONVERSA
    // ============================================================

    let reclamacaoAberta = null;
    let mensagensCacheRC = [];
    let enviosCorreioTempRC = [];
    let _produtosEstoqueCacheRC = null;

    window.abrirDetalhesReclamacaoCliente = async function (id) {
        const overlay = document.getElementById('rcModalDetalhes');
        const corpo = document.getElementById('rcDetCorpo');
        if (!overlay || !corpo) return;

        overlay.classList.remove('hidden-rc');
        corpo.innerHTML = `<div class="text-center py-4"><span class="spinner"></span> Carregando...</div>`;

        const cli = sb();

        try {
            const { data: reclamacao, error: erroReclamacao } = await cli
                .from(CFG_RC.tabela)
                .select('*')
                .eq('id', id)
                .single();
            if (erroReclamacao) throw erroReclamacao;

            const { data: mensagens, error: erroMsgs } = await cli
                .from(CFG_RC.tabelaMensagens)
                .select('*')
                .eq('reclamacao_id', id)
                .order('criado_em', { ascending: true });
            if (erroMsgs) throw erroMsgs;

            const { data: envios, error: erroEnvios } = await cli
                .from('reclamacoes_clientes_envios_correio')
                .select('*')
                .eq('reclamacao_id', id)
                .order('criado_em', { ascending: true });
            if (erroEnvios) throw erroEnvios;

            reclamacaoAberta = reclamacao;
            mensagensCacheRC = mensagens || [];
            enviosCorreioTempRC = (envios || []).map(e => ({
                erro: e.erro,
                produto_id: e.produto_id,
                produto_sku: e.produto_sku,
                produto_nome: e.produto_nome,
                codigo_rastreio: e.codigo_rastreio,
                tipo_embalagem: e.tipo_embalagem,
                nome_cliente: e.nome_cliente,
                data_postagem: e.data_postagem,
                valor_frete: e.valor_frete
            }));

            renderizarDetalhesRC();

        } catch (error) {
            console.error('❌ [Reclamações Clientes] Erro ao abrir detalhes:', error);
            corpo.innerHTML = `<div class="text-danger py-4">Erro ao carregar: ${esc(error.message)}</div>`;
        }
    };

    function renderizarDetalhesRC() {
        const r = reclamacaoAberta;
        if (!r) return;

        document.getElementById('rcDetTitulo').innerHTML = r.numero_venda ? linkVendaRC(r.numero_venda) : `#${r.id}`;
        document.getElementById('rcDetSubtitulo').textContent =
            `${r.comprador_nome || r.comprador_nickname || 'Cliente não identificado'} · ${r.motivo || 'Motivo não informado'}`;

        const corpo = document.getElementById('rcDetCorpo');
        const st = cfgStatusRC(r.status);

        const opcoesStatus = Object.keys(STATUS_RC)
            .map(k => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${STATUS_RC[k].icone} ${STATUS_RC[k].texto}</option>`)
            .join('');

        corpo.innerHTML = `
            <div class="d-flex flex-wrap gap-3 mb-3" style="font-size:13px;">
                <div><strong>Status atual:</strong> <span class="rc-badge ${st.classe}">${st.icone} ${esc(st.texto)}</span></div>
                <div><strong>Valor:</strong> ${r.valor != null ? 'R$ ' + Number(r.valor).toFixed(2) : '—'}</div>
                <div><strong>Aberta em:</strong> ${fmtData(r.ml_criado_em || r.criado_em)}</div>
            </div>

            <div class="d-flex gap-2 align-items-center mb-3">
                <label style="font-size:13px;font-weight:600;margin:0;">Alterar status:</label>
                <select id="rcSelectStatus" class="form-control form-control-sm" style="width:auto;">
                    ${opcoesStatus}
                </select>
                <input type="text" id="rcResponsavel" class="form-control form-control-sm" style="width:180px;"
                       placeholder="Responsável" value="${esc(r.responsavel || '')}">
                <button class="btn btn-sm btn-primary" onclick="window.salvarStatusReclamacaoCliente(${r.id})">
                    <i class="fas fa-save"></i> Salvar
                </button>
            </div>

            <div class="rc-acomp" id="rcCamposAcompanhamento">
                <div class="rc-acomp-header">
                    <h5><i class="fas fa-clipboard-list"></i> Acompanhamento</h5>
                    <span class="rc-acomp-flag ${r.afeta_reputacao ? 'on' : 'off'}" id="rcAcompFlag">${r.afeta_reputacao ? '⭐ Afeta reputação' : 'Sem impacto na reputação'}</span>
                </div>

                <div class="rc-field">
                    <label><i class="fas fa-star-half-alt"></i> Essa reclamação afeta nossa reputação?</label>
                    <div class="rc-pills">
                        <label class="rc-pill rc-pill-danger"><input type="radio" name="rcAfetaReputacao" value="sim" ${r.afeta_reputacao ? 'checked' : ''} onchange="window.atualizarSinalizadorRC()"><span><i class="fas fa-exclamation-circle"></i> Sim</span></label>
                        <label class="rc-pill"><input type="radio" name="rcAfetaReputacao" value="nao" ${!r.afeta_reputacao ? 'checked' : ''} onchange="window.atualizarSinalizadorRC()"><span><i class="fas fa-check"></i> Não</span></label>
                    </div>
                </div>

                <div class="rc-field">
                    <label><i class="fas fa-balance-scale"></i> O erro é nosso ou não?</label>
                    <div class="rc-pills">
                        <label class="rc-pill rc-pill-danger"><input type="radio" name="rcErroNosso" value="nosso" ${r.erro_nosso === true ? 'checked' : ''} onchange="window.toggleRcErroFields()"><span><i class="fas fa-home"></i> Erro nosso (interno)</span></label>
                        <label class="rc-pill"><input type="radio" name="rcErroNosso" value="externo" ${r.erro_nosso === false ? 'checked' : ''} onchange="window.toggleRcErroFields()"><span><i class="fas fa-external-link-square-alt"></i> Erro externo</span></label>
                        <label class="rc-pill"><input type="radio" name="rcErroNosso" value="" ${r.erro_nosso == null ? 'checked' : ''} onchange="window.toggleRcErroFields()"><span><i class="fas fa-question"></i> Ainda não sei</span></label>
                    </div>

                    <div id="rcCamposErroExterno" class="rc-subcard ${r.erro_nosso === false ? '' : 'hidden'}">
                        <div class="rc-subcard-titulo"><i class="fas fa-external-link-square-alt"></i> Erro externo</div>
                        <div class="rc-field">
                            <label>Foi resolvido?</label>
                            <div class="rc-pills">
                                <label class="rc-pill rc-pill-success"><input type="radio" name="rcResolvidoExterno" value="sim" ${r.resolvido_externo ? 'checked' : ''}><span><i class="fas fa-check"></i> Sim</span></label>
                                <label class="rc-pill"><input type="radio" name="rcResolvidoExterno" value="nao" ${r.resolvido_externo === false ? 'checked' : ''}><span><i class="fas fa-times"></i> Não</span></label>
                            </div>
                        </div>
                        <div class="rc-field" style="margin-bottom:0;">
                            <label>Qual a solução?</label>
                            <textarea id="rcSolucaoExterna" class="form-control" rows="2" placeholder="Descreva a solução...">${esc(r.solucao_externa || '')}</textarea>
                        </div>
                    </div>

                    <div id="rcCamposErroInterno" class="rc-subcard ${r.erro_nosso === true ? '' : 'hidden'}">
                        <div class="rc-subcard-titulo"><i class="fas fa-home"></i> Erro interno</div>
                        <div class="rc-field">
                            <label>Demos solução?</label>
                            <div class="rc-pills">
                                <label class="rc-pill rc-pill-success"><input type="radio" name="rcDemosSolucao" value="sim" ${r.demos_solucao ? 'checked' : ''}><span><i class="fas fa-check"></i> Sim</span></label>
                                <label class="rc-pill"><input type="radio" name="rcDemosSolucao" value="nao" ${r.demos_solucao === false ? 'checked' : ''}><span><i class="fas fa-times"></i> Não</span></label>
                            </div>
                        </div>
                        <div class="rc-field" style="margin-bottom:0;">
                            <label>Qual?</label>
                            <textarea id="rcSolucaoInterna" class="form-control" rows="2" placeholder="Descreva a solução...">${esc(r.solucao_interna || '')}</textarea>
                        </div>
                    </div>
                </div>

                <div class="rc-field">
                    <label><i class="fas fa-coins"></i> Custo gerado</label>
                    <div class="rc-money">
                        <input type="number" id="rcCusto" class="form-control" step="0.01" min="0" value="${r.custo ?? ''}" placeholder="0,00">
                    </div>
                    <small>Ex: postagem/correio, produto perdido, etc. — pode preencher independente do tipo de erro.</small>
                </div>

                <div class="rc-field" style="margin-bottom:0;">
                    <label><i class="fas fa-box"></i> Teve envio pelo correio por causa dessa reclamação?</label>
                    <div class="rc-pills">
                        <label class="rc-pill"><input type="radio" name="rcTeveEnvio" value="sim" ${enviosCorreioTempRC.length ? 'checked' : ''} onchange="window.toggleRcEnviosSection()"><span><i class="fas fa-check"></i> Sim</span></label>
                        <label class="rc-pill"><input type="radio" name="rcTeveEnvio" value="nao" ${enviosCorreioTempRC.length ? '' : 'checked'} onchange="window.toggleRcEnviosSection()"><span><i class="fas fa-times"></i> Não</span></label>
                    </div>

                    <div id="rcSecaoEnvios" class="rc-subcard ${enviosCorreioTempRC.length ? '' : 'hidden'}">
                        <div class="rc-subcard-titulo"><i class="fas fa-truck"></i> Envios de correio</div>
                        <div id="rcListaEnvios"></div>
                        <div class="rc-envios-form">
                            <div class="rc-envios-grid">
                                <div class="full">
                                    <label>Qual erro?</label>
                                    <input type="text" id="rcEnvioErro" class="form-control form-control-sm" placeholder="Ex: enviamos a peça errada">
                                </div>
                                <div class="full">
                                    <label>Produto (do estoque)</label>
                                    <select id="rcEnvioProduto" class="form-control form-control-sm">
                                        <option value="">Selecione um produto</option>
                                    </select>
                                </div>
                                <div>
                                    <label>Código de rastreio</label>
                                    <input type="text" id="rcEnvioRastreio" class="form-control form-control-sm" placeholder="AA123456789BR">
                                </div>
                                <div>
                                    <label>Tipo de embalagem</label>
                                    <input type="text" id="rcEnvioEmbalagem" class="form-control form-control-sm" placeholder="Ex: caixa pequena">
                                </div>
                                <div>
                                    <label>Nome do cliente</label>
                                    <input type="text" id="rcEnvioCliente" class="form-control form-control-sm" placeholder="Nome completo">
                                </div>
                                <div>
                                    <label>Data de postagem</label>
                                    <input type="date" id="rcEnvioData" class="form-control form-control-sm">
                                </div>
                                <div class="full">
                                    <label>Valor do frete <span style="font-weight:400;color:#94a3b8;">(opcional — geralmente só se sabe no mês seguinte)</span></label>
                                    <input type="number" id="rcEnvioFrete" class="form-control form-control-sm" step="0.01" min="0" placeholder="Preencher depois se ainda não souber">
                                </div>
                            </div>
                            <div class="d-flex justify-content-end mt-2">
                                <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.adicionarEnvioRC()">
                                    <i class="fas fa-plus"></i> Adicionar envio
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="d-flex justify-content-end mt-3">
                    <button class="btn btn-sm btn-primary" onclick="window.salvarAcompanhamentoRC(${r.id})">
                        <i class="fas fa-save"></i> Salvar acompanhamento
                    </button>
                </div>
            </div>

            <h4 style="font-size:14px;margin-bottom:6px;"><i class="fas fa-comments"></i> Conversa</h4>
            <div class="rc-thread" id="rcThread">
                ${mensagensCacheRC.length === 0
                    ? (
                        String(r.tipo || '').toLowerCase() === 'return'
                            ? '<div class="text-muted text-center py-3">Esta é uma devolução direta (tipo "return") — o Mercado Livre não gera conversa nesse fluxo, só o pedido de devolução.</div>'
                            : '<div class="text-muted text-center py-3">Nenhuma mensagem sincronizada ainda.</div>'
                    )
                    : mensagensCacheRC.map(m => `
                        <div class="rc-msg ${m.origem === 'wheel_tech' ? 'equipe' : ''}">
                            <div class="rc-msg-meta">
                                <span>${m.origem === 'wheel_tech' ? '🛠️' : '👤'} <strong>${esc(m.autor_nome || (m.origem === 'wheel_tech' ? 'Wheel Tech' : 'Cliente'))}</strong></span>
                                <span>${fmtData(m.criado_em)}</span>
                            </div>
                            <div>${nl(m.mensagem)}</div>
                        </div>
                    `).join('')
                }
            </div>

            <div class="form-group">
                <textarea id="rcResposta" class="form-control" rows="3" placeholder="Escreva uma resposta..."></textarea>
            </div>
            <div class="d-flex justify-content-end">
                <button class="btn btn-success" onclick="window.enviarRespostaReclamacaoCliente(${r.id})">
                    <i class="fas fa-paper-plane"></i> Enviar resposta
                </button>
            </div>
            <div style="font-size:11px;color:#adb5bd;margin-top:6px;">
                A resposta fica registrada aqui no sistema. Envio automático de volta para o comprador no
                Mercado Livre ainda não está ativo — responda também por lá quando for o caso.
            </div>
        `;

        renderizarListaEnviosRC();
        if (enviosCorreioTempRC.length) popularSelectProdutoRC();
    }

    window.fecharDetalhesReclamacaoCliente = function () {
        document.getElementById('rcModalDetalhes')?.classList.add('hidden-rc');
        reclamacaoAberta = null;
        mensagensCacheRC = [];
        enviosCorreioTempRC = [];
    };

    window.salvarStatusReclamacaoCliente = async function (id) {
        const cli = sb();
        const status = document.getElementById('rcSelectStatus')?.value;
        const responsavel = document.getElementById('rcResponsavel')?.value?.trim() || null;

        try {
            const { error } = await cli
                .from(CFG_RC.tabela)
                .update({ status, responsavel, atualizado_em: new Date().toISOString() })
                .eq('id', id);
            if (error) throw error;

            showToast?.('✅ Status atualizado', 'success');
            await window.carregarReclamacoesClientes();
            await window.abrirDetalhesReclamacaoCliente(id);

        } catch (error) {
            console.error('❌ [Reclamações Clientes] Erro ao salvar status:', error);
            showToast?.('❌ Erro ao salvar: ' + error.message, 'error');
        }
    };

    // ============================================================
    // ACOMPANHAMENTO (reputação, erro nosso/externo, custo, envios)
    // ============================================================

    window.atualizarSinalizadorRC = function () {
        const afeta = document.querySelector('input[name="rcAfetaReputacao"]:checked')?.value === 'sim';
        const flag = document.getElementById('rcAcompFlag');
        if (flag) {
            flag.classList.toggle('on', afeta);
            flag.classList.toggle('off', !afeta);
            flag.textContent = afeta ? '⭐ Afeta reputação' : 'Sem impacto na reputação';
        }
    };

    window.toggleRcErroFields = function () {
        const valor = document.querySelector('input[name="rcErroNosso"]:checked')?.value;
        document.getElementById('rcCamposErroExterno')?.classList.toggle('hidden', valor !== 'externo');
        document.getElementById('rcCamposErroInterno')?.classList.toggle('hidden', valor !== 'nosso');
    };

    window.toggleRcEnviosSection = function () {
        const tem = document.querySelector('input[name="rcTeveEnvio"]:checked')?.value === 'sim';
        document.getElementById('rcSecaoEnvios')?.classList.toggle('hidden', !tem);
        if (tem) popularSelectProdutoRC();
    };

    async function popularSelectProdutoRC() {
        const select = document.getElementById('rcEnvioProduto');
        if (!select || select.options.length > 1) return;

        let produtos = (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque) && produtosEstoque.length)
            ? produtosEstoque
            : _produtosEstoqueCacheRC;

        if (!produtos) {
            select.innerHTML = '<option value="">Carregando produtos...</option>';
            const cli = sb();
            const todos = [];
            let inicio = 0;
            let continuar = true;
            while (continuar) {
                const { data, error } = await cli
                    .from('produtos_estoque')
                    .select('id, sku, nome')
                    .order('nome', { ascending: true })
                    .range(inicio, inicio + 999);
                if (error) break;
                todos.push(...(data || []));
                if (!data || data.length < 1000) continuar = false;
                else inicio += 1000;
            }
            produtos = todos;
            _produtosEstoqueCacheRC = todos;
        }

        select.innerHTML = '<option value="">Selecione um produto</option>' +
            produtos.map(p => `<option value="${p.id}" data-sku="${esc(p.sku || '')}" data-nome="${esc(p.nome || '')}">${esc(p.nome || '')} (${esc(p.sku || '')})</option>`).join('');
    }

    function renderizarListaEnviosRC() {
        const container = document.getElementById('rcListaEnvios');
        if (!container) return;
        if (!enviosCorreioTempRC.length) {
            container.innerHTML = '<small style="color:#94a3b8;">Nenhum envio adicionado ainda.</small>';
            return;
        }
        container.innerHTML = enviosCorreioTempRC.map((e, idx) => `
            <div class="rc-envio-item">
                <div class="rc-envio-info">
                    <strong>${esc(e.produto_nome || '')}</strong> ${e.produto_sku ? '<span style="color:#94a3b8;">(' + esc(e.produto_sku) + ')</span>' : ''}
                    <div class="rc-envio-meta">
                        ${e.erro ? `<div><i class="fas fa-exclamation-triangle"></i> ${esc(e.erro)}</div>` : ''}
                        <div><i class="fas fa-barcode"></i> ${esc(e.codigo_rastreio || '-')}${e.tipo_embalagem ? ' · ' + esc(e.tipo_embalagem) : ''}</div>
                        <div><i class="fas fa-user"></i> ${esc(e.nome_cliente || '-')} · <i class="fas fa-calendar"></i> ${e.data_postagem ? new Date(e.data_postagem + 'T00:00').toLocaleDateString('pt-BR') : '-'} · ${e.valor_frete ? 'R$ ' + Number(e.valor_frete).toFixed(2) : 'frete a preencher depois'}</div>
                    </div>
                </div>
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="window.removerEnvioRC(${idx})"><i class="fas fa-trash"></i></button>
            </div>
        `).join('');
    }

    window.adicionarEnvioRC = function () {
        const erro = document.getElementById('rcEnvioErro')?.value.trim() || '';
        const selectProduto = document.getElementById('rcEnvioProduto');
        const produtoId = selectProduto?.value;
        const opcaoSelecionada = selectProduto?.options[selectProduto.selectedIndex];
        const rastreio = document.getElementById('rcEnvioRastreio')?.value.trim() || '';
        const embalagem = document.getElementById('rcEnvioEmbalagem')?.value.trim() || '';
        const cliente = document.getElementById('rcEnvioCliente')?.value.trim() || '';
        const dataPostagem = document.getElementById('rcEnvioData')?.value || '';
        const valorFrete = document.getElementById('rcEnvioFrete')?.value || '';

        if (!produtoId || !rastreio || !cliente || !dataPostagem) {
            showToast?.('Preencha produto, código de rastreio, cliente e data de postagem.', 'warning');
            return;
        }

        enviosCorreioTempRC.push({
            erro: erro || null,
            produto_id: produtoId,
            produto_sku: opcaoSelecionada?.dataset.sku || '',
            produto_nome: opcaoSelecionada?.dataset.nome || '',
            codigo_rastreio: rastreio,
            tipo_embalagem: embalagem || null,
            nome_cliente: cliente,
            data_postagem: dataPostagem,
            valor_frete: valorFrete ? parseFloat(valorFrete) : null
        });

        document.getElementById('rcEnvioErro').value = '';
        if (selectProduto) selectProduto.value = '';
        document.getElementById('rcEnvioRastreio').value = '';
        document.getElementById('rcEnvioEmbalagem').value = '';
        document.getElementById('rcEnvioCliente').value = '';
        document.getElementById('rcEnvioData').value = '';
        document.getElementById('rcEnvioFrete').value = '';

        renderizarListaEnviosRC();
    };

    window.removerEnvioRC = function (idx) {
        enviosCorreioTempRC.splice(idx, 1);
        renderizarListaEnviosRC();
    };

    window.salvarAcompanhamentoRC = async function (id) {
        const cli = sb();

        const afetaReputacao = document.querySelector('input[name="rcAfetaReputacao"]:checked')?.value === 'sim';
        const erroNossoValor = document.querySelector('input[name="rcErroNosso"]:checked')?.value;
        const erroNosso = erroNossoValor === 'nosso' ? true : (erroNossoValor === 'externo' ? false : null);
        const resolvidoExterno = document.querySelector('input[name="rcResolvidoExterno"]:checked')?.value === 'sim';
        const solucaoExterna = document.getElementById('rcSolucaoExterna')?.value?.trim() || null;
        const demosSolucao = document.querySelector('input[name="rcDemosSolucao"]:checked')?.value === 'sim';
        const solucaoInterna = document.getElementById('rcSolucaoInterna')?.value?.trim() || null;
        const custoTexto = document.getElementById('rcCusto')?.value;
        const custo = custoTexto ? parseFloat(custoTexto) : null;

        const jaResolvida = reclamacaoAberta?.data_resolucao;
        const ficouResolvida = (erroNosso === false && resolvidoExterno) || (erroNosso === true && demosSolucao);

        try {
            const { error } = await cli
                .from(CFG_RC.tabela)
                .update({
                    afeta_reputacao: afetaReputacao,
                    erro_nosso: erroNosso,
                    resolvido_externo: erroNosso === false ? resolvidoExterno : null,
                    solucao_externa: erroNosso === false ? solucaoExterna : null,
                    demos_solucao: erroNosso === true ? demosSolucao : null,
                    solucao_interna: erroNosso === true ? solucaoInterna : null,
                    custo: custo,
                    data_resolucao: ficouResolvida ? (jaResolvida || new Date().toISOString()) : null,
                    atualizado_em: new Date().toISOString()
                })
                .eq('id', id);
            if (error) throw error;

            const { error: erroDelete } = await cli
                .from('reclamacoes_clientes_envios_correio')
                .delete()
                .eq('reclamacao_id', id);
            if (erroDelete) throw erroDelete;

            if (enviosCorreioTempRC.length) {
                const u = usuarioAtual();
                const { error: erroInsert } = await cli
                    .from('reclamacoes_clientes_envios_correio')
                    .insert(enviosCorreioTempRC.map(e => ({
                        reclamacao_id: id,
                        erro: e.erro,
                        produto_id: e.produto_id,
                        produto_sku: e.produto_sku,
                        produto_nome: e.produto_nome,
                        codigo_rastreio: e.codigo_rastreio,
                        tipo_embalagem: e.tipo_embalagem,
                        nome_cliente: e.nome_cliente,
                        data_postagem: e.data_postagem,
                        valor_frete: e.valor_frete,
                        criado_por: u?.name || u?.username || null
                    })));
                if (erroInsert) throw erroInsert;
            }

            dadosEnviosCorreioRC = null; // invalida o cache do relatório de envios de correio

            showToast?.('✅ Acompanhamento salvo', 'success');
            await window.carregarReclamacoesClientes();
            await window.abrirDetalhesReclamacaoCliente(id);

        } catch (error) {
            console.error('❌ [Reclamações Clientes] Erro ao salvar acompanhamento:', error);
            showToast?.('❌ Erro ao salvar: ' + error.message, 'error');
        }
    };

    window.enviarRespostaReclamacaoCliente = async function (id) {
        const cli = sb();
        const textarea = document.getElementById('rcResposta');
        const texto = textarea?.value?.trim();

        if (!texto) {
            showToast?.('⚠️ Escreva uma mensagem antes de enviar', 'warning');
            return;
        }

        const u = usuarioAtual();

        try {
            const { error } = await cli.from(CFG_RC.tabelaMensagens).insert([{
                reclamacao_id: id,
                origem: 'wheel_tech',
                autor_nome: u?.name || u?.username || 'Equipe',
                mensagem: texto,
                criado_em: new Date().toISOString(),
                sincronizada_ml: false
            }]);
            if (error) throw error;

            // Se a reclamação ainda estava "aberta", passa para "em andamento"
            // automaticamente ao primeiro contato da equipe (mesmo padrão do
            // módulo de Chamados).
            if (reclamacaoAberta?.status === 'aberta') {
                await cli.from(CFG_RC.tabela)
                    .update({ status: 'em_andamento', atualizado_em: new Date().toISOString() })
                    .eq('id', id);
            }

            if (textarea) textarea.value = '';

            await window.abrirDetalhesReclamacaoCliente(id);
            await window.carregarReclamacoesClientes();

        } catch (error) {
            console.error('❌ [Reclamações Clientes] Erro ao enviar resposta:', error);
            showToast?.('❌ Erro ao enviar: ' + error.message, 'error');
        }
    };

})();
