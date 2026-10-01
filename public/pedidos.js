// ================================================================
// PEDIDOS — WHEEL TECH
// ================================================================
//
// Monta a lista de compra de dois jeitos:
//
//   • Por fornecedor: escolhe um fornecedor e vêm todos os produtos
//     dele com o estoque atual. A lista de fornecedores é montada na
//     hora, a cada abertura/Atualizar, a partir da tabela
//     `fornecedores` + itens de todas as Entradas (inclusive as de
//     XML antigo, só registro) + fornecedor gravado no produto — ver
//     carregarLigacoesFornecedorPed.
//   • Por produto: filtra por categoria e/ou busca (mesma busca da
//     Gestão de Estoque) e a lista mostra fornecedor + estoque.
//
// Colunas clicáveis para ordenar, igual à Gestão de Estoque.
//
// "Não tem mais": quando o fornecedor deixou de ter um produto, o
// usuário marca e ele some da lista daquele fornecedor. O registro
// entra na aba "Sugestão de nível de estoque" até alguém resolver.
//
// SQL da tabela (rodar uma vez no Supabase):
//
// create table if not exists public.pedidos_produtos_banidos (
//     id bigserial primary key,
//     cd_fornecedor text,
//     nome_fornecedor text,
//     produto_id bigint not null,
//     sku_sistema text,
//     sku_fornecedor text,
//     motivo text,
//     sugestao_resolvida boolean not null default false,
//     resolvido_por text,
//     resolvido_em timestamptz,
//     criado_por text,
//     criado_em timestamptz not null default now()
// );
// create index if not exists pedidos_produtos_banidos_produto_idx
//     on public.pedidos_produtos_banidos (produto_id);
// ================================================================

