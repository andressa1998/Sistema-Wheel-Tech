// ============================================================
// MÓDULO: GERENCIAMENTO DE PROMOÇÕES (Mercado Livre)
// ============================================================
// Dependências: ml_token_manager.js, supabase, currentUser
// ============================================================

(function() {
    'use strict';

    // ------------------------------------------------------------
    // VARIÁVEIS GLOBAIS DO MÓDULO PRINCIPAL
    // ------------------------------------------------------------
    let promocoes = [];
    let itensPromocao = [];
    let currentPromotionId = null;
    let currentPromotionType = null;
    let searchAfter = null;
    let isLoadingItens = false;
    let hasMoreItens = true;
    let containerPromocoes = null;

    // ------------------------------------------------------------
    // VARIÁVEIS DO MÓDULO BULK
    // ------------------------------------------------------------
    let todasPromocoes = [];
    let itensPromocaoOrigem = [];
    let itensFiltrados = [];
    let mlbsBloqueados = [];
    let bulkSystemContainer = null;
    let supabaseClient = null;

    // ------------------------------------------------------------
    // FUNÇÃO PARA OBTER CLIENTE SUPABASE
    // ------------------------------------------------------------
    function getSupabaseClient() {
        if (supabaseClient) return supabaseClient;
        
        // Tenta obter de várias fontes
        if (window.supabase) {
            supabaseClient = window.supabase;
            return supabaseClient;
        }
        
        if (window._supabase) {
            supabaseClient = window._supabase;
            return supabaseClient;
        }
        
        // Se não houver Supabase, usamos apenas localStorage
        console.warn('⚠️ Supabase não disponível, usando apenas localStorage');
        return null;
    }

    // ------------------------------------------------------------
    // FUNÇÃO PRINCIPAL: ABRIR SISTEMA DE PROMOÇÕES
    // ------------------------------------------------------------
    window.abrirSistemaPromocoes = function() {
        if (!window.currentUser) {
            showToast('⚠️ Faça login primeiro', 'warning');
            return;
        }

        const sistemasIds = [
            'menuSystem', 'mainSystem', 'salesSystem', 'reembolsosSystem',
            'caixaSystem', 'precificacaoSystem', 'reviewsSystem',
            'folgasSystem', 'shippingSystem', 'estoqueSystem',
            'estoqueGestaoSystem', 'nfeSystem', 'perguntasSystem',
            'entradasSystem', 'feedbackSystem', 'bulkPromotionSystem'
        ];
        sistemasIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        if (!containerPromocoes) {
            containerPromocoes = criarInterfacePromocoes();
            document.body.appendChild(containerPromocoes);
        } else {
            containerPromocoes.classList.remove('hidden');
        }

        const userNameEl = document.getElementById('promocoesUserName');
        const userAvatarEl = document.getElementById('promocoesUserAvatar');
        const userRoleEl = document.getElementById('promocoesUserRole');
        if (userNameEl) userNameEl.textContent = window.currentUser.name;
        if (userAvatarEl) userAvatarEl.textContent = window.currentUser.avatar;
        if (userRoleEl) userRoleEl.textContent = window.currentUser.role;

        carregarPromocoes();
        showToast('📢 Sistema de Promoções carregado', 'info');
    };

    // ------------------------------------------------------------
    // CRIAÇÃO DA INTERFACE PRINCIPAL
    // ------------------------------------------------------------
    function criarInterfacePromocoes() {
        const div = document.createElement('div');
        div.id = 'promocoesSystem';
        div.className = 'container';
        div.style.display = 'block';

        div.innerHTML = `
            <header class="main-header">
                <div class="container">
                    <div class="header-content">
                        <h1 style="display: flex; align-items: center; gap: 10px;">
                            <img src="logo.png" alt="Wheel Tech" style="height: 35px; width: auto;">
                            <span>Gerenciamento de Promoções ML</span>
                        </h1>
                        <div class="user-info">
                            <div class="user-avatar" id="promocoesUserAvatar">U</div>
                            <div>
                                <div style="font-weight: 600;" id="promocoesUserName">Usuário</div>
                                <div style="font-size: 12px; color: #6c757d;" id="promocoesUserRole"></div>
                                <div class="d-flex gap-2 mt-2">
                                    <button onclick="voltarParaMenu()" class="btn btn-primary btn-sm">← Voltar ao Menu</button>
                                    <button onclick="handleLogout()" class="btn btn-secondary btn-sm">Sair</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div class="card mb-4">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <h3 style="margin:0;"><i class="fas fa-tags"></i> Promoções do Vendedor</h3>
                    <div class="d-flex gap-2 flex-wrap">
                        <button class="btn btn-primary" onclick="carregarPromocoes()">
                            <i class="fas fa-sync-alt"></i> Atualizar
                        </button>
                        <button class="btn btn-info" onclick="abrirGestaoPromocoesLote()">
                            <i class="fas fa-layer-group"></i> Promoções em Lote
                        </button>
                        <button class="btn btn-success" onclick="abrirModalBuscarItem()">
                            <i class="fas fa-search"></i> Ver promoções de um item
                        </button>
                    </div>
                </div>
            </div>

            <div id="listaPromocoes" class="row">
                <div class="col-12 text-center py-4 text-muted">
                    <i class="fas fa-spinner fa-spin fa-2x"></i><br>
                    Carregando promoções...
                </div>
            </div>

            <div id="detalhesPromocao" class="card mt-4 hidden">
                <div class="card-header">
                    <h2 class="card-title" id="tituloDetalhesPromocao">
                        <i class="fas fa-list"></i> Itens da Promoção
                    </h2>
                    <div>
                        <button class="btn btn-secondary btn-sm" onclick="fecharDetalhesPromocao()">
                            <i class="fas fa-times"></i> Fechar
                        </button>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-striped" id="tabelaItensPromocao">
                        <thead>
                            <tr>
                                <th>Item ID</th>
                                <th>Status</th>
                                <th>Preço Promocional</th>
                                <th>Preço Original</th>
                                <th>Desconto MELI (%)</th>
                                <th>Desconto Vendedor (%)</th>
                                <th>Boost</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="bodyItensPromocao">
                            <tr><td colspan="8" class="text-center">Carregando itens...</td></tr>
                        </tbody>
                    </table>
                </div>
                <div class="d-flex justify-content-between align-items-center p-2">
                    <span id="infoPaginacaoItens"></span>
                    <div>
                        <button class="btn btn-sm btn-outline-primary" id="btnCarregarMaisItens" onclick="carregarMaisItens()" disabled>
                            Carregar mais
                        </button>
                    </div>
                </div>
            </div>
        `;

        return div;
    }

    // ------------------------------------------------------------
    // FUNÇÕES DO MÓDULO PRINCIPAL
    // ------------------------------------------------------------
    
    window.carregarPromocoes = async function() {
        const lista = document.getElementById('listaPromocoes');
        if (!lista) return;

        lista.innerHTML = `
            <div class="col-12 text-center py-4 text-muted">
                <i class="fas fa-spinner fa-spin fa-2x"></i><br>
                Carregando promoções...
            </div>
        `;

        try {
            const tokenData = await window.getValidToken?.();
            if (!tokenData || !tokenData.access_token) {
                throw new Error('Não foi possível obter token do Mercado Livre');
            }
            const token = tokenData.access_token;

            const userId = '415176739';
            const url = `https://api.mercadolibre.com/seller-promotions/users/${userId}?app_version=v2`;
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;

            const response = await fetch(proxyUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            promocoes = data.results || [];
            todasPromocoes = promocoes;
            
            renderizarPromocoes(promocoes);

            if (promocoes.length === 0) {
                showToast('Nenhuma promoção ativa encontrada', 'info');
            } else {
                showToast(`✅ ${promocoes.length} promoções carregadas`, 'success');
            }

        } catch (error) {
            console.error('❌ Erro ao carregar promoções:', error);
            lista.innerHTML = `
                <div class="col-12 text-center py-4 text-danger">
                    <i class="fas fa-exclamation-triangle fa-2x"></i><br>
                    Erro ao carregar promoções: ${error.message}
                </div>
            `;
            showToast('Erro ao carregar promoções', 'error');
        }
    };

    function renderizarPromocoes(promocoes) {
        const lista = document.getElementById('listaPromocoes');
        if (!lista) return;

        if (!promocoes || promocoes.length === 0) {
            lista.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="fas fa-tags fa-3x text-muted" style="opacity:0.3;"></i>
                    <h4 class="text-muted">Nenhuma promoção ativa</h4>
                    <p class="text-muted">Não há promoções em andamento para este vendedor.</p>
                </div>
            `;
            return;
        }

        lista.innerHTML = '';
        promocoes.forEach(promo => {
            const col = document.createElement('div');
            col.className = 'col-md-6 col-lg-4 mb-3';

            const tipoMap = {
                'DEAL': 'Tradicional',
                'MARKETPLACE_CAMPAIGN': 'Cofinanciada',
                'VOLUME': 'Desconto por quantidade',
                'DOD': 'Oferta do dia',
                'LIGHTNING': 'Oferta relâmpago',
                'PRE_NEGOTIATED': 'Pré-acordado',
                'SELLER_CAMPAIGN': 'Campanha do vendedor',
                'SMART': 'Cofinanciada automatizada',
                'PRICE_MATCHING': 'Preços competitivos',
                'UNHEALTHY_STOCK': 'Liquidação de estoque Full',
                'SELLER_COUPON_CAMPAIGN': 'Cupons do vendedor'
            };
            const tipoLabel = tipoMap[promo.type] || promo.type;

            const statusMap = {
                'started': 'Ativa',
                'pending': 'Pendente',
                'candidate': 'Candidata',
                'finished': 'Finalizada',
                'paused': 'Pausada'
            };
            const statusLabel = statusMap[promo.status] || promo.status;

            const startDate = promo.start_date ? new Date(promo.start_date).toLocaleDateString('pt-BR') : '-';
            const finishDate = promo.finish_date ? new Date(promo.finish_date).toLocaleDateString('pt-BR') : '-';

            let beneficios = '';
            if (promo.benefits) {
                if (promo.benefits.meli_percent) {
                    beneficios += `<span class="badge badge-info">MELI: ${promo.benefits.meli_percent}%</span> `;
                }
                if (promo.benefits.seller_percent) {
                    beneficios += `<span class="badge badge-warning">Vendedor: ${promo.benefits.seller_percent}%</span> `;
                }
                if (promo.benefits.type === 'VOLUME' && promo.benefits.name) {
                    beneficios += `<span class="badge badge-success">${promo.benefits.name}</span> `;
                }
            }

            col.innerHTML = `
                <div class="card h-100 shadow-sm">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start">
                            <h5 class="card-title mb-1">${promo.name || 'Sem nome'}</h5>
                            <span class="badge ${promo.status === 'started' ? 'badge-success' : 'badge-secondary'}">${statusLabel}</span>
                        </div>
                        <p class="card-text small text-muted">
                            <i class="fas fa-tag"></i> ${tipoLabel}
                        </p>
                        <p class="card-text small">
                            <i class="far fa-calendar-alt"></i> ${startDate} - ${finishDate}
                        </p>
                        <div class="mb-2">${beneficios}</div>
                        <button class="btn btn-primary btn-sm" onclick="verItensPromocao('${promo.id}', '${promo.type}')">
                            <i class="fas fa-eye"></i> Ver itens
                        </button>
                    </div>
                </div>
            `;

            lista.appendChild(col);
        });
    }

    window.verItensPromocao = async function(promotionId, promotionType) {
        currentPromotionId = promotionId;
        currentPromotionType = promotionType;
        searchAfter = null;
        hasMoreItens = true;
        itensPromocao = [];

        const detalhesDiv = document.getElementById('detalhesPromocao');
        detalhesDiv.classList.remove('hidden');

        const titulo = document.getElementById('tituloDetalhesPromocao');
        const promo = promocoes.find(p => p.id === promotionId);
        titulo.innerHTML = `<i class="fas fa-list"></i> Itens da Promoção: ${promo ? promo.name : promotionId}`;

        await carregarItensPromocao(promotionId, promotionType);
    };

    async function carregarItensPromocao(promotionId, promotionType, loadMore = false) {
        if (isLoadingItens) return;
        if (!loadMore) {
            itensPromocao = [];
            searchAfter = null;
            hasMoreItens = true;
        }

        isLoadingItens = true;
        const tbody = document.getElementById('bodyItensPromocao');
        const btnCarregarMais = document.getElementById('btnCarregarMaisItens');

        try {
            const tokenData = await window.getValidToken?.();
            if (!tokenData || !tokenData.access_token) {
                throw new Error('Token não disponível');
            }
            const token = tokenData.access_token;

            let url = `https://api.mercadolibre.com/seller-promotions/promotions/${promotionId}/items?promotion_type=${promotionType}&app_version=v2&limit=50`;
            if (searchAfter) {
                url += `&search_after=${encodeURIComponent(searchAfter)}`;
            }

            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;

            const response = await fetch(proxyUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            const novosItens = data.results || [];

            if (data.searchAfter) {
                searchAfter = data.searchAfter;
                hasMoreItens = true;
            } else {
                searchAfter = null;
                hasMoreItens = false;
            }

            if (loadMore) {
                itensPromocao = itensPromocao.concat(novosItens);
            } else {
                itensPromocao = novosItens;
            }

            renderizarItensPromocao(itensPromocao);

            if (btnCarregarMais) {
                btnCarregarMais.disabled = !hasMoreItens;
                btnCarregarMais.textContent = hasMoreItens ? 'Carregar mais' : 'Todos carregados';
            }

            const info = document.getElementById('infoPaginacaoItens');
            if (info) {
                info.textContent = `Mostrando ${itensPromocao.length} itens${hasMoreItens ? ' (há mais)' : ''}`;
            }

        } catch (error) {
            console.error('❌ Erro ao carregar itens da promoção:', error);
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
            }
            showToast('Erro ao carregar itens', 'error');
        } finally {
            isLoadingItens = false;
            if (btnCarregarMais) {
                btnCarregarMais.disabled = !hasMoreItens;
            }
        }
    }

    window.carregarMaisItens = function() {
        if (!currentPromotionId || !currentPromotionType) return;
        if (!hasMoreItens || isLoadingItens) return;
        carregarItensPromocao(currentPromotionId, currentPromotionType, true);
    };

    function renderizarItensPromocao(itens) {
        const tbody = document.getElementById('bodyItensPromocao');
        if (!tbody) return;

        if (!itens || itens.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Nenhum item nesta promoção</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        itens.forEach(item => {
            const tr = document.createElement('tr');

            const statusMap = {
                'started': 'Ativo',
                'pending': 'Pendente',
                'candidate': 'Candidato',
                'active': 'Ativo',
                'paused': 'Pausado',
                'inactive': 'Inativo'
            };
            const statusLabel = statusMap[item.status] || item.status;

            const precoPromocional = item.price ? (item.price / 100).toFixed(2) : '-';
            const precoOriginal = item.original_price ? (item.original_price / 100).toFixed(2) : '-';

            const meliPercent = item.meli_percentage !== undefined ? item.meli_percentage : '-';
            const sellerPercent = item.seller_percentage !== undefined ? item.seller_percentage : '-';

            const boost = item.boosted_offer ? 
                `<span class="badge badge-success" title="Desconto MELI: ${item.discount_meli_boost_percentage || 0}%">Boost</span>` : 
                '<span class="badge badge-secondary">Não</span>';

            let acoes = '';
            if (item.status === 'started' || item.status === 'active') {
                acoes = `
                    <button class="btn btn-danger btn-sm" onclick="excluirItemPromocao('${item.id}', '${item.ref_id || ''}')" title="Excluir da promoção">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
            }

            tr.innerHTML = `
                <td><strong>${item.id}</strong></td>
                <td><span class="badge ${item.status === 'started' || item.status === 'active' ? 'badge-success' : 'badge-secondary'}">${statusLabel}</span></td>
                <td>R$ ${precoPromocional}</td>
                <td>R$ ${precoOriginal}</td>
                <td>${meliPercent}%</td>
                <td>${sellerPercent}%</td>
                <td>${boost}</td>
                <td>${acoes}</td>
            `;

            tbody.appendChild(tr);
        });
    }

    window.excluirItemPromocao = async function(itemId, offerId) {
        if (!offerId) {
            showToast('Não é possível excluir este item (ref_id não disponível)', 'warning');
            return;
        }

        if (!confirm(`Tem certeza que deseja excluir o item ${itemId} desta promoção?`)) {
            return;
        }

        try {
            const tokenData = await window.getValidToken?.();
            if (!tokenData || !tokenData.access_token) {
                throw new Error('Token não disponível');
            }
            const token = tokenData.access_token;

            const url = `https://api.mercadolibre.com/seller-promotions/offers/${offerId}?app_version=v2`;
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;

            const response = await fetch(proxyUrl, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            itensPromocao = itensPromocao.filter(item => item.id !== itemId);
            renderizarItensPromocao(itensPromocao);

            showToast(`✅ Item ${itemId} removido da promoção`, 'success');

        } catch (error) {
            console.error('❌ Erro ao excluir item:', error);
            showToast('Erro ao excluir item: ' + error.message, 'error');
        }
    };

    window.fecharDetalhesPromocao = function() {
        const detalhesDiv = document.getElementById('detalhesPromocao');
        if (detalhesDiv) detalhesDiv.classList.add('hidden');
        currentPromotionId = null;
        currentPromotionType = null;
        itensPromocao = [];
        searchAfter = null;
        hasMoreItens = true;
    };

    window.abrirModalBuscarItem = function() {
        const itemId = prompt('Digite o ID do item (ex: MLB1234567890):');
        if (!itemId) return;
        buscarPromocoesItem(itemId);
    };

    window.buscarPromocoesItem = async function(itemId) {
        try {
            const tokenData = await window.getValidToken?.();
            if (!tokenData || !tokenData.access_token) {
                throw new Error('Token não disponível');
            }
            const token = tokenData.access_token;

            const url = `https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`;
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;

            const response = await fetch(proxyUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();

            let html = `<h5>Promoções do item ${itemId}</h5>`;
            if (!data || data.length === 0) {
                html += `<p class="text-muted">Este item não está em nenhuma promoção.</p>`;
            } else {
                html += `<div class="table-responsive"><table class="table table-sm table-striped">
                    <thead><tr><th>Tipo</th><th>Status</th><th>Preço</th><th>Original</th></tr></thead><tbody>`;
                data.forEach(p => {
                    const tipo = p.type || 'N/A';
                    const status = p.status || 'N/A';
                    const preco = p.price ? (p.price/100).toFixed(2) : '-';
                    const original = p.original_price ? (p.original_price/100).toFixed(2) : '-';
                    html += `<tr><td>${tipo}</td><td>${status}</td><td>R$ ${preco}</td><td>R$ ${original}</td></tr>`;
                });
                html += `</tbody></table></div>`;
            }

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.style.cssText = 'display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); z-index:2000;';
            modal.innerHTML = `
                <div class="modal-content" style="max-width:600px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <h4 style="margin:0;"><i class="fas fa-search"></i> Promoções do Item</h4>
                        <button onclick="this.closest('.modal').remove()" style="background:none; border:none; font-size:24px;">&times;</button>
                    </div>
                    ${html}
                    <div class="d-flex justify-content-end mt-3">
                        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Fechar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

        } catch (error) {
            console.error('❌ Erro ao buscar promoções do item:', error);
            showToast('Erro ao buscar promoções do item: ' + error.message, 'error');
        }
    };

    // ============================================================
    // MÓDULO: GESTÃO DE PROMOÇÕES EM LOTE
    // ============================================================

    window.abrirGestaoPromocoesLote = function() {
        if (!window.currentUser) {
            showToast('⚠️ Faça login primeiro', 'warning');
            return;
        }

        const sistemasIds = [
            'menuSystem', 'mainSystem', 'salesSystem', 'reembolsosSystem',
            'caixaSystem', 'precificacaoSystem', 'reviewsSystem',
            'folgasSystem', 'shippingSystem', 'estoqueSystem',
            'estoqueGestaoSystem', 'nfeSystem', 'perguntasSystem',
            'entradasSystem', 'feedbackSystem', 'promocoesSystem'
        ];
        sistemasIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        let container = document.getElementById('bulkPromotionSystem');
        if (container) {
            container.classList.remove('hidden');
            bulkSystemContainer = container;
        } else {
            container = criarInterfaceBulk();
            document.body.appendChild(container);
            bulkSystemContainer = container;
        }

        atualizarUsuarioBulk();

        if (todasPromocoes.length > 0) {
            preencherSelectsPromocoes();
        } else {
            carregarPromocoesDisponiveis();
        }

        carregarMLBsBloqueados();

        showToast('📋 Gestão de Promoções em Lote carregada', 'info');
    };

    window.fecharGestaoPromocoesLote = function() {
        if (bulkSystemContainer) {
            bulkSystemContainer.classList.add('hidden');
        }
        const menu = document.getElementById('menuSystem');
        if (menu) menu.classList.remove('hidden');
    };

    function criarInterfaceBulk() {
        const div = document.createElement('div');
        div.id = 'bulkPromotionSystem';
        div.className = 'container';
        div.style.display = 'block';
        div.style.maxWidth = '1200px';
        div.style.margin = '0 auto';
        div.style.padding = '0 20px';

        div.innerHTML = `
            <header class="main-header">
                <div class="container">
                    <div class="header-content">
                        <h1 style="display: flex; align-items: center; gap: 10px;">
                            <img src="logo.png" alt="Wheel Tech" style="height: 35px; width: auto;">
                            <span>Gestão de Promoções em Lote</span>
                        </h1>
                        <div class="user-info">
                            <div class="user-avatar" id="bulkUserAvatar">U</div>
                            <div>
                                <div style="font-weight: 600;" id="bulkUserName">Usuário</div>
                                <div style="font-size: 12px; color: #6c757d;" id="bulkUserRole"></div>
                                <div class="d-flex gap-2 mt-2">
                                    <button onclick="fecharGestaoPromocoesLote()" class="btn btn-primary btn-sm">← Voltar ao Menu</button>
                                    <button onclick="handleLogout()" class="btn btn-secondary btn-sm">Sair</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div class="card mb-4">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-cog"></i> Configurar Regras
                    </h2>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-4">
                            <div class="form-group">
                                <label><i class="fas fa-arrow-right"></i> Promoção de Origem *</label>
                                <select id="bulkPromocaoOrigem" class="form-control" onchange="onPromocaoOrigemChange()">
                                    <option value="">Selecione...</option>
                                </select>
                                <small class="text-muted">Itens ativos nesta promoção serão analisados</small>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="form-group">
                                <label><i class="fas fa-arrow-left"></i> Promoção de Destino *</label>
                                <select id="bulkPromocaoDestino" class="form-control">
                                    <option value="">Selecione...</option>
                                </select>
                                <small class="text-muted">Itens serão ativados nesta promoção</small>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="form-group">
                                <label><i class="fas fa-balance-scale"></i> Regra de Comparação</label>
                                <select id="bulkRegraComparacao" class="form-control" onchange="onRegraChange()">
                                    <option value="valor_maior">Valor final MAIOR que na origem</option>
                                    <option value="valor_menor">Valor final MENOR que na origem</option>
                                    <option value="percentual_maior">% desconto MAIOR que na origem</option>
                                    <option value="percentual_menor">% desconto MENOR que na origem</option>
                                    <option value="valor_entre">Valor final entre dois valores</option>
                                    <option value="percentual_entre">% desconto entre dois percentuais</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div id="bulkCamposExtras" class="row hidden">
                        <div class="col-md-3">
                            <div class="form-group">
                                <label>Valor Mínimo (R$)</label>
                                <input type="number" id="bulkValorMin" class="form-control" step="0.01" min="0" placeholder="0,00">
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="form-group">
                                <label>Valor Máximo (R$)</label>
                                <input type="number" id="bulkValorMax" class="form-control" step="0.01" min="0" placeholder="0,00">
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="form-group">
                                <label>% Mínimo</label>
                                <input type="number" id="bulkPercentMin" class="form-control" step="0.1" min="0" max="100" placeholder="0">
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="form-group">
                                <label>% Máximo</label>
                                <input type="number" id="bulkPercentMax" class="form-control" step="0.1" min="0" max="100" placeholder="0">
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card mb-4">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-ban"></i> MLBs Bloqueados
                    </h2>
                    <div>
                        <button class="btn btn-sm btn-success" onclick="adicionarMLBBloqueado()">
                            <i class="fas fa-plus"></i> Adicionar
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="limparMLBsBloqueados()">
                            <i class="fas fa-trash"></i> Limpar Todos
                        </button>
                        <button class="btn btn-sm btn-primary" onclick="exportarMLBsBloqueados()">
                            <i class="fas fa-file-export"></i> Exportar
                        </button>
                        <button class="btn btn-sm btn-info" onclick="importarMLBsBloqueados()">
                            <i class="fas fa-file-import"></i> Importar
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="form-group">
                        <label>Lista de MLB's bloqueados (separados por vírgula ou espaço)</label>
                        <div class="d-flex gap-2">
                            <input type="text" id="bulkMLBsBloqueados" class="form-control" 
                                   placeholder="Ex: MLB123, MLB456, MLB789" 
                                   onchange="salvarMLBsBloqueados()">
                            <button class="btn btn-primary btn-sm" onclick="carregarMLBsBloqueados()">
                                <i class="fas fa-sync-alt"></i>
                            </button>
                        </div>
                        <small class="text-muted">Itens com estes MLB's serão excluídos da ativação em massa</small>
                    </div>
                    <div id="bulkMLBsBloqueadosLista" class="mt-2" style="display:flex; flex-wrap:wrap; gap:5px;"></div>
                </div>
            </div>

            <div class="card mb-4">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-chart-bar"></i> Análise e Ativação
                    </h2>
                    <div>
                        <button class="btn btn-primary" onclick="analisarItens()">
                            <i class="fas fa-search"></i> Analisar Itens
                        </button>
                        <button class="btn btn-success" onclick="executarAtivacaoEmMassa()" id="btnAtivarMassa" disabled>
                            <i class="fas fa-play"></i> Ativar em Massa
                        </button>
                        <button class="btn btn-info" onclick="exportarAnaliseBulkExcel()">
                            <i class="fas fa-file-excel"></i> Exportar Análise
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div id="bulkResumo" class="row mb-3 hidden">
                        <div class="col-md-3">
                            <div class="card text-center bg-light">
                                <div class="card-body">
                                    <h5>Total Analisado</h5>
                                    <h3 id="bulkTotalItens">0</h3>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card text-center bg-success">
                                <div class="card-body">
                                    <h5>Elegíveis</h5>
                                    <h3 id="bulkElegiveis">0</h3>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card text-center bg-warning">
                                <div class="card-body">
                                    <h5>Bloqueados</h5>
                                    <h3 id="bulkBloqueados">0</h3>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card text-center bg-danger">
                                <div class="card-body">
                                    <h5>Não Elegíveis</h5>
                                    <h3 id="bulkNaoElegiveis">0</h3>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="bulkTabelaContainer" class="table-responsive hidden">
                        <table class="table table-striped table-hover" id="bulkItensTable">
                            <thead>
                                <tr>
                                    <th><input type="checkbox" id="bulkSelectAll" onchange="selecionarTodosItens()"></th>
                                    <th>MLB</th>
                                    <th>Preço Origem</th>
                                    <th>% Origem</th>
                                    <th>Preço Destino</th>
                                    <th>% Destino</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody id="bulkItensBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        return div;
    }

    // ------------------------------------------------------------
    // FUNÇÕES DO MÓDULO BULK
    // ------------------------------------------------------------

    function atualizarUsuarioBulk() {
        const nameEl = document.getElementById('bulkUserName');
        const avatarEl = document.getElementById('bulkUserAvatar');
        const roleEl = document.getElementById('bulkUserRole');
        if (nameEl) nameEl.textContent = window.currentUser?.name || 'Usuário';
        if (avatarEl) avatarEl.textContent = window.currentUser?.avatar || 'U';
        if (roleEl) roleEl.textContent = window.currentUser?.role || '';
    }

    function preencherSelectsPromocoes() {
        const origemSelect = document.getElementById('bulkPromocaoOrigem');
        const destinoSelect = document.getElementById('bulkPromocaoDestino');

        if (origemSelect) {
            origemSelect.innerHTML = '<option value="">Selecione...</option>';
            todasPromocoes.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.name} (${p.type}) - ${p.status}`;
                opt.dataset.type = p.type;
                origemSelect.appendChild(opt);
            });
        }

        if (destinoSelect) {
            destinoSelect.innerHTML = '<option value="">Selecione...</option>';
            todasPromocoes.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.name} (${p.type}) - ${p.status}`;
                opt.dataset.type = p.type;
                destinoSelect.appendChild(opt);
            });
        }
    }

    async function carregarPromocoesDisponiveis() {
        try {
            const tokenData = await window.getValidToken?.();
            if (!tokenData?.access_token) {
                showToast('Token não disponível', 'error');
                return;
            }

            const userId = '415176739';
            const url = `https://api.mercadolibre.com/seller-promotions/users/${userId}?app_version=v2`;
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${tokenData.access_token}`;

            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            todasPromocoes = data.results || [];
            preencherSelectsPromocoes();

            showToast(`✅ ${todasPromocoes.length} promoções carregadas`, 'success');

        } catch (error) {
            console.error('❌ Erro ao carregar promoções:', error);
            showToast('Erro ao carregar promoções', 'error');
        }
    }

    // ============================================================
// VERSÃO COM SUPABASE - PARA USAR COM A TABELA ACIMA
// ============================================================

async function carregarMLBsBloqueados() {
    try {
        const supabase = getSupabaseClient();
        
        if (!supabase) {
            // Fallback para localStorage
            console.warn('Supabase não disponível, usando localStorage');
            const saved = localStorage.getItem('mlbs_bloqueados_promocao');
            if (saved) {
                mlbsBloqueados = JSON.parse(saved);
                atualizarInterfaceMLBsBloqueados();
            }
            return;
        }

        const { data, error } = await supabase
            .from('mlbs_bloqueados_promocao')
            .select('mlb')
            .order('created_at', { ascending: false });

        if (error) throw error;

        mlbsBloqueados = data ? data.map(row => row.mlb) : [];
        atualizarInterfaceMLBsBloqueados();

        // Também salva no localStorage como fallback
        localStorage.setItem('mlbs_bloqueados_promocao', JSON.stringify(mlbsBloqueados));

    } catch (error) {
        console.error('❌ Erro ao carregar MLBs bloqueados:', error);
        // Fallback: localStorage
        try {
            const saved = localStorage.getItem('mlbs_bloqueados_promocao');
            if (saved) {
                mlbsBloqueados = JSON.parse(saved);
                atualizarInterfaceMLBsBloqueados();
            }
        } catch (e) {
            mlbsBloqueados = [];
        }
    }
}

    async function salvarMLBsBloqueados() {
    const input = document.getElementById('bulkMLBsBloqueados');
    if (!input) return;

    const raw = input.value;
    const mlbs = raw.split(/[,;\s]+/).filter(m => m.trim().length > 0);
    mlbsBloqueados = mlbs.map(m => m.trim().toUpperCase());

    try {
        const supabase = getSupabaseClient();
        
        // Sempre salva no localStorage como fallback
        localStorage.setItem('mlbs_bloqueados_promocao', JSON.stringify(mlbsBloqueados));

        if (supabase) {
            // Primeiro, limpar todos os registros existentes
            const { error: deleteError } = await supabase
                .from('mlbs_bloqueados_promocao')
                .delete()
                .neq('id', 0);

            if (deleteError) throw deleteError;

            // Inserir novos
            if (mlbsBloqueados.length > 0) {
                const inserts = mlbsBloqueados.map(mlb => ({ mlb }));
                const { error: insertError } = await supabase
                    .from('mlbs_bloqueados_promocao')
                    .insert(inserts);

                if (insertError) throw insertError;
            }
        }

        atualizarInterfaceMLBsBloqueados();
        showToast(`✅ ${mlbsBloqueados.length} MLB's bloqueados salvos`, 'success');

    } catch (error) {
        console.error('❌ Erro ao salvar MLBs bloqueados:', error);
        // Fallback: localStorage já foi salvo
        atualizarInterfaceMLBsBloqueados();
        showToast('⚠️ Salvo localmente (não sincronizado com servidor)', 'warning');
    }
}

// Função para obter o cliente Supabase
function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    
    // Tenta obter de várias fontes
    if (window.supabase) {
        supabaseClient = window.supabase;
        return supabaseClient;
    }
    
    if (window._supabase) {
        supabaseClient = window._supabase;
        return supabaseClient;
    }
    
    // Se não houver Supabase, retorna null (usa localStorage)
    console.warn('⚠️ Supabase não disponível, usando apenas localStorage');
    return null;
}

    function atualizarInterfaceMLBsBloqueados() {
        const input = document.getElementById('bulkMLBsBloqueados');
        const lista = document.getElementById('bulkMLBsBloqueadosLista');

        if (input) {
            input.value = mlbsBloqueados.join(', ');
        }

        if (lista) {
            lista.innerHTML = '';
            if (mlbsBloqueados.length === 0) {
                lista.innerHTML = '<span class="text-muted">Nenhum MLB bloqueado</span>';
                return;
            }
            mlbsBloqueados.forEach(mlb => {
                const tag = document.createElement('span');
                tag.className = 'badge badge-danger';
                tag.style.cssText = 'padding: 5px 10px; font-size: 13px; display: inline-flex; align-items: center; gap: 5px;';
                tag.innerHTML = `${mlb} <i class="fas fa-times" style="cursor:pointer;" onclick="removerMLBBloqueado('${mlb}')"></i>`;
                lista.appendChild(tag);
            });
        }
    }

    window.adicionarMLBBloqueado = function() {
        const mlb = prompt('Digite o MLB do anúncio que deseja bloquear (ex: MLB1234567890):');
        if (!mlb) return;
        const mlbClean = mlb.trim().toUpperCase();
        if (!mlbsBloqueados.includes(mlbClean)) {
            mlbsBloqueados.push(mlbClean);
            salvarMLBsBloqueados();
        } else {
            showToast('⚠️ Este MLB já está na lista de bloqueados', 'warning');
        }
    };

    window.removerMLBBloqueado = function(mlb) {
        mlbsBloqueados = mlbsBloqueados.filter(m => m !== mlb);
        salvarMLBsBloqueados();
    };

    window.limparMLBsBloqueados = function() {
        if (!confirm('Tem certeza que deseja limpar TODOS os MLB\'s bloqueados?')) return;
        mlbsBloqueados = [];
        salvarMLBsBloqueados();
    };

    window.exportarMLBsBloqueados = function() {
        if (mlbsBloqueados.length === 0) {
            showToast('⚠️ Nenhum MLB bloqueado para exportar', 'warning');
            return;
        }
        
        const texto = mlbsBloqueados.join('\n');
        const blob = new Blob([texto], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mlbs_bloqueados_${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast('📋 MLBs bloqueados exportados!', 'success');
    };

    window.importarMLBsBloqueados = function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,.csv';
        input.onchange = function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(event) {
                const texto = event.target.result;
                const mlbs = texto.split(/[\n\r,;]+/)
                    .map(m => m.trim().toUpperCase())
                    .filter(m => m.length > 0);
                
                mlbsBloqueados = [...new Set([...mlbsBloqueados, ...mlbs])];
                salvarMLBsBloqueados();
                showToast(`✅ ${mlbs.length} MLB's importados!`, 'success');
            };
            reader.readAsText(file);
        };
        input.click();
    };

    // ------------------------------------------------------------
    // EVENTOS
    // ------------------------------------------------------------
    window.onPromocaoOrigemChange = async function() {
        const origemSelect = document.getElementById('bulkPromocaoOrigem');
        const destinoSelect = document.getElementById('bulkPromocaoDestino');
        if (!origemSelect || !destinoSelect) return;

        const origemId = origemSelect.value;
        const destinoId = destinoSelect.value;

        if (origemId && destinoId && origemId === destinoId) {
            showToast('⚠️ A promoção de origem e destino não podem ser iguais', 'warning');
            destinoSelect.value = '';
        }

        if (origemId) {
            await carregarItensOrigem(origemId);
        }
    };

    window.onRegraChange = function() {
        const regra = document.getElementById('bulkRegraComparacao');
        const extras = document.getElementById('bulkCamposExtras');
        if (!regra || !extras) return;

        const isEntre = regra.value === 'valor_entre' || regra.value === 'percentual_entre';
        extras.classList.toggle('hidden', !isEntre);
    };

    // ------------------------------------------------------------
    // CARREGAR ITENS DA ORIGEM - CORRIGIDO
    // ------------------------------------------------------------
    async function carregarItensOrigem(promotionId) {
        try {
            const tokenData = await window.getValidToken?.();
            if (!tokenData?.access_token) {
                showToast('Token não disponível', 'error');
                return;
            }

            const promo = todasPromocoes.find(p => p.id === promotionId);
            if (!promo) {
                showToast('Promoção não encontrada', 'error');
                return;
            }

            // CORREÇÃO: Usar o promotion_type correto
            const promoType = promo.type;
            let url = `https://api.mercadolibre.com/seller-promotions/promotions/${promotionId}/items?app_version=v2&limit=200`;
            
            // Adicionar promotion_type apenas se for um tipo válido
            if (promoType && promoType !== 'UNKNOWN') {
                url += `&promotion_type=${promoType}`;
            }

            console.log('🔄 Buscando itens da origem:', url);
            
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${tokenData.access_token}`;

            const response = await fetch(proxyUrl);
            
            if (!response.ok) {
                // Se falhar, tenta sem o promotion_type
                if (url.includes('promotion_type')) {
                    console.warn('⚠️ Tentando sem promotion_type...');
                    const fallbackUrl = `https://api.mercadolibre.com/seller-promotions/promotions/${promotionId}/items?app_version=v2&limit=200`;
                    const fallbackProxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(fallbackUrl)}&token=${tokenData.access_token}`;
                    const fallbackResponse = await fetch(fallbackProxyUrl);
                    if (!fallbackResponse.ok) {
                        throw new Error(`HTTP ${fallbackResponse.status}`);
                    }
                    const data = await fallbackResponse.json();
                    itensPromocaoOrigem = data.results || [];
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }
            } else {
                const data = await response.json();
                itensPromocaoOrigem = data.results || [];
            }

            showToast(`✅ ${itensPromocaoOrigem.length} itens carregados da promoção de origem`, 'success');

        } catch (error) {
            console.error('❌ Erro ao carregar itens da origem:', error);
            showToast('Erro ao carregar itens da origem: ' + error.message, 'error');
            itensPromocaoOrigem = [];
        }
    }

    // ------------------------------------------------------------
    // ANALISAR ITENS
    // ------------------------------------------------------------
    window.analisarItens = async function() {
        const origemId = document.getElementById('bulkPromocaoOrigem')?.value;
        const destinoId = document.getElementById('bulkPromocaoDestino')?.value;
        const regra = document.getElementById('bulkRegraComparacao')?.value;

        if (!origemId || !destinoId) {
            showToast('⚠️ Selecione a promoção de origem e destino', 'warning');
            return;
        }

        if (origemId === destinoId) {
            showToast('⚠️ A promoção de origem e destino não podem ser iguais', 'warning');
            return;
        }

        if (itensPromocaoOrigem.length === 0) {
            showToast('⚠️ Nenhum item carregado da promoção de origem.', 'warning');
            await carregarItensOrigem(origemId);
            if (itensPromocaoOrigem.length === 0) return;
        }

        const promocaoDestino = todasPromocoes.find(p => p.id === destinoId);
        if (!promocaoDestino) {
            showToast('Promoção de destino não encontrada', 'error');
            return;
        }

        let valorMin = parseFloat(document.getElementById('bulkValorMin')?.value) || null;
        let valorMax = parseFloat(document.getElementById('bulkValorMax')?.value) || null;
        let percentMin = parseFloat(document.getElementById('bulkPercentMin')?.value) || null;
        let percentMax = parseFloat(document.getElementById('bulkPercentMax')?.value) || null;

        let itensDestino = [];
        try {
            const tokenData = await window.getValidToken?.();
            if (tokenData?.access_token) {
                let url = `https://api.mercadolibre.com/seller-promotions/promotions/${destinoId}/items?app_version=v2&limit=200`;
                if (promocaoDestino.type && promocaoDestino.type !== 'UNKNOWN') {
                    url += `&promotion_type=${promocaoDestino.type}`;
                }
                const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${tokenData.access_token}`;
                const response = await fetch(proxyUrl);
                if (response.ok) {
                    const data = await response.json();
                    itensDestino = data.results || [];
                }
            }
        } catch (e) {
            console.warn('Não foi possível carregar itens do destino:', e);
        }

        const mapaDestino = {};
        itensDestino.forEach(item => {
            const id = item.id || item.item_id;
            if (id) {
                mapaDestino[id] = {
                    price: item.price || 0,
                    original_price: item.original_price || 0,
                    meli_percentage: item.meli_percentage || 0,
                    seller_percentage: item.seller_percentage || 0
                };
            }
        });

        itensFiltrados = [];
        let elegiveis = 0;
        let bloqueados = 0;
        let naoElegiveis = 0;

        for (const item of itensPromocaoOrigem) {
            const itemId = item.id || item.item_id;
            const mlb = itemId;

            if (mlbsBloqueados.includes(mlb)) {
                bloqueados++;
                itensFiltrados.push({
                    ...item,
                    elegivel: false,
                    motivo: '🚫 Bloqueado',
                    precoDestino: mapaDestino[mlb]?.price || null,
                    percentDestino: mapaDestino[mlb]?.seller_percentage || null,
                    precoOrigem: item.price || 0,
                    percentOrigem: item.seller_percentage || 0
                });
                continue;
            }

            const precoOrigem = item.price || 0;
            const percentOrigem = item.seller_percentage || 0;
            const destino = mapaDestino[mlb];
            const precoDestino = destino?.price || null;
            const percentDestino = destino?.seller_percentage || null;

            let elegivel = false;
            let motivo = '';

            switch (regra) {
                case 'valor_maior':
                    if (precoDestino !== null && precoDestino > precoOrigem) {
                        elegivel = true;
                    } else {
                        motivo = `Preço destino (R$ ${precoDestino?.toFixed(2) || 'N/A'}) não é maior que origem (R$ ${precoOrigem.toFixed(2)})`;
                    }
                    break;

                case 'valor_menor':
                    if (precoDestino !== null && precoDestino < precoOrigem) {
                        elegivel = true;
                    } else {
                        motivo = `Preço destino (R$ ${precoDestino?.toFixed(2) || 'N/A'}) não é menor que origem (R$ ${precoOrigem.toFixed(2)})`;
                    }
                    break;

                case 'percentual_maior':
                    if (percentDestino !== null && percentDestino > percentOrigem) {
                        elegivel = true;
                    } else {
                        motivo = `% destino (${percentDestino || 'N/A'}%) não é maior que origem (${percentOrigem}%)`;
                    }
                    break;

                case 'percentual_menor':
                    if (percentDestino !== null && percentDestino < percentOrigem) {
                        elegivel = true;
                    } else {
                        motivo = `% destino (${percentDestino || 'N/A'}%) não é menor que origem (${percentOrigem}%)`;
                    }
                    break;

                case 'valor_entre':
                    if (precoDestino !== null && 
                        (valorMin === null || precoDestino >= valorMin) && 
                        (valorMax === null || precoDestino <= valorMax)) {
                        elegivel = true;
                    } else {
                        motivo = `Preço destino (R$ ${precoDestino?.toFixed(2) || 'N/A'}) não está entre R$ ${valorMin || '∞'} e R$ ${valorMax || '∞'}`;
                    }
                    break;

                case 'percentual_entre':
                    if (percentDestino !== null && 
                        (percentMin === null || percentDestino >= percentMin) && 
                        (percentMax === null || percentDestino <= percentMax)) {
                        elegivel = true;
                    } else {
                        motivo = `% destino (${percentDestino || 'N/A'}%) não está entre ${percentMin || '∞'}% e ${percentMax || '∞'}%`;
                    }
                    break;

                default:
                    elegivel = false;
                    motivo = 'Regra não reconhecida';
            }

            if (elegivel) {
                elegiveis++;
            } else {
                naoElegiveis++;
            }

            itensFiltrados.push({
                ...item,
                elegivel,
                motivo: elegivel ? '✅ Elegível' : motivo,
                precoDestino,
                percentDestino,
                precoOrigem,
                percentOrigem
            });
        }

        document.getElementById('bulkResumo').classList.remove('hidden');
        document.getElementById('bulkTabelaContainer').classList.remove('hidden');
        document.getElementById('bulkTotalItens').textContent = itensFiltrados.length;
        document.getElementById('bulkElegiveis').textContent = elegiveis;
        document.getElementById('bulkBloqueados').textContent = bloqueados;
        document.getElementById('bulkNaoElegiveis').textContent = naoElegiveis;

        const btnAtivar = document.getElementById('btnAtivarMassa');
        btnAtivar.disabled = elegiveis === 0;

        renderizarTabelaItensBulk();

        showToast(`✅ Análise concluída: ${elegiveis} elegíveis, ${bloqueados} bloqueados, ${naoElegiveis} não elegíveis`, 'info');
    };

    function renderizarTabelaItensBulk() {
        const tbody = document.getElementById('bulkItensBody');
        if (!tbody) return;

        if (itensFiltrados.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center">Nenhum item para exibir</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        itensFiltrados.forEach((item, index) => {
            const tr = document.createElement('tr');
            const mlb = item.id || item.item_id || 'N/A';
            const precoOrigem = item.precoOrigem || 0;
            const percentOrigem = item.percentOrigem || 0;
            const precoDestino = item.precoDestino !== null ? item.precoDestino : null;
            const percentDestino = item.percentDestino !== null ? item.percentDestino : null;

            let statusClass = '';
            let statusText = '';
            if (!item.elegivel && item.motivo === '🚫 Bloqueado') {
                statusClass = 'text-danger';
                statusText = '🚫 Bloqueado';
            } else if (item.elegivel) {
                statusClass = 'text-success';
                statusText = '✅ Elegível';
            } else {
                statusClass = 'text-warning';
                statusText = '❌ Não elegível';
            }

            tr.innerHTML = `
                <td><input type="checkbox" class="bulk-item-checkbox" data-index="${index}" ${item.elegivel ? 'checked' : 'disabled'}></td>
                <td><strong>${mlb}</strong></td>
                <td>R$ ${precoOrigem.toFixed(2)}</td>
                <td>${percentOrigem}%</td>
                <td>${precoDestino !== null ? `R$ ${precoDestino.toFixed(2)}` : '-'}</td>
                <td>${percentDestino !== null ? `${percentDestino}%` : '-'}</td>
                <td class="${statusClass}">${statusText} <small class="text-muted" style="display:block;font-size:10px;">${!item.elegivel && item.motivo !== '🚫 Bloqueado' ? item.motivo : ''}</small></td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.selecionarTodosItens = function() {
        const checked = document.getElementById('bulkSelectAll')?.checked || false;
        document.querySelectorAll('.bulk-item-checkbox').forEach(cb => {
            if (!cb.disabled) cb.checked = checked;
        });
    };

    window.executarAtivacaoEmMassa = async function() {
        const destinoId = document.getElementById('bulkPromocaoDestino')?.value;
        if (!destinoId) {
            showToast('⚠️ Selecione a promoção de destino', 'warning');
            return;
        }

        const selecionados = [];
        document.querySelectorAll('.bulk-item-checkbox:checked').forEach(cb => {
            const index = parseInt(cb.dataset.index);
            if (!isNaN(index) && itensFiltrados[index]) {
                selecionados.push(itensFiltrados[index]);
            }
        });

        if (selecionados.length === 0) {
            showToast('⚠️ Nenhum item selecionado para ativação', 'warning');
            return;
        }

        if (!confirm(`Tem certeza que deseja ativar ${selecionados.length} itens na promoção de destino?`)) {
            return;
        }

        const destinoPromo = todasPromocoes.find(p => p.id === destinoId);
        if (!destinoPromo) {
            showToast('Promoção de destino não encontrada', 'error');
            return;
        }

        try {
            const tokenData = await window.getValidToken?.();
            if (!tokenData?.access_token) {
                showToast('Token não disponível', 'error');
                return;
            }

            let sucessos = 0;
            let falhas = 0;
            const falhasLista = [];

            const batchSize = 20;
            for (let i = 0; i < selecionados.length; i += batchSize) {
                const batch = selecionados.slice(i, i + batchSize);
                
                const promises = batch.map(async (item) => {
                    const itemId = item.id || item.item_id;
                    const preco = item.precoDestino || item.price || 0;

                    if (preco <= 0) {
                        falhas++;
                        falhasLista.push(`${itemId} (preço inválido: ${preco})`);
                        return false;
                    }

                    const url = `https://api.mercadolibre.com/seller-promotions/offers?app_version=v2`;
                    const body = {
                        promotion_id: destinoId,
                        item_id: itemId,
                        price: Math.round(preco * 100)
                    };

                    try {
                        const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${tokenData.access_token}`;
                        const response = await fetch(proxyUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body)
                        });

                        if (response.ok) {
                            sucessos++;
                            return true;
                        } else {
                            const errorText = await response.text();
                            console.error(`❌ Falha ao ativar ${itemId}: ${errorText}`);
                            falhas++;
                            falhasLista.push(`${itemId}: ${errorText}`);
                            return false;
                        }
                    } catch (err) {
                        console.error(`❌ Erro ao ativar ${itemId}:`, err);
                        falhas++;
                        falhasLista.push(`${itemId}: ${err.message}`);
                        return false;
                    }
                });

                await Promise.all(promises);
                showToast(`⏳ Progresso: ${Math.min(i + batchSize, selecionados.length)}/${selecionados.length}`, 'info');
            }

            let mensagem = `✅ Ativação concluída! ${sucessos} sucessos, ${falhas} falhas`;
            if (falhas > 0 && falhasLista.length > 0) {
                mensagem += `\nFalhas: ${falhasLista.slice(0, 5).join(', ')}${falhasLista.length > 5 ? `... (+${falhasLista.length - 5} mais)` : ''}`;
            }
            
            showToast(mensagem, sucessos > 0 ? 'success' : 'error');

            setTimeout(() => analisarItens(), 3000);

        } catch (error) {
            console.error('❌ Erro durante ativação em massa:', error);
            showToast('Erro durante ativação em massa: ' + error.message, 'error');
        }
    };

    window.exportarAnaliseBulkExcel = function() {
        if (itensFiltrados.length === 0) {
            showToast('⚠️ Nenhum dado para exportar', 'warning');
            return;
        }

        try {
            const dados = itensFiltrados.map(item => ({
                'MLB': item.id || item.item_id || 'N/A',
                'Preço Origem': item.precoOrigem || 0,
                '% Origem': item.percentOrigem || 0,
                'Preço Destino': item.precoDestino !== null ? item.precoDestino : 'N/A',
                '% Destino': item.percentDestino !== null ? item.percentDestino : 'N/A',
                'Status': item.elegivel ? 'Elegível' : (item.motivo === '🚫 Bloqueado' ? 'Bloqueado' : 'Não elegível'),
                'Motivo': item.motivo || ''
            }));

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(dados);
            XLSX.utils.book_append_sheet(wb, ws, 'Análise');
            
            const colWidths = [
                { wch: 18 }, { wch: 15 }, { wch: 12 }, 
                { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 40 }
            ];
            ws['!cols'] = colWidths;

            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `analise_promocoes_${new Date().toISOString().slice(0,10)}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showToast('📊 Análise exportada com sucesso!', 'success');

        } catch (error) {
            console.error('❌ Erro ao exportar:', error);
            showToast('Erro ao exportar análise', 'error');
        }
    };

    // ------------------------------------------------------------
    // INICIALIZAÇÃO
    // ------------------------------------------------------------
    console.log('📢 Módulo de Promoções carregado');

})();