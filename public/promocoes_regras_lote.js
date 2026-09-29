// ============================================================
// MÓDULO: PROMOÇÕES EM LOTE — ATIVAÇÃO EM MASSA POR REGRAS
// ============================================================
// Monta a lista de MLBs que entram numa promoção a partir de regras:
//  - promoção escolhida (candidatos dela no ML);
//  - faixa de desconto elegível (maior que / menor que);
//  - listas de MLBs excluídos, cada uma com uma faixa de preço
//    própria (só é excluído quem está na lista E dentro da faixa):
//      * criados nos últimos 40 dias (promocoes_historico.js)
//      * bloqueados (promocoes_manager.js)
//      * venderam nos últimos 40 dias
//      * clássicos fixos da Gestão de Estoque
//      * sem Mercado Envios (envio por conta do comprador)
//  - categorias do sistema excluídas (produtos_estoque.categoria; o
//    MLB é ligado ao produto por dados_extra.mlb_codes).
// Depois ativa em massa e registra a execução.
//
// Onde fica cada coisa:
//  - regras e categorias excluídas: configuracoes_sistema, chave
//    `promocoes_lote_regras`;
//  - lista "venderam nos últimos 40 dias": chave
//    `promocoes_lote_vendidos_40d`;
//  - lista "sem Mercado Envios": chave `promocoes_lote_sem_mercado_envios`;
//  - clássicos: a própria chave da Gestão de Estoque
//    (`regras_fixas_tipo_anuncio_ml`, campo classico) — só leitura aqui;
//  - cada ativação em massa: tabela `promocoes_ativacoes_massa`, e cada
//    MLB ativado também entra no histórico de promoções.
//
// SQL da tabela de registro (rodar uma vez no Supabase):
//
// create table if not exists public.promocoes_ativacoes_massa (
//     id bigserial primary key,
//     criado_em timestamptz not null default now(),
//     promotion_id text,
//     promotion_type text,
//     promotion_name text,
//     regras jsonb,
//     total_candidatos integer,
//     total_elegiveis integer,
//     total_enviados integer,
//     sucessos integer,
//     falhas integer,
//     mlbs_ativados jsonb,
//     falhas_detalhe jsonb,
//     executado_por text
// );
// create index if not exists promocoes_ativacoes_massa_criado_idx
//     on public.promocoes_ativacoes_massa (criado_em desc);
// notify pgrst, 'reload schema';
// ============================================================

