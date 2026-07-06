// ============================================================
// MÓDULO: GERENCIAMENTO DE PROMOÇÕES (Mercado Livre)
// ============================================================
// Dependências: ml_token_manager.js, supabase, currentUser
// ============================================================

(function() {
    'use strict';

    // ------------------------------------------------------------
    // VARIÁVEIS GLOBAIS DO MÓDULO
    // ------------------------------------------------------------
    let promocoes = [];                 // Todas as promoções do vendedor
    let itensPromocao = [];            // Itens da promoção selecionada
    let currentPromotionId = null;     // ID da promoção em exibição
    let currentPromotionType = null;   // Tipo da promoção em exibição
    let searchAfter = null;            // Parâmetro de paginação para itens
    let isLoadingItens = false;
    let hasMoreItens = true;

    // Elementos da interface (criados dinamicamente)
    let containerPromocoes = null;

    // ------------------------------------------------------------
    // FUNÇÃO PRINCIPAL: ABRIR SISTEMA DE PROMOÇÕES
    // ------------------------------------------------------------
    window.abrirSistemaPromocoes = function() {
        if (!window.currentUser) {
            showToast('⚠️ Faça login primeiro', 'warning');
            return;
        }

        // Esconder outros sistemas
        const sistemasIds = [
            'menuSystem', 'mainSystem', 'salesSystem', 'reembolsosSystem',
            'caixaSystem', 'precificacaoSystem', 'reviewsSystem',
            'folgasSystem', 'shippingSystem', 'estoqueSystem',
            'estoqueGestaoSystem', 'nfeSystem', 'perguntasSystem',
            'entradasSystem', 'feedbackSystem'
        ];
        sistemasIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        // Criar ou mostrar container de promoções
        if (!containerPromocoes) {
            containerPromocoes = criarInterfacePromocoes();
            document.body.appendChild(containerPromocoes);
        } else {
            containerPromocoes.classList.remove('hidden');
        }

        // Atualizar informações do usuário no header
        const userNameEl = document.getElementById('promocoesUserName');
        const userAvatarEl = document.getElementById('promocoesUserAvatar');
        const userRoleEl = document.getElementById('promocoesUserRole');
        if (userNameEl) userNameEl.textContent = window.currentUser.name;
        if (userAvatarEl) userAvatarEl.textContent = window.currentUser.avatar;
        if (userRoleEl) userRoleEl.textContent = window.currentUser.role;

        // Carregar dados
        carregarPromocoes();
        showToast('📢 Sistema de Promoções carregado', 'info');
    };

    // ------------------------------------------------------------
    // CRIAÇÃO DA INTERFACE HTML
    // ------------------------------------------------------------
    function criarInterfacePromocoes() {
        const div = document.createElement('div');
        div.id = 'promocoesSystem';
        div.className = 'container';
        div.style.display = 'block';

        // Cabeçalho
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
                <div class="d-flex justify-content-between align-items-center">
                    <h3 style="margin:0;"><i class="fas fa-tags"></i> Promoções do Vendedor</h3>
                    <div>
                        <button class="btn btn-primary" id="btnAtualizarPromocoes" onclick="carregarPromocoes()">
                            <i class="fas fa-sync-alt"></i> Atualizar
                        </button>
                        <button class="btn btn-success" id="btnBuscarItemPromocoes" onclick="abrirModalBuscarItem()">
                            <i class="fas fa-search"></i> Ver promoções de um item
                        </button>
                    </div>
                </div>
            </div>

            <!-- Lista de Promoções (cards) -->
            <div id="listaPromocoes" class="row">
                <div class="col-12 text-center py-4 text-muted">
                    <i class="fas fa-spinner fa-spin fa-2x"></i><br>
                    Carregando promoções...
                </div>
            </div>

            <!-- Detalhes da Promoção Selecionada -->
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
    // CARREGAR PROMOÇÕES DO VENDEDOR
    // ------------------------------------------------------------
    window.carregarPromocoes = async function() {
        const lista = document.getElementById('listaPromocoes');
        if (!lista) return;

        // Mostrar loading
        lista.innerHTML = `
            <div class="col-12 text-center py-4 text-muted">
                <i class="fas fa-spinner fa-spin fa-2x"></i><br>
                Carregando promoções...
            </div>
        `;

        try {
            // Obter token válido
            const tokenData = await window.getValidToken?.();
            if (!tokenData || !tokenData.access_token) {
                throw new Error('Não foi possível obter token do Mercado Livre');
            }
            const token = tokenData.access_token;

            // Buscar promoções do vendedor
            const userId = '415176739'; // ID fixo do seller (igual ao usado nas vendas)
            const url = `https://api.mercadolibre.com/seller-promotions/users/${userId}?app_version=v2`;
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;

            const response = await fetch(proxyUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            promocoes = data.results || [];
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

    // ------------------------------------------------------------
    // RENDERIZAR PROMOÇÕES (CARDS)
    // ------------------------------------------------------------
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

            // Mapear tipo para nome amigável
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

            // Status
            const statusMap = {
                'started': 'Ativa',
                'pending': 'Pendente',
                'candidate': 'Candidata',
                'finished': 'Finalizada',
                'paused': 'Pausada'
            };
            const statusLabel = statusMap[promo.status] || promo.status;

            // Datas
            const startDate = promo.start_date ? new Date(promo.start_date).toLocaleDateString('pt-BR') : '-';
            const finishDate = promo.finish_date ? new Date(promo.finish_date).toLocaleDateString('pt-BR') : '-';

            // Benefícios
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

    // ------------------------------------------------------------
    // VER ITENS DE UMA PROMOÇÃO
    // ------------------------------------------------------------
    window.verItensPromocao = async function(promotionId, promotionType) {
        currentPromotionId = promotionId;
        currentPromotionType = promotionType;
        searchAfter = null;
        hasMoreItens = true;
        itensPromocao = [];

        // Mostrar painel de detalhes
        const detalhesDiv = document.getElementById('detalhesPromocao');
        detalhesDiv.classList.remove('hidden');

        // Atualizar título
        const titulo = document.getElementById('tituloDetalhesPromocao');
        const promo = promocoes.find(p => p.id === promotionId);
        titulo.innerHTML = `<i class="fas fa-list"></i> Itens da Promoção: ${promo ? promo.name : promotionId}`;

        // Carregar itens
        await carregarItensPromocao(promotionId, promotionType);
    };

    // ------------------------------------------------------------
    // CARREGAR ITENS DE UMA PROMOÇÃO (COM PAGINAÇÃO)
    // ------------------------------------------------------------
    async function carregarItensPromocao(promotionId, promotionType, loadMore = false) {
        if (isLoadingItens) return;
        if (!loadMore) {
            // Reset
            itensPromocao = [];
            searchAfter = null;
            hasMoreItens = true;
        }

        isLoadingItens = true;
        const tbody = document.getElementById('bodyItensPromocao');
        const btnCarregarMais = document.getElementById('btnCarregarMaisItens');

        try {
            // Obter token
            const tokenData = await window.getValidToken?.();
            if (!tokenData || !tokenData.access_token) {
                throw new Error('Token não disponível');
            }
            const token = tokenData.access_token;

            // Montar URL
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

            // Atualizar searchAfter para a próxima página
            if (data.searchAfter) {
                searchAfter = data.searchAfter;
                hasMoreItens = true;
            } else {
                searchAfter = null;
                hasMoreItens = false;
            }

            // Mesclar itens
            if (loadMore) {
                itensPromocao = itensPromocao.concat(novosItens);
            } else {
                itensPromocao = novosItens;
            }

            // Renderizar
            renderizarItensPromocao(itensPromocao);

            // Atualizar botão "carregar mais"
            if (btnCarregarMais) {
                btnCarregarMais.disabled = !hasMoreItens;
                btnCarregarMais.textContent = hasMoreItens ? 'Carregar mais' : 'Todos carregados';
            }

            // Informações de paginação
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

    // Função pública para carregar mais itens
    window.carregarMaisItens = function() {
        if (!currentPromotionId || !currentPromotionType) return;
        if (!hasMoreItens || isLoadingItens) return;
        carregarItensPromocao(currentPromotionId, currentPromotionType, true);
    };

    // ------------------------------------------------------------
    // RENDERIZAR ITENS DA PROMOÇÃO
    // ------------------------------------------------------------
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

            // Status do item
            const statusMap = {
                'started': 'Ativo',
                'pending': 'Pendente',
                'candidate': 'Candidato',
                'active': 'Ativo',
                'paused': 'Pausado',
                'inactive': 'Inativo'
            };
            const statusLabel = statusMap[item.status] || item.status;

            // Preços
            const precoPromocional = item.price ? (item.price / 100).toFixed(2) : '-';
            const precoOriginal = item.original_price ? (item.original_price / 100).toFixed(2) : '-';

            // Descontos (se disponíveis)
            const meliPercent = item.meli_percentage !== undefined ? item.meli_percentage : '-';
            const sellerPercent = item.seller_percentage !== undefined ? item.seller_percentage : '-';

            // Boost
            const boost = item.boosted_offer ? 
                `<span class="badge badge-success" title="Desconto MELI: ${item.discount_meli_boost_percentage || 0}%">Boost</span>` : 
                '<span class="badge badge-secondary">Não</span>';

            // Botão excluir (apenas se o item estiver ativo)
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

    // ------------------------------------------------------------
    // EXCLUIR ITEM DA PROMOÇÃO
    // ------------------------------------------------------------
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

            // DELETE /seller-promotions/offers/{offer_id}
            const url = `https://api.mercadolibre.com/seller-promotions/offers/${offerId}?app_version=v2`;
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;

            const response = await fetch(proxyUrl, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            // Remover da lista local
            itensPromocao = itensPromocao.filter(item => item.id !== itemId);
            renderizarItensPromocao(itensPromocao);

            showToast(`✅ Item ${itemId} removido da promoção`, 'success');

        } catch (error) {
            console.error('❌ Erro ao excluir item:', error);
            showToast('Erro ao excluir item: ' + error.message, 'error');
        }
    };

    // ------------------------------------------------------------
    // FECHAR DETALHES DA PROMOÇÃO
    // ------------------------------------------------------------
    window.fecharDetalhesPromocao = function() {
        const detalhesDiv = document.getElementById('detalhesPromocao');
        if (detalhesDiv) detalhesDiv.classList.add('hidden');
        currentPromotionId = null;
        currentPromotionType = null;
        itensPromocao = [];
        searchAfter = null;
        hasMoreItens = true;
    };

    // ------------------------------------------------------------
    // BUSCAR PROMOÇÕES DE UM ITEM ESPECÍFICO (MODAL)
    // ------------------------------------------------------------
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

            // Exibir em um modal simples
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

            // Criar modal temporário
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

    // ------------------------------------------------------------
    // INICIALIZAÇÃO (se o DOM já estiver carregado)
    // ------------------------------------------------------------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            // Nada especial, apenas garantir que as funções estejam disponíveis
            console.log('📢 Módulo de Promoções carregado');
        });
    } else {
        console.log('📢 Módulo de Promoções carregado');
    }

})();