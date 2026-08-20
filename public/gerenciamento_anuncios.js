// ================================================================
// GERENCIAMENTO DE ANÚNCIOS - MÓDULO COMPLETO
// ================================================================

(function() {
    'use strict';

    // ============================================================
    // CONFIGURAÇÃO
    // ============================================================

    const GA = {
        api: 'https://api.mercadolibre.com',
        site: 'MLB',
        worker: 'https://purple-bonus-3b1c.andmiotto1998.workers.dev',
        
        rows: [],
        filtered: [],
        page: 1,
        pageSize: 20,
        
        token: null,
        sellerId: null,
        products: [],
        productBySku: new Map(),
        productsByMlb: new Map(),
        fullCache: new Map(),
        
        listingTypeNames: new Map(),
        exposureNames: new Map(),
        exposureByListingType: new Map(),
        
        loading: false,
        totalAnuncios: 0,
        totalEstoque: 0,
        semVinculo: 0
    };

    // ============================================================
    // UTILITÁRIOS
    // ============================================================

    function esc(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function skuBase(sku) {
        if (!sku) return '';
        let resultado = String(sku).trim().toUpperCase();
        if (/^\d{3}/.test(resultado)) {
            resultado = resultado.slice(3);
        }
        return resultado.slice(0, 8);
    }

    function attr(attributes, id) {
        return (attributes || []).find(
            a => String(a?.id || '').toUpperCase() === id
        )?.value_name || '';
    }

    function extractSku(item, variation = null) {

    // =========================================================
    // AUXILIAR PARA PROCURAR SELLER_SKU NOS ATRIBUTOS
    // =========================================================

    function buscarSkuNosAtributos(attributes) {

        if (!Array.isArray(attributes)) {
            return '';
        }

        const atributo = attributes.find(attr => {

            const id =
                String(
                    attr?.id ||
                    attr?.name ||
                    ''
                )
                    .trim()
                    .toUpperCase();

            return (
                id === 'SELLER_SKU' ||
                id === 'SKU'
            );
        });

        if (!atributo) {
            return '';
        }

        return String(
            atributo.value_name ??
            atributo.value ??
            atributo.value_id ??
            ''
        ).trim();
    }


    // =========================================================
    // SE FOR VARIAÇÃO
    //
    // IMPORTANTE:
    // Não usamos o SKU do item principal como fallback aqui,
    // pois cada variação pode ter um SKU diferente.
    // =========================================================

    if (variation) {

        const candidatos = [

            // Alguns retornos novos
            variation.seller_sku,

            // Campo oficial SELLER_SKU
            buscarSkuNosAtributos(
                variation.attributes
            ),

            // Algumas estruturas colocam atributos aqui
            buscarSkuNosAtributos(
                variation.attribute_combinations
            ),

            // Legado
            variation.seller_custom_field

        ];


        for (const candidato of candidatos) {

            if (
                candidato !== null &&
                candidato !== undefined &&
                String(candidato).trim() !== ''
            ) {

                return String(
                    candidato
                ).trim();
            }
        }


        return '';
    }


    // =========================================================
    // ITEM SEM VARIAÇÕES
    // =========================================================

    const candidatos = [

        item?.seller_sku,

        buscarSkuNosAtributos(
            item?.attributes
        ),

        item?.seller_custom_field

    ];


    for (const candidato of candidatos) {

        if (
            candidato !== null &&
            candidato !== undefined &&
            String(candidato).trim() !== ''
        ) {

            return String(
                candidato
            ).trim();
        }
    }


    return '';
}

    function parseMlbCodes(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value.map(String);
        if (typeof value === 'object') {
            return Object.values(value).flat().map(String);
        }
        const texto = String(value).trim();
        try {
            const json = JSON.parse(texto);
            if (Array.isArray(json)) return json.map(String);
            if (json && typeof json === 'object') {
                return Object.values(json).flat().map(String);
            }
        } catch (e) {}
        return texto.split(/[\s,;|]+/).filter(Boolean);
    }

    // ============================================================
    // DATA UTILITY
    // ============================================================

    function dataLocalISO(data = new Date()) {
        const d = new Date(data);
        return d.getFullYear() + '-' + 
               String(d.getMonth() + 1).padStart(2, '0') + '-' + 
               String(d.getDate()).padStart(2, '0');
    }

    async function loadInternalStock() {

    console.log('📦 Carregando estoque interno...');

    let data = null;

    // =========================================================
    // 1. TENTAR REUTILIZAR OS PRODUTOS JÁ CARREGADOS
    //    PELO estoque_gestao.js
    // =========================================================

    try {

        if (
            typeof produtosEstoque !== 'undefined' &&
            Array.isArray(produtosEstoque) &&
            produtosEstoque.length > 0
        ) {

            data = produtosEstoque;

            console.log(
                `✅ Reutilizando ${data.length} produtos já carregados em produtosEstoque`
            );
        }

    } catch (error) {

        console.warn(
            '⚠️ Não foi possível acessar produtosEstoque diretamente:',
            error
        );
    }


    // =========================================================
    // 2. SE NÃO ESTIVER CARREGADO, BUSCAR NO SUPABASE
    // =========================================================

    if (!data) {

        if (!window.supabaseClient) {

            throw new Error(
                'Supabase não inicializado.'
            );
        }


        console.log(
            '🔄 Buscando produtos diretamente no Supabase...'
        );


        const {
            data: produtos,
            error
        } = await window.supabaseClient
            .from('produtos_estoque')
            .select('*')
            .order('nome', {
                ascending: true
            });


        if (error) {

            console.error(
                '❌ Erro Supabase ao carregar produtos:',
                error
            );


            console.error(
                '❌ Detalhes erro Supabase:',
                JSON.stringify(
                    error,
                    null,
                    2
                )
            );


            throw new Error(
                error.message ||
                error.details ||
                error.hint ||
                'Erro ao carregar produtos do estoque'
            );
        }


        data = produtos || [];


        console.log(
            `✅ ${data.length} produtos carregados diretamente do Supabase`
        );
    }


    // =========================================================
    // 3. SALVAR PRODUTOS
    // =========================================================

    GA.products = data || [];


    // Limpar índices antigos
    GA.productBySku.clear();
    GA.productsByMlb.clear();


    // =========================================================
    // 4. INDEXAR PRODUTOS
    // =========================================================

    for (const produto of GA.products) {

        if (!produto) {
            continue;
        }


        // =====================================================
        // INDEXAR POR SKU
        // =====================================================

        const base = skuBase(
            produto.sku
        );


        if (base) {

            // Caso ainda não exista
            if (!GA.productBySku.has(base)) {

                GA.productBySku.set(
                    base,
                    produto
                );

            } else {

                console.warn(
                    `⚠️ SKU base duplicado no estoque: ${base}`,
                    {
                        existente:
                            GA.productBySku.get(base),

                        novo:
                            produto
                    }
                );
            }
        }


        // =====================================================
        // PEGAR MLB_CODES
        //
        // No seu sistema ele pode existir:
        //
        // produto.mlb_codes
        //
        // OU:
        //
        // produto.dados_extra.mlb_codes
        // =====================================================

        const mlbCodesRaw =
            produto.mlb_codes ??
            produto.dados_extra?.mlb_codes ??
            null;


        const mlbs =
            parseMlbCodes(
                mlbCodesRaw
            );


        // =====================================================
        // INDEXAR CADA MLB
        // =====================================================

        for (const code of mlbs) {

            if (!code) {
                continue;
            }


            const match =
                String(code)
                    .toUpperCase()
                    .match(/MLB\d+/);


            if (!match) {
                continue;
            }


            const mlb =
                match[0];


            if (!GA.productsByMlb.has(mlb)) {

                GA.productsByMlb.set(
                    mlb,
                    []
                );
            }


            const lista =
                GA.productsByMlb.get(
                    mlb
                );


            // Evitar duplicar o mesmo produto
            if (
                !lista.some(
                    p =>
                        String(p.id) ===
                        String(produto.id)
                )
            ) {

                lista.push(
                    produto
                );
            }
        }
    }


    // =========================================================
    // 5. LOGS DE DIAGNÓSTICO
    // =========================================================

    console.log(
        `✅ ${GA.products.length} produtos internos carregados.`
    );


    console.log(
        `🔑 ${GA.productBySku.size} SKUs indexados.`
    );


    console.log(
        `🏷️ ${GA.productsByMlb.size} MLBs indexados.`
    );


    // Mostrar alguns exemplos para conferirmos
    console.log(
        '📦 Exemplos de produtos:',
        GA.products.slice(
            0,
            5
        ).map(
            produto => ({
                id:
                    produto.id,

                nome:
                    produto.nome,

                sku:
                    produto.sku,

                quantidade:
                    produto.quantidade,

                mlb_codes:
                    produto.mlb_codes ??
                    produto.dados_extra?.mlb_codes ??
                    null
            })
        )
    );
}

    function warehouseStock(sku, itemId) {
        if (sku) {
            const partes = String(sku).split('.').filter(Boolean);
            let quantidadePossivel = Infinity;
            let algumFaltando = false;

            for (const parte of partes) {
                const match = parte.match(/^(\d{3})(.+)$/);
                const quantidadePorKit = match ? Math.max(1, parseInt(match[1], 10) || 1) : 1;
                const skuReal = match ? match[2] : parte;
                const produto = GA.productBySku.get(skuBase(skuReal));
                if (!produto) {
                    algumFaltando = true;
                    continue;
                }
                const estoqueAtual = Number(produto.quantidade) || 0;
                const kitsPossiveis = Math.floor(estoqueAtual / quantidadePorKit);
                quantidadePossivel = Math.min(quantidadePossivel, kitsPossiveis);
            }

            if (!algumFaltando && partes.length && Number.isFinite(quantidadePossivel)) {
                return quantidadePossivel;
            }
        }

        const produtosMlb = GA.productsByMlb.get(String(itemId).toUpperCase()) || [];
        if (produtosMlb.length === 1) {
            return Number(produtosMlb[0].quantidade) || 0;
        }
        return null;
    }

    // ============================================================
    // ML API
    // ============================================================

    async function getToken() {
        if (GA.token) return GA.token;
        try {
            if (typeof window.getValidToken === 'function') {
                const tokenData = await window.getValidToken();
                GA.token = tokenData?.access_token || tokenData || null;
            }
        } catch (error) {
            console.warn('⚠️ getValidToken falhou:', error);
        }
        if (!GA.token) {
            GA.token = window.mlTokenStatus?.access_token || localStorage.getItem('ml_access_token');
        }
        if (!GA.token) {
            throw new Error('Token do Mercado Livre não encontrado.');
        }
        return GA.token;
    }

    async function ml(path) {
        const accessToken = await getToken();
        const url = path.startsWith('http') ? path : `${GA.api}${path}`;
        const proxyUrl = `${GA.worker}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(accessToken)}`;
        const response = await fetch(proxyUrl);
        const text = await response.text();
        let data;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
        if (!response.ok) {
            throw new Error(data?.message || data?.error || `HTTP ${response.status}`);
        }
        return data;
    }

    async function getSellerId() {
        if (GA.sellerId) return GA.sellerId;
        const me = await ml('/users/me');
        GA.sellerId = me?.id;
        if (!GA.sellerId) throw new Error('seller_id não encontrado.');
        console.log('👤 Seller ID:', GA.sellerId);
        return GA.sellerId;
    }

    // ============================================================
    // PROGRESSO
    // ============================================================

    function mostrarProgresso(texto) {
        const bar = document.getElementById('gaProgressBar');
        const text = document.getElementById('gaProgressText');
        if (bar) bar.classList.remove('hidden');
        if (text) text.textContent = texto;
    }

    function esconderProgresso() {
        const bar = document.getElementById('gaProgressBar');
        if (bar) bar.classList.add('hidden');
    }

    // ============================================================
    // BUSCAR ANÚNCIOS
    // ============================================================

    async function scanAllIds() {
        const seller = await getSellerId();
        const ids = [];
        const vistos = new Set();
        let scrollId = null;

        for (let loop = 0; loop < 10000; loop++) {
            let path = `/users/${seller}/items/search?search_type=scan&limit=100`;
            if (scrollId) {
                path += `&scroll_id=${encodeURIComponent(scrollId)}`;
            }
            const data = await ml(path);
            const resultados = Array.isArray(data?.results) ? data.results : [];
            if (!resultados.length) break;

            let adicionados = 0;
            for (const id of resultados) {
                if (!vistos.has(id)) {
                    vistos.add(id);
                    ids.push(id);
                    adicionados++;
                }
            }
            mostrarProgresso(`Localizando anúncios... ${ids.length}`);
            scrollId = data?.scroll_id || scrollId;
            if (!scrollId || !adicionados) break;
        }
        console.log(`✅ ${ids.length} anúncios encontrados.`);
        return ids;
    }

    async function getAllItems(ids) {

    const resultado = [];


    // =========================================================
    // CAMPOS QUE QUEREMOS RECEBER
    // =========================================================

    const attributes = [

        'id',
        'title',
        'thumbnail',
        'permalink',
        'status',
        'sub_status',
        'price',
        'listing_type_id',
        'shipping',
        'tags',

        'inventory_id',
        'user_product_id',

        'seller_sku',
        'seller_custom_field',

        'attributes',
        'variations'

    ].join(',');


    // =========================================================
    // MULTIGET
    //
    // Mercado Livre permite até 20 itens por chamada.
    // =========================================================

    for (
        let i = 0;
        i < ids.length;
        i += 20
    ) {

        const grupo =
            ids.slice(
                i,
                i + 20
            );


        // =====================================================
        // include_attributes=all
        //
        // ESSENCIAL PARA PEGAR SELLER_SKU DAS VARIAÇÕES
        // =====================================================

        const path =
            `/items?ids=${grupo.join(',')}` +
            `&include_attributes=all` +
            `&attributes=${encodeURIComponent(attributes)}`;


        let data = null;


        // =====================================================
        // RETENTATIVA SIMPLES EM CASO DE 429
        // =====================================================

        for (
            let tentativa = 1;
            tentativa <= 5;
            tentativa++
        ) {

            try {

                data =
                    await ml(path);

                break;

            } catch (error) {

                const mensagem =
                    String(
                        error?.message ||
                        error ||
                        ''
                    ).toLowerCase();


                const rateLimit =
                    mensagem.includes(
                        'rate limit'
                    ) ||
                    mensagem.includes(
                        'too many requests'
                    ) ||
                    mensagem.includes(
                        '429'
                    );


                if (
                    !rateLimit ||
                    tentativa === 5
                ) {

                    throw error;
                }


                console.warn(
                    `⚠️ Rate limit no multiget. Tentativa ${tentativa}/5`
                );


                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            tentativa * 2000
                        )
                );
            }
        }


        // =====================================================
        // PROCESSAR RESPOSTA
        // =====================================================

        for (const resposta of data || []) {

            if (
                resposta?.code === 200 &&
                resposta?.body
            ) {

                resultado.push(
                    resposta.body
                );
            }
        }


        progress(
            `Lendo anúncios... ` +
            `${Math.min(i + 20, ids.length)}` +
            `/${ids.length}`
        );


        // Pequeno intervalo entre os multigets
        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    80
                )
        );
    }


    // =========================================================
    // DIAGNÓSTICO DE SKU
    // =========================================================

    let linhas = 0;
    let linhasSemSku = 0;


    for (const item of resultado) {

        const variations =
            Array.isArray(item.variations)
                ? item.variations
                : [];


        if (variations.length) {

            for (const variation of variations) {

                linhas++;

                const sku =
                    extractSku(
                        item,
                        variation
                    );


                if (!sku) {

                    linhasSemSku++;

                    console.warn(
                        '⚠️ Variação sem SKU:',
                        {
                            MLB:
                                item.id,

                            variation_id:
                                variation.id,

                            user_product_id:
                                variation.user_product_id,

                            seller_sku:
                                variation.seller_sku,

                            seller_custom_field:
                                variation.seller_custom_field,

                            attributes:
                                variation.attributes
                        }
                    );
                }
            }

        } else {

            linhas++;

            const sku =
                extractSku(
                    item
                );


            if (!sku) {

                linhasSemSku++;

                console.warn(
                    '⚠️ Anúncio sem SKU:',
                    {
                        MLB:
                            item.id,

                        user_product_id:
                            item.user_product_id,

                        seller_sku:
                            item.seller_sku,

                        seller_custom_field:
                            item.seller_custom_field,

                        attributes:
                            item.attributes
                    }
                );
            }
        }
    }


    console.log(
        `🏷️ SKU: ${linhas - linhasSemSku}/${linhas} linhas com SKU.`
    );


    if (linhasSemSku > 0) {

        console.warn(
            `⚠️ ${linhasSemSku} linha(s) continuam sem SELLER_SKU cadastrado/retornado pelo ML.`
        );
    }


    return resultado;
}

    // ============================================================
    // IDENTIFICAR FULL
    // ============================================================

    function isFull(item) {
        const logisticType = String(item?.shipping?.logistic_type || '').toLowerCase();
        const tags = (item?.tags || []).map(t => String(t).toLowerCase());
        return logisticType === 'fulfillment' ||
               tags.includes('fulfillment') ||
               !!item?.inventory_id ||
               (item?.variations || []).some(v => !!v?.inventory_id);
    }

    function buildRows(items) {

    const rows = [];

    for (const item of items) {

        if (!isFull(item)) {
            continue;
        }

        const variations =
            Array.isArray(item.variations)
                ? item.variations
                : [];

        // =====================================================
        // ANÚNCIO COM VARIAÇÕES
        // =====================================================

        if (variations.length) {

            for (const variation of variations) {

                const sku =
                    extractSku(
                        item,
                        variation
                    );

                const internalWarehouse =
                    warehouseStock(
                        sku,
                        item.id
                    );

                rows.push({

                    key:
                        `${item.id}:${variation.id}`,

                    itemId:
                        item.id,

                    variationId:
                        variation.id,

                    title:
                        item.title || '-',

                    thumbnail:
                        item.thumbnail || '',

                    permalink:
                        item.permalink || '',

                    sku:
                        sku,

                    // NOVO
                    userProductId:
                        variation.user_product_id ||
                        item.user_product_id ||
                        null,

                    inventoryId:
                        variation.inventory_id ||
                        item.inventory_id ||
                        null,

                    listingTypeId:
                        item.listing_type_id || '',

                    status:
                        item.status || '',

                    price:
                        variation.price ??
                        item.price ??
                        null,

                    // =================================================
                    // ESTOQUE INTERNO DO SEU SISTEMA
                    // =================================================

                    internalWarehouse:
                        internalWarehouse,

                    // =================================================
                    // ESTOQUE REAL DO MERCADO LIVRE
                    // =================================================

                    warehouse:
                        null,

                    full:
                        null,

                    mlTotal:
                        null,

                    unavailable:
                        null,

                    fullTotal:
                        null,

                    stockLocations:
                        [],

                    stockError:
                        null,

                    exposureId:
                        '',

                    exposureName:
                        '',

                    listingTypeName:
                        ''
                });
            }

        } else {

            // =================================================
            // ANÚNCIO SEM VARIAÇÕES
            // =================================================

            const sku =
                extractSku(item);

            const internalWarehouse =
                warehouseStock(
                    sku,
                    item.id
                );

            rows.push({

                key:
                    item.id,

                itemId:
                    item.id,

                variationId:
                    null,

                title:
                    item.title || '-',

                thumbnail:
                    item.thumbnail || '',

                permalink:
                    item.permalink || '',

                sku:
                    sku,

                // NOVO
                userProductId:
                    item.user_product_id ||
                    null,

                inventoryId:
                    item.inventory_id ||
                    null,

                listingTypeId:
                    item.listing_type_id ||
                    '',

                status:
                    item.status || '',

                price:
                    item.price ??
                    null,

                // Estoque interno
                internalWarehouse:
                    internalWarehouse,

                // Estoque Mercado Livre
                warehouse:
                    null,

                full:
                    null,

                mlTotal:
                    null,

                unavailable:
                    null,

                fullTotal:
                    null,

                stockLocations:
                    [],

                stockError:
                    null,

                exposureId:
                    '',

                exposureName:
                    '',

                listingTypeName:
                    ''
            });
        }
    }

    return rows;
}

