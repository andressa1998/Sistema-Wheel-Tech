// full_analysis.js - Módulo IIFE para evitar conflitos globais
(function() {
    'use strict';

    console.log('📦 Iniciando módulo FULL Analysis...');

    // Variáveis internas (não poluem o escopo global)
    let fullData = [];
    let fullFilter = 'todos';
    let fullSyncInProgress = false;

    // ============================================================
    // FUNÇÃO PRINCIPAL: SINCRONIZAR DADOS FULL
    // ============================================================
    async function sincronizarFull() {
    if (fullSyncInProgress) {
        window.showToast('⏳ Sincronização em andamento...', 'warning');
        return;
    }

    if (!window.currentUser) {
        window.showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    fullSyncInProgress = true;
    const btn = document.querySelector('#fullSystem .btn-primary');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Sincronizando...';
    }

    try {
        const tokenData = await window.getValidToken();
        if (!tokenData || !tokenData.access_token) {
            throw new Error('Token ML não disponível.');
        }
        const token = tokenData.access_token;
        const sellerId = '415176739';

        // 1. Busca lista de itens do vendedor
        const itemsUrl = `https://api.mercadolibre.com/users/${sellerId}/items/search?limit=200&search_type=scan`;
        const itemsProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(itemsUrl)}&token=${encodeURIComponent(token)}`;
        const itemsResp = await fetch(itemsProxy);
        if (!itemsResp.ok) throw new Error('Erro ao buscar lista de itens');
        const itemsData = await itemsResp.json();
        const itemIds = itemsData.results || [];

        if (itemIds.length === 0) {
            window.showToast('Nenhum item encontrado.', 'info');
            fullData = [];
            renderizarFull();
            return;
        }

        console.log(`🔍 ${itemIds.length} itens encontrados, filtrando FULL...`);

        const fullItems = [];
        const batchSize = 10; // Reduzido para evitar rate limit
        let totalFull = 0;

        for (let i = 0; i < itemIds.length; i += batchSize) {
            const batch = itemIds.slice(i, i + batchSize);
            const promises = batch.map(async (itemId) => {
                try {
                    // Busca detalhes do item
                    const itemUrl = `https://api.mercadolibre.com/items/${itemId}`;
                    const itemProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(itemUrl)}&token=${encodeURIComponent(token)}`;
                    const resp = await fetch(itemProxy);
                    if (!resp.ok) return null;
                    const item = await resp.json();

                    // ===== IDENTIFICAÇÃO DO FULL =====
                    // 1. Verifica se o item tem inventory_id (campo direto)
                    let inventoryId = item.inventory_id || null;

                    // 2. Se não tiver, verifica nas variações
                    if (!inventoryId && item.variations && item.variations.length > 0) {
                        const variationWithInventory = item.variations.find(v => v.inventory_id);
                        if (variationWithInventory) {
                            inventoryId = variationWithInventory.inventory_id;
                        }
                    }

                    // 3. Se ainda não tiver, verifica logistic_type e tags
                    const isFullByLogistic = item.logistic_type === 'fulfillment' ||
                                             (item.tags && item.tags.includes('self_service_in'));

                    // Se não tiver inventory_id e não for por logistic_type, não é FULL
                    if (!inventoryId && !isFullByLogistic) {
                        return null;
                    }

                    // Se tem inventory_id, mas logistic_type não é fulfillment, ainda pode ser FULL
                    // (alguns itens podem ter inventory_id mesmo sem logistic_type = fulfillment? Sim, se estiver em FULL)

                    // Se não tiver inventory_id, mas logistic_type indica FULL, tentamos buscar o inventory_id via outra forma?
                    // Na prática, se logistic_type é fulfillment, deve ter inventory_id. Se não tiver, talvez o item não esteja ativo em FULL.
                    // Vamos considerar que se não tiver inventory_id, não conseguimos consultar estoque, então descartamos.
                    if (!inventoryId) {
                        console.warn(`⚠️ Item ${itemId} parece FULL (logistic_type=fulfillment) mas não possui inventory_id. Descartado.`);
                        return null;
                    }

                    totalFull++;

                    // ===== CONSULTA ESTOQUE FULL =====
                    // Usa o endpoint /inventories/{inventory_id}/stock/fulfillment
                    const stockUrl = `https://api.mercadolibre.com/inventories/${inventoryId}/stock/fulfillment`;
                    const stockProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(stockUrl)}&token=${encodeURIComponent(token)}`;
                    const stockResp = await fetch(stockProxy);
                    let stockFull = 0;
                    if (stockResp.ok) {
                        const stockData = await stockResp.json();
                        stockFull = stockData.available_quantity || 0;
                    } else {
                        // Fallback: tenta via user-products/stock
                        console.warn(`Falha ao buscar estoque para inventory ${inventoryId}, tentando user-products...`);
                        // Buscar user_product_id
                        let userProductId = item.user_product_id;
                        if (!userProductId && item.variations && item.variations.length > 0) {
                            const v = item.variations.find(v => v.user_product_id);
                            if (v) userProductId = v.user_product_id;
                        }
                        if (userProductId) {
                            const upStockUrl = `https://api.mercadolibre.com/user-products/${userProductId}/stock`;
                            const upStockProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(upStockUrl)}&token=${encodeURIComponent(token)}`;
                            const upResp = await fetch(upStockProxy);
                            if (upResp.ok) {
                                const upData = await upResp.json();
                                const loc = upData.locations?.find(l => l.type === 'meli_facility');
                                if (loc) stockFull = loc.quantity || 0;
                            }
                        }
                    }

                    // ===== VENDAS DOS ÚLTIMOS 3 MESES =====
                    const threeMonthsAgo = new Date();
                    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
                    const dateFrom = threeMonthsAgo.toISOString().split('T')[0];
                    // Busca orders com filtro por item (e status=paid)
                    const ordersUrl = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&item=${itemId}&status=paid&date_created.from=${dateFrom}&limit=50`;
                    const ordersProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(ordersUrl)}&token=${encodeURIComponent(token)}`;
                    const ordersResp = await fetch(ordersProxy);
                    let totalVendido = 0;
                    let ultimaVenda = null;
                    if (ordersResp.ok) {
                        const ordersData = await ordersResp.json();
                        const results = ordersData.results || [];
                        results.forEach(order => {
                            if (order.order_items) {
                                order.order_items.forEach(oi => {
                                    totalVendido += oi.quantity || 0;
                                });
                            }
                        });
                        if (results.length > 0) {
                            const last = results.reduce((a, b) => new Date(a.date_created) > new Date(b.date_created) ? a : b);
                            ultimaVenda = last.date_created;
                        }
                    }

                    const mediaMensal = totalVendido / 3;
                    const diasSemVenda = ultimaVenda ? Math.floor((Date.now() - new Date(ultimaVenda).getTime()) / (1000*60*60*24)) : null;
                    const status = (stockFull > mediaMensal) ? 'excesso' :
                                   (diasSemVenda !== null && diasSemVenda >= 30) ? 'sem_venda' :
                                   'ok';

                    // SKU: prefere seller_sku da variação ou do item
                    let sku = item.seller_sku || 'N/A';
                    if (item.variations && item.variations.length > 0) {
                        const varWithSku = item.variations.find(v => v.seller_sku);
                        if (varWithSku) sku = varWithSku.seller_sku;
                    }

                    return {
                        id: itemId,
                        titulo: item.title || 'Sem título',
                        sku: sku,
                        mlb: itemId,
                        estoque_full: stockFull,
                        media_vendas: mediaMensal,
                        dias_sem_venda: diasSemVenda,
                        ultima_venda: ultimaVenda,
                        status: status,
                        inventory_id: inventoryId,
                        user_product_id: item.user_product_id || null
                    };
                } catch (err) {
                    console.warn(`Erro ao processar item ${itemId}:`, err.message);
                    return null;
                }
            });

            const batchResults = await Promise.all(promises);
            const valid = batchResults.filter(r => r !== null);
            fullItems.push(...valid);

            console.log(`📦 Lote ${i/batchSize + 1}: ${valid.length} FULL encontrados. Total até agora: ${fullItems.length}`);

            if (i + batchSize < itemIds.length) {
                await new Promise(resolve => setTimeout(resolve, 1500)); // espera 1.5s entre lotes
            }
        }

        console.log(`✅ ${fullItems.length} produtos FULL processados.`);
        fullData = fullItems;

        await salvarHistoricoFull(fullItems);

        renderizarFull();
        atualizarResumoFull();

        if (fullItems.length === 0) {
            window.showToast('Nenhum produto FULL encontrado. Verifique se há itens com convivência Full/Flex ativos.', 'info');
        } else {
            window.showToast(`✅ Sincronização concluída: ${fullItems.length} produtos FULL analisados.`, 'success');
        }

    } catch (error) {
        console.error('❌ Erro na sincronização FULL:', error);
        window.showToast('Erro: ' + error.message, 'error');
    } finally {
        fullSyncInProgress = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizar Agora';
        }
    }
}
    // ============================================================
    // SALVAR HISTÓRICO NO SUPABASE
    // ============================================================
    async function salvarHistoricoFull(dados) {
    try {
        if (!window.supabaseClient) return;

        const total = dados.length;
        const excesso = dados.filter(d => d.status === 'excesso').length;
        const semVenda = dados.filter(d => d.status === 'sem_venda').length;

        const registro = {
            user_id: window.currentUser?.username || 'sistema',
            sync_date: new Date().toISOString(),
            dados: JSON.stringify(dados),
            total_produtos: total,
            excesso_estoque: excesso,
            sem_venda_30dias: semVenda
        };

        const { error } = await window.supabaseClient
            .from('full_analysis_history')
            .insert([registro]);

        if (error) {
            console.error('Erro ao salvar histórico:', error);
            if (error.code === 'PGRST204') {
                window.showToast('❌ A tabela full_analysis_history não possui a coluna "dados". Execute o SQL de criação no Supabase.', 'error');
            }
        } else {
            console.log('✅ Histórico salvo com sucesso.');
        }
    } catch (error) {
        console.error('Erro ao salvar histórico:', error);
    }
}

async function criarTabelaHistorico() {
    try {
        if (!window.supabaseClient) return;
        const { error } = await window.supabaseClient
            .from('full_analysis_history')
            .select('id')
            .limit(1);

        if (error && error.code === '42P01') {
            console.warn('⚠️ A tabela full_analysis_history não existe. Crie-a com:');
            console.log(`
                CREATE TABLE full_analysis_history (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT,
                    sync_date TIMESTAMP DEFAULT NOW(),
                    dados JSONB,
                    total_produtos INTEGER,
                    excesso_estoque INTEGER,
                    sem_venda_30dias INTEGER
                );
            `);
            window.showToast('A tabela de histórico não existe. Crie-a no Supabase.', 'warning');
        }
    } catch (error) {
        console.error('Erro ao verificar tabela:', error);
    }
}

    // ============================================================
    // CARREGAR HISTÓRICO
    // ============================================================
    async function carregarHistoricoFull() {
        try {
            if (!window.supabaseClient) {
                console.warn('Supabase não disponível');
                return;
            }

            const { data, error } = await window.supabaseClient
                .from('full_analysis_history')
                .select('*')
                .order('sync_date', { ascending: false })
                .limit(30);

            if (error) throw error;

            const tbody = document.getElementById('fullHistoricoBody');
            if (!tbody) return;

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum histórico disponível.</td></tr>';
                return;
            }

            tbody.innerHTML = data.map(row => `
                <tr>
                    <td>${new Date(row.sync_date).toLocaleString('pt-BR')}</td>
                    <td>${row.total_produtos}</td>
                    <td>${row.excesso_estoque}</td>
                    <td>${row.sem_venda_30dias}</td>
                    <td>
                        <button class="btn btn-sm btn-info" onclick="verHistoricoDia('${row.id}')">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `).join('');

        } catch (error) {
            console.error('Erro ao carregar histórico:', error);
        }
    }

    // ============================================================
    // VISUALIZAR HISTÓRICO DE UM DIA
    // ============================================================
    async function verHistoricoDia(historyId) {
        try {
            if (!window.supabaseClient) return;

            const { data, error } = await window.supabaseClient
                .from('full_analysis_history')
                .select('*')
                .eq('id', historyId)
                .single();

            if (error) throw error;

            const dados = JSON.parse(data.dados || '[]');
            if (!dados || dados.length === 0) {
                window.showToast('Nenhum dado nessa data.', 'info');
                return;
            }

            let html = `<div style="max-height:400px; overflow-y:auto;">
                <table class="table table-sm">
                    <thead><tr><th>Título</th><th>SKU</th><th>Estoque</th><th>Média</th><th>Dias sem venda</th><th>Status</th></tr></thead>
                    <tbody>`;
            dados.forEach(p => {
                const statusMap = {
                    'excesso': '<span class="badge badge-danger">Excesso</span>',
                    'sem_venda': '<span class="badge badge-warning">+30 dias</span>',
                    'ok': '<span class="badge badge-success">OK</span>'
                };
                html += `<tr>
                    <td>${p.titulo || 'N/A'}</td>
                    <td>${p.sku || 'N/A'}</td>
                    <td>${p.estoque_full || 0}</td>
                    <td>${p.media_vendas?.toFixed(1) || 0}</td>
                    <td>${p.dias_sem_venda !== null ? p.dias_sem_venda : 'N/A'}</td>
                    <td>${statusMap[p.status] || 'N/A'}</td>
                </tr>`;
            });
            html += `</tbody></table></div>`;

            if (typeof window.showModalDialog === 'function') {
                window.showModalDialog(`Histórico - ${new Date(data.sync_date).toLocaleString('pt-BR')}`, html);
            } else {
                alert('Visualização em modal não disponível.');
            }

        } catch (error) {
            console.error('Erro ao carregar histórico do dia:', error);
            window.showToast('Erro ao carregar histórico.', 'error');
        }
    }

    // ============================================================
    // RENDERIZAR TABELA FULL
    // ============================================================
    function renderizarFull() {
        const tbody = document.getElementById('fullTableBody');
        const contagem = document.getElementById('fullContagem');
        if (!tbody) return;

        let dadosFiltrados = [...fullData];

        if (fullFilter === 'excesso') {
            dadosFiltrados = dadosFiltrados.filter(d => d.status === 'excesso');
        } else if (fullFilter === 'sem_venda') {
            dadosFiltrados = dadosFiltrados.filter(d => d.status === 'sem_venda');
        } else if (fullFilter === 'ok') {
            dadosFiltrados = dadosFiltrados.filter(d => d.status === 'ok');
        }

        const busca = document.getElementById('buscaFull')?.value?.trim().toLowerCase() || '';
        if (busca) {
            dadosFiltrados = dadosFiltrados.filter(d =>
                (d.titulo && d.titulo.toLowerCase().includes(busca)) ||
                (d.sku && d.sku.toLowerCase().includes(busca)) ||
                (d.mlb && d.mlb.toLowerCase().includes(busca))
            );
        }

        if (dadosFiltrados.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5">Nenhum produto encontrado.</td></tr>`;
            if (contagem) contagem.textContent = '0';
            return;
        }

        tbody.innerHTML = dadosFiltrados.map(p => {
            const statusBadge = p.status === 'excesso' ? '<span class="badge badge-danger">Excesso</span>' :
                                p.status === 'sem_venda' ? '<span class="badge badge-warning">+30 dias</span>' :
                                '<span class="badge badge-success">OK</span>';
            return `<tr>
                <td>${p.titulo || 'N/A'}</td>
                <td><code>${p.sku || 'N/A'}</code></td>
                <td><code>${p.mlb || 'N/A'}</code></td>
                <td>${p.estoque_full || 0}</td>
                <td>${p.media_vendas ? p.media_vendas.toFixed(1) : '0'}</td>
                <td>${p.dias_sem_venda !== null ? p.dias_sem_venda : 'N/A'}</td>
                <td>${statusBadge}</td>
            </tr>`;
        }).join('');

        if (contagem) contagem.textContent = dadosFiltrados.length;
    }

    // ============================================================
    // ATUALIZAR RESUMO
    // ============================================================
    function atualizarResumoFull() {
        const total = fullData.length;
        const excesso = fullData.filter(d => d.status === 'excesso').length;
        const semVenda = fullData.filter(d => d.status === 'sem_venda').length;

        document.getElementById('fullTotalProdutos').textContent = total;
        document.getElementById('fullExcessoEstoque').textContent = excesso;
        document.getElementById('fullSemVenda30').textContent = semVenda;
    }

    // ============================================================
    // FILTRAR
    // ============================================================
    function filtrarFull(filtro) {
        if (filtro) {
            fullFilter = filtro;
            document.querySelectorAll('#fullSystem .btn[data-filtro]').forEach(btn => {
                btn.classList.remove('btn-primary', 'active');
                btn.classList.add('btn-outline-secondary');
            });
            const btnAtivo = document.querySelector(`#fullSystem .btn[data-filtro="${filtro}"]`);
            if (btnAtivo) {
                btnAtivo.classList.remove('btn-outline-secondary');
                btnAtivo.classList.add('btn-primary', 'active');
            }
        }
        renderizarFull();
    }

    // ============================================================
    // EXPORTAR PLANILHA COM TÍTULOS
    // ============================================================
    function exportarFullExcel() {
        if (!fullData || fullData.length === 0) {
            window.showToast('Nenhum dado para exportar.', 'warning');
            return;
        }

        const dadosExcel = fullData.map(p => ({
            'Título': p.titulo || '',
            'SKU': p.sku || '',
            'MLB': p.mlb || '',
            'Estoque Full': p.estoque_full || 0,
            'Média Vendas (3m)': p.media_vendas ? p.media_vendas.toFixed(1) : 0,
            'Dias sem venda': p.dias_sem_venda !== null ? p.dias_sem_venda : 'N/A',
            'Status': p.status === 'excesso' ? 'Excesso' : (p.status === 'sem_venda' ? '+30 dias' : 'OK')
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(dadosExcel);
        XLSX.utils.book_append_sheet(wb, ws, 'Full');
        XLSX.writeFile(wb, `full_analysis_${new Date().toISOString().slice(0,10)}.xlsx`);
        window.showToast('Planilha exportada com sucesso!', 'success');
    }

    // ============================================================
    // CARREGAR ÚLTIMA SINCRONIZAÇÃO DO BANCO
    // ============================================================
    async function carregarUltimaSincronizacao() {
        try {
            if (!window.supabaseClient) return;

            const { data, error } = await window.supabaseClient
                .from('full_analysis_history')
                .select('dados')
                .order('sync_date', { ascending: false })
                .limit(1);

            if (error) throw error;
            if (data && data.length > 0 && data[0].dados) {
                fullData = JSON.parse(data[0].dados);
                renderizarFull();
                atualizarResumoFull();
                console.log(`📂 Última sincronização carregada: ${fullData.length} produtos.`);
            } else {
                fullData = [];
                renderizarFull();
            }
        } catch (error) {
            console.error('Erro ao carregar última sincronização:', error);
        }
    }

    // ============================================================
    // INICIALIZAÇÃO
    // ============================================================
    async function inicializarFull() {
        console.log('📊 Inicializando módulo FULL...');
        await carregarUltimaSincronizacao();
        await carregarHistoricoFull();
        atualizarResumoFull();
    }

    // ============================================================
    // EXPORTAÇÕES GLOBAIS
    // ============================================================
    window.sincronizarFull = sincronizarFull;
    window.filtrarFull = filtrarFull;
    window.exportarFullExcel = exportarFullExcel;
    window.carregarHistoricoFull = carregarHistoricoFull;
    window.verHistoricoDia = verHistoricoDia;
    window.inicializarFull = inicializarFull;
    window.carregarUltimaSincronizacao = carregarUltimaSincronizacao;

    // Iniciar automaticamente quando o sistema estiver pronto
    document.addEventListener('DOMContentLoaded', function() {
        const checkReady = setInterval(() => {
            if (window.supabaseClient && window.currentUser) {
                clearInterval(checkReady);
                inicializarFull();
            }
        }, 500);
    });

    console.log('✅ Módulo FULL Analysis carregado.');
})();