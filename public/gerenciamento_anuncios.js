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

        // Índice pelo SKU INTEIRO (sem truncar pra 8 caracteres) —
        // consultado primeiro, pra evitar que dois produtos
        // diferentes com os mesmos 8 primeiros caracteres colidam
        // no índice truncado (ver warehouseStock).
        productBySkuExato: new Map(),

        productsByMlb: new Map(),

        listingTypeNames: new Map(),

        exposureNames: new Map(),

        exposureByListingType: new Map(),

        userProductStockCache: new Map(),

        userProductStockPromises: new Map(),

        inventoryStockCache: new Map(),

        stockNextRequestAt: 0,

        // Intervalo entre consultas de estoque/vendas FULL. Era fixo em
        // 750ms (≈19 min só de espera pra 1.500 anúncios). Agora é
        // adaptativo: começa no mínimo, dobra a cada 429 do ML e vai
        // voltando aos poucos a cada resposta boa.
        stockRequestIntervalMs: 150,

        stockRequestIntervalMinMs: 120,

        stockRequestIntervalMaxMs: 1500,

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


    // ============================================================
    // COLUNAS PERSONALIZÁVEIS (ocultar / reordenar / redimensionar)
    // Mesmo padrão usado na aba de Emissão de NF-e (nfe_manager.js).
    // ============================================================

    const COLUNAS_GA = [
        { id: 'foto', nome: 'Foto', style: 'width:50px;' },
        { id: 'mlb', nome: 'MLB', style: 'min-width:130px;' },
        { id: 'titulo', nome: 'Título / SKU', style: 'min-width:200px;' },
        { id: 'deposito', nome: 'Depósito', style: 'width:110px; text-align:center;' },
        { id: 'full', nome: 'FULL', style: 'width:110px; text-align:center;' },
        { id: 'ativoFull', nome: 'Ativo no Full', style: 'width:130px; text-align:center;' },
        { id: 'vendas30d', nome: 'Vendas FULL 30d', style: 'width:120px; text-align:center;' },
        { id: 'semVender', nome: 'Sem vender', style: 'width:140px; text-align:center;' },
        { id: 'tipo', nome: 'Tipo', style: 'width:100px;' },
        { id: 'status', nome: 'Status', style: 'width:100px;' },
        { id: 'preco', nome: 'Preço', style: 'width:100px; text-align:right;' },
        { id: 'inventoryId', nome: 'Inventory ID', style: 'min-width:120px;' },
        { id: 'acoes', nome: 'Ações', style: 'width:80px;' }
    ];

    function obterUsuarioPreferenciasColunasGA() {

        if (window.currentUser?.username) {
            return String(window.currentUser.username).trim().toLowerCase();
        }

        try {
            const usuarioSalvo = JSON.parse(localStorage.getItem('wheeltech_user') || 'null');
            if (usuarioSalvo?.username) {
                return String(usuarioSalvo.username).trim().toLowerCase();
            }
        } catch (error) {
            console.warn('⚠️ Não foi possível identificar usuário para preferências GA:', error);
        }

        return 'padrao';
    }

    function obterChavePreferenciasColunasGA() {
        return `wheeltech_ga_colunas_ocultas_${obterUsuarioPreferenciasColunasGA()}`;
    }

    function obterChaveOrdemColunasGA() {
        return `wheeltech_ga_ordem_colunas_${obterUsuarioPreferenciasColunasGA()}`;
    }

    function carregarOrdemColunasGA() {

        const padrao = COLUNAS_GA.map(coluna => coluna.id);

        try {
            const bruto = localStorage.getItem(obterChaveOrdemColunasGA());
            if (!bruto) return padrao;

            const salva = JSON.parse(bruto);
            if (!Array.isArray(salva)) return padrao;

            const validas = salva.filter(id => padrao.includes(id));

            // Novas colunas entram automaticamente no fim.
            padrao.forEach(id => {
                if (!validas.includes(id)) validas.push(id);
            });

            return validas;

        } catch (error) {
            console.warn('⚠️ Erro carregando ordem das colunas GA:', error);
            return padrao;
        }
    }

    function salvarOrdemColunasGA(ordem) {
        try {
            localStorage.setItem(obterChaveOrdemColunasGA(), JSON.stringify(ordem));
        } catch (error) {
            console.error('❌ Erro salvando ordem das colunas GA:', error);
        }
    }

    function moverColunaGA(colunaId, direcao) {

        const ordem = carregarOrdemColunasGA();
        const indice = ordem.indexOf(colunaId);
        if (indice < 0) return;

        const novoIndice = indice + Number(direcao);
        if (novoIndice < 0 || novoIndice >= ordem.length) return;

        [ordem[indice], ordem[novoIndice]] = [ordem[novoIndice], ordem[indice]];

        salvarOrdemColunasGA(ordem);
        reconstruirCabecalhoGA();
        aplicarPreferenciasColunasGA();
    }
    window.moverColunaGA = moverColunaGA;

    function carregarColunasOcultasGA() {
        try {
            const salvo = localStorage.getItem(obterChavePreferenciasColunasGA());
            if (!salvo) return new Set();

            const lista = JSON.parse(salvo);
            if (!Array.isArray(lista)) return new Set();

            const idsValidos = new Set(COLUNAS_GA.map(coluna => coluna.id));
            return new Set(lista.filter(id => idsValidos.has(id)));

        } catch (error) {
            console.warn('⚠️ Erro carregando preferência de colunas GA:', error);
            return new Set();
        }
    }

    function salvarColunasOcultasGA(colunasOcultas) {
        try {
            localStorage.setItem(obterChavePreferenciasColunasGA(), JSON.stringify(Array.from(colunasOcultas)));
        } catch (error) {
            console.error('❌ Erro salvando preferência de colunas GA:', error);
        }
    }

    function reconstruirCabecalhoGA() {

        const tbody = document.getElementById('gaTabelaBody');
        const tabela = tbody?.closest('table');
        const header = tabela?.querySelector('thead tr');
        if (!header) return;

        const ordem = carregarOrdemColunasGA();
        const mapa = new Map(COLUNAS_GA.map(coluna => [coluna.id, coluna]));

        header.innerHTML = ordem.map(id => {
            const coluna = mapa.get(id);
            if (!coluna) return '';
            return `<th data-coluna-ga="${coluna.id}" style="${coluna.style || ''}">${esc(coluna.nome)}</th>`;
        }).join('');
    }

    function renderizarListaColunasGA() {

        const container = document.getElementById('listaColunasGA');
        if (!container) return;

        const ordem = carregarOrdemColunasGA();
        const ocultas = carregarColunasOcultasGA();
        const mapa = new Map(COLUNAS_GA.map(coluna => [coluna.id, coluna]));

        container.innerHTML = ordem.map((id, index) => {
            const coluna = mapa.get(id);
            if (!coluna) return '';
            return `
                <div style="display:flex; align-items:center; gap:6px; padding:5px; border-bottom:1px solid #f1f3f5;">
                    <input type="checkbox" data-coluna-ga="${id}" ${ocultas.has(id) ? '' : 'checked'}
                        onchange="alterarVisibilidadeColunaGA('${id}', this.checked)">
                    <span style="flex:1; font-size:12px;">${index + 1}. ${esc(coluna.nome)}</span>
                    <button type="button" class="btn btn-sm btn-light"
                        onclick="event.stopPropagation(); moverColunaGA('${id}', -1)"
                        ${index === 0 ? 'disabled' : ''} title="Mover para cima">↑</button>
                    <button type="button" class="btn btn-sm btn-light"
                        onclick="event.stopPropagation(); moverColunaGA('${id}', 1)"
                        ${index === ordem.length - 1 ? 'disabled' : ''} title="Mover para baixo">↓</button>
                </div>
            `;
        }).join('');
    }

    function alterarVisibilidadeColunaGA(colunaId, visivel) {
        const ocultas = carregarColunasOcultasGA();
        if (visivel) ocultas.delete(colunaId); else ocultas.add(colunaId);
        salvarColunasOcultasGA(ocultas);
        aplicarPreferenciasColunasGA();
    }
    window.alterarVisibilidadeColunaGA = alterarVisibilidadeColunaGA;

    function mostrarTodasColunasGA() {
        salvarColunasOcultasGA(new Set());
        aplicarPreferenciasColunasGA();
    }
    window.mostrarTodasColunasGA = mostrarTodasColunasGA;

    function ocultarTodasColunasGA() {
        salvarColunasOcultasGA(new Set(COLUNAS_GA.map(coluna => coluna.id)));
        aplicarPreferenciasColunasGA();
    }
    window.ocultarTodasColunasGA = ocultarTodasColunasGA;

    function restaurarColunasPadraoGA() {
        try {
            localStorage.removeItem(obterChavePreferenciasColunasGA());
            localStorage.removeItem(obterChaveOrdemColunasGA());
            reconstruirCabecalhoGA();
            aplicarPreferenciasColunasGA();
            window.showToast?.('✅ Colunas e ordem restauradas para o padrão.', 'success');
        } catch (error) {
            console.error(error);
        }
    }
    window.restaurarColunasPadraoGA = restaurarColunasPadraoGA;

    function alternarPainelColunasGA() {
        const painel = document.getElementById('painelColunasGA');
        if (!painel) return;

        const aberto = painel.style.display === 'block';
        painel.style.display = aberto ? 'none' : 'block';

        if (!aberto) aplicarPreferenciasColunasGA();
    }
    window.alternarPainelColunasGA = alternarPainelColunasGA;

    function aplicarPreferenciasColunasGA() {

        const tbody = document.getElementById('gaTabelaBody');
        if (!tbody) return;

        const tabela = tbody.closest('table');
        if (!tabela) return;

        const ocultas = carregarColunasOcultasGA();
        const ordem = carregarOrdemColunasGA();

        const headerRow = tabela.querySelector('thead tr');
        if (headerRow) {
            const mapaTh = new Map();
            headerRow.querySelectorAll(':scope > th[data-coluna-ga]').forEach(th => {
                mapaTh.set(th.dataset.colunaGa, th);
            });
            ordem.forEach(id => {
                const th = mapaTh.get(id);
                if (!th) return;
                th.style.display = ocultas.has(id) ? 'none' : '';
                headerRow.appendChild(th);
            });
        }

        tbody.querySelectorAll(':scope > tr').forEach(tr => {
            const mapaTd = new Map();
            tr.querySelectorAll(':scope > td[data-coluna-ga]').forEach(td => {
                mapaTd.set(td.dataset.colunaGa, td);
            });
            if (!mapaTd.size) return;
            ordem.forEach(id => {
                const td = mapaTd.get(id);
                if (!td) return;
                td.style.display = ocultas.has(id) ? 'none' : '';
                tr.appendChild(td);
            });
        });

        renderizarListaColunasGA();

        const botao = document.getElementById('btnConfigColunasGA');
        if (botao) {
            const visiveis = COLUNAS_GA.length - ocultas.size;
            botao.innerHTML = `
                <i class="fas fa-columns"></i>
                Colunas
                <span style="background:rgba(255,255,255,.25); padding:2px 6px; border-radius:10px; font-size:10px;">
                    ${visiveis}/${COLUNAS_GA.length}
                </span>
            `;
        }

        if (typeof window.ativarRedimensionamentoColunas === 'function') {
            window.ativarRedimensionamentoColunas('gaTabela');
        }
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


    // Roda fn(item, indice) com no máximo `limite` chamadas ao mesmo
    // tempo. O ritmo das requisições continua sendo controlado pelo
    // limitador global (aguardarSlotEstoque) ou pelo mlComRetry —
    // aqui só se evita esperar a resposta de uma pra mandar a próxima.
    async function executarEmParaleloGA(lista, limite, fn) {

        let proximo = 0;

        const worker = async () => {
            while (proximo < lista.length) {
                const indice = proximo++;
                await fn(lista[indice], indice);
            }
        };

        await Promise.all(
            Array.from(
                { length: Math.max(1, Math.min(limite, lista.length)) },
                worker
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


            const skuExato =
                produto.sku
                    ? String(produto.sku).trim().toUpperCase()
                    : '';

            if (
                skuExato &&
                !GA.productBySkuExato.has(
                    skuExato
                )
            ) {

                GA.productBySkuExato.set(
                    skuExato,
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

    // =========================================================
    // RETORNO DESTA FUNÇÃO:
    //
    // NÃO é o estoque físico bruto.
    //
    // É quantas UNIDADES DO ANÚNCIO conseguimos vender
    // considerando a quantidade informada nos 3 primeiros
    // caracteres de cada SKU.
    //
    // Exemplo:
    //
    // anúncio:
    // 00300807PARTITM5x12ABNT
    //
    // produto:
    // 00807PARTITM5x12ABNT
    //
    // estoque físico = 8
    //
    // 8 / 3 = 2 unidades possíveis do anúncio
    // =========================================================


    if (sku) {

        // =====================================================
        // KIT
        //
        // Exemplo:
        //
        // 002ABC12345.001DEF67890
        //
        // significa:
        //
        // 2 x ABC12345
        // 1 x DEF67890
        // =====================================================

        const partes =
            String(
                sku
            )
                .split('.')
                .map(
                    parte =>
                        String(
                            parte
                        ).trim()
                )
                .filter(Boolean);


        if (
            partes.length
        ) {

            let quantidadePossivel =
                Infinity;


            let algumProdutoNaoEncontrado =
                false;


            for (
                const parte
                of partes
            ) {

                // =============================================
                // PEGAR QUANTIDADE DOS 3 PRIMEIROS DÍGITOS
                // =============================================

                const match =
                    parte.match(
                        /^(\d{3})(.+)$/
                    );


                let quantidadePorVenda =
                    1;


                let skuProduto =
                    parte;


                if (match) {

                    quantidadePorVenda =
                        parseInt(
                            match[1],
                            10
                        );


                    if (
                        !Number.isFinite(
                            quantidadePorVenda
                        ) ||
                        quantidadePorVenda <= 0
                    ) {

                        quantidadePorVenda =
                            1;
                    }


                    skuProduto =
                        match[2];
                }


                // =============================================
                // ENCONTRAR O PRODUTO NO ESTOQUE
                // =============================================

                const skuBusca =
                    skuBase(
                        skuProduto
                    );


                // Tenta o SKU EXATO primeiro — só cai pro índice
                // truncado (8 caracteres) se não achar, porque o
                // truncado pode colidir entre produtos diferentes
                // com prefixo parecido (ex.: peças pequenas tipo
                // "Emenda Corrente" / "Abraçadeira").
                const produto =
                    GA.productBySkuExato.get(
                        String(skuProduto)
                            .trim()
                            .toUpperCase()
                    ) ||
                    GA.productBySku.get(
                        skuBusca
                    );


                if (!produto) {

                    algumProdutoNaoEncontrado =
                        true;


                    console.warn(
                        '⚠️ Produto do anúncio não encontrado no estoque interno:',
                        {
                            itemId:
                                itemId,

                            skuAnuncio:
                                sku,

                            parte:
                                parte,

                            skuProduto:
                                skuProduto,

                            skuBusca:
                                skuBusca
                        }
                    );


                    continue;
                }


                // =============================================
                // ESTOQUE FÍSICO
                // =============================================

                const estoqueFisico =
                    Number(
                        produto.quantidade
                    ) || 0;


                // =============================================
                // QUANTIDADE DE ANÚNCIOS POSSÍVEIS
                //
                // Exemplo:
                //
                // estoque = 8
                // anúncio exige 3
                //
                // floor(8 / 3) = 2
                // =============================================

                const unidadesAnuncioPossiveis =
                    Math.floor(
                        estoqueFisico /
                        quantidadePorVenda
                    );


                quantidadePossivel =
                    Math.min(
                        quantidadePossivel,
                        unidadesAnuncioPossiveis
                    );
            }


            // =================================================
            // SÓ RETORNAR SE ENCONTROU TODOS OS COMPONENTES
            //
            // Se algum componente do SKU do anúncio não foi achado
            // no estoque interno, NÃO cai no fallback por MLB
            // abaixo — isso podia devolver o estoque de um produto
            // totalmente diferente (só porque está associado ao
            // mesmo MLB), fazendo o sistema achar que "tem estoque
            // disponível" quando na verdade o produto certo está
            // zerado ou nem cadastrado. Retorna 0 (indisponível)
            // direto.
            // =================================================

            if (
                algumProdutoNaoEncontrado
            ) {

                return 0;
            }

            if (
                Number.isFinite(
                    quantidadePossivel
                )
            ) {

                return Math.max(
                    0,
                    quantidadePossivel
                );
            }
        }
    }


    // =========================================================
    // FALLBACK POR MLB
    //
    // Só chega aqui quando o SKU do anúncio estava vazio/não deu
    // pra tentar nenhuma parte (não é o caso de "achou algumas
    // partes mas faltou uma" — esse caso já retornou 0 acima).
    // Só usar quando houver exatamente um produto associado.
    // =========================================================

    const produtosMlb =
        GA.productsByMlb.get(
            String(
                itemId || ''
            ).toUpperCase()
        ) || [];


    if (
        produtosMlb.length === 1
    ) {

        return Number(
            produtosMlb[0]
                .quantidade
        ) || 0;
    }


    // Não conseguimos determinar com segurança.
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

                'pictures',

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


        // Lotes de 20 (limite do multiget), 4 lotes ao mesmo tempo.
        // O resultado é montado na ordem original dos lotes.
        const grupos =
            [];

        for (
            let i = 0;
            i < ids.length;
            i += 20
        ) {

            grupos.push(
                ids.slice(
                    i,
                    i + 20
                )
            );
        }


        const porGrupo =
            new Array(
                grupos.length
            );


        let lidos =
            0;


        await executarEmParaleloGA(grupos, 4, async (grupo, indiceGrupo) => {

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


            porGrupo[indiceGrupo] =
                (data || [])
                    .filter(
                        resposta =>
                            resposta?.code ===
                                200 &&
                            resposta?.body
                    )
                    .map(
                        resposta =>
                            resposta.body
                    );


            lidos +=
                grupo.length;


            progress(

                `Lendo anúncios... ` +

                `${lidos}` +

                `/${ids.length}`
            );
        });


        for (
            const itens
            of porGrupo
        ) {

            resultado.push(
                ...(itens || [])
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
    // VERIFICAR "ATIVO NO FULL" DE TODOS OS ANÚNCIOS EM SEGUNDO PLANO
    //
    // Abrir a tela normalmente carrega os anúncios já salvos no
    // Supabase (rápido, mas "ativo_no_full" pode estar desatualizado
    // ou nunca ter sido verificado — fica null/"Verificando..."). Em
    // vez de depender só do clique manual em "Sincronizar" (que
    // recalcula TUDO — preço, estoque, etc., mais lento e pesado),
    // isto busca só o campo de logística (shipping.logistic_type) de
    // cada MLB já carregado, em lotes, e corrige a coluna sozinho.
    //
    // LIMITADOR: isso chama a API do Mercado Livre (não o banco —
    // só grava no banco se algo realmente mudou), mas em lotes de 20,
    // então com muitos anúncios são muitas chamadas. Pra não repetir
    // isso toda vez que QUALQUER pessoa abrir a aba (o status de
    // logística de um anúncio não muda de hora em hora), o horário da
    // última verificação fica salvo em configuracoes_sistema — vale
    // pra todo mundo, não só pra quem rodou. Só verifica de novo
    // depois de passado o intervalo mínimo.
    // ============================================================

    const CHAVE_VERIFICACAO_FULL_GA =
        'ga_ultima_verificacao_full';

    const INTERVALO_VERIFICACAO_FULL_MS =
        6 * 60 * 60 * 1000;

    async function atualizarStatusFullTodosItensGA(
        forcar = false
    ) {

        if (
            !Array.isArray(GA.rows) ||
            !GA.rows.length
        ) {

            return;
        }


        if (!forcar) {

            try {

                const { data } =
                    await window.supabaseClient
                        .from('configuracoes_sistema')
                        .select('valor')
                        .eq('chave', CHAVE_VERIFICACAO_FULL_GA)
                        .maybeSingle();

                const ultimaEm =
                    Number(data?.valor?.em) ||
                    0;

                const passou =
                    Date.now() - ultimaEm;

                if (
                    ultimaEm &&
                    passou < INTERVALO_VERIFICACAO_FULL_MS
                ) {

                    console.log(
                        `⏭️ [GA] Verificação de "ativo no full" pulada — rodou há ` +
                        `${Math.round(passou / 60000)} min (intervalo mínimo: ` +
                        `${INTERVALO_VERIFICACAO_FULL_MS / 60000} min).`
                    );

                    return;
                }

            } catch (error) {

                console.warn(
                    '⚠️ [GA] Não foi possível checar a última verificação de Full (seguindo mesmo assim):',
                    error
                );
            }
        }

        const idsUnicos =
            [
                ...new Set(
                    GA.rows
                        .map(row => row.itemId)
                        .filter(Boolean)
                )
            ];

        if (!idsUnicos.length) {
            return;
        }

        console.log(
            `🔎 [GA] Verificando status "ativo no full" de ${idsUnicos.length} anúncio(s) em segundo plano...`
        );

        const statusPorItem =
            new Map();

        const gruposStatus =
            [];

        for (
            let i = 0;
            i < idsUnicos.length;
            i += 20
        ) {

            gruposStatus.push(
                idsUnicos.slice(i, i + 20)
            );
        }

        await executarEmParaleloGA(gruposStatus, 4, async grupo => {

            try {

                const path =
                    `/items?ids=${grupo.join(',')}` +
                    `&attributes=${encodeURIComponent('id,shipping')}`;

                const data =
                    await mlComRetry(path, 3);

                for (
                    const resposta
                    of data || []
                ) {

                    if (
                        resposta?.code === 200 &&
                        resposta?.body?.id
                    ) {

                        statusPorItem.set(
                            resposta.body.id,
                            isFull(resposta.body)
                        );
                    }
                }

            } catch (error) {

                console.warn(
                    '⚠️ [GA] Erro verificando status Full em lote:',
                    error
                );
            }
        });

        const linhasAlteradas =
            [];

        GA.rows.forEach(row => {

            if (!statusPorItem.has(row.itemId)) {
                return;
            }

            const novoStatus =
                statusPorItem.get(row.itemId);

            if (row.ativoNoFull !== novoStatus) {

                row.ativoNoFull =
                    novoStatus;

                linhasAlteradas.push(row);
            }
        });

        console.log(
            `✅ [GA] Status "ativo no full" verificado. ${linhasAlteradas.length} linha(s) atualizada(s).`
        );

        if (linhasAlteradas.length) {

            if (typeof render === 'function') {
                render();
            }

            try {

                await salvarAnunciosBanco(
                    linhasAlteradas,
                    false
                );

            } catch (error) {

                console.warn(
                    '⚠️ [GA] Erro salvando status "ativo no full":',
                    error
                );
            }
        }


        try {

            await window.supabaseClient
                .from('configuracoes_sistema')
                .upsert(
                    {
                        chave: CHAVE_VERIFICACAO_FULL_GA,
                        valor: { em: Date.now() }
                    },
                    { onConflict: 'chave' }
                );

        } catch (error) {

            console.warn(
                '⚠️ [GA] Não foi possível salvar o horário da verificação de Full:',
                error
            );
        }
    }

    window.atualizarStatusFullTodosItensGA =
        atualizarStatusFullTodosItensGA;


    // ============================================================
    // VERIFICAR FULL — BOTÃO MANUAL
    //
    // Ignora o limitador de 6h (chama com forcar=true) — pra quando
    // alguém quer conferir na hora se a coluna "Ativo no Full" está
    // batendo com a realidade, sem esperar o próximo ciclo automático.
    // ============================================================

    window.verificarStatusFullManualGA =
        async function () {

            const btn =
                document.getElementById(
                    'gaVerificarFullBtn'
                );

            const htmlOriginal =
                btn?.innerHTML;

            if (btn) {

                btn.disabled =
                    true;

                btn.innerHTML =
                    '<i class="fas fa-spinner fa-spin"></i> Verificando...';
            }

            try {

                await atualizarStatusFullTodosItensGA(
                    true
                );

                if (
                    typeof showToast ===
                    'function'
                ) {

                    showToast(
                        '✅ Status "Ativo no Full" verificado em todos os anúncios.',
                        'success'
                    );
                }

            } catch (error) {

                console.error(
                    '❌ [GA] Erro na verificação manual de Full:',
                    error
                );

                if (
                    typeof showToast ===
                    'function'
                ) {

                    showToast(
                        '❌ Erro ao verificar status Full: ' +
                            error.message,
                        'error'
                    );
                }

            } finally {

                if (btn) {

                    btn.disabled =
                        false;

                    btn.innerHTML =
                        htmlOriginal;
                }
            }
        };


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

                        // buildRows só chega até aqui quando
                        // isFull(item) já deu true (ver mais acima),
                        // então todo item nesta lista está mesmo
                        // ativo no FULL neste momento.
                        ativoNoFull:
                            true,

                        title:
                            item.title ||
                            '-',

                        thumbnail:
                            item.thumbnail ||
                            '',

                        // Id da foto que hoje é a capa do anúncio
                        // (primeira de item.pictures) e ids das fotos
                        // que pertencem a ESTA variação — usados só
                        // para detectar se a capa bate com a
                        // variação certa (não mudamos nada no ML).
                        itemCapaPictureId:
                            item.pictures?.[0]
                                ?.id ||
                            null,

                        variationPictureIds:
                            Array.isArray(
                                variation.picture_ids
                            )
                                ? variation.picture_ids
                                : [],

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

                    ativoNoFull:
                        true,

                    title:
                        item.title ||
                        '-',

                    thumbnail:
                        item.thumbnail ||
                        '',

                    // Sem variação não há o que comparar de capa.
                    itemCapaPictureId:
                        null,

                    variationPictureIds:
                        [],

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

        // Confirmado no momento do fetch (isFull(item) em buildRows).
        ativo_no_full:
            Boolean(
                row.ativoNoFull
            ),

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

        // registro.ativo_no_full pode não existir ainda (coluna nova,
        // ou linha salva antes de existir/antes do próximo sync) —
        // nesse caso fica null ("ainda não verificado"), em vez de
        // presumir true, porque o status de envio FULL pode mudar
        // com o tempo e presumir errado gera selo enganoso na tela.
        ativoNoFull:
            registro.ativo_no_full === undefined ||
            registro.ativo_no_full === null
                ? null
                : Boolean(registro.ativo_no_full),

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

        // Levou 429: desacelera o ritmo daqui pra frente.
        GA.stockRequestIntervalMs =
            Math.min(
                GA.stockRequestIntervalMaxMs,
                GA.stockRequestIntervalMs * 2
            );
    }


    // Resposta boa: acelera de volta aos poucos até o mínimo.
    function registrarSucessoEstoque() {

        GA.stockRequestIntervalMs =
            Math.max(
                GA.stockRequestIntervalMinMs,
                GA.stockRequestIntervalMs - 10
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


                            registrarSucessoEstoque();


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


                            // O intervalo entre consultas também dobra
                            // (aplicarCooldownEstoque), então a pausa em
                            // si pode ser curta.
                            const cooldown =
                                Math.min(

                                    30000,

                                    5000 *
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


        let ultimoRedesenho =
            Date.now();


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


                // Atualizar a tabela periodicamente. Por tempo, não
                // por quantidade: refiltrar/redesenhar tudo a cada 10
                // anúncios pesava mais que as próprias consultas.
                if (
                    Date.now() -
                    ultimoRedesenho >
                    3000
                ) {

                    ultimoRedesenho =
                        Date.now();

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
        // 6 WORKERS COM LIMITADOR GLOBAL
        //
        // O limitador (aguardarSlotEstoque) é quem controla o ritmo;
        // mais workers só evitam ficar parado esperando resposta.
        // ========================================================

        const workers =
            Math.min(

                6,

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


        let inventoriesConcluidos =
            0;


        await executarEmParaleloGA(inventories, 4, async inventoryId => {

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


            inventoriesConcluidos++;


            progress(

                `Atualizando estoque antigo... ` +

                `${inventoriesConcluidos}` +

                `/` +

                `${inventories.length}`
            );
        });


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

    // Garante que row._fullAtivoSemEstoqueReal e
    // row._tipoRecomendadoPorVariacoes (usados nos filtros de
    // pendência abaixo) estejam frescos ANTES de filtrar — eles só
    // são recalculados dentro de render(), que roda depois disto.
    if (
        typeof aplicarAlertasPorVariacaoGA ===
        'function'
    ) {

        aplicarAlertasPorVariacaoGA();
    }


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
                // PENDÊNCIA: TIPO
                //
                // Mais de 30 dias sem vender
                // +
                // Clássico
                // =================================================

                const precisaCorrigirTipo =
                    typeof gaPrecisaCorrigirTipo ===
                        'function'

                        ? gaPrecisaCorrigirTipo(
                            row
                        )

                        : false;


                // =================================================
                // PENDÊNCIA: ESTOQUE
                //
                // Depósito ML = 0
                // +
                // Estoque interno > 0
                // =================================================

                const precisaCorrigirEstoque =
                    typeof gaPrecisaCorrigirEstoqueDeposito ===
                        'function'

                        ? gaPrecisaCorrigirEstoqueDeposito(
                            row
                        )

                        : false;


                // =================================================
                // PENDÊNCIA: DEPÓSITO NÃO ZERADO EM ITEM PARADO
                // =================================================

                const precisaZerarDeposito =
                    typeof gaPrecisaZerarDepositoPorInatividade ===
                        'function'

                        ? gaPrecisaZerarDepositoPorInatividade(
                            row
                        )

                        : false;


                // =================================================
                // PENDÊNCIA: MUDAR PARA CLÁSSICO
                // =================================================

                const precisaMudarClassico =
                    typeof gaPrecisaMudarParaClassico ===
                        'function'

                        ? gaPrecisaMudarParaClassico(
                            row
                        )

                        : false;


                // =================================================
                // PENDÊNCIA: OFERECE FULL SEM ESTOQUE REAL
                // =================================================

                const precisaFullSemEstoque =
                    Boolean(
                        row._fullAtivoSemEstoqueReal
                    );


                // =================================================
                // PENDÊNCIA: ESTOQUE EM EXCESSO (MÉDIA 3 MESES)
                // =================================================

                const temEstoqueEmExcesso =
                    typeof gaEstoqueEmExcesso ===
                        'function'

                        ? gaEstoqueEmExcesso(
                            row
                        )

                        : false;


                // =================================================
                // FILTRO 30+
                // =================================================

                if (
                    correcao ===
                    '30plus'
                ) {

                    if (
                        !precisaCorrigirTipo
                    ) {

                        return false;
                    }
                }


                // =================================================
                // FILTRO ESTOQUE
                // =================================================

                if (
                    correcao ===
                    'estoque'
                ) {

                    if (
                        !precisaCorrigirEstoque
                    ) {

                        return false;
                    }
                }


                // =================================================
                // FILTRO ZERAR DEPÓSITO
                // =================================================

                if (
                    correcao ===
                    'zerar_deposito'
                ) {

                    if (
                        !precisaZerarDeposito
                    ) {

                        return false;
                    }
                }


                // =================================================
                // FILTRO MUDAR PARA CLÁSSICO
                // =================================================

                if (
                    correcao ===
                    'mudar_classico'
                ) {

                    if (
                        !precisaMudarClassico
                    ) {

                        return false;
                    }
                }


                // =================================================
                // FILTRO FULL SEM ESTOQUE
                // =================================================

                if (
                    correcao ===
                    'full_sem_estoque'
                ) {

                    if (
                        !precisaFullSemEstoque
                    ) {

                        return false;
                    }
                }


                // =================================================
                // FILTRO ESTOQUE EM EXCESSO
                // =================================================

                if (
                    correcao ===
                    'estoque_excesso'
                ) {

                    if (
                        !temEstoqueEmExcesso
                    ) {

                        return false;
                    }
                }


                // =================================================
                // TODAS AS PENDÊNCIAS
                //
                // Aparece se tiver QUALQUER uma das pendências.
                // =================================================

                if (
                    correcao ===
                    'pendencias'
                ) {

                    if (
                        !precisaCorrigirTipo &&
                        !precisaCorrigirEstoque &&
                        !precisaZerarDeposito &&
                        !precisaMudarClassico &&
                        !precisaFullSemEstoque &&
                        !temEstoqueEmExcesso
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

                            row.diasSemVender,

                            row.warehouse,

                            row.full

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
            Number(
                valor
            );


        return Number.isFinite(
            n
        )
            ? n
            : fallback;
    }


    // =========================================================
    // ORDENAR
    // =========================================================

    GA.filtered.sort(
        (
            a,
            b
        ) => {

            switch (
                ordenacao
            ) {

                // =============================================
                // FULL MAIOR
                // =============================================

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


                // =============================================
                // FULL MENOR
                // =============================================

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


                // =============================================
                // DEPÓSITO MAIOR
                // =============================================

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


                // =============================================
                // DEPÓSITO MENOR
                // =============================================

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


                // =============================================
                // PADRÃO
                // =============================================

                default:


                    // -----------------------------------------
                    // FILTRO 30+
                    //
                    // Colocar quem está há mais tempo sem
                    // vender primeiro.
                    // -----------------------------------------

                    if (
                        correcao ===
                        '30plus'
                    ) {

                        const diasA =
                            numero(
                                a.diasSemVender,
                                9999
                            );


                        const diasB =
                            numero(
                                b.diasSemVender,
                                9999
                            );


                        if (
                            diasA !==
                            diasB
                        ) {

                            return (
                                diasB -
                                diasA
                            );
                        }
                    }


                    // -----------------------------------------
                    // FILTRO TODAS AS PENDÊNCIAS
                    //
                    // Prioridade:
                    //
                    // 1. Produto com DUAS pendências
                    // 2. Estoque
                    // 3. Tipo
                    // -----------------------------------------

                    if (
                        correcao ===
                        'pendencias'
                    ) {

                        const tipoA =
                            typeof gaPrecisaCorrigirTipo ===
                                'function' &&
                            gaPrecisaCorrigirTipo(
                                a
                            );


                        const tipoB =
                            typeof gaPrecisaCorrigirTipo ===
                                'function' &&
                            gaPrecisaCorrigirTipo(
                                b
                            );


                        const estoqueA =
                            typeof gaPrecisaCorrigirEstoqueDeposito ===
                                'function' &&
                            gaPrecisaCorrigirEstoqueDeposito(
                                a
                            );


                        const estoqueB =
                            typeof gaPrecisaCorrigirEstoqueDeposito ===
                                'function' &&
                            gaPrecisaCorrigirEstoqueDeposito(
                                b
                            );


                        const quantidadePendenciasA =
                            Number(
                                !!tipoA
                            ) +
                            Number(
                                !!estoqueA
                            );


                        const quantidadePendenciasB =
                            Number(
                                !!tipoB
                            ) +
                            Number(
                                !!estoqueB
                            );


                        if (
                            quantidadePendenciasA !==
                            quantidadePendenciasB
                        ) {

                            return (
                                quantidadePendenciasB -
                                quantidadePendenciasA
                            );
                        }
                    }


                    // -----------------------------------------
                    // TÍTULO A-Z
                    // -----------------------------------------

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


    // =========================================================
    // VOLTAR PARA PÁGINA 1
    // =========================================================

    if (
        resetPage
    ) {

        GA.page =
            1;
    }


    // =========================================================
    // RENDERIZAR
    // =========================================================

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


            const data =
                await ml(
                    path
                );

            if (
                typeof registrarSucessoEstoque ===
                'function'
            ) {

                registrarSucessoEstoque();
            }

            return data;

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
                    30000,
                    5000 * tentativa
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


    const lotes30 =
        [];

    for (
        let i = 0;
        i < inventories.length;
        i += TAMANHO_LOTE
    ) {

        lotes30.push(
            inventories.slice(
                i,
                i + TAMANHO_LOTE
            )
        );
    }


    // Vários lotes ao mesmo tempo; o ritmo continua controlado pelo
    // limitador global dentro de requisicaoOperacoesFull.
    await executarEmParaleloGA(lotes30, 3, async lote => {

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
    });


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


        const lotesJanela =
            [];

        for (
            let i = 0;
            i < faltantesNestaJanela.length;
            i += TAMANHO_LOTE
        ) {

            lotesJanela.push(
                faltantesNestaJanela.slice(
                    i,
                    i + TAMANHO_LOTE
                )
            );
        }


        await executarEmParaleloGA(lotesJanela, 3, async lote => {

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
        });


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
// ANÚNCIO FINALIZADO (status "closed" no ML)
//
// Finalizado não entra em nenhum alerta: nem 30+ dias, nem lista
// Premium, nem estoque, nem nada. Todas as funções de alerta
// abaixo checam isso primeiro.
// ============================================================

function gaAnuncioFinalizado(
    row
) {

    return String(
        row?.status || ''
    ).toLowerCase() === 'closed';
}


function gaUsuarioAdministrador() {

    return String(
        window.currentUser?.role || ''
    ).toLowerCase() === 'administrador';
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

    if (
        gaAnuncioFinalizado(
            row
        )
    ) {

        return false;
    }


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
// ENTRA NA LISTA DE 30+ DIAS SEM VENDER?
//
// Uma regra só, usada no histórico de 30+ dias, na lista fixa
// "Sempre Premium" e no alerta de tipo:
//  - finalizado nunca entra;
//  - variação sem estoque real no FULL não entra (não vende por
//    falta de produto, não por falta de exposição);
//  - de resto, 30+ dias sem vender no FULL.
// ============================================================

function gaEntraLista30Dias(
    row
) {

    if (
        gaAnuncioFinalizado(
            row
        ) ||
        row?._fullAtivoSemEstoqueReal
    ) {

        return false;
    }


    return gaMaisDe30DiasSemVender(
        row
    );
}


// ============================================================
// PRECISA CORRIGIR?
//
// 30+ DIAS SEM VENDER É A REGRA MAJORITÁRIA: quem está na lista
// de 30+ precisa ser Premium, mesmo que outra regra (promoção que
// derrubou o preço abaixo de R$150, estoque por variação, lista
// fixa Clássico) diga o contrário.
// ============================================================

function gaPrecisaCorrigirTipo(
    row
) {

    if (
        gaAnuncioFinalizado(
            row
        ) ||
        !gaEhClassico(
            row
        )
    ) {

        return false;
    }


    if (
        gaEntraLista30Dias(
            row
        )
    ) {

        return true;
    }


    // Fora do 30+: Clássico de propósito por causa de uma promoção
    // que derrubou o preço abaixo de R$150 (ver estoque_gestao.js)
    // não é "errado", não sinaliza.
    if (
        window._mlbsExposicaoPromocaoAtivaSync &&
        window._mlbsExposicaoPromocaoAtivaSync.has(row?.itemId)
    ) {
        return false;
    }


    return (
        !row?._fullAtivoSemEstoqueReal &&
        row?._tipoRecomendadoPorVariacoes ===
            'premium'
    );
}


// ============================================================
// PRECISA MUDAR PARA CLÁSSICO?
//
// Direção oposta de gaPrecisaCorrigirTipo — baseada só na
// quantidade em FULL das variações (não existe uma regra por
// tempo pra "rebaixar" o anúncio, só por estoque parado em
// variações pequenas). Ver aplicarAlertasPorVariacaoGA(), que
// calcula row._tipoRecomendadoPorVariacoes por item.
//
// PRIORIDADE ENTRE REGRAS: se o item também está há 30+ dias sem
// vender, essa regra (que pede Premium) tem prioridade sobre a de
// estoque por variação (que pediria Clássico) — o anúncio continua
// Premium, não sugerimos rebaixar.
// ============================================================

function gaPrecisaMudarParaClassico(
    row
) {

    if (
        gaAnuncioFinalizado(
            row
        ) ||
        gaMaisDe30DiasSemVender(
            row
        )
    ) {

        return false;
    }


    return (
        row?._tipoRecomendadoPorVariacoes ===
            'classico' &&
        gaEhPremium(
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
    // PRECISA ALTERAR PREMIUM -> CLÁSSICO
    //
    // Direção oposta — todas as variações do anúncio têm 0 ou 1
    // unidade no FULL, não justifica pagar Premium.
    // ========================================================

    if (
        !precisaCorrigir &&
        gaPrecisaMudarParaClassico(
            row
        )
    ) {

        const urlClassico =
            gaUrlModificarAnuncio(
                row.itemId
            );

        return `

            <td data-coluna-ga="tipo" class="ga-tipo-precisa-classico">

                <strong
                    style="
                        color:#0d6efd;
                    "
                >
                    ${esc(
                        row.listingTypeName ||
                        'Premium'
                    )}
                </strong>


                <div class="ga-alerta-tipo" style="color:#0d6efd;">

                    <i class="fas fa-arrow-down"></i>

                    Mudar para Clássico

                </div>


                <div class="ga-acoes-correcao-tipo">

                    <a
                        href="${esc(urlClassico)}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="ga-link-corrigir"
                        style="color:#0d6efd;"
                    >

                        <i class="fas fa-edit"></i>

                        Modificar anúncio

                    </a>


                    <button
                        type="button"
                        class="ga-btn-corrigido"
                        onclick="verificarCorrecaoTipoClassicoAnuncio(
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


    // ========================================================
    // NORMAL
    // ========================================================

    if (
        !precisaCorrigir
    ) {

        return `

            <td data-coluna-ga="tipo">

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

        <td data-coluna-ga="tipo" class="ga-tipo-precisa-corrigir">

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

// ============================================================
// CAPA DO ANÚNCIO — SÓ SINALIZA, NÃO MEXE NO MERCADO LIVRE
//
// Quando um anúncio tem mais de uma variação, a foto de capa
// (item.pictures[0]) deveria ser de uma variação que está no
// FULL — e, havendo mais de uma no FULL, da que está há mais
// tempo sem vender (empurra o produto parado). Aqui só
// detectamos se a capa atual bate com essa variação; a correção
// em si é manual, igual às outras sinalizações desta tela
// (Tipo, Estoque) — reaproveita gaUrlModificarAnuncio.
// ============================================================

function aplicarSinalizacaoCapaAnuncioGA() {

    if (
        !Array.isArray(GA.rows) ||
        !GA.rows.length
    ) {
        return;
    }

    const porItem =
        new Map();

    GA.rows.forEach(
        row => {

            row.capaPrecisaCorrigir =
                false;

            row.capaVariacaoRecomendadaId =
                null;

            if (!row.itemId || gaAnuncioFinalizado(row)) return;

            if (!porItem.has(row.itemId)) {
                porItem.set(row.itemId, []);
            }

            porItem.get(row.itemId).push(row);
        }
    );

    porItem.forEach(
        linhas => {

            // Só faz sentido com mais de uma variação.
            if (linhas.length < 2) return;

            const noFull =
                linhas.filter(
                    row => Number(row.full) > 0
                );

            if (!noFull.length) return;

            // Escolhe a variação no FULL há mais tempo sem vender.
            // "Nunca vendeu, já pesquisado o histórico" conta como
            // o maior tempo possível (mesma regra usada nas
            // regras de promoção por dias sem vender no FULL).
            let escolhida = null;
            let melhorScore = -1;

            noFull.forEach(
                row => {

                    const semVendaConfirmada =
                        (
                            row.diasSemVender === null ||
                            row.diasSemVender === undefined
                        ) &&
                        Boolean(row.vendasFullAtualizadoEm);

                    const score =
                        semVendaConfirmada
                            ? Infinity
                            : (
                                Number.isFinite(Number(row.diasSemVender))
                                    ? Number(row.diasSemVender)
                                    : -1
                            );

                    if (score > melhorScore) {
                        melhorScore = score;
                        escolhida = row;
                    }
                }
            );

            // Sem a foto atual da capa ainda carregada, não dá
            // pra comparar — evita falso positivo.
            if (!escolhida || !escolhida.itemCapaPictureId) return;

            const capaCorreta =
                Array.isArray(escolhida.variationPictureIds) &&
                escolhida.variationPictureIds.includes(
                    escolhida.itemCapaPictureId
                );

            if (!capaCorreta) {
                escolhida.capaPrecisaCorrigir = true;
                escolhida.capaVariacaoRecomendadaId = escolhida.variationId;
            }
        }
    );
}


// ============================================================
// ALERTAS POR ITEM (AGRUPANDO TODAS AS VARIAÇÕES)
//
// Roda 1x por render() (mesmo padrão de aplicarSinalizacaoCapaAnuncioGA),
// agrupando as rows por itemId pra decidir duas coisas que só
// fazem sentido olhando TODAS as variações de um anúncio juntas:
//
// 1. row._fullAtivoSemEstoqueReal — o anúncio está marcado como
//    "oferece FULL" mas, olhando todas as variações, nenhuma tem
//    estoque de verdade no FULL. É inconsistência de dados
//    (ativoNoFull desatualizado) ou o FULL esvaziou sem ninguém
//    perceber — nos dois casos, alerta.
//
// 2. row._tipoRecomendadoPorVariacoes — só se aplica a anúncios
//    que TÊM variação de verdade (mais de uma linha por item):
//      - alguma variação com mais de 1 unidade no FULL -> 'premium'
//      - todas as variações com 0 ou 1 unidade no FULL -> 'classico'
//    Anúncio sem variação real não entra nessa regra (fica null).
// ============================================================

function aplicarAlertasPorVariacaoGA() {

    if (
        !Array.isArray(GA.rows) ||
        !GA.rows.length
    ) {
        return;
    }

    const porItem =
        new Map();

    GA.rows.forEach(
        row => {

            row._fullAtivoSemEstoqueReal =
                false;

            row._tipoRecomendadoPorVariacoes =
                null;

            if (!row.itemId || gaAnuncioFinalizado(row)) return;

            if (!porItem.has(row.itemId)) {
                porItem.set(row.itemId, []);
            }

            porItem.get(row.itemId).push(row);
        }
    );

    porItem.forEach(
        linhas => {

            // =====================================================
            // 1. ATIVO NO FULL MAS SEM ESTOQUE REAL EM NENHUMA
            //    VARIAÇÃO (ou no item, quando não tem variação)
            // =====================================================

            const algumaAtivaNoFull =
                linhas.some(
                    row => row.ativoNoFull === true
                );

            if (algumaAtivaNoFull) {

                const todasZeradas =
                    linhas.every(
                        row => {

                            const estoqueFull =
                                Number(row.full);

                            return (
                                !Number.isFinite(estoqueFull) ||
                                estoqueFull <= 0
                            );
                        }
                    );

                if (todasZeradas) {

                    // Só marca a(s) variação(ões) que ELA MESMA está
                    // ativa no full — antes marcava o item inteiro,
                    // inclusive variações-irmãs que nunca ofereceram
                    // full (têm full=0 naturalmente, não é um erro
                    // delas).
                    linhas
                        .filter(
                            row => row.ativoNoFull === true
                        )
                        .forEach(
                            row => {
                                row._fullAtivoSemEstoqueReal = true;
                            }
                        );
                }
            }


            // =====================================================
            // 2. TIPO RECOMENDADO PELA QUANTIDADE NAS VARIAÇÕES
            //
            // Só se aplica quando o anúncio TEM variação de verdade.
            // Variação zerada no FULL não entra na conta — sem
            // produto lá, nenhuma regra vale pra ela (nem pra
            // decidir o tipo, nem pra herdar a recomendação das
            // variações-irmãs).
            // =====================================================

            const temVariacaoReal =
                linhas.length > 1 &&
                linhas.some(row => row.variationId);

            if (!temVariacaoReal) return;

            const linhasComEstoqueFull =
                linhas.filter(
                    row => Number(row.full) > 0
                );

            // Nenhuma variação com estoque no FULL: nada pra
            // recomendar, o item inteiro está fora do FULL.
            if (!linhasComEstoqueFull.length) return;

            const recomendado =
                linhasComEstoqueFull.some(
                    row => Number(row.full) > 1
                )
                    ? 'premium'
                    : 'classico';

            linhasComEstoqueFull.forEach(
                row => {
                    row._tipoRecomendadoPorVariacoes = recomendado;
                }
            );
        }
    );
}


// ============================================================
// 30+ DIAS SEM VENDER -> ENTRA AUTOMATICAMENTE NA LISTA FIXA
// "SEMPRE PREMIUM"
//
// Antes disso, o sistema só sinalizava (coluna Tipo piscando
// "Mudar para Premium"), mas quem cadastra o MLB na lista fixa
// (Gestão de Estoque > Regras > Regras Fixas de Tipo de Anúncio)
// continuava sendo uma pessoa, manualmente. Agora, assim que um
// MLB cruza os 30 dias sem vender no FULL e ainda está Clássico,
// ele é adicionado sozinho à lista "Sempre PREMIUM" (reaproveita
// window.salvarRegrasFixasTipoAnuncioML, de estoque_gestao.js —
// a mesma tela/tabela usada quando alguém edita a lista na mão).
// ============================================================

// (A inclusão/remoção na lista "Sempre Premium" agora é feita por
// sincronizarListasFixas30DiasGA, junto com o histórico de 30+ dias.)


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
    // CAPA DO ANÚNCIO (anúncios com variação)
    //
    // Recalcula a cada render — é barato (só agrupa o que já
    // está em memória) e assim se autocorrige assim que mais
    // dados chegam (estoque FULL, dias sem vender, fotos).
    // =========================================================

    aplicarSinalizacaoCapaAnuncioGA();


    // =========================================================
    // ALERTAS POR ITEM: FULL ATIVO SEM ESTOQUE REAL, E TIPO
    // RECOMENDADO PELA QUANTIDADE NAS VARIAÇÕES
    // =========================================================

    aplicarAlertasPorVariacaoGA();


    // =========================================================
    // ESTOQUE "A CAMINHO" PRO FULL (dispara 1x, re-renderiza
    // sozinho quando terminar de carregar)
    // =========================================================

    gaGarantirEstoqueACaminhoCarregado();


    // =========================================================
    // MÉDIA DE VENDAS 3 MESES (excesso de estoque) — 1x por sessão
    // =========================================================

    carregarMediaVendas3MesesGA();


    // =========================================================
    // HISTÓRICO DE 30+ DIAS SEM VENDER (throttle de 30s)
    // =========================================================

    sincronizarHistorico30DiasGA();


    // (30+ dias sem vender -> listas fixas Premium/Clássico: feito
    // em sincronizarHistorico30DiasGA, logo acima.)


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

                            <td data-coluna-ga="foto">

                                ${
                                    row.thumbnail

                                        ? `
                                            <div style="position:relative; display:inline-block;">
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
                                                ${
                                                    row.capaPrecisaCorrigir
                                                        ? `
                                                            <a
                                                                href="${esc(gaUrlModificarAnuncio(row.itemId))}"
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                class="ga-capa-alerta-badge"
                                                                title="A capa deste anúncio deveria ser a foto desta variação (está no FULL há mais tempo sem vender). Clique para corrigir no Mercado Livre."
                                                            >!</a>
                                                        `
                                                        : ''
                                                }
                                            </div>
                                        `

                                        : '-'
                                }

                            </td>


                            <!-- ===================================== -->
                            <!-- 2. MLB -->
                            <!-- ===================================== -->

                            <td data-coluna-ga="mlb">

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

                            <td data-coluna-ga="titulo">

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


                            <!-- DEPÓSITO -->

                            ${gaRenderEstoqueDeposito(row)}


                            <!-- ===================================== -->
                            <!-- 5. FULL -->
                            <!-- ===================================== -->

                            <td
                                data-coluna-ga="full"
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

                                ${
                                    row.ativoNoFull &&
                                    gaObterEstoqueACaminho(row) > 0

                                        ? `
                                            <div
                                                style="
                                                    font-size:11px;
                                                    color:#fd7e14;
                                                    margin-top:2px;
                                                    white-space:nowrap;
                                                "
                                                title="Estoque comprado ainda não chegou fisicamente — mostrado separado do que já está confirmado no FULL"
                                            >
                                                🚚 ${esc(estoqueFull || 0)} no estoque + ${esc(
                                                    gaObterEstoqueACaminho(row)
                                                )} a caminho
                                            </div>
                                        `

                                        : ''
                                }

                                ${
                                    gaEstoqueEmExcesso(row)

                                        ? `
                                            <div
                                                style="
                                                    font-size:11px;
                                                    color:#dc3545;
                                                    margin-top:2px;
                                                    white-space:nowrap;
                                                "
                                                title="Estoque atual (depósito + FULL): ${esc(gaEstoqueAtualDoRow(row))} · Média de vendas nos últimos 3 meses: ${esc((gaMediaVendasMensalDoRow(row) || 0).toFixed(1))}/mês"
                                            >
                                                📦 Estoque em excesso
                                            </div>
                                        `

                                        : ''
                                }

                            </td>


                            <!-- ===================================== -->
                            <!-- 5b. ATIVO NO FULL -->
                            <!-- ===================================== -->

                            <td
                                data-coluna-ga="ativoFull"
                                style="
                                    text-align:center;
                                "
                            >

                                ${gaRenderBadgeStatusFullGA(row)}

                            </td>


                            <!-- ===================================== -->
                            <!-- 6. VENDAS FULL 30D -->
                            <!-- ===================================== -->

                            <td
                                data-coluna-ga="vendas30d"
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
                                data-coluna-ga="semVender"
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

                            <td data-coluna-ga="status">

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
                                data-coluna-ga="preco"
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

                            <td data-coluna-ga="inventoryId">

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

                            <td data-coluna-ga="acoes">

                                <div
                                    style="
                                        display:flex;
                                        gap:4px;
                                        flex-wrap:wrap;
                                    "
                                >

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

                                            : ''
                                    }

                                    <button
                                        type="button"
                                        class="btn btn-sm btn-outline-warning"
                                        title="Colocar em promoção"
                                        onclick="
                                            abrirModalPromocaoItem(
                                                '${esc(row.itemId)}',
                                                '${esc(row.variationId || '')}',
                                                '${esc(row.title || '')}'
                                            )
                                        "
                                    >
                                        <i class="fas fa-tags"></i>
                                    </button>

                                </div>

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


    // =========================================================
    // COLUNAS PERSONALIZADAS (ordem / visibilidade / largura)
    // =========================================================

    reconstruirCabecalhoGA();
    aplicarPreferenciasColunasGA();
}

function atualizarEstoqueInternoGerenciamento(
    rows
) {

    if (
        !Array.isArray(rows)
    ) {

        return;
    }


    for (const row of rows) {

        row.internalWarehouse =
            warehouseStock(
                row.sku,
                row.itemId
            );
    }
}

function gaPrecisaCorrigirEstoqueDeposito(
    row
) {

    // =========================================================
    // ITEM PARADO HÁ 30+ DIAS: NÃO SUGERE REABASTECER O DEPÓSITO
    //
    // O objetivo pra item parado é vender só pelo FULL — sugerir
    // "colocar estoque no depósito" contradiz isso. Ver
    // gaPrecisaZerarDepositoPorInatividade(), que cobre esse caso
    // com o alerta oposto (zerar, não reabastecer).
    // =========================================================

    if (
        gaAnuncioFinalizado(
            row
        ) ||
        gaMaisDe30DiasSemVender(
            row
        )
    ) {

        return false;
    }


    // =========================================================
    // PRECISAMOS TER ESTOQUE DO MERCADO LIVRE CONSULTADO
    // =========================================================

    if (
        row?.warehouse === null ||
        row?.warehouse === undefined
    ) {

        return false;
    }


    const depositoML =
        Number(
            row.warehouse
        );


    if (
        !Number.isFinite(
            depositoML
        )
    ) {

        return false;
    }


    // Só interessa depósito zerado.
    if (
        depositoML !== 0
    ) {

        return false;
    }


    // =========================================================
    // internalWarehouse =
    //
    // QUANTAS UNIDADES DO ANÚNCIO CONSEGUIMOS MONTAR
    //
    // e não simplesmente estoque físico.
    // =========================================================

    const unidadesPossiveis =
        Number(
            row.internalWarehouse
        );


    if (
        !Number.isFinite(
            unidadesPossiveis
        )
    ) {

        return false;
    }


    // =========================================================
    // SÓ AVISAR SE DÁ PARA VENDER PELO MENOS 1
    // =========================================================

    return (
        unidadesPossiveis >= 1
    );
}


// ============================================================
// ESTOQUE "SOBRANDO" NO DEPÓSITO COM O FULL JÁ ABASTECIDO
//
// Quando o anúncio já tem estoque disponível no FULL (full > 0),
// o depósito (fora do FULL) só deveria segurar 1 unidade — o
// resto precisa ser mandado pro Mercado Livre e a quantidade/
// exposição do anúncio revisada. Mais de 1 unidade parada nessa
// situação já é motivo de alerta.
// ============================================================

function gaPrecisaAjustarQuantidadeExposicao(
    row
) {

    if (
        !row?.ativoNoFull ||
        gaAnuncioFinalizado(
            row
        )
    ) {

        return false;
    }


    const estoqueFull =
        Number(
            row?.full
        );


    if (
        !Number.isFinite(
            estoqueFull
        ) ||
        estoqueFull <= 0
    ) {

        return false;
    }


    if (
        row?.warehouse === null ||
        row?.warehouse === undefined
    ) {

        return false;
    }


    const depositoML =
        Number(
            row.warehouse
        );


    if (
        !Number.isFinite(
            depositoML
        )
    ) {

        return false;
    }


    return (
        depositoML > 1
    );
}


// ============================================================
// ESTOQUE "A CAMINHO" PRO FULL
//
// Reaproveita o mesmo rastreio de compras "a caminho" já usado na
// Gestão de Estoque (rastreiosCompraPorProduto / dados_extra.
// quantidade_a_caminho) pra explicar, na coluna FULL, um FULL
// zerado (ou não consultado) quando o anúncio já está ativo pra
// FULL — o produto comprado ainda não chegou fisicamente, mas o
// anúncio já pode estar oferecendo envio FULL mesmo assim.
// ============================================================

GA._aCaminhoCarregado = GA._aCaminhoCarregado || false;

function gaGarantirEstoqueACaminhoCarregado() {

    if (GA._aCaminhoCarregado) return;

    if (
        typeof carregarPreEntradasRastreioEstoque !==
        'function'
    ) {
        return;
    }

    GA._aCaminhoCarregado = true;

    carregarPreEntradasRastreioEstoque()
        .then(() => {

            if (typeof render === 'function') {
                render();
            }

        })
        .catch(error => {

            GA._aCaminhoCarregado = false;

            console.warn(
                '⚠️ Não foi possível carregar estoque "a caminho" pro FULL:',
                error
            );

        });
}

function gaObterEstoqueACaminho(row) {

    const sku =
        String(row?.sku || '').trim().toUpperCase();

    if (!sku) return 0;

    if (
        typeof produtosEstoque === 'undefined' ||
        !Array.isArray(produtosEstoque)
    ) {
        return 0;
    }

    const produto =
        produtosEstoque.find(
            p => String(p.sku || '').trim().toUpperCase() === sku
        );

    if (!produto) return 0;

    if (typeof obterQuantidadeACaminho !== 'function') return 0;

    try {

        return obterQuantidadeACaminho(produto) || 0;

    } catch (error) {

        return 0;
    }
}


// ============================================================
// ESTOQUE EM EXCESSO — MÉDIA DE VENDAS DOS ÚLTIMOS 3 MESES
//
// Regra: estoque atual (depósito + FULL) > média de vendas por mês
// do produto (últimos 3 meses, vendas não canceladas) => sinaliza
// excesso. Estoque atual <= média está certo, não sinaliza.
// Cruza com vendas_nfe_cache (a mesma fonte usada em todo o resto
// do sistema), somando a quantidade vendida por SKU nos últimos 90
// dias e dividindo por 3.
// ============================================================

GA._mediaVendas3MesesPorSku = GA._mediaVendas3MesesPorSku || null;
GA._mediaVendas3MesesCarregando = false;

async function carregarMediaVendas3MesesGA() {

    if (GA._mediaVendas3MesesPorSku || GA._mediaVendas3MesesCarregando) return;
    if (!window.supabaseClient) return;

    GA._mediaVendas3MesesCarregando = true;

    try {

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        const cutoffStr = cutoff.toISOString().slice(0, 10);

        const totalPorSku = new Map();
        const tamanhoPagina = 1000;
        let inicio = 0;
        let continuar = true;

        while (continuar) {

            const { data, error } = await window.supabaseClient
                .from('vendas_nfe_cache')
                .select('cancelada:venda_json->venda_cancelada, itens:venda_json->order_items')
                .gte('venda_json->>data_venda', cutoffStr)
                .range(inicio, inicio + tamanhoPagina - 1);

            if (error) throw error;

            const lote = data || [];

            lote.forEach(linha => {

                if (linha.cancelada) return;

                const itens = Array.isArray(linha.itens) ? linha.itens : [];

                itens.forEach(item => {

                    const sku = String(item?.item?.seller_sku || '').trim().toUpperCase();
                    if (!sku) return;

                    const qtd = Number(item?.quantity) || 1;
                    totalPorSku.set(sku, (totalPorSku.get(sku) || 0) + qtd);
                });
            });

            if (lote.length < tamanhoPagina) {
                continuar = false;
            } else {
                inicio += tamanhoPagina;
            }
        }

        const mediaPorSku = new Map();
        totalPorSku.forEach((total, sku) => {
            mediaPorSku.set(sku, total / 3);
        });

        GA._mediaVendas3MesesPorSku = mediaPorSku;

        if (typeof render === 'function') render();

    } catch (error) {

        console.warn('⚠️ Não foi possível carregar a média de vendas de 3 meses:', error);

    } finally {

        GA._mediaVendas3MesesCarregando = false;
    }
}

function gaMediaVendasMensalDoRow(row) {

    if (!GA._mediaVendas3MesesPorSku) return null;

    const sku = String(row?.sku || '').trim().toUpperCase();
    if (!sku) return null;

    return GA._mediaVendas3MesesPorSku.get(sku) || 0;
}

function gaEstoqueAtualDoRow(row) {

    return (
        (Number(row?.warehouse) || 0) +
        (Number(row?.full) || 0)
    );
}

// Só administradores veem o alerta de estoque em excesso.
function gaEstoqueEmExcesso(row) {

    if (!gaUsuarioAdministrador() || gaAnuncioFinalizado(row)) return false;

    const media = gaMediaVendasMensalDoRow(row);
    if (media === null) return false;

    return gaEstoqueAtualDoRow(row) > media;
}


// ============================================================
// HISTÓRICO DE "30+ DIAS SEM VENDER"
//
// Cada vez que um item (item+variação) passa a contar como 30+ dias
// sem vender (gaEntraLista30Dias: finalizado e sem estoque real no
// FULL não entram), abre um registro em full_historico_30_mais_dias.
// Quando ele deixa de contar, fecha o registro com a data de saída e
// o motivo (gaMotivoSaida30Dias). Depois sincroniza as listas fixas
// Premium/Clássico (sincronizarListasFixas30DiasGA). Só roda pra
// administrador — é escrita automática numa tabela compartilhada.
// ============================================================

GA._chaves30DiasAbertas = GA._chaves30DiasAbertas || null;
GA._ultimoSync30Dias = GA._ultimoSync30Dias || 0;

function gaChave30Dias(itemId, variationId) {
    return `${itemId}|${variationId || ''}`;
}

async function carregarHistorico30DiasAbertoGA() {

    if (GA._chaves30DiasAbertas) return;

    GA._chaves30DiasAbertas = new Map();

    if (!window.supabaseClient) return;

    try {

        const { data, error } = await window.supabaseClient
            .from('full_historico_30_mais_dias')
            .select('id, item_id, variation_id')
            .is('data_saida', null);

        if (error) throw error;

        (data || []).forEach(registro => {
            GA._chaves30DiasAbertas.set(
                gaChave30Dias(registro.item_id, registro.variation_id),
                registro.id
            );
        });

    } catch (error) {

        console.warn('⚠️ Não foi possível carregar histórico de 30+ dias:', error);
    }
}

async function sincronizarHistorico30DiasGA() {

    if (
        !window.currentUser ||
        String(window.currentUser.role || '').toLowerCase() !== 'administrador'
    ) {
        return;
    }

    if (!Array.isArray(GA.rows) || !GA.rows.length) return;

    // Durante a sincronização as linhas estão sendo remontadas e as
    // vendas ainda não foram recalculadas — decidir entradas/saídas
    // agora fecharia registros por engano (e tiraria MLBs do Premium).
    if (GA.loading) return;

    if (Date.now() - GA._ultimoSync30Dias < 30000) return;
    GA._ultimoSync30Dias = Date.now();

    await carregarHistorico30DiasAbertoGA();

    const chavesAtuais = new Map();

    GA.rows.forEach(row => {

        if (!row.itemId) return;
        if (!gaEntraLista30Dias(row)) return;

        chavesAtuais.set(gaChave30Dias(row.itemId, row.variationId), row);
    });

    // Abrir os que são novos na lista.
    for (const [chave, row] of chavesAtuais.entries()) {

        if (GA._chaves30DiasAbertas.has(chave)) continue;

        try {

            const { data, error } = await window.supabaseClient
                .from('full_historico_30_mais_dias')
                .insert([{
                    item_id: row.itemId,
                    variation_id: row.variationId || null,
                    sku: row.sku || null,
                    titulo: row.title || null,
                    dias_parado_na_entrada: Number.isFinite(Number(row.diasSemVender)) ? Number(row.diasSemVender) : null
                }])
                .select('id')
                .single();

            if (!error && data) {
                GA._chaves30DiasAbertas.set(chave, data.id);
            }

        } catch (error) {
            console.warn('⚠️ Erro abrindo registro de 30+ dias:', error);
        }
    }

    // Fechar os que saíram da lista.
    for (const [chave, id] of Array.from(GA._chaves30DiasAbertas.entries())) {

        if (chavesAtuais.has(chave)) continue;

        const [itemId, variationId] = chave.split('|');
        const row = GA.rows.find(
            r => r.itemId === itemId && String(r.variationId || '') === variationId
        );

        const motivo = gaMotivoSaida30Dias(row);

        // Sem dados de venda carregados ainda: não dá pra afirmar que
        // vendeu — deixa o registro aberto até a próxima checagem.
        if (!motivo) continue;

        try {

            const { error } = await window.supabaseClient
                .from('full_historico_30_mais_dias')
                .update({
                    data_saida: new Date().toISOString(),
                    motivo_saida: motivo
                })
                .eq('id', id);

            if (!error) {
                GA._chaves30DiasAbertas.delete(chave);
            }

        } catch (error) {
            console.warn('⚠️ Erro fechando registro de 30+ dias:', error);
        }
    }

    await sincronizarListasFixas30DiasGA();
}


// Por que um item saiu da lista de 30+ (null = ainda não dá pra saber).
function gaMotivoSaida30Dias(row) {

    if (!row || !row.ativoNoFull) return 'saiu_do_full';
    if (gaAnuncioFinalizado(row)) return 'finalizado';
    if (row._fullAtivoSemEstoqueReal) return 'sem_estoque_full';

    const dias = Number(row.diasSemVender);

    if (Number.isFinite(dias) && dias <= 30) return 'vendeu';

    return null;
}


// ============================================================
// 30+ DIAS SEM VENDER x LISTAS FIXAS DA GESTÃO DE ESTOQUE
//
// A lista de 30+ é a regra majoritária:
//  - todo MLB aberto na lista de 30+ fica na lista fixa "Sempre
//    Premium" e SAI da "Sempre Clássico", seja qual for o motivo
//    de estar lá;
//  - quando o MLB sai da lista de 30+ porque VENDEU (ou porque o
//    anúncio foi finalizado), sai também da "Sempre Premium".
//    Sair por falta de estoque no FULL ou por ter saído do FULL
//    não mexe na lista.
//
// As saídas são lidas do histórico (full_historico_30_mais_dias)
// a partir da última conferência, guardada em
// configuracoes_sistema → CHAVE_CONFERENCIA_PREMIUM_30_DIAS. Na
// primeira vez confere todo o histórico, então quem já tinha saído
// antes desta regra existir também é limpo.
// Só roda para administrador (escrita automática em configuração
// compartilhada).
// ============================================================

const CHAVE_CONFERENCIA_PREMIUM_30_DIAS = 'full_30_dias_premium_conferido_ate';
GA._sincronizandoListasFixas30Dias = false;

async function sincronizarListasFixas30DiasGA() {

    if (
        GA._sincronizandoListasFixas30Dias ||
        !gaUsuarioAdministrador() ||
        !window.supabaseClient ||
        !GA._chaves30DiasAbertas ||
        typeof window.carregarRegrasFixasTipoAnuncioML !== 'function' ||
        typeof window.salvarRegrasFixasTipoAnuncioML !== 'function'
    ) {
        return;
    }

    GA._sincronizandoListasFixas30Dias = true;

    try {

        const db = window.supabaseClient;
        const inicioConferencia = new Date().toISOString();

        const mlbsNo30 = new Set(
            [...GA._chaves30DiasAbertas.keys()].map(chave => chave.split('|')[0])
        );

        // Última conferência das saídas.
        const { data: config } = await db
            .from('configuracoes_sistema')
            .select('valor')
            .eq('chave', CHAVE_CONFERENCIA_PREMIUM_30_DIAS)
            .maybeSingle();

        let conferidoAte = config?.valor ?? null;
        if (conferidoAte && typeof conferidoAte === 'object') conferidoAte = conferidoAte.em || null;

        let consulta = db
            .from('full_historico_30_mais_dias')
            .select('item_id, data_saida')
            .in('motivo_saida', ['vendeu', 'finalizado'])
            .not('data_saida', 'is', null)
            .limit(10000);

        if (conferidoAte) consulta = consulta.gt('data_saida', conferidoAte);

        const { data: saidas, error: erroSaidas } = await consulta;
        if (erroSaidas) throw erroSaidas;

        // Saiu vendendo e não tem outra variação ainda aberta no 30+.
        const sairDoPremium = new Set(
            (saidas || [])
                .map(registro => String(registro.item_id || '').toUpperCase())
                .filter(mlb => mlb && !mlbsNo30.has(mlb))
        );

        const atuais = await window.carregarRegrasFixasTipoAnuncioML();
        const classicoAtual = Array.isArray(atuais?.classico) ? atuais.classico : [];
        const premiumAtual = Array.isArray(atuais?.premium) ? atuais.premium : [];

        const novoClassico = classicoAtual.filter(mlb => !mlbsNo30.has(mlb));
        const novoPremium = [
            ...new Set([
                ...premiumAtual.filter(mlb => !sairDoPremium.has(mlb)),
                ...mlbsNo30
            ])
        ];

        const tiradosDoClassico = classicoAtual.filter(mlb => mlbsNo30.has(mlb));
        const entraramPremium = novoPremium.filter(mlb => !premiumAtual.includes(mlb));
        const sairamPremium = premiumAtual.filter(mlb => !novoPremium.includes(mlb));

        if (tiradosDoClassico.length || entraramPremium.length || sairamPremium.length) {

            const resultado = await window.salvarRegrasFixasTipoAnuncioML({
                classico: novoClassico,
                premium: novoPremium
            });

            if (resultado?.success === false) {
                console.warn('⚠️ [30+ dias] Não foi possível atualizar as listas fixas:', resultado.error);
                return;
            }

            console.log('✅ [30+ dias] Listas fixas atualizadas:', {
                entraramPremium,
                sairamPremium,
                tiradosDoClassico
            });

            const partes = [];
            if (entraramPremium.length) partes.push(`${entraramPremium.length} entrou(aram) em "Sempre Premium" (30+ dias sem vender)`);
            if (tiradosDoClassico.length) partes.push(`${tiradosDoClassico.length} saiu(íram) de "Sempre Clássico"`);
            if (sairamPremium.length) partes.push(`${sairamPremium.length} saiu(íram) de "Sempre Premium" (voltaram a vender)`);
            window.showToast?.(`🔵 ${partes.join(' • ')}.`, 'info');
        }

        await db
            .from('configuracoes_sistema')
            .upsert(
                { chave: CHAVE_CONFERENCIA_PREMIUM_30_DIAS, valor: inicioConferencia },
                { onConflict: 'chave' }
            );

    } catch (erro) {

        console.error('❌ [30+ dias] Erro sincronizando listas fixas:', erro);

    } finally {

        GA._sincronizandoListasFixas30Dias = false;
    }
}


// ============================================================
// RELATÓRIO DO HISTÓRICO DE 30+ DIAS (modal)
// ============================================================

GA._relatorio30DiasCache = null;

async function carregarRelatorio30DiasGA() {

    const { data, error } = await window.supabaseClient
        .from('full_historico_30_mais_dias')
        .select('*')
        .order('data_entrada', { ascending: false })
        .limit(500);

    if (error) throw error;

    GA._relatorio30DiasCache = data || [];
    return GA._relatorio30DiasCache;
}

function gaFormatarDuracaoDias(inicio, fim) {

    const ms = new Date(fim) - new Date(inicio);
    const dias = Math.floor(ms / (1000 * 60 * 60 * 24));

    if (dias < 1) return 'menos de 1 dia';
    if (dias === 1) return '1 dia';
    return `${dias} dias`;
}

function gaNomeMotivoSaida(motivo) {

    if (motivo === 'vendeu') return '✅ Voltou a vender';
    if (motivo === 'saiu_do_full') return '📤 Saiu do FULL';
    if (motivo === 'finalizado') return '⛔ Anúncio finalizado';
    if (motivo === 'sem_estoque_full') return '📭 Ficou sem estoque no FULL';
    return motivo || '-';
}

function renderizarLinhasRelatorio30DiasGA(registros) {

    const tbody = document.getElementById('ga30DiasTabelaBody');
    if (!tbody) return;

    if (!registros.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4" style="color:#6c757d;">
                    Nenhum registro ainda. A lista se preenche sozinha conforme os anúncios entram/saem dos 30+ dias sem vender.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = registros.map(r => {

        const aberto = !r.data_saida;
        const duracao = gaFormatarDuracaoDias(r.data_entrada, r.data_saida || new Date().toISOString());

        return `
            <tr>
                <td>
                    <strong>${esc(r.titulo || r.item_id)}</strong><br>
                    <small style="color:#6c757d;">${esc(r.sku || '-')} · ${esc(r.item_id)}${r.variation_id ? ' · var ' + esc(r.variation_id) : ''}</small>
                </td>
                <td>${new Date(r.data_entrada).toLocaleString('pt-BR')}</td>
                <td>${r.data_saida ? new Date(r.data_saida).toLocaleString('pt-BR') : '—'}</td>
                <td>${esc(duracao)}</td>
                <td>${aberto ? '<span class="badge badge-warning">⏳ Ainda parado</span>' : gaNomeMotivoSaida(r.motivo_saida)}</td>
                <td>${r.dias_parado_na_entrada != null ? esc(r.dias_parado_na_entrada) + ' dias' : '-'}</td>
            </tr>
        `;
    }).join('');
}

window.abrirRelatorio30DiasGA = async function () {

    let modal = document.getElementById('modalGA30Dias');

    if (!modal) {

        modal = document.createElement('div');
        modal.id = 'modalGA30Dias';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 1000px; max-height: 85vh; padding: 0;">
                <div style="background: linear-gradient(135deg, #dc3545, #f08a8a); color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0;"><i class="fas fa-history"></i> Relatório — Histórico de 30+ dias sem vender</h3>
                    <button onclick="document.getElementById('modalGA30Dias').classList.add('hidden')" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer;">&times;</button>
                </div>
                <div style="padding: 16px 20px; display:flex; justify-content: space-between; align-items:center; gap:10px; flex-wrap: wrap;">
                    <div id="ga30DiasResumo" style="font-size: 13px; color:#6c757d;"></div>
                    <button class="btn btn-sm btn-success" onclick="window.exportarRelatorio30DiasExcelGA()">
                        <i class="fas fa-file-excel"></i> Exportar
                    </button>
                </div>
                <div style="padding: 0 20px 20px; max-height: 60vh; overflow-y: auto;">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Anúncio</th>
                                <th>Entrou na lista</th>
                                <th>Saiu da lista</th>
                                <th>Tempo parado</th>
                                <th>Situação</th>
                                <th>Dias sem vender na entrada</th>
                            </tr>
                        </thead>
                        <tbody id="ga30DiasTabelaBody">
                            <tr><td colspan="6" class="text-center py-4"><span class="spinner"></span> Carregando...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    modal.classList.remove('hidden');

    try {

        const registros = await carregarRelatorio30DiasGA();

        const abertos = registros.filter(r => !r.data_saida).length;
        const fechados = registros.length - abertos;

        const resumo = document.getElementById('ga30DiasResumo');
        if (resumo) {
            resumo.textContent = `${registros.length} registro(s) · ${abertos} ainda parado(s) · ${fechados} já saíram da lista`;
        }

        renderizarLinhasRelatorio30DiasGA(registros);

    } catch (error) {
        console.error('Erro ao carregar relatório de 30+ dias:', error);
        const tbody = document.getElementById('ga30DiasTabelaBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4" style="color:#dc3545;">Erro ao carregar: ${esc(error.message)}</td></tr>`;
        }
    }
};

window.exportarRelatorio30DiasExcelGA = function () {

    const registros = GA._relatorio30DiasCache || [];

    if (!registros.length) {
        window.showToast?.('Nenhum registro pra exportar.', 'warning');
        return;
    }

    const linhas = registros.map(r => ({
        'Anúncio': r.titulo || r.item_id,
        'SKU': r.sku || '',
        'Item ID': r.item_id,
        'Variação': r.variation_id || '',
        'Entrou na lista': r.data_entrada,
        'Saiu da lista': r.data_saida || '',
        'Tempo parado': gaFormatarDuracaoDias(r.data_entrada, r.data_saida || new Date().toISOString()),
        'Situação': r.data_saida ? gaNomeMotivoSaida(r.motivo_saida) : 'Ainda parado',
        'Dias sem vender na entrada': r.dias_parado_na_entrada ?? ''
    }));

    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historico30Dias');
    XLSX.writeFile(wb, `historico_30_dias_full_${new Date().toISOString().slice(0, 10)}.xlsx`);
};


// ============================================================
// EXTRAVIOS NO FULL — RECONCILIAÇÃO AUTOMÁTICA
//
// Por SKU: quanto foi ENVIADO pro FULL há 15+ dias (nosso histórico
// interno, historico_baixas_full) vs quanto o PRÓPRIO Mercado Livre
// confirma ter RECEBIDO (API real, evento INBOUND_RECEPTION do
// endpoint /stock/fulfillment/operations/search — não é mais um
// cálculo indireto por estoque atual). Se o ML confirma menos do
// que enviamos, a diferença é o possível extravio — não importa o
// que aconteceu depois (venda, devolução etc), esse número já saiu
// do "o que deveria ter chegado e não chegou".
//
// Quando não achamos o inventory_id do SKU (anúncio pausado/
// removido, por exemplo), caímos no cálculo antigo por estoque
// atual - vendido, como aproximação.
// ============================================================

const GA_DIAS_MINIMO_EXTRAVIO = 15;

GA._extraviosCache = null;

function gaInventoryIdsPorSku(sku) {

    const alvo = String(sku || '').trim().toUpperCase();
    if (!alvo) return [];

    const ids = new Set();

    (GA.rows || []).forEach(row => {
        if (String(row?.sku || '').trim().toUpperCase() === alvo && row.inventoryId) {
            ids.add(String(row.inventoryId));
        }
    });

    return Array.from(ids);
}

// Casar por texto de SKU falha sempre que o campo SKU do anúncio no
// próprio Mercado Livre não é idêntico ao SKU interno (ex: produto
// com vários códigos MLB, só um com o SKU certinho preenchido lá).
// Muito mais confiável: usar o produto_id da baixa pra achar os
// códigos MLB cadastrados (dados_extra.mlb_codes) e procurar essas
// MLBs diretamente entre os itemId das linhas do Gerenciamento.
async function gaInventoryIdsPorProdutoId(produtoId, skuFallback) {

    const ids = new Set();

    let mlbCodes = null;

    if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque)) {
        const produto = produtosEstoque.find(p => String(p.id) === String(produtoId));
        if (produto?.dados_extra?.mlb_codes) {
            mlbCodes = produto.dados_extra.mlb_codes;
        }
    }

    if (!mlbCodes && produtoId && window.supabaseClient) {
        try {
            const { data } = await window.supabaseClient
                .from('produtos_estoque')
                .select('dados_extra')
                .eq('id', produtoId)
                .maybeSingle();
            mlbCodes = data?.dados_extra?.mlb_codes || null;
        } catch (error) {
            console.warn(`⚠️ Erro buscando mlb_codes do produto ${produtoId}:`, error);
        }
    }

    const listaMlb = (
        Array.isArray(mlbCodes)
            ? mlbCodes
            : (mlbCodes ? String(mlbCodes).split(',') : [])
    )
        .map(m => String(m).trim().toUpperCase())
        .filter(Boolean);

    // Limita a 1 inventory_id — produto com várias MLB cadastradas
    // (ex: reaproveitado em vários anúncios) multiplicaria as consultas
    // à API, que já tem cota apertada. Pega só a primeira ativa como
    // representante; é o suficiente pra sinalizar o extravio.
    for (const mlb of listaMlb) {
        const linha = (GA.rows || []).find(
            row => String(row?.itemId || '').toUpperCase() === mlb && row.inventoryId
        );
        if (linha) {
            ids.add(String(linha.inventoryId));
            break;
        }
    }

    if (!ids.size && skuFallback) {
        gaInventoryIdsPorSku(skuFallback).slice(0, 1).forEach(id => ids.add(id));
    }

    return Array.from(ids);
}

// Retorna { total, indisponivel }. indisponivel=true quer dizer que
// não deu pra confirmar (cota da API estourada, erro etc) — nesse
// caso o chamador NÃO deve tratar como "recebeu 0", senão gera falso
// positivo. O endpoint de operações do FULL tem uma cota bem
// apertada (erro visto na prática: "over_quota"), então aqui a
// tentativa é única (sem re-tentativa com espera longa) — melhor
// pular esse produto agora do que travar o relatório inteiro.
async function buscarRecebidoInboundFullGA(inventoryId, desdeMs) {

    const sellerId = await getSellerId();

    let totalRecebido = 0;
    let indisponivel = false;
    let cursorMs = desdeMs;
    const hojeMs = Date.now();
    const JANELA_MS = 59 * 24 * 60 * 60 * 1000; // limite da API é 60 dias por consulta

    while (cursorMs <= hojeMs) {

        const fimMs = Math.min(cursorMs + JANELA_MS, hojeMs);

        const dataFrom = new Date(cursorMs).toISOString().slice(0, 10);
        const dataTo = new Date(fimMs).toISOString().slice(0, 10);

        try {

            const resposta = await requisicaoOperacoesFull(
                `/stock/fulfillment/operations/search?seller_id=${sellerId}&inventory_id=${encodeURIComponent(inventoryId)}&date_from=${dataFrom}&date_to=${dataTo}&type=INBOUND_RECEPTION&limit=1000`,
                1
            );

            (resposta?.results || []).forEach(op => {
                const qtd = Number(op?.detail?.available_quantity ?? op?.result?.available_quantity) || 0;
                totalRecebido += qtd;
            });

        } catch (error) {

            console.warn(`⚠️ Erro consultando recebimentos FULL de ${inventoryId}:`, error);
            indisponivel = true;
        }

        await sleep(300);

        cursorMs = fimMs + (24 * 60 * 60 * 1000);
    }

    return { total: totalRecebido, indisponivel };
}

async function calcularExtraviosFullGA(onProgress) {

    const corteMs = Date.now() - (GA_DIAS_MINIMO_EXTRAVIO * 24 * 60 * 60 * 1000);

    // 1) QUANTO FOI ENVIADO (só remessas com 15+ dias)
    const { data: historicoBaixas, error: erroBaixas } = await window.supabaseClient
        .from('historico_baixas_full')
        .select('dados');

    if (erroBaixas) throw erroBaixas;

    // Agrupado por produto_id (não por texto de SKU) — o produto_id é
    // o identificador estável do nosso cadastro; o texto do SKU pode
    // divergir do que está de fato preenchido no anúncio do ML.
    const enviadoPorProduto = new Map();

    (historicoBaixas || []).forEach(linha => {

        const reg = linha.dados;
        if (!reg || !Array.isArray(reg.baixados)) return;

        const dataEnvioMs = new Date(reg.criadoEm || reg.atualizadoEm || 0).getTime();
        if (!dataEnvioMs || dataEnvioMs > corteMs) return;

        reg.baixados.forEach(item => {

            const produtoId = item.produtoId != null ? String(item.produtoId) : null;
            const sku = String(item.sku || '').trim().toUpperCase();
            const chave = produtoId || sku;
            if (!chave) return;

            const atual = enviadoPorProduto.get(chave) || {
                produtoId,
                sku,
                quantidade: 0,
                nome: item.nome,
                maisAntigoMs: dataEnvioMs
            };
            atual.quantidade += Number(item.quantidade) || 0;
            atual.maisAntigoMs = Math.min(atual.maisAntigoMs, dataEnvioMs);
            if (!atual.nome) atual.nome = item.nome;

            enviadoPorProduto.set(chave, atual);
        });
    });

    if (!enviadoPorProduto.size) return [];

    // 2) FALLBACK: QUANTO FOI VENDIDO E QUANTO ESTÁ NO FULL AGORA
    // (só usado pra produtos sem inventory_id resolvido)
    const skusRelevantes = new Set(
        Array.from(enviadoPorProduto.values())
            .map(info => info.sku)
            .filter(Boolean)
    );

    const vendidoPorSku = new Map();
    const tamanhoPagina = 1000;
    let inicio = 0;
    let continuar = true;

    while (continuar) {

        const { data, error } = await window.supabaseClient
            .from('vendas_nfe_cache')
            .select('cancelada:venda_json->venda_cancelada, itens:venda_json->order_items')
            .eq('venda_json->>is_full', 'true')
            .range(inicio, inicio + tamanhoPagina - 1);

        if (error) throw error;

        const lote = data || [];

        lote.forEach(linha => {

            if (linha.cancelada) return;

            const itens = Array.isArray(linha.itens) ? linha.itens : [];

            itens.forEach(item => {

                const sku = String(item?.item?.seller_sku || '').trim().toUpperCase();
                if (!sku || !skusRelevantes.has(sku)) return;

                const qtd = Number(item?.quantity) || 1;
                vendidoPorSku.set(sku, (vendidoPorSku.get(sku) || 0) + qtd);
            });
        });

        if (lote.length < tamanhoPagina) continuar = false;
        else inicio += tamanhoPagina;
    }

    const fullAtualPorSku = new Map();

    (GA.rows || []).forEach(row => {

        const sku = String(row?.sku || '').trim().toUpperCase();
        if (!sku) return;

        const atual = Number(row.full) || 0;
        fullAtualPorSku.set(sku, (fullAtualPorSku.get(sku) || 0) + atual);
    });

    // 3) MONTAR RESULTADO — pra cada produto, tenta a fonte real (API
    // do ML) e só cai no cálculo indireto se não achar inventory_id.
    const resultado = [];
    const listaProdutos = Array.from(enviadoPorProduto.values());
    let processados = 0;

    for (const info of listaProdutos) {

        processados++;
        if (typeof onProgress === 'function') {
            onProgress(processados, listaProdutos.length);
        }

        const sku = info.sku || info.produtoId;
        const inventoryIds = await gaInventoryIdsPorProdutoId(info.produtoId, info.sku);

        if (inventoryIds.length) {

            let recebidoConfirmado = 0;
            let indisponivelEmAlgum = false;

            for (const inventoryId of inventoryIds) {
                const resposta = await buscarRecebidoInboundFullGA(inventoryId, info.maisAntigoMs);
                recebidoConfirmado += resposta.total;
                if (resposta.indisponivel) indisponivelEmAlgum = true;
            }

            // Se a API não respondeu direito (cota estourada etc), não
            // dá pra confirmar nada — melhor pular do que arriscar um
            // falso positivo achando que "recebido = 0".
            if (indisponivelEmAlgum) {
                resultado.push({
                    sku,
                    nome: info.nome || sku,
                    enviado: info.quantidade,
                    fonte: '⚠️ não verificado (cota da API do ML esgotada agora — tente de novo mais tarde)',
                    diferenca: null,
                    remessaMaisAntigaEm: new Date(info.maisAntigoMs).toISOString()
                });
                continue;
            }

            const diferenca = info.quantidade - recebidoConfirmado;

            if (diferenca > 0) {
                resultado.push({
                    sku,
                    nome: info.nome || sku,
                    enviado: info.quantidade,
                    recebidoConfirmadoML: recebidoConfirmado,
                    fonte: 'API do Mercado Livre (recebimento confirmado)',
                    diferenca,
                    remessaMaisAntigaEm: new Date(info.maisAntigoMs).toISOString()
                });
            }

        } else {

            // Fallback: não achou inventory_id (nenhuma MLB cadastrada
            // pra esse produto está ativa no Full agora) — usa o
            // cálculo indireto por estoque atual - vendido.
            const vendido = vendidoPorSku.get(info.sku) || 0;
            const estoqueAtual = fullAtualPorSku.get(info.sku) || 0;
            const esperado = info.quantidade - vendido;
            const diferenca = esperado - estoqueAtual;

            if (diferenca > 0) {
                resultado.push({
                    sku,
                    nome: info.nome || sku,
                    enviado: info.quantidade,
                    vendidoFull: vendido,
                    estoqueFullAtual: estoqueAtual,
                    fonte: 'estimativa (nenhuma MLB desse produto está ativa no Full agora)',
                    diferenca,
                    remessaMaisAntigaEm: new Date(info.maisAntigoMs).toISOString()
                });
            }
        }
    }

    resultado.sort((a, b) => (b.diferenca ?? -1) - (a.diferenca ?? -1));

    GA._extraviosCache = resultado;
    return resultado;
}

window.abrirExtraviosFullGA = async function () {

    if (!Array.isArray(GA.rows) || !GA.rows.length) {
        window.showToast?.('⚠️ Sincronize o Full - Gerenciamento antes de verificar extravios.', 'warning');
        return;
    }

    let modal = document.getElementById('modalGAExtravios');

    if (!modal) {

        modal = document.createElement('div');
        modal.id = 'modalGAExtravios';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 1000px; max-height: 85vh; padding: 0;">
                <div style="background: linear-gradient(135deg, #dc3545, #f08a8a); color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0;"><i class="fas fa-box-open"></i> Possíveis extravios no FULL</h3>
                    <button onclick="document.getElementById('modalGAExtravios').classList.add('hidden')" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer;">&times;</button>
                </div>
                <div style="padding: 14px 20px; display:flex; justify-content: space-between; align-items:center; gap:10px; flex-wrap: wrap;">
                    <div style="font-size: 12px; color:#6c757d;">
                        Compara o que foi enviado pro FULL há ${GA_DIAS_MINIMO_EXTRAVIO}+ dias com o que o Mercado Livre confirma ter recebido (direto da API deles). Quando não dá pra confirmar pela API, cai numa estimativa por estoque atual - vendido (marcado na coluna Fonte).
                    </div>
                    <button class="btn btn-sm btn-success" onclick="window.exportarExtraviosFullExcelGA()">
                        <i class="fas fa-file-excel"></i> Exportar
                    </button>
                </div>
                <div style="padding: 0 20px 20px; max-height: 60vh; overflow-y: auto;">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Produto</th>
                                <th>Enviado (15+ dias)</th>
                                <th>Recebido / Vendido</th>
                                <th>Diferença (possível extravio)</th>
                                <th>Fonte</th>
                                <th>Remessa mais antiga considerada</th>
                            </tr>
                        </thead>
                        <tbody id="gaExtraviosTabelaBody">
                            <tr><td colspan="6" class="text-center py-4"><span class="spinner"></span> Calculando (consulta a API real do ML, pode demorar um pouco)...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    modal.classList.remove('hidden');

    const tbody = document.getElementById('gaExtraviosTabelaBody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4"><span class="spinner"></span> Calculando...</td></tr>`;
    }

    try {

        const resultado = await calcularExtraviosFullGA((atual, total) => {
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4"><span class="spinner"></span> Verificando ${atual}/${total} produtos na API do ML...</td></tr>`;
            }
        });

        if (!resultado.length) {
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4" style="color:#28a745;"><i class="fas fa-check-circle"></i> Nenhuma diferença encontrada — tudo bateu.</td></tr>`;
            }
            return;
        }

        if (tbody) {
            tbody.innerHTML = resultado.map(r => {

                let recebidoVendidoHtml = '—';
                if (r.recebidoConfirmadoML !== undefined) {
                    recebidoVendidoHtml = `${esc(r.recebidoConfirmadoML)} recebido(s) confirmado(s)`;
                } else if (r.vendidoFull !== undefined) {
                    recebidoVendidoHtml = `${esc(r.vendidoFull)} vendido(s) · ${esc(r.estoqueFullAtual)} em estoque agora`;
                }

                const diferencaHtml = r.diferenca === null
                    ? '<span style="color:#6c757d;">—</span>'
                    : `<strong style="color:#dc3545;">${esc(r.diferenca)}</strong>`;

                return `
                    <tr>
                        <td><strong>${esc(r.nome)}</strong><br><small style="color:#6c757d;">${esc(r.sku)}</small></td>
                        <td>${esc(r.enviado)}</td>
                        <td>${recebidoVendidoHtml}</td>
                        <td>${diferencaHtml}</td>
                        <td><small>${esc(r.fonte)}</small></td>
                        <td>${new Date(r.remessaMaisAntigaEm).toLocaleDateString('pt-BR')}</td>
                    </tr>
                `;
            }).join('');
        }

    } catch (error) {
        console.error('Erro ao calcular extravios no FULL:', error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4" style="color:#dc3545;">Erro ao calcular: ${esc(error.message)}</td></tr>`;
        }
    }
};

window.exportarExtraviosFullExcelGA = function () {

    const resultado = GA._extraviosCache || [];

    if (!resultado.length) {
        window.showToast?.('Nenhum extravio pra exportar.', 'warning');
        return;
    }

    const linhas = resultado.map(r => ({
        'SKU': r.sku,
        'Produto': r.nome,
        'Enviado (15+ dias)': r.enviado,
        'Recebido confirmado (API ML)': r.recebidoConfirmadoML ?? '',
        'Vendido no FULL (estimativa)': r.vendidoFull ?? '',
        'Estoque FULL atual (estimativa)': r.estoqueFullAtual ?? '',
        'Diferença (possível extravio)': r.diferenca,
        'Fonte': r.fonte,
        'Remessa mais antiga considerada': r.remessaMaisAntigaEm
    }));

    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ExtraviosFull');
    XLSX.writeFile(wb, `extravios_full_${new Date().toISOString().slice(0, 10)}.xlsx`);
};


// ============================================================
// DEPÓSITO PRECISA SER ZERADO — ITEM PARADO HÁ 30+ DIAS
//
// Objetivo do time: item que passou 30 dias sem vender deve ser
// vendido só pelo FULL, sem estoque parado no depósito (fora do
// FULL). Qualquer quantidade > 0 no depósito nessa situação é
// alerta — MAS só faz sentido se o FULL realmente tem estoque pra
// assumir a venda. Se o FULL está zerado, não tem pra onde migrar:
// o depósito é a única fonte de venda e precisa continuar ativo.
// ============================================================

function gaPrecisaZerarDepositoPorInatividade(
    row
) {

    if (
        !gaMaisDe30DiasSemVender(
            row
        )
    ) {

        return false;
    }


    const estoqueFull =
        Number(
            row?.full
        );


    if (
        !Number.isFinite(
            estoqueFull
        ) ||
        estoqueFull <= 0
    ) {

        return false;
    }


    if (
        row?.warehouse === null ||
        row?.warehouse === undefined
    ) {

        return false;
    }


    const depositoML =
        Number(
            row.warehouse
        );


    if (
        !Number.isFinite(
            depositoML
        )
    ) {

        return false;
    }


    return (
        depositoML > 0
    );
}


// ============================================================
// SELO "ATIVO NO FULL" DA COLUNA FULL
//
// Mostra puramente se o anúncio está OFERECENDO envio FULL ou não
// (item.shipping.logistic_type === 'fulfillment' — isFull() em
// buildRows), sem misturar com quantidade de estoque. Só não
// mostra nada quando o status ainda não foi verificado de verdade
// (row.ativoNoFull null/undefined — ex.: linha vinda do banco
// antes desta coluna existir, ainda sem um sync novo confirmando).
// ============================================================

function gaRenderBadgeStatusFullGA(
    row
) {

    if (
        row.ativoNoFull === undefined ||
        row.ativoNoFull === null
    ) {

        return `
            <div style="font-size:10px; font-weight:700; color:#adb5bd; margin-top:2px;">
                <i class="fas fa-circle-notch fa-spin"></i> Verificando...
            </div>
        `;
    }


    if (
        row.ativoNoFull === false
    ) {

        return `
            <div style="font-size:10px; font-weight:700; color:#dc3545; margin-top:2px;">
                <i class="fas fa-times-circle"></i> Não oferece FULL
            </div>
        `;
    }


    // ========================================================
    // MARCADO COMO "OFERECE FULL", MAS SEM ESTOQUE REAL
    //
    // Nenhuma variação (ou o item, quando não tem variação) tem
    // unidade de verdade no FULL — dado desatualizado ou o FULL
    // esvaziou. Ver aplicarAlertasPorVariacaoGA().
    // ========================================================

    if (
        row._fullAtivoSemEstoqueReal
    ) {

        // Zerado mas ainda ativo no FULL: manda pra tela de gestão
        // de espaço do Fulfillment (é lá que se resolve isso), não
        // pra edição normal do anúncio.
        const url =
            'https://vendedores.mercadolivre.com.br/anuncios/lista/space_management';

        return `
            <div style="font-size:10px; font-weight:700; color:#fd7e14; margin-top:2px;">
                <i class="fas fa-exclamation-triangle"></i> Oferece FULL sem estoque
            </div>

            <div class="ga-acoes-correcao-estoque">

                <a
                    href="${esc(url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="ga-link-corrigir-estoque"
                    style="color:#fd7e14;"
                >

                    <i class="fas fa-boxes-stacked"></i>

                    Gerenciar no Full

                </a>


                <button
                    type="button"
                    class="ga-btn-corrigido-estoque"
                    onclick="verificarCorrecaoFullSemEstoqueAnuncio(
                        '${esc(row.itemId)}',
                        this
                    )"
                >

                    <i class="fas fa-check"></i>

                    Corrigido

                </button>

            </div>
        `;
    }


    return `
        <div style="font-size:10px; font-weight:700; color:#198754; margin-top:2px;">
            <i class="fas fa-check-circle"></i> Oferece envio FULL
        </div>
    `;
}

// Monta um resumo (para hover) das localizações de estoque que o
// Mercado Livre retornou para este anúncio, e quando foi a última
// sincronização — ajuda a diagnosticar um número de depósito que
// parece errado sem precisar abrir o console do navegador.
function gaTituloDetalheEstoqueDeposito(
    row
) {

    const partes =
        [];

    if (
        row.ultimaSincronizacao
    ) {

        try {

            partes.push(
                'Sincronizado em: ' +
                new Date(row.ultimaSincronizacao)
                    .toLocaleString('pt-BR')
            );

        } catch (erro) {}
    }

    if (
        Array.isArray(row.stockLocations) &&
        row.stockLocations.length
    ) {

        row.stockLocations.forEach(
            local => {

                partes.push(
                    `${local?.type || '?'}: ${Number(local?.quantity) || 0} un.`
                );
            }
        );

    } else {

        partes.push(
            'Sem detalhe de localizações salvo — sincronize este anúncio individualmente para atualizar.'
        );
    }

    return partes.join('\n');
}


function gaRenderEstoqueDeposito(
    row
) {

    const estoqueDeposito =
        row.warehouse !== null &&
        row.warehouse !== undefined

            ? Number(
                row.warehouse
            )

            : null;


    // =========================================================
    // AINDA NÃO CONSULTADO
    // =========================================================

    if (
        estoqueDeposito === null
    ) {

        return `

            <td
                data-coluna-ga="deposito"
                style="
                    text-align:center;
                "
            >

                <span
                    style="
                        color:#adb5bd;
                        font-size:18px;
                    "
                >
                    —
                </span>

            </td>
        `;
    }


    const precisaCorrigir =
        gaPrecisaCorrigirEstoqueDeposito(
            row
        );


    // =========================================================
    // ITEM PARADO HÁ 30+ DIAS COM DEPÓSITO NÃO ZERADO
    //
    // Prioridade máxima: pra item parado, o objetivo é vender só
    // pelo FULL — nenhum estoque deveria ficar segurado fora dele.
    // =========================================================

    if (
        gaPrecisaZerarDepositoPorInatividade(
            row
        )
    ) {

        const urlInatividade =
            gaUrlModificarAnuncio(
                row.itemId
            );

        return `

            <td
                data-coluna-ga="deposito"
                class="ga-deposito-zerar-inatividade"
                style="
                    text-align:center;
                "
            >

                <strong
                    style="
                        font-size:20px;
                        color:#6f1d91;
                    "
                    title="${esc(gaTituloDetalheEstoqueDeposito(row))}"
                >
                    ${esc(estoqueDeposito)}
                </strong>


                <div class="ga-alerta-estoque" style="color:#6f1d91;">

                    <i class="fas fa-exclamation-triangle"></i>

                    Item parado há 30+ dias

                    <br>

                    Zerar depósito, vender só pelo FULL

                </div>


                <div class="ga-acoes-correcao-estoque">

                    <a
                        href="${esc(urlInatividade)}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="ga-link-corrigir-estoque"
                        style="color:#6f1d91;"
                    >

                        <i class="fas fa-edit"></i>

                        Modificar anúncio

                    </a>


                    <button
                        type="button"
                        class="ga-btn-corrigido-estoque"
                        onclick="verificarCorrecaoDepositoInatividadeAnuncio(
                            '${esc(row.itemId)}',
                            '${esc(row.variationId || '')}',
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


    // =========================================================
    // ATIVO NO FULL COM ESTOQUE SOBRANDO NO DEPÓSITO
    // =========================================================

    if (
        gaPrecisaAjustarQuantidadeExposicao(
            row
        )
    ) {

        const urlAjuste =
            gaUrlModificarAnuncio(
                row.itemId
            );

        return `

            <td
                data-coluna-ga="deposito"
                class="ga-full-excesso-deposito"
                style="
                    text-align:center;
                "
            >

                <strong
                    style="
                        font-size:20px;
                        color:#fd7e14;
                    "
                    title="${esc(gaTituloDetalheEstoqueDeposito(row))}"
                >
                    ${esc(estoqueDeposito)}
                </strong>


                <div class="ga-alerta-estoque" style="color:#fd7e14;">

                    <i class="fas fa-exclamation-triangle"></i>

                    Ativo no FULL com estoque parado

                    <br>

                    Ajustar quantidade/exposição

                </div>


                <div class="ga-acoes-correcao-estoque">

                    <a
                        href="${esc(urlAjuste)}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="ga-link-corrigir-estoque"
                        style="color:#fd7e14;"
                    >

                        <i class="fas fa-edit"></i>

                        Modificar anúncio

                    </a>


                    <button
                        type="button"
                        class="ga-btn-corrigido-estoque"
                        onclick="verificarCorrecaoQuantidadeExposicaoAnuncio(
                            '${esc(row.itemId)}',
                            '${esc(row.variationId || '')}',
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


    // =========================================================
    // ESTÁ NORMAL
    // =========================================================

    if (
        !precisaCorrigir
    ) {

        return `

            <td
                data-coluna-ga="deposito"
                style="
                    text-align:center;
                "
            >

                <strong
                    style="
                        font-size:18px;
                        color:${
                            estoqueDeposito > 0
                                ? '#198754'
                                : '#dc3545'
                        };
                        cursor:help;
                        border-bottom:1px dotted #adb5bd;
                    "
                    title="${esc(gaTituloDetalheEstoqueDeposito(row))}"
                >
                    ${esc(
                        estoqueDeposito
                    )}
                </strong>

            </td>
        `;
    }


    // =========================================================
    // DEPÓSITO ZERO MAS TEM ESTOQUE INTERNO
    // =========================================================

    const url =
        gaUrlModificarAnuncio(
            row.itemId
        );


    return `

        <td
            data-coluna-ga="deposito"
            class="ga-estoque-precisa-corrigir"
            style="
                text-align:center;
            "
        >

            <strong
                style="
                    font-size:20px;
                    color:#dc3545;
                "
            >
                0
            </strong>


            <div class="ga-alerta-estoque">

                <i class="fas fa-exclamation-triangle"></i>

                Tem estoque disponível

                <br>

                Colocar 1 no anúncio

            </div>


            <div class="ga-acoes-correcao-estoque">

                <a
                    href="${esc(url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="ga-link-corrigir-estoque"
                >

                    <i class="fas fa-edit"></i>

                    Modificar anúncio

                </a>


                <button
                    type="button"
                    class="ga-btn-corrigido-estoque"
                    onclick="verificarCorrecaoEstoqueAnuncio(
                        '${esc(row.itemId)}',
                        '${esc(row.variationId || '')}',
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


    async function loadAll(
    force = false
) {

    // =========================================================
    // EVITAR DUAS SINCRONIZAÇÕES AO MESMO TEMPO
    // =========================================================

    if (GA.loading) {

        console.log(
            '⚠️ Gerenciamento de anúncios já está sendo atualizado.'
        );

        return;
    }


    GA.loading =
        true;


    // =========================================================
    // BOTÃO SINCRONIZAR
    // =========================================================

    const refresh =
        document.getElementById(
            'gaRefresh'
        );


    const refreshHtmlOriginal =
        refresh?.innerHTML ||
        null;


    if (refresh) {

        refresh.disabled =
            true;


        refresh.innerHTML = `

            <i class="fas fa-spinner fa-spin"></i>

            Atualizando...
        `;
    }


    // =========================================================
    // PRESERVAR O QUE JÁ ESTÁ NA TELA
    //
    // Isso é fundamental porque:
    //
    // - estoque pode dar 429;
    // - vendas podem demorar;
    // - alguma consulta pode falhar;
    //
    // Nunca queremos apagar o último dado válido.
    // =========================================================

    let linhasSalvasAntes =
        Array.isArray(
            GA.rows
        )
            ? [...GA.rows]
            : [];


    try {

        console.log(
            '🔄 Iniciando sincronização do Gerenciamento de Anúncios...'
        );


        // =====================================================
        // 1. CARREGAR DADOS SALVOS DO SUPABASE
        //
        // Só fazemos isso se ainda não existir nada em memória.
        // =====================================================

        if (
            linhasSalvasAntes.length === 0 &&
            typeof carregarAnunciosBanco ===
                'function'
        ) {

            try {

                progress(
                    'Carregando dados já salvos...'
                );


                const linhasBanco =
                    await carregarAnunciosBanco();


                if (
                    Array.isArray(
                        linhasBanco
                    ) &&
                    linhasBanco.length > 0
                ) {

                    linhasSalvasAntes =
                        [...linhasBanco];


                    console.log(
                        `💾 ${linhasSalvasAntes.length} registro(s) recuperado(s) do banco.`
                    );
                }

            } catch (error) {

                console.warn(
                    '⚠️ Não foi possível carregar os anúncios salvos:',
                    error
                );
            }
        }


        // =====================================================
        // 2. LIMPAR CACHES SE FOR SINCRONIZAÇÃO FORÇADA
        //
        // NÃO limpar GA.rows.
        // NÃO apagar banco.
        // =====================================================

        if (force) {

            console.log(
                '🔄 Sincronização completa solicitada.'
            );


            GA.token =
                null;


            GA.sellerId =
                null;


            if (
                GA.fullCache?.clear
            ) {

                GA.fullCache.clear();
            }


            if (
                GA.userProductStockCache?.clear
            ) {

                GA.userProductStockCache.clear();
            }


            if (
                GA.userProductStockPromises?.clear
            ) {

                GA.userProductStockPromises.clear();
            }


            if (
                GA.inventoryStockCache?.clear
            ) {

                GA.inventoryStockCache.clear();
            }


            if (
                GA.fullDetailCache?.clear
            ) {

                GA.fullDetailCache.clear();
            }


            if (
                GA.listingTypeNames?.clear
            ) {

                GA.listingTypeNames.clear();
            }


            if (
                GA.exposureNames?.clear
            ) {

                GA.exposureNames.clear();
            }


            if (
                GA.exposureByListingType?.clear
            ) {

                GA.exposureByListingType.clear();
            }
        }


        // =====================================================
        // 3. CARREGAR ESTOQUE INTERNO
        //
        // IMPORTANTE:
        //
        // Ele NÃO é exibido como coluna.
        //
        // É usado somente para verificar:
        //
        // Depósito ML = 0
        // +
        // Estoque interno > 0
        //
        // => precisa colocar 1 no anúncio.
        // =====================================================

        progress(
            'Carregando estoque interno para validação...'
        );


        try {

            await loadInternalStock();

        } catch (error) {

            console.warn(
                '⚠️ Não foi possível carregar estoque interno:',
                error
            );
        }


        // =====================================================
        // 4. VALIDAR CONTA / SELLER ID
        // =====================================================

        progress(
            'Validando conta Mercado Livre...'
        );


        await getSellerId();


        // =====================================================
        // 5. LOCALIZAR TODOS OS ANÚNCIOS DA CONTA
        // =====================================================

        progress(
            'Localizando anúncios do Mercado Livre...'
        );


        const ids =
            await scanAllIds();


        if (
            !Array.isArray(
                ids
            ) ||
            ids.length === 0
        ) {

            throw new Error(
                'Nenhum anúncio encontrado na conta do Mercado Livre.'
            );
        }


        console.log(
            `✅ ${ids.length} anúncio(s) localizado(s).`
        );


        // =====================================================
        // 6. BUSCAR DETALHES
        // =====================================================

        progress(
            `Buscando detalhes de ${ids.length} anúncios...`
        );


        const items =
            await getAllItems(
                ids
            );


        if (
            !Array.isArray(
                items
            )
        ) {

            throw new Error(
                'Resposta inválida ao buscar os anúncios.'
            );
        }


        console.log(
            `📦 ${items.length} anúncio(s) detalhado(s) recebido(s).`
        );


        // =====================================================
        // 7. CRIAR LINHAS
        //
        // buildRows() deve retornar apenas os anúncios que
        // realmente atendem à regra atual da tela.
        // =====================================================

        progress(
            'Preparando anúncios e variações...'
        );


        const novasLinhas =
            buildRows(
                items
            );


        if (
            !Array.isArray(
                novasLinhas
            )
        ) {

            throw new Error(
                'Não foi possível montar as linhas dos anúncios.'
            );
        }


        const quantidadeAnuncios =
            new Set(
                novasLinhas
                    .map(
                        row =>
                            row.itemId
                    )
                    .filter(Boolean)
            ).size;


        console.log(
            `📋 ${novasLinhas.length} produto(s)/variação(ões) encontrados em ${quantidadeAnuncios} anúncio(s).`
        );


        // =====================================================
        // 8. MESCLAR COM OS ÚLTIMOS DADOS SALVOS
        //
        // Ex.:
        //
        // - estoque anterior;
        // - vendas 30d;
        // - última venda;
        // - dias sem vender.
        //
        // Tudo permanece até uma informação nova substituir.
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

            GA.rows =
                novasLinhas;
        }


        // =====================================================
        // GARANTIA EXTRA:
        // PRESERVAR MÉTRICAS DE VENDAS
        //
        // Isso protege caso sua função
        // mesclarLinhasComDadosSalvos ainda não tenha sido
        // atualizada para os campos novos.
        // =====================================================

        if (
            linhasSalvasAntes.length > 0
        ) {

            const anterioresPorChave =
                new Map();


            for (
                const antiga
                of linhasSalvasAntes
            ) {

                const chave =
                    String(
                        antiga.key ||
                        `${antiga.itemId}:${antiga.variationId || '0'}`
                    );


                anterioresPorChave.set(
                    chave,
                    antiga
                );
            }


            for (
                const row
                of GA.rows
            ) {

                const chave =
                    String(
                        row.key ||
                        `${row.itemId}:${row.variationId || '0'}`
                    );


                const antiga =
                    anterioresPorChave.get(
                        chave
                    );


                if (!antiga) {

                    continue;
                }


                // =============================================
                // ESTOQUE ML ANTERIOR
                // =============================================

                if (
                    row.warehouse === null ||
                    row.warehouse === undefined
                ) {

                    row.warehouse =
                        antiga.warehouse ??
                        null;
                }


                if (
                    row.full === null ||
                    row.full === undefined
                ) {

                    row.full =
                        antiga.full ??
                        null;
                }


                if (
                    row.mlTotal === null ||
                    row.mlTotal === undefined
                ) {

                    row.mlTotal =
                        antiga.mlTotal ??
                        null;
                }


                // =============================================
                // VENDAS
                // =============================================

                if (
                    row.vendasFull30d === null ||
                    row.vendasFull30d === undefined
                ) {

                    row.vendasFull30d =
                        antiga.vendasFull30d ??
                        null;
                }


                if (
                    !row.ultimaVendaFull
                ) {

                    row.ultimaVendaFull =
                        antiga.ultimaVendaFull ||
                        null;
                }


                if (
                    row.diasSemVender === null ||
                    row.diasSemVender === undefined
                ) {

                    row.diasSemVender =
                        antiga.diasSemVender ??
                        null;
                }


                if (
                    !row.vendasFullAtualizadoEm
                ) {

                    row.vendasFullAtualizadoEm =
                        antiga.vendasFullAtualizadoEm ||
                        null;
                }
            }
        }


        // =====================================================
        // 9. CALCULAR ESTOQUE INTERNO DAS LINHAS
        //
        // Isso NÃO aparece na tabela.
        //
        // Serve apenas para:
        //
        // gaPrecisaCorrigirEstoqueDeposito(row)
        // =====================================================

        if (
            typeof atualizarEstoqueInternoGerenciamento ===
            'function'
        ) {

            atualizarEstoqueInternoGerenciamento(
                GA.rows
            );

        } else {

            // Fallback caso ainda não tenha criado a função.

            for (
                const row
                of GA.rows
            ) {

                try {

                    row.internalWarehouse =
                        warehouseStock(
                            row.sku,
                            row.itemId
                        );

                } catch (error) {

                    row.internalWarehouse =
                        null;
                }
            }
        }


        // =====================================================
        // 10. MOSTRAR TABELA IMEDIATAMENTE
        //
        // Assim o usuário não precisa esperar estoque e vendas
        // para começar a visualizar os produtos.
        // =====================================================

        GA.page =
            1;


        updateSummary();


        applyFilters(
            true
        );


        // =====================================================
        // 11. SALVAR DADOS BÁSICOS
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
                    GA.rows,
                    false
                );
            }

        } catch (error) {

            console.warn(
                '⚠️ Não foi possível salvar os dados básicos:',
                error
            );
        }


        // =====================================================
        // 12. ATUALIZAR TIPO DO ANÚNCIO
        //
        // Premium / Clássico.
        //
        // A exposição não é mais necessária visualmente.
        // =====================================================

        progress(
            'Atualizando tipo dos anúncios...'
        );


        try {

            if (
                typeof loadExposure ===
                'function'
            ) {

                await loadExposure(
                    GA.rows
                );
            }


            // Atualiza imediatamente a regra:
            //
            // 30+ dias sem vender
            // +
            // Clássico
            // =
            // piscar para alterar Premium

            applyFilters(
                false
            );


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
                '⚠️ Não foi possível atualizar todos os tipos dos anúncios:',
                error
            );
        }


        // =====================================================
        // 13. CONSULTAR ESTOQUE REAL DO MERCADO LIVRE
        //
        // Aqui serão atualizados:
        //
        // row.warehouse -> Depósito
        // row.full      -> FULL
        // =====================================================

        progress(
            `Consultando estoque de ${GA.rows.length} produto(s)...`
        );


        try {

            await loadFullStocks(
                GA.rows
            );


            // =============================================
            // IMPORTANTE
            //
            // Agora que temos o estoque real do ML,
            // renderizar novamente para que a regra:
            //
            // depósito = 0
            // +
            // estoque interno > 0
            //
            // apareça imediatamente.
            // =============================================

            updateSummary();


            applyFilters(
                false
            );

        } catch (error) {

            console.error(
                '⚠️ A consulta de estoque não foi concluída completamente:',
                error
            );


            window.showToast?.(
                'Alguns estoques não puderam ser atualizados. Os últimos valores salvos foram mantidos.',
                'warning'
            );
        }


        // =====================================================
        // 14. VENDAS FULL
        //
        // Atualiza:
        //
        // - vendasFull30d
        // - ultimaVendaFull
        // - diasSemVender
        // - vendasFullAtualizadoEm
        //
        // Essa é normalmente a parte mais demorada.
        // =====================================================

        progress(
            'Analisando vendas FULL e última venda...'
        );


        try {

            if (
                typeof atualizarMetricasVendasFull ===
                'function'
            ) {

                await atualizarMetricasVendasFull(
                    GA.rows
                );


                // =========================================
                // Atualizar regras que dependem de vendas
                //
                // Ex. 30+ dias + Clássico.
                // =========================================

                applyFilters(
                    false
                );

            } else {

                console.warn(
                    '⚠️ atualizarMetricasVendasFull() não foi encontrada.'
                );
            }

        } catch (error) {

            console.error(
                '⚠️ Não foi possível concluir a análise de vendas FULL:',
                error
            );


            window.showToast?.(
                'Algumas informações de vendas não puderam ser atualizadas. Os dados anteriores foram mantidos.',
                'warning'
            );
        }


        // =====================================================
        // 15. RECALCULAR ESTOQUE INTERNO
        //
        // Normalmente não mudou durante esta sincronização,
        // mas garantimos que as regras de depósito utilizem
        // os SKUs atuais.
        // =====================================================

        if (
            typeof atualizarEstoqueInternoGerenciamento ===
            'function'
        ) {

            atualizarEstoqueInternoGerenciamento(
                GA.rows
            );
        }


        // =====================================================
        // 16. SALVAR RESULTADO FINAL
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
                    GA.rows,
                    false
                );
            }

        } catch (error) {

            console.error(
                '❌ Erro ao salvar resultado final:',
                error
            );
        }


        // =====================================================
        // 17. REMOVER REGISTROS ANTIGOS/OBSOLETOS
        //
        // Somente se essa função já existir no seu arquivo.
        // =====================================================

        try {

            if (
                typeof removerAnunciosObsoletos ===
                'function'
            ) {

                await removerAnunciosObsoletos(
                    GA.rows
                );
            }

        } catch (error) {

            console.warn(
                '⚠️ Não foi possível remover registros obsoletos:',
                error
            );
        }


        // =====================================================
        // 18. RENDER FINAL
        // =====================================================

        updateSummary();


        // Não forçar página 1 aqui.
        // Assim um usuário que esteja usando algum filtro
        // não perde a posição sem necessidade.

        applyFilters(
            false
        );


        // =====================================================
        // 19. ESTATÍSTICAS
        // =====================================================

        const anuncios =
            new Set(
                GA.rows
                    .map(
                        row =>
                            row.itemId
                    )
                    .filter(Boolean)
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


        const comInventory =
            GA.rows.filter(
                row =>
                    !!row.inventoryId
            ).length;


        const estoqueAtualizado =
            GA.rows.filter(
                row =>
                    row.warehouse !== null &&
                    row.warehouse !== undefined
            ).length;


        const estoqueFullAtualizado =
            GA.rows.filter(
                row =>
                    row.full !== null &&
                    row.full !== undefined
            ).length;


        const vendasAtualizadas =
            GA.rows.filter(
                row =>
                    row.vendasFull30d !== null &&
                    row.vendasFull30d !== undefined
            ).length;


        // =====================================================
        // ALERTAS PREMIUM
        // =====================================================

        const precisaPremium =
            typeof gaPrecisaCorrigirTipo ===
                'function'

                ? GA.rows.filter(
                    row =>
                        gaPrecisaCorrigirTipo(
                            row
                        )
                ).length

                : 0;


        // =====================================================
        // ALERTAS DE ESTOQUE DEPÓSITO
        // =====================================================

        const precisaEstoque =
            typeof gaPrecisaCorrigirEstoqueDeposito ===
                'function'

                ? GA.rows.filter(
                    row =>
                        gaPrecisaCorrigirEstoqueDeposito(
                            row
                        )
                ).length

                : 0;


        console.log(
            '✅ Sincronização do Gerenciamento de Anúncios finalizada.',
            {
                anuncios:
                    anuncios,

                linhas:
                    totalLinhas,

                comSku:
                    comSku,

                semSku:
                    semSku,

                comUserProduct:
                    comUserProduct,

                comInventory:
                    comInventory,

                depositoAtualizado:
                    estoqueAtualizado,

                fullAtualizado:
                    estoqueFullAtualizado,

                vendasAtualizadas:
                    vendasAtualizadas,

                precisaMudarPremium:
                    precisaPremium,

                precisaColocarEstoque:
                    precisaEstoque
            }
        );


        // =====================================================
        // DIAGNÓSTICO DE SKUS FALTANTES
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

                            userProduct:
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
        // DIAGNÓSTICO DOS ALERTAS DE ESTOQUE
        // =====================================================

        if (
            precisaEstoque > 0 &&
            typeof gaPrecisaCorrigirEstoqueDeposito ===
                'function'
        ) {

            console.log(
                `⚠️ ${precisaEstoque} produto(s) possuem estoque interno mas depósito ML está zerado.`
            );


            console.table(
                GA.rows
                    .filter(
                        row =>
                            gaPrecisaCorrigirEstoqueDeposito(
                                row
                            )
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

                            SKU:
                                row.sku,

                            depositoML:
                                row.warehouse,

                            estoqueInterno:
                                row.internalWarehouse
                        })
                    )
            );
        }


        // =====================================================
        // TOAST FINAL
        // =====================================================

        let mensagemFinal =
            `${anuncios} anúncios sincronizados`;


        if (
            precisaPremium > 0 ||
            precisaEstoque > 0
        ) {

            const alertas =
                [];


            if (
                precisaPremium > 0
            ) {

                alertas.push(
                    `${precisaPremium} para Premium`
                );
            }


            if (
                precisaEstoque > 0
            ) {

                alertas.push(
                    `${precisaEstoque} com estoque para corrigir`
                );
            }


            mensagemFinal +=
                ` • ${alertas.join(' • ')}`;
        }


        window.showToast?.(
            mensagemFinal,
            'success'
        );


    } catch (error) {

        // =====================================================
        // ERRO GERAL
        // =====================================================

        console.error(
            '❌ Gerenciamento de Anúncios:',
            error
        );


        // =====================================================
        // PRESERVAR DADOS ANTIGOS
        // =====================================================

        if (
            linhasSalvasAntes.length >
            0
        ) {

            console.warn(
                '⚠️ Atualização falhou. Mantendo os últimos dados salvos.'
            );


            GA.rows =
                linhasSalvasAntes;


            // =============================================
            // Mesmo em caso de erro, tentar carregar o
            // estoque interno para a validação visual.
            // =============================================

            try {

                if (
                    typeof atualizarEstoqueInternoGerenciamento ===
                    'function'
                ) {

                    atualizarEstoqueInternoGerenciamento(
                        GA.rows
                    );
                }

            } catch (
                errorInterno
            ) {

                console.warn(
                    '⚠️ Erro recalculando estoque interno:',
                    errorInterno
                );
            }


            updateSummary();


            applyFilters(
                false
            );


            window.showToast?.(
                'A atualização falhou. Os últimos dados salvos continuam disponíveis.',
                'warning'
            );

        } else {

            // =================================================
            // NÃO TEM DADO ANTIGO
            // =================================================

            const body =
                document.getElementById(
                    'gaTabelaBody'
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


            window.showToast?.(
                `Erro: ${
                    error?.message ||
                    'Falha ao carregar anúncios'
                }`,
                'error'
            );
        }


    } finally {

        // =====================================================
        // FINALIZAR CARREGAMENTO
        // =====================================================

        GA.loading =
            false;


        // Com os dados completos, confere a lista de 30+ dias e as
        // listas fixas Premium/Clássico (ficou travado durante o sync).
        GA._ultimoSync30Dias = 0;

        sincronizarHistorico30DiasGA().catch(
            error =>
                console.warn(
                    '⚠️ [30+ dias] Falha após sincronizar:',
                    error
                )
        );


        progress(
            ''
        );


        // =====================================================
        // RESTAURAR BOTÃO
        // =====================================================

        if (refresh) {

            refresh.disabled =
                false;


            if (
                refreshHtmlOriginal
            ) {

                refresh.innerHTML =
                    refreshHtmlOriginal;

            } else {

                refresh.innerHTML = `

                    <i class="fas fa-sync-alt"></i>

                    Sincronizar Agora
                `;
            }
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
    async function () {

        console.log(
            '📊 Abrindo Gerenciamento de Anúncios...'
        );

        // MLBs com exposição trocada de propósito por uma promoção
        // (ver estoque_gestao.js) — evita marcar como "precisa virar
        // Premium" um anúncio que está Clássico por causa disso.
        if (typeof window.obterMlbsComExposicaoPorPromocaoAtiva === 'function') {
            window.obterMlbsComExposicaoPorPromocaoAtiva()
                .then(set => { window._mlbsExposicaoPromocaoAtivaSync = set; })
                .catch(() => {});
        }


        // =====================================================
        // ESCONDER OUTROS SISTEMAS
        // =====================================================

        if (
            typeof esconderTodosOsSistemas ===
            'function'
        ) {

            esconderTodosOsSistemas(
                'gerenciamentoAnunciosSystem'
            );

        } else {

            document.getElementById(
                'menuSystem'
            )?.classList.add(
                'hidden'
            );
        }


        // =====================================================
        // MOSTRAR GERENCIAMENTO
        // =====================================================

        const sistema =
            document.getElementById(
                'gerenciamentoAnunciosSystem'
            );


        if (sistema) {

            sistema.classList.remove(
                'hidden'
            );
        }


        // =====================================================
        // COLUNAS PERSONALIZADAS
        // =====================================================

        reconstruirCabecalhoGA();


        // Estoque em excesso: só administradores.
        const opcaoExcesso =
            document.querySelector(
                '#gaFiltroCorrecao option[value="estoque_excesso"]'
            );

        if (opcaoExcesso) {

            const admin =
                gaUsuarioAdministrador();

            opcaoExcesso.hidden =
                !admin;

            opcaoExcesso.disabled =
                !admin;

            if (
                !admin &&
                opcaoExcesso.selected
            ) {

                document.getElementById(
                    'gaFiltroCorrecao'
                ).value = '';
            }
        }


        // =====================================================
        // USUÁRIO
        // =====================================================

        try {

            const nome =
                window.currentUser?.nome ||
                window.currentUser?.username ||
                window.currentUser?.usuario ||
                'Usuário';


            const role =
                window.currentUser?.role ||
                window.currentUser?.cargo ||
                '';


            const nomeEl =
                document.getElementById(
                    'gaUserName'
                );


            const roleEl =
                document.getElementById(
                    'gaUserRole'
                );


            const avatarEl =
                document.getElementById(
                    'gaUserAvatar'
                );


            if (nomeEl) {

                nomeEl.textContent =
                    nome;
            }


            if (roleEl) {

                roleEl.textContent =
                    role;
            }


            if (avatarEl) {

                avatarEl.textContent =
                    String(
                        nome
                    )
                        .trim()
                        .charAt(0)
                        .toUpperCase() ||
                    'U';
            }

        } catch (error) {

            console.warn(
                '⚠️ Não foi possível preencher usuário:',
                error
            );
        }


        // =====================================================
        // 1. CARREGAR ANÚNCIOS SALVOS
        // =====================================================

        if (
            !Array.isArray(
                GA.rows
            ) ||
            GA.rows.length === 0
        ) {

            try {

                progress(
                    'Carregando anúncios salvos...'
                );


                await carregarAnunciosBanco();

            } catch (error) {

                console.warn(
                    '⚠️ Não foi possível carregar anúncios salvos:',
                    error
                );
            }
        }


        // =====================================================
        // 2. CARREGAR ESTOQUE INTERNO
        //
        // IMPORTANTE:
        //
        // NÃO consulta anúncios do Mercado Livre.
        //
        // Só carrega produtos_estoque para poder verificar:
        //
        // Depósito ML = 0
        // +
        // Nosso estoque > 0
        // =====================================================

        try {

            progress(
                'Conferindo estoque interno...'
            );


            await loadInternalStock();


            // =================================================
            // 3. RECALCULAR ESTOQUE INTERNO DAS LINHAS
            // =================================================

            if (
                typeof atualizarEstoqueInternoGerenciamento ===
                'function'
            ) {

                atualizarEstoqueInternoGerenciamento(
                    GA.rows
                );

            } else {

                // fallback

                for (
                    const row
                    of GA.rows
                ) {

                    try {

                        row.internalWarehouse =
                            warehouseStock(
                                row.sku,
                                row.itemId
                            );

                    } catch (error) {

                        row.internalWarehouse =
                            null;
                    }
                }
            }


            console.log(
                '✅ Conferência de estoque interno atualizada.'
            );


        } catch (error) {

            console.warn(
                '⚠️ Não foi possível carregar estoque interno:',
                error
            );
        }


        // =====================================================
        // 4. DIAGNÓSTICO
        // =====================================================

        const alertasEstoque =
            typeof gaPrecisaCorrigirEstoqueDeposito ===
                'function'

                ? GA.rows.filter(
                    row =>
                        gaPrecisaCorrigirEstoqueDeposito(
                            row
                        )
                )

                : [];


        console.log(
            `⚠️ ${alertasEstoque.length} produto(s) precisam corrigir estoque do anúncio.`
        );


        if (
            alertasEstoque.length
        ) {

            console.table(

                alertasEstoque
                    .slice(
                        0,
                        30
                    )
                    .map(
                        row => ({

                            MLB:
                                row.itemId,

                            SKU:
                                row.sku,

                            depositoML:
                                row.warehouse,

                            estoqueInterno:
                                row.internalWarehouse
                        })
                    )
            );
        }


        // =====================================================
        // 5. MOSTRAR TABELA
        // =====================================================

        updateSummary();


        applyFilters(
            false
        );


        // =====================================================
        // FINALIZAR
        // =====================================================

        progress(
            ''
        );


        // =====================================================
        // SE NÃO TEM DADO SALVO, AÍ SIM SINCRONIZAR
        // =====================================================

        if (
            !Array.isArray(
                GA.rows
            ) ||
            GA.rows.length === 0
        ) {

            await loadAll(
                false
            );
        }


        // =====================================================
        // VERIFICAR "ATIVO NO FULL" EM SEGUNDO PLANO
        //
        // Não trava a tela — a tabela já está visível. Corrige a
        // coluna sozinha em alguns segundos, sem precisar de
        // "Sincronizar" manual.
        // =====================================================

        atualizarStatusFullTodosItensGA().catch(
            error => {

                console.warn(
                    '⚠️ [GA] Falha ao verificar status Full em segundo plano:',
                    error
                );
            }
        );
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


    window.filtrarGerenciamentoAnuncios =
    function () {

        // Recalcula a informação interna usada na regra
        // "Depósito ML = 0 + temos estoque".
        //
        // Não consulta o Mercado Livre.
        // É uma operação local e rápida.

        if (
            typeof atualizarEstoqueInternoGerenciamento ===
            'function' &&
            Array.isArray(GA.rows)
        ) {

            atualizarEstoqueInternoGerenciamento(
                GA.rows
            );
        }


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


                row.itemCapaPictureId =
                    item.pictures?.[0]?.id ||
                    null;


                row.ativoNoFull =
                    isFull(item);


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


                        row.variationPictureIds =
                            Array.isArray(
                                variation.picture_ids
                            )
                                ? variation.picture_ids
                                : [];


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

    window.verificarCorrecaoEstoqueAnuncio =
    async function (
        itemId,
        variationId = '',
        botao = null
    ) {

        const mlb =
            String(
                itemId || ''
            ).trim();


        const variacaoAlvo =
            String(
                variationId || ''
            ).trim();


        if (!mlb) {

            return;
        }


        console.log(
            `🔎 Verificando estoque corrigido de ${mlb}...`
        );


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
                !item?.id
            ) {

                throw new Error(
                    'Mercado Livre não retornou o anúncio.'
                );
            }


            console.log(
                `📦 Dados atualizados de ${mlb}:`,
                item
            );


            // =================================================
            // 2. LOCALIZAR AS LINHAS DESSE MLB
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
                    'MLB não encontrado na tabela.'
                );
            }


            // =================================================
            // 3. ATUALIZAR DADOS DAS VARIAÇÕES
            // =================================================

            for (
                const row
                of linhasMlb
            ) {

                row.status =
                    item.status ||
                    row.status;


                row.listingTypeId =
                    item.listing_type_id ||
                    row.listingTypeId;


                row.listingTypeName =
                    gaNomeTipoPorId(
                        row.listingTypeId
                    );


                row.title =
                    item.title ||
                    row.title;


                row.thumbnail =
                    item.thumbnail ||
                    row.thumbnail;


                row.itemCapaPictureId =
                    item.pictures?.[0]?.id ||
                    null;


                row.ativoNoFull =
                    isFull(item);


                row.permalink =
                    item.permalink ||
                    row.permalink;


                // =============================================
                // COM VARIAÇÃO
                // =============================================

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


                        if (novoSku) {

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


                        row.variationPictureIds =
                            Array.isArray(
                                variation.picture_ids
                            )
                                ? variation.picture_ids
                                : [];
                    }

                } else {

                    const novoSku =
                        extractSku(
                            item
                        );


                    if (novoSku) {

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
            // 4. ATUALIZAR ESTOQUE INTERNO SOMENTE DESTE MLB
            // =================================================

            try {

                await loadInternalStock();


                atualizarEstoqueInternoGerenciamento(
                    linhasMlb
                );

            } catch (errorInterno) {

                console.warn(
                    '⚠️ Não foi possível atualizar estoque interno:',
                    errorInterno
                );
            }


            // =================================================
            // 5. LIMPAR CACHE DOS USER PRODUCTS DESSE MLB
            //
            // Importantíssimo:
            // senão buscarEstoqueUserProduct() poderia devolver
            // o antigo zero que estava no cache.
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
                    row.userProductId &&
                    GA.userProductStockPromises
                ) {

                    GA.userProductStockPromises.delete(
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
            // 6. BUSCAR ESTOQUE SOMENTE DESSE MLB
            // =================================================

            await loadFullStocks(
                linhasMlb
            );


            // =================================================
            // 7. LOCALIZAR EXATAMENTE A VARIAÇÃO CLICADA
            // =================================================

            let linhaAlvo =
                null;


            if (
                variacaoAlvo
            ) {

                linhaAlvo =
                    linhasMlb.find(
                        row =>
                            String(
                                row.variationId ||
                                ''
                            ) ===
                            variacaoAlvo
                    );

            } else {

                linhaAlvo =
                    linhasMlb.find(
                        row =>
                            !row.variationId
                    ) ||
                    linhasMlb[0];
            }


            if (!linhaAlvo) {

                throw new Error(
                    'Não foi possível identificar a variação verificada.'
                );
            }


            // =================================================
            // 8. SALVAR SOMENTE ESSE MLB
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
            // 9. ATUALIZAR TELA
            // =================================================

            updateSummary();


            applyFilters(
                false
            );


            // =================================================
            // 10. CONFIRMAR SE FOI CORRIGIDO
            // =================================================

            if (
                gaPrecisaCorrigirEstoqueDeposito(
                    linhaAlvo
                )
            ) {

                console.warn(
                    `⚠️ ${mlb} ainda está com depósito zerado.`
                );


                window.showToast?.(

                    `${mlb} ainda está com estoque 0 no depósito. ` +
                    `Coloque pelo menos 1 e clique novamente em Corrigido.`,

                    'warning'
                );


                return;
            }


            // =================================================
            // FOI CORRIGIDO
            // =================================================

            const novoEstoque =
                Number(
                    linhaAlvo.warehouse
                );


            console.log(
                `✅ Estoque de ${mlb} confirmado: ${novoEstoque}`
            );


            window.showToast?.(

                `${mlb} corrigido. Estoque no depósito: ${novoEstoque}.`,

                'success'
            );


        } catch (error) {

            console.error(
                `❌ Erro verificando estoque de ${mlb}:`,
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


    // ============================================================
    // "CORRIGIDO" DO ALERTA "ATIVO NO FULL COM ESTOQUE SOBRANDO"
    //
    // Mesma sequência de re-sincronização de verificarCorrecaoEstoqueAnuncio
    // (busca o MLB de novo, atualiza estoque/tipo/capa, salva),
    // mas a confirmação final checa a condição OPOSTA (depósito
    // acima de 2 com o anúncio ativo no FULL) — por isso não dá
    // pra reaproveitar aquela função direto, ela sempre confirmaria
    // sucesso pra este caso sem checar nada.
    // ============================================================

    window.verificarCorrecaoQuantidadeExposicaoAnuncio =
    async function (
        itemId,
        variationId = '',
        botao = null
    ) {

        const mlb =
            String(
                itemId || ''
            ).trim();


        const variacaoAlvo =
            String(
                variationId || ''
            ).trim();


        if (!mlb) {

            return;
        }


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

            const item =
                await ml(
                    `/items/${encodeURIComponent(mlb)}` +
                    `?include_attributes=all`
                );


            if (
                !item?.id
            ) {

                throw new Error(
                    'Mercado Livre não retornou o anúncio.'
                );
            }


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
                    'MLB não encontrado na tabela.'
                );
            }


            for (
                const row
                of linhasMlb
            ) {

                row.status =
                    item.status ||
                    row.status;


                row.listingTypeId =
                    item.listing_type_id ||
                    row.listingTypeId;


                row.listingTypeName =
                    gaNomeTipoPorId(
                        row.listingTypeId
                    );


                row.title =
                    item.title ||
                    row.title;


                row.thumbnail =
                    item.thumbnail ||
                    row.thumbnail;


                row.itemCapaPictureId =
                    item.pictures?.[0]?.id ||
                    null;


                row.ativoNoFull =
                    isFull(item);


                row.permalink =
                    item.permalink ||
                    row.permalink;


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

                        row.variationPictureIds =
                            Array.isArray(
                                variation.picture_ids
                            )
                                ? variation.picture_ids
                                : [];
                    }
                }
            }


            try {

                await loadInternalStock();


                atualizarEstoqueInternoGerenciamento(
                    linhasMlb
                );

            } catch (errorInterno) {

                console.warn(
                    '⚠️ Não foi possível atualizar estoque interno:',
                    errorInterno
                );
            }


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
                    row.userProductId &&
                    GA.userProductStockPromises
                ) {

                    GA.userProductStockPromises.delete(
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


            await loadFullStocks(
                linhasMlb
            );


            let linhaAlvo =
                null;


            if (
                variacaoAlvo
            ) {

                linhaAlvo =
                    linhasMlb.find(
                        row =>
                            String(
                                row.variationId ||
                                ''
                            ) ===
                            variacaoAlvo
                    );

            } else {

                linhaAlvo =
                    linhasMlb.find(
                        row =>
                            !row.variationId
                    ) ||
                    linhasMlb[0];
            }


            if (!linhaAlvo) {

                throw new Error(
                    'Não foi possível identificar a variação verificada.'
                );
            }


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


            updateSummary();


            applyFilters(
                false
            );


            // =================================================
            // CONFIRMAR SE FOI CORRIGIDO
            // (condição oposta à do estoque zerado)
            // =================================================

            if (
                gaPrecisaAjustarQuantidadeExposicao(
                    linhaAlvo
                )
            ) {

                window.showToast?.(

                    `${mlb} ainda está ativo no FULL com ${Number(linhaAlvo.warehouse)} ` +
                    `unidade(s) no depósito. Ajuste a quantidade/exposição no anúncio ` +
                    `e clique novamente em Corrigido.`,

                    'warning'
                );


                return;
            }


            window.showToast?.(

                `${mlb} corrigido. Estoque no depósito: ${Number(linhaAlvo.warehouse)}.`,

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


    // ============================================================
    // ATUALIZAR DADOS DE UM ANÚNCIO (HELPER COMPARTILHADO)
    //
    // Mesma sequência de refresh usada pelos botões "Corrigido" já
    // existentes (tipo, estoque, quantidade/exposição) — busca o
    // item de novo no ML, atualiza status/tipo/ativoNoFull/estoque
    // interno/estoque FULL de todas as variações do MLB, salva no
    // banco e reaplica filtros + alertas por item. Usado pelos 3
    // novos botões "Corrigido" abaixo, pra não repetir essa
    // sequência inteira 3 vezes.
    // ============================================================

    async function atualizarDadosAnuncioGA(
        itemId,
        variationId = ''
    ) {

        const mlb =
            String(itemId || '').trim();

        const variacaoAlvo =
            String(variationId || '').trim();

        if (!mlb) {
            throw new Error('MLB inválido.');
        }

        const item =
            await ml(
                `/items/${encodeURIComponent(mlb)}` +
                `?include_attributes=all`
            );

        if (!item?.id) {
            throw new Error('Mercado Livre não retornou o anúncio.');
        }

        const linhasMlb =
            GA.rows.filter(
                row => String(row.itemId) === mlb
            );

        if (!linhasMlb.length) {
            throw new Error('MLB não encontrado na tabela.');
        }

        for (const row of linhasMlb) {

            row.status =
                item.status || row.status;

            row.listingTypeId =
                item.listing_type_id || row.listingTypeId;

            row.listingTypeName =
                gaNomeTipoPorId(row.listingTypeId);

            row.title =
                item.title || row.title;

            row.thumbnail =
                item.thumbnail || row.thumbnail;

            row.itemCapaPictureId =
                item.pictures?.[0]?.id || null;

            row.ativoNoFull =
                isFull(item);

            row.permalink =
                item.permalink || row.permalink;

            if (
                row.variationId &&
                Array.isArray(item.variations)
            ) {

                const variation =
                    item.variations.find(
                        v => String(v.id) === String(row.variationId)
                    );

                if (variation) {
                    row.variationPictureIds =
                        Array.isArray(variation.picture_ids)
                            ? variation.picture_ids
                            : [];
                }
            }
        }

        try {

            await loadInternalStock();

            atualizarEstoqueInternoGerenciamento(
                linhasMlb
            );

        } catch (errorInterno) {

            console.warn(
                '⚠️ Não foi possível atualizar estoque interno:',
                errorInterno
            );
        }

        for (const row of linhasMlb) {

            if (row.userProductId && GA.userProductStockCache) {
                GA.userProductStockCache.delete(row.userProductId);
            }

            if (row.userProductId && GA.userProductStockPromises) {
                GA.userProductStockPromises.delete(row.userProductId);
            }

            if (row.inventoryId && GA.inventoryStockCache) {
                GA.inventoryStockCache.delete(row.inventoryId);
            }
        }

        await loadFullStocks(linhasMlb);

        let linhaAlvo =
            null;

        if (variacaoAlvo) {

            linhaAlvo =
                linhasMlb.find(
                    row => String(row.variationId || '') === variacaoAlvo
                );

        } else {

            linhaAlvo =
                linhasMlb.find(row => !row.variationId) ||
                linhasMlb[0];
        }

        if (!linhaAlvo) {
            throw new Error('Não foi possível identificar a variação verificada.');
        }

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

        updateSummary();

        applyFilters(false);

        aplicarAlertasPorVariacaoGA();

        return { linhaAlvo, linhasMlb };
    }


    // ============================================================
    // BOTÃO "CORRIGIDO" — ZERAR DEPÓSITO (ITEM PARADO 30+ DIAS)
    // ============================================================

    window.verificarCorrecaoDepositoInatividadeAnuncio =
        async function (
            itemId,
            variationId = '',
            botao = null
        ) {

            const htmlOriginal =
                botao?.innerHTML || 'Corrigido';

            if (botao) {
                botao.disabled = true;
                botao.innerHTML =
                    '<i class="fas fa-spinner fa-spin"></i> Verificando...';
            }

            try {

                const { linhaAlvo } =
                    await atualizarDadosAnuncioGA(
                        itemId,
                        variationId
                    );

                if (
                    gaPrecisaZerarDepositoPorInatividade(
                        linhaAlvo
                    )
                ) {

                    window.showToast?.(
                        `${itemId} ainda tem ${Number(linhaAlvo.warehouse)} unidade(s) ` +
                        `no depósito. Zere o estoque fora do FULL e clique novamente em Corrigido.`,
                        'warning'
                    );

                    return;
                }

                window.showToast?.(
                    `${itemId} corrigido. Depósito: ${Number(linhaAlvo.warehouse)}.`,
                    'success'
                );

            } catch (error) {

                console.error(
                    `❌ Erro verificando ${itemId}:`,
                    error
                );

                window.showToast?.(
                    `Erro ao verificar ${itemId}: ${error?.message || 'Erro desconhecido'}`,
                    'error'
                );

            } finally {

                if (botao && document.body.contains(botao)) {
                    botao.disabled = false;
                    botao.innerHTML = htmlOriginal;
                }
            }
        };


    // ============================================================
    // BOTÃO "CORRIGIDO" — MUDAR PARA CLÁSSICO
    // ============================================================

    window.verificarCorrecaoTipoClassicoAnuncio =
        async function (
            itemId,
            botao = null
        ) {

            const htmlOriginal =
                botao?.innerHTML || 'Corrigido';

            if (botao) {
                botao.disabled = true;
                botao.innerHTML =
                    '<i class="fas fa-spinner fa-spin"></i> Verificando...';
            }

            try {

                const { linhaAlvo } =
                    await atualizarDadosAnuncioGA(
                        itemId
                    );

                if (
                    gaPrecisaMudarParaClassico(
                        linhaAlvo
                    )
                ) {

                    window.showToast?.(
                        `${itemId} ainda está como ${linhaAlvo.listingTypeName || 'Premium'}. ` +
                        `Mude para Clássico no anúncio e clique novamente em Corrigido.`,
                        'warning'
                    );

                    return;
                }

                window.showToast?.(
                    `${itemId} corrigido. Tipo atual: ${linhaAlvo.listingTypeName || '-'}.`,
                    'success'
                );

            } catch (error) {

                console.error(
                    `❌ Erro verificando ${itemId}:`,
                    error
                );

                window.showToast?.(
                    `Erro ao verificar ${itemId}: ${error?.message || 'Erro desconhecido'}`,
                    'error'
                );

            } finally {

                if (botao && document.body.contains(botao)) {
                    botao.disabled = false;
                    botao.innerHTML = htmlOriginal;
                }
            }
        };


    // ============================================================
    // BOTÃO "CORRIGIDO" — FULL ATIVO SEM ESTOQUE REAL
    // ============================================================

    window.verificarCorrecaoFullSemEstoqueAnuncio =
        async function (
            itemId,
            botao = null
        ) {

            const htmlOriginal =
                botao?.innerHTML || 'Corrigido';

            if (botao) {
                botao.disabled = true;
                botao.innerHTML =
                    '<i class="fas fa-spinner fa-spin"></i> Verificando...';
            }

            try {

                const { linhaAlvo } =
                    await atualizarDadosAnuncioGA(
                        itemId
                    );

                if (
                    linhaAlvo._fullAtivoSemEstoqueReal
                ) {

                    window.showToast?.(
                        `${itemId} continua marcado como "oferece FULL" sem estoque real. ` +
                        `Confira o anúncio no Mercado Livre e clique novamente em Corrigido.`,
                        'warning'
                    );

                    return;
                }

                window.showToast?.(
                    `${itemId} corrigido.`,
                    'success'
                );

            } catch (error) {

                console.error(
                    `❌ Erro verificando ${itemId}:`,
                    error
                );

                window.showToast?.(
                    `Erro ao verificar ${itemId}: ${error?.message || 'Erro desconhecido'}`,
                    'error'
                );

            } finally {

                if (botao && document.body.contains(botao)) {
                    botao.disabled = false;
                    botao.innerHTML = htmlOriginal;
                }
            }
        };

    // Usado pelo full_planos.js (Planos Full).
    window.GAInterno = {
        GA,
        mlComRetry,
        getSellerId,
        buscarOperacoesVendaFull,
        inventoryIdDaOperacaoFull,
        quantidadeVendidaOperacaoFull,
        formatarDataApiFull,
        warehouseStock,
        skuInternoPorMlb,
        extractSku,
        loadInternalStock,
        executarEmParaleloGA,
        progress
    };

})();