(() => {
    'use strict';

    const CFG_PED = {
        tabelaBanidos: 'pedidos_produtos_banidos',
        tabelaFornecedores: 'fornecedores',
        tabelaProdutos: 'produtos_estoque',
        tamanhoPagina: 1000
    };

    // Fornecedor é sensível igual custo (ver estoque_analise.js) — o
    // módulo fica restrito a essas duas pessoas.
    const USUARIOS_PEDIDOS = ['andressamiotto', 'ronald'];

    let produtosPed = [];
    let produtoPorSkuPed = {};
    let fornecedoresPed = [];          // [{ chave, cd, nome, itens: [{ produto, skuFornecedor }] }]
    let fornecedoresPorProdutoPed = {}; // produtoId -> [{ chave, cd, nome, skuFornecedor }]
    let banidosPed = [];

    let modoPed = 'fornecedor';
    let abaPed = 'pedido';
    let fornecedorSelecionadoPed = '';
    let categoriaPed = '';
    let buscaPed = '';
    let ordemPed = { coluna: 'nome', direcao: 'asc' };
    const qtdPedidoPed = {};            // produtoId -> quantidade a pedir

    // ============================================================
    // HELPERS
    // ============================================================

    function escPed(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function usuarioAtualPed() {
        return window.currentUser || null;
    }

    function usernamePed() {
        const u = usuarioAtualPed();
        if (!u) return '';
        return String(u.username || u.name || '').trim().toLowerCase();
    }

    function podeUsarPedidosPed() {
        const u = usuarioAtualPed();
        return !!u && USUARIOS_PEDIDOS.includes(String(u.username || '').trim().toLowerCase());
    }

    function fmtDataPed(iso) {
        if (!iso) return '—';
        const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
        return `${dia}/${mes}/${ano}`;
    }

    function normSkuPed(valor) {
        return String(valor || '').trim().toUpperCase().replace(/\s+/g, '');
    }

    // Código de fornecedor "xx" é marcador de "sem código": vale como vazio.
    function limparCodigoPed(valor) {
        const c = String(valor || '').trim();
        return c.toUpperCase() === 'XX' ? '' : c;
    }

    function produtoPorSkuSistemaPed(sku) {
        const alvo = normSkuPed(sku);
        if (!alvo) return null;
        return produtoPorSkuPed[alvo] || produtoPorSkuPed['~' + alvo.replace(/^0+/, '')] || null;
    }

    // Na tabela `fornecedores`, cd_fornecedor é o código do PRODUTO no
    // fornecedor (igual ao sku_fornecedor) — o fornecedor em si só é
    // identificado pelo nome. O mesmo fornecedor aparece escrito de
    // jeitos diferentes ("ISAPA" / "ISAPA IMPORTACAO E COMERCIO LTDA",
    // "ROYAL" / "Royal"), então os nomes são agrupados: sem diferença
    // de maiúsculas/espaços e um nome que começa com outro nome inteiro
    // entra no grupo do mais curto.
    let raizesFornecedorPed = [];   // nomes normalizados, do mais curto ao mais longo

    function normNomeFornecedorPed(nome) {
        return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
            .trim().toUpperCase().replace(/\s+/g, ' ');
    }

    function raizDoNomePed(nomeNorm) {
        return raizesFornecedorPed.find(r => nomeNorm === r || nomeNorm.startsWith(r + ' ')) || null;
    }

    function definirRaizesFornecedorPed(nomes) {
        raizesFornecedorPed = [];
        [...new Set(nomes.map(normNomeFornecedorPed).filter(Boolean))]
            .sort((a, b) => a.length - b.length)
            .forEach(n => { if (!raizDoNomePed(n)) raizesFornecedorPed.push(n); });
    }

    function chaveFornecedorPed(nome) {
        const n = normNomeFornecedorPed(nome);
        if (!n) return '';
        return 'forn:' + (raizDoNomePed(n) || n);
    }

    function produtoEstaAtivoPed(p) {
        return !(p && p.dados_extra && p.dados_extra.inativo === true);
    }

    function produtoBanidoNoFornecedorPed(produtoId, chaveForn) {
        return banidosPed.some(b =>
            String(b.produto_id) === String(produtoId) &&
            chaveFornecedorPed(b.nome_fornecedor) === chaveForn
        );
    }

    function fornecedoresAtivosDoProdutoPed(produtoId) {
        return (fornecedoresPorProdutoPed[produtoId] || [])
            .filter(f => !produtoBanidoNoFornecedorPed(produtoId, f.chave));
    }

    function produtoCorrespondeBuscaPed(produto, palavra) {
        if (typeof produtoCorrespondeTermoBuscaEstoque === 'function') {
            return produtoCorrespondeTermoBuscaEstoque(produto, palavra);
        }
        return [produto.nome, produto.sku, produto.categoria]
            .some(campo => String(campo || '').toLowerCase().includes(palavra));
    }

    async function buscarTudoPed(tabela, colunas) {
        const todos = [];
        let inicio = 0;
        for (;;) {
            const { data, error } = await window.supabaseClient
                .from(tabela)
                .select(colunas)
                .order('id', { ascending: true })
                .range(inicio, inicio + CFG_PED.tamanhoPagina - 1);
            if (error) throw error;
            const lote = data || [];
            todos.push(...lote);
            if (lote.length < CFG_PED.tamanhoPagina) break;
            inicio += CFG_PED.tamanhoPagina;
        }
        return todos;
    }

    // ============================================================
    // CARREGAR
    // ============================================================

    async function carregarProdutosPed() {
        // Reaproveita a lista da Gestão de Estoque se ela já foi aberta.
        let lista = [];
        try {
            if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque) && produtosEstoque.length) {
                lista = produtosEstoque;
            }
        } catch (e) { /* estoque_gestao.js não carregado */ }

        if (!lista.length) {
            lista = await buscarTudoPed(CFG_PED.tabelaProdutos, 'id, sku, nome, categoria, quantidade, dados_extra');
        }

        produtosPed = lista.filter(produtoEstaAtivoPed);
        produtoPorSkuPed = {};
        produtosPed.forEach(p => {
            const sku = normSkuPed(p.sku);
            if (!sku) return;
            produtoPorSkuPed[sku] = p;
            const semZeros = sku.replace(/^0+/, '');
            if (semZeros && !produtoPorSkuPed['~' + semZeros]) produtoPorSkuPed['~' + semZeros] = p;
        });
    }

    // Ligações fornecedor ↔ produto vêm de três lugares, pra lista
    // estar sempre em dia com as Entradas (sem depender de alguém
    // vincular o SKU na tabela `fornecedores`):
    //   1. tabela `fornecedores` (mapeamento SKU fornecedor → SKU sistema)
    //   2. itens de TODAS as entradas — XML, Excel, rastreio e também as
    //      de "XML antigo" (só registro de custo/fornecedor, sem estoque),
    //      inclusive as ainda pendentes; só ignorados/rejeitados ficam de fora
    //   3. fornecedor gravado no próprio produto (dados_extra.fornecedor_nome,
    //      preenchido ao confirmar uma entrada de XML antigo)
    async function carregarLigacoesFornecedorPed() {
        const [mapeamentos, itensEntrada, cardsEntrada] = await Promise.all([
            buscarTudoPed(CFG_PED.tabelaFornecedores, 'id, nome_fornecedor, sku_fornecedor, sku_sistema'),
            buscarTudoPed('entrada_items', 'id, entrada_id, produto_id, sku_original, sku_match, cd_fornecedor, fornecedor_nome, status'),
            buscarTudoPed('entradas_cards', 'id, fornecedor')
        ]);

        const produtoPorId = {};
        produtosPed.forEach(p => { produtoPorId[String(p.id)] = p; });

        const ligacoes = [];

        mapeamentos.forEach(l => {
            ligacoes.push({ nome: l.nome_fornecedor, produto: produtoPorSkuSistemaPed(l.sku_sistema), skuFornecedor: limparCodigoPed(l.sku_fornecedor) });
        });

        const fornecedorDoCard = {};
        cardsEntrada.forEach(c => { fornecedorDoCard[String(c.id)] = c.fornecedor || ''; });

        itensEntrada.forEach(it => {
            const status = String(it.status || '').toLowerCase();
            if (status === 'ignorado' || status === 'rejeitado') return;
            const produto = (it.produto_id && produtoPorId[String(it.produto_id)]) ||
                produtoPorSkuSistemaPed(it.sku_match) || produtoPorSkuSistemaPed(it.sku_original);
            ligacoes.push({
                nome: it.fornecedor_nome || fornecedorDoCard[String(it.entrada_id)],
                produto,
                skuFornecedor: limparCodigoPed(it.cd_fornecedor) || limparCodigoPed(it.sku_original)
            });
        });

        produtosPed.forEach(p => {
            const extra = p.dados_extra || {};
            if (extra.fornecedor_nome) {
                ligacoes.push({ nome: extra.fornecedor_nome, produto: p, skuFornecedor: limparCodigoPed(extra.cd_fornecedor) });
            }
        });

        return ligacoes.filter(l => l.produto && String(l.nome || '').trim());
    }

    async function carregarFornecedoresPed() {
        const ligacoes = await carregarLigacoesFornecedorPed();

        definirRaizesFornecedorPed(ligacoes.map(l => l.nome));

        const porChave = {};
        fornecedoresPorProdutoPed = {};

        ligacoes.forEach(l => {
            const chave = chaveFornecedorPed(l.nome);
            if (!chave) return;

            if (!porChave[chave]) {
                porChave[chave] = { chave, nome: '', itens: [], itemPorProduto: {} };
            }
            const forn = porChave[chave];
            // Mostra a grafia mais completa do nome.
            const nome = String(l.nome || '').trim().replace(/\s+/g, ' ');
            if (nome.length > forn.nome.length) forn.nome = nome;

            const skuFornecedor = String(l.skuFornecedor || '').trim();
            const jaTem = forn.itemPorProduto[l.produto.id];
            if (jaTem) {
                // mesmo produto por outra fonte: só completa o SKU do fornecedor
                if (!jaTem.skuFornecedor && skuFornecedor) jaTem.skuFornecedor = skuFornecedor;
                return;
            }

            const item = { produto: l.produto, skuFornecedor };
            forn.itemPorProduto[l.produto.id] = item;
            forn.itens.push(item);

            (fornecedoresPorProdutoPed[l.produto.id] = fornecedoresPorProdutoPed[l.produto.id] || []).push({
                chave, get skuFornecedor() { return item.skuFornecedor; }, get nome() { return forn.nome; }
            });
        });

        fornecedoresPed = Object.values(porChave)
            .filter(f => f.itens.length)
            .map(f => ({ chave: f.chave, nome: f.nome, itens: f.itens }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
    }

    async function carregarBanidosPed() {
        banidosPed = await buscarTudoPed(CFG_PED.tabelaBanidos, '*');
    }

    async function carregarTudoPed() {
        const corpo = document.getElementById('pedTabelaCorpo');
        if (corpo) corpo.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted"><div class="spinner"></div> Carregando...</td></tr>`;

        try {
            await carregarProdutosPed();
            await Promise.all([
                carregarFornecedoresPed(),
                carregarBanidosPed().catch(error => {
                    banidosPed = [];
                    console.error('❌ [Pedidos] Tabela de banidos:', error);
                    showToast('⚠️ Tabela pedidos_produtos_banidos não encontrada — rode o SQL do topo de pedidos.js no Supabase.', 'warning');
                })
            ]);

            preencherSelectsPed();
            renderizarPed();
        } catch (error) {
            console.error('❌ [Pedidos] Erro ao carregar:', error);
            if (corpo) corpo.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger">Erro ao carregar: ${escPed(error.message)}</td></tr>`;
        }
    }

    function preencherSelectsPed() {
        const selForn = document.getElementById('pedFornecedor');
        if (selForn) {
            selForn.innerHTML = `<option value="">Selecione o fornecedor...</option>` +
                fornecedoresPed.map(f => `<option value="${escPed(f.chave)}">${escPed(f.nome)} (${f.itens.length})</option>`).join('');
            if (fornecedoresPed.some(f => f.chave === fornecedorSelecionadoPed)) selForn.value = fornecedorSelecionadoPed;
            else fornecedorSelecionadoPed = '';
        }

        const selCat = document.getElementById('pedCategoria');
        if (selCat) {
            const categorias = [...new Set(produtosPed.map(p => String(p.categoria || '').trim()).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
            selCat.innerHTML = `<option value="">Todas as categorias</option>` +
                categorias.map(c => `<option value="${escPed(c)}">${escPed(c)}</option>`).join('');
            selCat.value = categorias.includes(categoriaPed) ? categoriaPed : '';
        }
    }

    // ============================================================
    // MONTAR LINHAS
    // ============================================================

    function linhasPorFornecedorPed() {
        const forn = fornecedoresPed.find(f => f.chave === fornecedorSelecionadoPed);
        if (!forn) return [];
        return forn.itens
            .filter(it => !produtoBanidoNoFornecedorPed(it.produto.id, forn.chave))
            .map(it => ({
                produto: it.produto,
                fornecedorTexto: forn.nome,
                skuFornecedor: it.skuFornecedor,
                fornecedor: forn
            }));
    }

    function linhasPorProdutoPed() {
        if (!categoriaPed && !buscaPed) return null;

        let lista = produtosPed;
        if (categoriaPed) lista = lista.filter(p => p.categoria === categoriaPed);
        if (buscaPed) {
            const palavras = buscaPed.split(/\s+/).filter(Boolean);
            lista = lista.filter(p => palavras.every(palavra => produtoCorrespondeBuscaPed(p, palavra)));
        }

        return lista.map(p => {
            const forns = fornecedoresAtivosDoProdutoPed(p.id);
            return {
                produto: p,
                fornecedorTexto: forns.map(f => f.nome).join(', '),
                skuFornecedor: forns.map(f => f.skuFornecedor).filter(Boolean).join(', '),
                semFornecedorAtivo: !forns.length && (fornecedoresPorProdutoPed[p.id] || []).length > 0
            };
        });
    }

    function valorOrdenacaoPed(linha, coluna) {
        const p = linha.produto;
        switch (coluna) {
            case 'sku': return String(p.sku || '').toLowerCase();
            case 'sku_fornecedor': return String(linha.skuFornecedor || '').toLowerCase();
            case 'nome': return String(p.nome || '').toLowerCase();
            case 'categoria': return String(p.categoria || '').toLowerCase();
            case 'fornecedor': return String(linha.fornecedorTexto || '').toLowerCase();
            case 'estoque': return Number(p.quantidade) || 0;
            case 'qtd': return Number(qtdPedidoPed[p.id]) || 0;
            default: return Number(p.id) || 0;
        }
    }

    function ordenarLinhasPed(linhas) {
        const { coluna, direcao } = ordemPed;
        const fator = direcao === 'asc' ? 1 : -1;
        return [...linhas].sort((a, b) => {
            const va = valorOrdenacaoPed(a, coluna);
            const vb = valorOrdenacaoPed(b, coluna);
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * fator;
            return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) * fator;
        });
    }

    function linhasAtuaisPed() {
        const linhas = modoPed === 'fornecedor' ? linhasPorFornecedorPed() : linhasPorProdutoPed();
        return linhas ? ordenarLinhasPed(linhas) : null;
    }

    // ============================================================
    // RENDERIZAR
    // ============================================================

    const COLUNAS_PED = {
        fornecedor: [
            ['sku', 'SKU'], ['sku_fornecedor', 'SKU fornecedor'], ['nome', 'Produto'],
            ['categoria', 'Categoria'], ['estoque', 'Estoque'], ['qtd', 'Qtd. pedir'], [null, '']
        ],
        produto: [
            ['sku', 'SKU'], ['nome', 'Produto'], ['categoria', 'Categoria'],
            ['fornecedor', 'Fornecedor'], ['sku_fornecedor', 'SKU fornecedor'], ['estoque', 'Estoque'], ['qtd', 'Qtd. pedir']
        ]
    };

    function renderizarCabecalhoPed() {
        const thead = document.getElementById('pedTabelaCabecalho');
        if (!thead) return;
        thead.innerHTML = `<tr>${COLUNAS_PED[modoPed].map(([col, rotulo]) => {
            if (!col) return `<th></th>`;
            const ativa = ordemPed.coluna === col;
            const icone = ativa ? `fa-sort-${ordemPed.direcao === 'asc' ? 'up' : 'down'}` : 'fa-sort';
            return `<th class="ped-th-ordenavel" onclick="window.ordenarPedidosPor('${col}')">${rotulo} <i class="fas ${icone}" style="color:${ativa ? '#00ADEE' : '#adb5bd'};"></i></th>`;
        }).join('')}</tr>`;
    }

    function celulaEstoquePed(p) {
        const qtd = Number(p.quantidade) || 0;
        const classe = qtd <= 0 ? 'ped-estoque-zero' : qtd <= 3 ? 'ped-estoque-baixo' : '';
        return `<span class="ped-estoque ${classe}">${qtd}</span>`;
    }

    function celulaQtdPed(p) {
        const valor = qtdPedidoPed[p.id] || '';
        return `<input type="number" min="0" step="1" class="form-control form-control-sm ped-qtd" value="${escPed(valor)}" oninput="window.definirQtdPedido(${Number(p.id)}, this.value)">`;
    }

    function renderizarPed() {
        renderizarControlesModoPed();
        renderizarCabecalhoPed();
        atualizarContadorSugestoesPed();

        const corpo = document.getElementById('pedTabelaCorpo');
        if (!corpo) return;
        const colspan = COLUNAS_PED[modoPed].length;

        const linhas = linhasAtuaisPed();

        if (modoPed === 'fornecedor' && !fornecedorSelecionadoPed) {
            corpo.innerHTML = `<tr><td colspan="${colspan}" class="text-center py-4 text-muted">Selecione um fornecedor para ver os produtos.</td></tr>`;
            atualizarResumoPed([]);
            return;
        }
        if (linhas === null) {
            corpo.innerHTML = `<tr><td colspan="${colspan}" class="text-center py-4 text-muted">Escolha uma categoria e/ou digite uma busca para montar a lista.</td></tr>`;
            atualizarResumoPed([]);
            return;
        }
        if (!linhas.length) {
            corpo.innerHTML = `<tr><td colspan="${colspan}" class="text-center py-4 text-muted">Nenhum produto encontrado.</td></tr>`;
            atualizarResumoPed([]);
            return;
        }

        if (modoPed === 'fornecedor') {
            corpo.innerHTML = linhas.map(l => {
                const p = l.produto;
                return `
                    <tr>
                        <td>${escPed(p.sku || '—')}</td>
                        <td>${escPed(l.skuFornecedor || '—')}</td>
                        <td><strong>${escPed(p.nome || '')}</strong></td>
                        <td>${escPed(p.categoria || '—')}</td>
                        <td>${celulaEstoquePed(p)}</td>
                        <td>${celulaQtdPed(p)}</td>
                        <td class="text-right">
                            <button class="btn btn-outline-danger btn-sm" title="O fornecedor não tem mais este produto"
                                onclick="window.banirProdutoDoFornecedor(${Number(p.id)})">
                                <i class="fas fa-ban"></i> Não tem mais
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            corpo.innerHTML = linhas.map(l => {
                const p = l.produto;
                const fornecedor = l.fornecedorTexto
                    ? escPed(l.fornecedorTexto)
                    : l.semFornecedorAtivo
                        ? `<span class="ped-badge-sem-forn" title="Todos os fornecedores deste produto foram marcados como &quot;não tem mais&quot;">Sem fornecedor ativo</span>`
                        : `<span class="text-muted">—</span>`;
                return `
                    <tr>
                        <td>${escPed(p.sku || '—')}</td>
                        <td><strong>${escPed(p.nome || '')}</strong></td>
                        <td>${escPed(p.categoria || '—')}</td>
                        <td>${fornecedor}</td>
                        <td>${escPed(l.skuFornecedor || '—')}</td>
                        <td>${celulaEstoquePed(p)}</td>
                        <td>${celulaQtdPed(p)}</td>
                    </tr>
                `;
            }).join('');
        }

        atualizarResumoPed(linhas);
    }

    function atualizarResumoPed(linhas) {
        const el = document.getElementById('pedResumo');
        if (!el) return;
        const comQtd = linhas.filter(l => Number(qtdPedidoPed[l.produto.id]) > 0);
        const unidades = comQtd.reduce((s, l) => s + (Number(qtdPedidoPed[l.produto.id]) || 0), 0);
        const zerados = linhas.filter(l => (Number(l.produto.quantidade) || 0) <= 0).length;
        el.innerHTML = `
            <span class="badge badge-secondary">${linhas.length} produto(s)</span>
            <span class="badge badge-danger">${zerados} sem estoque</span>
            <span class="badge badge-success">${comQtd.length} no pedido · ${unidades} un.</span>
        `;
    }

    function renderizarControlesModoPed() {
        document.querySelectorAll('[data-ped-modo]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.pedModo === modoPed);
        });
        document.getElementById('pedFiltrosFornecedor')?.classList.toggle('hidden', modoPed !== 'fornecedor');
        document.getElementById('pedFiltrosProduto')?.classList.toggle('hidden', modoPed !== 'produto');
    }

    // ============================================================
    // AÇÕES DA LISTA
    // ============================================================

    window.definirModoPedido = function (modo) {
        modoPed = modo === 'produto' ? 'produto' : 'fornecedor';
        renderizarPed();
    };

    window.selecionarFornecedorPedido = function () {
        fornecedorSelecionadoPed = document.getElementById('pedFornecedor')?.value || '';
        renderizarPed();
    };

    window.filtrarPedidoPorProduto = function () {
        categoriaPed = document.getElementById('pedCategoria')?.value || '';
        buscaPed = String(document.getElementById('pedBusca')?.value || '').trim().toLowerCase();
        renderizarPed();
    };

    window.limparFiltrosPedido = function () {
        categoriaPed = '';
        buscaPed = '';
        const cat = document.getElementById('pedCategoria');
        const busca = document.getElementById('pedBusca');
        if (cat) cat.value = '';
        if (busca) busca.value = '';
        renderizarPed();
    };

    window.ordenarPedidosPor = function (coluna) {
        if (ordemPed.coluna === coluna) {
            ordemPed.direcao = ordemPed.direcao === 'asc' ? 'desc' : 'asc';
        } else {
            ordemPed = { coluna, direcao: 'asc' };
        }
        renderizarPed();
    };

    window.definirQtdPedido = function (produtoId, valor) {
        const n = Math.max(0, Math.floor(Number(valor) || 0));
        if (n > 0) qtdPedidoPed[produtoId] = n;
        else delete qtdPedidoPed[produtoId];
        atualizarResumoPed(linhasAtuaisPed() || []);
    };

    window.limparQuantidadesPedido = function () {
        if (!Object.keys(qtdPedidoPed).length) return;
        if (!confirm('Zerar todas as quantidades do pedido?')) return;
        Object.keys(qtdPedidoPed).forEach(k => delete qtdPedidoPed[k]);
        renderizarPed();
    };

    // ============================================================
    // "NÃO TEM MAIS" (BANIR PRODUTO DO FORNECEDOR)
    // ============================================================

    window.banirProdutoDoFornecedor = async function (produtoId) {
        const forn = fornecedoresPed.find(f => f.chave === fornecedorSelecionadoPed);
        const item = forn?.itens.find(it => String(it.produto.id) === String(produtoId));
        if (!forn || !item) return;

        const motivo = prompt(
            `"${item.produto.nome}" não existe mais em ${forn.nome}?\n\nEle vai sumir da lista deste fornecedor e entrar na "Sugestão de nível de estoque".\n\nMotivo (opcional):`,
            'Fornecedor não tem mais'
        );
        if (motivo === null) return;

        try {
            const registro = {
                cd_fornecedor: null,
                nome_fornecedor: forn.nome || null,
                produto_id: item.produto.id,
                sku_sistema: item.produto.sku || null,
                sku_fornecedor: item.skuFornecedor || null,
                motivo: motivo.trim() || null,
                criado_por: usernamePed(),
                criado_em: new Date().toISOString()
            };
            const { data, error } = await window.supabaseClient
                .from(CFG_PED.tabelaBanidos)
                .insert([registro])
                .select()
                .single();
            if (error) throw error;

            banidosPed.push(data);
            delete qtdPedidoPed[produtoId];
            showToast(`🚫 ${item.produto.nome} marcado como "não tem mais" em ${forn.nome}.`, 'success');
            renderizarPed();
            renderizarSugestoesPed();
        } catch (error) {
            console.error('❌ [Pedidos] Erro ao banir:', error);
            showToast('Erro ao registrar: ' + error.message, 'error');
        }
    };

    // ============================================================
    // ABA: SUGESTÃO DE NÍVEL DE ESTOQUE
    // ============================================================

    function sugestoesAbertasPed() {
        return banidosPed.filter(b => !b.sugestao_resolvida);
    }

    function atualizarContadorSugestoesPed() {
        const el = document.getElementById('pedContadorSugestoes');
        if (!el) return;
        const n = sugestoesAbertasPed().length;
        el.textContent = n;
        el.classList.toggle('hidden', !n);
    }

    function renderizarSugestoesPed() {
        atualizarContadorSugestoesPed();
        const corpo = document.getElementById('pedSugestoesCorpo');
        if (!corpo) return;

        const mostrarResolvidas = document.getElementById('pedMostrarResolvidas')?.checked;
        const lista = (mostrarResolvidas ? banidosPed : sugestoesAbertasPed())
            .slice()
            .sort((a, b) => String(b.criado_em || '').localeCompare(String(a.criado_em || '')));

        if (!lista.length) {
            corpo.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">Nenhuma sugestão de nível de estoque.</td></tr>`;
            return;
        }

        const produtoPorId = {};
        produtosPed.forEach(p => { produtoPorId[p.id] = p; });

        corpo.innerHTML = lista.map(b => {
            const p = produtoPorId[b.produto_id];
            const outros = fornecedoresAtivosDoProdutoPed(b.produto_id);
            return `
                <tr class="${b.sugestao_resolvida ? 'ped-linha-resolvida' : ''}">
                    <td>${escPed(b.sku_sistema || p?.sku || '—')}</td>
                    <td><strong>${escPed(p?.nome || '(produto inativo ou removido)')}</strong></td>
                    <td>${p ? celulaEstoquePed(p) : '—'}</td>
                    <td>${escPed(b.nome_fornecedor || b.cd_fornecedor || '—')}</td>
                    <td>${outros.length ? escPed(outros.map(f => f.nome).join(', ')) : '<span class="ped-badge-sem-forn">Nenhum</span>'}</td>
                    <td>${escPed(b.motivo || '—')}</td>
                    <td>${escPed(b.criado_por || '—')}<br><small class="text-muted">${fmtDataPed(b.criado_em)}</small></td>
                    <td class="text-right" style="white-space:nowrap;">
                        ${b.sugestao_resolvida
                            ? `<small class="text-muted">Resolvido por ${escPed(b.resolvido_por || '—')} em ${fmtDataPed(b.resolvido_em)}</small>`
                            : `<button class="btn btn-success btn-sm" title="Já ajustei o nível de estoque — tirar da lista" onclick="window.resolverSugestaoPedido(${Number(b.id)})"><i class="fas fa-check"></i> Resolvido</button>`}
                        <button class="btn btn-outline-secondary btn-sm" title="O fornecedor voltou a ter — o produto volta para a lista dele" onclick="window.reativarProdutoNoFornecedor(${Number(b.id)})"><i class="fas fa-undo"></i> Voltou a ter</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    window.renderizarSugestoesPedido = renderizarSugestoesPed;

    window.resolverSugestaoPedido = async function (id) {
        try {
            const dados = { sugestao_resolvida: true, resolvido_por: usernamePed(), resolvido_em: new Date().toISOString() };
            const { error } = await window.supabaseClient
                .from(CFG_PED.tabelaBanidos)
                .update(dados)
                .eq('id', id);
            if (error) throw error;
            const b = banidosPed.find(x => String(x.id) === String(id));
            if (b) Object.assign(b, dados);
            showToast('✅ Sugestão marcada como resolvida.', 'success');
            renderizarSugestoesPed();
        } catch (error) {
            showToast('Erro ao resolver: ' + error.message, 'error');
        }
    };

    window.reativarProdutoNoFornecedor = async function (id) {
        const b = banidosPed.find(x => String(x.id) === String(id));
        if (!b) return;
        if (!confirm(`O fornecedor ${b.nome_fornecedor || b.cd_fornecedor} voltou a ter este produto?\n\nEle volta a aparecer na lista desse fornecedor.`)) return;
        try {
            const { error } = await window.supabaseClient
                .from(CFG_PED.tabelaBanidos)
                .delete()
                .eq('id', id);
            if (error) throw error;
            banidosPed = banidosPed.filter(x => String(x.id) !== String(id));
            showToast('↩️ Produto reativado no fornecedor.', 'success');
            renderizarSugestoesPed();
            renderizarPed();
        } catch (error) {
            showToast('Erro ao reativar: ' + error.message, 'error');
        }
    };

    window.trocarAbaPedido = function (aba) {
        abaPed = aba === 'sugestoes' ? 'sugestoes' : 'pedido';
        document.querySelectorAll('[data-ped-aba]').forEach(btn => btn.classList.toggle('active', btn.dataset.pedAba === abaPed));
        document.getElementById('pedPainelPedido')?.classList.toggle('hidden', abaPed !== 'pedido');
        document.getElementById('pedPainelSugestoes')?.classList.toggle('hidden', abaPed !== 'sugestoes');
        if (abaPed === 'sugestoes') renderizarSugestoesPed();
    };

    // ============================================================
    // EXPORTAR / COPIAR
    // ============================================================

    function nomeArquivoPed() {
        const base = modoPed === 'fornecedor'
            ? (fornecedoresPed.find(f => f.chave === fornecedorSelecionadoPed)?.nome || 'fornecedor')
            : 'produtos';
        return base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').toLowerCase();
    }

    window.exportarPedidoExcel = function () {
        const linhas = linhasAtuaisPed() || [];
        if (!linhas.length) {
            showToast('⚠️ Nenhum produto na lista para exportar.', 'warning');
            return;
        }
        const dados = linhas.map(l => ({
            'SKU': l.produto.sku || '',
            'SKU Fornecedor': l.skuFornecedor || '',
            'Produto': l.produto.nome || '',
            'Categoria': l.produto.categoria || '',
            'Fornecedor': l.fornecedorTexto || '',
            'Estoque': Number(l.produto.quantidade) || 0,
            'Qtd. Pedir': Number(qtdPedidoPed[l.produto.id]) || ''
        }));
        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Pedido');
        XLSX.writeFile(wb, `pedido_${nomeArquivoPed()}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    window.copiarPedido = async function () {
        const linhas = (linhasAtuaisPed() || []).filter(l => Number(qtdPedidoPed[l.produto.id]) > 0);
        if (!linhas.length) {
            showToast('⚠️ Preencha a "Qtd. pedir" de pelo menos um produto.', 'warning');
            return;
        }
        const texto = linhas.map(l => {
            const codigo = l.skuFornecedor || l.produto.sku || '';
            return `${qtdPedidoPed[l.produto.id]}x ${codigo ? codigo + ' - ' : ''}${l.produto.nome || ''}`;
        }).join('\n');
        try {
            await navigator.clipboard.writeText(texto);
            showToast(`📋 Pedido copiado (${linhas.length} item(ns)).`, 'success');
        } catch (e) {
            prompt('Copie o pedido:', texto);
        }
    };

    // ============================================================
    // CSS
    // ============================================================

    function injetarCssPed() {
        if (document.getElementById('pedidosCSS')) return;
        const style = document.createElement('style');
        style.id = 'pedidosCSS';
        style.textContent = `
            .ped-alternador { display: inline-flex; border: 1px solid #dee2e6; border-radius: 8px; overflow: hidden; }
            .ped-alternador button { border: 0; background: #fff; padding: 8px 16px; font-weight: 600; color: #495057; cursor: pointer; }
            .ped-alternador button + button { border-left: 1px solid #dee2e6; }
            .ped-alternador button.active { background: #00ADEE; color: #fff; }
            .ped-th-ordenavel { cursor: pointer; user-select: none; white-space: nowrap; }
            .ped-qtd { width: 90px; }
            .ped-estoque { display: inline-block; min-width: 32px; text-align: center; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: #e9ecef; color: #495057; }
            .ped-estoque-baixo { background: #fff3cd; color: #856404; }
            .ped-estoque-zero { background: #f8d7da; color: #721c24; }
            .ped-badge-sem-forn { display: inline-block; font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: #f8d7da; color: #721c24; white-space: nowrap; }
            .ped-contador { display: inline-block; min-width: 20px; margin-left: 6px; padding: 1px 7px; border-radius: 999px; background: #dc3545; color: #fff; font-size: 11px; }
            .ped-linha-resolvida { opacity: .55; }
        `;
        document.head.appendChild(style);
    }

    // ============================================================
    // TELA
    // ============================================================

    function criarTelaPed() {
        if (document.getElementById('pedidosSystem')) return;

        const div = document.createElement('div');
        div.id = 'pedidosSystem';
        div.className = 'hidden';
        div.innerHTML = `
            <header class="main-header">
                <div class="container">
                    <div class="header-content">
                        <h1 style="display:flex; align-items:center; gap:10px;">
                            <img src="logo.png" alt="Wheel Tech" style="height:35px; width:auto;">
                            Pedidos
                        </h1>
                    </div>
                </div>
            </header>

            <div class="container">
                <div class="card mb-3">
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div class="ped-alternador">
                            <button type="button" data-ped-aba="pedido" class="active" onclick="window.trocarAbaPedido('pedido')"><i class="fas fa-cart-shopping"></i> Montar pedido</button>
                            <button type="button" data-ped-aba="sugestoes" onclick="window.trocarAbaPedido('sugestoes')"><i class="fas fa-lightbulb"></i> Sugestão de nível de estoque<span id="pedContadorSugestoes" class="ped-contador hidden">0</span></button>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-secondary" onclick="voltarParaMenu()"><i class="fas fa-arrow-left"></i> Voltar</button>
                            <button class="btn btn-info" onclick="window.__carregarPedidosModulo()"><i class="fas fa-sync-alt"></i> Atualizar</button>
                        </div>
                    </div>
                </div>

                <div id="pedPainelPedido">
                    <div class="card mb-3">
                        <div class="d-flex flex-wrap gap-2 align-items-center">
                            <div class="ped-alternador">
                                <button type="button" data-ped-modo="fornecedor" class="active" onclick="window.definirModoPedido('fornecedor')"><i class="fas fa-truck-field"></i> Por fornecedor</button>
                                <button type="button" data-ped-modo="produto" onclick="window.definirModoPedido('produto')"><i class="fas fa-box"></i> Por produto</button>
                            </div>

                            <div id="pedFiltrosFornecedor" class="d-flex gap-2 align-items-center" style="flex:1; min-width:260px;">
                                <select id="pedFornecedor" class="form-control form-control-sm" style="flex:1;" onchange="window.selecionarFornecedorPedido()">
                                    <option value="">Carregando fornecedores...</option>
                                </select>
                            </div>

                            <div id="pedFiltrosProduto" class="d-flex gap-2 align-items-center hidden" style="flex:1; min-width:260px;">
                                <select id="pedCategoria" class="form-control form-control-sm" style="width:220px;" onchange="window.filtrarPedidoPorProduto()">
                                    <option value="">Todas as categorias</option>
                                </select>
                                <input type="text" id="pedBusca" class="form-control form-control-sm" placeholder="🔍 Buscar por nome, SKU, MLB..." style="flex:1; min-width:200px;" oninput="window.filtrarPedidoPorProduto()">
                                <button class="btn btn-outline-secondary btn-sm" onclick="window.limparFiltrosPedido()" title="Limpar filtros"><i class="fas fa-broom"></i></button>
                            </div>
                        </div>
                    </div>

                    <div class="card mb-3">
                        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                            <div id="pedResumo" class="d-flex gap-2 flex-wrap"></div>
                            <div class="d-flex gap-2">
                                <button class="btn btn-outline-secondary btn-sm" onclick="window.limparQuantidadesPedido()"><i class="fas fa-eraser"></i> Zerar quantidades</button>
                                <button class="btn btn-outline-primary btn-sm" onclick="window.copiarPedido()"><i class="fas fa-copy"></i> Copiar pedido</button>
                                <button class="btn btn-success btn-sm" onclick="window.exportarPedidoExcel()"><i class="fas fa-file-excel"></i> Exportar Excel</button>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead id="pedTabelaCabecalho"></thead>
                                <tbody id="pedTabelaCorpo"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div id="pedPainelSugestoes" class="hidden">
                    <div class="card mb-3">
                        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                            <div style="font-size:13px; color:#6c757d;">
                                Produtos que algum fornecedor não tem mais. Reveja o nível de estoque deles
                                (ou procure outro fornecedor) e marque como resolvido.
                            </div>
                            <label style="margin:0; font-size:13px; white-space:nowrap;">
                                <input type="checkbox" id="pedMostrarResolvidas" onchange="window.renderizarSugestoesPedido()"> Mostrar resolvidas
                            </label>
                        </div>
                    </div>
                    <div class="card">
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr>
                                        <th>SKU</th>
                                        <th>Produto</th>
                                        <th>Estoque</th>
                                        <th>Fornecedor que não tem mais</th>
                                        <th>Outros fornecedores</th>
                                        <th>Motivo</th>
                                        <th>Marcado por</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody id="pedSugestoesCorpo"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }

    window.__carregarPedidosModulo = async function () {
        await carregarTudoPed();
        if (abaPed === 'sugestoes') renderizarSugestoesPed();
    };

    window.abrirSistemaPedidos = async function () {
        if (!usuarioAtualPed()) {
            showToast('⚠️ Faça login primeiro', 'warning');
            return;
        }
        if (!podeUsarPedidosPed()) {
            showToast('🔒 Você não tem acesso ao módulo Pedidos.', 'warning');
            return;
        }

        injetarCssPed();
        criarTelaPed();

        if (typeof esconderTodosOsSistemas === 'function') {
            esconderTodosOsSistemas('pedidosSystem');
        }
        document.getElementById('pedidosSystem')?.classList.remove('hidden');

        await window.__carregarPedidosModulo();
    };

    // Esconde o botão "Pedidos" dos menus para quem não tem acesso.
    // Vai por CSS (e não style no botão) porque a barra lateral global é
    // clonada do menu inicial e o menu de visualização mexe no display
    // dos itens. Reavalia quando o usuário logado muda.
    let ultimoUsuarioMenuPed = null;
    function atualizarVisibilidadeMenuPed() {
        const atual = usernamePed();
        if (atual === ultimoUsuarioMenuPed) return;
        ultimoUsuarioMenuPed = atual;

        let style = document.getElementById('pedidosMenuCSS');
        if (!style) {
            style = document.createElement('style');
            style.id = 'pedidosMenuCSS';
            document.head.appendChild(style);
        }
        style.textContent = podeUsarPedidosPed()
            ? ''
            : '.wt-nav-item[data-menu-visual-key="pedidos"] { display: none !important; }';

        if (!podeUsarPedidosPed()) document.getElementById('pedidosSystem')?.classList.add('hidden');
    }

    atualizarVisibilidadeMenuPed();
    setInterval(atualizarVisibilidadeMenuPed, 1500);

})();