async function buscarEstoqueUserProduct(userProductId) {

    if (!userProductId) {

        return {
            success: false,
            warehouse: null,
            full: null,
            total: null,
            locations: [],
            error: 'Sem user_product_id'
        };
    }


    // =========================================================
    // CRIAR CACHES
    // =========================================================

    if (!GA.userProductStockCache) {

        GA.userProductStockCache =
            new Map();
    }


    if (!GA.userProductStockPromises) {

        GA.userProductStockPromises =
            new Map();
    }


    // =========================================================
    // CACHE PRONTO
    // =========================================================

    if (
        GA.userProductStockCache.has(
            userProductId
        )
    ) {

        return GA.userProductStockCache.get(
            userProductId
        );
    }


    // =========================================================
    // EVITAR DUAS REQUISIÇÕES SIMULTÂNEAS DO MESMO UP
    // =========================================================

    if (
        GA.userProductStockPromises.has(
            userProductId
        )
    ) {

        return await GA.userProductStockPromises.get(
            userProductId
        );
    }


    // =========================================================
    // CRIAR PROMISE DA CONSULTA
    // =========================================================

    const promise =
        (async () => {

            let ultimoErro =
                null;


            for (
                let tentativa = 1;
                tentativa <= 6;
                tentativa++
            ) {

                try {

                    const data =
                        await ml(
                            `/user-products/${encodeURIComponent(userProductId)}/stock`
                        );


                    const locations =
                        Array.isArray(
                            data?.locations
                        )
                            ? data.locations
                            : [];


                    let estoqueFull =
                        0;

                    let estoqueDepositoML =
                        0;

                    let estoqueTotal =
                        0;

                    let encontrouFull =
                        false;

                    let encontrouDeposito =
                        false;


                    // =========================================
                    // SOMAR LOCALIZAÇÕES
                    // =========================================

                    for (const location of locations) {

                        const type =
                            String(
                                location?.type ||
                                ''
                            ).toLowerCase();


                        const quantidade =
                            Number(
                                location?.quantity
                            ) || 0;


                        estoqueTotal +=
                            quantidade;


                        // =====================================
                        // FULL
                        // =====================================

                        if (
                            type ===
                                'meli_facility' ||
                            type ===
                                'fulfillment'
                        ) {

                            estoqueFull +=
                                quantidade;

                            encontrouFull =
                                true;
                        }


                        // =====================================
                        // DEPÓSITO DO VENDEDOR
                        // =====================================

                        else if (
                            type ===
                                'selling_address' ||
                            type ===
                                'seller_warehouse'
                        ) {

                            estoqueDepositoML +=
                                quantidade;

                            encontrouDeposito =
                                true;
                        }
                    }


                    const result = {

                        success:
                            true,

                        warehouse:
                            encontrouDeposito
                                ? estoqueDepositoML
                                : 0,

                        full:
                            encontrouFull
                                ? estoqueFull
                                : 0,

                        total:
                            estoqueTotal,

                        locations:
                            locations,

                        error:
                            null
                    };


                    // =========================================
                    // SALVAR SOMENTE RESULTADO VÁLIDO
                    // =========================================

                    GA.userProductStockCache.set(
                        userProductId,
                        result
                    );


                    return result;

                } catch (error) {

                    ultimoErro =
                        error;


                    const mensagem =
                        String(
                            error?.message ||
                            error ||
                            ''
                        ).toLowerCase();


                    const rateLimit =
                        mensagem.includes(
                            'rate limit'
                        ) ||
                        mensagem.includes(
                            'too many requests'
                        ) ||
                        mensagem.includes(
                            '429'
                        ) ||
                        mensagem.includes(
                            'over quota'
                        );


                    // =========================================
                    // ERRO QUE NÃO É RATE LIMIT
                    // =========================================

                    if (!rateLimit) {

                        console.warn(
                            `⚠️ Erro estoque UP ${userProductId}:`,
                            error
                        );

                        break;
                    }


                    // =========================================
                    // RATE LIMIT
                    // =========================================

                    console.warn(
                        `⏳ Rate limit em ${userProductId}. Tentativa ${tentativa}/6`
                    );


                    // Backoff progressivo
                    const espera =
                        Math.min(
                            15000,
                            1500 *
                            Math.pow(
                                2,
                                tentativa - 1
                            )
                        );


                    await new Promise(
                        resolve =>
                            setTimeout(
                                resolve,
                                espera
                            )
                    );
                }
            }


            // =================================================
            // NÃO SALVAR ERRO DE RATE LIMIT NO CACHE
            // =================================================

            return {

                success:
                    false,

                warehouse:
                    null,

                full:
                    null,

                total:
                    null,

                locations:
                    [],

                error:
                    ultimoErro?.message ||
                    'Erro ao consultar estoque'
            };
        })();


    GA.userProductStockPromises.set(
        userProductId,
        promise
    );


    try {

        return await promise;

    } finally {

        GA.userProductStockPromises.delete(
            userProductId
        );
    }
}

