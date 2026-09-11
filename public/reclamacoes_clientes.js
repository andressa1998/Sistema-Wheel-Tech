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
                        <div class="user-info">
                            <div class="user-avatar" id="rcUserAvatar">U</div>
                            <div>
                                <div id="rcUserName">Usuário</div>
                                <div id="rcUserRole"></div>
                                <div class="d-flex gap-2 mt-2">
                                    <button onclick="voltarParaMenu()" class="btn btn-primary btn-sm">← Voltar ao Menu</button>
                                    <button onclick="handleLogout()" class="btn btn-secondary btn-sm">Sair</button>
                                </div>
                            </div>
                        </div>
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
                    <td><code>${esc(r.numero_venda || '—')}</code></td>
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

    // ============================================================
    // ESTRATÉGIA: BUSCAR POR VENDA (order_id), NÃO POR CONTA
    //
    // O filtro em lote da API (players.user_id + players.role) é
    // rejeitado por esta conta/app com "atLeastOneFilterProvided",
    // mesmo formatado exatamente como a documentação do ML manda —
    // testado com ponto, ponto escapado e colchetes, todos com o
    // mesmo erro, enquanto um filtro simples (site_id) funciona
    // normalmente. Reconectar o Mercado Livre resolveria (token
    // novo já com o escopo de Post Purchase), mas isso derrubaria
    // outras abas conectadas — então em vez disso, verificamos
    // reclamação por VENDA, usando o filtro "order_id" (sem ponto,
    // já confirmado que funciona), percorrendo as vendas que o
    // sistema já tem sincronizadas em vendas_nfe_cache.
    // ============================================================

    async function buscarOrderIdsRecentesRC(diasAtras = 90, maximo = 300) {
        const cli = sb();
        if (!cli) return [];

        const desde = new Date();
        desde.setDate(desde.getDate() - diasAtras);

        const { data, error } = await cli
            .from('vendas_nfe_cache')
            .select('id_venda_ml, data_venda')
            .gte('data_venda', desde.toISOString())
            .order('data_venda', { ascending: false })
            .limit(maximo);

        if (error) {
            console.warn('⚠️ [Reclamações ML] Erro buscando vendas para checar:', error);
            return [];
        }

        return (data || [])
            .map(r => r.id_venda_ml)
            .filter(Boolean);
    }

    async function buscarClaimsPorOrderRC(orderId, token) {
        const url = `https://api.mercadolibre.com/post-purchase/v1/claims/search?order_id=${encodeURIComponent(orderId)}&limit=10`;

        try {
            const resposta = await chamarMLProxy(url, token);
            return Array.isArray(resposta?.data) ? resposta.data : [];
        } catch (erro) {
            console.warn(`⚠️ [Reclamações ML] Falha verificando venda ${orderId}:`, erro.message);
            return [];
        }
    }

    // Verifica as vendas recentes em pequenos lotes (concorrência
    // limitada), reportando progresso no botão.
    async function buscarTodasClaimsRC(sellerId, token, aoProgredir) {
        const orderIds = await buscarOrderIdsRecentesRC();

        if (orderIds.length === 0) {
            return [];
        }

        const CONCORRENCIA = 4;
        const todas = [];
        let verificadas = 0;

        for (let i = 0; i < orderIds.length; i += CONCORRENCIA) {
            const lote = orderIds.slice(i, i + CONCORRENCIA);

            const resultadosLote = await Promise.all(
                lote.map(orderId => buscarClaimsPorOrderRC(orderId, token))
            );

            for (const claims of resultadosLote) {
                todas.push(...claims);
            }

            verificadas += lote.length;
            aoProgredir?.(verificadas, orderIds.length);
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

            const claims = await buscarTodasClaimsRC(sellerId, token, (feitas, totalVendas) => {
                if (btn) {
                    btn.innerHTML = `<i class="fas fa-sync-alt rc-sync-spin"></i> Verificando venda ${feitas}/${totalVendas}...`;
                }
            });

            if (claims.length === 0) {
                showToast?.('ℹ️ Nenhuma reclamação encontrada nas vendas recentes.', 'info');
                await window.carregarReclamacoesClientes();
                return;
            }

            let sincronizadas = 0;
            let comErro = 0;

            for (const claim of claims) {
                try {
                    await sincronizarUmaClaimRC(claim, token);
                    sincronizadas++;
                } catch (erroClaim) {
                    comErro++;
                    console.error(`❌ [Reclamações ML] Falha na claim ${claim?.id}:`, erroClaim);
                }
            }

            await window.carregarReclamacoesClientes();

            showToast?.(
                comErro > 0
                    ? `⚠️ ${sincronizadas} reclamação(ões) sincronizada(s), ${comErro} com erro (veja o console).`
                    : `✅ ${sincronizadas} reclamação(ões) sincronizada(s) com sucesso.`,
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
        // recurso da reclamação é realmente um pedido.
        const dadosOrder = claim?.resource === 'order' && resourceId
            ? await obterDadosOrderRC(resourceId, token)
            : null;

        const motivo = await obterMotivoLegivelRC(claim?.reason_id, token);

        const dados = {
            ml_claim_id: claimId,
            numero_venda: resourceId ? String(resourceId) : null,
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

        document.getElementById('rcDetTitulo').textContent = r.numero_venda || `#${r.id}`;
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
