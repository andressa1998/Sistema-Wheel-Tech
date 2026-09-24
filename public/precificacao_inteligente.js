/* ============================================================
   WHEEL TECH · Precificação inteligente  (SÓ andressamiotto / ronald)
   ------------------------------------------------------------
   Aba nova, ao lado da Gestão de Estoque. Reaproveita os dados
   básicos dos produtos (nome, SKU, MLB, estoque) e mostra só aqui:
     - Níveis de estoque (a escada de preços das regras de nível)
     - Valor de custo
     - Nome do fornecedor
   O botão "Regras de nível" mora aqui (saiu da Gestão de Estoque).
   O escopo de uma regra nova vem dos filtros/seleção DESTA tela.
   ============================================================ */
(function () {
    'use strict';

    const USUARIOS_PRECIFICACAO = ['andressamiotto', 'ronald'];
    const ID_TELA = 'precificacaoInteligenteSystem';
    const POR_PAGINA = 50;

    const estado = {
        busca: '',
        categoria: '',
        qtdOp: '', qtdVal: '',
        custoOp: '', custoVal: '',
        pagina: 1,
        ordemCol: 'nome',
        ordemDir: 1,
        selecionados: new Set(),
        statusCusto: '',        // '' | 'com' | 'sem' | 'estimado'
        resumoAberto: false
    };

    let carregando = false;
    let temporizadorBusca = null;

    // ---------- helpers ----------
    function usuario() {
        return String((window.currentUser && window.currentUser.username) || '').trim().toLowerCase();
    }
    function permitido() { return USUARIOS_PRECIFICACAO.includes(usuario()); }
    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function brl(v) {
        return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function produtos() {
        try { return (typeof produtosEstoque !== 'undefined' && produtosEstoque) || []; } catch (e) { return []; }
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
    function fornecedorDoProduto(p) {
        return String((p._analise && p._analise.fornecedor) || p.fornecedor ||
            (p.dados_extra && (p.dados_extra.fornecedor || p.dados_extra.fornecedor_nome)) || '').trim();
    }
    function passaOp(valor, op, alvo) {
        if (!op || alvo === '' || alvo == null || isNaN(alvo)) return true;
        const a = Number(alvo);
        if (op === 'lte') return valor <= a;
        if (op === 'gte') return valor >= a;
        if (op === 'eq') return valor === a;
        return true;
    }
    function api() { return window.RegrasNivelEstoque || null; }
    function analise(p) {
        return p._analise || (window.WTEstoqueAnalise && window.WTEstoqueAnalise.metricaDe
            ? window.WTEstoqueAnalise.metricaDe(p.id) : null) || null;
    }
    function celulaAnalise(nome, p) {
        const c = window.WTEstoqueAnalise && window.WTEstoqueAnalise.celulas;
        if (!c || typeof c[nome] !== 'function') return '<span class="pi-vazio">—</span>';
        try { return c[nome](analise(p), p); } catch (e) { return '<span class="pi-vazio">—</span>'; }
    }
    function regras() {
        const r = api();
        return r && typeof r.regras === 'function' ? r.regras() : [];
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
    let versaoPrecos = 0;                // muda toda vez que o histórico é recarregado
    let vendasCarregadas = false;
    let carregandoVendas = null;
    let infoVendas = { pedidos: 0, desde: null, kitsIgnorados: 0, semSku: 0 };
    let indiceVendas = { chave: '', porSku: new Map(), naoLigadas: 0 };

    // Máximo que uma venda leva de uma vez (o maior é um raio, 72 un.). Um
    // prefixo maior que isso NÃO é quantidade.
    const QTD_MAXIMA_POR_VENDA = 72;

    // Chave para comparar SKUs mesmo com zeros à esquerda faltando/sobrando:
    // dígitos iniciais viram número; o resto (letras/códigos) fica como está.
    //   "01093GAE021AGCX00000" -> "1093|GAE021AGCX00000"
    //   "4560CBJAGW73SS2300"   -> "4560|CBJAGW73SS2300"
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
                console.warn('[precificacao-inteligente] histórico de vendas:', e.message || e);
            }
        })().finally(() => { carregandoVendas = null; });
        await carregandoVendas;
    }

    function atualizarStatusPrecos() {
        const el = document.getElementById('piPrecosStatus');
        if (!el) return;
        if (!vendasCarregadas) {
            el.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo o histórico de vendas para calcular o valor de venda e as estimativas…';
            return;
        }
        garantirIndiceVendas();
        const desde = infoVendas.desde ? infoVendas.desde.toLocaleDateString('pt-BR') : '—';
        el.innerHTML = `<i class="fas fa-check-circle" style="color:#198754;"></i> Valor de venda unitário = média de ${infoVendas.pedidos.toLocaleString('pt-BR')} vendas do histórico (desde ${desde}), dividindo cada venda pela quantidade que vem no SKU (ex.: 064… = 64 unidades). ` +
            `${infoVendas.kitsIgnorados ? infoVendas.kitsIgnorados.toLocaleString('pt-BR') + ' venda(s) de kits com vários SKUs' : ''}` +
            `${indiceVendas.naoLigadas ? (infoVendas.kitsIgnorados ? ' e ' : '') + indiceVendas.naoLigadas.toLocaleString('pt-BR') + ' venda(s) com SKU que não bate com o cadastro' : ''}` +
            `${(infoVendas.kitsIgnorados || indiceVendas.naoLigadas) ? ' não entram na média. ' : ''}As estimativas de custo usam essa média.`;
    }

    // Liga as vendas aos produtos SÓ pelo SKU (sem os 3 dígitos de quantidade).
    // Venda cujo SKU não bate com nenhum SKU do cadastro não entra: ligar pelo
    // MLB misturava SKUs antigos/fora do padrão e gerava valores absurdos
    // (ex.: "825BIADVAL-DR_K" lido como 825 unidades).
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

            // 1) SKU idêntico ao do cadastro: sem quantidade no SKU (1 unidade por venda)
            if (skus.has(skuVenda)) {
                somar(porSku, skuVenda, { receita: v.receita, unidades: v.comprados, n: v.n, ultima: v.ultima });
                return;
            }

            const m = /^(\d*)(.*)$/.exec(skuVenda);
            const digitos = m[1], resto = m[2];

            // 2) 3 dígitos de quantidade (1 a 72) + SKU do cadastro. O SKU é achado
            //    pela chave (tolera zero à esquerda faltando, como "0010020PROTDISC").
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

            // 3) sem quantidade no SKU, mas com o zero à esquerda do código faltando
            //    ("4560CBJAGW73SS2300" = "04560CBJAGW73SS2300"): 1 unidade por venda
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

    // valor de venda unitário médio do produto
    function precoDoProduto(p) {
        const { porSku } = garantirIndiceVendas();
        let receita = 0, unidades = 0, n = 0, ultima = null;
        const juntar = v => {
            if (!v) return;
            receita += v.receita; unidades += v.unidades; n += v.n;
            if (v.ultima && (!ultima || v.ultima > ultima)) ultima = v.ultima;
        };
        juntar(porSku.get(String(p.sku || '').trim().toUpperCase()));
        if (!unidades || receita <= 0) return null;
        return { media: receita / unidades, n, unidades, ultima };
    }

    function htmlValorVenda(p) {
        if (!vendasCarregadas) return '<span class="pi-vazio">…</span>';
        const v = precoDoProduto(p);
        if (!v) return '<span class="pi-vazio" title="Nenhuma venda registrada deste produto">sem vendas</span>';
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
    // Tudo é recalculado do zero a cada desenho da tela, então qualquer
    // custo novo/atualizado muda as estimativas na hora.
    // ==========================================================
    function custoExatoDoProduto(p) {
        return ultimoCustoDoProduto(p) || custoMedioDoProduto(p) || 0;
    }
    function temCustoExato(p) { return custoExatoDoProduto(p) > 0; }

    let cacheEstimativa = { chave: '', dados: null };
    let assinaturaCache = '';

    function assinaturaCustos() {
        let n = 0, soma = 0;
        produtos().forEach(p => { const c = custoExatoDoProduto(p); if (c > 0) { n++; soma += c; } });
        return n + ':' + Math.round(soma * 100);
    }

    function calcularEstimativas() {
        const chave = versaoPrecos + '|' + assinaturaCache + '|' + produtos().length;
        if (cacheEstimativa.chave === chave && cacheEstimativa.dados) return cacheEstimativa.dados;

        const cats = new Map();
        const cat = nome => {
            if (!cats.has(nome)) cats.set(nome, { nome, comCusto: 0, semCusto: 0, amostras: 0, descartadas: 0, somaMargens: 0, somaPrecoSem: 0, nPrecoSem: 0, semSemPreco: 0 });
            return cats.get(nome);
        };

        produtos().forEach(p => {
            const c = cat(p.categoria || 'Sem categoria');
            const v = precoDoProduto(p);
            if (temCustoExato(p)) {
                c.comCusto++;
                if (v && v.media > 0) {
                    const margem = (v.media - custoExatoDoProduto(p)) / v.media;
                    // custo maior que a venda, ou menor que 1% dela, é dado inconsistente e fica de fora
                    if (margem > 0 && margem < 0.99) { c.amostras++; c.somaMargens += margem; }
                    else c.descartadas++;
                }
            } else {
                c.semCusto++;
                if (v && v.media > 0) { c.somaPrecoSem += v.media; c.nPrecoSem++; }
                else c.semSemPreco++;
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
                return `<span class="pi-vazio" title="Custo exato cadastrado">custo = ${((1 - m) * 100).toFixed(0)}% da venda</span>`;
            }
            return '<span class="pi-vazio">custo exato</span>';
        }
        const e = estimativaDoProduto(p);
        if (e) {
            const pctCusto = (1 - e.margem) * 100;
            return `<span class="pi-est" title="Venda média ${esc(brl(e.preco))} × ${pctCusto.toFixed(1)}% (custo médio dos ${e.amostras} produto(s) da categoria que têm custo)">≈ ${brl(e.custo)}<small>custo = ${pctCusto.toFixed(0)}% da venda</small></span>`;
        }
        const c = calcularEstimativas().cats.get(p.categoria || 'Sem categoria');
        if (!mlbsDoProduto(p).length) return '<span class="pi-vazio" title="Produto sem MLB: não dá para ligar às vendas">sem MLB</span>';
        if (!vendasCarregadas) return '<span class="pi-vazio">…</span>';
        if (!precoDoProduto(p)) return '<span class="pi-vazio" title="Sem vendas no histórico: não há valor de venda para estimar">sem vendas</span>';
        return `<span class="pi-vazio" title="${c && c.amostras === 0 ? 'Nenhum produto desta categoria tem custo e preço para servir de base' : ''}">sem base</span>`;
    }

    function renderResumoCategorias() {
        const caixa = document.getElementById('piCats');
        const botao = document.getElementById('piToggleCats');
        if (!caixa || !botao) return;
        caixa.style.display = estado.resumoAberto ? 'block' : 'none';
        botao.classList.toggle('active', estado.resumoAberto);
        if (!estado.resumoAberto) return;

        const { cats } = calcularEstimativas();
        const lista = Array.from(cats.values()).filter(c => c.semCusto > 0 || c.comCusto > 0)
            .sort((a, b) => b.semCusto - a.semCusto || a.nome.localeCompare(b.nome, 'pt-BR'));
        const pct = v => v == null ? '<span class="pi-vazio">—</span>' : (v * 100).toFixed(1).replace('.', ',') + '%';
        const dinheiro = v => v == null ? '<span class="pi-vazio">—</span>' : brl(v);

        caixa.innerHTML = `
            <div class="table-responsive">
            <table class="table table-sm table-bordered" style="background:#fff;">
                <thead><tr>
                    <th>Categoria</th><th class="text-right">Com custo</th><th class="text-right">Sem custo</th>
                    <th class="text-right" title="Produtos com custo E vendas usados para calcular o percentual">Base do cálculo</th>
                    <th class="text-right" title="Média de (custo ÷ valor de venda) dos produtos com custo">Custo = % da venda</th>
                    <th class="text-right" title="Média do valor de venda dos produtos sem custo da categoria">Venda média (sem custo)</th>
                    <th class="text-right" title="Venda média × custo % da venda">Custo estimado médio</th>
                </tr></thead>
                <tbody>${lista.map(c => `
                    <tr class="${estado.categoria === c.nome ? 'foco' : ''}">
                        <td><a href="#" data-cat="${esc(c.nome)}">${esc(c.nome)}</a></td>
                        <td class="text-right">${c.comCusto}</td>
                        <td class="text-right">${c.semCusto}</td>
                        <td class="text-right">${c.amostras}${c.descartadas ? ` <small class="text-muted" title="custo maior que a venda (ou menor que 1%) ignorado">(+${c.descartadas} ignorado)</small>` : ''}</td>
                        <td class="text-right">${c.margem == null ? '<span class="pi-vazio">—</span>' : pct(1 - c.margem)}</td>
                        <td class="text-right">${dinheiro(c.precoMedioSem)}</td>
                        <td class="text-right"><strong>${dinheiro(c.custoMedioEstimado)}</strong></td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
            <small class="text-muted">Valor de venda de cada produto = média unitária de todas as vendas dele no histórico (valor da venda ÷ unidades, onde as unidades vêm dos 3 primeiros caracteres do SKU vendido). Custo = % da venda: média (custo ÷ valor de venda) dos produtos da categoria que têm custo. Cada produto sem custo recebe: valor de venda médio dele × esse percentual (ex.: categoria com custo de 10% da venda e produto vendendo em média R$ 30,00 → custo estimado R$ 3,00). Recalcula sozinho quando um custo é lançado ou atualizado.</small>`;

        caixa.querySelectorAll('a[data-cat]').forEach(a => a.addEventListener('click', e => {
            e.preventDefault();
            estado.categoria = a.dataset.cat;
            estado.pagina = 1;
            const sel = document.getElementById('piCategoria');
            if (sel) sel.value = estado.categoria;
            render();
        }));
    }

    // ---------- filtros ----------
    function filtrados() {
        const termo = estado.busca.trim().toLowerCase();
        const lista = produtos().filter(p => {
            if (estado.categoria && p.categoria !== estado.categoria) return false;
            if (termo) {
                const bate = [p.nome, p.sku, p.categoria].some(x => String(x || '').toLowerCase().includes(termo)) ||
                    mlbsDoProduto(p).some(m => m.toLowerCase().includes(termo)) ||
                    fornecedorDoProduto(p).toLowerCase().includes(termo);
                if (!bate) return false;
            }
            if (!passaOp(Number(p.quantidade) || 0, estado.qtdOp, estado.qtdVal)) return false;
            if (!passaOp(custoDoProduto(p), estado.custoOp, estado.custoVal)) return false;
            if (estado.statusCusto) {
                const tem = temCustoExato(p);
                if (estado.statusCusto === 'com' && !tem) return false;
                if (estado.statusCusto === 'sem' && tem) return false;
                if (estado.statusCusto === 'estimado' && (tem || !estimativaDoProduto(p))) return false;
            }
            return true;
        });

        const dir = estado.ordemDir;
        const chave = {
            nome: p => String(p.nome || '').toLowerCase(),
            sku: p => String(p.sku || '').toLowerCase(),
            estoque: p => Number(p.quantidade) || 0,
            custo: p => ultimoCustoDoProduto(p),
            customedio: p => custoMedioDoProduto(p),
            fornecedor: p => fornecedorDoProduto(p).toLowerCase(),
            mlb: p => (mlbsDoProduto(p)[0] || '~~~~').toLowerCase(),
            venda: p => { const v = precoDoProduto(p); return v ? v.media : Infinity; },
            estimado: p => { const e = estimativaDoProduto(p); return e ? e.custo : Infinity; },
            niveis: p => {
                const r = api();
                if (!r || typeof r.produtoNoEscopo !== 'function') return 0;
                const aplic = regras().filter(g => { try { return r.produtoNoEscopo(p, g); } catch (e) { return false; } });
                if (!aplic.length) return Infinity;
                return Math.min(...aplic.map(g => Number(g.gatilho_qtd) || 0));
            },
            valor: p => { const a = analise(p); return a && a.valorEstoque != null ? a.valorEstoque : (Number(p.quantidade) || 0) * custoDoProduto(p); },
            vendas: p => { const a = analise(p); return a ? a.vendasTotal || 0 : 0; },
            projecao: p => { const a = analise(p); return a && a.projecaoDias != null ? a.projecaoDias : Infinity; },
            semvenda: p => { const a = analise(p); return a && a.diasSemVenda != null ? a.diasSemVenda : Infinity; }
        }[estado.ordemCol] || (p => String(p.nome || '').toLowerCase());

        lista.sort((a, b) => {
            const x = chave(a), y = chave(b);
            if (x < y) return -1 * dir;
            if (x > y) return 1 * dir;
            return 0;
        });
        return lista;
    }

    // Usado pelo painel de regras: o escopo de uma regra nova sai daqui.
    function lerFiltro() {
        const ids = Array.from(estado.selecionados).map(String);
        return {
            produto_ids: ids.length ? ids : null,
            termo: estado.busca.trim().toLowerCase() || null,
            categoria: estado.categoria || null,
            custo_op: estado.custoOp || null,
            custo_valor: estado.custoVal === '' ? null : Number(estado.custoVal),
            qtd_op: estado.qtdOp || null,
            qtd_valor: estado.qtdVal === '' ? null : Number(estado.qtdVal)
        };
    }
    function telaAberta() {
        const el = document.getElementById(ID_TELA);
        return !!el && !el.classList.contains('hidden');
    }

    // ---------- níveis de estoque ----------
    function rotuloDegrau(d) {
        const v = Number(d.valor) || 0;
        if (d.modo === 'soma') return (v >= 0 ? '+' : '') + brl(v);
        if (d.modo === 'fixo') return '= ' + brl(v);
        return (v > 0 ? '+' : '') + v + '%';
    }

    function niveisHtml(p) {
        const r = api();
        if (!r || typeof r.produtoNoEscopo !== 'function') return '<span class="pi-vazio">—</span>';
        const qtd = Number(p.quantidade) || 0;
        const aplicaveis = regras().filter(regra => {
            try { return r.produtoNoEscopo(p, regra); } catch (e) { return false; }
        });
        if (!aplicaveis.length) return '<span class="pi-vazio">Sem regra</span>';

        return aplicaveis.map(regra => {
            const escada = Array.isArray(regra.escada) ? regra.escada : [];
            const gatilho = Number(regra.gatilho_qtd) || (escada[0] && Number(escada[0].nivel)) || 0;
            const chips = escada.map(d => {
                const atual = Number(d.nivel) === qtd;
                return `<span class="pi-nivel${atual ? ' atual' : ''}" title="Estoque ${d.nivel}: ${esc(rotuloDegrau(d))}">
                    <b>${d.nivel}</b> ${esc(rotuloDegrau(d))}</span>`;
            }).join('');
            const situacao = qtd > gatilho ? `acima do gatilho (${gatilho})` : (qtd <= 0 ? 'sem estoque' : `no nível ${qtd}`);
            return `<div class="pi-regra${regra.ativo === false ? ' pausada' : ''}">
                <div class="pi-regra-topo">${esc(regra.nome || 'Regra')}${regra.ativo === false ? ' · pausada' : ''} <span>· ${esc(situacao)}</span></div>
                ${escada.length > 10
                    ? `<details><summary style="cursor:pointer;font-size:12px;color:#475569;">${escada.length} níveis (do ${gatilho} ao 1) — clique para ver</summary><div class="pi-chips" style="margin-top:4px;">${chips}</div></details>`
                    : `<div class="pi-chips">${chips || '<span class="pi-vazio">sem degraus</span>'}</div>`}
            </div>`;
        }).join('');
    }

    // ---------- estilo ----------
    function garantirEstilo() {
        if (document.getElementById('precificacaoInteligenteEstilo')) return;
        const st = document.createElement('style');
        st.id = 'precificacaoInteligenteEstilo';
        st.textContent = `
            #${ID_TELA} .pi-filtros{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 16px;border-bottom:1px solid #eef0f4;}
            #${ID_TELA} .pi-filtros .form-control{height:38px;}
            #${ID_TELA} .pi-filtros .pi-num{width:90px;}
            #${ID_TELA} .pi-filtros label{font-size:12px;color:#64748b;margin:0;}
            #${ID_TELA} table th{white-space:nowrap;cursor:pointer;user-select:none;font-size:12px;}
            #${ID_TELA} table th.sem-ordem{cursor:default;}
            #${ID_TELA} table th:hover .pi-sort{color:#0d6efd !important;}
            #${ID_TELA} table td{vertical-align:top;font-size:13px;}
            #${ID_TELA} .pi-nome{font-weight:600;max-width:320px;}
            #${ID_TELA} .pi-sku{font-family:monospace;font-size:12px;}
            #${ID_TELA} .pi-mlb{display:block;font-size:11px;color:#3b82f6;}
            #${ID_TELA} .pi-vazio{color:#adb5bd;font-size:12px;}
            #${ID_TELA} .pi-regra{margin-bottom:6px;}
            #${ID_TELA} .pi-regra.pausada{opacity:.55;}
            #${ID_TELA} .pi-regra-topo{font-size:11px;color:#64748b;margin-bottom:2px;}
            #${ID_TELA} .pi-regra-topo span{color:#94a3b8;}
            #${ID_TELA} .pi-chips{display:flex;flex-wrap:wrap;gap:4px;}
            #${ID_TELA} .pi-nivel{font-size:11px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:1px 6px;white-space:nowrap;}
            #${ID_TELA} .pi-nivel b{color:#0f172a;}
            #${ID_TELA} .pi-nivel.atual{background:#7c3aed;border-color:#7c3aed;color:#fff;}
            #${ID_TELA} .pi-nivel.atual b{color:#fff;}
            #${ID_TELA} .pi-pag{display:flex;flex-wrap:wrap;gap:4px;align-items:center;justify-content:center;padding:12px;}
            #${ID_TELA} .pi-resumo{padding:8px 16px;font-size:12px;color:#64748b;}
            #${ID_TELA} .pi-precos-status{padding:0 16px 8px;font-size:12px;color:#64748b;}
            #${ID_TELA} .pi-cats-box{padding:0 16px 12px;}
            #${ID_TELA} .pi-cats-box table{font-size:12px;margin-top:8px;}
            #${ID_TELA} .pi-cats-box tr.foco td{background:#eef2ff;}
            #${ID_TELA} .pi-preco{font-weight:600;color:#0f172a;white-space:nowrap;}
            #${ID_TELA} .pi-linha{display:block;height:20px;line-height:20px;white-space:nowrap;}
            #${ID_TELA} .pi-est{font-style:italic;color:#7c3aed;font-weight:600;}
            #${ID_TELA} .pi-est small{display:block;font-style:normal;font-weight:400;color:#94a3b8;}
            #${ID_TELA} .pi-mlb-linha{display:block;white-space:nowrap;}
        `;
        document.head.appendChild(st);
    }

    // ---------- tela ----------
    function montarEsqueleto() {
        let tela = document.getElementById(ID_TELA);
        if (tela) return tela;
        garantirEstilo();
        tela = document.createElement('div');
        tela.id = ID_TELA;
        tela.className = 'hidden';
        // Mesmo esqueleto das outras abas: cabeçalho com a logo + card com título e ações.
        tela.innerHTML = `
            <header class="main-header">
                <div class="container">
                    <div class="header-content">
                        <h1 style="display: flex; align-items: center; gap: 10px;">
                            <img src="logo.png" alt="Wheel Tech" style="height: 35px; width: auto;">
                            <span>Precificação Inteligente</span>
                        </h1>
                    </div>
                </div>
            </header>

            <div class="card mb-4">
                <div class="card-header">
                    <h2 class="card-title"><i class="fas fa-wand-magic-sparkles"></i> Produtos, custos e níveis de estoque</h2>
                    <div class="d-flex gap-2 align-items-center pi-acoes"></div>
                </div>
                <div class="pi-filtros">
                    <input type="text" id="piBusca" class="form-control" placeholder="🔍 Buscar por nome, SKU, MLB ou fornecedor..." style="min-width:260px;flex:1;">
                    <select id="piCategoria" class="form-control" style="width:auto;"><option value="">Todas as categorias</option></select>
                    <label>Estoque</label>
                    <select id="piQtdOp" class="form-control" style="width:auto;"><option value="">—</option><option value="lte">≤</option><option value="gte">≥</option><option value="eq">=</option></select>
                    <input type="number" id="piQtdVal" class="form-control pi-num" placeholder="qtd">
                    <label>Custo</label>
                    <select id="piCustoOp" class="form-control" style="width:auto;"><option value="">—</option><option value="lte">≤</option><option value="gte">≥</option><option value="eq">=</option></select>
                    <input type="number" step="0.01" id="piCustoVal" class="form-control pi-num" placeholder="R$">
                    <label>Situação do custo</label>
                    <select id="piStatusCusto" class="form-control" style="width:auto;">
                        <option value="">Todos</option>
                        <option value="com">Só com custo exato</option>
                        <option value="sem">Só sem custo</option>
                        <option value="estimado">Sem custo, com estimativa</option>
                    </select>
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="piLimpar"><i class="fas fa-eraser"></i> Limpar filtros</button>
                </div>
                <div class="pi-resumo" id="piResumo"></div>
                <div class="pi-precos-status" id="piPrecosStatus"></div>
                <div class="pi-cats-box">
                    <button type="button" class="btn btn-sm btn-outline-primary" id="piToggleCats"><i class="fas fa-chart-pie"></i> Estimativa de custo por categoria</button>
                    <div id="piCats" style="display:none;"></div>
                </div>
                <div class="table-responsive">
                    <table class="table table-striped table-hover" style="margin:0;">
                        <thead>
                            <tr>
                                <th class="sem-ordem" style="width:34px;"><input type="checkbox" id="piSelTodos" title="Selecionar todos os filtrados"></th>
                                <th data-col="nome">Nome do produto <i class="fas fa-sort pi-sort"></i></th>
                                <th data-col="sku">SKU <i class="fas fa-sort pi-sort"></i></th>
                                <th data-col="mlb">MLB <i class="fas fa-sort pi-sort"></i></th>
                                <th data-col="venda" title="Média unitária de todas as vendas do produto (valor da venda ÷ quantidade do SKU)">Valor de venda (un.) <i class="fas fa-sort pi-sort"></i></th>
                                <th data-col="estoque">Estoque <i class="fas fa-sort pi-sort"></i></th>
                                <th data-col="custo">Último custo <i class="fas fa-sort pi-sort"></i></th>
                                <th data-col="customedio">Média custo <i class="fas fa-sort pi-sort"></i></th>
                                <th data-col="estimado">Custo estimado <i class="fas fa-sort pi-sort"></i></th>
                                <th data-col="fornecedor">Fornecedor <i class="fas fa-sort pi-sort"></i></th>
                                <th data-col="vendas">Vendas <i class="fas fa-sort pi-sort"></i></th>
                                <th data-col="valor">Valor em estoque <i class="fas fa-sort pi-sort"></i></th>
                                <th data-col="projecao">Projeção <i class="fas fa-sort pi-sort"></i></th>
                                <th data-col="semvenda">Sem venda há <i class="fas fa-sort pi-sort"></i></th>
                                <th data-col="niveis" style="min-width:300px;">Níveis de estoque <i class="fas fa-sort pi-sort"></i></th>
                            </tr>
                        </thead>
                        <tbody id="piCorpo"><tr><td colspan="15" class="text-center text-muted" style="padding:30px;">Carregando…</td></tr></tbody>
                    </table>
                </div>
                <div class="pi-pag" id="piPaginacao"></div>
            </div>`;
        document.body.appendChild(tela);

        const ligar = (id, evento, fn) => tela.querySelector('#' + id).addEventListener(evento, fn);
        ligar('piBusca', 'input', e => {
            clearTimeout(temporizadorBusca);
            const v = e.target.value;
            temporizadorBusca = setTimeout(() => { estado.busca = v; estado.pagina = 1; render(); }, 250);
        });
        ligar('piCategoria', 'change', e => { estado.categoria = e.target.value; estado.pagina = 1; render(); });
        ligar('piQtdOp', 'change', e => { estado.qtdOp = e.target.value; estado.pagina = 1; render(); });
        ligar('piQtdVal', 'input', e => { estado.qtdVal = e.target.value; estado.pagina = 1; render(); });
        ligar('piCustoOp', 'change', e => { estado.custoOp = e.target.value; estado.pagina = 1; render(); });
        ligar('piCustoVal', 'input', e => { estado.custoVal = e.target.value; estado.pagina = 1; render(); });
        ligar('piStatusCusto', 'change', e => { estado.statusCusto = e.target.value; estado.pagina = 1; render(); });
        ligar('piToggleCats', 'click', () => { estado.resumoAberto = !estado.resumoAberto; renderResumoCategorias(); });
        ligar('piLimpar', 'click', () => {
            Object.assign(estado, { busca: '', categoria: '', qtdOp: '', qtdVal: '', custoOp: '', custoVal: '', statusCusto: '', pagina: 1 });
            estado.selecionados.clear();
            ['piBusca', 'piQtdVal', 'piCustoVal'].forEach(id => { tela.querySelector('#' + id).value = ''; });
            ['piCategoria', 'piQtdOp', 'piCustoOp', 'piStatusCusto'].forEach(id => { tela.querySelector('#' + id).value = ''; });
            render();
        });
        ligar('piSelTodos', 'change', e => {
            const lista = filtrados();
            if (e.target.checked) lista.forEach(p => estado.selecionados.add(String(p.id)));
            else lista.forEach(p => estado.selecionados.delete(String(p.id)));
            render();
        });
        tela.querySelectorAll('th[data-col]').forEach(th => th.addEventListener('click', () => {
            if (estado.ordemCol === th.dataset.col) estado.ordemDir *= -1;
            else { estado.ordemCol = th.dataset.col; estado.ordemDir = 1; }
            render();
        }));
        tela.querySelector('#piCorpo').addEventListener('change', e => {
            const cb = e.target.closest('input[data-sel]');
            if (!cb) return;
            if (cb.checked) estado.selecionados.add(cb.dataset.sel); else estado.selecionados.delete(cb.dataset.sel);
            atualizarResumo(filtrados().length);
        });
        tela.querySelector('#piPaginacao').addEventListener('click', e => {
            const b = e.target.closest('button[data-pag]');
            if (!b || b.disabled) return;
            estado.pagina = Number(b.dataset.pag);
            render();
            tela.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        return tela;
    }

    let ultimoValorTotal = 0;
    function atualizarResumo(total) {
        const el = document.getElementById('piResumo');
        if (!el) return;
        const sel = estado.selecionados.size;
        el.innerHTML = `${total} produto(s) no filtro · valor total em estoque: <strong>${brl(ultimoValorTotal)}</strong>` +
            (sel ? ` · <strong>${sel} selecionado(s)</strong> — uma regra nova vale só para eles` :
                ' · uma regra nova vale para os produtos do filtro acima (marque produtos para escolher a dedo)');
    }

    function preencherCategorias() {
        const sel = document.getElementById('piCategoria');
        if (!sel) return;
        const atual = estado.categoria;
        const cats = [...new Set(produtos().map(p => p.categoria).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));
        sel.innerHTML = '<option value="">Todas as categorias</option>' +
            cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
        sel.value = cats.includes(atual) ? atual : '';
    }

    function render() {
        const corpo = document.getElementById('piCorpo');
        if (!corpo) return;
        assinaturaCache = assinaturaCustos();

        const lista = filtrados();
        const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
        if (estado.pagina > totalPaginas) estado.pagina = totalPaginas;
        const pagina = lista.slice((estado.pagina - 1) * POR_PAGINA, estado.pagina * POR_PAGINA);

        ultimoValorTotal = lista.reduce((soma, p) => {
            const a = analise(p);
            return soma + (a && a.valorEstoque != null ? a.valorEstoque : (Number(p.quantidade) || 0) * custoDoProduto(p));
        }, 0);
        atualizarResumo(lista.length);

        const todosMarcados = lista.length > 0 && lista.every(p => estado.selecionados.has(String(p.id)));
        const selTodos = document.getElementById('piSelTodos');
        if (selTodos) selTodos.checked = todosMarcados;

        document.querySelectorAll(`#${ID_TELA} th[data-col]`).forEach(th => {
            const ativo = th.dataset.col === estado.ordemCol;
            const icone = th.querySelector('.pi-sort');
            if (icone) {
                icone.className = 'fas pi-sort ' + (ativo ? (estado.ordemDir === 1 ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort');
                icone.style.color = ativo ? '#0d6efd' : '#adb5bd';
            }
        });

        if (!lista.length) {
            corpo.innerHTML = '<tr><td colspan="15" class="text-center text-muted" style="padding:30px;">Nenhum produto encontrado.</td></tr>';
        } else {
            corpo.innerHTML = pagina.map(p => {
                const mlbs = mlbsDoProduto(p);
                const custo = ultimoCustoDoProduto(p);
                const forn = fornecedorDoProduto(p);
                const qtd = Number(p.quantidade) || 0;
                return `<tr>
                    <td><input type="checkbox" data-sel="${esc(p.id)}" ${estado.selecionados.has(String(p.id)) ? 'checked' : ''}></td>
                    <td class="pi-nome">${esc(p.nome)}</td>
                    <td class="pi-sku">${esc(p.sku)}</td>
                    <td>${mlbs.length ? mlbs.map(m => `<span class="pi-linha pi-mlb">${esc(m)}</span>`).join('') : '<span class="pi-vazio">—</span>'}</td>
                    <td>${htmlValorVenda(p)}</td>
                    <td><strong style="color:${qtd <= 0 ? '#dc3545' : '#0f172a'};">${qtd}</strong></td>
                    <td>${custo > 0 ? brl(custo) : '<span class="pi-vazio">—</span>'}</td>
                    <td>${custoMedioDoProduto(p) > 0 ? brl(custoMedioDoProduto(p)) : '<span class="pi-vazio">—</span>'}</td>
                    <td>${htmlCustoEstimado(p)}</td>
                    <td>${forn ? esc(forn) : '<span class="pi-vazio">—</span>'}</td>
                    <td>${celulaAnalise('vendas', p)}</td>
                    <td>${celulaAnalise('valor', p)}</td>
                    <td>${celulaAnalise('projecao', p)}</td>
                    <td>${celulaAnalise('semVenda', p)}</td>
                    <td>${niveisHtml(p)}</td>
                </tr>`;
            }).join('');
        }

        atualizarStatusPrecos();
        renderResumoCategorias();

        const pag = document.getElementById('piPaginacao');
        if (pag) {
            if (totalPaginas <= 1) pag.innerHTML = '';
            else {
                const nums = [];
                for (let n = 1; n <= totalPaginas; n++) {
                    if (n === 1 || n === totalPaginas || Math.abs(n - estado.pagina) <= 2) nums.push(n);
                    else if (nums[nums.length - 1] !== '…') nums.push('…');
                }
                const bt = (rot, n, desab, ativo) => `<button class="btn btn-sm ${ativo ? 'btn-primary' : 'btn-outline-secondary'}" data-pag="${n}" ${desab ? 'disabled' : ''}>${rot}</button>`;
                pag.innerHTML = bt('<i class="fas fa-chevron-left"></i>', estado.pagina - 1, estado.pagina <= 1, false) +
                    nums.map(n => n === '…' ? '<span class="px-1 text-muted">…</span>' : bt(n, n, false, n === estado.pagina)).join('') +
                    bt('<i class="fas fa-chevron-right"></i>', estado.pagina + 1, estado.pagina >= totalPaginas, false) +
                    `<small class="text-muted ml-2">Página ${estado.pagina} de ${totalPaginas}</small>`;
            }
        }
    }

    async function carregarDados() {
        if (carregando) return;
        carregando = true;
        try {
            if (!produtos().length && typeof carregarProdutosEstoque === 'function') {
                await carregarProdutosEstoque();
            }
            const a = window.WTEstoqueAnalise;
            if (a && typeof a.garantirMetricas === 'function') {
                try { await a.garantirMetricas(); } catch (e) { /* segue sem fornecedor */ }
            }
            const r = api();
            if (r && typeof r.carregar === 'function') await r.carregar();
        } finally {
            carregando = false;
        }
        preencherCategorias();
        render();
        await carregarHistoricoVendas();
        render();
    }

    // Recalcula sozinho quando um custo muda (entrada dada neste navegador) e
    // recarrega os produtos de tempos em tempos (custos lançados por outras pessoas).
    let assinaturaAnterior = '';
    setInterval(() => {
        if (!telaAberta()) return;
        const a = assinaturaCustos();
        if (a !== assinaturaAnterior) {
            assinaturaAnterior = a;
            render();
        }
    }, 4000);

    setInterval(async () => {
        if (!telaAberta() || carregando || document.hidden) return;
        try {
            if (typeof carregarProdutosEstoque === 'function') {
                await carregarProdutosEstoque();
                if (window.WTEstoqueAnalise && window.WTEstoqueAnalise.recarregarMetricas) window.WTEstoqueAnalise.recarregarMetricas();
                await carregarHistoricoVendas();
                preencherCategorias();
                render();
            }
        } catch (e) { /* tenta de novo no próximo ciclo */ }
    }, 5 * 60 * 1000);

    // ---------- abrir ----------
    window.abrirPrecificacaoInteligente = async function () {
        if (!permitido()) {
            if (window.showToast) window.showToast('🔒 Só Andressa e Ronald acessam a Precificação inteligente.', 'warning');
            return;
        }
        if (typeof window.esconderTodosOsSistemas === 'function') window.esconderTodosOsSistemas(ID_TELA);
        document.getElementById('menuSystem')?.classList.add('hidden');
        const tela = montarEsqueleto();
        tela.classList.remove('hidden');
        window.scrollTo(0, 0);
        render();
        await carregarDados();
    };

    window.addEventListener('wt-regras-nivel-atualizadas', () => { if (telaAberta()) render(); });

    window.PrecificacaoInteligente = { lerFiltro, telaAberta, render };

    // ---------- menu lateral (só quem tem permissão) ----------
    function garantirBotoesMenu() {
        document.querySelectorAll('.wt-module-nav').forEach(nav => {
            const existente = nav.querySelector('[data-menu-visual-key="precificacao_inteligente"]');
            if (!permitido()) { if (existente) existente.remove(); return; }
            if (existente) return;
            const ancora = nav.querySelector('[data-menu-visual-key="gestao_de_estoque"]');
            if (!ancora) return;
            const b = document.createElement('button');
            b.className = 'wt-nav-item';
            b.type = 'button';
            b.setAttribute('data-menu-visual-key', 'precificacao_inteligente');
            b.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i><span>Precificação inteligente</span>';
            b.addEventListener('click', () => window.abrirPrecificacaoInteligente());
            ancora.insertAdjacentElement('afterend', b);
        });
    }

    // A tela não é um dos sistemas que voltarParaMenu() conhece.
    function envolverVoltar() {
        if (window.__piVoltarEnvolvido || typeof window.voltarParaMenu !== 'function') return;
        window.__piVoltarEnvolvido = true;
        const original = window.voltarParaMenu;
        window.voltarParaMenu = function () {
            document.getElementById(ID_TELA)?.classList.add('hidden');
            return original.apply(this, arguments);
        };
    }

    setInterval(() => {
        envolverVoltar();
        if (window.currentUser) garantirBotoesMenu();
    }, 1500);
})();