(function() {
    'use strict';

    const DIAS_VENDIDOS = 40;
    const HORAS_AUTO_ATUALIZAR_VENDIDOS = 12;
    const CHAVE_REGRAS = 'promocoes_lote_regras';
    const CHAVE_VENDIDOS = 'promocoes_lote_vendidos_40d';
    const CHAVE_SEM_ME = 'promocoes_lote_sem_mercado_envios';
    const CHAVE_CLASSICOS = 'regras_fixas_tipo_anuncio_ml';
    const TABELA_REGISTRO = 'promocoes_ativacoes_massa';
    const MODOS_MERCADO_ENVIOS = ['me1', 'me2'];
    const ATRIBUTOS_DETALHES = 'id,title,price,status,shipping';
    const SEM_CATEGORIA = 'Sem produto vinculado';

    const LISTAS = [
        { chave: 'novos', nome: 'Criados nos últimos 40 dias' },
        { chave: 'bloqueados', nome: 'MLBs bloqueados' },
        { chave: 'vendidos', nome: `Venderam nos últimos ${DIAS_VENDIDOS} dias` },
        { chave: 'classicos', nome: 'Clássicos (Gestão de Estoque)' },
        { chave: 'semME', nome: 'Sem Mercado Envios' }
    ];

    const ROTULOS_MODO_ENVIO = {
        me1: 'Mercado Envios 1',
        me2: 'Mercado Envios',
        custom: 'Envio personalizado',
        not_specified: 'A combinar / por conta do comprador'
    };

    let regras = regrasPadrao();
    let vendidos = { atualizado_em: null, itens: [] };
    let semME = { atualizado_em: null, itens: [] };
    let classicosIds = [];
    let registros = [];
    let erroRegistros = null;

    // mlb -> { titulo, preco, modo_envio, status }
    const detalhes = new Map();
    // mlb -> Set de categorias do sistema (produtos_estoque)
    let categoriasPorMlb = new Map();
    let categoriasSistema = [];

    let promocaoCarregada = null;
    let candidatos = [];
    let avaliados = [];
    const desmarcados = new Set();
    // Andamento/erro da busca de candidatos, mostrado na tabela de resultado.
    let mensagemResultado = null;

    let iniciado = false;
    let timerSalvarRegras = null;
    const ocupado = { vendidos: false, semME: false, candidatos: false, ativando: false, precos: false };

    const P = () => window.PromoML;
    const esc = valor => P().escaparHtml(valor);
    const moeda = valor => P().formatarMoeda(valor);
    const dataHora = valor => P().formatarDataHora(valor);
    const toast = (msg, tipo) => P().toast(msg, tipo);

    function log(msg, type = 'info', data = null) {
        const fn = type === 'error' ? console.error : console.log;
        fn(`⚡ [PROMO-REGRAS] ${new Date().toLocaleTimeString()} ${msg}`, data || '');
    }

    function regrasPadrao() {
        return {
            descontoBase: 'total',
            descontoMin: '',
            descontoMax: '',
            listas: Object.fromEntries(LISTAS.map(lista =>
                [lista.chave, { ativa: true, precoMin: '', precoMax: '' }])),
            categoriasExcluidas: []
        };
    }

    function numeroOuNulo(valor) {
        if (valor === '' || valor === null || valor === undefined) return null;
        const numero = Number(String(valor).replace(',', '.'));
        return Number.isFinite(numero) ? numero : null;
    }

    function formatarPct(valor) {
        return Number.isFinite(valor) ? `${valor.toFixed(1)}%` : '—';
    }

    function definirTexto(id, texto) {
        const el = document.getElementById(id);
        if (el) el.textContent = texto;
    }

    function nomeUsuario() {
        return window.currentUser?.name || 'Sistema';
    }

    // ============================================================
    // CONFIGURAÇÕES (configuracoes_sistema)
    // ============================================================
    async function lerConfig(chave) {
        const db = P().supabase();
        if (!db) return null;
        const { data, error } = await db
            .from('configuracoes_sistema')
            .select('valor')
            .eq('chave', chave)
            .maybeSingle();
        if (error) throw error;
        let valor = data?.valor ?? null;
        if (typeof valor === 'string') {
            try { valor = JSON.parse(valor); } catch { /* mantém texto */ }
        }
        return valor;
    }

    async function salvarConfig(chave, valor) {
        const db = P().supabase();
        if (!db) throw new Error('Supabase não conectado');
        const { error } = await db
            .from('configuracoes_sistema')
            .upsert({ chave, valor }, { onConflict: 'chave' });
        if (error) throw error;
    }

    async function carregarRegras() {
        try {
            const valor = await lerConfig(CHAVE_REGRAS);
            const padrao = regrasPadrao();
            if (valor && typeof valor === 'object') {
                regras = {
                    ...padrao,
                    ...valor,
                    listas: { ...padrao.listas, ...(valor.listas || {}) },
                    categoriasExcluidas: (Array.isArray(valor.categoriasExcluidas) ? valor.categoriasExcluidas : [])
                        .filter(categoria => typeof categoria === 'string' && categoria.trim())
                };
            }
        } catch (error) {
            log(`Erro ao carregar regras: ${error.message}`, 'error');
        }
    }

    function agendarSalvarRegras() {
        clearTimeout(timerSalvarRegras);
        definirTexto('promoRegrasStatusSalvo', 'Salvando regras...');
        timerSalvarRegras = setTimeout(async () => {
            try {
                await salvarConfig(CHAVE_REGRAS, regras);
                definirTexto('promoRegrasStatusSalvo', `Regras salvas às ${new Date().toLocaleTimeString('pt-BR')}`);
            } catch (error) {
                definirTexto('promoRegrasStatusSalvo', `Erro ao salvar regras: ${error.message}`);
            }
        }, 1200);
    }

    async function carregarListasSalvas() {
        const [valorVendidos, valorSemME, valorClassicos] = await Promise.all([
            lerConfig(CHAVE_VENDIDOS).catch(() => null),
            lerConfig(CHAVE_SEM_ME).catch(() => null),
            lerConfig(CHAVE_CLASSICOS).catch(() => null)
        ]);
        if (valorVendidos?.itens) vendidos = valorVendidos;
        if (valorSemME?.itens) semME = valorSemME;
        classicosIds = [...new Set(
            (Array.isArray(valorClassicos?.classico) ? valorClassicos.classico : [])
                .map(mlb => String(mlb || '').trim().toUpperCase())
                .filter(mlb => /^MLB\d+$/.test(mlb))
        )];
    }

    // ============================================================
    // CATEGORIAS DO SISTEMA (Gestão de Estoque)
    // ============================================================
    function mlbsDoProduto(produto) {
        let mlbs = produto.dados_extra?.mlb_codes || [];
        if (typeof mlbs === 'string') mlbs = mlbs.split(',');
        return Array.isArray(mlbs)
            ? mlbs.map(mlb => String(mlb || '').trim().toUpperCase()).filter(Boolean)
            : [];
    }

    async function carregarCategoriasSistema() {
        const db = P().supabase();
        if (!db) return;
        const produtos = [];
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await db
                .from('produtos_estoque')
                .select('id, categoria, dados_extra')
                .range(desde, desde + 999);
            if (error) throw error;
            produtos.push(...(data || []));
            if (!data || data.length < 1000) break;
        }

        const porMlb = new Map();
        const todas = new Set();
        for (const produto of produtos) {
            const categoria = String(produto.categoria || '').trim();
            if (!categoria) continue;
            todas.add(categoria);
            for (const mlb of mlbsDoProduto(produto)) {
                if (!porMlb.has(mlb)) porMlb.set(mlb, new Set());
                porMlb.get(mlb).add(categoria);
            }
        }
        categoriasPorMlb = porMlb;
        categoriasSistema = [...todas].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }

    function categoriasDoMlb(mlb) {
        return [...(categoriasPorMlb.get(mlb) || [])];
    }

    // ============================================================
    // DETALHES DOS ANÚNCIOS (preço, envio)
    // ============================================================
    function guardarDetalhe(item) {
        detalhes.set(item.id, {
            titulo: item.title || '',
            preco: Number(item.price) || 0,
            modo_envio: item.shipping?.mode || null,
            status: item.status || ''
        });
    }

    async function completarDetalhes(ids, token, aoProgredir) {
        const faltando = [...new Set(ids)].filter(id => !detalhes.has(id));
        if (!faltando.length) return;
        const itens = await P().buscarDetalhesItens(faltando, token, aoProgredir, ATRIBUTOS_DETALHES);
        itens.forEach(guardarDetalhe);
    }

    // Preço de venda dos MLBs das listas que só guardam o ID
    // (bloqueados e clássicos).
    async function completarPrecosListas() {
        if (ocupado.precos) return;
        const ids = [...(window.obterMLBsBloqueadosPromocao?.() || []), ...classicosIds]
            .filter(mlb => !detalhes.has(mlb));
        if (!ids.length) return;
        ocupado.precos = true;
        try {
            const token = await P().obterToken();
            await completarDetalhes(ids, token);
            renderizarListas();
        } catch (error) {
            log(`Não foi possível ler os preços das listas: ${error.message}`, 'error');
        } finally {
            ocupado.precos = false;
        }
    }

    // ============================================================
    // LISTAS DE EXCLUÍDOS
    // ============================================================
    function itemPorId(mlb) {
        const det = detalhes.get(mlb);
        return { mlb, titulo: det?.titulo || '', preco: det?.preco || 0, status: det?.status || '' };
    }

    function itensDaLista(chave) {
        switch (chave) {
            case 'novos':
                return (window.obterMlbsNovosPromocoes?.() || []).map(item => ({
                    mlb: item.mlb,
                    titulo: item.titulo || '',
                    preco: detalhes.get(item.mlb)?.preco || Number(item.preco) || 0,
                    status: item.status || ''
                }));
            case 'bloqueados':
                return (window.obterMLBsBloqueadosPromocao?.() || []).map(itemPorId);
            case 'vendidos':
                return vendidos.itens || [];
            case 'classicos':
                return classicosIds.map(itemPorId);
            case 'semME':
                return semME.itens || [];
            default:
                return [];
        }
    }

    window.promoListasExcluidasAtualizadas = function() {
        if (!iniciado) return;
        renderizarListas();
        reavaliar();
        completarPrecosListas();
    };

    window.atualizarVendidos40Dias = async function(opcoes = {}) {
        const { silencioso = false } = opcoes;
        if (ocupado.vendidos) return;
        ocupado.vendidos = true;
        renderizarListas();
        const aoProgredir = texto => definirTexto('promoListaInfo_vendidos', texto);

        try {
            const token = await P().obterToken();
            const fim = new Date();
            const inicio = new Date(fim.getTime() - DIAS_VENDIDOS * 24 * 60 * 60 * 1000);
            const pedidos = await P().buscarPedidosPagos(inicio, fim, token, aoProgredir);

            const porMlb = new Map();
            for (const pedido of pedidos) {
                for (const linha of pedido.order_items || []) {
                    const mlb = linha?.item?.id;
                    if (!mlb) continue;
                    if (!porMlb.has(mlb)) {
                        porMlb.set(mlb, {
                            mlb,
                            titulo: linha.item.title || '',
                            unidades: 0,
                            pedidos: new Set(),
                            faturamento: 0,
                            ultimo_preco: 0,
                            ultima_venda: null
                        });
                    }
                    const acc = porMlb.get(mlb);
                    const quantidade = Number(linha.quantity) || 0;
                    acc.unidades += quantidade;
                    acc.pedidos.add(pedido.id);
                    acc.faturamento += (Number(linha.unit_price) || 0) * quantidade;
                    if (!acc.ultima_venda || pedido.date_created > acc.ultima_venda) {
                        acc.ultima_venda = pedido.date_created;
                        acc.ultimo_preco = Number(linha.unit_price) || acc.ultimo_preco;
                    }
                }
            }

            aoProgredir(`Lendo preço atual de ${porMlb.size} anúncio(s)...`);
            await completarDetalhes([...porMlb.keys()], token, (feitos, total) =>
                aoProgredir(`Lendo preço atual... ${feitos}/${total}`));

            vendidos = {
                atualizado_em: new Date().toISOString(),
                itens: [...porMlb.values()]
                    .map(acc => ({
                        mlb: acc.mlb,
                        titulo: detalhes.get(acc.mlb)?.titulo || acc.titulo,
                        preco: detalhes.get(acc.mlb)?.preco || acc.ultimo_preco,
                        unidades: acc.unidades,
                        pedidos: acc.pedidos.size,
                        faturamento: Number(acc.faturamento.toFixed(2)),
                        ultima_venda: acc.ultima_venda
                    }))
                    .sort((a, b) => b.unidades - a.unidades)
            };
            await salvarConfig(CHAVE_VENDIDOS, vendidos);
            if (!silencioso) toast(`✅ ${vendidos.itens.length} MLB(s) venderam nos últimos ${DIAS_VENDIDOS} dias`, 'success');
        } catch (error) {
            log(`Erro ao atualizar vendidos: ${error.message}`, 'error');
            if (!silencioso) toast(`❌ Erro ao buscar vendas: ${error.message}`, 'error');
        } finally {
            ocupado.vendidos = false;
            renderizarListas();
            reavaliar();
        }
    };

    window.atualizarSemMercadoEnvios = async function() {
        if (ocupado.semME) return;
        ocupado.semME = true;
        renderizarListas();
        const aoProgredir = texto => definirTexto('promoListaInfo_semME', texto);

        try {
            const token = await P().obterToken();
            const ids = [];
            const vistos = new Set();
            let scrollId = null;

            for (let volta = 0; volta < 10000; volta++) {
                let url = `https://api.mercadolibre.com/users/${P().SELLER_ID}/items/search?search_type=scan&status=active&limit=100`;
                if (scrollId) url += `&scroll_id=${encodeURIComponent(scrollId)}`;
                const data = await P().mlGet(url, token);
                const resultados = Array.isArray(data?.results) ? data.results : [];
                let adicionados = 0;
                for (const id of resultados) {
                    if (!vistos.has(id)) {
                        vistos.add(id);
                        ids.push(id);
                        adicionados++;
                    }
                }
                aoProgredir(`Localizando anúncios ativos... ${ids.length}`);
                scrollId = data?.scroll_id || scrollId;
                if (!resultados.length || !scrollId || !adicionados) break;
            }

            // Sempre relê: o modo de envio pode ter mudado.
            const itens = await P().buscarDetalhesItens(ids, token, (feitos, total) =>
                aoProgredir(`Lendo forma de envio... ${feitos}/${total}`), ATRIBUTOS_DETALHES);
            itens.forEach(guardarDetalhe);

            semME = {
                atualizado_em: new Date().toISOString(),
                total_verificados: itens.length,
                itens: itens
                    .filter(item => !MODOS_MERCADO_ENVIOS.includes(item.shipping?.mode))
                    .map(item => ({
                        mlb: item.id,
                        titulo: item.title || '',
                        preco: Number(item.price) || 0,
                        modo_envio: item.shipping?.mode || null
                    }))
            };
            await salvarConfig(CHAVE_SEM_ME, semME);
            toast(`✅ ${semME.itens.length} anúncio(s) sem Mercado Envios entre ${itens.length} ativos`, 'success');
        } catch (error) {
            log(`Erro ao buscar anúncios sem Mercado Envios: ${error.message}`, 'error');
            toast(`❌ Erro ao buscar anúncios: ${error.message}`, 'error');
        } finally {
            ocupado.semME = false;
            renderizarListas();
            reavaliar();
        }
    };

    window.exportarListaExcluidos = function(chave) {
        const lista = LISTAS.find(l => l.chave === chave);
        P().exportarExcel(
            itensDaLista(chave).map(item => ({
                MLB: item.mlb,
                Título: item.titulo || '',
                'Preço de venda': Number(item.preco) || 0,
                ...(chave === 'vendidos' ? {
                    'Unidades vendidas': item.unidades,
                    Pedidos: item.pedidos,
                    Faturamento: item.faturamento,
                    'Última venda': dataHora(item.ultima_venda)
                } : {}),
                ...(chave === 'semME' ? { 'Forma de envio': ROTULOS_MODO_ENVIO[item.modo_envio] || item.modo_envio || '' } : {})
            })),
            (lista?.nome || chave).slice(0, 30),
            `mlbs_excluidos_${chave}`
        );
    };

    window.copiarListaExcluidos = async function(chave) {
        const mlbs = itensDaLista(chave).map(item => item.mlb);
        if (!mlbs.length) {
            toast('⚠️ Nenhum MLB na lista', 'warning');
            return;
        }
        try {
            await navigator.clipboard.writeText(mlbs.join('\n'));
            toast(`📋 ${mlbs.length} MLB(s) copiados`, 'success');
        } catch {
            toast('❌ Não foi possível copiar', 'error');
        }
    };

    // ============================================================
    // CATEGORIAS EXCLUÍDAS
    // ============================================================
    function categoriaExcluida(categoria) {
        return regras.categoriasExcluidas.includes(categoria);
    }

    // Os checkboxes guardam o índice em categoriasSistema, porque o
    // nome da categoria pode ter aspas e caracteres especiais.
    window.alternarCategoriaExcluida = function(indice, excluir) {
        const categoria = indice >= 0 ? categoriasSistema[indice] : regras.categoriasExcluidas[-1 - indice];
        if (!categoria) return;
        regras.categoriasExcluidas = regras.categoriasExcluidas.filter(c => c !== categoria);
        if (excluir) regras.categoriasExcluidas.push(categoria);
        agendarSalvarRegras();
        renderizarCategoriasRegras();
        renderizarListas();
        reavaliar();
    };

    // Índice usado no onclick: >= 0 para categorias que existem no
    // sistema, negativo para uma excluída que não existe mais.
    function indiceCategoria(categoria) {
        const indice = categoriasSistema.indexOf(categoria);
        return indice >= 0 ? indice : -1 - regras.categoriasExcluidas.indexOf(categoria);
    }

    // ============================================================
    // CANDIDATOS DA PROMOÇÃO E AVALIAÇÃO DAS REGRAS
    // ============================================================
    window.preencherPromocoesRegrasLote = function() {
        const select = document.getElementById('promoRegrasPromocao');
        if (!select) return;
        const atual = select.value;
        const promocoes = window.obterPromocoesAtivasLote?.() || [];
        select.innerHTML = '<option value="">Selecione a promoção...</option>' +
            promocoes.map(p => `<option value="${esc(p.id)}">${esc(p.name || p.id)} (${esc(p.type)})</option>`).join('');
        if (atual) select.value = atual;
    };

    // Mesmo cálculo do agendamento (valorPromocaoEmReais no
    // promocoes_manager.js), sem a conversão de centavos: a lista de
    // itens da promoção já vem em reais.
    function precoNaPromocao(item) {
        let valor = Number([item.suggested_discounted_price, item.min_discounted_price, item.price]
            .find(v => Number(v) > 0) || 0);
        if (!valor && Number(item.original_price) > 0 &&
            (item.seller_percentage != null || item.meli_percentage != null)) {
            const total = (Number(item.meli_percentage) || 0) + (Number(item.seller_percentage) || 0);
            if (total > 0) valor = Number(item.original_price) * (1 - total / 100);
        }
        return Number(valor.toFixed(2));
    }

    function montarCandidato(item) {
        const det = detalhes.get(item.id);
        const precoOriginal = Number(item.original_price) || det?.preco || 0;
        const precoPromocao = precoNaPromocao(item);
        const desconto = precoOriginal > 0 && precoPromocao > 0
            ? ((precoOriginal - precoPromocao) / precoOriginal) * 100
            : null;
        const percentVendedor = item.seller_percentage != null && item.seller_percentage !== ''
            ? Number(item.seller_percentage)
            : desconto;
        return {
            mlb: item.id,
            titulo: det?.titulo || '',
            categorias: categoriasDoMlb(item.id),
            precoOriginal,
            precoPromocao,
            desconto,
            percentVendedor,
            modoEnvio: det?.modo_envio || null
        };
    }

    const ROTULOS_STATUS = {
        started: 'já ativos',
        pending: 'programados',
        candidate: 'candidatos',
        finished: 'encerrados'
    };

    // Lê os itens da promoção. Primeiro pede só os candidatos; se o ML
    // recusar o filtro ou não devolver nada, lê tudo e separa aqui —
    // assim dá pra dizer o que existe na promoção quando não há candidato.
    async function lerItensPromocao(promocao, status, token) {
        const itens = [];
        let searchAfter = null;
        for (let pagina = 0; pagina < 2000; pagina++) {
            const params = new URLSearchParams({ promotion_type: promocao.type, app_version: 'v2', limit: '50' });
            if (status) params.set('status', status);
            if (searchAfter) params.set('search_after', searchAfter);
            const data = await P().mlGet(
                `https://api.mercadolibre.com/seller-promotions/promotions/${encodeURIComponent(promocao.id)}/items?${params}`,
                token
            );
            for (const item of data?.results || []) {
                const id = item.id || item.item_id;
                if (id) itens.push({ ...item, id });
            }
            searchAfter = data?.paging?.searchAfter || null;
            if (!searchAfter || !(data?.results || []).length) break;
        }
        return itens;
    }

    async function lerCandidatosPromocao(promocao, token, aoProgredir) {
        let filtrados = [];
        try {
            filtrados = await lerItensPromocao(promocao, 'candidate', token);
        } catch (error) {
            log(`Filtro de candidatos recusado (${error.message}), lendo todos os itens`, 'warning');
        }
        if (filtrados.length) return { itens: filtrados, outrosStatus: {} };

        aoProgredir(`Conferindo todos os itens de "${promocao.name || promocao.id}"...`);
        const todos = await lerItensPromocao(promocao, null, token);
        const outrosStatus = {};
        for (const item of todos) {
            if (item.status !== 'candidate') outrosStatus[item.status || '?'] = (outrosStatus[item.status || '?'] || 0) + 1;
        }
        return { itens: todos.filter(item => item.status === 'candidate'), outrosStatus };
    }

    window.buscarCandidatosRegrasLote = async function() {
        if (ocupado.candidatos || ocupado.ativando) return;
        const promocaoId = document.getElementById('promoRegrasPromocao')?.value;
        const promocao = (window.obterPromocoesAtivasLote?.() || []).find(p => String(p.id) === String(promocaoId));
        if (!promocao) {
            toast('⚠️ Selecione a promoção', 'warning');
            return;
        }

        ocupado.candidatos = true;
        const botao = document.getElementById('btnBuscarCandidatosRegras');
        const textoBotao = botao?.innerHTML;
        if (botao) {
            botao.disabled = true;
            botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';
        }
        promocaoCarregada = null;
        candidatos = [];
        avaliados = [];
        const aoProgredir = texto => {
            definirTexto('promoRegrasProgresso', texto);
            mensagemResultado = texto;
            renderizarResultado();
        };

        try {
            const token = await P().obterToken();
            aoProgredir(`Lendo candidatos de "${promocao.name || promocao.id}" no Mercado Livre...`);
            const { itens, outrosStatus } = await lerCandidatosPromocao(promocao, token, aoProgredir);

            if (!itens.length) {
                const detalhe = Object.entries(outrosStatus).map(([status, qtd]) => `${qtd} ${ROTULOS_STATUS[status] || status}`).join(', ');
                aoProgredir(
                    `A promoção "${promocao.name || promocao.id}" não tem candidatos (MLBs que ainda podem entrar).` +
                    (detalhe ? ` Nela há: ${detalhe}.` : ' O Mercado Livre não devolveu nenhum item para ela.')
                );
                toast('⚠️ Nenhum candidato nessa promoção', 'warning');
                return;
            }

            aoProgredir(`Lendo título e preço de ${itens.length} anúncio(s)...`);
            await completarDetalhes(itens.map(item => item.id), token, (feitos, total) =>
                aoProgredir(`Lendo dados dos anúncios... ${feitos}/${total}`));

            aoProgredir('Lendo categorias do sistema...');
            await carregarCategoriasSistema();

            promocaoCarregada = promocao;
            candidatos = itens.map(montarCandidato);
            desmarcados.clear();
            definirTexto('promoRegrasProgresso', `${candidatos.length} candidato(s) em "${promocao.name || promocao.id}" • lido às ${new Date().toLocaleTimeString('pt-BR')}`);
            mensagemResultado = null;
            renderizarCategoriasRegras();
            reavaliar();
        } catch (error) {
            log(`Erro ao buscar candidatos: ${error.message}`, 'error');
            aoProgredir(`❌ Erro ao buscar candidatos: ${error.message}`);
            toast(`❌ ${error.message}`, 'error');
        } finally {
            ocupado.candidatos = false;
            if (botao) {
                botao.disabled = false;
                botao.innerHTML = textoBotao;
            }
        }
    };

    function dentroDaFaixa(preco, faixa) {
        const min = numeroOuNulo(faixa.precoMin);
        const max = numeroOuNulo(faixa.precoMax);
        if (min === null && max === null) return true;
        // Sem preço conhecido e com faixa definida: na dúvida, exclui.
        if (!(preco > 0)) return true;
        if (min !== null && preco < min) return false;
        if (max !== null && preco > max) return false;
        return true;
    }

    function textoFaixa(faixa) {
        const min = numeroOuNulo(faixa.precoMin);
        const max = numeroOuNulo(faixa.precoMax);
        if (min === null && max === null) return '';
        if (min !== null && max !== null) return ` (${moeda(min)} a ${moeda(max)})`;
        return min !== null ? ` (a partir de ${moeda(min)})` : ` (até ${moeda(max)})`;
    }

    function conjuntosDasListas() {
        return Object.fromEntries(LISTAS.map(lista =>
            [lista.chave, new Set(itensDaLista(lista.chave).map(item => item.mlb))]));
    }

    function motivosExclusao(candidato, conjuntos) {
        const motivos = [];
        const bruto = regras.descontoBase === 'vendedor' ? candidato.percentVendedor : candidato.desconto;
        // Compara com o valor arredondado que aparece na tela (1 casa):
        // o desconto vem de preços em centavos, então 5% costuma virar
        // 5,005% ou 4,998% e escapava do "maior/menor ou igual".
        const valor = Number.isFinite(bruto) ? Math.round(bruto * 10) / 10 : bruto;
        const min = numeroOuNulo(regras.descontoMin);
        const max = numeroOuNulo(regras.descontoMax);
        const rotuloBase = regras.descontoBase === 'vendedor' ? '% do vendedor' : 'Desconto';

        if (min !== null && !(valor >= min)) motivos.push(`${rotuloBase} ${formatarPct(valor)} abaixo de ${min}%`);
        if (max !== null && !(valor <= max)) motivos.push(`${rotuloBase} ${formatarPct(valor)} acima de ${max}%`);

        for (const lista of LISTAS) {
            const faixa = regras.listas[lista.chave];
            if (!faixa?.ativa || !conjuntos[lista.chave].has(candidato.mlb)) continue;
            if (dentroDaFaixa(candidato.precoOriginal, faixa)) motivos.push(`${lista.nome}${textoFaixa(faixa)}`);
        }

        const categoriasBarradas = candidato.categorias.filter(categoriaExcluida);
        if (categoriasBarradas.length) motivos.push(`Categoria excluída: ${categoriasBarradas.join(', ')}`);
        return motivos;
    }

    function reavaliar() {
        if (!document.getElementById('promoRegrasResultadoBody')) return;
        const conjuntos = conjuntosDasListas();
        avaliados = candidatos.map(candidato => ({ ...candidato, motivos: motivosExclusao(candidato, conjuntos) }));
        renderizarAfetadosPorLista(conjuntos);
        renderizarResultado();
    }

    window.alterarRegrasLote = function() {
        const valor = id => document.getElementById(id)?.value ?? '';
        regras.descontoBase = valor('promoRegrasDescontoBase') || 'total';
        regras.descontoMin = valor('promoRegrasDescontoMin');
        regras.descontoMax = valor('promoRegrasDescontoMax');
        for (const lista of LISTAS) {
            regras.listas[lista.chave] = {
                ativa: Boolean(document.getElementById(`promoRegraAtiva_${lista.chave}`)?.checked),
                precoMin: valor(`promoRegraMin_${lista.chave}`),
                precoMax: valor(`promoRegraMax_${lista.chave}`)
            };
        }
        agendarSalvarRegras();
        reavaliar();
    };

    // ============================================================
    // ATIVAÇÃO EM MASSA
    // ============================================================
    function elegiveisSelecionados() {
        return avaliados.filter(item => !item.motivos.length && !item.ativado && !desmarcados.has(item.mlb));
    }

    window.marcarCandidatoRegras = function(mlb, marcado) {
        if (marcado) desmarcados.delete(mlb);
        else desmarcados.add(mlb);
        atualizarBotaoAtivar();
    };

    window.marcarTodosCandidatosRegras = function(marcado) {
        for (const item of avaliados) {
            if (item.motivos.length || item.ativado) continue;
            if (marcado) desmarcados.delete(item.mlb);
            else desmarcados.add(item.mlb);
        }
        renderizarResultado();
    };

    function atualizarBotaoAtivar() {
        const botao = document.getElementById('btnAtivarRegrasLote');
        if (!botao || ocupado.ativando) return;
        const total = elegiveisSelecionados().length;
        botao.disabled = total === 0;
        botao.innerHTML = `<i class="fas fa-play"></i> Ativar em massa (${total})`;
    }

    function resumoRegras() {
        return {
            desconto: {
                base: regras.descontoBase,
                min: numeroOuNulo(regras.descontoMin),
                max: numeroOuNulo(regras.descontoMax)
            },
            listas: Object.fromEntries(LISTAS
                .filter(lista => regras.listas[lista.chave]?.ativa)
                .map(lista => [lista.chave, {
                    precoMin: numeroOuNulo(regras.listas[lista.chave].precoMin),
                    precoMax: numeroOuNulo(regras.listas[lista.chave].precoMax),
                    total_na_lista: itensDaLista(lista.chave).length
                }])),
            categoriasExcluidas: regras.categoriasExcluidas
        };
    }

    window.executarAtivacaoRegrasLote = async function() {
        if (ocupado.ativando || !promocaoCarregada) return;
        const selecionados = elegiveisSelecionados();
        if (!selecionados.length) {
            toast('⚠️ Nenhum MLB selecionado', 'warning');
            return;
        }
        if (typeof window.ativarItemPromocaoML !== 'function') {
            toast('❌ Função de ativação indisponível. Recarregue a página.', 'error');
            return;
        }

        const promocao = promocaoCarregada;
        if (!confirm(`Ativar ${selecionados.length} MLB(s) na promoção "${promocao.name || promocao.id}"?`)) return;

        ocupado.ativando = true;
        const botao = document.getElementById('btnAtivarRegrasLote');
        if (botao) {
            botao.disabled = true;
            botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ativando...';
        }

        const ativados = [];
        const falhas = [];

        try {
            const token = await P().obterToken();

            for (let i = 0; i < selecionados.length; i++) {
                const item = selecionados[i];
                definirTexto(
                    'promoRegrasProgresso',
                    `Ativando ${i + 1}/${selecionados.length} • ${ativados.length} ok • ${falhas.length} falha(s)`
                );

                try {
                    const resposta = await window.ativarItemPromocaoML(
                        item.mlb,
                        promocao.id,
                        promocao.type,
                        item.precoPromocao,
                        token,
                        {
                            precoOriginal: item.precoOriginal,
                            promocaoNome: promocao.name,
                            origem: 'ativacao_regras'
                        }
                    );

                    if (resposta.success) {
                        ativados.push({ mlb: item.mlb, preco_promocao: item.precoPromocao, preco_original: item.precoOriginal });
                        const candidato = candidatos.find(c => c.mlb === item.mlb);
                        if (candidato) candidato.ativado = true;
                        window.ajustarExposicaoPorPromocaoAtivada?.(item.mlb, item.precoOriginal, item.precoPromocao, token)
                            ?.catch?.(() => {});
                    } else {
                        falhas.push({ mlb: item.mlb, erro: resposta.error || `HTTP ${resposta.status || '?'}` });
                    }
                } catch (error) {
                    falhas.push({ mlb: item.mlb, erro: error.message });
                }

                await P().dormir(120);
            }
        } catch (error) {
            toast(`❌ ${error.message}`, 'error');
        }

        definirTexto(
            'promoRegrasProgresso',
            `Concluído: ${ativados.length} ativado(s) • ${falhas.length} falha(s) em "${promocao.name || promocao.id}"`
        );

        await registrarExecucao(promocao, selecionados.length, ativados, falhas);

        if (ativados.length && !falhas.length) toast(`✅ ${ativados.length} MLB(s) ativados`, 'success');
        else if (ativados.length) toast(`⚠️ ${ativados.length} ativados e ${falhas.length} falharam — veja o registro`, 'warning');
        else toast(`❌ Nenhum MLB ativado (${falhas.length} falha(s)) — veja o registro`, 'error');

        ocupado.ativando = false;
        reavaliar();
    };

    // ============================================================
    // REGISTRO DAS ATIVAÇÕES EM MASSA
    // ============================================================
    async function registrarExecucao(promocao, enviados, ativados, falhas) {
        const db = P().supabase();
        if (!db) return;
        const { error } = await db.from(TABELA_REGISTRO).insert({
            promotion_id: String(promocao.id),
            promotion_type: promocao.type || null,
            promotion_name: promocao.name || null,
            regras: resumoRegras(),
            total_candidatos: candidatos.length,
            total_elegiveis: avaliados.filter(item => !item.motivos.length).length,
            total_enviados: enviados,
            sucessos: ativados.length,
            falhas: falhas.length,
            mlbs_ativados: ativados,
            falhas_detalhe: falhas,
            executado_por: nomeUsuario()
        });
        if (error) {
            log(`Não foi possível registrar a ativação: ${error.message}`, 'error');
            toast(`⚠️ Ativação feita, mas o registro falhou: ${error.message}`, 'warning');
        }
        await carregarRegistros();
    }

    async function carregarRegistros() {
        const db = P().supabase();
        if (!db) return;
        const { data, error } = await db
            .from(TABELA_REGISTRO)
            .select('*')
            .order('criado_em', { ascending: false })
            .limit(100);
        erroRegistros = error || null;
        registros = error ? [] : (data || []);
        renderizarRegistros();
    }
    window.carregarRegistrosAtivacaoRegras = carregarRegistros;

    window.exportarRegistroAtivacaoRegras = function(id) {
        const registro = registros.find(r => String(r.id) === String(id));
        if (!registro) return;
        P().exportarExcel(
            [
                ...(registro.mlbs_ativados || []).map(item => ({
                    MLB: item.mlb,
                    Situação: 'Ativado',
                    'Valor em promoção': Number(item.preco_promocao) || 0,
                    'Valor original': Number(item.preco_original) || 0,
                    Erro: ''
                })),
                ...(registro.falhas_detalhe || []).map(item => ({
                    MLB: item.mlb, Situação: 'Falhou', 'Valor em promoção': '', 'Valor original': '', Erro: item.erro || ''
                }))
            ],
            'Ativação em massa',
            `ativacao_massa_${registro.id}`
        );
    };

    // ============================================================
    // INTERFACE
    // ============================================================
    function htmlAbaMassa() {
        const linhasListas = LISTAS.map(lista => `
            <tr>
                <td style="text-align:center;">
                    <input type="checkbox" id="promoRegraAtiva_${lista.chave}" onchange="alterarRegrasLote()">
                </td>
                <td>
                    <strong>${esc(lista.nome)}</strong>
                    <br><a href="#" onclick="abrirAbaPromocoesLote('excluidos'); abrirListaExcluidos('${lista.chave}'); return false;"><small>ver lista</small></a>
                </td>
                <td style="text-align:center;" id="promoRegraTotal_${lista.chave}">0</td>
                <td>
                    <div class="d-flex gap-2 align-items-center" style="gap:6px;">
                        <input type="number" min="0" step="0.01" class="form-control form-control-sm" style="max-width:120px;"
                            id="promoRegraMin_${lista.chave}" placeholder="de R$" oninput="alterarRegrasLote()">
                        <span>a</span>
                        <input type="number" min="0" step="0.01" class="form-control form-control-sm" style="max-width:120px;"
                            id="promoRegraMax_${lista.chave}" placeholder="até R$" oninput="alterarRegrasLote()">
                    </div>
                </td>
                <td style="text-align:center;" id="promoRegraAfetados_${lista.chave}">—</td>
            </tr>`).join('');

        return `
        <div class="card mb-4">
            <div class="card-header">
                <h2 class="card-title"><i class="fas fa-bolt"></i> Ativação em massa por regras</h2>
                <small class="text-muted" id="promoRegrasStatusSalvo">As regras são salvas automaticamente.</small>
            </div>
            <div class="card-body">
                <h5 style="margin-bottom:8px;">1. Promoção</h5>
                <div class="row align-items-end">
                    <div class="col-md-9">
                        <select id="promoRegrasPromocao" class="form-control">
                            <option value="">Selecione a promoção...</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <button type="button" class="btn btn-primary" style="width:100%;" id="btnBuscarCandidatosRegras"
                            onclick="buscarCandidatosRegrasLote()">
                            <i class="fas fa-search"></i> Buscar candidatos
                        </button>
                    </div>
                </div>
                <small class="text-muted d-block mt-2" id="promoRegrasProgresso">Escolha a promoção e busque os candidatos.</small>

                <h5 style="margin:20px 0 8px;">2. Porcentagem elegível</h5>
                <div class="row align-items-end">
                    <div class="col-md-4">
                        <label>Considerar</label>
                        <select id="promoRegrasDescontoBase" class="form-control" onchange="alterarRegrasLote()">
                            <option value="total">Desconto total sobre o preço</option>
                            <option value="vendedor">% pago pelo vendedor</option>
                        </select>
                    </div>
                    <div class="col-md-4">
                        <label>Maior ou igual a (%)</label>
                        <input type="number" min="0" max="100" step="0.1" id="promoRegrasDescontoMin" class="form-control"
                            placeholder="sem mínimo" oninput="alterarRegrasLote()">
                    </div>
                    <div class="col-md-4">
                        <label>Menor ou igual a (%)</label>
                        <input type="number" min="0" max="100" step="0.1" id="promoRegrasDescontoMax" class="form-control"
                            placeholder="sem máximo" oninput="alterarRegrasLote()">
                    </div>
                </div>

                <h5 style="margin:20px 0 8px;">3. Listas de MLBs que não entram</h5>
                <small class="text-muted d-block mb-2">
                    Marque as listas que valem. Com faixa de preço, só sai da promoção quem está na lista
                    <strong>e</strong> tem preço de venda dentro da faixa. Sem faixa, sai a lista inteira.
                </small>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th style="width:60px; text-align:center;">Excluir</th>
                                <th>Lista</th>
                                <th style="text-align:center;">MLBs na lista</th>
                                <th>Faixa de preço de venda que não entra</th>
                                <th style="text-align:center;">Candidatos barrados</th>
                            </tr>
                        </thead>
                        <tbody>${linhasListas}</tbody>
                    </table>
                </div>

                <h5 style="margin:20px 0 8px;">4. Categorias que não entram</h5>
                <div id="promoRegrasCategorias"></div>
            </div>
        </div>

        <div class="card mb-4">
            <div class="card-header">
                <h2 class="card-title"><i class="fas fa-list-check"></i> MLBs que entram nas regras</h2>
                <div class="d-flex flex-wrap gap-2 align-items-center" style="gap:6px;">
                    <select id="promoRegrasFiltroResultado" class="form-control form-control-sm" style="max-width:190px;"
                        onchange="renderizarResultadoRegrasLote()">
                        <option value="entram">Somente os que entram</option>
                        <option value="excluidos">Somente os excluídos</option>
                        <option value="todos">Todos os candidatos</option>
                    </select>
                    <input type="text" id="promoRegrasBusca" class="form-control form-control-sm" style="max-width:180px;"
                        placeholder="Filtrar MLB ou título" oninput="renderizarResultadoRegrasLote()">
                    <button type="button" class="btn btn-sm btn-outline-success" onclick="exportarResultadoRegrasLote()">
                        <i class="fas fa-file-excel"></i> Exportar
                    </button>
                    <button type="button" class="btn btn-success" id="btnAtivarRegrasLote" disabled
                        onclick="executarAtivacaoRegrasLote()">
                        <i class="fas fa-play"></i> Ativar em massa (0)
                    </button>
                </div>
            </div>
            <div class="card-body">
                <small class="text-muted d-block mb-2" id="promoRegrasResumo">Nenhum candidato carregado.</small>
                <div class="table-responsive" style="max-height:560px; overflow-y:auto;">
                    <table class="table table-striped table-hover table-sm">
                        <thead>
                            <tr>
                                <th style="width:36px;">
                                    <input type="checkbox" id="promoRegrasMarcarTodos" checked
                                        onchange="marcarTodosCandidatosRegras(this.checked)">
                                </th>
                                <th>MLB</th>
                                <th>Título</th>
                                <th>Categoria</th>
                                <th style="text-align:right;">Preço de venda</th>
                                <th style="text-align:right;">Preço na promoção</th>
                                <th style="text-align:center;">Desconto</th>
                                <th style="text-align:center;">% vendedor</th>
                                <th>Situação</th>
                            </tr>
                        </thead>
                        <tbody id="promoRegrasResultadoBody">
                            <tr><td colspan="9" class="text-center text-muted py-4">Escolha a promoção no item "1. Promoção" acima e clique em "Buscar candidatos" — a lista dos que entram aparece aqui.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <div class="card mb-4">
            <div class="card-header">
                <h2 class="card-title"><i class="fas fa-clipboard-list"></i> Registro das ativações em massa</h2>
                <button type="button" class="btn btn-sm btn-primary" onclick="carregarRegistrosAtivacaoRegras()">
                    <i class="fas fa-sync-alt"></i> Atualizar
                </button>
            </div>
            <div class="card-body">
                <div class="table-responsive" style="max-height:420px; overflow-y:auto;">
                    <table class="table table-striped table-sm">
                        <thead>
                            <tr>
                                <th>Quando</th>
                                <th>Promoção</th>
                                <th>Regras usadas</th>
                                <th style="text-align:center;">Candidatos</th>
                                <th style="text-align:center;">Enviados</th>
                                <th style="text-align:center;">Ativados</th>
                                <th style="text-align:center;">Falhas</th>
                                <th>Por</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="promoRegrasRegistroBody">
                            <tr><td colspan="9" class="text-center text-muted py-4">Carregando...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    function preencherFormularioRegras() {
        const definir = (id, valor) => {
            const el = document.getElementById(id);
            if (el) el.value = valor ?? '';
        };
        definir('promoRegrasDescontoBase', regras.descontoBase || 'total');
        definir('promoRegrasDescontoMin', regras.descontoMin);
        definir('promoRegrasDescontoMax', regras.descontoMax);
        for (const lista of LISTAS) {
            const faixa = regras.listas[lista.chave] || {};
            const check = document.getElementById(`promoRegraAtiva_${lista.chave}`);
            if (check) check.checked = Boolean(faixa.ativa);
            definir(`promoRegraMin_${lista.chave}`, faixa.precoMin);
            definir(`promoRegraMax_${lista.chave}`, faixa.precoMax);
        }
    }

    function renderizarAfetadosPorLista(conjuntos) {
        for (const lista of LISTAS) {
            definirTexto(`promoRegraTotal_${lista.chave}`, String(conjuntos[lista.chave].size));
            if (!candidatos.length) {
                definirTexto(`promoRegraAfetados_${lista.chave}`, '—');
                continue;
            }
            const faixa = regras.listas[lista.chave] || {};
            const barrados = candidatos.filter(c =>
                conjuntos[lista.chave].has(c.mlb) && dentroDaFaixa(c.precoOriginal, faixa)).length;
            definirTexto(`promoRegraAfetados_${lista.chave}`, faixa.ativa ? String(barrados) : `(${barrados})`);
        }
    }

    function renderizarCategoriasRegras() {
        const alvo = document.getElementById('promoRegrasCategorias');
        if (!alvo) return;

        const contagem = new Map();
        let semVinculo = 0;
        for (const c of candidatos) {
            if (!c.categorias.length) semVinculo++;
            for (const categoria of c.categorias) contagem.set(categoria, (contagem.get(categoria) || 0) + 1);
        }
        // Categorias do sistema + excluídas que não existem mais no estoque.
        const todas = [...new Set([...categoriasSistema, ...regras.categoriasExcluidas])];

        const linhas = todas.map(categoria => `
            <label style="display:flex; align-items:center; gap:8px; padding:4px 0; margin:0; font-weight:normal;">
                <input type="checkbox" ${categoriaExcluida(categoria) ? 'checked' : ''}
                    onchange="alternarCategoriaExcluida(${indiceCategoria(categoria)}, this.checked)">
                <span>${esc(categoria)}</span>
                ${candidatos.length ? `<span class="promo-lote-contador">${contagem.get(categoria) || 0} candidato(s)</span>` : ''}
                ${categoriasSistema.includes(categoria) ? '' : '<small class="text-muted">(não existe mais no estoque)</small>'}
            </label>`).join('');

        alvo.innerHTML = `
            <small class="text-muted d-block mb-2">
                Categorias da Gestão de Estoque. O MLB pega a categoria do produto ao qual está vinculado;
                se estiver em mais de um produto, basta um deles estar numa categoria marcada para sair.
            </small>
            <div style="max-height:260px; overflow-y:auto; border:1px solid #e3e6ea; border-radius:8px; padding:8px 12px;">
                ${linhas || '<span class="text-muted">Nenhuma categoria encontrada no estoque.</span>'}
            </div>
            ${semVinculo
                ? `<small class="text-muted d-block mt-2">${semVinculo} candidato(s) sem produto vinculado no estoque — não são afetados pelo filtro de categoria.</small>`
                : ''}`;
    }

    function situacaoHtml(item) {
        if (item.ativado) return '<span class="badge badge-success">Ativado agora</span>';
        if (!item.motivos.length) return '<span class="badge badge-primary">Entra</span>';
        return item.motivos.map(m => `<small class="d-block text-danger">🚫 ${esc(m)}</small>`).join('');
    }

    function resultadoFiltrado() {
        const filtro = document.getElementById('promoRegrasFiltroResultado')?.value || 'entram';
        const busca = (document.getElementById('promoRegrasBusca')?.value || '').trim().toUpperCase();
        return avaliados.filter(item => {
            if (filtro === 'entram' && item.motivos.length) return false;
            if (filtro === 'excluidos' && !item.motivos.length) return false;
            if (!busca) return true;
            return item.mlb.toUpperCase().includes(busca) || item.titulo.toUpperCase().includes(busca);
        });
    }

    function renderizarResultado() {
        const body = document.getElementById('promoRegrasResultadoBody');
        if (!body) return;

        const entram = avaliados.filter(item => !item.motivos.length);
        const excluidos = avaliados.length - entram.length;
        definirTexto(
            'promoRegrasResumo',
            candidatos.length
                ? `${candidatos.length} candidato(s) • ${entram.length} entram nas regras • ${excluidos} excluído(s) • ` +
                  `${elegiveisSelecionados().length} selecionado(s) para ativar`
                : 'Nenhum candidato carregado ainda.'
        );

        const lista = resultadoFiltrado();
        if (!lista.length) {
            const filtro = document.getElementById('promoRegrasFiltroResultado')?.value || 'entram';
            let mensagem;
            if (!candidatos.length) {
                mensagem = mensagemResultado
                    ? esc(mensagemResultado)
                    : 'Escolha a promoção no item "1. Promoção" acima e clique em "Buscar candidatos" — a lista dos que entram aparece aqui.';
            } else if (filtro === 'entram' && !entram.length && !(document.getElementById('promoRegrasBusca')?.value || '').trim()) {
                mensagem = `Todos os ${candidatos.length} candidato(s) foram barrados pelas regras. ` +
                    'Troque o filtro para "Somente os excluídos" para ver o motivo de cada um.';
            } else {
                mensagem = 'Nenhum MLB nesse filtro.';
            }
            body.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">${mensagem}</td></tr>`;
            atualizarBotaoAtivar();
            return;
        }

        body.innerHTML = lista.map(item => {
            const selecionavel = !item.motivos.length && !item.ativado;
            return `
            <tr${item.motivos.length ? ' style="opacity:.7;"' : ''}>
                <td>
                    ${selecionavel
                        ? `<input type="checkbox" ${desmarcados.has(item.mlb) ? '' : 'checked'} onchange="marcarCandidatoRegras('${esc(item.mlb)}', this.checked)">`
                        : ''}
                </td>
                <td><strong>${esc(item.mlb)}</strong></td>
                <td>${esc(item.titulo)}</td>
                <td><small>${esc(item.categorias.join(', ') || SEM_CATEGORIA)}</small></td>
                <td style="text-align:right;">${moeda(item.precoOriginal)}</td>
                <td style="text-align:right; font-weight:600;">${moeda(item.precoPromocao)}</td>
                <td style="text-align:center;">${formatarPct(item.desconto)}</td>
                <td style="text-align:center;">${formatarPct(item.percentVendedor)}</td>
                <td>${situacaoHtml(item)}</td>
            </tr>`;
        }).join('');
        atualizarBotaoAtivar();
    }
    window.renderizarResultadoRegrasLote = renderizarResultado;

    window.exportarResultadoRegrasLote = function() {
        P().exportarExcel(
            resultadoFiltrado().map(item => ({
                MLB: item.mlb,
                Título: item.titulo,
                Categoria: item.categorias.join(', ') || SEM_CATEGORIA,
                'Preço de venda': item.precoOriginal || 0,
                'Preço na promoção': item.precoPromocao || 0,
                'Desconto %': Number.isFinite(item.desconto) ? Number(item.desconto.toFixed(1)) : '',
                '% vendedor': Number.isFinite(item.percentVendedor) ? Number(item.percentVendedor.toFixed(1)) : '',
                Situação: item.ativado ? 'Ativado' : item.motivos.length ? 'Excluído' : 'Entra',
                Motivos: item.motivos.join(' | ')
            })),
            'Regras promoção',
            `promocao_regras_${promocaoCarregada?.id || 'candidatos'}`
        );
    };

    function textoRegrasRegistro(r) {
        const partes = [];
        const d = r?.desconto || {};
        if (d.min != null || d.max != null) {
            const base = d.base === 'vendedor' ? '% vendedor' : 'desconto';
            partes.push(`${base} ${d.min != null ? `≥ ${d.min}%` : ''}${d.min != null && d.max != null ? ' e ' : ''}${d.max != null ? `≤ ${d.max}%` : ''}`);
        }
        for (const [chave, faixa] of Object.entries(r?.listas || {})) {
            const nome = LISTAS.find(l => l.chave === chave)?.nome || chave;
            partes.push(`sem "${nome}"${textoFaixa({ precoMin: faixa.precoMin, precoMax: faixa.precoMax })}`);
        }
        if (r?.categoriasExcluidas?.length) partes.push(`${r.categoriasExcluidas.length} categoria(s) excluída(s)`);
        return partes.join(' • ') || 'sem filtros';
    }

    function renderizarRegistros() {
        const body = document.getElementById('promoRegrasRegistroBody');
        if (!body) return;
        if (erroRegistros) {
            const naoExiste = erroRegistros.code === 'PGRST205' || erroRegistros.code === '42P01' ||
                /could not find the table|does not exist/i.test(erroRegistros.message || '');
            body.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-4"><i class="fas fa-exclamation-triangle"></i> ${
                naoExiste
                    ? `A tabela <strong>${TABELA_REGISTRO}</strong> ainda não foi criada no Supabase. Rode o SQL que está no topo do arquivo promocoes_regras_lote.js.`
                    : `Erro ao carregar: ${esc(erroRegistros.message)}`
            }</td></tr>`;
            return;
        }
        if (!registros.length) {
            body.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">Nenhuma ativação em massa registrada.</td></tr>';
            return;
        }
        body.innerHTML = registros.map(r => `
            <tr>
                <td>${dataHora(r.criado_em)}</td>
                <td>${esc(r.promotion_name || r.promotion_id || '—')}<br><small class="text-muted">${esc(r.promotion_type || '')}</small></td>
                <td><small>${esc(textoRegrasRegistro(r.regras))}</small></td>
                <td style="text-align:center;">${Number(r.total_candidatos) || 0}</td>
                <td style="text-align:center;">${Number(r.total_enviados) || 0}</td>
                <td style="text-align:center;" class="text-success"><strong>${Number(r.sucessos) || 0}</strong></td>
                <td style="text-align:center;" class="${Number(r.falhas) ? 'text-danger' : ''}">${Number(r.falhas) || 0}</td>
                <td>${esc(r.executado_por || '')}</td>
                <td>
                    <button type="button" class="btn btn-sm btn-outline-success" onclick="exportarRegistroAtivacaoRegras('${esc(r.id)}')" title="Exportar MLBs">
                        <i class="fas fa-file-excel"></i>
                    </button>
                </td>
            </tr>`).join('');
    }

    // ---------- Painéis das listas de excluídos ----------
    function htmlPainelLista(chave) {
        const lista = LISTAS.find(l => l.chave === chave);
        const itens = itensDaLista(chave);
        const colunasExtras = {
            vendidos: ['Unidades', 'Pedidos', 'Faturamento', 'Última venda'],
            semME: ['Forma de envio'],
            bloqueados: ['Status'],
            classicos: ['Status']
        }[chave] || [];

        const botoes = [];
        if (chave === 'vendidos') {
            botoes.push(`<button type="button" class="btn btn-sm btn-primary" onclick="atualizarVendidos40Dias()" ${ocupado.vendidos ? 'disabled' : ''}>
                <i class="fas ${ocupado.vendidos ? 'fa-spinner fa-spin' : 'fa-sync-alt'}"></i> ${ocupado.vendidos ? 'Buscando...' : 'Atualizar vendas no ML'}</button>`);
        }
        if (chave === 'semME') {
            botoes.push(`<button type="button" class="btn btn-sm btn-primary" onclick="atualizarSemMercadoEnvios()" ${ocupado.semME ? 'disabled' : ''}>
                <i class="fas ${ocupado.semME ? 'fa-spinner fa-spin' : 'fa-sync-alt'}"></i> ${ocupado.semME ? 'Verificando...' : 'Verificar anúncios no ML'}</button>`);
        }
        botoes.push(`<button type="button" class="btn btn-sm btn-outline-secondary" onclick="copiarListaExcluidos('${chave}')"><i class="fas fa-copy"></i> Copiar</button>`);
        botoes.push(`<button type="button" class="btn btn-sm btn-outline-success" onclick="exportarListaExcluidos('${chave}')"><i class="fas fa-file-excel"></i> Exportar Excel</button>`);

        let info = `${itens.length} MLB(s).`;
        if (chave === 'vendidos') {
            info += vendidos.atualizado_em ? ` Atualizado em ${dataHora(vendidos.atualizado_em)}.` : ' Ainda não foi buscada — clique em "Atualizar vendas no ML".';
        } else if (chave === 'semME') {
            info += semME.atualizado_em
                ? ` ${semME.total_verificados || 0} anúncios ativos verificados em ${dataHora(semME.atualizado_em)}.`
                : ' Ainda não foi verificada — clique em "Verificar anúncios no ML".';
        } else if (chave === 'classicos') {
            info += ' Lista "Sempre CLÁSSICO" da Gestão de Estoque (edite por lá).';
        } else if (chave === 'bloqueados') {
            info = `Preço de venda dos ${itens.length} MLB(s) bloqueados.`;
        }

        const celulasExtras = item => {
            if (chave === 'vendidos') {
                return `<td style="text-align:center;">${Number(item.unidades) || 0}</td>
                    <td style="text-align:center;">${Number(item.pedidos) || 0}</td>
                    <td style="text-align:right;">${moeda(item.faturamento)}</td>
                    <td>${dataHora(item.ultima_venda)}</td>`;
            }
            if (chave === 'semME') return `<td>${esc(ROTULOS_MODO_ENVIO[item.modo_envio] || item.modo_envio || '—')}</td>`;
            if (chave === 'bloqueados' || chave === 'classicos') return `<td>${esc(item.status || '—')}</td>`;
            return '';
        };

        const colunas = 3 + colunasExtras.length;
        const linhas = itens.length
            ? itens.map(item => `
                <tr>
                    <td><strong>${esc(item.mlb)}</strong></td>
                    <td>${esc(item.titulo || '')}</td>
                    <td style="text-align:right;">${moeda(item.preco)}</td>
                    ${celulasExtras(item)}
                </tr>`).join('')
            : `<tr><td colspan="${colunas}" class="text-center text-muted py-4">Nenhum MLB na lista.</td></tr>`;

        return `
        <div class="card mb-4">
            <div class="card-header">
                <h2 class="card-title">${esc(chave === 'bloqueados' ? 'Preço de venda dos bloqueados' : lista.nome)}
                    <span class="badge badge-primary">${itens.length}</span></h2>
                <div class="d-flex flex-wrap gap-2 align-items-center" style="gap:6px;">${botoes.join('')}</div>
            </div>
            <div class="card-body">
                <small class="text-muted d-block mb-2" id="promoListaInfo_${chave}">${esc(info)}</small>
                <div class="table-responsive" style="max-height:520px; overflow-y:auto;">
                    <table class="table table-striped table-hover table-sm">
                        <thead>
                            <tr>
                                <th>MLB</th>
                                <th>Título</th>
                                <th style="text-align:right;">Preço de venda</th>
                                ${colunasExtras.map(c => `<th>${esc(c)}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>${linhas}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    function htmlPainelCategorias() {
        const mlbsPorCategoria = new Map();
        for (const [, categorias] of categoriasPorMlb) {
            for (const categoria of categorias) mlbsPorCategoria.set(categoria, (mlbsPorCategoria.get(categoria) || 0) + 1);
        }

        const linhas = regras.categoriasExcluidas.length
            ? regras.categoriasExcluidas.map(categoria => `
                <tr>
                    <td>${esc(categoria)}</td>
                    <td style="text-align:center;">${mlbsPorCategoria.get(categoria) || 0}</td>
                    <td style="text-align:right;">
                        <button type="button" class="btn btn-sm btn-outline-danger" onclick="alternarCategoriaExcluida(${indiceCategoria(categoria)}, false)">
                            <i class="fas fa-times"></i> Remover
                        </button>
                    </td>
                </tr>`).join('')
            : '<tr><td colspan="3" class="text-center text-muted py-4">Nenhuma categoria excluída.</td></tr>';

        return `
        <div class="card mb-4">
            <div class="card-header">
                <h2 class="card-title">Categorias excluídas <span class="badge badge-primary">${regras.categoriasExcluidas.length}</span></h2>
            </div>
            <div class="card-body">
                <small class="text-muted d-block mb-2">
                    Categorias da Gestão de Estoque cujos MLBs vinculados não entram na ativação em massa por regras.
                    Para marcar novas categorias, use a aba "Ativação em massa por regras".
                </small>
                <table class="table table-sm">
                    <thead><tr><th>Categoria</th><th style="text-align:center;">MLBs vinculados</th><th></th></tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>
        </div>`;
    }

    function renderizarListas() {
        for (const chave of ['bloqueados', 'vendidos', 'classicos', 'semME']) {
            const alvo = document.getElementById(`promoListaArea_${chave}`);
            if (alvo) alvo.innerHTML = htmlPainelLista(chave);
        }
        const alvoCategorias = document.getElementById('promoListaArea_categorias');
        if (alvoCategorias) alvoCategorias.innerHTML = htmlPainelCategorias();

        for (const lista of LISTAS) {
            definirTexto(`promoContador_${lista.chave}`, String(itensDaLista(lista.chave).length));
        }
        definirTexto('promoContador_categorias', String(regras.categoriasExcluidas.length));
    }

    // ============================================================
    // INICIALIZAÇÃO (chamada pelo promocoes_manager.js ao abrir a tela)
    // ============================================================
    window.iniciarPromocoesRegrasLote = async function() {
        if (!window.PromoML) {
            log('promocoes_historico.js não carregado — módulo de regras indisponível', 'error');
            return;
        }

        const area = document.getElementById('promoRegrasLoteArea');
        if (area && !document.getElementById('promoRegrasPromocao')) {
            area.innerHTML = htmlAbaMassa();
        }
        window.preencherPromocoesRegrasLote();

        if (iniciado) {
            renderizarListas();
            reavaliar();
            return;
        }
        iniciado = true;

        await Promise.all([
            carregarRegras(),
            carregarListasSalvas().catch(error => log(`Erro ao carregar listas: ${error.message}`, 'error')),
            carregarCategoriasSistema().catch(error => log(`Erro ao carregar categorias do sistema: ${error.message}`, 'error')),
            carregarRegistros()
        ]);

        preencherFormularioRegras();
        renderizarCategoriasRegras();
        renderizarListas();
        reavaliar();

        // Em segundo plano: preços das listas por ID e vendas recentes.
        (async () => {
            await completarPrecosListas();
            const idade = vendidos.atualizado_em ? Date.now() - new Date(vendidos.atualizado_em).getTime() : Infinity;
            if (idade > HORAS_AUTO_ATUALIZAR_VENDIDOS * 60 * 60 * 1000) {
                await window.atualizarVendidos40Dias({ silencioso: true });
            }
        })().catch(error => log(`Atualização automática falhou: ${error.message}`, 'error'));
    };
})();
