/* ============================================================
   WHEEL TECH · Colunas da Gestão de Estoque
   ------------------------------------------------------------
   (Substitui a antiga aba "Precificação inteligente", que foi excluída:
    tudo dela voltou para a Gestão de Estoque.)

   Para TODOS:
     - Botão "Colunas": cada usuário escolhe quais colunas aparecem
       (fica salvo neste navegador, por usuário).

   SÓ andressamiotto / ronald:
     - Colunas extras: valor de venda (un.), custo estimado, fornecedor(es),
       código do fornecedor, vendas, valor em estoque, projeção,
       sem venda há, níveis de estoque (os custos último/médio são
       desenhados pelo próprio estoque_gestao.js).
     - Fornecedores múltiplos: o mesmo produto pode ter vários fornecedores,
       cada um com o código do produto nele. Ficam na tabela `fornecedores`
       (nome_fornecedor, sku_fornecedor, sku_sistema) — a mesma que a aba
       Pedidos lê, então aparecem lá automaticamente.
     - Barra extra: Regras de nível, Relatório de estoque (R$),
       estimativa de custo por categoria, filtro "situação do custo".
   ============================================================ */
(function () {
    'use strict';

    const USUARIOS_RESTRITOS = ['andressamiotto', 'ronald'];
    const PREFIXO_CONFIG = 'wtEstoqueColunas:';

    // Colunas da tabela, na ordem em que aparecem. `base` = desenhadas pelo
    // estoque_gestao.js; as outras são injetadas aqui (antes de "Ações").
    // `restrita` = só aparece para os usuários restritos.
    const COLUNAS = [
        { key: 'id', rotulo: 'ID', base: true },
        { key: 'nome', rotulo: 'Nome Produto', base: true, fixa: true },
        { key: 'sku', rotulo: 'SKU', base: true },
        { key: 'mlb', rotulo: 'MLB', base: true },
        { key: 'estoque', rotulo: 'Estoque', base: true },
        { key: 'ultimo_custo', rotulo: 'Último custo', base: true, restrita: true, thId: 'thUltimoCusto' },
        { key: 'custo_medio', rotulo: 'Média custo', base: true, restrita: true, thId: 'thCustoMedio' },
        { key: 'sync', rotulo: 'Sincronizado?', base: true },
        { key: 'venda', rotulo: 'Valor de venda (un.)', restrita: true, ordem: 'venda', dica: 'Média unitária de todas as vendas do produto (valor da venda ÷ quantidade do SKU)' },
        { key: 'estimado', rotulo: 'Custo estimado', restrita: true, ordem: 'estimado' },
        { key: 'fornecedor', rotulo: 'Fornecedor', restrita: true, ordem: 'fornecedores' },
        { key: 'cod_fornecedor', rotulo: 'Cód. fornecedor', restrita: true, ordem: 'cod_fornecedor', dica: 'Código do produto no fornecedor' },
        { key: 'vendas', rotulo: 'Vendas', restrita: true, ordem: 'vendas' },
        { key: 'valor_estoque', rotulo: 'Valor em estoque', restrita: true, ordem: 'valor_estoque' },
        { key: 'projecao', rotulo: 'Projeção', restrita: true, ordem: 'projecao' },
        { key: 'sem_venda', rotulo: 'Sem venda há', restrita: true, ordem: 'sem_venda' },
        { key: 'niveis', rotulo: 'Níveis de estoque', restrita: true, ordem: 'niveis' },
        { key: 'acoes', rotulo: 'Ações', base: true }
    ];
    const COLUNAS_EXTRAS = COLUNAS.filter(c => !c.base);

    // ---------- helpers ----------
    function usuario() {
        return String((window.currentUser && window.currentUser.username) || '').trim().toLowerCase();
    }
    function restrito() { return USUARIOS_RESTRITOS.includes(usuario()); }
    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function brl(v) {
        return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    const VAZIO = '<span class="wtc-vazio">—</span>';
    function produtos() {
        try { return (typeof produtosEstoque !== 'undefined' && produtosEstoque) || []; } catch (e) { return []; }
    }
    function filtrados() {
        try { return (typeof produtosFiltradosAtuais !== 'undefined' && produtosFiltradosAtuais) || []; } catch (e) { return []; }
    }
    function produtoPorId(id) {
        return produtos().find(p => String(p.id) === String(id)) || null;
    }
    function mlbsDoProduto(p) {
        let m = p.mlb_codes || (p.dados_extra && p.dados_extra.mlb_codes) || [];
        if (typeof m === 'string') m = m.split(',').map(s => s.trim()).filter(Boolean);
        return Array.isArray(m) ? m.filter(Boolean).map(String) : [];
    }
    function custoDoProduto(p) {
        return Number(p.ultimo_custo || (p.dados_extra && p.dados_extra.ultimo_custo) ||
            p.custo_medio || (p.dados_extra && p.dados_extra.custo_medio) || 0) || 0;
    }
    function ultimoCustoDoProduto(p) {
        return Number(p.ultimo_custo || (p.dados_extra && p.dados_extra.ultimo_custo) || 0) || 0;
    }
    function custoMedioDoProduto(p) {
        return Number(p.custo_medio || (p.dados_extra && p.dados_extra.custo_medio) || 0) || 0;
    }
    function apiRegras() { return window.RegrasNivelEstoque || null; }
    function regras() {
        const r = apiRegras();
        return r && typeof r.regras === 'function' ? r.regras() : [];
    }
    function analise(p) {
        return p._analise || (window.WTEstoqueAnalise && window.WTEstoqueAnalise.metricaDe
            ? window.WTEstoqueAnalise.metricaDe(p.id) : null) || null;
    }
    function celulaAnalise(nome, p) {
        const c = window.WTEstoqueAnalise && window.WTEstoqueAnalise.celulas;
        if (!c || typeof c[nome] !== 'function') return VAZIO;
        try { return c[nome](analise(p), p); } catch (e) { return VAZIO; }
    }
    function telaGestaoAberta() {
        const el = document.getElementById('estoqueGestaoSystem');
        return !!el && !el.classList.contains('hidden');
    }
    async function buscarTudo(tabela, colunas) {
        const todos = [];
        for (let inicio = 0; ; inicio += 1000) {
            const { data, error } = await window.supabaseClient.from(tabela).select(colunas)
                .order('id', { ascending: true }).range(inicio, inicio + 999);
            if (error) throw error;
            todos.push(...(data || []));
            if (!data || data.length < 1000) break;
        }
        return todos;
    }

    // ==========================================================
    // VALOR DE VENDA UNITÁRIO = MÉDIA DAS VENDAS DO PRODUTO
    // ----------------------------------------------------------
    // Lê o histórico de vendas (tabela vendas_ml). O SKU da venda tem, nos
    // 3 primeiros caracteres, a quantidade de unidades que o anúncio vende
    // ("064RACR252PT" = 64 unidades do produto RACR252PT). Então, em cada
    // venda:
    //     unidades       = quantidade do SKU (3 dígitos) × quantidade comprada
    //     valor unitário = valor da venda ÷ unidades
    // Valor de venda do produto = total vendido ÷ total de unidades.
    // Vendas canceladas e vendas de kits com vários SKUs (separados por
    // ".") ficam de fora, porque o valor não dá para atribuir a um só produto.
    // ==========================================================
    const vendasAgregadas = new Map();   // "SKU_DA_VENDA|MLB" -> { skuBruto, mlb, receita, comprados, n, ultima }
    let versaoPrecos = 0;
    let vendasCarregadas = false;
    let carregandoVendas = null;
    let infoVendas = { pedidos: 0, desde: null, kitsIgnorados: 0, semSku: 0 };
    let indiceVendas = { chave: '', porSku: new Map(), naoLigadas: 0 };

    // Máximo que uma venda leva de uma vez (o maior é um raio, 72 un.). Um
    // prefixo maior que isso NÃO é quantidade.
    const QTD_MAXIMA_POR_VENDA = 72;

    // Chave para comparar SKUs mesmo com zeros à esquerda faltando/sobrando:
    //   "01093GAE021AGCX00000" -> "1093|GAE021AGCX00000"
    function chaveDeSku(sku) {
        const m = /^(\d*)(.*)$/.exec(String(sku || ''));
        return (m[1] ? String(parseInt(m[1], 10)) : '') + '|' + m[2];
    }

    async function carregarHistoricoVendas() {
        if (carregandoVendas) return carregandoVendas;
        const cli = window.supabaseClient;
        if (!cli) return;
        carregandoVendas = (async () => {
            const novo = new Map();
            let pedidos = 0, desde = null, kitsIgnorados = 0, semSku = 0;
            try {
                for (let inicio = 0; inicio < 60000; inicio += 1000) {
                    const { data, error } = await cli.from('vendas_ml')
                        .select('id, sku, item_id, mlb_id, quantidade, valor_total, status_ml, data_venda')
                        .order('id', { ascending: true })
                        .range(inicio, inicio + 999);
                    if (error) throw error;
                    (data || []).forEach(v => {
                        const status = String(v.status_ml || '').toLowerCase();
                        if (status === 'cancelled' || status === 'canceled' || status === 'invalid') return;
                        const total = Number(v.valor_total) || 0;
                        if (total <= 0) return;

                        const skuTexto = String(v.sku || '').trim();
                        if (!skuTexto) { semSku++; return; }
                        if (skuTexto.split('.').filter(Boolean).length > 1) { kitsIgnorados++; return; }

                        const comprados = Math.max(1, Number(v.quantidade) || 1);
                        const skuBruto = skuTexto.toUpperCase();
                        const mlb = String(v.item_id || v.mlb_id || '').trim().toUpperCase();
                        const chave = skuBruto + '|' + mlb;
                        const atual = novo.get(chave) || { skuBruto, mlb, receita: 0, comprados: 0, n: 0, ultima: null };
                        atual.receita += total;
                        atual.comprados += comprados;
                        atual.n += 1;
                        const d = v.data_venda ? new Date(v.data_venda) : null;
                        if (d && (!atual.ultima || d > atual.ultima)) atual.ultima = d;
                        if (d && (!desde || d < desde)) desde = d;
                        novo.set(chave, atual);
                        pedidos++;
                    });
                    if (!data || data.length < 1000) break;
                }
                vendasAgregadas.clear();
                novo.forEach((v, k) => vendasAgregadas.set(k, v));
                infoVendas = { pedidos, desde, kitsIgnorados, semSku };
                vendasCarregadas = true;
                versaoPrecos++;
            } catch (e) {
                console.warn('[estoque-colunas] histórico de vendas:', e.message || e);
            }
        })().finally(() => { carregandoVendas = null; });
        await carregandoVendas;
    }

    // Liga as vendas aos produtos SÓ pelo SKU (sem os 3 dígitos de quantidade).
    // Venda cujo SKU não bate com nenhum SKU do cadastro não entra.
    function garantirIndiceVendas() {
        const lista = produtos();
        const chave = versaoPrecos + '|' + lista.length + '|' + (lista[0] ? lista[0].id : '');
        if (indiceVendas.chave === chave) return indiceVendas;

        const skus = new Set(lista.map(p => String(p.sku || '').trim().toUpperCase()));
        const skuPorChave = new Map();
        skus.forEach(sku => { const k = chaveDeSku(sku); if (!skuPorChave.has(k)) skuPorChave.set(k, sku); });
        const porSku = new Map();
        let naoLigadas = 0;
        const somar = (mapa, k, v) => {
            const a = mapa.get(k) || { receita: 0, unidades: 0, n: 0, ultima: null };
            a.receita += v.receita; a.unidades += v.unidades; a.n += v.n;
            if (v.ultima && (!a.ultima || v.ultima > a.ultima)) a.ultima = v.ultima;
            mapa.set(k, a);
        };
        vendasAgregadas.forEach(v => {
            const skuVenda = v.skuBruto;

            // 1) SKU idêntico ao do cadastro: 1 unidade por venda
            if (skus.has(skuVenda)) {
                somar(porSku, skuVenda, { receita: v.receita, unidades: v.comprados, n: v.n, ultima: v.ultima });
                return;
            }

            const m = /^(\d*)(.*)$/.exec(skuVenda);
            const digitos = m[1], resto = m[2];

            // 2) 3 dígitos de quantidade (1 a 72) + SKU do cadastro
            if (digitos.length >= 3) {
                const qtd = parseInt(digitos.slice(0, 3), 10);
                if (qtd >= 1 && qtd <= QTD_MAXIMA_POR_VENDA) {
                    const sobra = digitos.slice(3);
                    const k = (sobra ? String(parseInt(sobra, 10)) : '') + '|' + resto;
                    const sku = skuPorChave.get(k);
                    if (sku) {
                        somar(porSku, sku, { receita: v.receita, unidades: qtd * v.comprados, n: v.n, ultima: v.ultima });
                        return;
                    }
                }
            }

            // 3) sem quantidade no SKU, com zero à esquerda faltando
            const skuSemQtd = skuPorChave.get(chaveDeSku(skuVenda));
            if (skuSemQtd) {
                somar(porSku, skuSemQtd, { receita: v.receita, unidades: v.comprados, n: v.n, ultima: v.ultima });
                return;
            }

            naoLigadas += v.n;
        });
        indiceVendas = { chave, porSku, naoLigadas };
        return indiceVendas;
    }

    function precoDoProduto(p) {
        const { porSku } = garantirIndiceVendas();
        const v = porSku.get(String(p.sku || '').trim().toUpperCase());
        if (!v || !v.unidades || v.receita <= 0) return null;
        return { media: v.receita / v.unidades, n: v.n, unidades: v.unidades, ultima: v.ultima };
    }

    function htmlValorVenda(p) {
        if (!vendasCarregadas) return '<span class="wtc-vazio">…</span>';
        const v = precoDoProduto(p);
        if (!v) return '<span class="wtc-vazio" title="Nenhuma venda registrada deste produto">sem vendas</span>';
        return `<strong>${brl(v.media)}</strong><br><small class="text-muted" title="${v.unidades} unidade(s) vendidas no total">${v.n} venda${v.n === 1 ? '' : 's'} · ${v.unidades} un.</small>`;
    }

    // ==========================================================
    // ESTIMATIVA DE CUSTO
    // ----------------------------------------------------------
    // Por categoria:
    //   margem de cada produto COM custo  = (venda − custo) / venda
    //   margem da categoria               = média dessas margens
    // Produto SEM custo:
    //   custo estimado = valor de venda do produto × (1 − margem da categoria)
    // ==========================================================
    function custoExatoDoProduto(p) {
        return ultimoCustoDoProduto(p) || custoMedioDoProduto(p) || 0;
    }
    function temCustoExato(p) { return custoExatoDoProduto(p) > 0; }

    let cacheEstimativa = { chave: '', dados: null };

    function assinaturaCustos() {
        let n = 0, soma = 0;
        produtos().forEach(p => { const c = custoExatoDoProduto(p); if (c > 0) { n++; soma += c; } });
        return n + ':' + Math.round(soma * 100);
    }

    function calcularEstimativas() {
        const chave = versaoPrecos + '|' + assinaturaCustos() + '|' + produtos().length;
        if (cacheEstimativa.chave === chave && cacheEstimativa.dados) return cacheEstimativa.dados;

        const cats = new Map();
        const cat = nome => {
            if (!cats.has(nome)) cats.set(nome, { nome, comCusto: 0, semCusto: 0, amostras: 0, descartadas: 0, somaMargens: 0, somaPrecoSem: 0, nPrecoSem: 0 });
            return cats.get(nome);
        };

        produtos().forEach(p => {
            const c = cat(p.categoria || 'Sem categoria');
            const v = precoDoProduto(p);
            if (temCustoExato(p)) {
                c.comCusto++;
                if (v && v.media > 0) {
                    const margem = (v.media - custoExatoDoProduto(p)) / v.media;
                    // custo maior que a venda, ou menor que 1% dela, é dado inconsistente
                    if (margem > 0 && margem < 0.99) { c.amostras++; c.somaMargens += margem; }
                    else c.descartadas++;
                }
            } else {
                c.semCusto++;
                if (v && v.media > 0) { c.somaPrecoSem += v.media; c.nPrecoSem++; }
            }
        });

        cats.forEach(c => {
            c.margem = c.amostras ? c.somaMargens / c.amostras : null;
            c.precoMedioSem = c.nPrecoSem ? c.somaPrecoSem / c.nPrecoSem : null;
            c.custoMedioEstimado = (c.margem != null && c.precoMedioSem != null) ? c.precoMedioSem * (1 - c.margem) : null;
        });

        const porProduto = new Map();
        produtos().forEach(p => {
            if (temCustoExato(p)) return;
            const c = cats.get(p.categoria || 'Sem categoria');
            const v = precoDoProduto(p);
            if (!c || c.margem == null || !v) return;
            porProduto.set(String(p.id), { custo: v.media * (1 - c.margem), margem: c.margem, preco: v.media, amostras: c.amostras });
        });

        const dados = { cats, porProduto };
        cacheEstimativa = { chave, dados };
        return dados;
    }

    function estimativaDoProduto(p) {
        return calcularEstimativas().porProduto.get(String(p.id)) || null;
    }

    function htmlCustoEstimado(p) {
        if (temCustoExato(p)) {
            const v = precoDoProduto(p);
            if (v && v.media > 0) {
                const m = (v.media - custoExatoDoProduto(p)) / v.media;
                return `<span class="wtc-vazio" title="Custo exato cadastrado">custo = ${((1 - m) * 100).toFixed(0)}% da venda</span>`;
            }
            return '<span class="wtc-vazio">custo exato</span>';
        }
        const e = estimativaDoProduto(p);
        if (e) {
            const pctCusto = (1 - e.margem) * 100;
            return `<span class="wtc-est" title="Venda média ${esc(brl(e.preco))} × ${pctCusto.toFixed(1)}% (custo médio dos ${e.amostras} produto(s) da categoria que têm custo)">≈ ${brl(e.custo)}<small>custo = ${pctCusto.toFixed(0)}% da venda</small></span>`;
        }
        if (!mlbsDoProduto(p).length) return '<span class="wtc-vazio" title="Produto sem MLB: não dá para ligar às vendas">sem MLB</span>';
        if (!vendasCarregadas) return '<span class="wtc-vazio">…</span>';
        if (!precoDoProduto(p)) return '<span class="wtc-vazio" title="Sem vendas no histórico: não há valor de venda para estimar">sem vendas</span>';
        return '<span class="wtc-vazio" title="Nenhum produto desta categoria tem custo e preço para servir de base">sem base</span>';
    }

    // ==========================================================
    // FORNECEDORES (vários por produto, cada um com o código dele)
    // ----------------------------------------------------------
    // Mesmas fontes da aba Pedidos (pedidos.js):
    //   1. tabela `fornecedores` (cadastrado à mão aqui ou ao vincular
    //      um item de entrada) — a única que dá para editar/excluir aqui
    //   2. itens de entradas (entrada_items + entradas_cards)
    //   3. fornecedor gravado no produto (dados_extra.fornecedor_nome)
    // O mesmo fornecedor escrito de jeitos diferentes ("ISAPA" /
    // "ISAPA IMPORTACAO E COMERCIO LTDA") vira um só.
    // ==========================================================
    let fornecedoresPorProduto = new Map();   // produtoId -> [{ chave, nome, codigos: [], linhasTabela: [{id, codigo}], deEntradas }]
    let nomesFornecedores = [];
    let fornecedoresCarregados = false;
    let carregandoFornecedores = null;
    let raizes = [];

    function normNome(nome) {
        return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
            .trim().toUpperCase().replace(/\s+/g, ' ');
    }
    function raizDoNome(n) { return raizes.find(r => n === r || n.startsWith(r + ' ')) || null; }
    function definirRaizes(nomes) {
        raizes = [];
        [...new Set(nomes.map(normNome).filter(Boolean))]
            .sort((a, b) => a.length - b.length)
            .forEach(n => { if (!raizDoNome(n)) raizes.push(n); });
    }
    function chaveFornecedor(nome) {
        const n = normNome(nome);
        return n ? (raizDoNome(n) || n) : '';
    }
    function normSku(v) { return String(v || '').trim().toUpperCase().replace(/\s+/g, ''); }
    // Código "xx" é marcador de "sem código": vale como vazio.
    function limparCodigo(v) {
        const c = String(v || '').trim();
        return c.toUpperCase() === 'XX' ? '' : c;
    }

    async function carregarFornecedores() {
        if (carregandoFornecedores) return carregandoFornecedores;
        if (!window.supabaseClient) return;
        carregandoFornecedores = (async () => {
            try {
                const [tabela, itens, cards] = await Promise.all([
                    buscarTudo('fornecedores', 'id, cd_fornecedor, nome_fornecedor, sku_fornecedor, sku_sistema'),
                    buscarTudo('entrada_items', 'id, entrada_id, produto_id, sku_original, sku_match, cd_fornecedor, fornecedor_nome, status'),
                    buscarTudo('entradas_cards', 'id, fornecedor')
                ]);

                const porSku = {};
                const porId = {};
                produtos().forEach(p => {
                    porId[String(p.id)] = p;
                    const s = normSku(p.sku);
                    if (!s) return;
                    porSku[s] = p;
                    const semZeros = s.replace(/^0+/, '');
                    if (semZeros && !porSku['~' + semZeros]) porSku['~' + semZeros] = p;
                });
                const acharSku = sku => {
                    const s = normSku(sku);
                    return s ? (porSku[s] || porSku['~' + s.replace(/^0+/, '')] || null) : null;
                };

                const ligacoes = [];
                tabela.forEach(l => ligacoes.push({
                    nome: l.nome_fornecedor, produto: acharSku(l.sku_sistema),
                    codigo: limparCodigo(l.sku_fornecedor) || limparCodigo(l.cd_fornecedor), idTabela: l.id
                }));
                const fornDoCard = {};
                cards.forEach(c => { fornDoCard[String(c.id)] = c.fornecedor || ''; });
                itens.forEach(it => {
                    const st = String(it.status || '').toLowerCase();
                    if (st === 'ignorado' || st === 'rejeitado') return;
                    ligacoes.push({
                        nome: it.fornecedor_nome || fornDoCard[String(it.entrada_id)],
                        produto: (it.produto_id && porId[String(it.produto_id)]) || acharSku(it.sku_match) || acharSku(it.sku_original),
                        codigo: limparCodigo(it.cd_fornecedor) || limparCodigo(it.sku_original)
                    });
                });
                produtos().forEach(p => {
                    const ex = p.dados_extra || {};
                    if (ex.fornecedor_nome) ligacoes.push({ nome: ex.fornecedor_nome, produto: p, codigo: ex.cd_fornecedor });
                });

                const validas = ligacoes.filter(l => l.produto && String(l.nome || '').trim());
                definirRaizes(validas.map(l => l.nome));

                const mapa = new Map();
                const nomePorChave = {};
                validas.forEach(l => {
                    const chave = chaveFornecedor(l.nome);
                    if (!chave) return;
                    const nome = String(l.nome).trim().replace(/\s+/g, ' ');
                    if (!nomePorChave[chave] || nome.length > nomePorChave[chave].length) nomePorChave[chave] = nome;

                    const pid = String(l.produto.id);
                    const lista = mapa.get(pid) || [];
                    let f = lista.find(x => x.chave === chave);
                    if (!f) { f = { chave, codigos: [], linhasTabela: [], deEntradas: false }; lista.push(f); }
                    const codigo = limparCodigo(l.codigo);
                    if (codigo && !f.codigos.some(c => c.toUpperCase() === codigo.toUpperCase())) f.codigos.push(codigo);
                    if (l.idTabela != null) f.linhasTabela.push({ id: l.idTabela, codigo });
                    else f.deEntradas = true;
                    mapa.set(pid, lista);
                });
                mapa.forEach(lista => {
                    lista.forEach(f => { f.nome = nomePorChave[f.chave] || f.chave; });
                    lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
                });

                fornecedoresPorProduto = mapa;
                nomesFornecedores = Object.values(nomePorChave).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
                fornecedoresCarregados = true;
            } catch (e) {
                console.warn('[estoque-colunas] fornecedores:', e.message || e);
            }
        })().finally(() => { carregandoFornecedores = null; });
        await carregandoFornecedores;
    }

    function fornecedoresDoProduto(p) {
        return fornecedoresPorProduto.get(String(p.id)) || [];
    }

    function htmlFornecedor(p) {
        if (!fornecedoresCarregados) return '<span class="wtc-vazio">…</span>';
        const lista = fornecedoresDoProduto(p);
        const linhas = lista.map(f => `<span class="wtc-linha" title="${esc(f.nome)}">${esc(f.nome)}</span>`).join('');
        return `<div class="wtc-forn">${linhas || VAZIO}
            <button type="button" class="wtc-editar" data-wtc-forn="${esc(p.id)}" title="Fornecedores deste produto (pode ter mais de um)"><i class="fas fa-pen"></i>${lista.length > 1 ? ' ' + lista.length : ''}</button></div>`;
    }

    function htmlCodFornecedor(p) {
        if (!fornecedoresCarregados) return '<span class="wtc-vazio">…</span>';
        const lista = fornecedoresDoProduto(p);
        if (!lista.length) return VAZIO;
        // uma linha por fornecedor, alinhada com a coluna "Fornecedor"
        return lista.map(f => `<span class="wtc-linha wtc-cod" title="${esc(f.nome)}">${f.codigos.length ? esc(f.codigos.join(' / ')) : '<span class="wtc-vazio">sem código</span>'}</span>`).join('');
    }

    // ---------- modal de fornecedores do produto ----------
    function abrirModalFornecedores(produtoId) {
        const p = produtoPorId(produtoId);
        if (!p || !restrito()) return;
        let ov = document.getElementById('wtcFornModal');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'wtcFornModal';
            ov.className = 'wtc-modal';
            document.body.appendChild(ov);
            ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        }
        const lista = fornecedoresDoProduto(p);
        const linhas = lista.map(f => {
            const daTabela = f.linhasTabela.map(l => `
                <span class="wtc-chip">${esc(l.codigo || 'sem código')}
                    <button type="button" data-wtc-del="${esc(l.id)}" title="Excluir este código/fornecedor do produto"><i class="fas fa-times"></i></button>
                </span>`).join('');
            const deEntrada = f.codigos.filter(c => !f.linhasTabela.some(l => String(l.codigo).toUpperCase() === c.toUpperCase()))
                .map(c => `<span class="wtc-chip fixo" title="Veio de uma entrada/NF — não dá para excluir aqui">${esc(c)}</span>`).join('');
            return `<tr>
                <td><strong>${esc(f.nome)}</strong>${f.deEntradas ? '<br><small class="text-muted">aparece nas entradas</small>' : ''}</td>
                <td>${daTabela}${deEntrada}${!daTabela && !deEntrada ? '<span class="wtc-vazio">sem código</span>' : ''}</td>
            </tr>`;
        }).join('');

        ov.innerHTML = `
            <div class="wtc-modal-caixa">
                <div class="wtc-modal-topo">
                    <div><strong>Fornecedores do produto</strong><br><small class="text-muted">${esc(p.nome)} · SKU ${esc(p.sku)}</small></div>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-wtc-fechar><i class="fas fa-times"></i></button>
                </div>
                <p class="text-muted" style="font-size:12px;margin:8px 0;">Quando dá para comprar o produto em mais de um fornecedor, cadastre todos aqui, cada um com o código do produto nele. A aba <strong>Pedidos</strong> usa esta lista.</p>
                <table class="table table-sm table-bordered" style="font-size:13px;">
                    <thead><tr><th>Fornecedor</th><th>Código do produto no fornecedor</th></tr></thead>
                    <tbody>${linhas || '<tr><td colspan="2" class="text-center text-muted">Nenhum fornecedor ainda.</td></tr>'}</tbody>
                </table>
                <div class="wtc-modal-add">
                    <input type="text" id="wtcFornNome" class="form-control form-control-sm" list="wtcFornNomes" placeholder="Fornecedor">
                    <datalist id="wtcFornNomes">${nomesFornecedores.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
                    <input type="text" id="wtcFornCodigo" class="form-control form-control-sm" placeholder="Código do produto no fornecedor">
                    <button type="button" class="btn btn-sm btn-success" data-wtc-add><i class="fas fa-plus"></i> Adicionar</button>
                </div>
            </div>`;

        ov.querySelector('[data-wtc-fechar]').addEventListener('click', () => ov.remove());
        ov.querySelector('[data-wtc-add]').addEventListener('click', () => adicionarFornecedor(p));
        ov.querySelector('#wtcFornCodigo').addEventListener('keydown', e => { if (e.key === 'Enter') adicionarFornecedor(p); });
        ov.querySelectorAll('[data-wtc-del]').forEach(b => b.addEventListener('click', () => excluirLigacao(p, b.dataset.wtcDel)));
        ov.querySelector('#wtcFornNome').focus();
    }

    async function adicionarFornecedor(p) {
        const nome = String(document.getElementById('wtcFornNome')?.value || '').trim().replace(/\s+/g, ' ');
        const codigo = limparCodigo(document.getElementById('wtcFornCodigo')?.value);
        if (!nome) { window.showToast && window.showToast('Informe o fornecedor.', 'warning'); return; }
        const jaTem = fornecedoresDoProduto(p).find(f => f.chave === chaveFornecedor(nome));
        if (jaTem && jaTem.codigos.some(c => c.toUpperCase() === codigo.toUpperCase()) && (codigo || jaTem.linhasTabela.length)) {
            window.showToast && window.showToast('Esse fornecedor/código já está no produto.', 'info');
            return;
        }
        try {
            const { error } = await window.supabaseClient.from('fornecedores').insert([{
                cd_fornecedor: codigo,
                nome_fornecedor: nome,
                sku_fornecedor: codigo,
                sku_sistema: p.sku,
                descricao_produto: p.nome
            }]);
            if (error) throw error;
            window.showToast && window.showToast(`✅ ${nome} adicionado ao produto.`, 'success');
            await recarregarFornecedores();
            abrirModalFornecedores(p.id);
        } catch (e) {
            console.error('[estoque-colunas] adicionar fornecedor:', e);
            window.showToast && window.showToast('❌ Erro ao salvar fornecedor: ' + (e.message || e), 'error');
        }
    }

    async function excluirLigacao(p, id) {
        if (!confirm('Excluir este fornecedor/código do produto?')) return;
        try {
            const { error } = await window.supabaseClient.from('fornecedores').delete().eq('id', id);
            if (error) throw error;
            window.showToast && window.showToast('Fornecedor removido do produto.', 'success');
            await recarregarFornecedores();
            abrirModalFornecedores(p.id);
        } catch (e) {
            console.error('[estoque-colunas] excluir fornecedor:', e);
            window.showToast && window.showToast('❌ Erro ao excluir: ' + (e.message || e), 'error');
        }
    }

    async function recarregarFornecedores() {
        fornecedoresCarregados = false;
        await carregarFornecedores();
        atualizarCelulas();
    }

    // ==========================================================
    // NÍVEIS DE ESTOQUE (escada de preços das regras de nível)
    // ==========================================================
    function rotuloDegrau(d) {
        const v = Number(d.valor) || 0;
        if (d.modo === 'soma') return (v >= 0 ? '+' : '') + brl(v);
        if (d.modo === 'fixo') return '= ' + brl(v);
        return (v > 0 ? '+' : '') + v + '%';
    }
    function regrasDoProduto(p) {
        const r = apiRegras();
        if (!r || typeof r.produtoNoEscopo !== 'function') return null;
        return regras().filter(g => { try { return r.produtoNoEscopo(p, g); } catch (e) { return false; } });
    }
    function htmlNiveis(p) {
        const aplicaveis = regrasDoProduto(p);
        if (!aplicaveis) return VAZIO;
        if (!aplicaveis.length) return '<span class="wtc-vazio">Sem regra</span>';
        const qtd = Number(p.quantidade) || 0;
        return aplicaveis.map(regra => {
            const escada = Array.isArray(regra.escada) ? regra.escada : [];
            const gatilho = Number(regra.gatilho_qtd) || (escada[0] && Number(escada[0].nivel)) || 0;
            const chips = escada.map(d => {
                const atual = Number(d.nivel) === qtd;
                return `<span class="wtc-nivel${atual ? ' atual' : ''}" title="Estoque ${d.nivel}: ${esc(rotuloDegrau(d))}"><b>${d.nivel}</b> ${esc(rotuloDegrau(d))}</span>`;
            }).join('');
            const situacao = qtd > gatilho ? `acima do gatilho (${gatilho})` : (qtd <= 0 ? 'sem estoque' : `no nível ${qtd}`);
            return `<div class="wtc-regra${regra.ativo === false ? ' pausada' : ''}">
                <div class="wtc-regra-topo">${esc(regra.nome || 'Regra')}${regra.ativo === false ? ' · pausada' : ''} <span>· ${esc(situacao)}</span></div>
                ${escada.length > 10
                    ? `<details><summary>${escada.length} níveis (do ${gatilho} ao 1)</summary><div class="wtc-chips">${chips}</div></details>`
                    : `<div class="wtc-chips">${chips || '<span class="wtc-vazio">sem degraus</span>'}</div>`}
            </div>`;
        }).join('');
    }

    // ==========================================================
    // CÉLULAS + ORDENAÇÃO
    // ==========================================================
    const CELULAS = {
        venda: htmlValorVenda,
        estimado: htmlCustoEstimado,
        fornecedor: htmlFornecedor,
        cod_fornecedor: htmlCodFornecedor,
        vendas: p => celulaAnalise('vendas', p),
        valor_estoque: p => celulaAnalise('valor', p),
        projecao: p => celulaAnalise('projecao', p),
        sem_venda: p => celulaAnalise('semVenda', p),
        niveis: htmlNiveis
    };

    // Chamado pelo sort de renderizarTabelaProdutos (estoque_gestao.js) para
    // colunas que ele não conhece. undefined = coluna não é daqui.
    const SEM_VALOR = Number.MAX_VALUE;
    function valorOrdenacao(coluna, p) {
        switch (coluna) {
            case 'venda': { const v = precoDoProduto(p); return v ? v.media : SEM_VALOR; }
            case 'estimado': { const e = estimativaDoProduto(p); return e ? e.custo : SEM_VALOR; }
            case 'fornecedores': return (fornecedoresDoProduto(p)[0] || { nome: '~' }).nome.toLowerCase();
            case 'cod_fornecedor': { const f = fornecedoresDoProduto(p).find(x => x.codigos.length); return f ? f.codigos[0].toLowerCase() : '~'; }
            case 'niveis': {
                const aplic = regrasDoProduto(p);
                if (!aplic || !aplic.length) return SEM_VALOR;
                return Math.min(...aplic.map(g => Number(g.gatilho_qtd) || 0));
            }
            default: return undefined;
        }
    }

    // Busca da Gestão também acha pelo fornecedor e pelo código do fornecedor.
    function buscaExtra(p, termo) {
        if (!restrito() || !termo) return false;
        return fornecedoresDoProduto(p).some(f =>
            f.nome.toLowerCase().includes(termo) || f.codigos.some(c => c.toLowerCase().includes(termo)));
    }

    // ==========================================================
    // ESCOLHA DE COLUNAS
    // ==========================================================
    function colunasDisponiveis() {
        const r = restrito();
        return COLUNAS.filter(c => r || !c.restrita);
    }
    function lerOcultas() {
        try {
            const v = JSON.parse(localStorage.getItem(PREFIXO_CONFIG + usuario()) || '[]');
            return new Set(Array.isArray(v) ? v : []);
        } catch (e) { return new Set(); }
    }
    function salvarOcultas(set) {
        try { localStorage.setItem(PREFIXO_CONFIG + usuario(), JSON.stringify(Array.from(set))); } catch (e) { /* sem storage: vale só nesta sessão */ }
        ocultasSessao = set;
    }
    let ocultasSessao = null;
    function ocultas() {
        if (!ocultasSessao || ocultasSessao._usuario !== usuario()) {
            ocultasSessao = lerOcultas();
            ocultasSessao._usuario = usuario();
        }
        return ocultasSessao;
    }

    function aplicarVisibilidade() {
        let st = document.getElementById('wtcVisibilidade');
        if (!st) {
            st = document.createElement('style');
            st.id = 'wtcVisibilidade';
            document.head.appendChild(st);
        }
        const esconder = Array.from(ocultas()).filter(k => !(COLUNAS.find(c => c.key === k) || {}).fixa);
        st.textContent = esconder.map(k => `#produtosEstoqueTable [data-wtcol="${k}"]{display:none !important;}`).join('\n');
        const botao = document.getElementById('wtcBtnColunas');
        if (botao) {
            const n = esconder.filter(k => colunasDisponiveis().some(c => c.key === k)).length;
            botao.querySelector('.wtc-qtd').textContent = n ? ` (${n} oculta${n > 1 ? 's' : ''})` : '';
        }
    }

    function desenharPainelColunas() {
        const painel = document.getElementById('wtcPainelColunas');
        if (!painel) return;
        const oc = ocultas();
        painel.innerHTML = `
            <div class="wtc-painel-topo"><strong>Colunas visíveis</strong>
                <a href="#" data-wtc-todas>Mostrar todas</a></div>
            ${colunasDisponiveis().map(c => `
                <label class="wtc-opcao${c.fixa ? ' fixa' : ''}">
                    <input type="checkbox" data-wtc-col="${c.key}" ${oc.has(c.key) && !c.fixa ? '' : 'checked'} ${c.fixa ? 'disabled' : ''}>
                    ${esc(c.rotulo)}${c.restrita ? ' <i class="fas fa-lock" title="Só Andressa e Ronald veem"></i>' : ''}
                </label>`).join('')}`;
        painel.querySelectorAll('input[data-wtc-col]').forEach(cb => cb.addEventListener('change', () => {
            const set = new Set(ocultas());
            if (cb.checked) set.delete(cb.dataset.wtcCol); else set.add(cb.dataset.wtcCol);
            set._usuario = usuario();
            salvarOcultas(set);
            aplicarVisibilidade();
        }));
        painel.querySelector('[data-wtc-todas]').addEventListener('click', e => {
            e.preventDefault();
            const set = new Set();
            set._usuario = usuario();
            salvarOcultas(set);
            aplicarVisibilidade();
            desenharPainelColunas();
        });
    }

    function garantirBotaoColunas() {
        if (document.getElementById('wtcBtnColunas')) return;
        const barra = document.querySelector('#estoqueGestaoSystem .card-header .d-flex');
        if (!barra) return;
        const wrap = document.createElement('span');
        wrap.className = 'wtc-colunas-wrap';
        wrap.innerHTML = `<button type="button" class="btn btn-outline-secondary" id="wtcBtnColunas" title="Escolher as colunas que aparecem na tabela"><i class="fas fa-table-columns"></i> Colunas<span class="wtc-qtd"></span></button>
            <div id="wtcPainelColunas" class="wtc-painel" style="display:none;"></div>`;
        barra.appendChild(wrap);
        const painel = wrap.querySelector('#wtcPainelColunas');
        wrap.querySelector('#wtcBtnColunas').addEventListener('click', e => {
            e.stopPropagation();
            const abrir = painel.style.display === 'none';
            if (abrir) desenharPainelColunas();
            painel.style.display = abrir ? 'block' : 'none';
        });
        painel.addEventListener('click', e => e.stopPropagation());
        document.addEventListener('click', () => { painel.style.display = 'none'; });
        aplicarVisibilidade();
    }

    // ==========================================================
    // BARRA EXTRA (só restritos): regras de nível, relatório,
    // estimativa por categoria, situação do custo, resumo
    // ==========================================================
    let resumoCatsAberto = false;

    // Relatório e Estimativa por categoria ficam no menu "Acessibilidade"
    // da Gestão (o botão Regras de nível é posto lá pelo regras_nivel_estoque.js).
    const ITENS_MENU = [
        {
            id: 'wtcBtnRelatorio',
            html: '<i class="fas fa-sack-dollar"></i> Relatório de estoque (R$)',
            dica: 'Quanto vale o estoque a preço de custo: por categoria, produto e período',
            acao: () => { if (typeof window.abrirRelatorioEstoqueValor === 'function') window.abrirRelatorioEstoqueValor(); }
        },
        {
            id: 'wtcToggleCats',
            html: '<i class="fas fa-chart-pie"></i> Estimativa de custo por categoria',
            dica: 'Mostra/esconde a tabela de estimativa de custo por categoria',
            acao: () => { resumoCatsAberto = !resumoCatsAberto; renderResumoCategorias(); }
        }
    ];

    function garantirItensMenu() {
        if (!restrito()) {
            ITENS_MENU.forEach(i => document.getElementById(i.id)?.remove());
            document.getElementById('btnRegrasNivelToolbar')?.remove();
            return;
        }
        const atual = document.getElementById('menuAcessibilidadeEstoqueDropdown');
        if (atual && ITENS_MENU.every(i => document.getElementById(i.id)?.parentElement === atual)) return;
        if (typeof window.garantirMenuAcessibilidadeEstoque !== 'function') return;
        const menu = window.garantirMenuAcessibilidadeEstoque();
        if (!menu) return;
        ITENS_MENU.forEach(item => {
            let b = document.getElementById(item.id);
            if (b) {
                if (b.parentElement !== menu) menu.appendChild(b);
                return;
            }
            b = document.createElement('button');
            b.id = item.id;
            b.type = 'button';
            b.title = item.dica;
            b.innerHTML = item.html;
            b.addEventListener('click', item.acao);
            if (typeof window.estilizarItemMenuAcessibilidadeEstoque === 'function') window.estilizarItemMenuAcessibilidadeEstoque(b);
            menu.appendChild(b);
        });
    }

    function garantirBarraExtra() {
        garantirItensMenu();
        let barra = document.getElementById('wtEstoqueAcoesExtra');
        if (!restrito()) { if (barra) barra.remove(); return; }
        if (barra) return;
        const header = document.querySelector('#estoqueGestaoSystem .card-header');
        if (!header) return;
        barra = document.createElement('div');
        barra.id = 'wtEstoqueAcoesExtra';
        barra.className = 'wtc-barra';
        barra.innerHTML = `<div id="wtcCats" style="display:none;"></div>`;
        header.insertAdjacentElement('afterend', barra);
    }

    // ==========================================================
    // BOTÃO "FILTROS"
    // ----------------------------------------------------------
    // Junta num painel os filtros que ficavam soltos na barra. Os campos
    // são os MESMOS (mesmos ids), só mudam de lugar — a filtragem do
    // estoque_gestao.js / estoque_analise.js continua lendo deles.
    // ==========================================================
    const FILTROS = [
        { key: 'categoria', rotulo: 'Categorias', ids: ['filtroCategoriaEstoque'] },
        { key: 'situacao', rotulo: 'Ativos', ids: ['filtroSituacaoEstoque'] },
        { key: 'status_custo', rotulo: 'Situação do custo', ids: ['wtcStatusCusto'], restrita: true },
        { key: 'estoque', rotulo: 'Estoque (qtd)', ids: ['analiseQtdOp', 'analiseQtdVal'], restrita: true },
        { key: 'custo', rotulo: 'Custo (R$)', ids: ['analiseCustoOp', 'analiseCustoVal'], restrita: true }
    ];
    let filtroAberto = '';

    function criarSelectStatusCusto() {
        if (document.getElementById('wtcStatusCusto')) return;
        const sel = document.createElement('select');
        sel.id = 'wtcStatusCusto';
        sel.className = 'form-control form-control-sm';
        sel.innerHTML = `
            <option value="">Todos</option>
            <option value="com">Só com custo exato</option>
            <option value="sem">Só sem custo</option>
            <option value="estimado">Sem custo, com estimativa</option>`;
        sel.addEventListener('change', refiltrar);
        document.body.appendChild(sel);   // vai para o painel logo em seguida
    }

    function textoOp(op) { return { lte: '≤', gte: '≥', eq: '=' }[op] || ''; }

    // Resumo do valor escolhido (aparece ao lado do nome do filtro). '' = sem filtro.
    function resumoFiltro(f) {
        const v = id => document.getElementById(id);
        const textoSelect = el => el && el.selectedIndex >= 0 ? el.options[el.selectedIndex].text.trim() : '';
        switch (f.key) {
            case 'categoria': { const s = v('filtroCategoriaEstoque'); return s && s.value ? textoSelect(s) : ''; }
            case 'situacao': { const s = v('filtroSituacaoEstoque'); return s && s.value && s.value !== 'ativos' ? textoSelect(s) : ''; }
            case 'status_custo': { const s = v('wtcStatusCusto'); return s && s.value ? textoSelect(s) : ''; }
            case 'estoque': { const o = v('analiseQtdOp'), n = v('analiseQtdVal'); return o && n && o.value && n.value !== '' ? `${textoOp(o.value)} ${n.value}` : ''; }
            case 'custo': { const o = v('analiseCustoOp'), n = v('analiseCustoVal'); return o && n && o.value && n.value !== '' ? `${textoOp(o.value)} ${brl(n.value)}` : ''; }
            default: return '';
        }
    }

    function filtrosDisponiveis() {
        const r = restrito();
        return FILTROS.filter(f => (r || !f.restrita) && f.ids.every(id => document.getElementById(id)));
    }

    function garantirBotaoFiltros() {
        if (restrito()) criarSelectStatusCusto();
        else document.getElementById('wtcStatusCusto')?.remove();

        let wrap = document.getElementById('wtcFiltrosWrap');
        if (!wrap) {
            const categoria = document.getElementById('filtroCategoriaEstoque');
            if (!categoria) return;
            wrap = document.createElement('span');
            wrap.id = 'wtcFiltrosWrap';
            wrap.className = 'wtc-colunas-wrap';
            wrap.innerHTML = `<button type="button" class="btn btn-outline-primary" id="wtcBtnFiltros" title="Filtrar por categoria, ativos, custo e estoque"><i class="fas fa-filter"></i> Filtros<span class="wtc-qtd"></span></button>
                <div id="wtcPainelFiltros" class="wtc-painel wtc-painel-filtros" style="display:none;"></div>`;
            categoria.insertAdjacentElement('beforebegin', wrap);
            const painel = wrap.querySelector('#wtcPainelFiltros');
            wrap.querySelector('#wtcBtnFiltros').addEventListener('click', e => {
                e.stopPropagation();
                const abrir = painel.style.display === 'none';
                painel.style.display = abrir ? 'block' : 'none';
                if (abrir) atualizarPainelFiltros();
            });
            painel.addEventListener('click', e => e.stopPropagation());
            // muda o resumo/contador conforme o usuário escolhe
            painel.addEventListener('change', () => setTimeout(atualizarPainelFiltros, 0));
            painel.addEventListener('input', () => setTimeout(atualizarContadorFiltros, 0));
            document.addEventListener('click', () => { painel.style.display = 'none'; });
        }
        montarPainelFiltros();
        atualizarContadorFiltros();
    }

    // Põe cada campo de filtro dentro do painel (só mexe no DOM se algo mudou).
    function montarPainelFiltros() {
        const painel = document.getElementById('wtcPainelFiltros');
        if (!painel) return;
        if (!painel.querySelector('.wtc-painel-topo')) {
            painel.innerHTML = `<div class="wtc-painel-topo"><strong>Filtros</strong><a href="#" data-wtc-limpar>Limpar filtros</a></div><div class="wtc-filtros-lista"></div>`;
            painel.querySelector('[data-wtc-limpar]').addEventListener('click', e => {
                e.preventDefault();
                if (typeof window.limparFiltrosEstoque === 'function') window.limparFiltrosEstoque();
                setTimeout(atualizarPainelFiltros, 0);
            });
        }
        const lista = painel.querySelector('.wtc-filtros-lista');
        const disponiveis = filtrosDisponiveis();
        // remove seções que não valem mais (ex.: trocou de usuário)
        lista.querySelectorAll('.wtc-filtro').forEach(sec => {
            if (!disponiveis.some(f => f.key === sec.dataset.filtro)) sec.remove();
        });
        disponiveis.forEach(f => {
            let sec = lista.querySelector(`.wtc-filtro[data-filtro="${f.key}"]`);
            if (!sec) {
                sec = document.createElement('div');
                sec.className = 'wtc-filtro';
                sec.dataset.filtro = f.key;
                sec.innerHTML = `<button type="button" class="wtc-filtro-topo"><span>${esc(f.rotulo)}</span><small class="wtc-filtro-valor"></small><i class="fas fa-chevron-down"></i></button>
                    <div class="wtc-filtro-campos"></div>`;
                sec.querySelector('.wtc-filtro-topo').addEventListener('click', () => {
                    filtroAberto = filtroAberto === f.key ? '' : f.key;
                    atualizarPainelFiltros();
                });
                // mantém a ordem da lista FILTROS
                const depois = Array.from(lista.children).find(el =>
                    FILTROS.findIndex(x => x.key === el.dataset.filtro) > FILTROS.findIndex(x => x.key === f.key));
                lista.insertBefore(sec, depois || null);
            }
            const campos = sec.querySelector('.wtc-filtro-campos');
            f.ids.forEach(id => {
                const el = document.getElementById(id);
                if (el && el.parentElement !== campos) {
                    el.style.width = '';
                    el.style.flex = id.endsWith('Op') ? '0 0 80px' : '1';
                    campos.appendChild(el);
                }
            });
        });
        // o grupo antigo "Estoque / Custo R$" do estoque_analise.js fica vazio: esconde
        const antigo = document.getElementById('analiseFiltrosWrap');
        if (antigo) antigo.style.display = 'none';
    }

    function atualizarPainelFiltros() {
        montarPainelFiltros();
        document.querySelectorAll('#wtcPainelFiltros .wtc-filtro').forEach(sec => {
            const f = FILTROS.find(x => x.key === sec.dataset.filtro);
            const valor = f ? resumoFiltro(f) : '';
            sec.querySelector('.wtc-filtro-valor').textContent = valor;
            sec.classList.toggle('com-valor', !!valor);
            sec.classList.toggle('aberto', filtroAberto === sec.dataset.filtro);
        });
        atualizarContadorFiltros();
    }

    function atualizarContadorFiltros() {
        const botao = document.getElementById('wtcBtnFiltros');
        if (!botao) return;
        const n = filtrosDisponiveis().filter(f => resumoFiltro(f)).length;
        botao.querySelector('.wtc-qtd').textContent = n ? ` (${n})` : '';
        botao.classList.toggle('btn-primary', n > 0);
        botao.classList.toggle('btn-outline-primary', n === 0);
    }

    function refiltrar() {
        if (typeof window.filtrarProdutosEstoque === 'function') window.filtrarProdutosEstoque();
        else if (typeof window.aplicarFiltrosEOrdenacao === 'function') window.aplicarFiltrosEOrdenacao();
    }

    function passaStatusCusto(p) {
        const status = document.getElementById('wtcStatusCusto')?.value || '';
        if (!status || !restrito()) return true;
        const tem = temCustoExato(p);
        if (status === 'com') return tem;
        if (status === 'sem') return !tem;
        if (status === 'estimado') return !tem && !!estimativaDoProduto(p);
        return true;
    }

    function renderResumoCategorias() {
        const caixa = document.getElementById('wtcCats');
        const botao = document.getElementById('wtcToggleCats');
        if (!caixa || !botao) return;
        caixa.style.display = resumoCatsAberto ? 'block' : 'none';
        botao.classList.toggle('active', resumoCatsAberto);
        if (!resumoCatsAberto) return;

        const { cats } = calcularEstimativas();
        const lista = Array.from(cats.values()).filter(c => c.semCusto > 0 || c.comCusto > 0)
            .sort((a, b) => b.semCusto - a.semCusto || a.nome.localeCompare(b.nome, 'pt-BR'));
        const pct = v => v == null ? VAZIO : (v * 100).toFixed(1).replace('.', ',') + '%';
        const dinheiro = v => v == null ? VAZIO : brl(v);

        caixa.innerHTML = `
            <div class="table-responsive">
            <table class="table table-sm table-bordered" style="background:#fff;font-size:12px;margin-top:8px;">
                <thead><tr>
                    <th>Categoria</th><th class="text-right">Com custo</th><th class="text-right">Sem custo</th>
                    <th class="text-right" title="Produtos com custo E vendas usados para calcular o percentual">Base do cálculo</th>
                    <th class="text-right" title="Média de (custo ÷ valor de venda) dos produtos com custo">Custo = % da venda</th>
                    <th class="text-right" title="Média do valor de venda dos produtos sem custo da categoria">Venda média (sem custo)</th>
                    <th class="text-right" title="Venda média × custo % da venda">Custo estimado médio</th>
                </tr></thead>
                <tbody>${lista.map(c => `
                    <tr>
                        <td>${esc(c.nome)}</td>
                        <td class="text-right">${c.comCusto}</td>
                        <td class="text-right">${c.semCusto}</td>
                        <td class="text-right">${c.amostras}${c.descartadas ? ` <small class="text-muted" title="custo maior que a venda (ou menor que 1%) ignorado">(+${c.descartadas} ignorado)</small>` : ''}</td>
                        <td class="text-right">${c.margem == null ? VAZIO : pct(1 - c.margem)}</td>
                        <td class="text-right">${dinheiro(c.precoMedioSem)}</td>
                        <td class="text-right"><strong>${dinheiro(c.custoMedioEstimado)}</strong></td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
            <small class="text-muted">Valor de venda de cada produto = média unitária de todas as vendas dele no histórico. Custo = % da venda: média (custo ÷ valor de venda) dos produtos da categoria que têm custo. Cada produto sem custo recebe: valor de venda médio dele × esse percentual. Recalcula sozinho quando um custo é lançado ou atualizado.</small>`;
    }

    // ==========================================================
    // TABELA: marca as colunas e injeta as extras
    // ==========================================================
    function marcarCabecalho() {
        const tr = document.querySelector('#produtosEstoqueTable thead tr');
        if (!tr) return;
        const ths = Array.from(tr.children).filter(th => !th.classList.contains('wtc-extra'));
        // ths[0] = checkbox; o resto segue a ordem das colunas base
        const bases = COLUNAS.filter(c => c.base);
        ths.slice(1).forEach((th, i) => { if (bases[i] && !th.dataset.wtcol) th.dataset.wtcol = bases[i].key; });

        const thAcoes = tr.querySelector('th[data-wtcol="acoes"]') || tr.lastElementChild;
        const ja = tr.querySelector('th.wtc-extra');
        if (!restrito()) {
            tr.querySelectorAll('th.wtc-extra').forEach(th => th.remove());
            return;
        }
        if (ja) return;
        COLUNAS_EXTRAS.forEach(c => {
            const th = document.createElement('th');
            th.className = 'wtc-extra';
            th.dataset.wtcol = c.key;
            th.dataset.coluna = c.ordem;
            th.style.cursor = 'pointer';
            if (c.key === 'niveis') th.style.minWidth = '260px';
            if (c.dica) th.title = c.dica;
            th.innerHTML = `${esc(c.rotulo)} <i class="fas fa-sort ordenacao-icon" style="font-size:11px;margin-left:5px;color:#adb5bd;"></i>`;
            th.addEventListener('click', () => window.ordenarEstoquePor(c.ordem));
            tr.insertBefore(th, thAcoes);
        });
    }

    // Colunas base presentes nas linhas (custos só existem para restritos).
    function basesNasLinhas() {
        return COLUNAS.filter(c => c.base && (!c.restrita || restrito()));
    }

    function marcarLinhas() {
        const tbody = document.getElementById('produtosEstoqueBody');
        if (!tbody) return;
        const bases = basesNasLinhas();
        const r = restrito();
        tbody.querySelectorAll('tr').forEach(tr => {
            const chk = tr.querySelector('.check-produto-massa');
            if (!chk) return;   // linha "nenhum produto"/"carregando"
            if (!tr.dataset.wtcMarcada) {
                const tds = Array.from(tr.children);
                tds.slice(1).forEach((td, i) => { if (bases[i]) td.dataset.wtcol = bases[i].key; });
                tr.dataset.wtcMarcada = '1';
            }
            if (!r || tr.querySelector('td.wtc-extra')) return;
            const p = produtoPorId(chk.dataset.produtoId);
            const tdAcoes = tr.querySelector('td[data-wtcol="acoes"]') || tr.lastElementChild;
            COLUNAS_EXTRAS.forEach(c => {
                const td = document.createElement('td');
                td.className = 'wtc-extra';
                td.dataset.wtcol = c.key;
                td.innerHTML = p ? CELULAS[c.key](p) : VAZIO;
                tr.insertBefore(td, tdAcoes);
            });
        });
    }

    // Redesenha só o conteúdo das células extras (depois de carregar dados).
    function atualizarCelulas() {
        if (!restrito()) return;
        const tbody = document.getElementById('produtosEstoqueBody');
        if (!tbody) return;
        tbody.querySelectorAll('tr').forEach(tr => {
            const chk = tr.querySelector('.check-produto-massa');
            if (!chk) return;
            const p = produtoPorId(chk.dataset.produtoId);
            if (!p) return;
            tr.querySelectorAll('td.wtc-extra').forEach(td => { td.innerHTML = CELULAS[td.dataset.wtcol](p); });
        });
        renderResumoCategorias();
    }

    function enfeitar() {
        if (!telaGestaoAberta() || !window.currentUser) return;
        garantirEstilo();
        garantirBotaoColunas();
        garantirBarraExtra();
        garantirBotaoFiltros();
        marcarCabecalho();
        marcarLinhas();
        if (restrito()) garantirDados();
    }

    // ---------- carregar dados (uma vez por sessão, com recarga periódica) ----------
    let dadosPedidos = false;
    async function garantirDados() {
        if (dadosPedidos || !window.supabaseClient || !produtos().length) return;
        dadosPedidos = true;
        const a = window.WTEstoqueAnalise;
        const r = apiRegras();
        await Promise.all([
            a && typeof a.garantirMetricas === 'function' ? a.garantirMetricas().catch(() => {}) : null,
            r && typeof r.carregar === 'function' ? r.carregar().catch(() => {}) : null,
            carregarFornecedores()
        ]);
        atualizarCelulas();
        await carregarHistoricoVendas();
        atualizarCelulas();
    }

    // ---------- observer ----------
    let observer = null;
    let obsTimer = null;
    function instalarObserver() {
        const tbody = document.getElementById('produtosEstoqueBody');
        if (!tbody || observer) return;
        observer = new MutationObserver(() => {
            clearTimeout(obsTimer);
            obsTimer = setTimeout(enfeitar, 60);
        });
        observer.observe(tbody, { childList: true });
    }

    // filtro "situação do custo" por cima dos filtros da Gestão
    function instalarPatchFiltro() {
        if (window.__wtcFiltroPatched || typeof window.aplicarFiltrosEOrdenacao !== 'function') return;
        window.__wtcFiltroPatched = true;
        const original = window.aplicarFiltrosEOrdenacao;
        window.aplicarFiltrosEOrdenacao = function () {
            const r = original.apply(this, arguments);
            const status = document.getElementById('wtcStatusCusto')?.value || '';
            if (status && restrito()) {
                const base = filtrados();
                const lista = base.filter(passaStatusCusto);
                if (lista.length !== base.length) {
                    try { produtosFiltradosAtuais = lista; } catch (e) { /* ignora */ }
                    if (typeof window.renderizarTabelaProdutos === 'function') window.renderizarTabelaProdutos(lista);
                }
            }
            return r;
        };
        if (typeof window.limparFiltrosEstoque === 'function') {
            const limpar = window.limparFiltrosEstoque;
            window.limparFiltrosEstoque = function () {
                ['wtcStatusCusto', 'analiseQtdOp', 'analiseQtdVal', 'analiseCustoOp', 'analiseCustoVal'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                const r = limpar.apply(this, arguments);
                setTimeout(atualizarPainelFiltros, 0);
                return r;
            };
        }
    }

    // ---------- estilo ----------
    function garantirEstilo() {
        if (document.getElementById('wtcEstilo')) return;
        const st = document.createElement('style');
        st.id = 'wtcEstilo';
        st.textContent = `
            #produtosEstoqueTable td.wtc-extra{vertical-align:top;font-size:12px;}
            #produtosEstoqueTable th.wtc-extra{white-space:nowrap;user-select:none;}
            .wtc-vazio{color:#adb5bd;font-size:12px;}
            .wtc-linha{display:block;line-height:20px;white-space:nowrap;}
            .wtc-cod{font-family:monospace;}
            .wtc-forn{position:relative;padding-right:22px;}
            .wtc-editar{position:absolute;top:0;right:0;border:0;background:none;color:#94a3b8;font-size:11px;padding:2px 4px;cursor:pointer;white-space:nowrap;}
            .wtc-editar:hover{color:#0d6efd;}
            .wtc-est{font-style:italic;color:#7c3aed;font-weight:600;}
            .wtc-est small{display:block;font-style:normal;font-weight:400;color:#94a3b8;}
            .wtc-regra{margin-bottom:6px;}
            .wtc-regra.pausada{opacity:.55;}
            .wtc-regra-topo{font-size:11px;color:#64748b;margin-bottom:2px;}
            .wtc-regra-topo span{color:#94a3b8;}
            .wtc-regra summary{cursor:pointer;font-size:12px;color:#475569;}
            .wtc-chips{display:flex;flex-wrap:wrap;gap:4px;}
            .wtc-nivel{font-size:11px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:1px 6px;white-space:nowrap;}
            .wtc-nivel b{color:#0f172a;}
            .wtc-nivel.atual{background:#7c3aed;border-color:#7c3aed;color:#fff;}
            .wtc-nivel.atual b{color:#fff;}
            .wtc-colunas-wrap{position:relative;display:inline-block;}
            .wtc-painel{position:absolute;right:0;top:calc(100% + 6px);z-index:1050;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.15);padding:10px 12px;min-width:240px;max-height:420px;overflow:auto;}
            .wtc-painel-topo{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:6px;font-size:13px;}
            .wtc-painel-topo a{font-size:12px;}
            .wtc-opcao{display:flex;align-items:center;gap:8px;font-size:13px;margin:0;padding:3px 0;cursor:pointer;font-weight:400;}
            .wtc-opcao.fixa{color:#94a3b8;cursor:default;}
            .wtc-opcao i{color:#94a3b8;font-size:10px;}
            .wtc-barra{padding:0 16px;}
            .wtc-painel-filtros{left:0;right:auto;width:320px;max-width:calc(100vw - 32px);padding:10px;}
            .wtc-filtro{border:1px solid #e2e8f0;border-radius:8px;margin-top:6px;}
            .wtc-filtro.com-valor{border-color:#93c5fd;background:#f8fbff;}
            .wtc-filtro-topo{display:flex;align-items:center;gap:8px;width:100%;border:0;background:none;padding:8px 10px;font-size:13px;font-weight:600;color:#334155;cursor:pointer;text-align:left;}
            .wtc-filtro-topo span{flex:0 0 auto;}
            .wtc-filtro-valor{flex:1;text-align:right;font-weight:500;color:#0d6efd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
            .wtc-filtro-topo i{color:#94a3b8;font-size:11px;transition:transform .15s;}
            .wtc-filtro.aberto .wtc-filtro-topo i{transform:rotate(180deg);}
            .wtc-filtro-campos{display:none;gap:6px;padding:0 10px 10px;}
            .wtc-filtro.aberto .wtc-filtro-campos{display:flex;}
            .wtc-filtro-campos .form-control{height:34px;min-width:0;}
            .wtc-rot{font-size:12px;color:#64748b;margin:0 0 0 8px;}
            .wtc-modal{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:2000;display:flex;align-items:flex-start;justify-content:center;padding:60px 16px;overflow:auto;}
            .wtc-modal-caixa{background:#fff;border-radius:10px;padding:16px;width:100%;max-width:620px;box-shadow:0 12px 40px rgba(15,23,42,.25);}
            .wtc-modal-topo{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;}
            .wtc-modal-add{display:flex;flex-wrap:wrap;gap:6px;}
            .wtc-modal-add input{flex:1;min-width:160px;}
            .wtc-chip{display:inline-flex;align-items:center;gap:4px;font-family:monospace;font-size:12px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:6px;padding:1px 6px;margin:2px 4px 2px 0;}
            .wtc-chip.fixo{background:#f1f5f9;border-color:#e2e8f0;}
            .wtc-chip button{border:0;background:none;color:#dc3545;padding:0 2px;cursor:pointer;font-size:11px;}
        `;
        document.head.appendChild(st);
    }

    // ---------- start ----------
    // clique no lápis de fornecedor (delegado: as linhas são recriadas)
    document.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('[data-wtc-forn]');
        if (!b) return;
        e.preventDefault();
        abrirModalFornecedores(b.dataset.wtcForn);
    });

    window.addEventListener('wt-regras-nivel-atualizadas', () => { if (telaGestaoAberta()) atualizarCelulas(); });

    // custo novo neste navegador → estimativas/valor recalculam
    let assinaturaAnterior = '';
    setInterval(() => {
        if (!telaGestaoAberta() || !restrito()) return;
        const a = assinaturaCustos();
        if (a !== assinaturaAnterior) { assinaturaAnterior = a; atualizarCelulas(); }
    }, 4000);

    // recarrega vendas e fornecedores de tempos em tempos (lançados por outras pessoas)
    setInterval(async () => {
        if (!telaGestaoAberta() || !restrito() || document.hidden) return;
        try {
            fornecedoresCarregados = false;
            await Promise.all([carregarFornecedores(), carregarHistoricoVendas()]);
            atualizarCelulas();
        } catch (e) { /* tenta de novo no próximo ciclo */ }
    }, 5 * 60 * 1000);

    let usuarioAnterior = '';
    setInterval(() => {
        instalarObserver();
        instalarPatchFiltro();
        if (usuario() !== usuarioAnterior) {
            // trocou de usuário: refaz cabeçalho/colunas escolhidas
            usuarioAnterior = usuario();
            ocultasSessao = null;
            document.querySelectorAll('#produtosEstoqueTable th.wtc-extra').forEach(th => th.remove());
            aplicarVisibilidade();
        }
        enfeitar();
    }, 1500);

    window.WTEstoqueColunas = {
        valorOrdenacao,
        buscaExtra,
        abrirFornecedores: abrirModalFornecedores,
        fornecedoresDoProduto,
        // usado pelo relatório de valor em estoque (relatorio_estoque_valor.js)
        relatorio: {
            produtos,
            ultimoCusto: ultimoCustoDoProduto,
            custoMedio: custoMedioDoProduto,
            estimativa: estimativaDoProduto
        }
    };
})();
