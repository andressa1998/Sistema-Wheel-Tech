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
                            <button class="btn btn-outline-primary" onclick="window.abrirRelatorioMotivosRC()">
                                <i class="fas fa-chart-bar"></i> Relatório de Motivos
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

    function criarModalRelatorioMotivosRC() {
        if (document.getElementById('rcModalRelatorio')) return;

        const overlay = document.createElement('div');
        overlay.id = 'rcModalRelatorio';
        overlay.className = 'rc-overlay hidden-rc';
        overlay.innerHTML = `
            <div class="rc-modal rc-modal-relatorio">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:4px;">
                    <div>
                        <h3 style="margin:0;"><i class="fas fa-chart-bar"></i> Relatório de motivos</h3>
                        <div style="font-size:12px;color:#6c757d;margin-top:4px;">Reclamações de clientes agrupadas pelo motivo — do mais usado ao menos usado.</div>
                    </div>
                    <div class="d-flex gap-2 align-items-center">
                        <button class="btn btn-sm btn-outline-success" onclick="window.exportarRelatorioMotivosRCExcel()">
                            <i class="fas fa-file-excel"></i> Exportar
                        </button>
                        <button onclick="window.fecharRelatorioMotivosRC()" style="background:none;border:none;font-size:22px;cursor:pointer;">&times;</button>
                    </div>
                </div>
                <div id="rcRelCorpo">
                    <div class="text-center py-4"><span class="spinner"></span> Carregando...</div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', e => {
            if (e.target === overlay) window.fecharRelatorioMotivosRC();
        });
    }

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

    window.abrirRelatorioMotivosRC = function () {
        criarModalRelatorioMotivosRC();
        const overlay = document.getElementById('rcModalRelatorio');
        overlay.classList.remove('hidden-rc');
        renderizarRelatorioMotivosRC();
    };

    window.fecharRelatorioMotivosRC = function () {
        document.getElementById('rcModalRelatorio')?.classList.add('hidden-rc');
    };

    function renderizarRelatorioMotivosRC() {
        const corpo = document.getElementById('rcRelCorpo');
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
                    <td><span class="rc-badge ${st.classe}">${st.icone} ${esc(st.texto)}</span></td>
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

            reclamacaoAberta = reclamacao;
            mensagensCacheRC = mensagens || [];

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
    }

    window.fecharDetalhesReclamacaoCliente = function () {
        document.getElementById('rcModalDetalhes')?.classList.add('hidden-rc');
        reclamacaoAberta = null;
        mensagensCacheRC = [];
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
