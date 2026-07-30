// ============================================================
// MÓDULO: GERENCIAMENTO DE PROMOÇÕES (Mercado Livre) - VERSÃO COMPLETA
// ============================================================

(function() {
    'use strict';

    // ------------------------------------------------------------
    // VARIÁVEIS GLOBAIS
    // ------------------------------------------------------------
    let promocoes = [];
    let itensPromocao = [];
    let currentPromotionId = null;
    let currentPromotionType = null;
    let searchAfter = null;
    let isLoadingItens = false;
    let hasMoreItens = true;
    let containerPromocoes = null;

    let todasPromocoes = [];
    let itensPromocaoOrigem = [];
    let itensFiltrados = [];
    let mlbsBloqueados = [];
    let mlbsBloqueadosAutomaticos = [];
    let mlbsBloqueadosManuais = [];
    let bulkSystemContainer = null;
    let isLoadingOrigem = false;
    let totalItensCarregados = 0;
    let metodoUsado = '';

    // Chaves para localStorage
    const STORAGE_KEY = 'mlbs_bloqueados_promocao';
    const STORAGE_KEY_MANUAL = 'mlbs_bloqueados_manual';
    const STORAGE_KEY_AUTO = 'mlbs_bloqueados_auto';
    const SELLER_ITEMS_CACHE_KEY = 'seller_items_cache';
    
    // Configuração
    const DIAS_BLOQUEIO_AUTOMATICO = 40;

    // ============================================================
    // FUNÇÃO DE LOG
    // ============================================================
    function log(msg, type = 'info', data = null) {
        const prefix = '📢 [PROMOÇÕES]';
        const timestamp = new Date().toLocaleTimeString();
        
        switch(type) {
            case 'info':
                console.log(`${prefix} ${timestamp} ℹ️ ${msg}`, data || '');
                break;
            case 'success':
                console.log(`${prefix} ${timestamp} ✅ ${msg}`, data || '');
                break;
            case 'warning':
                console.log(`${prefix} ${timestamp} ⚠️ ${msg}`, data || '');
                break;
            case 'error':
                console.error(`${prefix} ${timestamp} ❌ ${msg}`, data || '');
                break;
            case 'debug':
                console.debug(`${prefix} ${timestamp} 🔍 ${msg}`, data || '');
                break;
            default:
                console.log(`${prefix} ${timestamp} ${msg}`, data || '');
        }
    }

    // ============================================================
    // BARRA DE PROGRESSO VISUAL
    // ============================================================
    function criarBarraProgresso() {
        let barraContainer = document.getElementById('progressoContainer');
        if (barraContainer) {
            barraContainer.style.display = 'block';
            return barraContainer;
        }

        barraContainer = document.createElement('div');
        barraContainer.id = 'progressoContainer';
        barraContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
        `;

        barraContainer.innerHTML = `
            <div style="
                background: white;
                border-radius: 16px;
                padding: 40px 50px;
                max-width: 600px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                text-align: center;
            ">
                <div style="margin-bottom: 20px;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 48px; color: #00ADEE;"></i>
                </div>
                <h3 id="progressoTitulo" style="margin: 0 0 10px 0; color: #343a40; font-size: 18px;">
                    Carregando...
                </h3>
                <p id="progressoSubtitulo" style="margin: 0 0 20px 0; color: #6c757d; font-size: 14px;">
                    Aguarde enquanto os dados são processados
                </p>
                
                <div style="
                    width: 100%;
                    height: 12px;
                    background: #e9ecef;
                    border-radius: 10px;
                    overflow: hidden;
                    margin-bottom: 15px;
                ">
                    <div id="barraProgressoFill" style="
                        width: 0%;
                        height: 100%;
                        background: linear-gradient(90deg, #00ADEE, #80D6F7);
                        border-radius: 10px;
                        transition: width 0.5s ease;
                    "></div>
                </div>
                
                <div style="display: flex; justify-content: space-between; font-size: 13px; color: #6c757d;">
                    <span id="progressoPorcentagem">0%</span>
                    <span id="progressoDetalhes">0 / 0</span>
                </div>
                
                <button onclick="fecharBarraProgresso()" style="
                    margin-top: 20px;
                    padding: 8px 20px;
                    border: 1px solid #dc3545;
                    background: none;
                    color: #dc3545;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                ">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            </div>
        `;

        document.body.appendChild(barraContainer);
        return barraContainer;
    }

    function atualizarProgresso(percentual, titulo, subtitulo, detalhes) {
        const barraContainer = document.getElementById('progressoContainer');
        if (!barraContainer) return;

        const fill = document.getElementById('barraProgressoFill');
        const porcentagem = document.getElementById('progressoPorcentagem');
        const detalhesEl = document.getElementById('progressoDetalhes');
        const tituloEl = document.getElementById('progressoTitulo');
        const subtituloEl = document.getElementById('progressoSubtitulo');

        if (fill) {
            const p = Math.min(Math.max(percentual, 0), 100);
            fill.style.width = p + '%';
            if (p < 30) {
                fill.style.background = 'linear-gradient(90deg, #ffc107, #ff9800)';
            } else if (p < 70) {
                fill.style.background = 'linear-gradient(90deg, #00ADEE, #80D6F7)';
            } else {
                fill.style.background = 'linear-gradient(90deg, #28a745, #20c997)';
            }
        }
        if (porcentagem) porcentagem.textContent = Math.round(percentual) + '%';
        if (detalhesEl) detalhesEl.textContent = detalhes || '';
        if (tituloEl) tituloEl.textContent = titulo || 'Carregando...';
        if (subtituloEl) subtituloEl.textContent = subtitulo || 'Aguarde...';
    }

    function fecharBarraProgresso() {
        const barraContainer = document.getElementById('progressoContainer');
        if (barraContainer) {
            barraContainer.style.display = 'none';
        }
    }

    function mostrarBarraProgresso(titulo = 'Carregando...', subtitulo = 'Aguarde...') {
        const container = criarBarraProgresso();
        atualizarProgresso(0, titulo, subtitulo, 'Iniciando...');
        return container;
    }

    // ============================================================
    // FUNÇÃO PARA BUSCAR DATA DE CRIAÇÃO DE UM MLB
    // ============================================================
    async function buscarDataCriacaoMLB(itemId, token) {
        try {
            const url = `https://api.mercadolibre.com/items/${itemId}`;
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
            const response = await fetch(proxyUrl);
            
            if (response.ok) {
                const data = await response.json();
                return data.start_time || data.date_created || null;
            }
            return null;
        } catch (error) {
            log(`Erro ao buscar data de criação do MLB ${itemId}: ${error.message}`, 'warning');
            return null;
        }
    }

    // ============================================================
    // FUNÇÃO PARA CALCULAR DIAS ENTRE DUAS DATAS
    // ============================================================
    function calcularDiasEntreDatas(dataInicio, dataFim = new Date()) {
        const inicio = new Date(dataInicio);
        const fim = new Date(dataFim);
        const diffTime = Math.abs(fim - inicio);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }

    // ============================================================
    // FUNÇÃO PARA BUSCAR PREÇO DE VENDA ATUAL DE UM ITEM
    // ============================================================
    async function buscarPrecoVendaItem(itemId, token) {
        try {
            const url = `https://api.mercadolibre.com/items/${itemId}/sale_price?context=channel_marketplace`;
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
            const response = await fetch(proxyUrl);
            if (response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            log(`Erro ao buscar preço do item ${itemId}: ${error.message}`, 'warning');
            return null;
        }
    }

async function buscarItensPromocaoComPrecos(promotionId, promotionType, token) {
    const itens = [];
    let searchAfterLocal = null;
    let hasMore = true;
    let page = 1;
    let totalItensAPI = 0;
    let startTime = Date.now();
    
    log(`🔍 Buscando itens da promoção ${promotionId} (${promotionType})...`, 'info');
    console.log(`🔄 [${new Date().toLocaleTimeString()}] Iniciando busca na promoção: ${promotionId}`);
    
    // Primeiro, tenta obter o total de itens
    try {
        let urlTotal = `https://api.mercadolibre.com/seller-promotions/promotions/${promotionId}/items`;
        let paramsTotal = {
            promotion_type: promotionType,
            app_version: 'v2',
            limit: 1
        };
        const queryStringTotal = Object.keys(paramsTotal)
            .map(key => `${key}=${encodeURIComponent(paramsTotal[key])}`)
            .join('&');
        const fullUrlTotal = `${urlTotal}?${queryStringTotal}`;
        const proxyUrlTotal = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(fullUrlTotal)}&token=${token}`;
        const responseTotal = await fetch(proxyUrlTotal);
        if (responseTotal.ok) {
            const dataTotal = await responseTotal.json();
            totalItensAPI = dataTotal.paging?.total || 0;
            log(`📊 Total de itens na promoção: ${totalItensAPI}`, 'info');
        }
    } catch (e) {
        log('⚠️ Não foi possível obter o total de itens', 'warning');
    }
    
    // Buscar todos os itens em paralelo (páginas)
    const pagePromises = [];
    let currentSearchAfter = null;
    let hasMorePages = true;
    
    // Limite de páginas para evitar loop infinito
    const MAX_PAGES = 50;
    
    while (hasMorePages && page <= MAX_PAGES) {
        try {
            let url = `https://api.mercadolibre.com/seller-promotions/promotions/${promotionId}/items`;
            let params = {
                promotion_type: promotionType,
                app_version: 'v2',
                limit: 50
            };
            
            if (currentSearchAfter) {
                params.search_after = currentSearchAfter;
            }
            
            const queryString = Object.keys(params)
                .map(key => `${key}=${encodeURIComponent(params[key])}`)
                .join('&');
            const fullUrl = `${url}?${queryString}`;
            
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(fullUrl)}&token=${token}`;
            
            // Adicionar a promise à lista para executar em paralelo
            pagePromises.push(
                fetch(proxyUrl)
                    .then(response => response.json())
                    .then(data => {
                        const results = data.results || [];
                        const paging = data.paging || {};
                        const searchAfterValue = paging.searchAfter;
                        
                        return {
                            results: results,
                            searchAfter: searchAfterValue,
                            page: page
                        };
                    })
                    .catch(err => {
                        console.error(`❌ Erro na página ${page}:`, err);
                        return { results: [], searchAfter: null, page: page, error: err };
                    })
            );
            
            // Verificar se há mais páginas
            if (!currentSearchAfter) {
                // Na primeira página, precisamos fazer a requisição para saber o searchAfter
                // Mas como estamos fazendo em paralelo, vamos pegar o searchAfter da resposta
                // e continuar se houver
                const tempResponse = await fetch(proxyUrl);
                if (tempResponse.ok) {
                    const tempData = await tempResponse.json();
                    const paging = tempData.paging || {};
                    const searchAfterValue = paging.searchAfter;
                    if (searchAfterValue) {
                        currentSearchAfter = searchAfterValue;
                        hasMorePages = true;
                        page++;
                    } else {
                        hasMorePages = false;
                    }
                } else {
                    hasMorePages = false;
                }
            } else {
                // Se já temos searchAfter, continuamos
                // Precisamos saber se a página atual trouxe resultados
                // Isso será verificado depois
                page++;
            }
            
            // Limitar o número de páginas para evitar sobrecarga
            if (page > 20) {
                log(`⚠️ Limitando a 20 páginas para evitar sobrecarga`, 'warning');
                hasMorePages = false;
            }
            
        } catch (error) {
            log(`❌ Erro na página ${page}: ${error.message}`, 'error');
            hasMorePages = false;
        }
    }
    
    // Aguardar todas as requisições em paralelo
    console.log(`⏳ Aguardando ${pagePromises.length} requisições em paralelo...`);
    const startParallel = Date.now();
    const allResults = await Promise.all(pagePromises);
    const elapsedParallel = ((Date.now() - startParallel) / 1000);
    console.log(`✅ ${pagePromises.length} páginas carregadas em ${elapsedParallel.toFixed(1)}s`);
    
    // Processar resultados
    let totalItems = 0;
    for (const result of allResults) {
        if (result.results && result.results.length > 0) {
            totalItems += result.results.length;
            
            // Processar cada item sem buscar preço de venda (otimização)
            for (const item of result.results) {
                itens.push({
                    id: item.id || item.item_id,
                    status: item.status || 'unknown',
                    price: item.price || 0,
                    original_price: item.original_price || 0,
                    min_discounted_price: item.min_discounted_price || null,
                    max_discounted_price: item.max_discounted_price || null,
                    suggested_discounted_price: item.suggested_discounted_price || null,
                    meli_percentage: item.meli_percentage || 0,
                    seller_percentage: item.seller_percentage || 0,
                    boosted_offer: item.boosted_offer || false,
                    discount_meli_boosted_percentage: item.discount_meli_boosted_percentage || 0,
                    ref_id: item.ref_id || '',
                    current_sale_price: null, // Não buscamos para acelerar
                    current_regular_price: null,
                });
            }
        }
    }
    
    const totalTime = ((Date.now() - startTime) / 1000);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ [${new Date().toLocaleTimeString()}] BUSCA CONCLUÍDA!`);
    console.log(`   Total de itens: ${itens.length}`);
    console.log(`   Páginas: ${allResults.length}`);
    console.log(`   Tempo total: ${totalTime.toFixed(1)}s`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    log(`✅ ${itens.length} itens carregados da promoção ${promotionId} em ${totalTime.toFixed(1)}s`, 'success');
    return itens;
}

    // ============================================================
    // FUNÇÃO PARA VERIFICAR E BLOQUEAR MLBs POR IDADE
    // ============================================================
    async function verificarEBloquearMLBsPorIdade(mlbs, token) {
        const mlbsBloqueadosPorIdade = [];
        let processados = 0;
        const total = mlbs.length;

        mostrarBarraProgresso(
            `Verificando ${total} MLBs`,
            `Bloqueando MLBs com menos de ${DIAS_BLOQUEIO_AUTOMATICO} dias`
        );

        log(`🔍 Verificando idade de ${total} MLBs (bloqueia com < ${DIAS_BLOQUEIO_AUTOMATICO} dias)...`, 'info');

        const batchSize = 10;
        for (let i = 0; i < mlbs.length; i += batchSize) {
            const batch = mlbs.slice(i, i + batchSize);
            
            const promises = batch.map(async (mlb) => {
                try {
                    const dataCriacao = await buscarDataCriacaoMLB(mlb, token);
                    if (dataCriacao) {
                        const dias = calcularDiasEntreDatas(dataCriacao);
                        if (dias < DIAS_BLOQUEIO_AUTOMATICO) {
                            log(`🔒 MLB ${mlb} bloqueado automaticamente (criado há ${dias} dias)`, 'warning');
                            return { mlb, dias, dataCriacao };
                        }
                    }
                    return null;
                } catch (error) {
                    log(`Erro ao verificar MLB ${mlb}: ${error.message}`, 'warning');
                    return null;
                }
            });

            const resultados = await Promise.all(promises);
            const validos = resultados.filter(r => r !== null);
            mlbsBloqueadosPorIdade.push(...validos);
            
            processados += batch.length;
            
            const progresso = (processados / total) * 100;
            const encontrados = mlbsBloqueadosPorIdade.length;
            atualizarProgresso(
                Math.min(progresso, 99),
                `Verificando MLBs (${Math.round(progresso)}%)`,
                `${encontrados} MLBs bloqueados até agora`,
                `${processados} / ${total} verificados`
            );
            
            if (processados % 50 === 0 || processados === total) {
                log(`📊 Verificados ${processados}/${total} MLBs, ${mlbsBloqueadosPorIdade.length} bloqueados por idade`, 'info');
            }
        }

        const mlbsBloqueados = mlbsBloqueadosPorIdade.map(item => item.mlb);
        
        atualizarProgresso(100, '✅ Verificação concluída!', `${mlbsBloqueados.length} MLBs bloqueados`, '✅ Concluído');
        setTimeout(fecharBarraProgresso, 1000);
        
        log(`✅ ${mlbsBloqueados.length} MLBs bloqueados automaticamente por idade (< ${DIAS_BLOQUEIO_AUTOMATICO} dias)`, 'success');
        
        localStorage.setItem(STORAGE_KEY_AUTO, JSON.stringify({
            mlbs: mlbsBloqueados,
            dataAtualizacao: new Date().toISOString(),
            diasBloqueio: DIAS_BLOQUEIO_AUTOMATICO
        }));

        return mlbsBloqueados;
    }

    // ============================================================
    // FUNÇÃO PARA BUSCAR TODOS OS MLBs ATIVOS
    // ============================================================
    async function buscarTodosMLBsAtivos(token) {
        log('📦 Buscando MLBs ativos para verificação...', 'info');
        
        mostrarBarraProgresso('Buscando MLBs ativos', 'Carregando lista de anúncios...');
        atualizarProgresso(5, 'Buscando MLBs ativos', 'Verificando cache...', 'Iniciando busca');
        
        const cached = localStorage.getItem(SELLER_ITEMS_CACHE_KEY);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                const cacheTime = data.timestamp || 0;
                const cacheAge = Date.now() - cacheTime;
                if (cacheAge < 1800000) {
                    log(`📦 Usando cache de MLBs: ${data.items.length} itens`, 'info');
                    atualizarProgresso(100, 'MLBs carregados do cache', `${data.items.length} itens encontrados`, '✅ Concluído');
                    setTimeout(fecharBarraProgresso, 500);
                    return data.items;
                }
            } catch (e) {
                log('Erro ao ler cache', 'warning');
            }
        }

        const userId = '415176739';
        const allItems = [];
        let offset = 0;
        const limit = 100;
        let hasMore = true;
        let totalProcessados = 0;
        let page = 1;
        const MAX_OFFSET = 1000;
        let totalItems = 0;

        try {
            const url = `https://api.mercadolibre.com/users/${userId}/items/search?limit=1&offset=0`;
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
            const response = await fetch(proxyUrl);
            if (response.ok) {
                const data = await response.json();
                totalItems = data.paging?.total || 0;
                log(`📊 Total de itens encontrados: ${totalItems}`, 'info');
            }
        } catch (e) {
            log('Erro ao buscar total de itens', 'warning');
        }

        showToast('📦 Buscando lista de anúncios ativos...', 'info');

        while (hasMore && offset <= MAX_OFFSET) {
            try {
                const url = `https://api.mercadolibre.com/users/${userId}/items/search?limit=${limit}&offset=${offset}&order_by=id_desc`;
                log(`Buscando página ${page} (offset: ${offset})...`, 'debug');
                
                const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
                const response = await fetch(proxyUrl);
                
                if (!response.ok) {
                    if (response.status === 400) {
                        log(`Offset ${offset} retornou 400, finalizando busca`, 'warning');
                        hasMore = false;
                        break;
                    }
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                const items = data.results || [];
                
                if (items.length === 0) {
                    hasMore = false;
                    break;
                }

                const progresso = totalItems > 0 ? (offset / totalItems) * 100 : (page / 20) * 100;
                const titulo = `Buscando MLBs (Página ${page})`;
                const subtitulo = `Processando itens da página ${page}`;
                atualizarProgresso(
                    Math.min(progresso, 95),
                    titulo,
                    subtitulo,
                    `${totalProcessados} itens processados`
                );

                const itemsProcessados = [];
                for (const itemId of items) {
                    try {
                        const detailUrl = `https://api.mercadolibre.com/items/${itemId}`;
                        const detailProxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(detailUrl)}&token=${token}`;
                        const detailResponse = await fetch(detailProxyUrl);
                        if (detailResponse.ok) {
                            const detail = await detailResponse.json();
                            if (detail.status === 'active') {
                                itemsProcessados.push({ 
                                    id: itemId, 
                                    title: detail.title || 'Sem título',
                                    start_time: detail.start_time || detail.date_created
                                });
                            }
                        }
                    } catch (err) {
                        log(`Erro ao buscar detalhe do item ${itemId}: ${err.message}`, 'warning');
                    }
                }
                
                allItems.push(...itemsProcessados);
                totalProcessados += itemsProcessados.length;
                log(`Página ${page}: ${itemsProcessados.length} itens ativos (total: ${totalProcessados})`, 'info');
                
                const totalItemsAPI = data.paging?.total || 0;
                if (offset + limit >= totalItemsAPI || items.length < limit) {
                    hasMore = false;
                } else {
                    offset += limit;
                    page++;
                }
                
            } catch (error) {
                log(`Erro na página ${page}: ${error.message}`, 'error');
                hasMore = false;
            }
        }

        atualizarProgresso(100, '✅ Busca concluída!', `${allItems.length} MLBs ativos encontrados`, '✅ Concluído');
        setTimeout(fecharBarraProgresso, 1000);

        localStorage.setItem(SELLER_ITEMS_CACHE_KEY, JSON.stringify({
            items: allItems,
            timestamp: Date.now()
        }));

        log(`✅ ${allItems.length} MLBs ativos encontrados`, 'success');
        return allItems;
    }

    // ============================================================
    // FUNÇÃO PARA FORÇAR BUSCA COMPLETA DE TODOS OS MLBs
    // ============================================================
    window.forcarBuscaCompletaMLBs = async function() {
        log('🚀 Forçando busca completa de TODOS os MLBs ativos...', 'info');
        
        mostrarBarraProgresso(
            'Buscando TODOS os MLBs ativos',
            'Isso pode levar alguns minutos...'
        );
        atualizarProgresso(5, 'Iniciando busca completa', 'Preparando requisições...', '0 itens encontrados');
        
        try {
            const tokenData = await window.getValidToken?.();
            if (!tokenData?.access_token) {
                showToast('Token não disponível', 'error');
                fecharBarraProgresso();
                return;
            }

            localStorage.removeItem(SELLER_ITEMS_CACHE_KEY);
            log('🗑️ Cache antigo removido', 'info');

            const userId = '415176739';
            const allItems = [];
            let offset = 0;
            const limit = 100;
            let hasMore = true;
            let totalProcessados = 0;
            let page = 1;
            let totalEncontrados = 0;
            let totalItems = 0;

            try {
                const url = `https://api.mercadolibre.com/users/${userId}/items/search?limit=1&offset=0`;
                const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${tokenData.access_token}`;
                const response = await fetch(proxyUrl);
                if (response.ok) {
                    const data = await response.json();
                    totalItems = data.paging?.total || 0;
                    log(`📊 Total de itens encontrados: ${totalItems}`, 'info');
                    atualizarProgresso(5, `Buscando ${totalItems} anúncios`, 'Preparando requisições...', 'Iniciando busca');
                }
            } catch (e) {
                log('Erro ao buscar total de itens', 'warning');
            }

            showToast('📦 Buscando TODOS os anúncios ativos...', 'info');

            while (hasMore) {
                try {
                    const url = `https://api.mercadolibre.com/users/${userId}/items/search?limit=${limit}&offset=${offset}&order_by=id_desc`;
                    log(`Buscando página ${page} (offset: ${offset})...`, 'debug');
                    
                    const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${tokenData.access_token}`;
                    const response = await fetch(proxyUrl);
                    
                    if (!response.ok) {
                        if (response.status === 400) {
                            log(`⚠️ Offset ${offset} retornou 400, pode ser o limite máximo da API`, 'warning');
                            hasMore = false;
                            break;
                        }
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const data = await response.json();
                    const items = data.results || [];
                    const totalItemsAPI = data.paging?.total || 0;
                    
                    log(`Página ${page}: ${items.length} itens encontrados (total API: ${totalItemsAPI})`, 'info');
                    
                    if (items.length === 0) {
                        hasMore = false;
                        break;
                    }

                    const itemsProcessados = [];
                    for (const itemId of items) {
                        try {
                            const detailUrl = `https://api.mercadolibre.com/items/${itemId}`;
                            const detailProxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(detailUrl)}&token=${tokenData.access_token}`;
                            const detailResponse = await fetch(detailProxyUrl);
                            if (detailResponse.ok) {
                                const detail = await detailResponse.json();
                                if (detail.status === 'active') {
                                    itemsProcessados.push({ 
                                        id: itemId, 
                                        title: detail.title || 'Sem título',
                                        start_time: detail.start_time || detail.date_created
                                    });
                                    totalEncontrados++;
                                }
                            }
                        } catch (err) {
                            log(`Erro ao buscar detalhe do item ${itemId}: ${err.message}`, 'warning');
                        }
                    }
                    
                    allItems.push(...itemsProcessados);
                    totalProcessados += itemsProcessados.length;
                    
                    const progresso = totalItems > 0 ? (totalProcessados / totalItems) * 100 : (page / 20) * 100;
                    atualizarProgresso(
                        Math.min(progresso, 95),
                        `Buscando anúncios (Página ${page})`,
                        `${totalProcessados} itens processados`,
                        `${totalEncontrados} ativos encontrados`
                    );
                    
                    log(`Página ${page}: ${itemsProcessados.length} itens ativos (total: ${totalProcessados})`, 'info');
                    
                    showToast(`📊 Página ${page}: ${totalProcessados} itens ativos encontrados...`, 'info');
                    
                    if (offset + limit >= totalItemsAPI || items.length < limit) {
                        hasMore = false;
                        log('Todos os anúncios foram processados', 'debug');
                    } else {
                        offset += limit;
                        page++;
                    }
                    
                    if (totalProcessados > 0 && totalProcessados % 500 === 0) {
                        showToast(`📊 ${totalProcessados} itens ativos encontrados até agora...`, 'info');
                    }
                    
                } catch (error) {
                    log(`Erro na página ${page}: ${error.message}`, 'error');
                    hasMore = false;
                }
            }

            atualizarProgresso(100, '✅ Busca concluída!', `${allItems.length} MLBs ativos encontrados`, '✅ Concluído');
            setTimeout(fecharBarraProgresso, 1000);

            localStorage.setItem(SELLER_ITEMS_CACHE_KEY, JSON.stringify({
                items: allItems,
                timestamp: Date.now()
            }));

            log(`✅ ${allItems.length} MLBs ativos encontrados (total processado: ${totalProcessados})`, 'success');
            showToast(`✅ ${allItems.length} MLBs ativos encontrados!`, 'success');

            if (allItems.length > 0) {
                showToast(`🔍 Verificando ${allItems.length} MLBs para bloqueio automático...`, 'info');
                await verificarEBloquearMLBsPorIdade(
                    allItems.map(item => item.id),
                    tokenData.access_token
                );
            }

            return allItems;

        } catch (error) {
            log(`❌ Erro na busca completa: ${error.message}`, 'error');
            console.error(error);
            showToast('Erro na busca completa', 'error');
            fecharBarraProgresso();
            return [];
        }
    };

    // ============================================================
    // FUNÇÃO PARA SALVAR MLBs BLOQUEADOS MANUAIS
    // ============================================================
    window.salvarMLBsBloqueadosManuais = function() {
        try {
            const input = document.getElementById('bulkMLBsBloqueados');
            if (input) {
                const raw = input.value;
                const mlbs = raw.split(/[\s,;]+/).filter(m => m.trim().length > 0);
                mlbsBloqueadosManuais = mlbs.map(m => m.trim().toUpperCase());
            }
            
            localStorage.setItem(STORAGE_KEY_MANUAL, JSON.stringify(mlbsBloqueadosManuais));
            
            mlbsBloqueados = [...new Set([...mlbsBloqueadosManuais, ...mlbsBloqueadosAutomaticos])];
            atualizarInterfaceMLBsBloqueados();
            
            showToast(`✅ ${mlbsBloqueadosManuais.length} MLBs bloqueados manuais salvos`, 'success');
        } catch (error) {
            log(`❌ Erro ao salvar MLBs bloqueados manuais: ${error.message}`, 'error');
            showToast('Erro ao salvar MLBs bloqueados', 'error');
        }
    };

    // ============================================================
    // FUNÇÃO PARA ADICIONAR MLB BLOQUEADO
    // ============================================================
    window.adicionarMLBBloqueado = function() {
        const mlb = prompt('Digite o MLB do anúncio que deseja bloquear (ex: MLB1234567890):');
        if (!mlb) return;
        const mlbClean = mlb.trim().toUpperCase();
        
        if (!mlbsBloqueadosManuais.includes(mlbClean)) {
            mlbsBloqueadosManuais.push(mlbClean);
            window.salvarMLBsBloqueadosManuais();
            showToast(`✅ MLB ${mlbClean} adicionado à lista de bloqueados`, 'success');
        } else {
            showToast('⚠️ Este MLB já está na lista de bloqueados', 'warning');
        }
    };

    // ============================================================
    // FUNÇÃO PARA REMOVER MLB BLOQUEADO
    // ============================================================
    window.removerMLBBloqueado = function(mlb) {
        if (!confirm(`Tem certeza que deseja remover ${mlb} da lista de bloqueados?`)) return;
        
        mlbsBloqueadosManuais = mlbsBloqueadosManuais.filter(m => m !== mlb);
        window.salvarMLBsBloqueadosManuais();
        showToast(`✅ MLB ${mlb} removido da lista de bloqueados`, 'success');
    };

    // ============================================================
    // FUNÇÃO PARA LIMPAR MLBs BLOQUEADOS MANUAIS
    // ============================================================
    window.limparMLBsBloqueados = function() {
        if (!confirm('Tem certeza que deseja limpar TODOS os MLB\'s bloqueados (apenas manuais)?')) return;
        mlbsBloqueadosManuais = [];
        window.salvarMLBsBloqueadosManuais();
        showToast('✅ Todos os MLBs manuais removidos', 'success');
    };

    // ============================================================
    // FUNÇÃO PARA EXPORTAR MLBs BLOQUEADOS
    // ============================================================
    window.exportarMLBsBloqueados = function() {
        if (mlbsBloqueados.length === 0) {
            showToast('⚠️ Nenhum MLB bloqueado para exportar', 'warning');
            return;
        }
        
        const texto = mlbsBloqueados.join(' ');
        const blob = new Blob([texto], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mlbs_bloqueados_${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast(`📋 ${mlbsBloqueados.length} MLBs bloqueados exportados!`, 'success');
    };

    // ============================================================
    // FUNÇÃO PARA IMPORTAR MLBs BLOQUEADOS
    // ============================================================
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
                const mlbs = texto.split(/[\s,;\n\r\t]+/)
                    .map(m => m.trim().toUpperCase())
                    .filter(m => m.length > 0);
                
                const novos = mlbs.filter(m => !mlbsBloqueadosManuais.includes(m));
                if (novos.length > 0) {
                    mlbsBloqueadosManuais = [...mlbsBloqueadosManuais, ...novos];
                    window.salvarMLBsBloqueadosManuais();
                    showToast(`✅ ${novos.length} MLB's importados!`, 'success');
                } else {
                    showToast('⚠️ Nenhum novo MLB para importar', 'warning');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    // ============================================================
    // FUNÇÃO PARA ATUALIZAR MLBs BLOQUEADOS AUTOMATICAMENTE
    // ============================================================
    window.atualizarMLBsBloqueadosAutomaticos = async function() {
        log('🔄 Atualizando MLBs bloqueados automaticamente...', 'info');
        showToast('🔄 Buscando MLBs com menos de 40 dias...', 'info');
        
        try {
            const tokenData = await window.getValidToken?.();
            if (!tokenData?.access_token) {
                showToast('Token não disponível', 'error');
                return;
            }

            showToast('📦 Buscando todos os MLBs ativos...', 'info');
            const mlbsAtivos = await buscarTodosMLBsAtivos(tokenData.access_token);
            
            if (mlbsAtivos.length === 0) {
                showToast('⚠️ Nenhum MLB ativo encontrado', 'warning');
                return;
            }

            showToast(`🔍 Verificando ${mlbsAtivos.length} MLBs (bloqueia com < 40 dias)...`, 'info');

            const mlbsParaBloquear = [];
            let processados = 0;
            const total = mlbsAtivos.length;

            const batchSize = 10;
            for (let i = 0; i < mlbsAtivos.length; i += batchSize) {
                const batch = mlbsAtivos.slice(i, i + batchSize);
                
                const promises = batch.map(async (item) => {
                    try {
                        let dataCriacao = item.start_time;
                        if (!dataCriacao) {
                            dataCriacao = await buscarDataCriacaoMLB(item.id, tokenData.access_token);
                        }
                        
                        if (dataCriacao) {
                            const dias = calcularDiasEntreDatas(dataCriacao);
                            if (dias < 40) {
                                log(`🔒 MLB ${item.id} bloqueado (criado há ${dias} dias)`, 'warning');
                                return { mlb: item.id, dias, dataCriacao };
                            }
                        }
                        return null;
                    } catch (error) {
                        log(`Erro ao verificar MLB ${item.id}: ${error.message}`, 'warning');
                        return null;
                    }
                });

                const resultados = await Promise.all(promises);
                const validos = resultados.filter(r => r !== null);
                validos.forEach(r => mlbsParaBloquear.push(r.mlb));
                
                processados += batch.length;
                if (processados % 50 === 0 || processados === total) {
                    showToast(`📊 Verificados ${processados}/${total} MLBs, ${mlbsParaBloquear.length} bloqueados`, 'info');
                }
            }

            mlbsBloqueadosAutomaticos = mlbsParaBloquear;
            
            localStorage.setItem(STORAGE_KEY_AUTO, JSON.stringify({
                mlbs: mlbsBloqueadosAutomaticos,
                dataAtualizacao: new Date().toISOString(),
                diasBloqueio: 40
            }));

            mlbsBloqueados = [...new Set([...mlbsBloqueadosManuais, ...mlbsBloqueadosAutomaticos])];
            
            atualizarInterfaceMLBsBloqueados();
            
            showToast(`✅ ${mlbsBloqueadosAutomaticos.length} MLBs bloqueados automaticamente (menos de 40 dias)`, 'success');
            
        } catch (error) {
            log(`❌ Erro ao atualizar MLBs bloqueados: ${error.message}`, 'error');
            console.error(error);
            showToast('Erro ao atualizar MLBs bloqueados', 'error');
        }
    };

    // ============================================================
    // FUNÇÃO PARA ATUALIZAR CONTADORES
    // ============================================================
    function atualizarContadoresMLBs() {
        const contadorAuto = document.getElementById('contadorAutoMLBs');
        const contadorManual = document.getElementById('contadorManualMLBs');
        
        if (contadorAuto) {
            contadorAuto.textContent = mlbsBloqueadosAutomaticos.length;
            contadorAuto.style.backgroundColor = mlbsBloqueadosAutomaticos.length > 0 ? '#ffc107' : '#6c757d';
            contadorAuto.style.color = mlbsBloqueadosAutomaticos.length > 0 ? '#212529' : 'white';
            contadorAuto.style.padding = '3px 10px';
            contadorAuto.style.borderRadius = '12px';
            contadorAuto.style.fontSize = '12px';
        }
        
        if (contadorManual) {
            contadorManual.textContent = mlbsBloqueadosManuais.length;
            contadorManual.style.backgroundColor = mlbsBloqueadosManuais.length > 0 ? '#dc3545' : '#6c757d';
            contadorManual.style.color = 'white';
            contadorManual.style.padding = '3px 10px';
            contadorManual.style.borderRadius = '12px';
            contadorManual.style.fontSize = '12px';
        }
    }

    // ============================================================
    // FUNÇÃO PARA ATUALIZAR INTERFACE DOS MLBs BLOQUEADOS (COMPACTA)
    // ============================================================
    function atualizarInterfaceMLBsBloqueados() {
        const input = document.getElementById('bulkMLBsBloqueados');
        const lista = document.getElementById('bulkMLBsBloqueadosLista');

        if (input) {
            const manualText = mlbsBloqueadosManuais.join(' ');
            const autoCount = mlbsBloqueadosAutomaticos.length;
            
            if (autoCount > 0) {
                input.placeholder = `${manualText || 'Nenhum manual'} (${autoCount} automáticos bloqueados)`;
                input.value = manualText;
            } else {
                input.placeholder = 'Ex: MLB123 MLB456 MLB789';
                input.value = manualText;
            }
        }

        if (lista) {
            lista.innerHTML = '';
            
            if (mlbsBloqueados.length === 0) {
                lista.innerHTML = '<span class="text-muted" style="font-size: 13px;">Nenhum MLB bloqueado</span>';
                atualizarContadoresMLBs();
                return;
            }

            const container = document.createElement('div');
            container.style.cssText = `
                max-height: 120px;
                overflow-y: auto;
                background: #f8f9fa;
                border-radius: 6px;
                padding: 6px 10px;
                border: 1px solid #e9ecef;
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                align-items: flex-start;
            `;

            mlbsBloqueadosManuais.forEach(mlb => {
                const tag = document.createElement('span');
                tag.className = 'badge badge-danger';
                tag.style.cssText = `
                    padding: 2px 8px;
                    font-size: 11px;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    border-radius: 3px;
                    white-space: nowrap;
                    background: #dc3545;
                    color: white;
                    font-weight: 500;
                    flex-shrink: 0;
                `;
                tag.innerHTML = `${mlb} <i class="fas fa-times" style="cursor:pointer; font-size: 9px; opacity: 0.7;" onclick="window.removerMLBBloqueado('${mlb}')" title="Remover da lista"></i>`;
                container.appendChild(tag);
            });

            mlbsBloqueadosAutomaticos.forEach(mlb => {
                if (!mlbsBloqueadosManuais.includes(mlb)) {
                    const tag = document.createElement('span');
                    tag.className = 'badge badge-warning';
                    tag.style.cssText = `
                        padding: 2px 8px;
                        font-size: 11px;
                        display: inline-flex;
                        align-items: center;
                        gap: 4px;
                        border-radius: 3px;
                        white-space: nowrap;
                        background: #ffc107;
                        color: #212529;
                        font-weight: 500;
                        flex-shrink: 0;
                    `;
                    tag.innerHTML = `${mlb}`;
                    container.appendChild(tag);
                }
            });

            const totalTag = document.createElement('span');
            totalTag.style.cssText = `
                padding: 2px 10px;
                font-size: 11px;
                border-radius: 3px;
                background: #e9ecef;
                color: #495057;
                font-weight: 600;
                flex-shrink: 0;
            `;
            totalTag.textContent = `${mlbsBloqueados.length} total`;
            container.appendChild(totalTag);

            lista.appendChild(container);

            const legenda = document.createElement('div');
            legenda.style.cssText = `
                margin-top: 4px;
                font-size: 10px;
                color: #6c757d;
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
            `;
            legenda.innerHTML = `
                <span>🔴 Manual (clique no X para remover)</span>
                <span>🟡 Automático (< 40 dias)</span>
            `;
            lista.appendChild(legenda);
        }

        atualizarContadoresMLBs();
    }

    // ============================================================
    // FUNÇÃO PARA CARREGAR MLBs BLOQUEADOS (APENAS CACHE)
    // ============================================================
    function carregarMLBsBloqueadosApenasCache() {
        try {
            const savedManual = localStorage.getItem(STORAGE_KEY_MANUAL);
            if (savedManual) {
                try {
                    mlbsBloqueadosManuais = JSON.parse(savedManual);
                    log(`${mlbsBloqueadosManuais.length} MLBs bloqueados manualmente carregados`, 'info');
                } catch (e) {
                    mlbsBloqueadosManuais = [];
                }
            } else {
                mlbsBloqueadosManuais = [];
            }

            const savedAuto = localStorage.getItem(STORAGE_KEY_AUTO);
            if (savedAuto) {
                try {
                    const data = JSON.parse(savedAuto);
                    const cacheTime = data.dataAtualizacao ? new Date(data.dataAtualizacao).getTime() : 0;
                    const cacheAge = Date.now() - cacheTime;
                    
                    if (cacheAge < 3600000) {
                        mlbsBloqueadosAutomaticos = data.mlbs || [];
                        log(`${mlbsBloqueadosAutomaticos.length} MLBs bloqueados automaticamente carregados do cache`, 'info');
                    } else {
                        log('Cache de MLBs automáticos expirado', 'warning');
                        mlbsBloqueadosAutomaticos = [];
                    }
                } catch (e) {
                    log('Erro ao ler cache automático', 'warning');
                    mlbsBloqueadosAutomaticos = [];
                }
            } else {
                mlbsBloqueadosAutomaticos = [];
            }

            mlbsBloqueados = [...new Set([...mlbsBloqueadosManuais, ...mlbsBloqueadosAutomaticos])];
            atualizarInterfaceMLBsBloqueados();

            log(`✅ Total: ${mlbsBloqueados.length} MLBs bloqueados (${mlbsBloqueadosManuais.length} manuais + ${mlbsBloqueadosAutomaticos.length} automáticos)`, 'success');

        } catch (error) {
            log(`❌ Erro ao carregar MLBs bloqueados: ${error.message}`, 'error');
            console.error(error);
            mlbsBloqueados = [];
            mlbsBloqueadosManuais = [];
            mlbsBloqueadosAutomaticos = [];
        }
    }

    // ============================================================
    // FUNÇÃO PARA CARREGAR APENAS AS PROMOÇÕES (SEM BUSCAR ITENS)
    // ============================================================
    async function carregarApenasPromocoes() {
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
            todasPromocoes = (data.results || []).filter(p => p.status === 'started');
            
            log(`${todasPromocoes.length} promoções ativas carregadas`, 'success');
            preencherSelectsPromocoes();
            showToast(`✅ ${todasPromocoes.length} promoções ativas carregadas`, 'success');

        } catch (error) {
            console.error('❌ Erro ao carregar promoções:', error);
            showToast('Erro ao carregar promoções', 'error');
        }
    }

    // ============================================================
    // FUNÇÃO PRINCIPAL: ABRIR SISTEMA DE PROMOÇÕES
    // ============================================================
    window.abrirSistemaPromocoes = function() {
        log('🚀 Iniciando abertura do sistema de promoções', 'info');
        
        if (!window.currentUser) {
            log('Usuário não logado', 'error');
            showToast('⚠️ Faça login primeiro', 'warning');
            return;
        }

        log(`Usuário: ${window.currentUser.name} (${window.currentUser.role})`, 'info');

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
            log('Criando container da interface...', 'info');
            containerPromocoes = criarInterfacePromocoes();
            document.body.appendChild(containerPromocoes);
        } else {
            log('Container já existe, reutilizando...', 'info');
            containerPromocoes.classList.remove('hidden');
        }

        const userNameEl = document.getElementById('promocoesUserName');
        const userAvatarEl = document.getElementById('promocoesUserAvatar');
        const userRoleEl = document.getElementById('promocoesUserRole');
        if (userNameEl) userNameEl.textContent = window.currentUser.name;
        if (userAvatarEl) userAvatarEl.textContent = window.currentUser.avatar;
        if (userRoleEl) userRoleEl.textContent = window.currentUser.role;

        log('Carregando promoções...', 'info');
        carregarPromocoes();
        showToast('📢 Sistema de Promoções carregado', 'info');
    };

    // ============================================================
    // CRIAÇÃO DA INTERFACE PRINCIPAL
    // ============================================================
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

    // ============================================================
    // FUNÇÕES DO MÓDULO PRINCIPAL
    // ============================================================
    
    window.carregarPromocoes = async function() {
        log('🔄 Iniciando carregamento de promoções...', 'info');
        const lista = document.getElementById('listaPromocoes');
        if (!lista) {
            log('Elemento #listaPromocoes não encontrado!', 'error');
            return;
        }

        lista.innerHTML = `
            <div class="col-12 text-center py-4 text-muted">
                <i class="fas fa-spinner fa-spin fa-2x"></i><br>
                Carregando promoções...
            </div>
        `;

        try {
            const tokenData = await window.getValidToken?.();
            if (!tokenData || !tokenData.access_token) {
                log('Token não obtido!', 'error');
                throw new Error('Não foi possível obter token do Mercado Livre');
            }
            log('Token obtido com sucesso', 'success');

            const userId = '415176739';
            const url = `https://api.mercadolibre.com/seller-promotions/users/${userId}?app_version=v2`;
            log(`Buscando promoções do vendedor ${userId}...`, 'info');
            
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${tokenData.access_token}`;

            const response = await fetch(proxyUrl);
            log(`Resposta da API: status ${response.status}`, 'debug');
            
            if (!response.ok) {
                const errorText = await response.text();
                log(`Erro na API: ${response.status} - ${errorText}`, 'error');
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            log(`Dados recebidos: ${data.results?.length || 0} promoções`, 'info');
            
            promocoes = (data.results || []).filter(p => p.status === 'started');
            todasPromocoes = promocoes;
            
            log(`Promoções ativas: ${promocoes.length}`, 'success');
            
            renderizarPromocoes(promocoes);

            if (promocoes.length === 0) {
                log('Nenhuma promoção ativa encontrada', 'warning');
                showToast('Nenhuma promoção ativa encontrada', 'info');
            } else {
                log(`${promocoes.length} promoções ativas carregadas`, 'success');
                showToast(`✅ ${promocoes.length} promoções ativas carregadas`, 'success');
            }

        } catch (error) {
            log(`Erro ao carregar promoções: ${error.message}`, 'error');
            console.error(error);
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

            const badgeLote = '<span class="badge badge-success" style="font-size:10px;">✅ Consulta automática</span>';

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
                            <span class="badge badge-success">Ativa</span>
                        </div>
                        <p class="card-text small text-muted">
                            <i class="fas fa-tag"></i> ${tipoLabel} (${promo.type})
                        </p>
                        <p class="card-text small">
                            <i class="far fa-calendar-alt"></i> ${startDate} - ${finishDate}
                        </p>
                        <div class="mb-2">${beneficios}</div>
                        <div class="mb-2">${badgeLote}</div>
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
        log(`🔍 Ver itens da promoção: ${promotionId} (${promotionType})`, 'info');
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

        log(`Carregando itens da promoção ${promo?.name || promotionId}...`, 'info');
        await carregarItensPromocao(promotionId, promotionType);
    };

    // ============================================================
    // BUSCAR ITENS DE UMA PROMOÇÃO
    // ============================================================
    async function carregarItensPromocao(promotionId, promotionType, loadMore = false) {
        if (isLoadingItens) {
            log('Já está carregando itens, aguarde...', 'warning');
            return;
        }
        if (!loadMore) {
            itensPromocao = [];
            searchAfter = null;
            hasMoreItens = true;
        }

        isLoadingItens = true;
        log(`🔄 Carregando itens (loadMore: ${loadMore})...`, 'info');
        const tbody = document.getElementById('bodyItensPromocao');
        const btnCarregarMais = document.getElementById('btnCarregarMaisItens');

        try {
            const tokenData = await window.getValidToken?.();
            if (!tokenData || !tokenData.access_token) {
                log('Token não disponível', 'error');
                throw new Error('Token não disponível');
            }
            const token = tokenData.access_token;

            let usouLote = false;
            let novosItens = [];

            log(`Tentando consulta em lote para ${promotionType}`, 'debug');
            
            let url = `https://api.mercadolibre.com/seller-promotions/promotions/${promotionId}/items`;
            let params = {
                promotion_type: promotionType,
                app_version: 'v2',
                limit: 50
            };
            
            if (searchAfter) {
                params.search_after = searchAfter;
            }

            const queryString = Object.keys(params)
                .map(key => `${key}=${encodeURIComponent(params[key])}`)
                .join('&');
            const fullUrl = `${url}?${queryString}`;

            log(`URL da consulta: ${fullUrl}`, 'debug');
            
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(fullUrl)}&token=${token}`;
            const response = await fetch(proxyUrl);
            
            if (response.ok) {
                const data = await response.json();
                novosItens = data.results || [];
                usouLote = true;
                log(`${novosItens.length} itens encontrados na consulta em lote`, 'info');
                
                const paging = data.paging || {};
                const searchAfterValue = paging.searchAfter;
                if (searchAfterValue) {
                    searchAfter = searchAfterValue;
                    hasMoreItens = true;
                    log('Há mais itens para carregar (searchAfter disponível)', 'debug');
                } else {
                    searchAfter = null;
                    hasMoreItens = false;
                    log('Todos os itens foram carregados', 'debug');
                }
            } else {
                const errorText = await response.text();
                log(`Falha na consulta em lote: ${response.status} - ${errorText}`, 'warning');
                
                log('🔄 Usando método alternativo (busca por anúncios)', 'info');
                showToast('🔄 Buscando itens via método alternativo...', 'info');
                
                const itensEncontrados = await buscarItensPorAnuncios(promotionId, token);
                novosItens = itensEncontrados;
                hasMoreItens = false;
                searchAfter = null;
                log(`${novosItens.length} itens encontrados via método alternativo`, 'info');
            }

            if (loadMore) {
                itensPromocao = itensPromocao.concat(novosItens);
                log(`Adicionados ${novosItens.length} itens, total: ${itensPromocao.length}`, 'info');
            } else {
                itensPromocao = novosItens;
                log(`Total de itens carregados: ${itensPromocao.length}`, 'info');
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

            if (itensPromocao.length === 0) {
                log('Nenhum item encontrado nesta promoção', 'warning');
                showToast('⚠️ Nenhum item encontrado nesta promoção', 'warning');
            } else {
                log(`${itensPromocao.length} itens carregados com sucesso`, 'success');
                showToast(`✅ ${itensPromocao.length} itens carregados`, 'success');
            }

        } catch (error) {
            log(`❌ Erro ao carregar itens da promoção: ${error.message}`, 'error');
            console.error(error);
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">${error.message}</td></tr>`;
            }
            showToast('Erro ao carregar itens: ' + error.message, 'error');
        } finally {
            isLoadingItens = false;
            if (btnCarregarMais) {
                btnCarregarMais.disabled = !hasMoreItens;
            }
        }
    }

    // ============================================================
    // MÉTODO ALTERNATIVO: BUSCAR ITENS POR ANÚNCIOS
    // ============================================================
    async function buscarItensPorAnuncios(promotionId, token) {
        log('🔍 Iniciando busca de itens por anúncios...', 'info');
        showToast('🔄 Buscando anúncios ativos...', 'info');
        
        const sellerItems = await buscarTodosAnunciosVendedor(token);
        
        if (sellerItems.length === 0) {
            log('Nenhum anúncio ativo encontrado', 'warning');
            showToast('⚠️ Nenhum anúncio encontrado', 'warning');
            return [];
        }

        log(`${sellerItems.length} anúncios ativos encontrados`, 'success');
        showToast(`🔍 Verificando ${sellerItems.length} anúncios na promoção...`, 'info');

        const itensNaPromocao = [];
        let processados = 0;
        const total = sellerItems.length;
        let encontrados = 0;

        log(`Verificando ${total} anúncios na promoção ${promotionId}...`, 'info');

        const batchSize = 10;
        for (let i = 0; i < sellerItems.length; i += batchSize) {
            const batch = sellerItems.slice(i, i + batchSize);
            log(`Processando lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(total/batchSize)} (${batch.length} itens)`, 'debug');
            
            const promises = batch.map(async (item) => {
                try {
                    const itemId = item.id;
                    const url = `https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`;
                    const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
                    const response = await fetch(proxyUrl);
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (Array.isArray(data)) {
                            const promoEncontrada = data.find(p => p.id === promotionId);
                            if (promoEncontrada) {
                                encontrados++;
                                return {
                                    id: itemId,
                                    status: promoEncontrada.status || 'started',
                                    price: promoEncontrada.price || 0,
                                    original_price: promoEncontrada.original_price || 0,
                                    meli_percentage: promoEncontrada.meli_percentage || 0,
                                    seller_percentage: promoEncontrada.seller_percentage || 0,
                                    boosted_offer: promoEncontrada.boosted_offer || false,
                                    discount_meli_boosted_percentage: promoEncontrada.discount_meli_boosted_percentage || 0,
                                    ref_id: promoEncontrada.ref_id || ''
                                };
                            }
                        }
                    }
                    return null;
                } catch (err) {
                    log(`Erro ao verificar item ${item.id}: ${err.message}`, 'warning');
                    return null;
                }
            });

            const resultados = await Promise.all(promises);
            const validos = resultados.filter(r => r !== null);
            itensNaPromocao.push(...validos);
            
            processados += batch.length;
            if (processados % 50 === 0 || processados === total) {
                log(`Progresso: ${processados}/${total} anúncios verificados, ${encontrados} encontrados`, 'info');
                showToast(`📊 Verificados ${processados}/${total} anúncios... (${encontrados} encontrados)`, 'info');
            }
        }

        log(`✅ ${encontrados} itens encontrados na promoção ${promotionId}`, 'success');
        showToast(`✅ ${itensNaPromocao.length} itens encontrados na promoção`, 'success');
        return itensNaPromocao;
    }

    // ============================================================
    // BUSCAR TODOS OS ANÚNCIOS ATIVOS DO VENDEDOR
    // ============================================================
    async function buscarTodosAnunciosVendedor(token) {
        log('📦 Buscando todos os anúncios ativos...', 'info');
        
        const cached = localStorage.getItem(SELLER_ITEMS_CACHE_KEY);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                const cacheTime = data.timestamp || 0;
                const cacheAge = Date.now() - cacheTime;
                if (cacheAge < 1800000) {
                    log(`📦 Usando cache de anúncios: ${data.items.length} itens (${Math.round(cacheAge/60000)} min atrás)`, 'info');
                    return data.items;
                } else {
                    log(`Cache expirado (${Math.round(cacheAge/60000)} min), buscando novamente...`, 'warning');
                }
            } catch (e) {
                log('Erro ao ler cache, buscando novamente...', 'warning');
            }
        }

        const userId = '415176739';
        const allItems = [];
        let offset = 0;
        const limit = 100;
        let hasMore = true;
        let totalProcessados = 0;
        let page = 1;

        showToast('📦 Buscando lista de anúncios ativos...', 'info');

        while (hasMore) {
            try {
                const url = `https://api.mercadolibre.com/users/${userId}/items/search?limit=${limit}&offset=${offset}&order_by=id_desc`;
                log(`Buscando página ${page} (offset: ${offset})...`, 'debug');
                
                const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
                
                const response = await fetch(proxyUrl);
                
                if (!response.ok) {
                    if (response.status === 400) {
                        log(`Offset ${offset} retornou 400, pode ser o limite máximo`, 'warning');
                        hasMore = false;
                        break;
                    }
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                const items = data.results || [];
                
                if (items.length === 0) {
                    log('Nenhum anúncio nesta página, finalizando busca', 'debug');
                    hasMore = false;
                    break;
                }

                log(`Processando ${items.length} anúncios da página ${page}...`, 'debug');
                
                const itemsProcessados = [];
                for (const itemId of items) {
                    try {
                        const detailUrl = `https://api.mercadolibre.com/items/${itemId}`;
                        const detailProxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(detailUrl)}&token=${token}`;
                        const detailResponse = await fetch(detailProxyUrl);
                        if (detailResponse.ok) {
                            const detail = await detailResponse.json();
                            if (detail.status === 'active') {
                                itemsProcessados.push({ 
                                    id: itemId, 
                                    title: detail.title || 'Sem título'
                                });
                            }
                        }
                    } catch (err) {
                        log(`Erro ao buscar detalhe do item ${itemId}: ${err.message}`, 'warning');
                    }
                }
                
                allItems.push(...itemsProcessados);
                totalProcessados += itemsProcessados.length;
                log(`Página ${page}: ${itemsProcessados.length} itens ativos (total: ${totalProcessados})`, 'info');
                
                const totalItems = data.paging?.total || 0;
                if (offset + limit >= totalItems || items.length < limit) {
                    hasMore = false;
                    log('Todos os anúncios foram processados', 'debug');
                } else {
                    offset += limit;
                    page++;
                }
                
            } catch (error) {
                log(`Erro na página ${page}: ${error.message}`, 'error');
                if (error.message.includes('400')) {
                    log('Possível limite máximo de offset atingido', 'warning');
                    hasMore = false;
                } else {
                    throw error;
                }
            }
        }

        localStorage.setItem(SELLER_ITEMS_CACHE_KEY, JSON.stringify({
            items: allItems,
            timestamp: Date.now()
        }));

        log(`✅ ${allItems.length} anúncios ativos encontrados`, 'success');
        return allItems;
    }

    window.carregarMaisItens = function() {
        if (!currentPromotionId || !currentPromotionType) {
            log('Nenhuma promoção selecionada para carregar mais itens', 'warning');
            return;
        }
        if (!hasMoreItens || isLoadingItens) {
            log(`${!hasMoreItens ? 'Todos os itens já foram carregados' : 'Já está carregando'}`, 'warning');
            return;
        }
        log('Carregando mais itens...', 'info');
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

            const hasBoost = item.boosted_offer === true;
            const boostBadge = hasBoost ? 
                `<span class="badge badge-success" title="Desconto MELI Boost: ${item.discount_meli_boosted_percentage || 0}%">🚀 Boost</span>` : 
                '<span class="badge badge-secondary">Não</span>';

            let acoes = '';
            if (item.status === 'started' || item.status === 'active') {
                acoes = `
                    <button class="btn btn-danger btn-sm" onclick="window.excluirItemPromocao('${item.id}', '${item.ref_id || ''}')" title="Excluir da promoção">
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
                <td>${boostBadge}</td>
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
                    <thead><tr><th>Tipo</th><th>Status</th><th>Preço</th><th>Original</th><th>Boost</th></tr></thead><tbody>`;
                data.forEach(p => {
                    const tipo = p.type || 'N/A';
                    const status = p.status || 'N/A';
                    const preco = p.price ? (p.price/100).toFixed(2) : '-';
                    const original = p.original_price ? (p.original_price/100).toFixed(2) : '-';
                    const boost = p.boosted_offer ? '🚀 Sim' : 'Não';
                    html += `<tr><td>${tipo}</td><td>${status}</td><td>R$ ${preco}</td><td>R$ ${original}</td><td>${boost}</td></tr>`;
                });
                html += `</tbody></table></div>`;
            }

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.style.cssText = 'display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); z-index:2000;';
            modal.innerHTML = `
                <div class="modal-content" style="max-width:700px;">
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
    // MÓDULO: GESTÃO DE PROMOÇÕES EM LOTE (BULK)
    // ============================================================

    window.abrirGestaoPromocoesLote = function() {
        log('🚀 Abrindo Gestão de Promoções em Lote', 'info');
        
        if (!window.currentUser) {
            log('Usuário não logado', 'error');
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
            log('Container já existe, reutilizando...', 'info');
            container.classList.remove('hidden');
            bulkSystemContainer = container;
        } else {
            log('Criando container da interface...', 'info');
            container = criarInterfaceBulk();
            document.body.appendChild(container);
            bulkSystemContainer = container;
        }

        atualizarUsuarioBulk();

        if (todasPromocoes.length > 0) {
            log(`Preenchendo selects com ${todasPromocoes.length} promoções...`, 'info');
            preencherSelectsPromocoes();
        } else {
            log('Carregando lista de promoções...', 'info');
            carregarApenasPromocoes();
        }

        carregarMLBsBloqueadosApenasCache();

        log('Gestão de Promoções em Lote carregada com sucesso', 'success');
        showToast('📋 Gestão de Promoções em Lote carregada', 'info');
    };

    window.fecharGestaoPromocoesLote = function() {
        log('Fechando Gestão de Promoções em Lote', 'info');
        if (bulkSystemContainer) {
            bulkSystemContainer.classList.add('hidden');
        }
        const menu = document.getElementById('menuSystem');
        if (menu) menu.classList.remove('hidden');
    };

    // ============================================================
    // CRIAÇÃO DA INTERFACE BULK
    // ============================================================
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

            <!-- Configurar Regras -->
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
                                <select id="bulkPromocaoOrigem" class="form-control" onchange="window.onPromocaoOrigemChange()">
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
                                <select id="bulkRegraComparacao" class="form-control" onchange="window.onRegraChange()">
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

            <!-- MLBs Bloqueados -->
            <div class="card mb-4">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-ban"></i> MLBs Bloqueados
                    </h2>
                    <div class="d-flex flex-wrap gap-2">
                        <button class="btn btn-sm btn-success" onclick="window.adicionarMLBBloqueado()">
                            <i class="fas fa-plus"></i> Adicionar
                        </button>
                        <button class="btn btn-sm btn-warning" onclick="window.atualizarMLBsBloqueadosAutomaticos()" title="Buscar MLBs com menos de 40 dias e bloquear automaticamente">
                            <i class="fas fa-robot"></i> Bloquear Automáticos (40 dias)
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="window.forcarBuscaCompletaMLBs()" title="Forçar busca de TODOS os MLBs ativos">
                            <i class="fas fa-database"></i> Buscar Todos MLBs
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="window.limparMLBsBloqueados()">
                            <i class="fas fa-trash"></i> Limpar Manuais
                        </button>
                        <button class="btn btn-sm btn-primary" onclick="window.exportarMLBsBloqueados()">
                            <i class="fas fa-file-export"></i> Exportar
                        </button>
                        <button class="btn btn-sm btn-info" onclick="window.importarMLBsBloqueados()">
                            <i class="fas fa-file-import"></i> Importar
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="form-group">
                        <label>Lista de MLB's bloqueados (separados por espaço)</label>
                        <div class="d-flex gap-2">
                            <input type="text" id="bulkMLBsBloqueados" class="form-control" 
                                placeholder="Ex: MLB123 MLB456 MLB789" 
                                onchange="window.salvarMLBsBloqueadosManuais()">
                            <button class="btn btn-primary btn-sm" onclick="carregarMLBsBloqueadosApenasCache()">
                                <i class="fas fa-sync-alt"></i> Recarregar
                            </button>
                        </div>
                        <small class="text-muted">
                            <i class="fas fa-info-circle"></i> 
                            <strong>Clique em "Bloquear Automáticos (40 dias)"</strong> para buscar todos os MLBs ativos e bloquear automaticamente os criados há menos de 40 dias.
                            <br>
                            <span class="badge badge-warning" id="contadorAutoMLBs">0</span> automáticos bloqueados.
                            <span class="badge badge-danger" id="contadorManualMLBs">0</span> manuais bloqueados.
                        </small>
                    </div>
                    <div id="bulkMLBsBloqueadosLista" class="mt-2" style="display:flex; flex-wrap:wrap; gap:5px;"></div>
                </div>
            </div>

            <!-- Análise e Ativação -->
            <div class="card mb-4">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-chart-bar"></i> Análise e Ativação
                    </h2>
                    <div class="d-flex flex-wrap gap-2">
                        <button class="btn btn-primary" onclick="window.analisarItens()">
                            <i class="fas fa-search"></i> Analisar Itens
                        </button>
                        <button class="btn btn-success" onclick="window.executarAtivacaoEmMassa()" id="btnAtivarMassa" disabled>
                            <i class="fas fa-play"></i> Ativar em Massa
                        </button>
                        <button class="btn btn-info" onclick="window.exportarAnaliseBulkExcel()">
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
                                    <th><input type="checkbox" id="bulkSelectAll" onchange="window.selecionarTodosItens()"></th>
                                    <th>MLB</th>
                                    <th>Preço Origem</th>
                                    <th>% Origem</th>
                                    <th>Preço Destino</th>
                                    <th>% Destino</th>
                                    <th>Status Promoção</th>
                                    <th>Análise</th>
                                </tr>
                            </thead>
                            <tbody id="bulkItensBody">
                                <tr>
                                    <td colspan="8" class="text-center py-4 text-muted">
                                        <i class="fas fa-info-circle"></i> Selecione a <strong>Promoção de Origem</strong> para carregar os itens
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        return div;
    }

    // ============================================================
    // FUNÇÕES DO MÓDULO BULK
    // ============================================================

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

        // Filtra apenas promoções ativas (started)
        const promocoesAtivas = todasPromocoes.filter(p => p.status === 'started');

        if (origemSelect) {
            origemSelect.innerHTML = '<option value="">Selecione...</option>';
            promocoesAtivas.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.name} (${p.type}) ✅ Ativa`;
                opt.dataset.type = p.type;
                opt.dataset.status = p.status;
                origemSelect.appendChild(opt);
            });
        }

        if (destinoSelect) {
            destinoSelect.innerHTML = '<option value="">Selecione...</option>';
            promocoesAtivas.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.name} (${p.type}) ✅ Ativa`;
                opt.dataset.type = p.type;
                opt.dataset.status = p.status;
                destinoSelect.appendChild(opt);
            });
        }
    }

    window.onPromocaoOrigemChange = async function() {
        const origemSelect = document.getElementById('bulkPromocaoOrigem');
        const destinoSelect = document.getElementById('bulkPromocaoDestino');
        if (!origemSelect || !destinoSelect) return;

        const origemId = origemSelect.value;
        const destinoId = destinoSelect.value;

        // Verificar se a origem está ativa
        const promoOrigem = todasPromocoes.find(p => p.id === origemId);
        if (promoOrigem && promoOrigem.status !== 'started') {
            showToast('⚠️ A promoção de origem não está ativa!', 'warning');
            origemSelect.value = '';
            return;
        }

        // Verificar se o destino está ativo
        const promoDestino = todasPromocoes.find(p => p.id === destinoId);
        if (promoDestino && promoDestino.status !== 'started') {
            showToast('⚠️ A promoção de destino não está ativa!', 'warning');
            destinoSelect.value = '';
            return;
        }

        if (origemId && destinoId && origemId === destinoId) {
            showToast('⚠️ A promoção de origem e destino não podem ser iguais', 'warning');
            destinoSelect.value = '';
            return;
        }

        if (origemId) {
            itensPromocaoOrigem = [];
            totalItensCarregados = 0;
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

// ============================================================
// CARREGAR ITENS DA ORIGEM - VERSÃO OTIMIZADA
// ============================================================
async function carregarItensOrigem(promotionId) {
    if (isLoadingOrigem) {
        showToast('⏳ Já está carregando...', 'info');
        return;
    }
    
    isLoadingOrigem = true;
    itensPromocaoOrigem = [];
    totalItensCarregados = 0;
    metodoUsado = '';
    
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🚀 [${new Date().toLocaleTimeString()}] CARREGANDO ITENS DA ORIGEM`);
    console.log(`   Promoção ID: ${promotionId}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    showToast('🔄 Carregando itens da promoção de origem...', 'info');

    try {
        const tokenData = await window.getValidToken?.();
        if (!tokenData?.access_token) {
            console.log(`❌ Token não disponível`);
            showToast('Token não disponível', 'error');
            return;
        }
        console.log(`✅ Token obtido com sucesso`);

        const promo = todasPromocoes.find(p => p.id === promotionId);
        if (!promo) {
            console.log(`❌ Promoção não encontrada: ${promotionId}`);
            showToast('Promoção não encontrada', 'error');
            return;
        }

        console.log(`📌 Nome: ${promo.name}`);
        console.log(`📌 Tipo: ${promo.type}`);
        
        log(`📌 Tipo da promoção: ${promo.type}`, 'info');
        
        console.log(`🔄 Buscando todos os itens da promoção com preços...`);
        const startTime = Date.now();
        
        // Buscar todos os itens da promoção com preços (otimizado)
        const itensCompletos = await buscarItensPromocaoComPrecos(promotionId, promo.type, tokenData.access_token);
        
        const elapsed = ((Date.now() - startTime) / 1000);
        console.log(`⏱️ Busca concluída em ${elapsed.toFixed(1)}s`);
        console.log(`📊 Total de itens encontrados: ${itensCompletos.length}`);
        
        // Contar status para estatísticas (mais rápido que iterar de novo)
        const statusCount = {};
        itensCompletos.forEach(item => {
            const status = item.status || 'unknown';
            statusCount[status] = (statusCount[status] || 0) + 1;
        });
        
        console.log(`📈 Distribuição por status:`);
        Object.entries(statusCount).forEach(([status, count]) => {
            const pct = ((count / itensCompletos.length) * 100).toFixed(1);
            console.log(`   ${status}: ${count} (${pct}%)`);
        });
        
        // FILTRAR APENAS ITENS COM STATUS 'started' (ATIVOS NA PROMOÇÃO)
        // Usando filter que é mais rápido que loop com push
        const itensAtivos = itensCompletos.filter(item => 
            item.status === 'started' && 
            item.price > 0
        );
        
        const ativos = itensAtivos.length;
        const candidatos = itensCompletos.filter(item => item.status === 'candidate').length;
        const pendentes = itensCompletos.filter(item => item.status === 'pending').length;
        const outros = itensCompletos.length - ativos - candidatos - pendentes;
        
        console.log(`📊 RESUMO DA ORIGEM:`);
        console.log(`   ✅ Ativos (started): ${ativos}`);
        console.log(`   🔄 Candidatos: ${candidatos}`);
        console.log(`   ⏳ Pendentes: ${pendentes}`);
        console.log(`   📦 Outros: ${outros}`);
        console.log(`   📊 Total: ${itensCompletos.length}`);
        
        itensPromocaoOrigem = itensAtivos;
        totalItensCarregados = ativos;

        if (ativos === 0) {
            console.log(`⚠️ Nenhum item ATIVO (started) encontrado!`);
            showToast(`⚠️ Nenhum item ATIVO (started) encontrado. ${candidatos} candidatos disponíveis.`, 'warning');
        } else {
            console.log(`✅ ${ativos} itens ATIVOS (started) carregados`);
            showToast(`✅ ${ativos} itens ATIVOS (started) carregados`, 'success');
        }
        
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    } catch (error) {
        console.log(`❌ [${new Date().toLocaleTimeString()}] ERRO AO CARREGAR ITENS DA ORIGEM:`);
        console.log(`   Mensagem: ${error.message}`);
        console.error(error);
        log(`❌ Erro ao carregar itens da origem: ${error.message}`, 'error');
        showToast('Erro ao carregar itens da origem: ' + error.message, 'error');
        itensPromocaoOrigem = [];
    } finally {
        isLoadingOrigem = false;
        console.log(`✅ Carregamento finalizado`);
    }
}

// ============================================================
// ANALISAR ITENS - VERSÃO OTIMIZADA
// ============================================================
window.analisarItens = async function() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`🔍 [${new Date().toLocaleTimeString()}] INICIANDO ANÁLISE DE ITENS`);
    console.log('═══════════════════════════════════════════════════════════');
    
    // ============================================================
    // MOSTRAR BARRA DE PROGRESSO
    // ============================================================
    mostrarBarraProgresso(
        '🔍 Analisando Itens',
        'Preparando análise...'
    );
    atualizarProgresso(0, 'Iniciando análise...', 'Verificando configurações', '0%');
    
    const origemId = document.getElementById('bulkPromocaoOrigem')?.value;
    const destinoId = document.getElementById('bulkPromocaoDestino')?.value;
    const regra = document.getElementById('bulkRegraComparacao')?.value;

    console.log(`📌 Promoção Origem ID: ${origemId || 'NÃO SELECIONADO'}`);
    console.log(`📌 Promoção Destino ID: ${destinoId || 'NÃO SELECIONADO'}`);
    console.log(`📌 Regra de Comparação: ${regra || 'NÃO SELECIONADA'}`);
    console.log(`📌 Itens carregados da origem: ${itensPromocaoOrigem.length}`);

    // Validações iniciais
    if (!origemId || !destinoId) {
        console.log('❌ Origem ou destino não selecionados');
        fecharBarraProgresso();
        showToast('⚠️ Selecione a promoção de origem e destino', 'warning');
        return;
    }

    if (origemId === destinoId) {
        console.log('❌ Origem e destino são iguais');
        fecharBarraProgresso();
        showToast('⚠️ A promoção de origem e destino não podem ser iguais', 'warning');
        return;
    }

    if (itensPromocaoOrigem.length === 0) {
        console.log('❌ Nenhum item carregado da origem');
        fecharBarraProgresso();
        showToast('⚠️ Nenhum item carregado da promoção de origem. Selecione uma promoção de origem primeiro.', 'warning');
        return;
    }

    console.log(`📊 ${itensPromocaoOrigem.length} itens carregados da origem`);

    atualizarProgresso(10, 'Carregando promoção destino...', `Buscando informações da promoção`, '10%');

    const promocaoDestino = todasPromocoes.find(p => p.id === destinoId);
    if (!promocaoDestino) {
        console.log('❌ Promoção de destino não encontrada');
        fecharBarraProgresso();
        showToast('Promoção de destino não encontrada', 'error');
        return;
    }
    console.log(`📌 Promoção Destino: ${promocaoDestino.name} (${promocaoDestino.type})`);

    // Buscar itens do destino (TODOS, não só ativos) - OTIMIZADO
    console.log('🔄 Carregando itens da promoção de destino...');
    
    atualizarProgresso(20, 'Carregando itens do destino...', `Buscando itens da promoção ${promocaoDestino.name}`, '20%');
    showToast('🔄 Carregando itens da promoção de destino...', 'info');
    
    let itensDestino = [];
    const startDestino = Date.now();
    try {
        const tokenData = await window.getValidToken?.();
        if (tokenData?.access_token) {
            atualizarProgresso(25, 'Carregando itens do destino...', 'Aguardando resposta da API...', '25%');
            
            // Usar a função otimizada
            itensDestino = await buscarItensPromocaoComPrecos(
                destinoId, 
                promocaoDestino.type, 
                tokenData.access_token
            );
        }
    } catch (e) {
        console.error('❌ Erro ao carregar itens do destino:', e);
    }
    const elapsedDestino = ((Date.now() - startDestino) / 1000);
    console.log(`⏱️ Destino carregado em ${elapsedDestino.toFixed(1)}s`);
    console.log(`📊 ${itensDestino.length} itens carregados do destino`);

    atualizarProgresso(35, 'Processando dados do destino...', `${itensDestino.length} itens encontrados`, '35%');

    // Criar mapa de preços do destino por MLB (otimizado com Map)
    console.log('🔄 Criando mapa de preços do destino...');
    const mapaDestino = new Map(); // Usar Map é mais rápido para buscas
    itensDestino.forEach(item => {
        const id = item.id || item.item_id;
        if (id) {
            mapaDestino.set(id, {
                price: item.price || 0,
                status: item.status || 'unknown',
                original_price: item.original_price || 0,
                seller_percentage: item.seller_percentage || 0,
                meli_percentage: item.meli_percentage || 0,
                current_sale_price: item.current_sale_price || null,
            });
        }
    });
    console.log(`📊 ${mapaDestino.size} itens mapeados no destino`);

    atualizarProgresso(45, 'Analisando itens...', `Comparando ${itensPromocaoOrigem.length} itens`, '45%');

    // ============================================================
    // ANALISAR CADA ITEM DA ORIGEM - OTIMIZADO
    // ============================================================
    
    itensFiltrados = [];
    let elegiveis = 0;
    let bloqueados = 0;
    let naoElegiveis = 0;
    let jaAtivos = 0;
    let processados = 0;
    const total = itensPromocaoOrigem.length;
    
    // Pré-calcular valores para evitar repetição
    const valorMin = parseFloat(document.getElementById('bulkValorMin')?.value) || null;
    const valorMax = parseFloat(document.getElementById('bulkValorMax')?.value) || null;
    const percentMin = parseFloat(document.getElementById('bulkPercentMin')?.value) || null;
    const percentMax = parseFloat(document.getElementById('bulkPercentMax')?.value) || null;

    console.log('───────────────────────────────────────────────────────────');
    console.log('📊 ANALISANDO ITEM POR ITEM (OTIMIZADO):');
    console.log('───────────────────────────────────────────────────────────');

    // Usar for...of com let para melhor performance
    for (const item of itensPromocaoOrigem) {
        processados++;
        
        // Atualizar progresso a cada 10 itens (menos frequente para melhor performance)
        if (processados % 10 === 0 || processados === total) {
            const pct = Math.min(45 + (processados / total) * 40, 85);
            atualizarProgresso(
                pct,
                `Analisando itens (${processados}/${total})`,
                `${elegiveis} elegíveis, ${bloqueados} bloqueados, ${jaAtivos} já ativos`,
                `${Math.round(pct)}%`
            );
        }

        const mlb = item.id || item.item_id;
        const precoOrigem = item.price || 0;
        const percentOrigem = item.seller_percentage || 0;
        
        // Verificar se está na lista de bloqueados (usando Set para busca mais rápida)
        if (mlbsBloqueados.includes(mlb)) {
            bloqueados++;
            itensFiltrados.push({
                ...item,
                elegivel: false,
                motivo: '🚫 Bloqueado',
                precoDestino: null,
                percentDestino: null,
                statusDestino: null,
                precoOrigem: precoOrigem,
                percentOrigem: percentOrigem,
                jaAtivo: false,
                elegivelFinal: false
            });
            continue;
        }

        // Verificar se o item já está ativo na promoção de destino (usando Map.get que é mais rápido)
        const destino = mapaDestino.get(mlb);
        const statusDestino = destino?.status || null;
        const precoDestino = destino?.price || null;
        const percentDestino = destino?.seller_percentage || null;

        // Se já está ativo na destino (started)
        if (statusDestino === 'started') {
            jaAtivos++;
            itensFiltrados.push({
                ...item,
                elegivel: false,
                motivo: '✅ Já está ATIVO',
                precoDestino: precoDestino,
                percentDestino: percentDestino,
                statusDestino: statusDestino,
                precoOrigem: precoOrigem,
                percentOrigem: percentOrigem,
                jaAtivo: true,
                elegivelFinal: false
            });
            continue;
        }

        // Se não tem preço na destino, não é elegível
        if (precoDestino === null || precoDestino === 0) {
            naoElegiveis++;
            itensFiltrados.push({
                ...item,
                elegivel: false,
                motivo: '❌ Não é candidato',
                precoDestino: null,
                percentDestino: null,
                statusDestino: statusDestino || 'não candidato',
                precoOrigem: precoOrigem,
                percentOrigem: percentOrigem,
                jaAtivo: false,
                elegivelFinal: false
            });
            continue;
        }

        // ============================================================
        // APLICAR REGRA DE COMPARAÇÃO - OTIMIZADO
        // ============================================================
        
        let elegivel = false;
        let regraAplicada = '';

        // Preços em reais (já estão em centavos)
        const precoOrigemReais = precoOrigem / 100;
        const precoDestinoReais = precoDestino / 100;

        // Switch otimizado com break
        switch (regra) {
            case 'valor_maior':
                elegivel = precoDestinoReais > precoOrigemReais;
                regraAplicada = elegivel ? 
                    `Preço destino (R$ ${precoDestinoReais.toFixed(2)}) > origem (R$ ${precoOrigemReais.toFixed(2)}) ✅` :
                    `Preço destino (R$ ${precoDestinoReais.toFixed(2)}) NÃO é maior que origem (R$ ${precoOrigemReais.toFixed(2)})`;
                break;

            case 'valor_menor':
                elegivel = precoDestinoReais < precoOrigemReais;
                regraAplicada = elegivel ?
                    `Preço destino (R$ ${precoDestinoReais.toFixed(2)}) < origem (R$ ${precoOrigemReais.toFixed(2)}) ✅` :
                    `Preço destino (R$ ${precoDestinoReais.toFixed(2)}) NÃO é menor que origem (R$ ${precoOrigemReais.toFixed(2)})`;
                break;

            case 'percentual_maior':
                elegivel = percentDestino > percentOrigem;
                regraAplicada = elegivel ?
                    `% destino (${percentDestino}%) > origem (${percentOrigem}%) ✅` :
                    `% destino (${percentDestino}%) NÃO é maior que origem (${percentOrigem}%)`;
                break;

            case 'percentual_menor':
                elegivel = percentDestino < percentOrigem;
                regraAplicada = elegivel ?
                    `% destino (${percentDestino}%) < origem (${percentOrigem}%) ✅` :
                    `% destino (${percentDestino}%) NÃO é menor que origem (${percentOrigem}%)`;
                break;

            case 'valor_entre':
                elegivel = (valorMin === null || precoDestinoReais >= valorMin) && 
                           (valorMax === null || precoDestinoReais <= valorMax);
                regraAplicada = elegivel ?
                    `Preço destino (R$ ${precoDestinoReais.toFixed(2)}) entre R$ ${valorMin || '∞'} e R$ ${valorMax || '∞'} ✅` :
                    `Preço destino (R$ ${precoDestinoReais.toFixed(2)}) NÃO está entre R$ ${valorMin || '∞'} e R$ ${valorMax || '∞'}`;
                break;

            case 'percentual_entre':
                elegivel = (percentMin === null || percentDestino >= percentMin) && 
                           (percentMax === null || percentDestino <= percentMax);
                regraAplicada = elegivel ?
                    `% destino (${percentDestino}%) entre ${percentMin || '∞'}% e ${percentMax || '∞'}% ✅` :
                    `% destino (${percentDestino}%) NÃO está entre ${percentMin || '∞'}% e ${percentMax || '∞'}%`;
                break;

            default:
                elegivel = false;
                regraAplicada = 'Regra não reconhecida';
        }

        if (elegivel) {
            elegiveis++;
        } else {
            naoElegiveis++;
        }

        itensFiltrados.push({
            ...item,
            elegivel: elegivel,
            motivo: elegivel ? `✅ Elegível - ${regraAplicada}` : `❌ Não elegível - ${regraAplicada}`,
            precoDestino: precoDestino,
            precoDestinoReais: precoDestinoReais,
            percentDestino: percentDestino,
            statusDestino: statusDestino,
            precoOrigem: precoOrigem,
            precoOrigemReais: precoOrigemReais,
            percentOrigem: percentOrigem,
            jaAtivo: false,
            elegivelFinal: elegivel,
            regraAplicada: regraAplicada
        });
    }

    // ============================================================
    // RESUMO FINAL
    // ============================================================
    
    console.log('───────────────────────────────────────────────────────────');
    console.log('📊 RESUMO DA ANÁLISE:');
    console.log(`   ✅ Elegíveis: ${elegiveis}`);
    console.log(`   🚫 Bloqueados: ${bloqueados}`);
    console.log(`   ✅ Já ativos na destino: ${jaAtivos}`);
    console.log(`   ❌ Não elegíveis: ${naoElegiveis}`);
    console.log(`   📊 Total analisado: ${itensFiltrados.length}`);
    console.log('═══════════════════════════════════════════════════════════');

    // Atualizar progresso para 95%
    atualizarProgresso(95, 'Finalizando análise...', `Resumo: ${elegiveis} elegíveis`, '95%');

    // Atualizar UI - Resumo
    const resumoDiv = document.getElementById('bulkResumo');
    if (resumoDiv) {
        resumoDiv.classList.remove('hidden');
        document.getElementById('bulkTotalItens').textContent = itensFiltrados.length;
        document.getElementById('bulkElegiveis').textContent = elegiveis;
        document.getElementById('bulkBloqueados').textContent = bloqueados;
        document.getElementById('bulkNaoElegiveis').textContent = naoElegiveis + jaAtivos;
    }

    // Atualizar UI - Tabela
    const tabelaContainer = document.getElementById('bulkTabelaContainer');
    if (tabelaContainer) {
        tabelaContainer.classList.remove('hidden');
    }

    // Habilitar/desabilitar o botão de ativação
    const btnAtivar = document.getElementById('btnAtivarMassa');
    if (btnAtivar) {
        if (elegiveis > 0) {
            btnAtivar.disabled = false;
            btnAtivar.style.opacity = '1';
            btnAtivar.style.cursor = 'pointer';
            btnAtivar.innerHTML = '<i class="fas fa-play"></i> Ativar em Massa (' + elegiveis + ' itens)';
        } else {
            btnAtivar.disabled = true;
            btnAtivar.style.opacity = '0.5';
            btnAtivar.style.cursor = 'not-allowed';
            btnAtivar.innerHTML = '<i class="fas fa-play"></i> Ativar em Massa (0 itens)';
        }
    }

    // Renderizar tabela
    renderizarTabelaItensBulk();

    // ============================================================
    // FINALIZAR - MOSTRAR RESULTADO
    // ============================================================
    atualizarProgresso(100, '✅ Análise concluída!', `${elegiveis} itens elegíveis encontrados`, '✅ Concluído');
    
    // Esperar 1 segundo e fechar a barra
    await new Promise(resolve => setTimeout(resolve, 1000));
    fecharBarraProgresso();

    // Toast com resumo
    showToast(`✅ Análise concluída: ${elegiveis} elegíveis, ${bloqueados} bloqueados, ${jaAtivos} já ativos, ${naoElegiveis} não elegíveis`, 'info');
};