async function buscarDetalhesEstoqueFull(inventoryId) {

    if (!inventoryId) {

        return {
            success: false,
            available: null,
            unavailable: null,
            total: null,
            details: [],
            error: 'Sem inventory_id'
        };
    }

    if (!GA.fullDetailCache) {
        GA.fullDetailCache = new Map();
    }

    if (
        GA.fullDetailCache.has(
            inventoryId
        )
    ) {

        return GA.fullDetailCache.get(
            inventoryId
        );
    }

    try {

        const data =
            await ml(
                `/inventories/${encodeURIComponent(inventoryId)}/stock/fulfillment`
            );

        console.log(
            `🏭 Estoque FULL ${inventoryId}:`,
            data
        );

        const result = {

            success: true,

            available:
                Number.isFinite(
                    Number(
                        data?.available_quantity
                    )
                )
                    ? Number(
                        data.available_quantity
                    )
                    : null,

            unavailable:
                Number.isFinite(
                    Number(
                        data?.not_available_quantity
                    )
                )
                    ? Number(
                        data.not_available_quantity
                    )
                    : null,

            total:
                Number.isFinite(
                    Number(
                        data?.total
                    )
                )
                    ? Number(
                        data.total
                    )
                    : null,

            details:
                Array.isArray(
                    data?.not_available_detail
                )
                    ? data.not_available_detail
                    : [],

            error:
                null
        };

        GA.fullDetailCache.set(
            inventoryId,
            result
        );

        return result;

    } catch (error) {

        console.warn(
            `⚠️ Erro estoque FULL ${inventoryId}:`,
            error
        );

        const result = {

            success: false,

            available:
                null,

            unavailable:
                null,

            total:
                null,

            details:
                [],

            error:
                error.message
        };

        GA.fullDetailCache.set(
            inventoryId,
            result
        );

        return result;
    }
}

    // ============================================================
    // EXPOSIÇÃO
    // ============================================================

    async function loadExposure(rows) {
        try {
            const types = await ml(`/sites/${GA.site}/listing_types`);
            for (const type of types || []) {
                GA.listingTypeNames.set(type.id, type.name || type.id);
            }
        } catch (error) {
            console.warn('⚠️ Erro ao buscar listing_types:', error);
        }

        GA.listingTypeNames.set('gold_pro', 'Premium');
        GA.listingTypeNames.set('gold_special', 'Clássico');
        GA.listingTypeNames.set('gold_premium', 'Premium');
        GA.listingTypeNames.set('gold', 'Ouro');
        GA.listingTypeNames.set('silver', 'Prata');
        GA.listingTypeNames.set('free', 'Grátis');

        try {
            const exposures = await ml(`/sites/${GA.site}/listing_exposures`);
            for (const exposure of exposures || []) {
                GA.exposureNames.set(exposure.id, exposure.name || exposure.id);
            }
        } catch (error) {
            console.warn('⚠️ Endpoint listing_exposures não disponível:', error);
        }

        const uniqueTypes = [...new Set(rows.map(row => row.listingTypeId).filter(Boolean))];
        for (const typeId of uniqueTypes) {
            try {
                const details = await ml(`/sites/${GA.site}/listing_types/${encodeURIComponent(typeId)}`);
                const exposure = details?.configuration?.listing_exposure || 
                                 details?.configuration?.listing_exposure_id || '';
                GA.exposureByListingType.set(typeId, exposure);
            } catch (error) {
                console.warn(`⚠️ Não foi possível consultar exposição de ${typeId}:`, error);
                GA.exposureByListingType.set(typeId, '');
            }
        }

        const exposureFallback = {
            gold_pro: 'Alta',
            gold_premium: 'Alta',
            gold_special: 'Alta',
            gold: 'Alta',
            silver: 'Média',
            free: 'Baixa'
        };

        for (const row of rows) {
            row.listingTypeName = GA.listingTypeNames.get(row.listingTypeId) || row.listingTypeId || '-';
            row.exposureId = GA.exposureByListingType.get(row.listingTypeId) || '';
            row.exposureName = GA.exposureNames.get(row.exposureId) || 
                               row.exposureId || 
                               exposureFallback[row.listingTypeId] || '-';
        }
    }

    // ============================================================
    // ESTOQUE FULL
    // ============================================================

    async function fullStock(inventoryId) {
        if (!inventoryId) {
            return { full: null, unavailable: null, total: null, error: 'Sem inventory_id' };
        }
        if (GA.fullCache.has(inventoryId)) {
            return GA.fullCache.get(inventoryId);
        }

        try {
            const data = await ml(`/inventories/${encodeURIComponent(inventoryId)}/stock/fulfillment`);
            const result = {
                full: Number.isFinite(Number(data?.available_quantity)) ? Number(data.available_quantity) : null,
                unavailable: Number.isFinite(Number(data?.not_available_quantity)) ? Number(data.not_available_quantity) : null,
                total: Number.isFinite(Number(data?.total)) ? Number(data.total) : null,
                error: null
            };
            GA.fullCache.set(inventoryId, result);
            return result;
        } catch (error) {
            console.warn(`⚠️ fulfillment stock falhou para ${inventoryId}:`, error.message);
        }

        try {
            const data = await ml(`/inventories/${encodeURIComponent(inventoryId)}/stock`);
            const available = data?.total?.available_quantity ?? data?.available_quantity ?? null;
            let unavailable = data?.total?.not_available_quantity ?? data?.not_available_quantity ?? null;
            let total = data?.total?.quantity ?? data?.total_quantity ?? null;
            if (typeof data?.total === 'number') total = data.total;

            const result = {
                full: Number.isFinite(Number(available)) ? Number(available) : null,
                unavailable: Number.isFinite(Number(unavailable)) ? Number(unavailable) : null,
                total: Number.isFinite(Number(total)) ? Number(total) : null,
                error: null
            };
            GA.fullCache.set(inventoryId, result);
            return result;
        } catch (error) {
            const result = { full: null, unavailable: null, total: null, error: error.message };
            GA.fullCache.set(inventoryId, result);
            return result;
        }
    }

    function progress(texto = '') {

    const box =
        document.getElementById(
            'gaProgress'
        );

    if (!box) {
        return;
    }

    // Se recebeu texto, mostrar
    if (
        texto &&
        String(texto).trim() !== ''
    ) {

        box.style.display =
            'block';

        box.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            ${typeof esc === 'function'
                ? esc(texto)
                : String(texto)}
        `;

        return;
    }

    // Se não recebeu texto, esconder
    box.style.display =
        'none';

    box.innerHTML =
        '';
}

    async function loadFullStocks(rows) {

    if (
        !Array.isArray(rows) ||
        rows.length === 0
    ) {

        return;
    }


    console.log(
        `📦 Preparando estoque ML para ${rows.length} linha(s)...`
    );


    // =========================================================
    // AGRUPAR LINHAS PELO USER PRODUCT
    //
    // Um mesmo User Product pode estar associado a mais de
    // uma condição de venda/anúncio.
    //
    // Assim evitamos consultar o mesmo estoque várias vezes.
    // =========================================================

    const rowsPorUserProduct =
        new Map();


    for (const row of rows) {

        if (!row.userProductId) {

            row.stockError =
                'Sem user_product_id';

            continue;
        }


        if (
            !rowsPorUserProduct.has(
                row.userProductId
            )
        ) {

            rowsPorUserProduct.set(
                row.userProductId,
                []
            );
        }


        rowsPorUserProduct
            .get(
                row.userProductId
            )
            .push(
                row
            );
    }


    const userProducts =
        [
            ...rowsPorUserProduct.keys()
        ];


    console.log(
        `📦 ${userProducts.length} User Products únicos para consultar.`
    );


    console.log(
        `♻️ ${rows.length - userProducts.length} consultas duplicadas eliminadas.`
    );


    let concluidos =
        0;

    let sucessos =
        0;

    let erros =
        0;


    // =========================================================
    // IMPORTANTE
    //
    // NÃO USAR Promise.all / múltiplos workers aqui.
    //
    // O endpoint possui limite baixo de RPM.
    //
    // Vamos trabalhar sequencialmente e dar intervalo entre
    // chamadas.
    // =========================================================

    for (const userProductId of userProducts) {

        const linhasDoUP =
            rowsPorUserProduct.get(
                userProductId
            ) || [];


        try {

            const estoque =
                await buscarEstoqueUserProduct(
                    userProductId
                );


            // =================================================
            // APLICAR O MESMO ESTOQUE EM TODAS AS LINHAS
            // DESSE USER PRODUCT
            // =================================================

            for (const row of linhasDoUP) {

                if (estoque?.success) {

                    row.warehouse =
                        estoque.warehouse;

                    row.full =
                        estoque.full;

                    row.mlTotal =
                        estoque.total;

                    row.stockLocations =
                        estoque.locations ||
                        [];

                    row.stockError =
                        null;


                    // =========================================
                    // NÃO CONSULTAR INVENTORY AGORA
                    //
                    // Isso dobrava as chamadas desnecessariamente.
                    // =========================================

                    row.unavailable =
                        null;

                    row.fullTotal =
                        null;


                } else {

                    row.warehouse =
                        null;

                    row.full =
                        null;

                    row.mlTotal =
                        null;

                    row.stockLocations =
                        [];

                    row.stockError =
                        estoque?.error ||
                        'Erro ao consultar estoque';
                }
            }


            if (estoque?.success) {

                sucessos++;

            } else {

                erros++;
            }

        } catch (error) {

            erros++;


            console.warn(
                `⚠️ Erro processando estoque ${userProductId}:`,
                error
            );


            for (const row of linhasDoUP) {

                row.stockError =
                    error.message ||
                    'Erro ao consultar estoque';
            }
        }


        concluidos++;


        // =====================================================
        // PROGRESSO
        // =====================================================

        progress(
            `Consultando estoque Mercado Livre... ` +
            `${concluidos}/${userProducts.length}`
        );


        // =====================================================
        // ATUALIZAR A TABELA PROGRESSIVAMENTE
        // =====================================================

        if (
    concluidos % 20 === 0
) {

    try {

        // Atualizar tela
        updateSummary();

        applyFilters();


        // =====================================================
        // SALVAR PROGRESSIVAMENTE
        // =====================================================

        const linhasAtualizadas =
            [];


        for (
            const [
                userProduct,
                linhas
            ]
            of rowsPorUserProduct
        ) {

            if (
                linhasAtualizadas.length >=
                200
            ) {
                break;
            }


            for (const linha of linhas) {

                if (
                    linha.warehouse !== null ||
                    linha.full !== null
                ) {

                    linhasAtualizadas.push(
                        linha
                    );
                }
            }
        }


        if (
            linhasAtualizadas.length
        ) {

            await salvarAnunciosBanco(
                linhasAtualizadas,
                false
            );
        }


    } catch (error) {

        console.warn(
            '⚠️ Não foi possível salvar atualização parcial:',
            error
        );
    }
}


        // =====================================================
        // PAUSA ENTRE REQUISIÇÕES
        //
        // 900ms deixa margem abaixo do limite documentado,
        // inclusive para outras chamadas do sistema.
        // =====================================================

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    900
                )
        );
    }


    console.log(
        '✅ Consulta de estoque finalizada.',
        {
            userProducts:
                userProducts.length,

            sucessos:
                sucessos,

            erros:
                erros,

            linhas:
                rows.length
        }
    );


    // =========================================================
    // DIAGNÓSTICO FINAL
    // =========================================================

    console.table(
        rows.slice(
            0,
            30
        ).map(
            row => ({

                MLB:
                    row.itemId,

                variacao:
                    row.variationId,

                SKU:
                    row.sku,

                user_product:
                    row.userProductId,

                inventory:
                    row.inventoryId,

                deposito_ML:
                    row.warehouse,

                FULL:
                    row.full,

                total_ML:
                    row.mlTotal,

                estoque_interno:
                    row.internalWarehouse

            })
        )
    );


    // =========================================================
    // QUANTOS SKUS FALTARAM
    // =========================================================

    const semSku =
        rows.filter(
            row =>
                !row.sku ||
                String(
                    row.sku
                ).trim() === ''
        );


    console.log(
        `🏷️ SKUs encontrados: ${rows.length - semSku.length}/${rows.length}`
    );


    if (semSku.length) {

        console.warn(
            `⚠️ ${semSku.length} linha(s) sem SKU.`,
            semSku
                .slice(
                    0,
                    30
                )
                .map(
                    row => ({
                        MLB:
                            row.itemId,

                        variation_id:
                            row.variationId,

                        user_product_id:
                            row.userProductId,

                        inventory_id:
                            row.inventoryId
                    })
                )
        );
    }


    // =========================================================
    // RENDER FINAL
    // =========================================================

    updateSummary();

    applyFilters();
}

function render() {

    const body =
        document.getElementById(
            'gaBody'
        );

    if (!body) {
        return;
    }


    // =========================================================
    // CALCULAR INÍCIO DA PÁGINA
    // =========================================================

    const start =
        (
            GA.page -
            1
        ) *
        GA.pageSize;


    const rows =
        GA.filtered.slice(
            start,
            start +
            GA.pageSize
        );


    // =========================================================
    // SEM RESULTADOS
    // =========================================================

    if (!rows.length) {

        body.innerHTML = `
            <tr>
                <td
                    colspan="12"
                    style="
                        text-align:center;
                        padding:30px;
                    "
                >
                    Nenhum anúncio encontrado.
                </td>
            </tr>
        `;

    } else {

        // =====================================================
        // RENDERIZAR LINHAS
        // =====================================================

        body.innerHTML =
            rows.map(
                row => {

                    // =================================================
                    // PREÇO
                    // =================================================

                    const preco =
                        Number.isFinite(
                            Number(row.price)
                        )
                            ? Number(
                                row.price
                            ).toLocaleString(
                                'pt-BR',
                                {
                                    style:
                                        'currency',

                                    currency:
                                        'BRL'
                                }
                            )
                            : '-';


                    // =================================================
                    // ESTOQUE INTERNO
                    // =================================================

                    const estoqueInterno =
                        row.internalWarehouse !== null &&
                        row.internalWarehouse !== undefined
                            ? row.internalWarehouse
                            : null;


                    // =================================================
                    // ESTOQUE ML FORA DO FULL
                    // =================================================

                    const estoqueDepositoML =
                        row.warehouse !== null &&
                        row.warehouse !== undefined
                            ? row.warehouse
                            : null;


                    // =================================================
                    // ESTOQUE FULL DISPONÍVEL
                    // =================================================

                    const estoqueFull =
                        row.full !== null &&
                        row.full !== undefined
                            ? row.full
                            : null;


                    // =================================================
                    // TOTAL DISPONÍVEL NO ML
                    // =================================================

                    const estoqueTotalML =
                        row.mlTotal !== null &&
                        row.mlTotal !== undefined
                            ? row.mlTotal
                            : null;


                    // =================================================
                    // ESTOQUE FULL INDISPONÍVEL
                    // =================================================

                    const estoqueIndisponivel =
                        row.unavailable !== null &&
                        row.unavailable !== undefined
                            ? row.unavailable
                            : null;


                    // =================================================
                    // TOTAL FÍSICO FULL
                    // =================================================

                    const totalFisicoFull =
                        row.fullTotal !== null &&
                        row.fullTotal !== undefined
                            ? row.fullTotal
                            : null;


                    // =================================================
                    // TOOLTIP DE LOCALIZAÇÕES
                    // =================================================

                    let locationsTooltip = '';

                    if (
                        Array.isArray(
                            row.stockLocations
                        ) &&
                        row.stockLocations.length
                    ) {

                        locationsTooltip =
                            row.stockLocations
                                .map(
                                    location => {

                                        const tipo =
                                            location?.type ||
                                            'desconhecido';

                                        const quantidade =
                                            location?.quantity ??
                                            0;

                                        return (
                                            `${tipo}: ${quantidade}`
                                        );
                                    }
                                )
                                .join(' | ');
                    }


                    // =================================================
                    // DIFERENÇA ENTRE ESTOQUE INTERNO E ML
                    // =================================================

                    let diferencaDepositoHtml =
                        '';

                    if (
                        estoqueInterno !== null &&
                        estoqueDepositoML !== null &&
                        Number(estoqueInterno) !==
                        Number(estoqueDepositoML)
                    ) {

                        const diferenca =
                            Number(
                                estoqueDepositoML
                            ) -
                            Number(
                                estoqueInterno
                            );


                        diferencaDepositoHtml = `
                            <div
                                class="gaSub"
                                style="
                                    text-align:center;
                                    color:#b45309;
                                    margin-top:4px;
                                "
                            >
                                Diferença:
                                <strong>
                                    ${
                                        diferenca > 0
                                            ? '+'
                                            : ''
                                    }${esc(diferenca)}
                                </strong>
                            </div>
                        `;
                    }


                    // =================================================
                    // USER PRODUCT
                    // =================================================

                    const userProductHtml =
                        row.userProductId
                            ? `
                                <div
                                    class="gaSub"
                                    title="User Product ID"
                                >
                                    UP:
                                    ${esc(
                                        row.userProductId
                                    )}
                                </div>
                            `
                            : '';


                    // =================================================
                    // ERRO DE ESTOQUE
                    // =================================================

                    const erroEstoque =
                        row.stockError ||
                        row.fullError ||
                        '';


                    return `

                        <tr>

                            <!-- ===================================== -->
                            <!-- FOTO -->
                            <!-- ===================================== -->

                            <td>

                                ${
                                    row.thumbnail

                                        ? `
                                            <img
                                                class="gaImg"
                                                src="${esc(row.thumbnail)}"
                                                alt=""
                                            >
                                        `

                                        : '-'
                                }

                            </td>


                            <!-- ===================================== -->
                            <!-- MLB -->
                            <!-- ===================================== -->

                            <td>

                                <div class="gaMlb">

                                    ${esc(row.itemId)}

                                </div>


                                ${
                                    row.variationId

                                        ? `
                                            <div class="gaSub">

                                                Variação:
                                                ${esc(
                                                    row.variationId
                                                )}

                                            </div>
                                        `

                                        : ''
                                }


                                ${userProductHtml}

                            </td>


                            <!-- ===================================== -->
                            <!-- TÍTULO / SKU -->
                            <!-- ===================================== -->

                            <td>

                                <strong>

                                    ${esc(
                                        row.title
                                    )}

                                </strong>


                                <div>

                                    <span class="gaSku">

                                        ${
                                            esc(
                                                row.sku ||
                                                'Sem SKU'
                                            )
                                        }

                                    </span>

                                </div>

                            </td>


                            <!-- ===================================== -->
                            <!-- ESTOQUE ML FORA DO FULL -->
                            <!-- ===================================== -->

                            <td>

                                ${
                                    stockHtml(
                                        estoqueDepositoML,
                                        erroEstoque
                                    )
                                }


                                <div
                                    class="gaSub"
                                    style="
                                        text-align:center;
                                    "
                                >
                                    Mercado Livre
                                </div>


                                ${
                                    estoqueInterno !== null

                                        ? `
                                            <div
                                                class="gaSub"
                                                style="
                                                    text-align:center;
                                                    margin-top:5px;
                                                "
                                            >
                                                Sistema interno:
                                                <strong>
                                                    ${esc(
                                                        estoqueInterno
                                                    )}
                                                </strong>
                                            </div>
                                        `

                                        : `
                                            <div
                                                class="gaSub"
                                                style="
                                                    text-align:center;
                                                    margin-top:5px;
                                                    color:#b45309;
                                                "
                                            >
                                                Não localizado no estoque
                                            </div>
                                        `
                                }


                                ${diferencaDepositoHtml}


                                ${
                                    locationsTooltip

                                        ? `
                                            <div
                                                class="gaSub"
                                                style="
                                                    text-align:center;
                                                    margin-top:5px;
                                                    cursor:help;
                                                "
                                                title="${esc(
                                                    locationsTooltip
                                                )}"
                                            >
                                                <i class="fas fa-info-circle"></i>
                                                Ver localizações
                                            </div>
                                        `

                                        : ''
                                }

                            </td>


                            <!-- ===================================== -->
                            <!-- ESTOQUE FULL -->
                            <!-- ===================================== -->

                            <td>

                                ${
                                    stockHtml(
                                        estoqueFull,
                                        erroEstoque
                                    )
                                }


                                <div
                                    class="gaSub"
                                    style="
                                        text-align:center;
                                    "
                                >
                                    Disponível FULL
                                </div>


                                ${
                                    estoqueTotalML !== null

                                        ? `
                                            <div
                                                style="
                                                    margin-top:7px;
                                                    padding:5px 6px;
                                                    background:#eff6ff;
                                                    border-radius:5px;
                                                    text-align:center;
                                                    font-size:11px;
                                                    color:#1d4ed8;
                                                "
                                            >
                                                Total disponível ML:
                                                <strong>
                                                    ${esc(
                                                        estoqueTotalML
                                                    )}
                                                </strong>
                                            </div>
                                        `

                                        : ''
                                }


                                ${
                                    totalFisicoFull !== null

                                        ? `
                                            <div
                                                class="gaSub"
                                                style="
                                                    text-align:center;
                                                    margin-top:4px;
                                                "
                                            >
                                                Total físico FULL:
                                                <strong>
                                                    ${esc(
                                                        totalFisicoFull
                                                    )}
                                                </strong>
                                            </div>
                                        `

                                        : ''
                                }


                                ${
                                    erroEstoque

                                        ? `
                                            <div
                                                class="gaSub"
                                                style="
                                                    text-align:center;
                                                    color:#dc2626;
                                                    margin-top:5px;
                                                "
                                                title="${esc(
                                                    erroEstoque
                                                )}"
                                            >
                                                <i class="fas fa-exclamation-triangle"></i>
                                                Erro na consulta
                                            </div>
                                        `

                                        : ''
                                }

                            </td>


                            <!-- ===================================== -->
                            <!-- FULL INDISPONÍVEL -->
                            <!-- ===================================== -->

                            <td>

                                ${
                                    stockHtml(
                                        estoqueIndisponivel
                                    )
                                }


                                ${
                                    estoqueIndisponivel !== null &&
                                    Number(
                                        estoqueIndisponivel
                                    ) > 0

                                        ? `
                                            <div
                                                class="gaSub"
                                                style="
                                                    text-align:center;
                                                    color:#b45309;
                                                "
                                            >
                                                Não disponível
                                            </div>
                                        `

                                        : ''
                                }

                            </td>


                            <!-- ===================================== -->
                            <!-- EXPOSIÇÃO -->
                            <!-- ===================================== -->

                            <td>

                                <span class="gaBadge">

                                    ${
                                        esc(
                                            row.exposureName ||
                                            '-'
                                        )
                                    }

                                </span>


                                ${
                                    row.exposureId

                                        ? `
                                            <div class="gaSub">

                                                ${esc(
                                                    row.exposureId
                                                )}

                                            </div>
                                        `

                                        : ''
                                }

                            </td>


                            <!-- ===================================== -->
                            <!-- TIPO DO ANÚNCIO -->
                            <!-- ===================================== -->

                            <td>

                                <strong>

                                    ${
                                        esc(
                                            row.listingTypeName ||
                                            '-'
                                        )
                                    }

                                </strong>


                                <div class="gaSub">

                                    ${
                                        esc(
                                            row.listingTypeId ||
                                            '-'
                                        )
                                    }

                                </div>

                            </td>


                            <!-- ===================================== -->
                            <!-- STATUS -->
                            <!-- ===================================== -->

                            <td>

                                <span
                                    class="
                                        gaBadge
                                        ${statusClass(
                                            row.status
                                        )}
                                    "
                                >

                                    ${
                                        esc(
                                            statusLabel(
                                                row.status
                                            )
                                        )
                                    }

                                </span>

                            </td>


                            <!-- ===================================== -->
                            <!-- PREÇO -->
                            <!-- ===================================== -->

                            <td>

                                <strong>
                                    ${preco}
                                </strong>

                            </td>


                            <!-- ===================================== -->
                            <!-- INVENTORY ID -->
                            <!-- ===================================== -->

                            <td>

                                <code>

                                    ${
                                        esc(
                                            row.inventoryId ||
                                            '-'
                                        )
                                    }

                                </code>


                                ${
                                    row.userProductId

                                        ? `
                                            <div
                                                class="gaSub"
                                                style="
                                                    margin-top:5px;
                                                "
                                            >
                                                UP:
                                                ${esc(
                                                    row.userProductId
                                                )}
                                            </div>
                                        `

                                        : ''
                                }

                            </td>


                            <!-- ===================================== -->
                            <!-- AÇÕES -->
                            <!-- ===================================== -->

                            <td>

                                ${
                                    row.permalink

                                        ? `
                                            <a
                                                class="gaLink"
                                                href="${esc(
                                                    row.permalink
                                                )}"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <i class="fas fa-external-link-alt"></i>
                                                Abrir anúncio
                                            </a>
                                        `

                                        : '-'
                                }

                            </td>

                        </tr>
                    `;
                }
            ).join('');
    }


    // =========================================================
    // PAGINAÇÃO
    // =========================================================

    const totalPages =
        Math.max(
            1,
            Math.ceil(
                GA.filtered.length /
                GA.pageSize
            )
        );


    // =========================================================
    // INFORMAÇÃO DE REGISTROS
    // =========================================================

    const info =
        document.getElementById(
            'gaInfo'
        );


    if (info) {

        if (
            GA.filtered.length === 0
        ) {

            info.textContent =
                '0 registros';

        } else {

            const primeiro =
                start + 1;


            const ultimo =
                Math.min(
                    start +
                    GA.pageSize,
                    GA.filtered.length
                );


            info.textContent =
                `${primeiro}-${ultimo} de ${GA.filtered.length} registros`;
        }
    }


    // =========================================================
    // NÚMERO DA PÁGINA
    // =========================================================

    const page =
        document.getElementById(
            'gaPage'
        );


    if (page) {

        page.textContent =
            `Página ${GA.page} de ${totalPages}`;
    }
}

    // ============================================================
    // RENDERIZAR TABELA
    // ============================================================

    function statusLabel(status) {
        const nomes = { active: 'Ativo', paused: 'Pausado', closed: 'Finalizado', under_review: 'Em revisão' };
        return nomes[status] || status || '-';
    }

    function statusClass(status) {
        if (status === 'active') return 'badge-success';
        if (status === 'paused') return 'badge-warning';
        if (status === 'closed') return 'badge-danger';
        return '';
    }

    function stockHtml(value, title = '') {
        if (value === null || value === undefined) {
            return `<div class="text-center text-muted" title="${esc(title)}">—</div>`;
        }
        const numero = Number(value);
        const classe = numero > 0 ? 'text-success' : 'text-danger';
        return `<div class="text-center fw-bold ${classe}" style="font-size:18px;">${numero}</div>`;
    }

    function renderTabela() {
        const body = document.getElementById('gaTabelaBody');
        if (!body) return;

        const start = (GA.page - 1) * GA.pageSize;
        const rows = GA.filtered.slice(start, start + GA.pageSize);

        if (!rows.length) {
            body.innerHTML = `
                <tr>
                    <td colspan="12" class="text-center py-5">
                        <i class="fas fa-search fa-3x mb-3" style="color: #6c757d; opacity: 0.3;"></i>
                        <h4 style="color: #6c757d;">Nenhum anúncio encontrado</h4>
                        <p style="color: #6c757d;">Tente ajustar os filtros ou sincronizar novamente.</p>
                    </td>
                </tr>
            `;
        } else {
            body.innerHTML = rows.map(row => {
                const preco = Number.isFinite(Number(row.price)) 
                    ? Number(row.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : '-';

                return `
                    <tr>
                        <td>
                            ${row.thumbnail ? `<img src="${esc(row.thumbnail)}" style="width:50px;height:50px;object-fit:contain;">` : '-'}
                        </td>
                        <td>
                            <div class="fw-bold">${esc(row.itemId)}</div>
                            ${row.variationId ? `<div class="text-muted small">Var: ${esc(row.variationId)}</div>` : ''}
                        </td>
                        <td>
                            <div class="fw-bold">${esc(row.title)}</div>
                            <div><span class="badge bg-light text-dark">${esc(row.sku || 'Sem SKU')}</span></div>
                        </td>
                        <td>${stockHtml(row.warehouse)}</td>
                        <td>${stockHtml(row.full, row.fullError)}</td>
                        <td>${stockHtml(row.unavailable)}</td>
                        <td>
                            <span class="badge bg-info">${esc(row.exposureName || '-')}</span>
                            ${row.exposureId ? `<div class="text-muted small">${esc(row.exposureId)}</div>` : ''}
                        </td>
                        <td>
                            <div class="fw-bold">${esc(row.listingTypeName || '-')}</div>
                            <div class="text-muted small">${esc(row.listingTypeId || '-')}</div>
                        </td>
                        <td><span class="badge ${statusClass(row.status)}">${esc(statusLabel(row.status))}</span></td>
                        <td class="text-end">${preco}</td>
                        <td><code class="small">${esc(row.inventoryId || '-')}</code></td>
                        <td>
                            ${row.permalink ? `<a href="${esc(row.permalink)}" target="_blank" class="btn btn-sm btn-outline-primary"><i class="fas fa-external-link-alt"></i></a>` : '-'}
                        </td>
                    </tr>
                `;
            }).join('');
        }

        // Atualizar paginação
        const total = GA.filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / GA.pageSize));
        document.getElementById('gaInicio').textContent = total ? start + 1 : 0;
        document.getElementById('gaFim').textContent = Math.min(start + GA.pageSize, total);
        document.getElementById('gaTotal').textContent = total;
        document.getElementById('gaPaginaInfo').textContent = `Página ${GA.page} de ${totalPages}`;
        document.getElementById('gaContagemRegistros').textContent = `${total} registros`;
        document.getElementById('gaBtnAnterior').disabled = GA.page <= 1;
        document.getElementById('gaBtnProxima').disabled = GA.page >= totalPages;
    }

    // ============================================================
    // RESUMO
    // ============================================================

    function atualizarResumo() {
        const anuncios = new Set(GA.rows.map(row => row.itemId));
        const inventories = new Map();
        let semVinculo = 0;

        for (const row of GA.rows) {
            if (row.warehouse === null) semVinculo++;
            if (row.inventoryId && !inventories.has(row.inventoryId)) {
                inventories.set(row.inventoryId, Number(row.full) || 0);
            }
        }

        const totalEstoque = [...inventories.values()].reduce((a, b) => a + b, 0);

        document.getElementById('gaTotalAnuncios').textContent = anuncios.size;
        document.getElementById('gaTotalVariacoes').textContent = GA.rows.length;
        document.getElementById('gaTotalEstoque').textContent = totalEstoque;
        document.getElementById('gaSemVinculo').textContent = semVinculo;
    }

    // ============================================================
    // FILTROS
    // ============================================================

    function aplicarFiltros() {
        const busca = String(document.getElementById('gaBusca')?.value || '').toLowerCase().trim();
        const exposure = document.getElementById('gaFiltroExposicao')?.value || '';
        const status = document.getElementById('gaFiltroStatus')?.value || '';
        const sort = document.getElementById('gaFiltroOrdenacao')?.value || 'title';

        GA.filtered = GA.rows.filter(row => {
            if (exposure && row.exposureName !== exposure) return false;
            if (status && row.status !== status) return false;
            if (busca) {
                const texto = [row.title, row.itemId, row.sku, row.inventoryId, row.exposureName, row.listingTypeName]
                    .join(' ').toLowerCase();
                if (!texto.includes(busca)) return false;
            }
            return true;
        });

        const numero = (valor, fallback) => Number.isFinite(Number(valor)) ? Number(valor) : fallback;

        GA.filtered.sort((a, b) => {
            if (sort === 'fullDesc') return numero(b.full, -1) - numero(a.full, -1);
            if (sort === 'fullAsc') return numero(a.full, 999999999) - numero(b.full, 999999999);
            if (sort === 'depDesc') return numero(b.warehouse, -1) - numero(a.warehouse, -1);
            if (sort === 'depAsc') return numero(a.warehouse, 999999999) - numero(b.warehouse, 999999999);
            return String(a.title).localeCompare(String(b.title), 'pt-BR');
        });

        GA.page = 1;
        renderTabela();
    }

    function atualizarFiltroExposicao() {
        const select = document.getElementById('gaFiltroExposicao');
        if (!select) return;
        const valorAtual = select.value;
        const mapa = new Map();
        for (const row of GA.rows) {
            const nome = row.exposureName || '-';
            if (nome && nome !== '-') mapa.set(nome, nome);
        }
        const valores = [...mapa.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        select.innerHTML = `
            <option value="">Todas exposições</option>
            ${valores.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}
        `;
        if (valores.includes(valorAtual)) select.value = valorAtual;
    }

    function limparFiltros() {
        document.getElementById('gaBusca').value = '';
        document.getElementById('gaFiltroExposicao').value = '';
        document.getElementById('gaFiltroStatus').value = '';
        document.getElementById('gaFiltroOrdenacao').value = 'title';
        aplicarFiltros();
    }

    // ============================================================
    // PAGINAÇÃO
    // ============================================================

    function mudarItensPorPagina() {
        const select = document.getElementById('gaItensPorPagina');
        GA.pageSize = parseInt(select?.value) || 20;
        GA.page = 1;
        renderTabela();
    }

    function paginar(direcao) {
        const totalPages = Math.max(1, Math.ceil(GA.filtered.length / GA.pageSize));
        if (direcao === 'anterior' && GA.page > 1) GA.page--;
        if (direcao === 'proxima' && GA.page < totalPages) GA.page++;
        renderTabela();
    }

    function linhaParaRegistroBanco(row) {

    return {

        chave:
            String(
                row.key ||
                `${row.itemId}:${row.variationId || '0'}`
            ),

        item_id:
            row.itemId
                ? String(row.itemId)
                : null,

        variation_id:
            row.variationId
                ? String(row.variationId)
                : null,

        seller_id:
            GA.sellerId
                ? String(GA.sellerId)
                : null,

        user_product_id:
            row.userProductId
                ? String(row.userProductId)
                : null,

        inventory_id:
            row.inventoryId
                ? String(row.inventoryId)
                : null,

        title:
            row.title || null,

        sku:
            row.sku || null,

        thumbnail:
            row.thumbnail || null,

        permalink:
            row.permalink || null,

        listing_type_id:
            row.listingTypeId || null,

        listing_type_name:
            row.listingTypeName || null,

        exposure_id:
            row.exposureId || null,

        exposure_name:
            row.exposureName || null,

        status:
            row.status || null,

        price:
            Number.isFinite(
                Number(row.price)
            )
                ? Number(row.price)
                : null,

        estoque_ml_fora_full:
            row.warehouse !== null &&
            row.warehouse !== undefined
                ? Number(row.warehouse)
                : null,

        estoque_full:
            row.full !== null &&
            row.full !== undefined
                ? Number(row.full)
                : null,

        estoque_total_ml:
            row.mlTotal !== null &&
            row.mlTotal !== undefined
                ? Number(row.mlTotal)
                : null,

        estoque_full_indisponivel:
            row.unavailable !== null &&
            row.unavailable !== undefined
                ? Number(row.unavailable)
                : null,

        estoque_full_total:
            row.fullTotal !== null &&
            row.fullTotal !== undefined
                ? Number(row.fullTotal)
                : null,

        estoque_interno:
            row.internalWarehouse !== null &&
            row.internalWarehouse !== undefined
                ? Number(row.internalWarehouse)
                : null,

        stock_locations:
            Array.isArray(
                row.stockLocations
            )
                ? row.stockLocations
                : [],

        stock_error:
            row.stockError ||
            row.fullError ||
            null,

        ultima_sincronizacao:
            new Date().toISOString()
    };
}

function registroBancoParaLinha(registro) {

    return {

        key:
            registro.chave,

        itemId:
            registro.item_id,

        variationId:
            registro.variation_id,

        title:
            registro.title || '-',

        thumbnail:
            registro.thumbnail || '',

        permalink:
            registro.permalink || '',

        sku:
            registro.sku || '',

        userProductId:
            registro.user_product_id || null,

        inventoryId:
            registro.inventory_id || null,

        listingTypeId:
            registro.listing_type_id || '',

        listingTypeName:
            registro.listing_type_name || '',

        exposureId:
            registro.exposure_id || '',

        exposureName:
            registro.exposure_name || '',

        status:
            registro.status || '',

        price:
            registro.price !== null
                ? Number(registro.price)
                : null,

        warehouse:
            registro.estoque_ml_fora_full,

        full:
            registro.estoque_full,

        mlTotal:
            registro.estoque_total_ml,

        unavailable:
            registro.estoque_full_indisponivel,

        fullTotal:
            registro.estoque_full_total,

        internalWarehouse:
            registro.estoque_interno,

        stockLocations:
            Array.isArray(
                registro.stock_locations
            )
                ? registro.stock_locations
                : [],

        stockError:
            registro.stock_error || null,

        fullError:
            null,

        ultimaSincronizacao:
            registro.ultima_sincronizacao
    };
}

async function salvarAnunciosBanco(
    rows,
    mostrarLog = true
) {

    if (
        !Array.isArray(rows) ||
        rows.length === 0
    ) {
        return;
    }


    if (!window.supabaseClient) {

        console.warn(
            '⚠️ Supabase não disponível para salvar anúncios.'
        );

        return;
    }


    // =========================================================
    // REMOVER DUPLICADOS PELA CHAVE
    // =========================================================

    const mapa =
        new Map();


    for (const row of rows) {

        if (!row) {
            continue;
        }


        const registro =
            linhaParaRegistroBanco(
                row
            );


        if (!registro.chave) {
            continue;
        }


        mapa.set(
            registro.chave,
            registro
        );
    }


    const registros =
        [
            ...mapa.values()
        ];


    // =========================================================
    // SALVAR EM BLOCOS
    // =========================================================

    const TAMANHO_LOTE =
        200;


    let salvos =
        0;


    for (
        let i = 0;
        i < registros.length;
        i += TAMANHO_LOTE
    ) {

        const lote =
            registros.slice(
                i,
                i + TAMANHO_LOTE
            );


        const {
            error
        } = await window.supabaseClient
            .from(
                'gerenciamento_anuncios_ml'
            )
            .upsert(
                lote,
                {
                    onConflict:
                        'chave'
                }
            );


        if (error) {

            console.error(
                '❌ Erro salvando anúncios no Supabase:',
                error
            );

            throw error;
        }


        salvos +=
            lote.length;
    }


    if (mostrarLog) {

        console.log(
            `💾 ${salvos} linha(s) de anúncios salvas/atualizadas no banco.`
        );
    }
}

async function carregarAnunciosBanco() {

    if (!window.supabaseClient) {

        throw new Error(
            'Supabase não inicializado.'
        );
    }


    console.log(
        '💾 Carregando anúncios salvos no banco...'
    );


    const todos =
        [];


    const TAMANHO_PAGINA =
        1000;


    let inicio =
        0;


    while (true) {

        const fim =
            inicio +
            TAMANHO_PAGINA -
            1;


        const {
            data,
            error
        } = await window.supabaseClient
            .from(
                'gerenciamento_anuncios_ml'
            )
            .select('*')
            .order(
                'title',
                {
                    ascending:
                        true
                }
            )
            .range(
                inicio,
                fim
            );


        if (error) {

            console.error(
                '❌ Erro carregando anúncios salvos:',
                error
            );

            throw error;
        }


        const pagina =
            data || [];


        todos.push(
            ...pagina
        );


        if (
            pagina.length <
            TAMANHO_PAGINA
        ) {

            break;
        }


        inicio +=
            TAMANHO_PAGINA;
    }


    GA.rows =
        todos.map(
            registroBancoParaLinha
        );


    GA.page =
        1;


    updateSummary();

    updateExposureFilter();

    applyFilters();


    console.log(
        `✅ ${GA.rows.length} linha(s) carregadas do banco.`
    );


    return GA.rows;
}

function mesclarLinhasComDadosSalvos(
    novasLinhas,
    linhasAntigas
) {

    const antigasPorChave =
        new Map();


    for (
        const antiga
        of linhasAntigas || []
    ) {

        if (antiga?.key) {

            antigasPorChave.set(
                String(antiga.key),
                antiga
            );
        }
    }


    return novasLinhas.map(
        nova => {

            const antiga =
                antigasPorChave.get(
                    String(nova.key)
                );


            if (!antiga) {

                return nova;
            }


            return {

                // DADOS ANTIGOS
                ...antiga,

                // DADOS NOVOS DO ANÚNCIO
                ...nova,


                // =============================================
                // PRESERVAR ESTOQUE ATÉ CHEGAR UMA CONSULTA NOVA
                // =============================================

                warehouse:
                    antiga.warehouse,

                full:
                    antiga.full,

                mlTotal:
                    antiga.mlTotal,

                unavailable:
                    antiga.unavailable,

                fullTotal:
                    antiga.fullTotal,

                stockLocations:
                    antiga.stockLocations ||
                    [],

                stockError:
                    antiga.stockError || null,


                // Estoque interno pode ser atualizado
                internalWarehouse:
                    nova.internalWarehouse
            };
        }
    );
}

    async function loadAll(force = false) {

    // =========================================================
    // EVITAR DUAS SINCRONIZAÇÕES AO MESMO TEMPO
    // =========================================================

    if (GA.loading) {

        console.log(
            '⚠️ Gerenciamento de anúncios já está sendo atualizado.'
        );

        return;
    }


    GA.loading = true;


    // =========================================================
    // GARANTIR INTERFACE
    // =========================================================

    ensureUI();


    const refresh =
        document.getElementById(
            'gaRefresh'
        );


    if (refresh) {

        refresh.disabled = true;

        refresh.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            Atualizando...
        `;
    }


    // =========================================================
    // GUARDAR OS DADOS QUE JÁ ESTAVAM NA TELA/BANCO
    //
    // MUITO IMPORTANTE:
    // se uma consulta nova falhar, vamos preservar o último
    // estoque conhecido.
    // =========================================================

    let linhasSalvasAntes =
        Array.isArray(GA.rows)
            ? [...GA.rows]
            : [];


    try {

        console.log(
            '🔄 Iniciando sincronização do Gerenciamento de Anúncios...'
        );


        // =====================================================
        // 1. SE A TELA AINDA NÃO TEM DADOS, TENTAR CARREGAR
        //    O CACHE DO SUPABASE PRIMEIRO
        // =====================================================

        if (
            linhasSalvasAntes.length === 0 &&
            typeof carregarAnunciosBanco === 'function'
        ) {

            try {

                progress(
                    'Carregando dados já salvos...'
                );


                const linhasBanco =
                    await carregarAnunciosBanco();


                if (
                    Array.isArray(linhasBanco) &&
                    linhasBanco.length > 0
                ) {

                    linhasSalvasAntes =
                        [...linhasBanco];


                    console.log(
                        `💾 ${linhasSalvasAntes.length} linha(s) recuperadas do banco antes da atualização.`
                    );
                }

            } catch (error) {

                console.warn(
                    '⚠️ Não foi possível carregar os anúncios existentes do banco:',
                    error
                );
            }
        }


        // =====================================================
        // 2. SE FOR ATUALIZAÇÃO FORÇADA, LIMPAR APENAS CACHES
        //    DE API.
        //
        // NÃO LIMPAR GA.rows.
        // NÃO APAGAR OS DADOS DO BANCO.
        // =====================================================

        if (force) {

            console.log(
                '🔄 Atualização completa solicitada.'
            );


            GA.token =
                null;


            GA.sellerId =
                null;


            if (GA.fullCache) {

                GA.fullCache.clear();
            }


            if (GA.userProductStockCache) {

                GA.userProductStockCache.clear();
            }


            if (GA.userProductStockPromises) {

                GA.userProductStockPromises.clear();
            }


            if (GA.fullDetailCache) {

                GA.fullDetailCache.clear();
            }


            GA.exposureByListingType.clear();

            GA.listingTypeNames.clear();

            GA.exposureNames.clear();
        }


        // =====================================================
        // 3. CARREGAR ESTOQUE INTERNO
        // =====================================================

        progress(
            'Carregando estoque interno...'
        );


        await loadInternalStock();


        // =====================================================
        // 4. OBTER SELLER ID
        //
        // Fazemos antes para já deixar GA.sellerId disponível
        // na hora de salvar os registros.
        // =====================================================

        progress(
            'Validando conta Mercado Livre...'
        );


        await sellerId();


        // =====================================================
        // 5. LOCALIZAR TODOS OS ANÚNCIOS
        // =====================================================

        progress(
            'Localizando todos os anúncios da conta...'
        );


        const ids =
            await scanAllIds();


        if (
            !Array.isArray(ids) ||
            ids.length === 0
        ) {

            throw new Error(
                'Nenhum anúncio encontrado na conta do Mercado Livre.'
            );
        }


        console.log(
            `✅ ${ids.length} anúncios encontrados.`
        );


        // =====================================================
        // 6. BUSCAR DETALHES DOS ANÚNCIOS
        //
        // getAllItems() já deve utilizar:
        //
        // include_attributes=all
        //
        // para aumentar a precisão do SELLER_SKU.
        // =====================================================

        progress(
            `Buscando detalhes de ${ids.length} anúncios...`
        );


        const items =
            await getAllItems(
                ids
            );


        console.log(
            `📦 ${items.length} anúncios detalhados recebidos.`
        );


        // =====================================================
        // 7. CRIAR AS LINHAS DOS ANÚNCIOS FULL
        // =====================================================

        progress(
            'Identificando anúncios FULL...'
        );


        const novasLinhas =
            buildRows(
                items
            );


        const quantidadeAnunciosFull =
            new Set(
                novasLinhas.map(
                    row =>
                        row.itemId
                )
            ).size;


        console.log(
            `🏭 ${quantidadeAnunciosFull} anúncios FULL detectados.`
        );


        console.log(
            `📋 ${novasLinhas.length} SKU(s)/variação(ões) FULL encontrados.`
        );


        // =====================================================
        // 8. MESCLAR COM O ÚLTIMO DADO SALVO
        //
        // O anúncio, título, SKU, preço etc. ficam novos.
        //
        // O estoque anterior é preservado até conseguirmos uma
        // resposta nova do Mercado Livre.
        // =====================================================

        if (
            typeof mesclarLinhasComDadosSalvos ===
            'function'
        ) {

            GA.rows =
                mesclarLinhasComDadosSalvos(
                    novasLinhas,
                    linhasSalvasAntes
                );

        } else {

            // Fallback caso a função ainda não tenha sido criada.
            GA.rows =
                novasLinhas;
        }


        // =====================================================
        // 9. SALVAR IMEDIATAMENTE OS DADOS BÁSICOS
        //
        // Isso acontece ANTES da longa consulta dos estoques.
        //
        // Então mesmo que aconteça 429 depois, os anúncios já
        // estão persistidos no banco.
        // =====================================================

        progress(
            'Salvando anúncios encontrados...'
        );


        try {

            if (
                typeof salvarAnunciosBanco ===
                'function'
            ) {

                await salvarAnunciosBanco(
                    GA.rows
                );
            }

        } catch (error) {

            console.warn(
                '⚠️ Os anúncios foram carregados, mas houve erro ao salvar os dados básicos:',
                error
            );
        }


        // =====================================================
        // 10. JÁ MOSTRAR A TABELA
        //
        // NÃO ESPERAR TODOS OS ESTOQUES PARA EXIBIR.
        // =====================================================

        GA.page =
            1;


        updateSummary();

        updateExposureFilter();

        applyFilters();


        // =====================================================
        // 11. BUSCAR EXPOSIÇÃO / TIPO DO ANÚNCIO
        // =====================================================

        progress(
            'Atualizando exposição e tipo dos anúncios...'
        );


        try {

            await loadExposure(
                GA.rows
            );


            // Atualiza tabela
            updateExposureFilter();

            applyFilters();


            // Salvar exposição
            if (
                typeof salvarAnunciosBanco ===
                'function'
            ) {

                await salvarAnunciosBanco(
                    GA.rows,
                    false
                );
            }

        } catch (error) {

            console.warn(
                '⚠️ Não foi possível atualizar todas as exposições:',
                error
            );
        }


        // =====================================================
        // 12. CONSULTAR ESTOQUE REAL DO MERCADO LIVRE
        //
        // loadFullStocks() agora deve:
        //
        // - agrupar por user_product_id;
        // - consultar cada UP apenas uma vez;
        // - respeitar rate limit;
        // - usar cache;
        // - atualizar a tabela progressivamente;
        // - preferencialmente salvar blocos progressivamente.
        // =====================================================

        progress(
            `Consultando estoque dos ${GA.rows.length} registros FULL...`
        );


        try {

            await loadFullStocks(
                GA.rows
            );

        } catch (error) {

            // =================================================
            // IMPORTANTE:
            //
            // NÃO CANCELAMOS A SINCRONIZAÇÃO TODA POR CAUSA
            // DE UM PROBLEMA DE ESTOQUE.
            //
            // Os últimos valores salvos continuam na tabela.
            // =================================================

            console.error(
                '⚠️ A consulta de estoque não foi concluída completamente:',
                error
            );


            if (
                typeof window.showToast ===
                'function'
            ) {

                window.showToast(
                    'Alguns estoques não puderam ser atualizados. Os últimos valores salvos foram mantidos.',
                    'warning'
                );
            }
        }


        // =====================================================
        // 13. SALVAR ESTADO FINAL NO SUPABASE
        // =====================================================

        progress(
            'Salvando atualização no banco...'
        );


        try {

            if (
                typeof salvarAnunciosBanco ===
                'function'
            ) {

                await salvarAnunciosBanco(
                    GA.rows
                );
            }

        } catch (error) {

            console.error(
                '❌ Erro ao salvar o resultado final no banco:',
                error
            );
        }


        // =====================================================
        // 14. RENDER FINAL
        // =====================================================

        updateSummary();

        updateExposureFilter();

        applyFilters();


        // =====================================================
        // 15. ESTATÍSTICAS DE DIAGNÓSTICO
        // =====================================================

        const anunciosFull =
            new Set(
                GA.rows.map(
                    row =>
                        row.itemId
                )
            ).size;


        const totalLinhas =
            GA.rows.length;


        const comSku =
            GA.rows.filter(
                row =>
                    row.sku &&
                    String(
                        row.sku
                    ).trim() !== ''
            ).length;


        const semSku =
            totalLinhas -
            comSku;


        const comUserProduct =
            GA.rows.filter(
                row =>
                    !!row.userProductId
            ).length;


        const comEstoqueML =
            GA.rows.filter(
                row =>
                    row.full !== null ||
                    row.warehouse !== null ||
                    row.mlTotal !== null
            ).length;


        const comErroEstoque =
            GA.rows.filter(
                row =>
                    !!row.stockError
            ).length;


        console.log(
            '✅ Sincronização do Gerenciamento de Anúncios finalizada.',
            {
                anunciosFull:
                    anunciosFull,

                linhas:
                    totalLinhas,

                comSku:
                    comSku,

                semSku:
                    semSku,

                comUserProduct:
                    comUserProduct,

                estoqueAtualizado:
                    comEstoqueML,

                errosEstoque:
                    comErroEstoque
            }
        );


        // =====================================================
        // 16. MOSTRAR ALGUNS ANÚNCIOS SEM SKU PARA DIAGNÓSTICO
        // =====================================================

        if (
            semSku > 0
        ) {

            console.warn(
                `⚠️ ${semSku} linha(s) continuam sem SKU.`
            );


            console.table(
                GA.rows
                    .filter(
                        row =>
                            !row.sku ||
                            String(
                                row.sku
                            ).trim() === ''
                    )
                    .slice(
                        0,
                        30
                    )
                    .map(
                        row => ({
                            MLB:
                                row.itemId,

                            variacao:
                                row.variationId,

                            user_product:
                                row.userProductId,

                            inventory:
                                row.inventoryId,

                            titulo:
                                row.title
                        })
                    )
            );
        }


        // =====================================================
        // 17. TOAST FINAL
        // =====================================================

        if (
            typeof window.showToast ===
            'function'
        ) {

            window.showToast(
                `${anunciosFull} anúncios FULL sincronizados`,
                'success'
            );
        }

    } catch (error) {

        console.error(
            '❌ Gerenciamento de Anúncios:',
            error
        );


        // =====================================================
        // SE A SINCRONIZAÇÃO FALHAR, NÃO APAGAR A TABELA
        //
        // Se temos dados anteriores, continuamos mostrando-os.
        // =====================================================

        if (
            linhasSalvasAntes.length > 0
        ) {

            console.warn(
                '⚠️ A atualização falhou. Mantendo os últimos dados salvos.'
            );


            GA.rows =
                linhasSalvasAntes;


            updateSummary();

            updateExposureFilter();

            applyFilters();


            if (
                typeof window.showToast ===
                'function'
            ) {

                window.showToast(
                    'A atualização falhou. Os últimos dados salvos continuam disponíveis.',
                    'warning'
                );
            }

        } else {

            // =================================================
            // SOMENTE SE NÃO EXISTE NENHUM DADO SALVO
            // MOSTRAR ERRO NA TABELA
            // =================================================

            const body =
                document.getElementById(
                    'gaBody'
                );


            if (body) {

                body.innerHTML = `
                    <tr>

                        <td
                            colspan="12"
                            style="
                                text-align:center;
                                padding:30px;
                                color:#b91c1c;
                            "
                        >

                            <strong>
                                Erro ao carregar anúncios
                            </strong>

                            <br><br>

                            ${esc(
                                error?.message ||
                                error ||
                                'Erro desconhecido'
                            )}

                        </td>

                    </tr>
                `;
            }


            if (
                typeof window.showToast ===
                'function'
            ) {

                window.showToast(
                    `Erro: ${
                        error?.message ||
                        'Falha ao carregar anúncios'
                    }`,
                    'error'
                );
            }
        }

    } finally {

        // =====================================================
        // FINALIZAR ESTADO DE CARREGAMENTO
        // =====================================================

        GA.loading =
            false;


        progress('');


        // =====================================================
        // RESTAURAR BOTÃO
        // =====================================================

        if (refresh) {

            refresh.disabled =
                false;


            refresh.innerHTML = `
                <i class="fas fa-sync-alt"></i>
                Atualizar tudo
            `;
        }


        console.log(
            '🏁 Processo de atualização encerrado.'
        );
    }
}

    // ============================================================
    // EXPORTAR
    // ============================================================

    function exportarExcel() {
        if (!GA.filtered.length) {
            window.showToast('Nenhum dado para exportar', 'warning');
            return;
        }

        const dados = [
            ['MLB', 'Variação', 'Título', 'SKU', 'Depósito', 'FULL', 'Indisponível', 'Exposição', 'Tipo', 'Status', 'Preço', 'Inventory ID']
        ];

        for (const row of GA.filtered) {
            dados.push([
                row.itemId,
                row.variationId || '-',
                row.title,
                row.sku || '-',
                row.warehouse ?? '-',
                row.full ?? '-',
                row.unavailable ?? '-',
                row.exposureName || '-',
                row.listingTypeName || '-',
                statusLabel(row.status),
                row.price ?? '-',
                row.inventoryId || '-'
            ]);
        }

        const ws = XLSX.utils.aoa_to_sheet(dados);
        ws['!cols'] = [
            { wch: 15 }, { wch: 12 }, { wch: 40 }, { wch: 18 },
            { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 },
            { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 20 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Anuncios_FULL');
        XLSX.writeFile(wb, `anuncios_full_${dataLocalISO()}.xlsx`);
        window.showToast('✅ Relatório exportado com sucesso!', 'success');
    }

    window.abrirSistemaGerenciamentoAnuncios = function() {

    console.log(
        '📋 Abrindo Gerenciamento de Anúncios...'
    );

    // =========================================================
    // 1. GARANTIR QUE A INTERFACE EXISTA
    // =========================================================

    ensureUI();


    // =========================================================
    // 2. ABRIR A TELA IMEDIATAMENTE
    // =========================================================

    const tela =
        document.getElementById(
            'gerenciamentoAnunciosScreen'
        );


    if (!tela) {

        console.error(
            '❌ Tela gerenciamentoAnunciosScreen não encontrada.'
        );

        return;
    }


    tela.style.display =
        'block';


    document.body.style.overflow =
        'hidden';


    console.log(
        '✅ Tela do Gerenciamento de Anúncios aberta.'
    );


    // =========================================================
    // 3. SE JÁ TEM DADOS NA MEMÓRIA
    // =========================================================

    if (
        Array.isArray(GA.rows) &&
        GA.rows.length > 0
    ) {

        console.log(
            `📋 ${GA.rows.length} registros já estão carregados.`
        );


        GA.page =
            1;


        updateSummary();

        updateExposureFilter();

        applyFilters();


        return;
    }


    // =========================================================
    // 4. MOSTRAR CARREGAMENTO
    // =========================================================

    progress(
        'Carregando anúncios salvos...'
    );


    // =========================================================
    // 5. CARREGAR SUPABASE SEM BLOQUEAR A ABERTURA DA TELA
    // =========================================================

    (async () => {

        try {

            // =================================================
            // TENTAR CARREGAR DO BANCO
            // =================================================

            if (
                typeof carregarAnunciosBanco ===
                'function'
            ) {

                console.log(
                    '💾 Buscando anúncios salvos no Supabase...'
                );


                const dados =
                    await carregarAnunciosBanco();


                if (
                    Array.isArray(dados) &&
                    dados.length > 0
                ) {

                    console.log(
                        `✅ ${dados.length} registros recuperados do Supabase.`
                    );


                    // carregarAnunciosBanco já deve preencher GA.rows,
                    // mas garantimos caso não tenha preenchido.

                    if (
                        !Array.isArray(GA.rows) ||
                        GA.rows.length === 0
                    ) {

                        GA.rows =
                            dados;
                    }


                    GA.page =
                        1;


                    updateSummary();

                    updateExposureFilter();

                    applyFilters();


                    progress('');


                    console.log(
                        '✅ Gerenciamento carregado pelo banco de dados.'
                    );


                    // IMPORTANTE:
                    // Não chamar Mercado Livre automaticamente.
                    return;
                }
            }


            // =================================================
            // 6. BANCO VAZIO = PRIMEIRA SINCRONIZAÇÃO
            // =================================================

            console.log(
                'ℹ️ Banco de anúncios vazio.'
            );


            console.log(
                '🔄 Iniciando primeira sincronização com Mercado Livre...'
            );


            await loadAll(
                false
            );


        } catch (error) {

            console.error(
                '❌ Erro carregando Gerenciamento de Anúncios:',
                error
            );


            progress('');


            // =================================================
            // SE NÃO EXISTE NADA SALVO, TENTAR ML
            // =================================================

            if (
                !Array.isArray(GA.rows) ||
                GA.rows.length === 0
            ) {

                try {

                    console.log(
                        '🔄 Tentando carregar diretamente do Mercado Livre...'
                    );


                    await loadAll(
                        false
                    );

                } catch (erroML) {

                    console.error(
                        '❌ Falha ao carregar Mercado Livre:',
                        erroML
                    );


                    const body =
                        document.getElementById(
                            'gaBody'
                        );


                    if (body) {

                        body.innerHTML = `
                            <tr>

                                <td
                                    colspan="12"
                                    style="
                                        padding:30px;
                                        text-align:center;
                                        color:#b91c1c;
                                    "
                                >

                                    <strong>
                                        Erro ao carregar anúncios
                                    </strong>

                                    <br><br>

                                    ${esc(
                                        erroML?.message ||
                                        'Erro desconhecido'
                                    )}

                                </td>

                            </tr>
                        `;
                    }
                }
            }
        }

    })();
};

    console.log('✅ gerenciamento_anuncios_integrado.js carregado');
})();