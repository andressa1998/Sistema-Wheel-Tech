// ================================================================
// GERENCIAMENTO DE ANÚNCIOS - MERCADO LIVRE
// VERSÃO CONSOLIDADA
// ================================================================

(function () {
    'use strict';

    // ============================================================
    // CONFIGURAÇÃO / ESTADO
    // ============================================================

    const GA = {
        api: 'https://api.mercadolibre.com',

        site: 'MLB',

        worker:
            window.WORKER_URL ||
            'https://purple-bonus-3b1c.andmiotto1998.workers.dev',

        rows: [],

        filtered: [],

        page: 1,

        pageSize: 20,

        token: null,

        sellerId: null,

        loading: false,

        products: [],

        productBySku: new Map(),

        productsByMlb: new Map(),

        listingTypeNames: new Map(),

        exposureNames: new Map(),

        exposureByListingType: new Map(),

        userProductStockCache: new Map(),

        userProductStockPromises: new Map(),

        inventoryStockCache: new Map(),

        stockNextRequestAt: 0,

        stockRequestIntervalMs: 750,

        databaseTable:
            'gerenciamento_anuncios_ml'
    };


    // ============================================================
    // UTILITÁRIOS
    // ============================================================

    function esc(value) {

        return String(
            value ?? ''
        )
            .replaceAll(
                '&',
                '&amp;'
            )
            .replaceAll(
                '<',
                '&lt;'
            )
            .replaceAll(
                '>',
                '&gt;'
            )
            .replaceAll(
                '"',
                '&quot;'
            )
            .replaceAll(
                "'",
                '&#039;'
            );
    }


    function sleep(ms) {

        return new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    ms
                )
        );
    }


    function numeroOuNull(value) {

        if (
            value === null ||
            value === undefined ||
            value === ''
        ) {

            return null;
        }


        const numero =
            Number(value);


        return Number.isFinite(
            numero
        )
            ? numero
            : null;
    }


    function dataLocalISO(
        data = new Date()
    ) {

        const d =
            new Date(data);


        return (
            d.getFullYear() +
            '-' +
            String(
                d.getMonth() + 1
            ).padStart(
                2,
                '0'
            ) +
            '-' +
            String(
                d.getDate()
            ).padStart(
                2,
                '0'
            )
        );
    }


    function skuBase(sku) {

        if (!sku) {

            return '';
        }


        let resultado =
            String(sku)
                .trim()
                .toUpperCase();


        if (
            /^\d{3}/.test(
                resultado
            )
        ) {

            resultado =
                resultado.slice(
                    3
                );
        }


        return resultado.slice(
            0,
            8
        );
    }


    function parseMlbCodes(value) {

        if (!value) {

            return [];
        }


        if (
            Array.isArray(
                value
            )
        ) {

            return value
                .flat(
                    Infinity
                )
                .map(
                    String
                )
                .filter(
                    Boolean
                );
        }


        if (
            typeof value ===
            'object'
        ) {

            return Object
                .values(
                    value
                )
                .flat(
                    Infinity
                )
                .map(
                    String
                )
                .filter(
                    Boolean
                );
        }


        const texto =
            String(
                value
            ).trim();


        if (!texto) {

            return [];
        }


        try {

            const json =
                JSON.parse(
                    texto
                );


            if (
                Array.isArray(
                    json
                )
            ) {

                return json
                    .flat(
                        Infinity
                    )
                    .map(
                        String
                    )
                    .filter(
                        Boolean
                    );
            }


            if (
                json &&
                typeof json ===
                    'object'
            ) {

                return Object
                    .values(
                        json
                    )
                    .flat(
                        Infinity
                    )
                    .map(
                        String
                    )
                    .filter(
                        Boolean
                    );
            }

        } catch (error) {

            // Não era JSON
        }


        return texto
            .split(
                /[\s,;|]+/
            )
            .map(
                valor =>
                    valor.trim()
            )
            .filter(
                Boolean
            );
    }


    function buscarSkuNosAtributos(
        attributes
    ) {

        if (
            !Array.isArray(
                attributes
            )
        ) {

            return '';
        }


        const atributo =
            attributes.find(
                atributo => {

                    const id =
                        String(
                            atributo?.id ||
                            atributo?.name ||
                            ''
                        )
                            .trim()
                            .toUpperCase();


                    return (
                        id ===
                            'SELLER_SKU' ||
                        id ===
                            'SKU'
                    );
                }
            );


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


    function primeiroValor(
        ...valores
    ) {

        for (
            const valor
            of valores
        ) {

            if (
                valor !== null &&
                valor !== undefined &&
                String(
                    valor
                ).trim() !== ''
            ) {

                return String(
                    valor
                ).trim();
            }
        }


        return '';
    }


    function extractSku(
        item,
        variation = null
    ) {

        if (variation) {

            const skuVariacao =
                primeiroValor(

                    variation.seller_sku,

                    buscarSkuNosAtributos(
                        variation.attributes
                    ),

                    buscarSkuNosAtributos(
                        variation.attribute_combinations
                    ),

                    variation.seller_custom_field
                );


            if (
                skuVariacao
            ) {

                return skuVariacao;
            }


            // Se só existe uma variação,
            // podemos usar o SKU do item pai.
            if (
                Array.isArray(
                    item?.variations
                ) &&
                item.variations.length ===
                    1
            ) {

                return primeiroValor(

                    item?.seller_sku,

                    buscarSkuNosAtributos(
                        item?.attributes
                    ),

                    item?.seller_custom_field
                );
            }


            return '';
        }


        return primeiroValor(

            item?.seller_sku,

            buscarSkuNosAtributos(
                item?.attributes
            ),

            item?.seller_custom_field
        );
    }


    function isRateLimit(
        error
    ) {

        const status =
            Number(
                error?.status ||
                0
            );


        const mensagem =
            String(
                error?.message ||
                error?.data?.message ||
                error ||
                ''
            )
                .toLowerCase();


        return (

            status === 429 ||

            mensagem.includes(
                '429'
            ) ||

            mensagem.includes(
                'rate limit'
            ) ||

            mensagem.includes(
                'too many requests'
            ) ||

            mensagem.includes(
                'over quota'
            )
        );
    }


    function progress(texto = '') {

    const box =
        document.getElementById(
            'gaProgressBar'
        );

    const text =
        document.getElementById(
            'gaProgressText'
        );


    if (!box) {
        return;
    }


    if (
        texto &&
        String(texto).trim() !== ''
    ) {

        box.classList.remove(
            'hidden'
        );

        box.style.display =
            'block';


        if (text) {

            text.textContent =
                texto;
        }


        return;
    }


    box.classList.add(
        'hidden'
    );

    box.style.display =
        'none';
}


    // ============================================================
    // ESTOQUE INTERNO
    // ============================================================

    async function loadInternalStock() {

        console.log(
            '📦 Carregando estoque interno...'
        );


        let data =
            null;


        // Tentar usar produtos já carregados
        try {

            if (
                typeof produtosEstoque !==
                    'undefined' &&
                Array.isArray(
                    produtosEstoque
                ) &&
                produtosEstoque.length >
                    0
            ) {

                data =
                    produtosEstoque;


                console.log(
                    `✅ Reutilizando ${data.length} produtos de produtosEstoque.`
                );
            }

        } catch (error) {

            console.warn(
                '⚠️ Não foi possível reutilizar produtosEstoque:',
                error
            );
        }


        // Se não estiver carregado,
        // buscar diretamente no Supabase.
        if (!data) {

            if (
                !window.supabaseClient
            ) {

                throw new Error(
                    'Supabase não inicializado.'
                );
            }


            const {
                data: produtos,
                error
            } =
                await window
                    .supabaseClient
                    .from(
                        'produtos_estoque'
                    )
                    .select(
                        '*'
                    )
                    .order(
                        'nome',
                        {
                            ascending:
                                true
                        }
                    );


            if (error) {

                console.error(
                    '❌ Erro ao carregar produtos_estoque:',
                    error
                );


                throw new Error(
                    error.message ||
                    error.details ||
                    error.hint ||
                    'Erro ao carregar estoque interno.'
                );
            }


            data =
                produtos ||
                [];
        }


        GA.products =
            data ||
            [];


        GA.productBySku
            .clear();


        GA.productsByMlb
            .clear();


        // ========================================================
        // INDEXAR PRODUTOS POR SKU E MLB
        // ========================================================

        for (
            const produto
            of GA.products
        ) {

            if (!produto) {

                continue;
            }


            const base =
                skuBase(
                    produto.sku
                );


            if (
                base &&
                !GA.productBySku.has(
                    base
                )
            ) {

                GA.productBySku.set(
                    base,
                    produto
                );
            }


            const mlbCodesRaw =

                produto.mlb_codes ??

                produto
                    .dados_extra
                    ?.mlb_codes ??

                null;


            const codigos =
                parseMlbCodes(
                    mlbCodesRaw
                );


            for (
                const codigo
                of codigos
            ) {

                const match =
                    String(
                        codigo
                    )
                        .toUpperCase()
                        .match(
                            /MLB\d+/
                        );


                if (!match) {

                    continue;
                }


                const mlb =
                    match[0];


                if (
                    !GA.productsByMlb.has(
                        mlb
                    )
                ) {

                    GA.productsByMlb.set(
                        mlb,
                        []
                    );
                }


                const lista =
                    GA.productsByMlb.get(
                        mlb
                    );


                if (
                    !lista.some(
                        produtoLista =>
                            String(
                                produtoLista.id
                            ) ===
                            String(
                                produto.id
                            )
                    )
                ) {

                    lista.push(
                        produto
                    );
                }
            }
        }


        console.log(
            `✅ ${GA.products.length} produtos internos carregados.`
        );


        console.log(
            `🔑 ${GA.productBySku.size} SKUs internos indexados.`
        );


        console.log(
            `🏷️ ${GA.productsByMlb.size} MLBs internos indexados.`
        );
    }


    function warehouseStock(
        sku,
        itemId
    ) {

        // ========================================================
        // PRIMEIRO TENTAR PELO SKU
        // ========================================================

        if (sku) {

            const partes =
                String(
                    sku
                )
                    .split(
                        '.'
                    )
                    .map(
                        valor =>
                            valor.trim()
                    )
                    .filter(
                        Boolean
                    );


            let quantidadePossivel =
                Infinity;


            let encontrouTodos =
                true;


            for (
                const parte
                of partes
            ) {

                const match =
                    parte.match(
                        /^(\d{3})(.+)$/
                    );


                const quantidadePorKit =
                    match

                        ? Math.max(
                            1,
                            parseInt(
                                match[1],
                                10
                            ) ||
                            1
                        )

                        : 1;


                const skuReal =
                    match
                        ? match[2]
                        : parte;


                const produto =
                    GA.productBySku.get(
                        skuBase(
                            skuReal
                        )
                    );


                if (!produto) {

                    encontrouTodos =
                        false;

                    break;
                }


                const estoqueAtual =
                    Number(
                        produto.quantidade
                    ) ||
                    0;


                const kitsPossiveis =
                    Math.floor(
                        estoqueAtual /
                        quantidadePorKit
                    );


                quantidadePossivel =
                    Math.min(
                        quantidadePossivel,
                        kitsPossiveis
                    );
            }


            if (
                encontrouTodos &&
                partes.length >
                    0 &&
                Number.isFinite(
                    quantidadePossivel
                )
            ) {

                return quantidadePossivel;
            }
        }


        // ========================================================
        // FALLBACK POR MLB
        // ========================================================

        const produtosMlb =
            GA.productsByMlb.get(
                String(
                    itemId ||
                    ''
                ).toUpperCase()
            ) ||
            [];


        if (
            produtosMlb.length ===
            1
        ) {

            return Number(
                produtosMlb[0]
                    .quantidade
            ) ||
            0;
        }


        return null;
    }


    function skuInternoPorMlb(
        itemId
    ) {

        const produtosMlb =
            GA.productsByMlb.get(
                String(
                    itemId ||
                    ''
                ).toUpperCase()
            ) ||
            [];


        if (
            produtosMlb.length ===
                1 &&
            produtosMlb[0]
                ?.sku
        ) {

            return String(
                produtosMlb[0]
                    .sku
            ).trim();
        }


        return '';
    }


    // ============================================================
    // TOKEN / API MERCADO LIVRE
    // ============================================================

    async function getToken() {

        if (
            GA.token
        ) {

            return GA.token;
        }


        try {

            if (
                typeof window
                    .getValidToken ===
                'function'
            ) {

                const tokenData =
                    await window
                        .getValidToken();


                GA.token =

                    tokenData
                        ?.access_token ||

                    tokenData ||

                    null;
            }

        } catch (error) {

            console.warn(
                '⚠️ getValidToken falhou:',
                error
            );
        }


        if (
            !GA.token
        ) {

            GA.token =

                window
                    .mlTokenStatus
                    ?.access_token ||

                localStorage.getItem(
                    'ml_access_token'
                ) ||

                null;
        }


        if (
            !GA.token
        ) {

            throw new Error(
                'Token do Mercado Livre não encontrado.'
            );
        }


        return GA.token;
    }


    async function ml(
        path
    ) {

        const accessToken =
            await getToken();


        const url =
            path.startsWith(
                'http'
            )

                ? path

                : `${GA.api}${path}`;


        const proxyUrl =

            `${GA.worker}/api/ml/proxy?url=` +

            `${encodeURIComponent(
                url
            )}` +

            `&token=${encodeURIComponent(
                accessToken
            )}`;


        const response =
            await fetch(
                proxyUrl
            );


        const text =
            await response.text();


        let data =
            null;


        try {

            data =
                text
                    ? JSON.parse(
                        text
                    )
                    : null;

        } catch (error) {

            data =
                text;
        }


        if (
            !response.ok
        ) {

            const error =
                new Error(
                    data?.message ||
                    data?.error ||
                    `HTTP ${response.status}`
                );


            error.status =
                response.status;


            error.data =
                data;


            throw error;
        }


        return data;
    }


    async function mlComRetry(
        path,
        maxTentativas = 4
    ) {

        let ultimoErro =
            null;


        for (
            let tentativa = 1;
            tentativa <=
                maxTentativas;
            tentativa++
        ) {

            try {

                return await ml(
                    path
                );

            } catch (error) {

                ultimoErro =
                    error;


                if (
                    !isRateLimit(
                        error
                    ) ||
                    tentativa ===
                        maxTentativas
                ) {

                    throw error;
                }


                const espera =
                    Math.min(
                        15000,
                        tentativa *
                        2500
                    );


                console.warn(
                    `⏳ Rate limit. Nova tentativa ${tentativa + 1}/${maxTentativas} em ${espera}ms.`
                );


                await sleep(
                    espera
                );
            }
        }


        throw (
            ultimoErro ||
            new Error(
                'Falha na API do Mercado Livre.'
            )
        );
    }


    async function getSellerId() {

        if (
            GA.sellerId
        ) {

            return GA.sellerId;
        }


        const me =
            await mlComRetry(
                '/users/me'
            );


        GA.sellerId =
            me?.id ||
            null;


        if (
            !GA.sellerId
        ) {

            throw new Error(
                'seller_id não encontrado.'
            );
        }


        console.log(
            '👤 Seller ID:',
            GA.sellerId
        );


        return GA.sellerId;
    }


    // ============================================================
    // BUSCAR TODOS OS IDS
    // ============================================================

    async function scanAllIds() {

        const seller =
            await getSellerId();


        const ids =
            [];


        const vistos =
            new Set();


        let scrollId =
            null;


        for (
            let loop = 0;
            loop < 10000;
            loop++
        ) {

            let path =

                `/users/${seller}/items/search` +

                `?search_type=scan` +

                `&limit=100`;


            if (
                scrollId
            ) {

                path +=

                    `&scroll_id=${encodeURIComponent(
                        scrollId
                    )}`;
            }


            const data =
                await mlComRetry(
                    path,
                    5
                );


            const resultados =
                Array.isArray(
                    data?.results
                )

                    ? data.results

                    : [];


            if (
                !resultados.length
            ) {

                break;
            }


            let adicionados =
                0;


            for (
                const id
                of resultados
            ) {

                if (
                    !vistos.has(
                        id
                    )
                ) {

                    vistos.add(
                        id
                    );


                    ids.push(
                        id
                    );


                    adicionados++;
                }
            }


            progress(
                `Localizando anúncios... ${ids.length}`
            );


            scrollId =
                data?.scroll_id ||
                scrollId;


            if (
                !scrollId ||
                !adicionados
            ) {

                break;
            }
        }


        console.log(
            `✅ ${ids.length} anúncios encontrados.`
        );


        return ids;
    }


    // ============================================================
    // BUSCAR DETALHES DOS ITENS
    // ============================================================

    async function getAllItems(
        ids
    ) {

        const resultado =
            [];


        const attributes =
            [

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

            ].join(
                ','
            );


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


            const path =

                `/items?ids=${grupo.join(
                    ','
                )}` +

                `&include_attributes=all` +

                `&attributes=${encodeURIComponent(
                    attributes
                )}`;


            const data =
                await mlComRetry(
                    path,
                    5
                );


            for (
                const resposta
                of data ||
                []
            ) {

                if (
                    resposta?.code ===
                        200 &&
                    resposta?.body
                ) {

                    resultado.push(
                        resposta.body
                    );
                }
            }


            progress(

                `Lendo anúncios... ` +

                `${Math.min(
                    i + 20,
                    ids.length
                )}` +

                `/${ids.length}`
            );


            await sleep(
                80
            );
        }


        console.log(
            `📦 ${resultado.length} anúncios detalhados recebidos.`
        );


        return resultado;
    }


    function isFull(item) {

    const logisticType =
        String(
            item?.shipping?.logistic_type ||
            ''
        )
            .trim()
            .toLowerCase();


    // =========================================================
    // SOMENTE É FULL SE A LOGÍSTICA DO ANÚNCIO FOR FULFILLMENT
    // =========================================================

    return (
        logisticType ===
        'fulfillment'
    );
}


    // ============================================================
    // CRIAR LINHAS
    // ============================================================

    function buildRows(
        items
    ) {

        const rows =
            [];


        for (
            const item
            of items
        ) {

            if (
                !isFull(
                    item
                )
            ) {

                continue;
            }


            const variations =
                Array.isArray(
                    item.variations
                )

                    ? item.variations

                    : [];


            // ====================================================
            // COM VARIAÇÕES
            // ====================================================

            if (
                variations.length
            ) {

                for (
                    const variation
                    of variations
                ) {

                    let sku =
                        extractSku(
                            item,
                            variation
                        );


                    if (!sku) {

                        sku =
                            skuInternoPorMlb(
                                item.id
                            );
                    }


                    rows.push({

                        key:
                            `${item.id}:${variation.id}`,

                        itemId:
                            item.id,

                        variationId:
                            variation.id,

                        title:
                            item.title ||
                            '-',

                        thumbnail:
                            item.thumbnail ||
                            '',

                        permalink:
                            item.permalink ||
                            '',

                        sku:
                            sku ||
                            '',

                        userProductId:

                            variation
                                .user_product_id ||

                            item
                                .user_product_id ||

                            null,

                        inventoryId:

                            variation
                                .inventory_id ||

                            item
                                .inventory_id ||

                            null,

                        listingTypeId:
                            item
                                .listing_type_id ||
                            '',

                        listingTypeName:
                            '',

                        exposureId:
                            '',

                        exposureName:
                            '',

                        status:
                            item.status ||
                            '',

                        price:

                            variation.price ??

                            item.price ??

                            null,

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

                        ultimaSincronizacao:
                            null
                    });
                }

            } else {

                // =================================================
                // SEM VARIAÇÕES
                // =================================================

                let sku =
                    extractSku(
                        item
                    );


                if (!sku) {

                    sku =
                        skuInternoPorMlb(
                            item.id
                        );
                }


                rows.push({

                    key:
                        item.id,

                    itemId:
                        item.id,

                    variationId:
                        null,

                    title:
                        item.title ||
                        '-',

                    thumbnail:
                        item.thumbnail ||
                        '',

                    permalink:
                        item.permalink ||
                        '',

                    sku:
                        sku ||
                        '',

                    userProductId:

                        item
                            .user_product_id ||

                        null,

                    inventoryId:

                        item
                            .inventory_id ||

                        null,

                    listingTypeId:

                        item
                            .listing_type_id ||

                        '',

                    listingTypeName:
                        '',

                    exposureId:
                        '',

                    exposureName:
                        '',

                    status:
                        item.status ||
                        '',

                    price:

                        item.price ??

                        null,

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

                    ultimaSincronizacao:
                        null
                });
            }
        }


        return rows;
    }


    // ============================================================
    // RECUPERAR SKUS QUE NÃO VIERAM NA PRIMEIRA BUSCA
    // ============================================================

    async function recuperarSkusFaltantes(
        rows
    ) {

        const semSku =
            rows.filter(
                row =>
                    !String(
                        row.sku ||
                        ''
                    ).trim()
            );


        if (
            !semSku.length
        ) {

            console.log(
                `🏷️ SKU: ${rows.length}/${rows.length} linhas com SKU.`
            );


            return;
        }


        const itemIds =
            [
                ...new Set(
                    semSku
                        .map(
                            row =>
                                row.itemId
                        )
                        .filter(
                            Boolean
                        )
                )
            ];


        console.log(
            `🏷️ ${semSku.length} linha(s) sem SKU. Fazendo segunda leitura de ${itemIds.length} anúncio(s).`
        );


        const detalhesPorItem =
            new Map();


        for (
            let i = 0;
            i < itemIds.length;
            i += 20
        ) {

            const grupo =
                itemIds.slice(
                    i,
                    i + 20
                );


            try {

                const data =
                    await mlComRetry(

                        `/items?ids=${grupo.join(
                            ','
                        )}&include_attributes=all`,

                        4
                    );


                for (
                    const resposta
                    of data ||
                    []
                ) {

                    if (
                        resposta?.code ===
                            200 &&
                        resposta
                            ?.body
                            ?.id
                    ) {

                        detalhesPorItem.set(

                            String(
                                resposta
                                    .body
                                    .id
                            ),

                            resposta.body
                        );
                    }
                }

            } catch (error) {

                console.warn(
                    '⚠️ Segunda leitura de SKU falhou:',
                    grupo,
                    error
                );
            }


            progress(

                `Recuperando SKUs faltantes... ` +

                `${Math.min(
                    i + 20,
                    itemIds.length
                )}` +

                `/${itemIds.length}`
            );


            await sleep(
                120
            );
        }


        // ========================================================
        // APLICAR SKUS RECUPERADOS
        // ========================================================

        for (
            const row
            of semSku
        ) {

            const item =
                detalhesPorItem.get(
                    String(
                        row.itemId
                    )
                );


            if (!item) {

                continue;
            }


            let sku =
                '';


            if (
                row.variationId
            ) {

                const variation =
                    (
                        item.variations ||
                        []
                    )
                        .find(
                            variation =>
                                String(
                                    variation.id
                                ) ===
                                String(
                                    row.variationId
                                )
                        );


                if (variation) {

                    sku =
                        extractSku(
                            item,
                            variation
                        );


                    row.userProductId =

                        variation
                            .user_product_id ||

                        row.userProductId ||

                        item
                            .user_product_id ||

                        null;


                    row.inventoryId =

                        variation
                            .inventory_id ||

                        row.inventoryId ||

                        item
                            .inventory_id ||

                        null;
                }

            } else {

                sku =
                    extractSku(
                        item
                    );


                row.userProductId =

                    item
                        .user_product_id ||

                    row.userProductId ||

                    null;


                row.inventoryId =

                    item
                        .inventory_id ||

                    row.inventoryId ||

                    null;
            }


            if (!sku) {

                sku =
                    skuInternoPorMlb(
                        row.itemId
                    );
            }


            if (sku) {

                row.sku =
                    sku;


                row.internalWarehouse =
                    warehouseStock(
                        sku,
                        row.itemId
                    );
            }
        }


        const aindaSemSku =
            rows.filter(
                row =>
                    !String(
                        row.sku ||
                        ''
                    ).trim()
            );


        console.log(

            `🏷️ SKU: ` +

            `${rows.length - aindaSemSku.length}` +

            `/${rows.length} linhas com SKU.`
        );


        if (
            aindaSemSku.length
        ) {

            console.warn(

                `⚠️ ${aindaSemSku.length} linha(s) continuam sem SKU cadastrado/retornado.`,

                aindaSemSku
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
    }


    async function loadExposure(rows) {

    // =========================================================
    // NÃO VAMOS MAIS TRABALHAR COM "EXPOSIÇÃO"
    //
    // Essa função permanece com o mesmo nome para não precisar
    // alterar as chamadas existentes no loadAll().
    //
    // Ela agora resolve somente:
    //
    // listing_type_id
    // listing_type_name
    //
    // Exemplo:
    // gold_pro     -> Premium
    // gold_special -> Clássico
    // =========================================================


    // =========================================================
    // TENTAR BUSCAR NOMES OFICIAIS
    // =========================================================

    try {

        const types =
            await mlComRetry(
                `/sites/${GA.site}/listing_types`,
                3
            );


        for (const type of types || []) {

            if (!type?.id) {
                continue;
            }


            GA.listingTypeNames.set(
                type.id,
                type.name || type.id
            );
        }

    } catch (error) {

        console.warn(
            '⚠️ Não foi possível buscar listing_types:',
            error
        );
    }


    // =========================================================
    // FALLBACKS
    // =========================================================

    GA.listingTypeNames.set(
        'gold_pro',
        'Premium'
    );

    GA.listingTypeNames.set(
        'gold_special',
        'Clássico'
    );

    GA.listingTypeNames.set(
        'gold_premium',
        'Premium'
    );

    GA.listingTypeNames.set(
        'gold',
        'Ouro'
    );

    GA.listingTypeNames.set(
        'silver',
        'Prata'
    );

    GA.listingTypeNames.set(
        'free',
        'Grátis'
    );


    // =========================================================
    // APLICAR NAS LINHAS
    // =========================================================

    for (const row of rows) {

        row.listingTypeName =
            GA.listingTypeNames.get(
                row.listingTypeId
            ) ||
            row.listingTypeId ||
            '-';


        // Não utilizaremos mais exposição
        row.exposureId =
            '';

        row.exposureName =
            '';
    }
}

    function linhaParaRegistroBanco(
    row
) {

    return {

        chave:
            String(
                row.key ||
                `${row.itemId}:${row.variationId || '0'}`
            ),

        item_id:
            row.itemId
                ? String(
                    row.itemId
                )
                : null,

        variation_id:
            row.variationId !== null &&
            row.variationId !== undefined

                ? String(
                    row.variationId
                )

                : null,

        seller_id:
            GA.sellerId !== null &&
            GA.sellerId !== undefined

                ? String(
                    GA.sellerId
                )

                : null,

        user_product_id:
            row.userProductId
                ? String(
                    row.userProductId
                )
                : null,

        inventory_id:
            row.inventoryId
                ? String(
                    row.inventoryId
                )
                : null,

        title:
            row.title ||
            null,

        sku:
            row.sku ||
            null,

        thumbnail:
            row.thumbnail ||
            null,

        permalink:
            row.permalink ||
            null,

        listing_type_id:
            row.listingTypeId ||
            null,

        listing_type_name:
            row.listingTypeName ||
            null,

        exposure_id:
            null,

        exposure_name:
            null,

        status:
            row.status ||
            null,

        price:
            numeroOuNull(
                row.price
            ),

        estoque_ml_fora_full:
            numeroOuNull(
                row.warehouse
            ),

        estoque_full:
            numeroOuNull(
                row.full
            ),

        estoque_total_ml:
            numeroOuNull(
                row.mlTotal
            ),

        estoque_full_indisponivel:
            null,

        estoque_full_total:
            null,

        estoque_interno:
            null,

        stock_locations:
            Array.isArray(
                row.stockLocations
            )
                ? row.stockLocations
                : [],

        stock_error:
            row.stockError ||
            null,


        // =====================================================
        // VENDAS FULL
        // =====================================================

        vendas_full_30d:
            row.vendasFull30d !== null &&
            row.vendasFull30d !== undefined

                ? Number(
                    row.vendasFull30d
                )

                : null,

        ultima_venda_full:
            row.ultimaVendaFull ||
            null,

        dias_sem_vender:
            row.diasSemVender !== null &&
            row.diasSemVender !== undefined

                ? Number(
                    row.diasSemVender
                )

                : null,

        vendas_full_atualizado_em:
            row.vendasFullAtualizadoEm ||
            null,


        ultima_sincronizacao:
            new Date()
                .toISOString()
    };
}


    function registroBancoParaLinha(
    registro
) {

    return {

        key:
            registro.chave,

        itemId:
            registro.item_id,

        variationId:
            registro.variation_id,

        title:
            registro.title ||
            '-',

        thumbnail:
            registro.thumbnail ||
            '',

        permalink:
            registro.permalink ||
            '',

        sku:
            registro.sku ||
            '',

        userProductId:
            registro.user_product_id ||
            null,

        inventoryId:
            registro.inventory_id ||
            null,

        listingTypeId:
            registro.listing_type_id ||
            '',

        listingTypeName:
            registro.listing_type_name ||
            '',

        exposureId:
            '',

        exposureName:
            '',

        status:
            registro.status ||
            '',

        price:
            numeroOuNull(
                registro.price
            ),

        warehouse:
            numeroOuNull(
                registro
                    .estoque_ml_fora_full
            ),

        full:
            numeroOuNull(
                registro
                    .estoque_full
            ),

        mlTotal:
            numeroOuNull(
                registro
                    .estoque_total_ml
            ),

        unavailable:
            null,

        fullTotal:
            null,

        stockLocations:
            Array.isArray(
                registro.stock_locations
            )
                ? registro.stock_locations
                : [],

        stockError:
            registro.stock_error ||
            null,


        // =====================================================
        // VENDAS FULL
        // =====================================================

        vendasFull30d:
            numeroOuNull(
                registro
                    .vendas_full_30d
            ),

        ultimaVendaFull:
            registro
                .ultima_venda_full ||
            null,

        diasSemVender:
            numeroOuNull(
                registro
                    .dias_sem_vender
            ),

        vendasFullAtualizadoEm:
            registro
                .vendas_full_atualizado_em ||
            null,


        ultimaSincronizacao:
            registro
                .ultima_sincronizacao ||
            null
    };
}


    function mesclarLinhasComDadosSalvos(
        novasLinhas,
        linhasAntigas
    ) {

        const antigasPorChave =
            new Map();


        for (
            const antiga
            of linhasAntigas ||
            []
        ) {

            if (
                antiga?.key
            ) {

                antigasPorChave.set(

                    String(
                        antiga.key
                    ),

                    antiga
                );
            }
        }


        return (
            novasLinhas ||
            []
        )
            .map(
                nova => {

                    const antiga =
                        antigasPorChave.get(
                            String(
                                nova.key
                            )
                        );


                    if (!antiga) {

                        return nova;
                    }


                    return {

                        ...antiga,

                        ...nova,

                        warehouse:

                            antiga.warehouse !==
                                undefined

                                ? antiga.warehouse

                                : nova.warehouse,

                        full:

                            antiga.full !==
                                undefined

                                ? antiga.full

                                : nova.full,

                        mlTotal:

                            antiga.mlTotal !==
                                undefined

                                ? antiga.mlTotal

                                : nova.mlTotal,

                        unavailable:

                            antiga.unavailable !==
                                undefined

                                ? antiga.unavailable

                                : nova.unavailable,

                        fullTotal:

                            antiga.fullTotal !==
                                undefined

                                ? antiga.fullTotal

                                : nova.fullTotal,

                        stockLocations:

                            Array.isArray(
                                antiga.stockLocations
                            )

                                ? antiga.stockLocations

                                : [],

                        stockError:
                            antiga.stockError ||
                            null,

                        internalWarehouse:
                            nova.internalWarehouse
                    };
                }
            );
    }


    // ============================================================
    // CARREGAR BANCO
    // ============================================================

    async function carregarAnunciosBanco() {

        if (
            !window.supabaseClient
        ) {

            throw new Error(
                'Supabase não inicializado.'
            );
        }


        console.log(
            '💾 Carregando anúncios salvos no banco...'
        );


        const todos =
            [];


        const TAMANHO =
            1000;


        let inicio =
            0;


        while (true) {

            const {
                data,
                error
            } =
                await window
                    .supabaseClient
                    .from(
                        GA.databaseTable
                    )
                    .select(
                        '*'
                    )
                    .order(
                        'title',
                        {
                            ascending:
                                true
                        }
                    )
                    .range(

                        inicio,

                        inicio +
                        TAMANHO -
                        1
                    );


            if (error) {

                console.error(
                    '❌ Erro carregando anúncios salvos:',
                    error
                );


                throw error;
            }


            const pagina =
                data ||
                [];


            todos.push(
                ...pagina
            );


            if (
                pagina.length <
                TAMANHO
            ) {

                break;
            }


            inicio +=
                TAMANHO;
        }


        GA.rows =
            todos.map(
                registroBancoParaLinha
            );


        GA.page =
            1;


        updateSummary();

        updateExposureFilter();

        applyFilters(
            false
        );


        console.log(
            `✅ ${GA.rows.length} linha(s) carregadas do banco.`
        );


        return GA.rows;
    }


    // ============================================================
    // SALVAR BANCO
    // ============================================================

    async function salvarAnunciosBanco(
        rows,
        mostrarLog = true
    ) {

        if (
            !Array.isArray(
                rows
            ) ||
            !rows.length
        ) {

            return;
        }


        if (
            !window.supabaseClient
        ) {

            console.warn(
                '⚠️ Supabase não disponível para salvar anúncios.'
            );


            return;
        }


        const mapa =
            new Map();


        for (
            const row
            of rows
        ) {

            if (!row) {

                continue;
            }


            const registro =
                linhaParaRegistroBanco(
                    row
                );


            if (
                !registro.chave
            ) {

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


        const TAMANHO =
            200;


        let salvos =
            0;


        for (
            let i = 0;
            i < registros.length;
            i += TAMANHO
        ) {

            const lote =
                registros.slice(
                    i,
                    i + TAMANHO
                );


            const {
                error
            } =
                await window
                    .supabaseClient
                    .from(
                        GA.databaseTable
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


        if (
            mostrarLog
        ) {

            console.log(
                `💾 ${salvos} linha(s) salvas/atualizadas no banco.`
            );
        }
    }


    // ============================================================
    // REMOVER ANÚNCIOS QUE NÃO SÃO MAIS FULL
    // ============================================================

    async function removerAnunciosObsoletos(
        rowsAtuais
    ) {

        if (
            !window.supabaseClient
        ) {

            return;
        }


        const chavesAtuais =
            new Set(

                (
                    rowsAtuais ||
                    []
                )
                    .map(
                        row =>
                            String(
                                row.key ||
                                ''
                            )
                    )
                    .filter(
                        Boolean
                    )
            );


        const registrosBanco =
            [];


        const TAMANHO =
            1000;


        let inicio =
            0;


        while (true) {

            let query =
                window
                    .supabaseClient
                    .from(
                        GA.databaseTable
                    )
                    .select(
                        'chave,seller_id'
                    );


            if (
                GA.sellerId
            ) {

                query =
                    query.eq(
                        'seller_id',
                        String(
                            GA.sellerId
                        )
                    );
            }


            query =
                query.range(

                    inicio,

                    inicio +
                    TAMANHO -
                    1
                );


            const {
                data,
                error
            } =
                await query;


            if (error) {

                console.warn(
                    '⚠️ Não foi possível verificar registros obsoletos:',
                    error
                );


                return;
            }


            const pagina =
                data ||
                [];


            registrosBanco.push(
                ...pagina
            );


            if (
                pagina.length <
                TAMANHO
            ) {

                break;
            }


            inicio +=
                TAMANHO;
        }


        const obsoletos =
            registrosBanco
                .map(
                    registro =>
                        String(
                            registro.chave ||
                            ''
                        )
                )
                .filter(
                    chave =>
                        chave &&
                        !chavesAtuais.has(
                            chave
                        )
                );


        if (
            !obsoletos.length
        ) {

            return;
        }


        console.log(
            `🧹 Removendo ${obsoletos.length} registro(s) que não são mais FULL.`
        );


        for (
            let i = 0;
            i < obsoletos.length;
            i += 100
        ) {

            const lote =
                obsoletos.slice(
                    i,
                    i + 100
                );


            const {
                error
            } =
                await window
                    .supabaseClient
                    .from(
                        GA.databaseTable
                    )
                    .delete()
                    .in(
                        'chave',
                        lote
                    );


            if (error) {

                console.warn(
                    '⚠️ Erro removendo registros obsoletos:',
                    error
                );


                return;
            }
        }
    }


    // ============================================================
    // CONTROLE DE RATE LIMIT DE ESTOQUE
    // ============================================================

    async function aguardarSlotEstoque() {

        const agora =
            Date.now();


        const inicio =
            Math.max(

                agora,

                Number(
                    GA.stockNextRequestAt
                ) ||
                0
            );


        GA.stockNextRequestAt =

            inicio +

            GA.stockRequestIntervalMs;


        const espera =
            inicio -
            agora;


        if (
            espera >
            0
        ) {

            await sleep(
                espera
            );
        }
    }


    function aplicarCooldownEstoque(
        ms
    ) {

        GA.stockNextRequestAt =
            Math.max(

                Number(
                    GA.stockNextRequestAt
                ) ||
                0,

                Date.now() +
                ms
            );
    }


    // ============================================================
    // ESTOQUE USER PRODUCT
    // ============================================================

    async function buscarEstoqueUserProduct(
        userProductId
    ) {

        if (
            !userProductId
        ) {

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
                    'Sem user_product_id'
            };
        }


        if (
            GA.userProductStockCache.has(
                userProductId
            )
        ) {

            return GA.userProductStockCache.get(
                userProductId
            );
        }


        if (
            GA.userProductStockPromises.has(
                userProductId
            )
        ) {

            return await GA.userProductStockPromises.get(
                userProductId
            );
        }


        const promise =
            (
                async () => {

                    let ultimoErro =
                        null;


                    for (
                        let tentativa = 1;
                        tentativa <= 4;
                        tentativa++
                    ) {

                        try {

                            await aguardarSlotEstoque();


                            const data =
                                await ml(

                                    `/user-products/${encodeURIComponent(
                                        userProductId
                                    )}/stock`
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


                            for (
                                const location
                                of locations
                            ) {

                                const type =
                                    String(
                                        location?.type ||
                                        ''
                                    )
                                        .toLowerCase();


                                const quantidade =
                                    Number(
                                        location?.quantity
                                    ) ||
                                    0;


                                estoqueTotal +=
                                    quantidade;


                                // FULL
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

                                // ESTOQUE FORA DO FULL
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


                            GA.userProductStockCache.set(
                                userProductId,
                                result
                            );


                            return result;

                        } catch (error) {

                            ultimoErro =
                                error;


                            if (
                                !isRateLimit(
                                    error
                                )
                            ) {

                                console.warn(
                                    `⚠️ Erro estoque UP ${userProductId}:`,
                                    error
                                );


                                break;
                            }


                            const cooldown =
                                Math.min(

                                    60000,

                                    15000 *
                                    tentativa
                                );


                            aplicarCooldownEstoque(
                                cooldown
                            );


                            console.warn(

                                `⏳ Rate limit em ${userProductId}. ` +

                                `Pausa global de ${Math.round(
                                    cooldown /
                                    1000
                                )}s. ` +

                                `Tentativa ${tentativa}/4.`
                            );
                        }
                    }


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

                            ultimoErro
                                ?.message ||

                            'Erro ao consultar estoque do User Product.'
                    };
                }
            )();


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


    // ============================================================
    // FALLBACK INVENTORY
    // ============================================================

    async function buscarEstoqueInventory(
        inventoryId
    ) {

        if (
            !inventoryId
        ) {

            return {

                success:
                    false,

                full:
                    null,

                unavailable:
                    null,

                total:
                    null,

                error:
                    'Sem inventory_id'
            };
        }


        if (
            GA.inventoryStockCache.has(
                inventoryId
            )
        ) {

            return GA.inventoryStockCache.get(
                inventoryId
            );
        }


        try {

            await aguardarSlotEstoque();


            const data =
                await ml(

                    `/inventories/${encodeURIComponent(
                        inventoryId
                    )}/stock/fulfillment`
                );


            const result = {

                success:
                    true,

                full:
                    numeroOuNull(
                        data
                            ?.available_quantity
                    ),

                unavailable:
                    numeroOuNull(
                        data
                            ?.not_available_quantity
                    ),

                total:
                    numeroOuNull(
                        data?.total
                    ),

                error:
                    null
            };


            GA.inventoryStockCache.set(
                inventoryId,
                result
            );


            return result;

        } catch (error) {

            if (
                isRateLimit(
                    error
                )
            ) {

                aplicarCooldownEstoque(
                    15000
                );
            }


            const result = {

                success:
                    false,

                full:
                    null,

                unavailable:
                    null,

                total:
                    null,

                error:
                    error.message
            };


            if (
                !isRateLimit(
                    error
                )
            ) {

                GA.inventoryStockCache.set(
                    inventoryId,
                    result
                );
            }


            return result;
        }
    }


    // ============================================================
    // CARREGAR ESTOQUE ML
    // ============================================================

    async function loadFullStocks(
        rows
    ) {

        if (
            !Array.isArray(
                rows
            ) ||
            !rows.length
        ) {

            return;
        }


        const rowsPorUserProduct =
            new Map();


        const semUserProduct =
            [];


        // ========================================================
        // AGRUPAR POR USER PRODUCT
        // ========================================================

        for (
            const row
            of rows
        ) {

            if (
                row.userProductId
            ) {

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

            } else {

                semUserProduct.push(
                    row
                );
            }
        }


        const userProducts =
            [
                ...rowsPorUserProduct.keys()
            ];


        console.log(

            `📦 ${userProducts.length} User Products únicos ` +

            `para ${rows.length} linha(s).`
        );


        console.log(

            `♻️ ${

                rows.length -

                userProducts.length -

                semUserProduct.length

            } consulta(s) duplicada(s) eliminada(s).`
        );


        let proximoIndice =
            0;


        let concluidos =
            0;


        let sucessos =
            0;


        let erros =
            0;


        let pendentesSalvar =
            [];


        let salvandoPendentes =
            false;


        // ========================================================
        // SALVAR LOTES PROGRESSIVOS
        // ========================================================

        async function salvarPendentes(
            force = false
        ) {

            if (
                salvandoPendentes
            ) {

                return;
            }


            if (
                !force &&
                pendentesSalvar.length <
                    100
            ) {

                return;
            }


            if (
                !pendentesSalvar.length
            ) {

                return;
            }


            salvandoPendentes =
                true;


            try {

                const lote =
                    pendentesSalvar.splice(

                        0,

                        force

                            ? pendentesSalvar.length

                            : 200
                    );


                await salvarAnunciosBanco(
                    lote,
                    false
                );

            } catch (error) {

                console.warn(
                    '⚠️ Falha ao salvar lote parcial:',
                    error
                );

            } finally {

                salvandoPendentes =
                    false;
            }
        }


        // ========================================================
        // WORKER
        // ========================================================

        async function workerUserProduct() {

            while (true) {

                const index =
                    proximoIndice++;


                if (
                    index >=
                    userProducts.length
                ) {

                    return;
                }


                const userProductId =
                    userProducts[
                        index
                    ];


                const linhasDoUP =
                    rowsPorUserProduct.get(
                        userProductId
                    ) ||
                    [];


                try {

                    const estoque =
                        await buscarEstoqueUserProduct(
                            userProductId
                        );


                    if (
                        estoque
                            ?.success
                    ) {

                        sucessos++;


                        for (
                            const row
                            of linhasDoUP
                        ) {

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


                            row.ultimaSincronizacao =
                                new Date()
                                    .toISOString();


                            pendentesSalvar.push(
                                row
                            );
                        }

                    } else {

                        erros++;


                        // IMPORTANTE:
                        // Não apagar estoque antigo.
                        for (
                            const row
                            of linhasDoUP
                        ) {

                            row.stockError =

                                estoque
                                    ?.error ||

                                'Erro ao consultar estoque.';
                        }
                    }

                } catch (error) {

                    erros++;


                    for (
                        const row
                        of linhasDoUP
                    ) {

                        row.stockError =

                            error
                                ?.message ||

                            'Erro ao consultar estoque.';
                    }
                }


                concluidos++;


                progress(

                    `Atualizando estoque ML... ` +

                    `${concluidos}` +

                    `/` +

                    `${userProducts.length}`
                );


                // Atualizar a tabela periodicamente
                if (
                    concluidos %
                    10 ===
                    0
                ) {

                    updateSummary();

                    applyFilters(
                        false
                    );
                }


                await salvarPendentes(
                    false
                );
            }
        }


        // ========================================================
        // 3 WORKERS COM LIMITADOR GLOBAL
        // ========================================================

        const workers =
            Math.min(

                3,

                Math.max(
                    1,
                    userProducts.length
                )
            );


        await Promise.all(

            Array.from(
                {
                    length:
                        workers
                },

                () =>
                    workerUserProduct()
            )
        );


        await salvarPendentes(
            true
        );


        // ========================================================
        // FALLBACK PARA ANÚNCIOS SEM USER PRODUCT
        // ========================================================

        const porInventory =
            new Map();


        for (
            const row
            of semUserProduct
        ) {

            if (
                !row.inventoryId
            ) {

                row.stockError =
                    'Sem user_product_id e sem inventory_id';


                continue;
            }


            if (
                !porInventory.has(
                    row.inventoryId
                )
            ) {

                porInventory.set(
                    row.inventoryId,
                    []
                );
            }


            porInventory
                .get(
                    row.inventoryId
                )
                .push(
                    row
                );
        }


        const inventories =
            [
                ...porInventory.keys()
            ];


        if (
            inventories.length
        ) {

            console.log(

                `📦 ${inventories.length} inventory_id(s) ` +

                `serão usados como fallback.`
            );
        }


        for (
            let i = 0;
            i < inventories.length;
            i++
        ) {

            const inventoryId =
                inventories[i];


            const linhas =
                porInventory.get(
                    inventoryId
                ) ||
                [];


            const estoque =
                await buscarEstoqueInventory(
                    inventoryId
                );


            if (
                estoque
                    ?.success
            ) {

                for (
                    const row
                    of linhas
                ) {

                    row.full =
                        estoque.full;


                    row.mlTotal =
                        estoque.full;


                    row.unavailable =
                        estoque.unavailable;


                    row.fullTotal =
                        estoque.total;


                    row.stockError =
                        null;


                    row.ultimaSincronizacao =
                        new Date()
                            .toISOString();
                }


                try {

                    await salvarAnunciosBanco(
                        linhas,
                        false
                    );

                } catch (error) {

                    console.warn(
                        '⚠️ Não foi possível salvar fallback inventory:',
                        error
                    );
                }

            } else {

                for (
                    const row
                    of linhas
                ) {

                    row.stockError =

                        estoque?.error ||

                        'Erro no inventory';
                }
            }


            progress(

                `Atualizando estoque antigo... ` +

                `${i + 1}` +

                `/` +

                `${inventories.length}`
            );
        }


        updateSummary();

        applyFilters(
            false
        );


        console.log(
            '✅ Consulta de estoque finalizada.',
            {

                userProducts:
                    userProducts.length,

                sucessos:
                    sucessos,

                erros:
                    erros,

                fallbackInventory:
                    inventories.length,

                linhas:
                    rows.length
            }
        );
    }


    // ============================================================
    // CRIAR INTERFACE
    // ============================================================

    function ensureUI() {

        if (
            document.getElementById(
                'gerenciamentoAnunciosScreen'
            )
        ) {

            return;
        }


        // ========================================================
        // CSS
        // ========================================================

        const style =
            document.createElement(
                'style'
            );


        style.id =
            'gerenciamentoAnunciosStyle';


        style.textContent = `

            #gerenciamentoAnunciosScreen {
                position: fixed;
                inset: 0;
                z-index: 99990;
                background: #f5f6f8;
                overflow: auto;
                font-family: Arial, sans-serif;
            }

            #gerenciamentoAnunciosScreen * {
                box-sizing: border-box;
            }

            .gaHead {
                position: sticky;
                top: 0;
                z-index: 20;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                background: #fff;
                border-bottom: 1px solid #e5e7eb;
                padding: 14px 20px;
            }

            .gaHeadLeft,
            .gaHeadRight {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }

            .gaTitle {
                font-size: 20px;
                font-weight: 800;
                margin: 0;
            }

            .gaWrap {
                width: 100%;
                max-width: 1900px;
                margin: 0 auto;
                padding: 18px;
            }

            .gaBtn {
                border: 0;
                border-radius: 8px;
                padding: 10px 13px;
                cursor: pointer;
                font-weight: 700;
                font-size: 13px;
            }

            .gaBtn:disabled {
                opacity: .55;
                cursor: not-allowed;
            }

            .gaPrimary {
                background: #3483fa;
                color: #fff;
            }

            .gaSecondary {
                background: #e9ecef;
                color: #222;
            }

            .gaCards {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 12px;
                margin-bottom: 12px;
            }

            .gaCard {
                background: #fff;
                border: 1px solid #e5e7eb;
                border-radius: 10px;
                padding: 14px;
            }

            .gaCard span {
                color: #6b7280;
                font-size: 12px;
                font-weight: 700;
            }

            .gaCard b {
                display: block;
                margin-top: 5px;
                font-size: 27px;
            }

            #gaProgress {
                display: none;
                align-items: center;
                gap: 8px;
                background: #fff;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 11px 13px;
                margin-bottom: 10px;
                color: #374151;
            }

            .gaTools {
                display: grid;
                grid-template-columns:
                    minmax(240px, 2fr)
                    1fr
                    1fr
                    1fr
                    auto;
                gap: 8px;
                margin-bottom: 10px;
            }

            .gaTools input,
            .gaTools select {
                width: 100%;
                padding: 10px;
                border: 1px solid #d1d5db;
                border-radius: 7px;
                background: #fff;
            }

            .gaTableBox {
                background: #fff;
                border: 1px solid #e5e7eb;
                border-radius: 10px;
                overflow: auto;
            }

            .gaTable {
                width: 100%;
                border-collapse: collapse;
                min-width: 1500px;
            }

            .gaTable th {
                position: sticky;
                top: 0;
                z-index: 2;
                background: #f8fafc;
                padding: 10px;
                text-align: left;
                white-space: nowrap;
                font-size: 12px;
                border-bottom: 1px solid #e5e7eb;
            }

            .gaTable td {
                padding: 9px;
                border-top: 1px solid #eee;
                vertical-align: middle;
                font-size: 13px;
            }

            .gaTable tr:hover td {
                background: #fafafa;
            }

            .gaImg {
                width: 52px;
                height: 52px;
                object-fit: contain;
                border-radius: 6px;
                background: #fff;
            }

            .gaMlb {
                font-weight: 800;
                white-space: nowrap;
            }

            .gaSku {
                display: inline-block;
                margin-top: 4px;
                padding: 3px 7px;
                border-radius: 5px;
                background: #f3f4f6;
                font-family: monospace;
                font-size: 12px;
            }

            .gaSub {
                color: #6b7280;
                font-size: 11px;
                margin-top: 3px;
            }

            .gaStock {
                text-align: center;
                font-size: 19px;
                font-weight: 800;
            }

            .gaStockOk {
                color: #15803d;
            }

            .gaStockZero {
                color: #dc2626;
            }

            .gaStockNa {
                color: #9ca3af;
            }

            .gaBadge {
                display: inline-block;
                padding: 4px 8px;
                border-radius: 999px;
                background: #ede9fe;
                color: #5b21b6;
                font-size: 11px;
                font-weight: 700;
                white-space: nowrap;
            }

            .gaStatusActive {
                background: #dcfce7;
                color: #166534;
            }

            .gaStatusPaused {
                background: #fef3c7;
                color: #92400e;
            }

            .gaStatusClosed {
                background: #fee2e2;
                color: #991b1b;
            }

            .gaLink {
                color: #2563eb;
                text-decoration: none;
                font-weight: 700;
                white-space: nowrap;
            }

            .gaPager {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
                margin-top: 10px;
                background: #fff;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 10px;
            }

            .gaPagerRight {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            @media (max-width: 1100px) {

                .gaCards {
                    grid-template-columns: 1fr 1fr;
                }

                .gaTools {
                    grid-template-columns: 1fr 1fr;
                }
            }
        `;


        document.head.appendChild(
            style
        );


        // ========================================================
        // HTML
        // ========================================================

        const screen =
            document.createElement(
                'div'
            );


        screen.id =
            'gerenciamentoAnunciosScreen';


        screen.style.display =
            'none';


        screen.innerHTML = `

            <div class="gaHead">

                <div class="gaHeadLeft">

                    <button
                        type="button"
                        class="gaBtn gaSecondary"
                        onclick="fecharSistemaGerenciamentoAnuncios()"
                    >
                        <i class="fas fa-arrow-left"></i>
                        Voltar
                    </button>

                    <h2 class="gaTitle">
                        Gerenciamento de Anúncios
                    </h2>

                </div>


                <div class="gaHeadRight">

                    <button
                        type="button"
                        class="gaBtn gaSecondary"
                        onclick="exportarGerenciamentoAnuncios()"
                    >
                        <i class="fas fa-file-export"></i>
                        Exportar
                    </button>


                    <button
                        type="button"
                        class="gaBtn gaPrimary"
                        id="gaRefresh"
                        onclick="carregarGerenciamentoAnuncios(true)"
                    >
                        <i class="fas fa-sync-alt"></i>
                        Atualizar tudo
                    </button>

                </div>

            </div>


            <div class="gaWrap">

                <div class="gaCards">

                    <div class="gaCard">

                        <span>
                            Anúncios FULL
                        </span>

                        <b id="gaAds">
                            0
                        </b>

                    </div>


                    <div class="gaCard">

                        <span>
                            SKUs / variações
                        </span>

                        <b id="gaRows">
                            0
                        </b>

                    </div>


                    <div class="gaCard">

                        <span>
                            Unidades FULL disponíveis
                        </span>

                        <b id="gaFullTotal">
                            0
                        </b>

                    </div>


                    <div class="gaCard">

                        <span>
                            Sem vínculo no estoque interno
                        </span>

                        <b id="gaMissing">
                            0
                        </b>

                    </div>

                </div>


                <div id="gaProgress"></div>


                <div class="gaTools">

                    <input
                        id="gaSearch"
                        type="text"
                        placeholder="Buscar título, MLB, SKU, User Product ou Inventory..."
                        oninput="filtrarGerenciamentoAnuncios()"
                    >


                    <select
                        id="gaExposure"
                        onchange="filtrarGerenciamentoAnuncios()"
                    >

                        <option value="">
                            Todas exposições
                        </option>

                    </select>


                    <select
                        id="gaStatus"
                        onchange="filtrarGerenciamentoAnuncios()"
                    >

                        <option value="">
                            Todos status
                        </option>

                        <option value="active">
                            Ativo
                        </option>

                        <option value="paused">
                            Pausado
                        </option>

                        <option value="under_review">
                            Em revisão
                        </option>

                        <option value="closed">
                            Finalizado
                        </option>

                    </select>


                    <select
                        id="gaSort"
                        onchange="filtrarGerenciamentoAnuncios()"
                    >

                        <option value="title">
                            Título A-Z
                        </option>

                        <option value="fullDesc">
                            FULL maior
                        </option>

                        <option value="fullAsc">
                            FULL menor
                        </option>

                        <option value="depDesc">
                            Depósito ML maior
                        </option>

                        <option value="depAsc">
                            Depósito ML menor
                        </option>

                    </select>


                    <select
                        id="gaPageSize"
                        onchange="alterarTamanhoPaginaGerenciamentoAnuncios()"
                    >

                        <option value="20">
                            20 por página
                        </option>

                        <option
                            value="50"
                            selected
                        >
                            50 por página
                        </option>

                        <option value="100">
                            100 por página
                        </option>

                        <option value="200">
                            200 por página
                        </option>

                    </select>

                </div>


                <div class="gaTableBox">

                    <table class="gaTable">

                        <thead>

                            <tr>

                                <th>
                                    Foto
                                </th>

                                <th>
                                    MLB
                                </th>

                                <th>
                                    Título / SKU
                                </th>

                                <th>
                                    Estoque ML fora FULL
                                </th>

                                <th>
                                    Estoque FULL
                                </th>

                                <th>
                                    FULL indisponível
                                </th>

                                <th>
                                    Exposição
                                </th>

                                <th>
                                    Tipo
                                </th>

                                <th>
                                    Status
                                </th>

                                <th>
                                    Preço
                                </th>

                                <th>
                                    Inventory / UP
                                </th>

                                <th>
                                    Ações
                                </th>

                            </tr>

                        </thead>


                        <tbody id="gaBody">

                            <tr>

                                <td
                                    colspan="12"
                                    style="
                                        text-align:center;
                                        padding:30px;
                                    "
                                >
                                    Carregando...
                                </td>

                            </tr>

                        </tbody>

                    </table>

                </div>


                <div class="gaPager">

                    <div id="gaInfo">
                        0 registros
                    </div>


                    <div class="gaPagerRight">

                        <button
                            type="button"
                            class="gaBtn gaSecondary"
                            onclick="mudarPaginaGerenciamentoAnuncios(-1)"
                        >
                            Anterior
                        </button>


                        <strong id="gaPage">
                            Página 1 de 1
                        </strong>


                        <button
                            type="button"
                            class="gaBtn gaSecondary"
                            onclick="mudarPaginaGerenciamentoAnuncios(1)"
                        >
                            Próxima
                        </button>

                    </div>

                </div>

            </div>
        `;


        document.body.appendChild(
            screen
        );
    }


    // ============================================================
    // STATUS / ESTOQUE VISUAL
    // ============================================================

    function statusLabel(
        status
    ) {

        const nomes = {

            active:
                'Ativo',

            paused:
                'Pausado',

            closed:
                'Finalizado',

            under_review:
                'Em revisão'
        };


        return (
            nomes[
                status
            ] ||

            status ||

            '-'
        );
    }


    function statusClass(
        status
    ) {

        if (
            status ===
            'active'
        ) {

            return 'gaStatusActive';
        }


        if (
            status ===
            'paused'
        ) {

            return 'gaStatusPaused';
        }


        if (
            status ===
            'closed'
        ) {

            return 'gaStatusClosed';
        }


        return '';
    }


    function stockHtml(
        value,
        title = ''
    ) {

        if (
            value === null ||
            value === undefined
        ) {

            return `

                <div
                    class="gaStock gaStockNa"
                    title="${esc(title)}"
                >
                    —
                </div>
            `;
        }


        const numero =
            Number(
                value
            ) ||
            0;


        const classe =

            numero >
                0

                ? 'gaStockOk'

                : 'gaStockZero';


        return `

            <div
                class="gaStock ${classe}"
                title="${esc(title)}"
            >
                ${esc(numero)}
            </div>
        `;
    }


    function updateSummary() {

    // =========================================================
    // ANÚNCIOS
    // =========================================================

    const anuncios =
        new Set(
            GA.rows
                .map(
                    row =>
                        String(
                            row.itemId ||
                            ''
                        )
                )
                .filter(
                    Boolean
                )
        );


    // =========================================================
    // NÃO DUPLICAR ESTOQUE DO MESMO USER PRODUCT
    // =========================================================

    const produtos =
        new Map();


    for (
        const row
        of GA.rows
    ) {

        const chave =
            row.userProductId ||
            row.inventoryId ||
            row.key;


        if (!chave) {
            continue;
        }


        if (
            produtos.has(
                chave
            )
        ) {

            continue;
        }


        produtos.set(
            chave,
            {
                deposito:
                    row.warehouse !== null &&
                    row.warehouse !== undefined

                        ? Number(
                            row.warehouse
                        ) || 0

                        : 0,

                full:
                    row.full !== null &&
                    row.full !== undefined

                        ? Number(
                            row.full
                        ) || 0

                        : 0
            }
        );
    }


    // =========================================================
    // SOMAR
    // =========================================================

    let totalDeposito =
        0;


    let totalFull =
        0;


    for (
        const estoque
        of produtos.values()
    ) {

        totalDeposito +=
            estoque.deposito;


        totalFull +=
            estoque.full;
    }


    // =========================================================
    // HTML
    // =========================================================

    const totalAnuncios =
        document.getElementById(
            'gaTotalAnuncios'
        );


    const totalVariacoes =
        document.getElementById(
            'gaTotalVariacoes'
        );


    const deposito =
        document.getElementById(
            'gaTotalDeposito'
        );


    const full =
        document.getElementById(
            'gaTotalEstoque'
        );


    if (
        totalAnuncios
    ) {

        totalAnuncios.textContent =
            anuncios.size;
    }


    if (
        totalVariacoes
    ) {

        totalVariacoes.textContent =
            GA.rows.length;
    }


    if (
        deposito
    ) {

        deposito.textContent =
            totalDeposito;
    }


    if (
        full
    ) {

        full.textContent =
            totalFull;
    }
}


    function updateExposureFilter() {

    const select =
        document.getElementById(
            'gaFiltroExposicao'
        );


    if (!select) {
        return;
    }


    const valorAtual =
        select.value;


    const exposicoes =
        [
            ...new Set(
                GA.rows
                    .map(
                        row =>
                            row.exposureName
                    )
                    .filter(
                        valor =>
                            valor &&
                            valor !== '-'
                    )
            )
        ]
            .sort(
                (a, b) =>
                    String(a)
                        .localeCompare(
                            String(b),
                            'pt-BR'
                        )
            );


    select.innerHTML = `

        <option value="">
            Todas exposições
        </option>

        ${
            exposicoes
                .map(
                    exposicao => `

                        <option value="${esc(exposicao)}">
                            ${esc(exposicao)}
                        </option>
                    `
                )
                .join('')
        }
    `;


    if (
        exposicoes.includes(
            valorAtual
        )
    ) {

        select.value =
            valorAtual;
    }
}


function applyFilters(
    resetPage = true
) {

    const busca =
        String(
            document.getElementById(
                'gaBusca'
            )?.value || ''
        )
            .trim()
            .toLowerCase();


    const status =
        document.getElementById(
            'gaFiltroStatus'
        )?.value || '';


    const correcao =
        document.getElementById(
            'gaFiltroCorrecao'
        )?.value || '';


    const ordenacao =
        document.getElementById(
            'gaFiltroOrdenacao'
        )?.value || 'title';


    // =========================================================
    // FILTRAR
    // =========================================================

    GA.filtered =
        GA.rows.filter(
            row => {

                // =================================================
                // STATUS
                // =================================================

                if (
                    status &&
                    row.status !== status
                ) {

                    return false;
                }


                // =================================================
                // FILTRO 30+ / PRECISA CORRIGIR
                //
                // Regra:
                //
                // mais de 30 dias sem vender
                // +
                // anúncio Clássico
                // =
                // precisa mudar para Premium
                // =================================================

                if (
                    correcao ===
                    '30plus'
                ) {

                    if (
                        !gaPrecisaCorrigirTipo(
                            row
                        )
                    ) {

                        return false;
                    }
                }


                // =================================================
                // PESQUISA
                // =================================================

                if (busca) {

                    const texto =
                        [

                            row.title,

                            row.itemId,

                            row.variationId,

                            row.sku,

                            row.inventoryId,

                            row.userProductId,

                            row.listingTypeName,

                            row.listingTypeId,

                            row.status,

                            row.diasSemVender

                        ]
                            .join(' ')
                            .toLowerCase();


                    if (
                        !texto.includes(
                            busca
                        )
                    ) {

                        return false;
                    }
                }


                return true;
            }
        );


    // =========================================================
    // AUXILIAR NUMÉRICO
    // =========================================================

    function numero(
        valor,
        fallback
    ) {

        const n =
            Number(valor);


        return Number.isFinite(n)
            ? n
            : fallback;
    }


    // =========================================================
    // ORDENAR
    // =========================================================

    GA.filtered.sort(
        (a, b) => {

            switch (ordenacao) {

                case 'fullDesc':

                    return (
                        numero(
                            b.full,
                            -1
                        ) -
                        numero(
                            a.full,
                            -1
                        )
                    );


                case 'fullAsc':

                    return (
                        numero(
                            a.full,
                            999999999
                        ) -
                        numero(
                            b.full,
                            999999999
                        )
                    );


                case 'depDesc':

                    return (
                        numero(
                            b.warehouse,
                            -1
                        ) -
                        numero(
                            a.warehouse,
                            -1
                        )
                    );


                case 'depAsc':

                    return (
                        numero(
                            a.warehouse,
                            999999999
                        ) -
                        numero(
                            b.warehouse,
                            999999999
                        )
                    );


                default:

                    // Se estiver usando filtro 30+,
                    // colocar os mais parados primeiro.
                    if (
                        correcao ===
                        '30plus'
                    ) {

                        const diasB =
                            numero(
                                b.diasSemVender,
                                9999
                            );


                        const diasA =
                            numero(
                                a.diasSemVender,
                                9999
                            );


                        if (
                            diasB !==
                            diasA
                        ) {

                            return (
                                diasB -
                                diasA
                            );
                        }
                    }


                    return String(
                        a.title || ''
                    )
                        .localeCompare(
                            String(
                                b.title || ''
                            ),
                            'pt-BR'
                        );
            }
        }
    );


    if (resetPage) {

        GA.page =
            1;
    }


    render();
}

// ============================================================
// VENDAS FULL / GIRO DE ESTOQUE
// ============================================================

function formatarDataApiFull(data) {

    const d =
        new Date(data);


    return (
        d.getFullYear() +
        '-' +
        String(
            d.getMonth() + 1
        ).padStart(2, '0') +
        '-' +
        String(
            d.getDate()
        ).padStart(2, '0')
    );
}


// ============================================================
// QUANTOS DIAS DESDE UMA DATA
// ============================================================

function calcularDiasSemVendaFull(dataVenda) {

    if (!dataVenda) {
        return null;
    }


    const data =
        new Date(
            dataVenda
        );


    if (
        Number.isNaN(
            data.getTime()
        )
    ) {

        return null;
    }


    const agora =
        new Date();


    const diferenca =
        agora.getTime() -
        data.getTime();


    return Math.max(
        0,
        Math.floor(
            diferenca /
            86400000
        )
    );
}


// ============================================================
// RETORNAR INVENTORY ID DA OPERAÇÃO
//
// Em algumas respostas antigas/documentações aparece
// seller_product_id. Aceitamos os dois.
// ============================================================

function inventoryIdDaOperacaoFull(
    operacao
) {

    return String(

        operacao?.inventory_id ||

        operacao?.seller_product_id ||

        ''

    ).trim();
}


// ============================================================
// QUANTIDADE VENDIDA EM UMA SALE_CONFIRMATION
//
// Exemplo ML:
// detail.available_quantity = -2
//
// significa venda de 2 unidades.
// ============================================================

function quantidadeVendidaOperacaoFull(
    operacao
) {

    const quantidade =
        Number(
            operacao
                ?.detail
                ?.available_quantity
        );


    if (
        !Number.isFinite(
            quantidade
        )
    ) {

        return 0;
    }


    return Math.abs(
        quantidade
    );
}


// ============================================================
// REQUISIÇÃO DE OPERAÇÕES COM CONTROLE DE RATE LIMIT
// ============================================================

async function requisicaoOperacoesFull(
    path,
    maxTentativas = 4
) {

    let ultimoErro =
        null;


    for (
        let tentativa = 1;
        tentativa <= maxTentativas;
        tentativa++
    ) {

        try {

            // Reaproveitar o mesmo limitador global
            // das consultas de estoque.
            if (
                typeof aguardarSlotEstoque ===
                'function'
            ) {

                await aguardarSlotEstoque();
            }


            return await ml(
                path
            );

        } catch (error) {

            ultimoErro =
                error;


            if (
                !isRateLimit(error) ||
                tentativa === maxTentativas
            ) {

                throw error;
            }


            const espera =
                Math.min(
                    60000,
                    10000 * tentativa
                );


            console.warn(
                `⏳ Rate limit consultando vendas FULL. ` +
                `Tentativa ${tentativa}/${maxTentativas}. ` +
                `Aguardando ${Math.round(espera / 1000)}s...`
            );


            if (
                typeof aplicarCooldownEstoque ===
                'function'
            ) {

                aplicarCooldownEstoque(
                    espera
                );

            } else {

                await sleep(
                    espera
                );
            }
        }
    }


    throw (
        ultimoErro ||
        new Error(
            'Erro ao consultar operações FULL.'
        )
    );
}


// ============================================================
// BUSCAR TODAS AS SALE_CONFIRMATION
//
// inventoryIds pode conter vários IDs.
// A resposta pode possuir paginação por scroll.
// ============================================================

async function buscarOperacoesVendaFull(
    inventoryIds,
    dataFrom,
    dataTo
) {

    const ids =
        [
            ...new Set(
                (
                    inventoryIds ||
                    []
                )
                    .map(
                        id =>
                            String(id).trim()
                    )
                    .filter(Boolean)
            )
        ];


    if (!ids.length) {
        return [];
    }


    const seller =
        await getSellerId();


    const operacoes =
        [];


    const operacoesVistas =
        new Set();


    const scrollsVistos =
        new Set();


    let scroll =
        null;


    for (
        let pagina = 0;
        pagina < 1000;
        pagina++
    ) {

        let path =

            `/stock/fulfillment/operations/search` +

            `?seller_id=${encodeURIComponent(seller)}` +

            `&inventory_id=${encodeURIComponent(ids.join(','))}` +

            `&date_from=${encodeURIComponent(dataFrom)}` +

            `&date_to=${encodeURIComponent(dataTo)}` +

            `&type=SALE_CONFIRMATION` +

            `&limit=1000`;


        if (scroll) {

            path +=
                `&scroll=${encodeURIComponent(scroll)}`;
        }


        const data =
            await requisicaoOperacoesFull(
                path
            );


        const resultados =
            Array.isArray(
                data?.results
            )
                ? data.results
                : [];


        for (const operacao of resultados) {

            const idOperacao =
                String(
                    operacao?.id ||
                    ''
                );


            // Evitar duplicidade entre páginas
            if (
                idOperacao &&
                operacoesVistas.has(
                    idOperacao
                )
            ) {

                continue;
            }


            if (idOperacao) {

                operacoesVistas.add(
                    idOperacao
                );
            }


            const tipo =
                String(
                    operacao?.type ||
                    ''
                )
                    .trim()
                    .toUpperCase();


            if (
                tipo !==
                'SALE_CONFIRMATION'
            ) {

                continue;
            }


            operacoes.push(
                operacao
            );
        }


        const novoScroll =

            data?.paging?.scroll ??

            data?.scroll ??

            data?.scroll_id ??

            null;


        if (!novoScroll) {

            break;
        }


        if (
            scrollsVistos.has(
                String(novoScroll)
            )
        ) {

            break;
        }


        scrollsVistos.add(
            String(novoScroll)
        );


        scroll =
            novoScroll;
    }


    return operacoes;
}


// ============================================================
// APLICAR OPERAÇÃO SOBRE MAPA DE MÉTRICAS
// ============================================================

function processarOperacaoVendaFull(
    metricas,
    operacao,
    somar30Dias = false
) {

    const inventoryId =
        inventoryIdDaOperacaoFull(
            operacao
        );


    if (!inventoryId) {

        return;
    }


    if (
        !metricas.has(
            inventoryId
        )
    ) {

        return;
    }


    const metrica =
        metricas.get(
            inventoryId
        );


    // =========================================================
    // VENDAS 30 DIAS
    // =========================================================

    if (somar30Dias) {

        metrica.vendas30d +=
            quantidadeVendidaOperacaoFull(
                operacao
            );
    }


    // =========================================================
    // ÚLTIMA VENDA
    // =========================================================

    const dataVenda =
        operacao?.date_created;


    if (!dataVenda) {

        return;
    }


    const timestamp =
        new Date(
            dataVenda
        ).getTime();


    if (
        Number.isNaN(
            timestamp
        )
    ) {

        return;
    }


    const timestampAtual =
        metrica.ultimaVenda
            ? new Date(
                metrica.ultimaVenda
            ).getTime()
            : 0;


    if (
        !timestampAtual ||
        timestamp > timestampAtual
    ) {

        metrica.ultimaVenda =
            new Date(
                dataVenda
            ).toISOString();
    }
}


// ============================================================
// ATUALIZAR MÉTRICAS DE VENDAS FULL
// ============================================================

async function atualizarMetricasVendasFull(
    rows
) {

    if (
        !Array.isArray(rows) ||
        !rows.length
    ) {

        return;
    }


    // =========================================================
    // INVENTORY IDS ÚNICOS
    // =========================================================

    const inventories =
        [
            ...new Set(
                rows
                    .map(
                        row =>
                            row.inventoryId
                    )
                    .filter(Boolean)
                    .map(String)
            )
        ];


    if (!inventories.length) {

        console.warn(
            '⚠️ Nenhum inventory_id para analisar vendas FULL.'
        );

        return;
    }


    console.log(
        `📈 Analisando vendas de ${inventories.length} inventory_id(s) FULL...`
    );


    // =========================================================
    // MÉTRICAS
    //
    // Começamos aproveitando última venda salva anteriormente.
    // =========================================================

    const metricas =
        new Map();


    const rowsPorInventory =
        new Map();


    for (const inventoryId of inventories) {

        metricas.set(
            inventoryId,
            {
                vendas30d:
                    0,

                ultimaVenda:
                    null,

                consulta30dOk:
                    false,

                buscaHistoricaCompleta:
                    false,

                erroHistorico:
                    false
            }
        );


        rowsPorInventory.set(
            inventoryId,
            []
        );
    }


    for (const row of rows) {

        if (!row.inventoryId) {

            continue;
        }


        const inventoryId =
            String(
                row.inventoryId
            );


        if (
            !rowsPorInventory.has(
                inventoryId
            )
        ) {

            continue;
        }


        rowsPorInventory
            .get(
                inventoryId
            )
            .push(
                row
            );


        // Aproveitar última venda conhecida.
        if (
            row.ultimaVendaFull
        ) {

            const metrica =
                metricas.get(
                    inventoryId
                );


            const existente =
                metrica.ultimaVenda
                    ? new Date(
                        metrica.ultimaVenda
                    ).getTime()
                    : 0;


            const salva =
                new Date(
                    row.ultimaVendaFull
                ).getTime();


            if (
                Number.isFinite(salva) &&
                salva > existente
            ) {

                metrica.ultimaVenda =
                    row.ultimaVendaFull;
            }
        }
    }


    // =========================================================
    // DATAS DOS ÚLTIMOS 30 DIAS
    //
    // date_to da API funciona como limite superior.
    // Usamos amanhã para incluir as vendas de hoje.
    // =========================================================

    const hoje =
        new Date();


    const inicioHoje =
        new Date(
            hoje.getFullYear(),
            hoje.getMonth(),
            hoje.getDate()
        );


    const dataTo30 =
        new Date(
            inicioHoje
        );


    dataTo30.setDate(
        dataTo30.getDate() + 1
    );


    const dataFrom30 =
        new Date(
            dataTo30
        );


    dataFrom30.setDate(
        dataFrom30.getDate() - 30
    );


    const from30 =
        formatarDataApiFull(
            dataFrom30
        );


    const to30 =
        formatarDataApiFull(
            dataTo30
        );


    console.log(
        `📅 Vendas FULL 30d: ${from30} até ${to30}`
    );


    // =========================================================
    // BUSCAR EM LOTES
    //
    // O endpoint aceita vários inventory_id separados por vírgula.
    // Limitamos a 40 para não gerar URLs exageradamente grandes.
    // =========================================================

    const TAMANHO_LOTE =
        40;


    let processados30 =
        0;


    for (
        let i = 0;
        i < inventories.length;
        i += TAMANHO_LOTE
    ) {

        const lote =
            inventories.slice(
                i,
                i + TAMANHO_LOTE
            );


        try {

            const operacoes =
                await buscarOperacoesVendaFull(
                    lote,
                    from30,
                    to30
                );


            // A consulta funcionou.
            for (const inventoryId of lote) {

                const metrica =
                    metricas.get(
                        inventoryId
                    );


                metrica.vendas30d =
                    0;


                metrica.consulta30dOk =
                    true;
            }


            for (const operacao of operacoes) {

                processarOperacaoVendaFull(
                    metricas,
                    operacao,
                    true
                );
            }

        } catch (error) {

            console.warn(
                '⚠️ Não foi possível consultar vendas 30d do lote:',
                lote,
                error
            );
        }


        processados30 +=
            lote.length;


        progress(
            `Analisando vendas FULL dos últimos 30 dias... ` +
            `${Math.min(processados30, inventories.length)}` +
            `/${inventories.length}`
        );
    }


    // =========================================================
    // QUEM PRECISA DE BUSCA HISTÓRICA?
    //
    // Se:
    // - consulta 30d funcionou;
    // - não vendeu nesses 30 dias;
    // - e NÃO temos uma última venda antiga salva;
    //
    // então pesquisamos para trás.
    // =========================================================

    let faltantes =
        new Set(
            inventories.filter(
                inventoryId => {

                    const metrica =
                        metricas.get(
                            inventoryId
                        );


                    return (
                        metrica.consulta30dOk &&
                        !metrica.ultimaVenda
                    );
                }
            )
        );


    console.log(
        `🔎 ${faltantes.size} inventory_id(s) precisam procurar a última venda anterior aos 30 dias.`
    );


    // =========================================================
    // LIMITE = 12 MESES
    // =========================================================

    const limiteHistorico =
        new Date(
            dataTo30
        );


    limiteHistorico.setDate(
        limiteHistorico.getDate() -
        365
    );


    // Começar exatamente antes do período de 30 dias.
    let fimJanela =
        new Date(
            dataFrom30
        );


    // =========================================================
    // JANELAS DE ATÉ 60 DIAS
    // =========================================================

    while (
        faltantes.size &&
        fimJanela >
            limiteHistorico
    ) {

        let inicioJanela =
            new Date(
                fimJanela
            );


        inicioJanela.setDate(
            inicioJanela.getDate() -
            60
        );


        if (
            inicioJanela <
            limiteHistorico
        ) {

            inicioJanela =
                new Date(
                    limiteHistorico
                );
        }


        const dataFrom =
            formatarDataApiFull(
                inicioJanela
            );


        const dataTo =
            formatarDataApiFull(
                fimJanela
            );


        console.log(
            `🔎 Procurando última venda FULL entre ${dataFrom} e ${dataTo} para ${faltantes.size} inventory(s)...`
        );


        const faltantesNestaJanela =
            [
                ...faltantes
            ];


        const idsComErroNestaJanela =
            new Set();


        for (
            let i = 0;
            i < faltantesNestaJanela.length;
            i += TAMANHO_LOTE
        ) {

            const lote =
                faltantesNestaJanela.slice(
                    i,
                    i + TAMANHO_LOTE
                );


            try {

                const operacoes =
                    await buscarOperacoesVendaFull(
                        lote,
                        dataFrom,
                        dataTo
                    );


                const encontrados =
                    new Set();


                for (const operacao of operacoes) {

                    const inventoryId =
                        inventoryIdDaOperacaoFull(
                            operacao
                        );


                    if (!inventoryId) {

                        continue;
                    }


                    encontrados.add(
                        inventoryId
                    );


                    // NÃO somar nas vendas 30d.
                    processarOperacaoVendaFull(
                        metricas,
                        operacao,
                        false
                    );
                }


                // Como estamos indo do período mais novo
                // para o mais antigo, a primeira janela onde
                // encontramos uma venda já contém a última venda.
                for (const inventoryId of encontrados) {

                    const metrica =
                        metricas.get(
                            inventoryId
                        );


                    metrica.buscaHistoricaCompleta =
                        true;


                    faltantes.delete(
                        inventoryId
                    );
                }

            } catch (error) {

                console.warn(
                    `⚠️ Falha pesquisando histórico ${dataFrom} → ${dataTo}:`,
                    error
                );


                for (const inventoryId of lote) {

                    idsComErroNestaJanela.add(
                        inventoryId
                    );


                    const metrica =
                        metricas.get(
                            inventoryId
                        );


                    metrica.erroHistorico =
                        true;
                }
            }


            progress(
                `Procurando última venda FULL... ` +
                `${faltantes.size} produto(s) ainda sem venda localizada`
            );
        }


        // Quem teve erro em uma janela não pode ser considerado
        // "sem venda em 12 meses", porque existe um buraco
        // no histórico pesquisado.
        for (
            const inventoryId
            of idsComErroNestaJanela
        ) {

            faltantes.delete(
                inventoryId
            );
        }


        fimJanela =
            inicioJanela;
    }


    // =========================================================
    // OS QUE CHEGARAM ATÉ 12 MESES SEM NENHUMA VENDA
    // =========================================================

    for (const inventoryId of faltantes) {

        const metrica =
            metricas.get(
                inventoryId
            );


        if (
            !metrica.erroHistorico
        ) {

            metrica.buscaHistoricaCompleta =
                true;
        }
    }


    // =========================================================
    // APLICAR RESULTADOS ÀS LINHAS
    // =========================================================

    const agoraISO =
        new Date()
            .toISOString();


    let atualizados =
        0;


    for (const row of rows) {

        if (!row.inventoryId) {

            continue;
        }


        const inventoryId =
            String(
                row.inventoryId
            );


        const metrica =
            metricas.get(
                inventoryId
            );


        if (!metrica) {

            continue;
        }


        // =====================================================
        // VENDA 30D
        // =====================================================

        if (
            metrica.consulta30dOk
        ) {

            row.vendasFull30d =
                metrica.vendas30d;
        }


        // =====================================================
        // ÚLTIMA VENDA
        // =====================================================

        if (
            metrica.ultimaVenda
        ) {

            row.ultimaVendaFull =
                metrica.ultimaVenda;


            row.diasSemVender =
                calcularDiasSemVendaFull(
                    metrica.ultimaVenda
                );


            row.vendasFullAtualizadoEm =
                agoraISO;


            atualizados++;
        }

        // =====================================================
        // CONSULTAMOS 12 MESES COMPLETOS E NÃO ACHAMOS VENDA
        // =====================================================

        else if (
            metrica.consulta30dOk &&
            metrica.buscaHistoricaCompleta &&
            !metrica.erroHistorico
        ) {

            row.ultimaVendaFull =
                null;


            row.diasSemVender =
                null;


            // Esse campo será usado pela renderização para saber
            // que "null" significa 12+ meses e não "não consultado".
            row.vendasFullAtualizadoEm =
                agoraISO;


            atualizados++;
        }


        // Se houve erro no histórico, NÃO destruímos
        // informações antigas.
    }


    // =========================================================
    // SALVAR NO BANCO
    // =========================================================

    try {

        await salvarAnunciosBanco(
            rows,
            false
        );

    } catch (error) {

        console.warn(
            '⚠️ Não foi possível salvar métricas de vendas FULL:',
            error
        );
    }


    console.log(
        '✅ Análise de vendas FULL concluída.',
        {
            inventories:
                inventories.length,

            registrosAtualizados:
                atualizados,

            comVenda30d:
                [...metricas.values()]
                    .filter(
                        metrica =>
                            metrica.vendas30d > 0
                    )
                    .length
        }
    );
}

// ============================================================
// NORMALIZAR TEXTO
// ============================================================

function gaNormalizarTexto(
    valor
) {

    return String(
        valor || ''
    )
        .normalize('NFD')
        .replace(
            /[\u0300-\u036f]/g,
            ''
        )
        .trim()
        .toLowerCase();
}


// ============================================================
// DESCOBRIR SE É CLÁSSICO
// ============================================================

function gaEhClassico(
    row
) {

    const id =
        gaNormalizarTexto(
            row?.listingTypeId
        );


    const nome =
        gaNormalizarTexto(
            row?.listingTypeName
        );


    return (
        id === 'gold_special' ||
        nome.includes('classico')
    );
}


// ============================================================
// DESCOBRIR SE É PREMIUM
// ============================================================

function gaEhPremium(
    row
) {

    const id =
        gaNormalizarTexto(
            row?.listingTypeId
        );


    const nome =
        gaNormalizarTexto(
            row?.listingTypeName
        );


    return (
        id === 'gold_pro' ||
        id === 'gold_premium' ||
        nome.includes('premium')
    );
}


// ============================================================
// MAIS DE 30 DIAS SEM VENDER?
// ============================================================

function gaMaisDe30DiasSemVender(
    row
) {

    const dias =
        Number(
            row?.diasSemVender
        );


    // Temos uma última venda conhecida
    if (
        Number.isFinite(dias)
    ) {

        return (
            dias > 30
        );
    }


    // ========================================================
    // Caso "12+ meses"
    //
    // Se o histórico foi consultado e não encontramos nenhuma
    // venda, vendasFullAtualizadoEm estará preenchido.
    // ========================================================

    if (
        !row?.ultimaVendaFull &&
        row?.vendasFullAtualizadoEm
    ) {

        return true;
    }


    // Ainda não temos dados suficientes
    return false;
}


// ============================================================
// PRECISA CORRIGIR?
// ============================================================

function gaPrecisaCorrigirTipo(
    row
) {

    return (
        gaMaisDe30DiasSemVender(
            row
        ) &&
        gaEhClassico(
            row
        )
    );
}


// ============================================================
// NOME DO TIPO PELO ID
// ============================================================

function gaNomeTipoPorId(
    listingTypeId
) {

    const id =
        String(
            listingTypeId || ''
        );


    const nomeCache =
        GA.listingTypeNames?.get(
            id
        );


    if (
        nomeCache
    ) {

        return nomeCache;
    }


    const fallback = {

        gold_pro:
            'Premium',

        gold_premium:
            'Premium',

        gold_special:
            'Clássico',

        gold:
            'Ouro',

        silver:
            'Prata',

        free:
            'Grátis'
    };


    return (
        fallback[id] ||
        id ||
        '-'
    );
}


// ============================================================
// LINK DIRETO PARA MODIFICAR O ANÚNCIO
// ============================================================

function gaUrlModificarAnuncio(
    itemId
) {

    const mlb =
        String(
            itemId || ''
        ).trim();


    const callback =
        `https://www.mercadolivre.com.br/anuncios/lista?search=${encodeURIComponent(mlb)}`;


    return (
        `https://www.mercadolivre.com.br/anuncios/` +
        `${encodeURIComponent(mlb)}` +
        `/modificar/bomni` +
        `?callback_url=${encodeURIComponent(callback)}`
    );
}


// ============================================================
// HTML DA COLUNA "TIPO"
// ============================================================

function gaRenderTipo(
    row
) {

    const precisaCorrigir =
        gaPrecisaCorrigirTipo(
            row
        );


    // ========================================================
    // NORMAL
    // ========================================================

    if (
        !precisaCorrigir
    ) {

        return `

            <td>

                <strong>
                    ${esc(
                        row.listingTypeName ||
                        '-'
                    )}
                </strong>

            </td>
        `;
    }


    // ========================================================
    // PRECISA ALTERAR CLÁSSICO -> PREMIUM
    // ========================================================

    const url =
        gaUrlModificarAnuncio(
            row.itemId
        );


    return `

        <td class="ga-tipo-precisa-corrigir">

            <strong
                style="
                    color:#dc3545;
                "
            >
                ${esc(
                    row.listingTypeName ||
                    'Clássico'
                )}
            </strong>


            <div class="ga-alerta-tipo">

                <i class="fas fa-exclamation-triangle"></i>

                Mudar para Premium

            </div>


            <div class="ga-acoes-correcao-tipo">

                <a
                    href="${esc(url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="ga-link-corrigir"
                >

                    <i class="fas fa-edit"></i>

                    Modificar anúncio

                </a>


                <button
                    type="button"
                    class="ga-btn-corrigido"
                    onclick="verificarCorrecaoTipoAnuncio(
                        '${esc(row.itemId)}',
                        this
                    )"
                >

                    <i class="fas fa-check"></i>

                    Corrigido

                </button>

            </div>

        </td>
    `;
}

function render() {

    const body =
        document.getElementById(
            'gaTabelaBody'
        );


    if (!body) {

        console.warn(
            '⚠️ #gaTabelaBody não encontrado.'
        );

        return;
    }


    // =========================================================
    // PAGINAÇÃO
    // =========================================================

    const totalRegistros =
        GA.filtered.length;


    const totalPaginas =
        Math.max(
            1,
            Math.ceil(
                totalRegistros /
                GA.pageSize
            )
        );


    GA.page =
        Math.max(
            1,
            Math.min(
                GA.page,
                totalPaginas
            )
        );


    const inicio =
        (
            GA.page -
            1
        ) *
        GA.pageSize;


    const fim =
        Math.min(
            inicio +
            GA.pageSize,
            totalRegistros
        );


    const rows =
        GA.filtered.slice(
            inicio,
            fim
        );


    // =========================================================
    // SEM RESULTADOS
    // =========================================================

    if (!rows.length) {

        body.innerHTML = `

            <tr>

                <td
                    colspan="12"
                    class="text-center py-5"
                >

                    <i
                        class="fas fa-box-open fa-3x mb-3"
                        style="
                            color:#6c757d;
                            opacity:0.3;
                        "
                    ></i>

                    <h4 style="color:#6c757d;">
                        Nenhum anúncio encontrado
                    </h4>

                </td>

            </tr>
        `;

    } else {

        body.innerHTML =
            rows.map(
                row => {

                    // =================================================
                    // PREÇO
                    // =================================================

                    const preco =
                        Number.isFinite(
                            Number(
                                row.price
                            )
                        )
                            ? Number(
                                row.price
                            )
                                .toLocaleString(
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
                    // DEPÓSITO
                    // =================================================

                    const estoqueDeposito =
                        row.warehouse !== null &&
                        row.warehouse !== undefined

                            ? Number(
                                row.warehouse
                            )

                            : null;


                    // =================================================
                    // FULL
                    // =================================================

                    const estoqueFull =
                        row.full !== null &&
                        row.full !== undefined

                            ? Number(
                                row.full
                            )

                            : null;


                    // =================================================
                    // VENDAS FULL 30 DIAS
                    // =================================================

                    const vendas30d =
                        row.vendasFull30d !== null &&
                        row.vendasFull30d !== undefined

                            ? Number(
                                row.vendasFull30d
                            )

                            : null;


                    // =================================================
                    // DIAS SEM VENDER
                    // =================================================

                    const diasSemVender =
                        row.diasSemVender !== null &&
                        row.diasSemVender !== undefined

                            ? Number(
                                row.diasSemVender
                            )

                            : null;


                    // =================================================
                    // HTML VENDAS 30 DIAS
                    // =================================================

                    let vendas30dHtml = `

                        <span
                            style="
                                color:#adb5bd;
                                font-size:16px;
                            "
                        >
                            —
                        </span>
                    `;


                    if (
                        vendas30d !== null
                    ) {

                        vendas30dHtml = `

                            <strong
                                style="
                                    font-size:17px;
                                    color:${
                                        vendas30d > 0
                                            ? '#198754'
                                            : '#dc3545'
                                    };
                                "
                            >
                                ${esc(vendas30d)}
                            </strong>

                            <div
                                style="
                                    font-size:10px;
                                    color:#6c757d;
                                    margin-top:2px;
                                "
                            >
                                ${
                                    vendas30d === 1
                                        ? 'unidade'
                                        : 'unidades'
                                }
                            </div>
                        `;
                    }


                    // =================================================
                    // HTML SEM VENDER
                    // =================================================

                    let semVenderHtml = `

                        <span
                            style="
                                color:#adb5bd;
                                font-size:16px;
                            "
                        >
                            —
                        </span>
                    `;


                    if (
                        row.ultimaVendaFull
                    ) {

                        let dias =
                            diasSemVender;


                        if (
                            dias === null &&
                            typeof calcularDiasSemVendaFull ===
                                'function'
                        ) {

                            dias =
                                calcularDiasSemVendaFull(
                                    row.ultimaVendaFull
                                );
                        }


                        const ultimaVenda =
                            new Date(
                                row.ultimaVendaFull
                            );


                        const dataFormatada =
                            Number.isNaN(
                                ultimaVenda.getTime()
                            )
                                ? ''
                                : ultimaVenda
                                    .toLocaleDateString(
                                        'pt-BR'
                                    );


                        let textoDias =
                            '';


                        if (
                            dias === 0
                        ) {

                            textoDias =
                                'Hoje';

                        } else if (
                            dias === 1
                        ) {

                            textoDias =
                                '1 dia';

                        } else if (
                            dias !== null
                        ) {

                            textoDias =
                                `${dias} dias`;

                        } else {

                            textoDias =
                                '-';
                        }


                        // Cor de acordo com tempo parado
                        let cor =
                            '#198754';


                        if (
                            dias !== null
                        ) {

                            if (
                                dias >= 60
                            ) {

                                cor =
                                    '#dc3545';

                            } else if (
                                dias >= 30
                            ) {

                                cor =
                                    '#fd7e14';

                            } else if (
                                dias >= 15
                            ) {

                                cor =
                                    '#d39e00';
                            }
                        }


                        semVenderHtml = `

                            <strong
                                style="
                                    color:${cor};
                                    font-size:14px;
                                    white-space:nowrap;
                                "
                            >
                                ${esc(textoDias)}
                            </strong>


                            ${
                                dataFormatada

                                    ? `
                                        <div
                                            style="
                                                color:#6c757d;
                                                font-size:10px;
                                                margin-top:2px;
                                                white-space:nowrap;
                                            "
                                        >
                                            ${esc(dataFormatada)}
                                        </div>
                                    `

                                    : ''
                            }
                        `;

                    } else if (
                        row.vendasFullAtualizadoEm
                    ) {

                        // Já pesquisamos o histórico e não
                        // localizamos venda em até 12 meses.

                        semVenderHtml = `

                            <strong
                                style="
                                    color:#dc3545;
                                    font-size:13px;
                                    white-space:nowrap;
                                "
                            >
                                12+ meses
                            </strong>

                            <div
                                style="
                                    color:#6c757d;
                                    font-size:10px;
                                    margin-top:2px;
                                    white-space:nowrap;
                                "
                            >
                                Sem venda
                            </div>
                        `;
                    }


                    // =================================================
                    // STATUS
                    // =================================================

                    let statusClassName =
                        'badge-secondary';


                    if (
                        row.status ===
                        'active'
                    ) {

                        statusClassName =
                            'badge-success';

                    } else if (
                        row.status ===
                        'paused'
                    ) {

                        statusClassName =
                            'badge-warning';

                    } else if (
                        row.status ===
                        'closed'
                    ) {

                        statusClassName =
                            'badge-danger';

                    } else if (
                        row.status ===
                        'under_review'
                    ) {

                        statusClassName =
                            'badge-info';
                    }


                    return `

                        <tr>

                            <!-- ===================================== -->
                            <!-- 1. FOTO -->
                            <!-- ===================================== -->

                            <td>

                                ${
                                    row.thumbnail

                                        ? `
                                            <img
                                                src="${esc(
                                                    row.thumbnail
                                                )}"
                                                alt=""
                                                style="
                                                    width:45px;
                                                    height:45px;
                                                    object-fit:contain;
                                                "
                                            >
                                        `

                                        : '-'
                                }

                            </td>


                            <!-- ===================================== -->
                            <!-- 2. MLB -->
                            <!-- ===================================== -->

                            <td>

                                <strong>
                                    ${esc(
                                        row.itemId
                                    )}
                                </strong>


                                ${
                                    row.variationId

                                        ? `
                                            <div
                                                style="
                                                    font-size:11px;
                                                    color:#6c757d;
                                                    margin-top:3px;
                                                "
                                            >
                                                Var:
                                                ${esc(
                                                    row.variationId
                                                )}
                                            </div>
                                        `

                                        : ''
                                }

                            </td>


                            <!-- ===================================== -->
                            <!-- 3. TÍTULO / SKU -->
                            <!-- ===================================== -->

                            <td>

                                <div
                                    style="
                                        font-weight:600;
                                        margin-bottom:4px;
                                    "
                                >
                                    ${esc(
                                        row.title
                                    )}
                                </div>


                                <code
                                    style="
                                        font-size:12px;
                                        background:#f8f9fa;
                                        padding:2px 5px;
                                        border-radius:3px;
                                    "
                                >
                                    ${esc(
                                        row.sku ||
                                        'Sem SKU'
                                    )}
                                </code>

                            </td>


                            <!-- ===================================== -->
                            <!-- 4. DEPÓSITO -->
                            <!-- ===================================== -->

                            <td
                                style="
                                    text-align:center;
                                "
                            >

                                ${
                                    estoqueDeposito !== null

                                        ? `
                                            <strong
                                                style="
                                                    font-size:18px;
                                                    color:${
                                                        estoqueDeposito > 0
                                                            ? '#198754'
                                                            : '#dc3545'
                                                    };
                                                "
                                            >
                                                ${esc(
                                                    estoqueDeposito
                                                )}
                                            </strong>
                                        `

                                        : `
                                            <span
                                                style="
                                                    color:#adb5bd;
                                                    font-size:18px;
                                                "
                                            >
                                                —
                                            </span>
                                        `
                                }

                            </td>


                            <!-- ===================================== -->
                            <!-- 5. FULL -->
                            <!-- ===================================== -->

                            <td
                                style="
                                    text-align:center;
                                "
                            >

                                ${
                                    estoqueFull !== null

                                        ? `
                                            <strong
                                                style="
                                                    font-size:18px;
                                                    color:${
                                                        estoqueFull > 0
                                                            ? '#198754'
                                                            : '#dc3545'
                                                    };
                                                "
                                            >
                                                ${esc(
                                                    estoqueFull
                                                )}
                                            </strong>
                                        `

                                        : `
                                            <span
                                                style="
                                                    color:#adb5bd;
                                                    font-size:18px;
                                                "
                                            >
                                                —
                                            </span>
                                        `
                                }

                            </td>


                            <!-- ===================================== -->
                            <!-- 6. VENDAS FULL 30D -->
                            <!-- ===================================== -->

                            <td
                                style="
                                    text-align:center;
                                "
                            >

                                ${vendas30dHtml}

                            </td>


                            <!-- ===================================== -->
                            <!-- 7. SEM VENDER -->
                            <!-- ===================================== -->

                            <td
                                style="
                                    text-align:center;
                                "
                            >

                                ${semVenderHtml}

                            </td>


                            <!-- 8. TIPO -->

                            ${gaRenderTipo(row)}


                            <!-- ===================================== -->
                            <!-- 9. STATUS -->
                            <!-- ===================================== -->

                            <td>

                                <span
                                    class="badge ${statusClassName}"
                                >

                                    ${esc(
                                        statusLabel(
                                            row.status
                                        )
                                    )}

                                </span>

                            </td>


                            <!-- ===================================== -->
                            <!-- 10. PREÇO -->
                            <!-- ===================================== -->

                            <td
                                style="
                                    text-align:right;
                                    white-space:nowrap;
                                "
                            >

                                <strong>
                                    ${preco}
                                </strong>

                            </td>


                            <!-- ===================================== -->
                            <!-- 11. INVENTORY ID -->
                            <!-- ===================================== -->

                            <td>

                                <code
                                    style="
                                        font-size:11px;
                                        white-space:nowrap;
                                    "
                                >
                                    ${esc(
                                        row.inventoryId ||
                                        '-'
                                    )}
                                </code>


                                ${
                                    row.userProductId

                                        ? `
                                            <div
                                                style="
                                                    font-size:10px;
                                                    color:#6c757d;
                                                    margin-top:3px;
                                                    white-space:nowrap;
                                                "
                                            >
                                                ${esc(
                                                    row.userProductId
                                                )}
                                            </div>
                                        `

                                        : ''
                                }

                            </td>


                            <!-- ===================================== -->
                            <!-- 12. AÇÕES -->
                            <!-- ===================================== -->

                            <td>

                                ${
                                    row.permalink

                                        ? `
                                            <a
                                                href="${esc(
                                                    row.permalink
                                                )}"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                class="btn btn-sm btn-outline-primary"
                                                title="Abrir anúncio"
                                            >
                                                <i class="fas fa-external-link-alt"></i>
                                            </a>
                                        `

                                        : '-'
                                }

                            </td>

                        </tr>
                    `;
                }
            )
                .join('');
    }


    // =========================================================
    // CONTAGEM
    // =========================================================

    const contagem =
        document.getElementById(
            'gaContagemRegistros'
        );


    if (contagem) {

        contagem.textContent =
            `${totalRegistros} registro${
                totalRegistros === 1
                    ? ''
                    : 's'
            }`;
    }


    // =========================================================
    // PAGINAÇÃO
    // =========================================================

    const elInicio =
        document.getElementById(
            'gaInicio'
        );


    const elFim =
        document.getElementById(
            'gaFim'
        );


    const elTotal =
        document.getElementById(
            'gaTotal'
        );


    const paginaInfo =
        document.getElementById(
            'gaPaginaInfo'
        );


    const btnAnterior =
        document.getElementById(
            'gaBtnAnterior'
        );


    const btnProxima =
        document.getElementById(
            'gaBtnProxima'
        );


    if (elInicio) {

        elInicio.textContent =
            totalRegistros
                ? inicio + 1
                : 0;
    }


    if (elFim) {

        elFim.textContent =
            fim;
    }


    if (elTotal) {

        elTotal.textContent =
            totalRegistros;
    }


    if (paginaInfo) {

        paginaInfo.textContent =
            `Página ${GA.page} de ${totalPaginas}`;
    }


    if (btnAnterior) {

        btnAnterior.disabled =
            GA.page <= 1;
    }


    if (btnProxima) {

        btnProxima.disabled =
            GA.page >=
            totalPaginas;
    }
}


    // ============================================================
    // LOAD ALL
    // ============================================================

    async function loadAll(
        force = false
    ) {

        if (
            GA.loading
        ) {

            console.log(
                '⚠️ Já existe uma sincronização em andamento.'
            );


            return;
        }


        ensureUI();


        GA.loading =
            true;


        const refresh =
            document.getElementById(
                'gaRefresh'
            );


        if (refresh) {

            refresh.disabled =
                true;


            refresh.innerHTML = `

                <i class="fas fa-spinner fa-spin"></i>

                Atualizando...
            `;
        }


        let linhasSalvasAntes =

            Array.isArray(
                GA.rows
            )

                ? [
                    ...GA.rows
                ]

                : [];


        try {

            console.log(
                '🔄 Iniciando sincronização do Gerenciamento de Anúncios...'
            );


            // ====================================================
            // TENTAR CARREGAR CACHE ANTIGO
            // ====================================================

            if (
                !linhasSalvasAntes.length
            ) {

                try {

                    const banco =
                        await carregarAnunciosBanco();


                    if (
                        Array.isArray(
                            banco
                        ) &&
                        banco.length
                    ) {

                        linhasSalvasAntes =
                            [
                                ...banco
                            ];
                    }

                } catch (error) {

                    console.warn(
                        '⚠️ Cache do banco indisponível:',
                        error
                    );
                }
            }


            // ====================================================
            // LIMPAR CACHES QUANDO FOR ATUALIZAÇÃO FORÇADA
            // ====================================================

            if (force) {

                GA.token =
                    null;


                GA.sellerId =
                    null;


                GA.userProductStockCache
                    .clear();


                GA.userProductStockPromises
                    .clear();


                GA.inventoryStockCache
                    .clear();


                GA.listingTypeNames
                    .clear();


                GA.exposureNames
                    .clear();


                GA.exposureByListingType
                    .clear();


                GA.stockNextRequestAt =
                    0;
            }


            // ====================================================
            // CONTA
            // ====================================================

            progress(
                'Validando conta Mercado Livre...'
            );


            await getSellerId();


            // ====================================================
            // TODOS ANÚNCIOS
            // ====================================================

            progress(
                'Localizando todos os anúncios da conta...'
            );


            const ids =
                await scanAllIds();


            if (
                !ids.length
            ) {

                throw new Error(
                    'Nenhum anúncio encontrado na conta.'
                );
            }


            // ====================================================
            // DETALHES
            // ====================================================

            progress(
                `Buscando detalhes de ${ids.length} anúncios...`
            );


            const items =
                await getAllItems(
                    ids
                );


            // ====================================================
            // FULL
            // ====================================================

            progress(
                'Identificando anúncios FULL...'
            );


            const novasLinhas =
                buildRows(
                    items
                );


            console.log(

                `🏭 ${

                    new Set(
                        novasLinhas.map(
                            row =>
                                row.itemId
                        )
                    ).size

                } anúncios FULL detectados.`
            );


            console.log(

                `📋 ${novasLinhas.length} linha(s) FULL entre produtos e variações.`
            );


            // ====================================================
            // RECUPERAR SKU FALTANTE
            // ====================================================

            await recuperarSkusFaltantes(
                novasLinhas
            );


            // ====================================================
            // MESCLAR COM CACHE
            // ====================================================

            GA.rows =
                mesclarLinhasComDadosSalvos(

                    novasLinhas,

                    linhasSalvasAntes
                );


            // Mostrar a tabela antes de consultar todo estoque.
            GA.page =
                1;


            updateSummary();

            updateExposureFilter();

            applyFilters(
                false
            );


            // ====================================================
            // EXPOSIÇÃO
            // ====================================================

            progress(
                'Atualizando exposição e tipo dos anúncios...'
            );


            try {

                await loadExposure(
                    GA.rows
                );

            } catch (error) {

                console.warn(
                    '⚠️ Exposição não foi totalmente atualizada:',
                    error
                );
            }


            updateExposureFilter();

            applyFilters(
                false
            );


            // ====================================================
            // SALVAR DADOS BÁSICOS
            // ====================================================

            try {

                progress(
                    'Salvando anúncios no banco...'
                );


                await salvarAnunciosBanco(
                    GA.rows
                );

            } catch (error) {

                console.warn(
                    '⚠️ Falha ao salvar dados básicos no banco:',
                    error
                );
            }


            // ====================================================
            // REMOVER ANTIGOS
            // ====================================================

            try {

                await removerAnunciosObsoletos(
                    GA.rows
                );

            } catch (error) {

                console.warn(
                    '⚠️ Limpeza de registros obsoletos falhou:',
                    error
                );
            }


            // ====================================================
            // ESTOQUE
            // ====================================================

            progress(

                `Atualizando estoque de ` +

                `${GA.rows.length} ` +

                `linha(s) FULL...`
            );


            try {

                await loadFullStocks(
                    GA.rows
                );

                // ====================================================
                // VENDAS FULL
                // ====================================================

                progress(
                    'Analisando vendas e giro do estoque FULL...'
                );


                try {

                    await atualizarMetricasVendasFull(
                        GA.rows
                    );

                } catch (error) {

                    console.error(
                        '⚠️ Análise de vendas FULL incompleta:',
                        error
                    );
                }



            } catch (error) {

                console.error(
                    '⚠️ Atualização de estoque incompleta:',
                    error
                );


                window.showToast?.(

                    'Alguns estoques não foram atualizados. ' +

                    'O último valor salvo foi mantido.',

                    'warning'
                );
            }


            // ====================================================
            // SALVAR ESTADO FINAL
            // ====================================================

            try {

                progress(
                    'Salvando estado final...'
                );


                await salvarAnunciosBanco(
                    GA.rows
                );

            } catch (error) {

                console.warn(
                    '⚠️ Falha ao salvar estado final:',
                    error
                );
            }


            updateSummary();

            updateExposureFilter();

            applyFilters(
                false
            );


            // ====================================================
            // ESTATÍSTICAS
            // ====================================================

            const semSku =
                GA.rows.filter(
                    row =>
                        !String(
                            row.sku ||
                            ''
                        ).trim()
                );


            console.log(
                '✅ Sincronização finalizada.',
                {

                    anunciosFull:

                        new Set(
                            GA.rows.map(
                                row =>
                                    row.itemId
                            )
                        ).size,

                    linhas:
                        GA.rows.length,

                    comSku:

                        GA.rows.length -
                        semSku.length,

                    semSku:
                        semSku.length,

                    comUserProduct:

                        GA.rows.filter(
                            row =>
                                !!row.userProductId
                        ).length,

                    estoquePreenchido:

                        GA.rows.filter(
                            row =>

                                row.full !==
                                    null ||

                                row.warehouse !==
                                    null ||

                                row.mlTotal !==
                                    null
                        ).length
                }
            );


            window.showToast?.(

                `${
                    new Set(
                        GA.rows.map(
                            row =>
                                row.itemId
                        )
                    ).size
                } anúncios FULL sincronizados`,

                'success'
            );

        } catch (error) {

            console.error(
                '❌ Gerenciamento de Anúncios:',
                error
            );


            // ====================================================
            // PRESERVAR DADOS ANTIGOS
            // ====================================================

            if (
                linhasSalvasAntes.length
            ) {

                GA.rows =
                    linhasSalvasAntes;


                updateSummary();

                updateExposureFilter();

                applyFilters(
                    false
                );


                window.showToast?.(

                    'A atualização falhou. ' +

                    'Os últimos dados salvos continuam visíveis.',

                    'warning'
                );

            } else {

                const body =
                    document.getElementById(
                        'gaBody'
                    );


                if (body) {

                    body.innerHTML = `

                        <tr>

                            <td
                                colspan="11"
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


                window.showToast?.(

                    `Erro: ${

                        error?.message ||

                        'Falha ao carregar anúncios'

                    }`,

                    'error'
                );
            }

        } finally {

            GA.loading =
                false;


            progress(
                ''
            );


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


function exportarCSV() {

    // =========================================================
    // SEMPRE EXPORTAR O RESULTADO ATUAL DOS FILTROS
    //
    // GA.filtered contém:
    //
    // - todos os registros quando não existe filtro
    // - somente os filtrados quando há filtro
    // =========================================================

    const rows =
        Array.isArray(
            GA.filtered
        )
            ? GA.filtered
            : [];


    if (
        !rows.length
    ) {

        window.showToast?.(
            'Nenhum registro no filtro atual para exportar.',
            'warning'
        );


        return;
    }


    // =========================================================
    // COLUNAS
    // =========================================================

    const colunas = [

        'MLB',

        'Variação',

        'Título',

        'SKU',

        'Depósito',

        'FULL',

        'Vendas FULL 30d',

        'Dias sem vender',

        'Última venda FULL',

        'Tipo',

        'Status',

        'Preço',

        'Inventory ID',

        'User Product',

        'Precisa corrigir'
    ];


    // =========================================================
    // ESCAPE CSV
    // =========================================================

    function csv(
        value
    ) {

        const texto =
            String(
                value ??
                ''
            );


        return (
            '"' +
            texto.replaceAll(
                '"',
                '""'
            ) +
            '"'
        );
    }


    // =========================================================
    // GERAR LINHAS
    // =========================================================

    const linhas = [

        colunas
            .map(csv)
            .join(';'),


        ...rows.map(
            row => {

                // =================================================
                // ÚLTIMA VENDA
                // =================================================

                let ultimaVenda =
                    '';


                if (
                    row.ultimaVendaFull
                ) {

                    const data =
                        new Date(
                            row.ultimaVendaFull
                        );


                    if (
                        !Number.isNaN(
                            data.getTime()
                        )
                    ) {

                        ultimaVenda =
                            data.toLocaleDateString(
                                'pt-BR'
                            );
                    }
                }


                // =================================================
                // DIAS SEM VENDER
                // =================================================

                let diasSemVender =
                    '';


                if (
                    row.diasSemVender !== null &&
                    row.diasSemVender !== undefined
                ) {

                    diasSemVender =
                        Number(
                            row.diasSemVender
                        );

                } else if (
                    !row.ultimaVendaFull &&
                    row.vendasFullAtualizadoEm
                ) {

                    diasSemVender =
                        '12+ meses';
                }


                // =================================================
                // PRECISA CORRIGIR
                // =================================================

                const precisaCorrigir =
                    gaPrecisaCorrigirTipo(
                        row
                    )
                        ? 'SIM'
                        : 'NÃO';


                return [

                    row.itemId,

                    row.variationId ||
                    '',

                    row.title,

                    row.sku,

                    row.warehouse ??
                    '',

                    row.full ??
                    '',

                    row.vendasFull30d ??
                    '',

                    diasSemVender,

                    ultimaVenda,

                    row.listingTypeName ||
                    '',

                    statusLabel(
                        row.status
                    ),

                    row.price ??
                    '',

                    row.inventoryId ||
                    '',

                    row.userProductId ||
                    '',

                    precisaCorrigir

                ]
                    .map(csv)
                    .join(';');
            }
        )
    ];


    // =========================================================
    // IDENTIFICAR SE EXISTE FILTRO
    // =========================================================

    const filtro30 =
        document.getElementById(
            'gaFiltroCorrecao'
        )?.value;


    const busca =
        document.getElementById(
            'gaBusca'
        )?.value;


    const status =
        document.getElementById(
            'gaFiltroStatus'
        )?.value;


    let sufixo =
        'todos';


    if (
        filtro30 ===
        '30plus'
    ) {

        sufixo =
            'corrigir_30_dias';

    } else if (
        busca ||
        status
    ) {

        sufixo =
            'filtrado';
    }


    // =========================================================
    // CRIAR ARQUIVO
    // =========================================================

    const blob =
        new Blob(
            [
                '\uFEFF' +
                linhas.join('\n')
            ],
            {
                type:
                    'text/csv;charset=utf-8;'
            }
        );


    const url =
        URL.createObjectURL(
            blob
        );


    const a =
        document.createElement(
            'a'
        );


    const hoje =
        new Date()
            .toISOString()
            .slice(
                0,
                10
            );


    a.href =
        url;


    a.download =
        `gerenciamento_anuncios_${sufixo}_${hoje}.csv`;


    document.body.appendChild(
        a
    );


    a.click();


    a.remove();


    URL.revokeObjectURL(
        url
    );


    window.showToast?.(
        `${rows.length} registro(s) exportado(s).`,
        'success'
    );
}


   window.abrirSistemaGerenciamentoAnuncios =
    function () {

        console.log(
            '📋 Abrindo Gerenciamento de Anúncios...'
        );


        // =========================================================
        // ESCONDER OUTRAS ABAS
        // =========================================================

        const sistemas = [

            'menuSystem',

            'mainSystem',

            'salesSystem',

            'precificacaoSystem',

            'reembolsosSystem',

            'caixaSystem',

            'perguntasSystem',

            'promocoesSystem',

            'reviewsSystem',

            'folgasSystem',

            'shippingSystem',

            'entradasSystem',

            'feedbackSystem',

            'estoqueSystem',

            'estoqueGestaoSystem',

            'fullSystem',

            'gerenciamentoAnunciosSystem'
        ];


        sistemas.forEach(
            id => {

                const el =
                    document.getElementById(
                        id
                    );


                if (el) {

                    el.classList.add(
                        'hidden'
                    );
                }
            }
        );


        // =========================================================
        // MOSTRAR GERENCIAMENTO
        // =========================================================

        const tela =
            document.getElementById(
                'gerenciamentoAnunciosSystem'
            );


        if (!tela) {

            console.error(
                '❌ #gerenciamentoAnunciosSystem não encontrado no index.html'
            );


            window.showToast?.(
                'Tela de Gerenciamento de Anúncios não encontrada.',
                'error'
            );


            return;
        }


        tela.classList.remove(
            'hidden'
        );


        tela.style.display =
            'block';


        // =========================================================
        // HEADER DO USUÁRIO
        // =========================================================

        let usuario =
            null;


        try {

            if (
                typeof currentUser !==
                'undefined'
            ) {

                usuario =
                    currentUser;
            }

        } catch (error) {

        }


        usuario =
            usuario ||
            window.currentUser ||
            null;


        const nome =
            document.getElementById(
                'gaUserName'
            );


        const avatar =
            document.getElementById(
                'gaUserAvatar'
            );


        const role =
            document.getElementById(
                'gaUserRole'
            );


        if (nome) {

            nome.textContent =

                usuario?.name ||

                usuario?.nome ||

                usuario?.username ||

                'Usuário';
        }


        if (avatar) {

            avatar.textContent =

                usuario?.avatar ||

                String(
                    usuario?.name ||
                    usuario?.nome ||
                    'U'
                )
                    .trim()
                    .charAt(0)
                    .toUpperCase() ||

                'U';
        }


        if (role) {

            role.textContent =

                usuario?.role ||

                usuario?.cargo ||

                '';
        }


        // =========================================================
        // SE JÁ ESTÁ EM MEMÓRIA
        // =========================================================

        if (
            Array.isArray(
                GA.rows
            ) &&
            GA.rows.length
        ) {

            updateSummary();

            updateExposureFilter();

            applyFilters(
                false
            );


            return;
        }


        // =========================================================
        // CARREGAR BANCO
        // =========================================================

        progress(
            'Carregando anúncios salvos...'
        );


        (async () => {

            try {

                const dados =
                    await carregarAnunciosBanco();


                if (
                    Array.isArray(
                        dados
                    ) &&
                    dados.length
                ) {

                    progress('');


                    console.log(
                        `✅ ${dados.length} registros carregados do Supabase.`
                    );


                    return;
                }


                console.log(
                    'ℹ️ Banco vazio. Iniciando primeira sincronização.'
                );


                await loadAll(
                    false
                );


            } catch (error) {

                console.warn(
                    '⚠️ Não foi possível carregar o banco:',
                    error
                );


                try {

                    await loadAll(
                        false
                    );

                } catch (erroML) {

                    console.error(
                        '❌ Falha ao carregar anúncios:',
                        erroML
                    );
                }
            }

        })();
    };

    window.limparFiltrosGerenciamentoAnuncios =
    function () {

        const busca =
            document.getElementById(
                'gaBusca'
            );


        const status =
            document.getElementById(
                'gaFiltroStatus'
            );


        const correcao =
            document.getElementById(
                'gaFiltroCorrecao'
            );


        const ordenacao =
            document.getElementById(
                'gaFiltroOrdenacao'
            );


        if (busca) {

            busca.value =
                '';
        }


        if (status) {

            status.value =
                '';
        }


        if (correcao) {

            correcao.value =
                '';
        }


        if (ordenacao) {

            ordenacao.value =
                'title';
        }


        GA.page =
            1;


        applyFilters(
            false
        );
    };

    window.paginarGerenciamentoAnuncios =
    function (direcao) {

        const totalPaginas =
            Math.max(
                1,
                Math.ceil(
                    GA.filtered.length /
                    GA.pageSize
                )
            );


        if (
            direcao ===
            'anterior'
        ) {

            GA.page =
                Math.max(
                    1,
                    GA.page - 1
                );

        } else if (
            direcao ===
            'proxima'
        ) {

            GA.page =
                Math.min(
                    totalPaginas,
                    GA.page + 1
                );
        }


        render();
    };

    window.mudarItensPorPaginaGerenciamento =
    function () {

        const select =
            document.getElementById(
                'gaItensPorPagina'
            );


        GA.pageSize =
            parseInt(
                select?.value,
                10
            ) ||
            20;


        GA.page =
            1;


        render();
    };

    window.exportarGerenciamentoAnunciosExcel =
    function () {

        exportarCSV();
    };


    // ============================================================
    // FECHAR ABA
    // ============================================================

    window.fecharSistemaGerenciamentoAnuncios =
        function () {

            const tela =
                document.getElementById(
                    'gerenciamentoAnunciosScreen'
                );


            if (tela) {

                tela.style.display =
                    'none';
            }
        };


    // ============================================================
    // ATUALIZAR
    // ============================================================

    window.carregarGerenciamentoAnuncios =
        function (
            force = true
        ) {

            return loadAll(
                !!force
            );
        };


    // ============================================================
    // FILTRAR
    // ============================================================

    window.filtrarGerenciamentoAnuncios =
        function () {

            applyFilters(
                true
            );
        };


    // ============================================================
    // PAGINAÇÃO
    // ============================================================

    window.mudarPaginaGerenciamentoAnuncios =
        function (
            delta
        ) {

            const totalPages =
                Math.max(

                    1,

                    Math.ceil(

                        GA.filtered.length /

                        GA.pageSize
                    )
                );


            GA.page =
                Math.max(

                    1,

                    Math.min(

                        totalPages,

                        GA.page +
                        Number(
                            delta ||
                            0
                        )
                    )
                );


            render();
        };


    // ============================================================
    // ITENS POR PÁGINA
    // ============================================================

    window.alterarTamanhoPaginaGerenciamentoAnuncios =
        function () {

            const select =
                document.getElementById(
                    'gaPageSize'
                );


            GA.pageSize =
                parseInt(
                    select?.value,
                    10
                ) ||
                50;


            GA.page =
                1;


            render();
        };


    // ============================================================
    // EXPORTAÇÃO
    // ============================================================

    window.exportarGerenciamentoAnuncios =
        function () {

            exportarCSV();
        };


    // ============================================================
    // EXPOR ESTADO PARA DIAGNÓSTICO
    // ============================================================

    window.GerenciamentoAnuncios =
        GA;


    console.log(
        '✅ gerenciamento_anuncios.js carregado'
    );

    window.verificarCorrecaoTipoAnuncio =
    async function (
        itemId,
        botao = null
    ) {

        const mlb =
            String(
                itemId || ''
            ).trim();


        if (!mlb) {

            return;
        }


        console.log(
            `🔎 Verificando correção do anúncio ${mlb}...`
        );


        // =====================================================
        // BOTÃO CARREGANDO
        // =====================================================

        const htmlOriginal =
            botao?.innerHTML ||
            'Corrigido';


        if (botao) {

            botao.disabled =
                true;


            botao.innerHTML = `

                <i class="fas fa-spinner fa-spin"></i>

                Verificando...
            `;
        }


        try {

            // =================================================
            // 1. BUSCAR SOMENTE ESTE MLB
            // =================================================

            const item =
                await ml(
                    `/items/${encodeURIComponent(mlb)}` +
                    `?include_attributes=all`
                );


            if (
                !item ||
                !item.id
            ) {

                throw new Error(
                    'Mercado Livre não retornou o anúncio.'
                );
            }


            console.log(
                `📦 Anúncio ${mlb} atualizado:`,
                item
            );


            // =================================================
            // 2. TIPO ATUAL
            // =================================================

            const novoListingTypeId =
                item.listing_type_id ||
                '';


            const novoListingTypeName =
                gaNomeTipoPorId(
                    novoListingTypeId
                );


            console.log(
                `🏷️ ${mlb}: ${novoListingTypeId} -> ${novoListingTypeName}`
            );


            // =================================================
            // 3. LOCALIZAR TODAS AS LINHAS DESTE MLB
            //
            // Um MLB pode possuir várias variações.
            // =================================================

            const linhasMlb =
                GA.rows.filter(
                    row =>
                        String(
                            row.itemId
                        ) ===
                        mlb
                );


            if (
                !linhasMlb.length
            ) {

                throw new Error(
                    'Anúncio não encontrado na tabela.'
                );
            }


            // =================================================
            // 4. ATUALIZAR DADOS BÁSICOS
            // =================================================

            for (
                const row
                of linhasMlb
            ) {

                row.listingTypeId =
                    novoListingTypeId;


                row.listingTypeName =
                    novoListingTypeName;


                row.status =
                    item.status ||
                    row.status;


                row.title =
                    item.title ||
                    row.title;


                row.thumbnail =
                    item.thumbnail ||
                    row.thumbnail;


                row.permalink =
                    item.permalink ||
                    row.permalink;


                if (
                    item.price !==
                    null &&
                    item.price !==
                    undefined
                ) {

                    row.price =
                        Number(
                            item.price
                        );
                }


                // =================================================
                // ATUALIZAR DADOS DA VARIAÇÃO
                // =================================================

                if (
                    row.variationId &&
                    Array.isArray(
                        item.variations
                    )
                ) {

                    const variation =
                        item.variations.find(
                            variation =>
                                String(
                                    variation.id
                                ) ===
                                String(
                                    row.variationId
                                )
                        );


                    if (variation) {

                        const novoSku =
                            extractSku(
                                item,
                                variation
                            );


                        if (
                            novoSku
                        ) {

                            row.sku =
                                novoSku;
                        }


                        row.userProductId =

                            variation.user_product_id ||

                            row.userProductId ||

                            item.user_product_id ||

                            null;


                        row.inventoryId =

                            variation.inventory_id ||

                            row.inventoryId ||

                            item.inventory_id ||

                            null;


                        if (
                            variation.price !==
                            null &&
                            variation.price !==
                            undefined
                        ) {

                            row.price =
                                Number(
                                    variation.price
                                );
                        }
                    }

                } else {

                    const novoSku =
                        extractSku(
                            item
                        );


                    if (
                        novoSku
                    ) {

                        row.sku =
                            novoSku;
                    }


                    row.userProductId =

                        item.user_product_id ||

                        row.userProductId ||

                        null;


                    row.inventoryId =

                        item.inventory_id ||

                        row.inventoryId ||

                        null;
                }
            }


            // =================================================
            // 5. LIMPAR SOMENTE CACHE DESSE MLB
            // =================================================

            for (
                const row
                of linhasMlb
            ) {

                if (
                    row.userProductId &&
                    GA.userProductStockCache
                ) {

                    GA.userProductStockCache.delete(
                        row.userProductId
                    );
                }


                if (
                    row.inventoryId &&
                    GA.inventoryStockCache
                ) {

                    GA.inventoryStockCache.delete(
                        row.inventoryId
                    );
                }
            }


            // =================================================
            // 6. ATUALIZAR ESTOQUE SOMENTE DESTE MLB
            // =================================================

            try {

                await loadFullStocks(
                    linhasMlb
                );

            } catch (errorEstoque) {

                console.warn(
                    `⚠️ Não foi possível atualizar estoque de ${mlb}:`,
                    errorEstoque
                );
            }


            // =================================================
            // IMPORTANTE:
            //
            // NÃO fazemos novamente a consulta de vendas dos
            // últimos 12 meses.
            //
            // Queremos que o botão "Corrigido" seja rápido.
            //
            // diasSemVender e vendasFull30d continuam com os
            // valores já salvos.
            // =================================================


            // =================================================
            // 7. SALVAR SOMENTE ESTE MLB
            // =================================================

            try {

                await salvarAnunciosBanco(
                    linhasMlb,
                    false
                );

            } catch (errorBanco) {

                console.warn(
                    `⚠️ Não foi possível salvar ${mlb}:`,
                    errorBanco
                );
            }


            // =================================================
            // 8. ATUALIZAR TELA
            // =================================================

            updateSummary();


            applyFilters(
                false
            );


            // =================================================
            // 9. VERIFICAR SE REALMENTE FOI CORRIGIDO
            // =================================================

            const aindaClassico =
                linhasMlb.some(
                    row =>
                        gaPrecisaCorrigirTipo(
                            row
                        )
                );


            if (
                aindaClassico
            ) {

                console.warn(
                    `⚠️ ${mlb} continua Clássico.`
                );


                window.showToast?.(
                    `${mlb} ainda está como Clássico. Altere para Premium e clique novamente em Corrigido.`,
                    'warning'
                );


                return;
            }


            // =================================================
            // CORRIGIDO
            // =================================================

            console.log(
                `✅ ${mlb} confirmado como ${novoListingTypeName}.`
            );


            window.showToast?.(
                `${mlb} atualizado: ${novoListingTypeName}`,
                'success'
            );


        } catch (error) {

            console.error(
                `❌ Erro verificando ${mlb}:`,
                error
            );


            window.showToast?.(
                `Erro ao verificar ${mlb}: ${
                    error?.message ||
                    'Erro desconhecido'
                }`,
                'error'
            );


        } finally {

            if (
                botao &&
                document.body.contains(
                    botao
                )
            ) {

                botao.disabled =
                    false;


                botao.innerHTML =
                    htmlOriginal;
            }
        }
    };

})();