// ============================================================
// RENDERIZAR TABELA DE ITENS BULK - CORRIGIDA
// ============================================================
function renderizarTabelaItensBulk() {
    const tbody = document.getElementById('bulkItensBody');
    if (!tbody) return;

    if (!itensFiltrados || itensFiltrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">
            <i class="fas fa-info-circle"></i> Nenhum item para exibir
        </td></tr>`;
        return;
    }

    // Remover duplicatas por MLB
    const mapaUnico = {};
    for (const item of itensFiltrados) {
        const mlb = item.id;
        if (!mapaUnico[mlb] || (item.elegivel && !mapaUnico[mlb].elegivel)) {
            mapaUnico[mlb] = item;
        }
    }
    const itensUnicos = Object.values(mapaUnico);
    
    // Ordenar: elegíveis primeiro
    itensUnicos.sort((a, b) => {
        if (a.elegivel && !b.elegivel) return -1;
        if (!a.elegivel && b.elegivel) return 1;
        return 0;
    });

    tbody.innerHTML = '';
    
    itensUnicos.forEach((item, index) => {
        const tr = document.createElement('tr');
        const mlb = item.id || 'N/A';
        
        // 🔥 VERIFICAR SE OS VALORES EXISTEM
        const precoOrigem = item.precoOrigem || 0;
        const percentOrigem = item.percentOrigem || 0;
        const precoDestino = (item.precoDestino !== null && item.precoDestino !== undefined) ? item.precoDestino : null;
        const percentDestino = (item.percentDestino !== null && item.percentDestino !== undefined) ? item.percentDestino : null;
        const statusOrigem = item.statusOrigem || 'unknown';
        const statusDestino = item.statusDestino || 'N/A';
        const jaAtivo = item.jaAtivoNoDestino || false;
        const isCandidate = item.isCandidateNoDestino || false;

        let bgColor = '#fff';
        let statusText = '';
        
        if (item.elegivel) {
            bgColor = '#d4edda';
            statusText = '✅ Elegível';
        } else if (jaAtivo) {
            bgColor = '#fff3cd';
            statusText = '⏳ Já ativo no destino';
        } else if (isCandidate && precoDestino !== null && precoDestino > 0) {
            bgColor = '#e8f4fd';
            statusText = '⏳ Candidato';
        } else if (item.motivo && item.motivo.includes('Inativo')) {
            bgColor = '#f8d7da';
            statusText = '❌ Inativo na Origem';
        } else if (item.motivo && item.motivo.includes('Sem dados')) {
            bgColor = '#e9ecef';
            statusText = '❓ Sem dados';
        } else {
            bgColor = '#fff3cd';
            statusText = '❌ Não elegível';
        }

        tr.style.backgroundColor = bgColor;

        const statusBadgeOrigem = statusOrigem === 'started' 
            ? '<span class="badge badge-success">✅ Ativo</span>' 
            : `<span class="badge badge-secondary">${statusOrigem}</span>`;

        const statusBadgeDestino = jaAtivo 
            ? '<span class="badge badge-success">✅ Ativo</span>'
            : isCandidate 
                ? '<span class="badge badge-warning">⏳ Candidato</span>'
                : `<span class="badge badge-secondary">${statusDestino}</span>`;

        // 🔥 FORMATAR PREÇOS COM VERIFICAÇÃO
        const precoOrigemStr = (precoOrigem > 0) ? `R$ ${(precoOrigem / 100).toFixed(2)}` : 'R$ 0,00';
        const precoDestinoStr = (precoDestino !== null && precoDestino > 0) ? `R$ ${(precoDestino / 100).toFixed(2)}` : 'N/A';
        const percentDestinoStr = (percentDestino !== null) ? `${percentDestino}%` : 'N/A';

        tr.innerHTML = `
            <td style="text-align: center; width: 40px;">
                <input type="checkbox" class="bulk-item-checkbox" data-index="${index}" ${item.elegivel ? 'checked' : 'disabled'}>
            </td>
            <td><strong>${mlb}</strong></td>
            <td style="text-align: center;">${statusBadgeOrigem}</td>
            <td style="text-align: center;">${statusBadgeDestino}</td>
            <td style="text-align: right; font-weight: 600;">${precoOrigemStr}</td>
            <td style="text-align: center;">${percentOrigem}%</td>
            <td style="text-align: right; ${precoDestino !== null && precoDestino > 0 ? 'color: #28a745; font-weight: 600;' : 'color: #6c757d;'}">
                ${precoDestinoStr}
            </td>
            <td style="text-align: center;">${percentDestinoStr}</td>
            <td style="text-align: center; font-weight: 600; font-size: 12px;">
                ${statusText}
                ${!item.elegivel && item.motivo && !item.motivo.includes('Elegível') ? 
                    `<br><small style="font-size: 10px; font-weight: 400; color: #6c757d;">${item.motivo}</small>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Atualizar botão
    const totalSelecionados = document.querySelectorAll('.bulk-item-checkbox:checked').length;
    const btnAtivar = document.getElementById('btnAtivarMassa');
    if (btnAtivar) {
        const elegiveis = itensFiltrados.filter(item => item.elegivel).length;
        if (totalSelecionados > 0 && elegiveis > 0) {
            btnAtivar.disabled = false;
            btnAtivar.innerHTML = `<i class="fas fa-play"></i> Ativar em Massa (${totalSelecionados} selecionados)`;
        } else if (elegiveis > 0) {
            btnAtivar.disabled = false;
            btnAtivar.innerHTML = `<i class="fas fa-play"></i> Ativar em Massa (${elegiveis} elegíveis)`;
        } else {
            btnAtivar.disabled = true;
            btnAtivar.innerHTML = `<i class="fas fa-play"></i> Ativar em Massa (0 itens)`;
        }
    }
}

    // ============================================================
    // FUNÇÃO PARA ATUALIZAR O BOTÃO DE ATIVAÇÃO
    // ============================================================
    function atualizarBotaoAtivacao() {
        const btnAtivar = document.getElementById('btnAtivarMassa');
        if (!btnAtivar) return;

        const selecionados = document.querySelectorAll('.bulk-item-checkbox:checked').length;
        const elegiveis = itensFiltrados.filter(item => item.elegivel).length;

        if (selecionados > 0 && elegiveis > 0) {
            btnAtivar.disabled = false;
            btnAtivar.style.opacity = '1';
            btnAtivar.style.cursor = 'pointer';
            btnAtivar.innerHTML = `<i class="fas fa-play"></i> Ativar em Massa (${selecionados} selecionados)`;
        } else {
            btnAtivar.disabled = true;
            btnAtivar.style.opacity = '0.5';
            btnAtivar.style.cursor = 'not-allowed';
            btnAtivar.innerHTML = `<i class="fas fa-play"></i> Ativar em Massa (${elegiveis} elegíveis)`;
        }
    }

    // ============================================================
    // ADICIONAR EVENTO PARA ATUALIZAR BOTÃO QUANDO CHECKBOX MUDA
    // ============================================================
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('bulk-item-checkbox')) {
            atualizarBotaoAtivacao();
        }
    });

    // ============================================================
    // SELECIONAR TODOS OS ITENS ELEGÍVEIS
    // ============================================================
    window.selecionarTodosItens = function() {
        const selectAll = document.getElementById('bulkSelectAll');
        if (!selectAll) return;
        
        const checkboxes = document.querySelectorAll('.bulk-item-checkbox');
        checkboxes.forEach(cb => {
            if (!cb.disabled) {
                cb.checked = selectAll.checked;
            }
        });
        
        atualizarBotaoAtivacao();
    };

    // ============================================================
    // EXECUTAR ATIVAÇÃO EM MASSA
    // ============================================================
    window.executarAtivacaoEmMassa = function() {
        console.log('🔴🔴🔴 BOTÃO ATIVAR EM MASSA CLICADO! 🔴🔴🔴');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('🚀 INICIANDO ATIVAÇÃO EM MASSA');
        console.log('═══════════════════════════════════════════════════════════');
        
        // Verificar se o botão está habilitado
        const btnAtivar = document.getElementById('btnAtivarMassa');
        console.log('📌 Botão Ativar:', btnAtivar);
        if (btnAtivar) {
            console.log('📌 Botão desabilitado?', btnAtivar.disabled);
            console.log('📌 Botão texto:', btnAtivar.innerHTML);
        }
        
        if (btnAtivar && btnAtivar.disabled) {
            console.log('❌ Botão desabilitado - nenhum item elegível selecionado');
            showToast('⚠️ Selecione pelo menos um item elegível', 'warning');
            return;
        }

        const destinoId = document.getElementById('bulkPromocaoDestino')?.value;
        console.log('📌 Destino ID:', destinoId);
        
        if (!destinoId) {
            console.log('❌ Destino não selecionado');
            showToast('⚠️ Selecione a promoção de destino', 'warning');
            return;
        }

        // Pegar itens selecionados
        const checkboxes = document.querySelectorAll('.bulk-item-checkbox:checked');
        console.log('📌 Checkboxes selecionados:', checkboxes.length);
        
        const selecionados = [];
        checkboxes.forEach(cb => {
            const index = parseInt(cb.dataset.index);
            console.log('📌 Index do checkbox:', index);
            if (!isNaN(index) && itensFiltrados[index]) {
                selecionados.push(itensFiltrados[index]);
            }
        });

        console.log('📌 Itens selecionados:', selecionados.length);

        if (selecionados.length === 0) {
            console.log('❌ Nenhum item selecionado');
            showToast('⚠️ Nenhum item selecionado para ativação', 'warning');
            return;
        }

        console.log(`📌 ${selecionados.length} itens selecionados para ativação`);
        console.log('───────────────────────────────────────────────────────────');
        
        console.log('📊 ITENS SELECIONADOS:');
        selecionados.forEach((item, index) => {
            const mlb = item.id || item.item_id || 'N/A';
            const preco = item.precoDestino || item.price || 0;
            console.log(`   ${index + 1}. ${mlb} - Preço: R$ ${(preco/100).toFixed(2)}`);
        });
        console.log('───────────────────────────────────────────────────────────');

        const destinoPromo = todasPromocoes.find(p => p.id === destinoId);
        if (!destinoPromo) {
            console.log('❌ Promoção de destino não encontrada');
            showToast('Promoção de destino não encontrada', 'error');
            return;
        }

        console.log(`📌 Promoção de destino: ${destinoPromo.name} (${destinoPromo.id})`);
        console.log('───────────────────────────────────────────────────────────');

        // Criar modal de confirmação
        criarModalConfirmacao(selecionados, destinoPromo);
    };

    // ============================================================
    // FUNÇÃO PARA CRIAR MODAL DE CONFIRMAÇÃO
    // ============================================================
    function criarModalConfirmacao(selecionados, destinoPromo) {
        console.log('🔵 Criando modal de confirmação...');
        
        // Remover modal antigo se existir
        const modalAntigo = document.getElementById('modalConfirmacaoAtivacao');
        if (modalAntigo) modalAntigo.remove();

        const modalHTML = `
            <div id="modalConfirmacaoAtivacao" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 99999; display: flex; align-items: center; justify-content: center;">
                <div style="background: white; border-radius: 12px; max-width: 750px; width: 95%; max-height: 90vh; overflow-y: auto; padding: 30px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e9ecef; padding-bottom: 15px; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: #dc3545; font-size: 22px;">
                            <i class="fas fa-exclamation-triangle"></i> Confirmar Ativação
                        </h2>
                        <button onclick="fecharModalConfirmacao()" 
                                style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6c757d;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <p style="margin: 5px 0;"><strong><i class="fas fa-tag"></i> Promoção:</strong> ${destinoPromo.name}</p>
                        <p style="margin: 5px 0;"><strong><i class="fas fa-box"></i> Itens:</strong> ${selecionados.length}</p>
                        <p style="margin: 5px 0;"><strong><i class="fas fa-calendar"></i> Data:</strong> ${new Date().toLocaleString()}</p>
                    </div>

                    <div style="max-height: 250px; overflow-y: auto; border: 1px solid #e9ecef; border-radius: 8px; margin-bottom: 20px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                            <thead style="background: #f8f9fa; position: sticky; top: 0;">
                                <tr>
                                    <th style="padding: 6px 8px; text-align: left; border-bottom: 2px solid #dee2e6;">#</th>
                                    <th style="padding: 6px 8px; text-align: left; border-bottom: 2px solid #dee2e6;">MLB</th>
                                    <th style="padding: 6px 8px; text-align: right; border-bottom: 2px solid #dee2e6;">Preço</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${selecionados.slice(0, 15).map((item, index) => {
                                    const preco = item.precoDestino || item.price || 0;
                                    return `
                                    <tr style="border-bottom: 1px solid #f1f3f5;">
                                        <td style="padding: 4px 8px;">${index + 1}</td>
                                        <td style="padding: 4px 8px; font-weight: 600;">${item.id || item.item_id || 'N/A'}</td>
                                        <td style="padding: 4px 8px; text-align: right; color: #28a745;">R$ ${(preco/100).toFixed(2)}</td>
                                    </tr>
                                `}).join('')}
                                ${selecionados.length > 15 ? `
                                    <tr>
                                        <td colspan="3" style="padding: 8px; text-align: center; color: #6c757d; font-style: italic;">
                                            ... e mais ${selecionados.length - 15} itens
                                        </td>
                                    </tr>
                                ` : ''}
                            </tbody>
                        </table>
                    </div>

                    <div style="background: #fff3cd; padding: 12px 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin-bottom: 20px;">
                        <p style="margin: 0; font-size: 13px;">
                            <i class="fas fa-info-circle"></i> 
                            <strong>Atenção:</strong> Esta ação irá ativar os itens na promoção. 
                            Pode levar alguns minutos.
                        </p>
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 2px solid #e9ecef; padding-top: 20px;">
                        <button onclick="fecharModalConfirmacao()" 
                                class="btn btn-secondary" style="padding: 10px 30px; border: none; border-radius: 6px; background: #6c757d; color: white; cursor: pointer; font-size: 14px;">
                            Cancelar
                        </button>
                        <button onclick="window.confirmarAtivacaoMassa()" 
                                id="btnConfirmarAtivacao"
                                class="btn btn-success" style="padding: 10px 30px; border: none; border-radius: 6px; background: #28a745; color: white; cursor: pointer; font-size: 14px;">
                            <i class="fas fa-check"></i> Confirmar Ativação
                        </button>
                    </div>
                </div>
            </div>
        `;

        const modalDiv = document.createElement('div');
        modalDiv.innerHTML = modalHTML;
        document.body.appendChild(modalDiv.firstElementChild);
        console.log('✅ Modal de confirmação criado!');
    }

    // ============================================================
    // FUNÇÃO PARA FECHAR MODAL DE CONFIRMAÇÃO
    // ============================================================
    function fecharModalConfirmacao() {
        console.log('🔴 Fechando modal de confirmação');
        const modal = document.getElementById('modalConfirmacaoAtivacao');
        if (modal) modal.remove();
    }

    // ============================================================
    // FUNÇÃO PARA CONFIRMAR E EXECUTAR A ATIVAÇÃO EM MASSA
    // ============================================================
    window.confirmarAtivacaoMassa = async function() {
        console.log('🟢 CONFIRMANDO ATIVAÇÃO EM MASSA');
        
        // Fechar modal de confirmação
        fecharModalConfirmacao();

        // Pegar os itens selecionados novamente
        const selecionados = [];
        document.querySelectorAll('.bulk-item-checkbox:checked').forEach(cb => {
            const index = parseInt(cb.dataset.index);
            if (!isNaN(index) && itensFiltrados[index]) {
                selecionados.push(itensFiltrados[index]);
            }
        });

        console.log('📌 Itens confirmados:', selecionados.length);

        if (selecionados.length === 0) {
            showToast('⚠️ Nenhum item selecionado para ativação', 'warning');
            return;
        }

        const destinoId = document.getElementById('bulkPromocaoDestino')?.value;
        if (!destinoId) {
            showToast('⚠️ Selecione a promoção de destino', 'warning');
            return;
        }

        const destinoPromo = todasPromocoes.find(p => p.id === destinoId);
        if (!destinoPromo) {
            showToast('⚠️ Promoção de destino não encontrada', 'error');
            return;
        }

        console.log('🔄 Iniciando ativação em massa...');

        // ============================================================
        // MOSTRAR BARRA DE PROGRESSO
        // ============================================================
        mostrarBarraProgresso(
            `Ativando ${selecionados.length} itens`,
            `Promoção: ${destinoPromo.name}`
        );
        atualizarProgresso(0, 'Preparando ativação...', 'Iniciando processo...', `0 / ${selecionados.length}`);

        try {
            const tokenData = await window.getValidToken?.();
            if (!tokenData?.access_token) {
                showToast('Token não disponível', 'error');
                fecharBarraProgresso();
                return;
            }

            let sucessos = 0;
            let falhas = 0;
            const falhasLista = [];

            console.log('🔄 Iniciando ativação em massa...');

            const batchSize = 20;
            const totalBatches = Math.ceil(selecionados.length / batchSize);

            for (let i = 0; i < selecionados.length; i += batchSize) {
                const batch = selecionados.slice(i, i + batchSize);
                const batchNum = Math.floor(i / batchSize) + 1;
                
                // Atualizar progresso
                const progresso = (i / selecionados.length) * 100;
                atualizarProgresso(
                    progresso,
                    `Ativando lote ${batchNum}/${totalBatches}`,
                    `${sucessos} sucessos, ${falhas} falhas`,
                    `${Math.min(i + batch.length, selecionados.length)} / ${selecionados.length} itens`
                );
                
                console.log(`📦 Processando lote ${batchNum}/${totalBatches} (${batch.length} itens)...`);
                
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
                        price: Math.round(preco)
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
                            console.log(`   ✅ ${itemId} ativado`);
                            return true;
                        } else {
                            const errorText = await response.text();
                            console.error(`   ❌ Falha ${itemId}: ${errorText}`);
                            falhas++;
                            falhasLista.push(`${itemId}: ${errorText}`);
                            return false;
                        }
                    } catch (err) {
                        console.error(`   ❌ Erro ${itemId}: ${err.message}`);
                        falhas++;
                        falhasLista.push(`${itemId}: ${err.message}`);
                        return false;
                    }
                });

                await Promise.all(promises);
                
                // Atualizar progresso após o lote
                const progressoFinal = Math.min(((i + batch.length) / selecionados.length) * 100, 99);
                atualizarProgresso(
                    progressoFinal,
                    `Ativando lote ${batchNum}/${totalBatches}`,
                    `${sucessos} sucessos, ${falhas} falhas`,
                    `${Math.min(i + batch.length, selecionados.length)} / ${selecionados.length} itens`
                );
            }

            // ============================================================
            // FINALIZAR - MOSTRAR RESULTADO
            // ============================================================
            console.log('───────────────────────────────────────────────────────────');
            console.log(`📊 RESULTADO FINAL:`);
            console.log(`   ✅ Sucessos: ${sucessos}`);
            console.log(`   ❌ Falhas: ${falhas}`);
            if (falhasLista.length > 0) {
                console.log(`   📝 Falhas:`);
                falhasLista.slice(0, 10).forEach(f => console.log(`      - ${f}`));
                if (falhasLista.length > 10) {
                    console.log(`      ... e mais ${falhasLista.length - 10} falhas`);
                }
            }
            console.log('═══════════════════════════════════════════════════════════');

            // Atualizar barra para 100%
            atualizarProgresso(
                100,
                '✅ Ativação concluída!',
                `${sucessos} sucessos, ${falhas} falhas`,
                `${selecionados.length} / ${selecionados.length} itens`
            );

            // Esperar 2 segundos e fechar a barra
            await new Promise(resolve => setTimeout(resolve, 2000));
            fecharBarraProgresso();

            let mensagem = `✅ Ativação concluída! ${sucessos} sucessos, ${falhas} falhas`;
            if (falhas > 0 && falhasLista.length > 0) {
                mensagem += `\nFalhas: ${falhasLista.slice(0, 3).join(', ')}${falhasLista.length > 3 ? `... (+${falhasLista.length - 3} mais)` : ''}`;
            }
            
            showToast(mensagem, sucessos > 0 ? 'success' : 'error');

            // Recarregar análise após 3 segundos
            setTimeout(() => {
                window.analisarItens();
            }, 3000);

        } catch (error) {
            console.error('❌ Erro durante ativação em massa:', error);
            fecharBarraProgresso();
            showToast('Erro durante ativação em massa: ' + error.message, 'error');
        }
    };

    // ============================================================
    // EXPORTAR ANÁLISE PARA EXCEL
    // ============================================================
    window.exportarAnaliseBulkExcel = function() {
        if (itensFiltrados.length === 0) {
            showToast('⚠️ Nenhum dado para exportar', 'warning');
            return;
        }

        try {
            const dados = itensFiltrados.map(item => ({
                'MLB': item.id || item.item_id || 'N/A',
                'Status Origem': item.status || 'N/A',
                'Preço Origem (R$)': item.precoOrigemReais || 0,
                '% Desconto Origem': item.percentOrigem || 0,
                'Preço Destino (R$)': item.precoDestinoReais !== null ? item.precoDestinoReais : 'N/A',
                '% Desconto Destino': item.percentDestino !== null ? item.percentDestino : 'N/A',
                'Status Destino': item.statusDestino || 'N/A',
                'Já Ativo na Destino': item.jaAtivo ? 'Sim' : 'Não',
                'Elegível': item.elegivel ? 'Sim' : 'Não',
                'Motivo': item.motivo || '',
                'Regra Aplicada': item.regraAplicada || ''
            }));

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(dados);
            XLSX.utils.book_append_sheet(wb, ws, 'Análise Promoções');
            
            const colWidths = [
                { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 18 },
                { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 20 },
                { wch: 12 }, { wch: 50 }, { wch: 50 }
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

    // ============================================================
    // INICIALIZAÇÃO
    // ============================================================
    console.log('📢 [PROMOÇÕES] Módulo carregado com sucesso!');
    console.log(`📢 [PROMOÇÕES] Bloqueio automático: MLBs com < ${DIAS_BLOQUEIO_AUTOMATICO} dias`);

})();