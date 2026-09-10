/* ============================================================
   WHEEL TECH · Análise de Estoque (SÓ ADMINISTRADORES)
   ------------------------------------------------------------
   Acrescenta na tabela de Gestão de Estoque:
     - Coluna "Fornecedor"
     - Coluna "Vendas" (unidades vendidas — histórico local de baixas)
     - Coluna "Projeção" (quanto tempo até zerar o estoque, pelo ritmo
       das 2 últimas vendas)
     - Coluna "Sem venda há" (dias desde a última venda)
     - Todos os cabeçalhos clicáveis para ordenar (igual à aba NF-e)
     - Filtro por quantidade em estoque e por valor de custo

   Fonte das vendas: tabela `estoque_movimentacoes`
   (tipo = 'saida', tipo_entrada = 'venda').

   PARTE 2 (regra de nível de estoque + mudança de preço no ML)
   entra depois, em cima desta base.
   ============================================================ */
(function () {
    'use strict';

    const ADMINS_FALLBACK = ['andressamiotto', 'ronald', 'leticia'];
    const DIA_MS = 86400000;

    let metricasPorId = {};
    let metricasCarregadas = false;
    let metricasCarregando = null;

    // ---------------------------------------------------------
    function listaAdmins() {
        try {
            if (typeof usuariosAdmin !== 'undefined' && Array.isArray(usuariosAdmin)) return usuariosAdmin;
        } catch (e) { /* não existe nesse escopo */ }
        return ADMINS_FALLBACK;
    }

    function ehAdmin() {
        const u = (window.currentUser && window.currentUser.username || '').toLowerCase();
        if (!u) return false;
        if (listaAdmins().includes(u)) return true;
        return String(window.currentUser && window.currentUser.role || '').toLowerCase() === 'administrador';
    }

    function sb() { return window.supabaseClient || null; }

    // ---- acesso às variáveis globais do estoque_gestao.js ----
    // (são `let` no escopo daquele script — compartilhado entre
    //  scripts clássicos, mas não ficam em window)
    function getProdutos() {
        try { return (typeof produtosEstoque !== 'undefined' && produtosEstoque) || []; }
        catch (e) { return []; }
    }
    function getFiltrados() {
        try { return (typeof produtosFiltradosAtuais !== 'undefined' && produtosFiltradosAtuais) || []; }
        catch (e) { return []; }
    }
    function setFiltrados(v) {
        try { produtosFiltradosAtuais = v; } catch (e) { /* ignora */ }
    }
    function getOrdem() {
        try { return (typeof ordemColunaEstoque !== 'undefined' && ordemColunaEstoque) || {}; }
        catch (e) { return {}; }
    }

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function custoDoProduto(p) {
        return Number(
            p.ultimo_custo || p.dados_extra?.ultimo_custo ||
            p.custo_medio || p.dados_extra?.custo_medio || 0
        ) || 0;
    }

    function humanizarDuracao(dias) {
        if (dias == null || !isFinite(dias)) return '—';
        if (dias < 1) return 'hoje';
        if (dias < 45) {
            const d = Math.round(dias);
            return d + (d === 1 ? ' dia' : ' dias');
        }
        const meses = dias / 30.4;
        if (meses < 12) {
            const m = Math.round(meses * 10) / 10;
            return (Number.isInteger(m) ? m : m.toFixed(1).replace('.', ',')) + (m <= 1 ? ' mês' : ' meses');
        }
        const anos = dias / 365;
        const a = Math.round(anos * 10) / 10;
        return (Number.isInteger(a) ? a : a.toFixed(1).replace('.', ',')) + (a <= 1 ? ' ano' : ' anos');
    }

    // ---------------------------------------------------------
    // CARREGAR MÉTRICAS
    // ---------------------------------------------------------
    async function carregarMetricas() {
        const cli = sb();
        if (!cli) return;

        // 1) VENDAS — movimentações marcadas como venda -------
        // (mesmo critério que o histórico do produto usa:
        //  tipo_entrada = 'venda')
        const vendasPorProduto = {};
        try {
            const { data, error } = await cli
                .from('estoque_movimentacoes')
                .select('produto_id, quantidade, data_hora, tipo_entrada, numero_documento')
                .eq('tipo_entrada', 'venda')
                .order('data_hora', { ascending: false })
                .limit(50000);
            if (error) throw error;

            (data || []).forEach(m => {
                const pid = String(m.produto_id);
                if (!pid || pid === 'null' || pid === 'undefined') return;
                const d = new Date(m.data_hora);
                if (isNaN(d)) return;
                (vendasPorProduto[pid] = vendasPorProduto[pid] || []).push({
                    data: d, qtd: Math.abs(Number(m.quantidade) || 0) || 1
                });
            });
        } catch (e) {
            console.warn('[estoque-analise] vendas:', e.message || e);
        }

        // 2) FORNECEDOR (última entrada de cada produto) -----
        // Tabelas reais: entradas_cards (pai) + entrada_items (itens).
        // produto_id no item costuma vir vazio -> casa por SKU.
        const fornecedorPorProduto = {};
        try {
            const [rItens, rCards] = await Promise.all([
                cli.from('entrada_items').select('produto_id, sku_original, sku_match, fornecedor_nome, entrada_id, status').limit(50000),
                cli.from('entradas_cards').select('id, fornecedor, criado_em').limit(50000)
            ]);
            const itens = rItens.data || [];
            const cards = rCards.data || [];

            const cardById = {};
            cards.forEach(c => {
                cardById[String(c.id)] = {
                    fornecedor: c.fornecedor || '',
                    quando: c.criado_em ? new Date(c.criado_em).getTime() : 0
                };
            });

            const idPorSku = {};
            getProdutos().forEach(p => {
                if (p.sku) idPorSku[String(p.sku).trim().toLowerCase()] = String(p.id);
            });

            const melhorQuando = {};
            itens.forEach(it => {
                if (String(it.status || '').toLowerCase() === 'rejeitado') return;
                let pid = it.produto_id ? String(it.produto_id) : null;
                if (!pid) {
                    const sku = String(it.sku_match || it.sku_original || '').trim().toLowerCase();
                    pid = sku ? idPorSku[sku] : null;
                }
                if (!pid) return;
                const card = cardById[String(it.entrada_id)] || {};
                const forn = (it.fornecedor_nome || card.fornecedor || '').trim();
                if (!forn) return;
                const quando = card.quando || 0;
                if (melhorQuando[pid] != null && quando < melhorQuando[pid]) return;
                melhorQuando[pid] = quando;
                fornecedorPorProduto[pid] = forn;
            });
        } catch (e) {
            console.warn('[estoque-analise] fornecedor:', e.message || e);
        }

        // 3) MONTAR MÉTRICAS ---------------------------------
        const agora = Date.now();
        const mapa = {};
        const idsProdutos = new Set([
            ...Object.keys(vendasPorProduto),
            ...Object.keys(fornecedorPorProduto),
            ...getProdutos().map(p => String(p.id))
        ]);

        idsProdutos.forEach(pid => {
            const vendas = (vendasPorProduto[pid] || []).slice().sort((a, b) => a.data - b.data);
            const produto = getProdutos().find(p => String(p.id) === pid);
            const qtdAtual = produto ? (Number(produto.quantidade) || 0) : 0;

            const vendasTotal = vendas.reduce((s, v) => s + v.qtd, 0);
            const vendas30 = vendas.filter(v => (agora - v.data) <= 30 * DIA_MS).reduce((s, v) => s + v.qtd, 0);
            const vendas90 = vendas.filter(v => (agora - v.data) <= 90 * DIA_MS).reduce((s, v) => s + v.qtd, 0);

            let diasSemVenda = null;
            if (vendas.length) diasSemVenda = (agora - vendas[vendas.length - 1].data) / DIA_MS;

            let primeiraVenda = vendas.length ? vendas[0].data : null;

            const custo = produto ? custoDoProduto(produto) : 0;
            const valorEstoque = qtdAtual * custo;

            const fornecedor = (
                fornecedorPorProduto[pid] ||
                (produto && (produto.fornecedor ||
                    produto.dados_extra?.fornecedor ||
                    produto.dados_extra?.fornecedor_nome ||
                    produto.dados_extra?.cd_fornecedor)) ||
                ''
            );

            // PROJEÇÃO — só existe com PELO MENOS 2 vendas.
            // Ritmo = unidades das 2 últimas vendas / dias entre elas.
            let projecaoDias = null;
            let ritmoTexto = '';
            if (vendas.length >= 2 && qtdAtual > 0) {
                const ult = vendas.slice(-2);
                const unidades = ult[0].qtd + ult[1].qtd;
                let dias = (ult[1].data - ult[0].data) / DIA_MS;
                if (dias < 1) dias = 1;
                const ritmoDia = unidades / dias;
                projecaoDias = qtdAtual / ritmoDia;
                ritmoTexto = `${unidades} un. em ${Math.round(dias)}d`;
            }

            mapa[pid] = {
                fornecedor: fornecedor,
                vendasTotal, vendas30, vendas90,
                diasSemVenda,
                primeiraVenda,
                ultimaVenda: vendas.length ? vendas[vendas.length - 1].data : null,
                numVendas: vendas.length,
                projecaoDias,
                ritmoTexto,
                custo,
                valorEstoque
            };
        });

        metricasPorId = mapa;
        aplicarMetricasAosProdutos();
    }

    function aplicarMetricasAosProdutos() {
        getProdutos().forEach(p => {
            p._analise = metricasPorId[String(p.id)] || p._analise || {};
        });
    }

    function garantirMetricas() {
        if (metricasCarregadas || metricasCarregando) return;
        metricasCarregando = carregarMetricas()
            .then(() => {
                metricasCarregadas = true;
                metricasCarregando = null;
                // re-renderiza para preencher as colunas de análise
                if (getFiltrados().length && typeof window.renderizarTabelaProdutos === 'function') {
                    window.renderizarTabelaProdutos(getFiltrados());
                } else if (typeof window.aplicarFiltrosEOrdenacao === 'function') {
                    window.aplicarFiltrosEOrdenacao();
                }
            })
            .catch(() => { metricasCarregando = null; });
    }

    // recarrega as métricas (ex.: após uma venda / nova entrada)
    function recarregarMetricas() {
        metricasCarregadas = false;
        metricasCarregando = null;
        garantirMetricas();
    }

    // ---------------------------------------------------------
    // FILTROS EXTRAS (quantidade / custo)
    // ---------------------------------------------------------
    function passaOperador(valor, op, alvo) {
        if (!op || alvo === '' || alvo == null || isNaN(alvo)) return true;
        const a = Number(alvo);
        if (op === 'lte') return valor <= a;
        if (op === 'gte') return valor >= a;
        if (op === 'eq') return valor === a;
        if (op === 'lt') return valor < a;
        if (op === 'gt') return valor > a;
        return true;
    }

    function lerFiltrosExtras() {
        const g = id => document.getElementById(id);
        const qtdOp = g('analiseQtdOp')?.value || '';
        const qtdVal = g('analiseQtdVal')?.value ?? '';
        const custoOp = g('analiseCustoOp')?.value || '';
        const custoVal = g('analiseCustoVal')?.value ?? '';
        const ativo = (qtdOp && qtdVal !== '') || (custoOp && custoVal !== '');
        return { ativo, qtdOp, qtdVal, custoOp, custoVal };
    }

    function injetarControlesFiltro() {
        if (document.getElementById('analiseFiltrosWrap')) return;
        const barra = document.querySelector('#estoqueGestaoSystem .card-header .d-flex.gap-2')
            || document.querySelector('#estoqueGestaoSystem .card-header .d-flex');
        if (!barra) return;

        garantirEstilo();
        const wrap = document.createElement('span');
        wrap.id = 'analiseFiltrosWrap';
        wrap.className = 'analise-filtros';
        wrap.innerHTML = `
            <span class="analise-fgrupo" title="Filtrar por quantidade em estoque">
                <i class="fas fa-boxes"></i>
                <select id="analiseQtdOp" class="form-control form-control-sm">
                    <option value="">Estoque</option>
                    <option value="lte">≤</option>
                    <option value="gte">≥</option>
                    <option value="eq">=</option>
                </select>
                <input id="analiseQtdVal" type="number" min="0" class="form-control form-control-sm" placeholder="qtd">
            </span>
            <span class="analise-fgrupo" title="Filtrar por valor de custo (último custo)">
                <i class="fas fa-tag"></i>
                <select id="analiseCustoOp" class="form-control form-control-sm">
                    <option value="">Custo R$</option>
                    <option value="lte">≤</option>
                    <option value="gte">≥</option>
                    <option value="eq">=</option>
                </select>
                <input id="analiseCustoVal" type="number" min="0" step="0.01" class="form-control form-control-sm" placeholder="R$">
            </span>`;
        barra.appendChild(wrap);

        ['analiseQtdOp', 'analiseQtdVal', 'analiseCustoOp', 'analiseCustoVal'].forEach(id => {
            const el = document.getElementById(id);
            const disparar = () => {
                if (typeof window.filtrarProdutosEstoque === 'function') window.filtrarProdutosEstoque();
                else if (typeof window.aplicarFiltrosEOrdenacao === 'function') window.aplicarFiltrosEOrdenacao();
            };
            el.addEventListener('change', disparar);
            el.addEventListener('input', () => {
                clearTimeout(el._t);
                el._t = setTimeout(disparar, 400);
            });
        });
    }

    // ---------------------------------------------------------
    // ENFEITAR A TABELA (cabeçalhos + células)
    // ---------------------------------------------------------
    const COLS_EXISTENTES = [
        ['Nome Produto', 'nome'],
        ['SKU', 'sku'],
        ['Estoque', 'quantidade'],
        ['Último custo', 'preco_custo'],
        ['Média custo', 'preco_medio']
    ];
    const COLS_NOVAS = [
        ['fornecedor', 'Fornecedor'],
        ['vendas', 'Vendas'],
        ['valor_estoque', 'Valor em estoque'],
        ['projecao', 'Projeção'],
        ['sem_venda', 'Sem venda há']
    ];

    function formatBRL(v) {
        return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // cor da PROJEÇÃO conforme os intervalos pedidos:
    // <1sem, 2sem, 1mês, 2m, 3m, 6m, 1a, 2a  (verde -> vermelho conforme demora)
    function corProjecao(dias) {
        if (dias == null) return '#adb5bd';
        if (dias < 7) return '#0b8043';
        if (dias < 14) return '#43a047';
        if (dias < 30) return '#7cb342';
        if (dias < 60) return '#c0ca33';
        if (dias < 90) return '#f9a825';
        if (dias < 180) return '#fb8c00';
        if (dias < 365) return '#f4511e';
        if (dias < 730) return '#e53935';
        return '#b71c1c';
    }

    function iconeOrdenacao(col) {
        const o = getOrdem();
        if (o.coluna === col) {
            return `<i class="fas fa-sort-${o.direcao === 'asc' ? 'up' : 'down'} ordenacao-icon" style="font-size:11px;margin-left:5px;color:#00ADEE;"></i>`;
        }
        return `<i class="fas fa-sort ordenacao-icon" style="font-size:11px;margin-left:5px;color:#adb5bd;"></i>`;
    }

    function enfeitarCabecalho() {
        const thead = document.querySelector('#produtosEstoqueTable thead tr');
        if (!thead) return;
        const ths = Array.from(thead.querySelectorAll('th'));

        // 1) tornar cabeçalhos existentes clicáveis
        COLS_EXISTENTES.forEach(([rotulo, col]) => {
            const th = ths.find(t => t.textContent.trim().toLowerCase().startsWith(rotulo.toLowerCase()));
            if (!th || th.dataset.analiseUp === '1') return;
            th.dataset.analiseUp = '1';
            th.dataset.coluna = col;
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => window.ordenarEstoquePor(col));
            if (!th.querySelector('.ordenacao-icon')) {
                th.insertAdjacentHTML('beforeend', ' ' + iconeOrdenacao(col));
            }
        });

        // 2) novas colunas (antes de "Ações")
        if (!thead.querySelector('th[data-analise-col]')) {
            const thAcoes = ths.find(t => t.textContent.trim().toLowerCase().startsWith('ações'))
                || ths[ths.length - 1];
            COLS_NOVAS.forEach(([col, rotulo]) => {
                const th = document.createElement('th');
                th.dataset.analiseCol = col;
                th.dataset.coluna = col;
                th.style.cursor = 'pointer';
                th.innerHTML = esc(rotulo) + ' ' + iconeOrdenacao(col);
                th.addEventListener('click', () => window.ordenarEstoquePor(col));
                thead.insertBefore(th, thAcoes);
            });
        }

        // 3) atualizar setinhas conforme ordenação atual
        const o = getOrdem();
        thead.querySelectorAll('th[data-coluna]').forEach(th => {
            const ic = th.querySelector('.ordenacao-icon');
            if (!ic) return;
            if (th.dataset.coluna === o.coluna) {
                ic.className = `fas fa-sort-${o.direcao === 'asc' ? 'up' : 'down'} ordenacao-icon`;
                ic.style.color = '#00ADEE';
            } else {
                ic.className = 'fas fa-sort ordenacao-icon';
                ic.style.color = '#adb5bd';
            }
        });
    }

    function celulaVendas(a) {
        if (!a || !a.numVendas) return `<span style="color:#adb5bd;">—</span>`;
        return `<strong>${a.vendasTotal}</strong> un.
            <br><small style="color:#6c757d;">30d: ${a.vendas30} · 90d: ${a.vendas90}</small>`;
    }

    function celulaProjecao(a) {
        if (!a || a.projecaoDias == null) {
            return `<span style="color:#adb5bd;" title="Precisa de pelo menos 2 vendas">—</span>`;
        }
        return `<strong style="color:${corProjecao(a.projecaoDias)};">${esc(humanizarDuracao(a.projecaoDias))}</strong>
            <br><small style="color:#6c757d;">${esc(a.ritmoTexto)}</small>`;
    }

    function celulaValor(a, prod) {
        const valor = a && a.valorEstoque != null
            ? a.valorEstoque
            : (prod ? (Number(prod.quantidade) || 0) * custoDoProduto(prod) : 0);
        if (!valor) return `<span style="color:#adb5bd;">—</span>`;
        let cor = '#334155';
        if (valor >= 1000) cor = '#b45309';
        if (valor >= 5000) cor = '#b91c1c';
        return `<strong style="color:${cor};">${esc(formatBRL(valor))}</strong>`;
    }

    function celulaSemVenda(a) {
        if (!a || a.diasSemVenda == null) return `<span style="color:#b71c1c;font-weight:700;">nunca vendeu</span>`;
        const d = a.diasSemVenda;
        let cor = '#6c757d';
        if (d > 60) cor = '#dc3545';
        else if (d > 30) cor = '#fd7e14';
        return `<span style="color:${cor};font-weight:600;">${esc(humanizarDuracao(d))}</span>`;
    }

    function enfeitarLinhas() {
        const tbody = document.getElementById('produtosEstoqueBody');
        if (!tbody) return;

        tbody.querySelectorAll('tr').forEach(tr => {
            const chk = tr.querySelector('.check-produto-massa');
            if (!chk) return; // linha "nenhum produto"
            const id = String(chk.dataset.produtoId || '');
            const prod = getProdutos().find(p => String(p.id) === id);
            const a = metricasPorId[id];

            const conteudos = [
                a && a.fornecedor ? esc(a.fornecedor) : `<span style="color:#adb5bd;">—</span>`,
                celulaVendas(a),
                celulaValor(a, prod),
                celulaProjecao(a),
                celulaSemVenda(a)
            ];

            if (tr.querySelector('.col-analise')) {
                // já injetado — só atualiza o conteúdo
                const cels = tr.querySelectorAll('.col-analise');
                conteudos.forEach((html, i) => { if (cels[i]) cels[i].innerHTML = html; });
                return;
            }

            const tds = Array.from(tr.querySelectorAll('td'));
            const tdAcoes = tds[tds.length - 1];
            conteudos.forEach(html => {
                const td = document.createElement('td');
                td.className = 'col-analise';
                td.style.fontSize = '12px';
                td.innerHTML = html;
                tr.insertBefore(td, tdAcoes);
            });
        });
    }

    let enfeitando = false;
    function enfeitarTabela() {
        if (enfeitando || !ehAdmin()) return;
        const sistema = document.getElementById('estoqueGestaoSystem');
        if (!sistema || sistema.classList.contains('hidden')) return;
        enfeitando = true;
        if (observer) observer.disconnect();
        try {
            garantirMetricas();
            aplicarMetricasAosProdutos();
            injetarControlesFiltro();
            enfeitarCabecalho();
            enfeitarLinhas();
        } catch (e) {
            console.warn('[estoque-analise] enfeitar:', e);
        } finally {
            enfeitando = false;
            reconectarObserver();
        }
    }

    // ---------------------------------------------------------
    // OBSERVER + PATCH DO FILTRO
    // ---------------------------------------------------------
    // O renderizarTabelaProdutos do estoque_gestao.js se "re-embrulha"
    // a cada chamada, então não dá pra fazer monkey-patch nele.
    // Em vez disso, observamos o tbody e reaplicamos as colunas.
    let observer = null;
    let obsTimer = null;

    function reconectarObserver() {
        const tbody = document.getElementById('produtosEstoqueBody');
        if (!tbody || !observer) return;
        observer.observe(tbody, { childList: true, subtree: true });
    }

    function instalarObserver() {
        if (observer) return;
        const tbody = document.getElementById('produtosEstoqueBody');
        if (!tbody) return;
        observer = new MutationObserver(() => {
            clearTimeout(obsTimer);
            obsTimer = setTimeout(enfeitarTabela, 120);
        });
        reconectarObserver();
    }

    function instalarPatches() {
        instalarObserver();

        // -- ordenação: sempre ordena a LISTA TODA e volta pra página 1 --
        if (!window.__analiseOrdenarPatched && typeof window.ordenarEstoquePor === 'function') {
            window.__analiseOrdenarPatched = true;
            const _ord = window.ordenarEstoquePor;
            const COLS_MINHAS = ['fornecedor', 'vendas', 'valor_estoque', 'projecao', 'sem_venda'];
            window.ordenarEstoquePor = function (coluna) {
                // garante que TODOS os produtos têm as métricas antes de ordenar
                aplicarMetricasAosProdutos();
                if (COLS_MINHAS.includes(coluna) && !metricasCarregadas) {
                    garantirMetricas();
                    if (typeof window.showToast === 'function') {
                        window.showToast('Carregando dados de venda para ordenar…', 'info');
                    }
                }
                // ordenação é sempre sobre a lista filtrada inteira; volta pro topo
                try { paginaAtualEstoque = 1; } catch (e) { /* ignora */ }
                try { if (typeof estadoFiltrosEstoque !== 'undefined' && estadoFiltrosEstoque) estadoFiltrosEstoque.pagina = 1; } catch (e) { /* ignora */ }
                return _ord.apply(this, arguments);
            };
        }

        if (window.__analiseFiltroPatched || typeof window.aplicarFiltrosEOrdenacao !== 'function') return;
        window.__analiseFiltroPatched = true;

        const _filtros = window.aplicarFiltrosEOrdenacao;
        window.aplicarFiltrosEOrdenacao = function () {
            _filtros.apply(this, arguments);
            if (!ehAdmin()) return;
            const ex = lerFiltrosExtras();
            if (!ex.ativo) return;
            const base = getFiltrados();
            const filtrado = base.filter(p => {
                const q = Number(p.quantidade) || 0;
                const c = custoDoProduto(p);
                return passaOperador(q, ex.qtdOp, ex.qtdVal) &&
                       passaOperador(c, ex.custoOp, ex.custoVal);
            });
            if (filtrado.length !== base.length) {
                setFiltrados(filtrado);
                if (typeof window.renderizarTabelaProdutos === 'function') {
                    window.renderizarTabelaProdutos(filtrado);
                }
            }
        };

        console.log('✅ [estoque-analise] pronto.');
    }

    // ---------------------------------------------------------
    // ESTILO
    // ---------------------------------------------------------
    function garantirEstilo() {
        if (document.getElementById('analiseEstoqueEstilo')) return;
        const st = document.createElement('style');
        st.id = 'analiseEstoqueEstilo';
        st.textContent = `
            .analise-filtros{display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap}
            .analise-fgrupo{display:inline-flex;align-items:center;gap:4px;background:#f1f5f9;
                border:1px solid #e2e8f0;border-radius:8px;padding:3px 8px}
            .analise-fgrupo i{color:#7c3aed;font-size:12px}
            .analise-fgrupo select{width:auto;min-width:64px}
            .analise-fgrupo input{width:78px}
            #produtosEstoqueTable th[data-coluna]{user-select:none}
            #produtosEstoqueTable th[data-coluna]:hover{background:#eef6ff}
        `;
        document.head.appendChild(st);
    }

    // ---------------------------------------------------------
    // START
    // ---------------------------------------------------------
    function start() {
        garantirEstilo();
        let tentativas = 0;
        const it = setInterval(() => {
            tentativas++;
            instalarPatches();
            const sistema = document.getElementById('estoqueGestaoSystem');
            if (sistema && !sistema.classList.contains('hidden') && ehAdmin()) {
                enfeitarTabela();
            }
            if (tentativas > 400) clearInterval(it);
        }, 1200);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    window.WTEstoqueAnalise = {
        recarregarMetricas,
        ehAdmin,
        _metricas: () => metricasPorId
    };
})();
