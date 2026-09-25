/* ============================================================
   WHEEL TECH · Regras de nível de estoque  —  ESCADA DE PREÇOS
   ------------------------------------------------------------
   1. Filtra os produtos na aba Gestão de Estoque.
   2. Abre "⚡ Regras de nível" -> Nova regra. O escopo vem do
      filtro atual.
   3. Define o estoque do gatilho (topo da escada). Aparece uma
      linha por nível (gatilho ... 1). Cada linha: um degrau em %
      OU um preço fixo R$. Ao mexer numa linha, as de baixo
      herdam o valor dela.
   4. Preview: para cada produto do filtro, cada MLB, o preço
      atual (puxado do ML) + o preço que fica em cada nível.
   5. Rodando: quando o estoque de um produto chega num nível, o
      sistema poe o preço de todos os anúncios (mlb_codes) no
      valor daquele nível. Acompanha nos dois sentidos. Passou do
      gatilho -> volta ao preço original.

   Tabelas: regras_nivel_estoque + regras_nivel_disparos
   (rodar SETUP_REGRAS_NIVEL.sql).
   ============================================================ */
(function () {
    'use strict';

    // Regras de nível de estoque mexem em preço/custo — restrito só a
    // essas duas pessoas, mesmo que outras também sejam Administrador.
    const USUARIOS_REGRAS_NIVEL_ESTOQUE = ['andressamiotto', 'ronald'];
    const ML_BASE = 'https://api.mercadolibre.com';

    let regrasCache = [];
    let avaliando = false;
    let ultimaAvaliacao = 0;
    let ultimoSino = 0;
    const precoMLBCache = {};   // mlb -> { preco, quando }

    // ---------- helpers ------------------------------------
    function ehAdmin() {
        const u = (window.currentUser && window.currentUser.username || '').toLowerCase();
        return !!u && USUARIOS_REGRAS_NIVEL_ESTOQUE.includes(u);
    }
    function sb() { return window.supabaseClient || null; }
    function toast(m, t) { if (window.showToast) window.showToast(m, t || 'info'); else console.log('[regras-nivel]', m); }
    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function getProdutos() {
        try { return (typeof produtosEstoque !== 'undefined' && produtosEstoque) || []; } catch (e) { return []; }
    }
    // O motor precisa da lista de produtos MESMO se ninguém abriu a aba
    // Gestão de Estoque nesta sessão (o alerta deve funcionar de
    // qualquer tela). Se a variável global da tela ainda não foi
    // carregada, busca direto do banco (com cache de 5 min).
    let produtosMotorCache = null;
    let produtosMotorCacheQuando = 0;
    async function obterProdutosParaMotor() {
        const vivos = getProdutos();
        if (vivos && vivos.length) return vivos;
        if (produtosMotorCache && Date.now() - produtosMotorCacheQuando < 5 * 60000) return produtosMotorCache;
        const cli = sb();
        if (!cli) return [];
        try {
            // mlb_codes não existe como coluna própria — vive dentro
            // do jsonb dados_extra (ver mlbsDoProduto abaixo). Pedir
            // ela direto no select faz o PostgREST rejeitar a query
            // inteira com 400 (coluna inexistente).
            const { data, error } = await cli.from('produtos_estoque')
                .select('id, sku, nome, categoria, quantidade, dados_extra, ultimo_custo, custo_medio')
                .limit(20000);
            if (error) throw error;
            produtosMotorCache = data || [];
            produtosMotorCacheQuando = Date.now();
            return produtosMotorCache;
        } catch (e) {
            console.warn('[regras-nivel] produtos para o motor:', e.message || e);
            return produtosMotorCache || [];
        }
    }
    function getEstadoFiltros() {
        try { return (typeof estadoFiltrosEstoque !== 'undefined' && estadoFiltrosEstoque) || {}; } catch (e) { return {}; }
    }
    function custoDoProduto(p) {
        return Number(p.ultimo_custo || p.dados_extra?.ultimo_custo ||
            p.custo_medio || p.dados_extra?.custo_medio || 0) || 0;
    }
    function mlbsDoProduto(p) {
        let m = p.mlb_codes || p.dados_extra?.mlb_codes || [];
        if (typeof m === 'string') m = m.split(',').map(s => s.trim()).filter(Boolean);
        return Array.isArray(m) ? m.filter(Boolean).map(String) : [];
    }
    function fmtBRL(v) {
        return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }
    function passaOp(valor, op, alvo) {
        if (!op || alvo === '' || alvo == null || isNaN(alvo)) return true;
        const a = Number(alvo);
        if (op === 'lte') return valor <= a;
        if (op === 'gte') return valor >= a;
        if (op === 'eq') return valor === a;
        return true;
    }
    function sinalTxt(op) { return op === 'lte' ? '≤' : op === 'gte' ? '≥' : '='; }

    // ---------- token / ML --------------------------------
    async function obterTokenML() {
        let token = null;
        try { token = localStorage.getItem('ml_access_token'); } catch (e) {}
        if (!token && typeof window.getValidToken === 'function') {
            try { const d = await window.getValidToken(); token = d && d.access_token; } catch (e) {}
        }
        return token || window._mlAccessToken || null;
    }
    async function mlGET(url, token) {
        const proxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
        const r = await fetch(proxy);
        if (!r.ok) throw new Error('GET ' + r.status);
        return r.json();
    }
    async function mlPUT(url, token, body) {
        try {
            const proxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}&method=PUT`;
            const r = await fetch(proxy, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (r.ok) return { ok: true };
            const txt = await r.text();
            const direct = await fetch(`${url}?access_token=${encodeURIComponent(token)}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
            });
            if (direct.ok) return { ok: true };
            return { ok: false, erro: `${r.status} ${txt.slice(0, 120)}` };
        } catch (e) { return { ok: false, erro: String(e.message || e) }; }
    }
    async function precoAtualMLB(mlb, token) {
        const c = precoMLBCache[mlb];
        if (c && Date.now() - c.quando < 5 * 60000) return c.preco;
        try {
            const it = await mlGET(`${ML_BASE}/items/${mlb}?attributes=id,price`, token);
            const preco = Number(it.price) || 0;
            precoMLBCache[mlb] = { preco, quando: Date.now() };
            return preco;
        } catch (e) { return null; }
    }

    // ---------- promoção ativa (pra não mudar preço de anúncio em promoção sem avisar) ----------
    const NOMES_TIPO_PROMO_RN = {
        PRICE_DISCOUNT: 'Nova proposta para ganhar exposição',
        DEAL: 'Oferta do dia',
        SELLER_CAMPAIGN: 'Campanha do vendedor',
        MARKETPLACE_CAMPAIGN: 'Campanha do Mercado Livre',
        SELLER_COUPON_CAMPAIGN: 'Cupom do vendedor',
        PRE_NEGOTIATED: 'Pré-negociado',
        UNHEALTHY_STOCK: 'Acelere suas vendas do Full'
    };
    const cachePromoAtivaMLB = {};
    // devolve null (sem promoção ativa agora) ou { nome, tipo, preco } — preco é
    // o valor que está valendo pro comprador enquanto a promoção estiver rodando.
    async function obterPromocaoAtivaMLB(mlb, token) {
        const c = cachePromoAtivaMLB[mlb];
        if (c && Date.now() - c.quando < 2 * 60000) return c.resultado;
        let resultado = null;
        try {
            const lista = await mlGET(`${ML_BASE}/seller-promotions/items/${mlb}?app_version=v2`, token);
            const ativa = (Array.isArray(lista) ? lista : []).find(pr => String(pr?.status || '').toLowerCase() === 'started');
            if (ativa) {
                let preco = Number(ativa.price) || 0;
                if (!preco) preco = (await precoAtualMLB(mlb, token)) || 0;
                resultado = {
                    nome: ativa.name || NOMES_TIPO_PROMO_RN[ativa.type] || ativa.type || 'Promoção ativa',
                    tipo: ativa.type || '',
                    preco
                };
            }
        } catch (e) { resultado = null; }
        cachePromoAtivaMLB[mlb] = { quando: Date.now(), resultado };
        return resultado;
    }
    // confere vários mlbs de uma vez — devolve só os que estão em promoção agora
    async function obterPromocoesAtivasVarios(mlbs, token) {
        const promos = {};
        for (const mlb of mlbs) {
            const p = await obterPromocaoAtivaMLB(mlb, token);
            if (p) promos[mlb] = p;
        }
        return promos;
    }

    // ---------- escada ------------------------------------
    // escada: [{nivel, modo:'pct'|'soma'|'fixo', valor}] do gatilho até 1
    // calcula o preço para o nível alvo a partir do preço base.
    // overridesMlb (opcional): { "<nivel>": precoManual } — um valor
    // ajustado à mão pra ESSE mlb; a partir dele a escada continua
    // se aplicando normalmente pros níveis abaixo (auto ajuste em
    // cima do valor manual).
    function precoNoNivel(precoBase, escada, nivelAlvo, overridesMlb) {
        overridesMlb = overridesMlb || {};
        let preco = Number(precoBase) || 0;
        for (const d of escada) {
            if (d.nivel < nivelAlvo) break;   // escada vem ordenada do maior nível pro menor
            const ov = overridesMlb[String(d.nivel)];
            if (ov !== undefined && ov !== null && ov !== '' && !isNaN(Number(ov))) {
                preco = Number(ov);           // ajuste manual: trava aqui e segue dele pra baixo
                continue;
            }
            const v = Number(d.valor) || 0;
            if (d.modo === 'soma') preco = preco + v;          // R$ somado no preço da linha de cima
            else if (d.modo === 'fixo') preco = v;             // R$ absoluto (trava)
            else preco = preco * (1 + v / 100);               // %
        }
        return round2(preco);
    }
    // tira entradas vazias/​inválidas antes de salvar
    function limparOverrides(overrides) {
        const limpo = {};
        Object.keys(overrides || {}).forEach(mlb => {
            const porNivel = overrides[mlb] || {};
            const niveisLimpos = {};
            Object.keys(porNivel).forEach(nivel => {
                const v = porNivel[nivel];
                if (v !== '' && v != null && !isNaN(Number(v))) niveisLimpos[nivel] = Number(v);
            });
            if (Object.keys(niveisLimpos).length) limpo[mlb] = niveisLimpos;
        });
        return limpo;
    }
    function descreverEscada(escada) {
        if (!escada || !escada.length) return '—';
        return escada.map(d => d.modo === 'soma' ? `+${fmtBRL(d.valor)}`
            : d.modo === 'fixo' ? `=${fmtBRL(d.valor)}`
            : `${d.valor > 0 ? '+' : ''}${d.valor}%`).join(' → ');
    }

    // ---------- escopo -----------------------------------
    function lerFiltroAtual() {
        // Na aba "Precificação inteligente" o escopo vem dos filtros/seleção dela.
        const pi = window.PrecificacaoInteligente;
        if (pi && typeof pi.telaAberta === 'function' && pi.telaAberta()) return pi.lerFiltro();
        const est = getEstadoFiltros();
        const g = id => document.getElementById(id);
        let selIds = [];
        try {
            if (typeof produtosSelecionadosMassa !== 'undefined' && produtosSelecionadosMassa && produtosSelecionadosMassa.size)
                selIds = Array.from(produtosSelecionadosMassa).map(String);
        } catch (e) {}
        const termo = (((g('buscaEstoqueInput') && g('buscaEstoqueInput').value) || est.termo || '') + '').trim().toLowerCase();
        const categoria = (g('filtroCategoriaEstoque') && g('filtroCategoriaEstoque').value) || est.categoria || '';
        const custoOp = (g('analiseCustoOp') && g('analiseCustoOp').value) || '';
        const custoVal = (g('analiseCustoVal') && g('analiseCustoVal').value) || '';
        const qtdOp = (g('analiseQtdOp') && g('analiseQtdOp').value) || '';
        const qtdVal = (g('analiseQtdVal') && g('analiseQtdVal').value) || '';
        return {
            produto_ids: selIds.length ? selIds : null,
            termo: termo || null,
            categoria: categoria || null,
            custo_op: custoOp || null,
            custo_valor: custoVal === '' ? null : Number(custoVal),
            qtd_op: qtdOp || null,
            qtd_valor: qtdVal === '' ? null : Number(qtdVal)
        };
    }
    function normEscopo(e) {
        return {
            produto_ids: (e.produto_ids && e.produto_ids.length ? e.produto_ids
                : (Array.isArray(e.escopo_produto_ids) && e.escopo_produto_ids.length ? e.escopo_produto_ids : null)),
            termo: e.termo || e.escopo_termo || null,
            categoria: e.categoria || e.escopo_categoria || null,
            custo_op: e.custo_op || e.escopo_custo_op || null,
            custo_valor: e.custo_valor != null ? e.custo_valor : e.escopo_custo_valor,
            qtd_op: e.qtd_op || e.escopo_qtd_op || null,
            qtd_valor: e.qtd_valor != null ? e.qtd_valor : e.escopo_qtd_valor
        };
    }
    function termoBate(p, termo) {
        if ([p.nome, p.sku, p.categoria].some(x => String(x || '').toLowerCase().includes(termo))) return true;
        return mlbsDoProduto(p).some(m => m.toLowerCase().includes(termo));
    }
    function temEscopo(e) {
        const n = normEscopo(e);
        return !!(n.produto_ids || n.termo || n.categoria || n.custo_op || n.qtd_op);
    }
    function produtoNoEscopo(p, eRaw) {
        const e = normEscopo(eRaw);
        if (e.produto_ids) return e.produto_ids.map(String).includes(String(p.id));
        if (e.categoria && p.categoria !== e.categoria) return false;
        if (e.termo && !termoBate(p, e.termo)) return false;
        if (e.custo_op && !passaOp(custoDoProduto(p), e.custo_op, e.custo_valor)) return false;
        if (e.qtd_op && !passaOp(Number(p.quantidade) || 0, e.qtd_op, e.qtd_valor)) return false;
        return true;
    }
    function produtosDoEscopo(e) {
        return getProdutos().filter(p => produtoNoEscopo(p, e));
    }
    function descreverEscopoObj(e) {
        const n = normEscopo(e);
        if (n.produto_ids) return `${n.produto_ids.length} produto(s) selecionado(s) na tabela`;
        const p = [];
        if (n.categoria) p.push(n.categoria); else p.push('todas as categorias');
        if (n.termo) p.push(`busca "${n.termo}"`);
        if (n.custo_op) p.push(`custo ${sinalTxt(n.custo_op)} ${fmtBRL(n.custo_valor)}`);
        if (n.qtd_op) p.push(`estoque ${sinalTxt(n.qtd_op)} ${n.qtd_valor}`);
        return p.join(' · ');
    }

    // ---------- dados ------------------------------------
    async function carregarRegras() {
        const cli = sb();
        if (!cli) return [];
        const { data, error } = await cli.from('regras_nivel_estoque').select('*').order('criado_em', { ascending: false });
        if (error) { console.warn('[regras-nivel]', error.message); return regrasCache; }
        window.setTimeout(() => window.dispatchEvent(new Event('wt-regras-nivel-atualizadas')), 0);
        regrasCache = (data || []).map(r => ({
            ...r,
            escada: Array.isArray(r.escada) ? r.escada : (r.escada ? JSON.parse(r.escada) : []),
            overrides: (r.overrides && typeof r.overrides === 'object') ? r.overrides : (r.overrides ? JSON.parse(r.overrides) : {}),
            precos_base: (r.precos_base && typeof r.precos_base === 'object') ? r.precos_base : (r.precos_base ? JSON.parse(r.precos_base) : {})
        }));
        return regrasCache;
    }

    // ---------- MOTOR ------------------------------------
    async function avaliarRegras(opts) {
        opts = opts || {};
        if (avaliando || !ehAdmin()) return;
        if (!opts.forcar && Date.now() - ultimaAvaliacao < 45000) return;
        const cli = sb();
        if (!cli) return;
        avaliando = true;
        ultimaAvaliacao = Date.now();
        try {
            const regras = (await carregarRegras()).filter(r => r.ativo && Array.isArray(r.escada) && r.escada.length);
            if (!regras.length) return;

            const { data: estados } = await cli.from('regras_nivel_disparos').select('*');
            const estadoDe = {};
            (estados || []).forEach(s => { estadoDe[s.regra_id + '|' + String(s.produto_id)] = s; });

            const produtos = await obterProdutosParaMotor();
            let token = null;
            let houveMudanca = false;
            let houveNovoReset = false;
            let houveNovaPromoPendente = false;

            for (const r of regras) {
                const gatilho = r.gatilho_qtd;
                for (const p of produtos) {
                    if (!produtoNoEscopo(p, r)) continue;
                    const qtd = Number(p.quantidade) || 0;
                    const chave = r.id + '|' + String(p.id);
                    const estado = estadoDe[chave];
                    const nivelAlvo = qtd > gatilho ? null : Math.max(1, qtd);

                    // --- estoque AUMENTOU desde o último disparo salvo:
                    // não muda o preço sozinho — calcula a recomendação
                    // (pela escada, ou volta ao preço original se saiu
                    // da faixa) e deixa pendente de confirmação do admin.
                    const estoqueSubiu = estado && qtd > (Number(estado.estoque_no_disparo) || 0);
                    if (estoqueSubiu) {
                        if (!token) token = await obterTokenML();
                        const mlbs = mlbsDoProduto(p);
                        const base = estado.precos_base || {};
                        const recomendado = {};
                        for (const mlb of mlbs) {
                            const b = base[mlb] != null ? base[mlb] : 0;
                            recomendado[mlb] = nivelAlvo == null
                                ? round2(b)
                                : precoNoNivel(b, r.escada, nivelAlvo, (r.overrides && r.overrides[mlb]) || {});
                        }
                        const eraNovoAviso = !estado.reset_pendente;
                        await cli.from('regras_nivel_disparos').update({
                            reset_pendente: true,
                            reset_nivel_recomendado: nivelAlvo,
                            reset_precos: recomendado,
                            reset_estoque_novo: qtd,
                            reset_detectado_em: new Date().toISOString()
                        }).eq('id', estado.id);
                        if (eraNovoAviso) houveNovoReset = true;
                        continue;
                    }

                    // --- acima do gatilho: volta ao normal (sem ter sido por reposição de estoque) ---
                    if (nivelAlvo == null) {
                        if (estado) {
                            if (!token) token = await obterTokenML();
                            const base = estado.precos_base || {};
                            const mlbsAlvo = Object.keys(base);

                            // antes de voltar o preço, confere se algum mlb está
                            // em promoção ativa agora — se estiver, não mexe
                            // sozinho: deixa pendente de decisão do admin.
                            const promos = await obterPromocoesAtivasVarios(mlbsAlvo, token);
                            if (Object.keys(promos).length) {
                                const precosAlvo = {};
                                mlbsAlvo.forEach(mlb => { precosAlvo[mlb] = round2(base[mlb]); });
                                await marcarPromocaoPendente(cli, r, p, qtd, null, base, promos, precosAlvo, estado);
                                houveNovaPromoPendente = true;
                                continue;
                            }

                            const log = [];
                            for (const mlb of mlbsAlvo) {
                                const alvo = round2(base[mlb]);
                                const res = token ? await aplicarPreco(mlb, alvo, token) : { ok: false, erro: 'sem token' };
                                log.push({ mlb, preco_novo: alvo, ok: res.ok, erro: res.erro || null, nota: 'voltou ao original' });
                            }
                            await cli.from('regras_nivel_disparos').delete().eq('id', estado.id);
                            houveMudanca = true;
                        }
                        continue;
                    }

                    // produto com reset pendente: não reavalia sozinho
                    // enquanto o admin não decidir (evita ficar mudando
                    // a recomendação sozinho a cada ciclo).
                    if (estado && estado.reset_pendente) continue;

                    // produto com troca de preço travada por promoção ativa:
                    // idem — só volta a mexer depois que o admin decidir.
                    if (estado && estado.promocao_pendente) continue;

                    // --- dentro da escada ---
                    if (estado && estado.nivel_atual === nivelAlvo) continue;

                    const mlbs = mlbsDoProduto(p);
                    if (!mlbs.length) {
                        // registra o disparo mesmo sem anúncio, pra avisar
                        await upsertEstado(cli, r, p, qtd, nivelAlvo, estado ? estado.precos_base : {}, [], estado);
                        houveMudanca = true;
                        continue;
                    }

                    if (!token) token = await obterTokenML();

                    // antes de sequer capturar preço base, já dá pra checar se
                    // algum desses mlbs está em promoção — se estiver, ainda
                    // assim segue pra capturar a base (precisa dela guardada)
                    // e só então marca pendente, sem aplicar nada.

                    // captura preços base na 1ª vez — usa a referência
                    // que já foi salva NA REGRA quando ela foi criada
                    // (r.precos_base). Só busca o preço atual do ML se
                    // essa referência não existir pra este mlb (regra
                    // antiga de antes desta correção, ou mlb adicionado
                    // ao produto depois da regra já criada).
                    let base = (estado && estado.precos_base && Object.keys(estado.precos_base).length) ? estado.precos_base : null;
                    if (!base) {
                        base = {};
                        for (const mlb of mlbs) {
                            const refSalva = r.precos_base && r.precos_base[mlb];
                            if (refSalva != null) {
                                base[mlb] = refSalva;
                                continue;
                            }
                            const pr = token ? await precoAtualMLB(mlb, token) : null;
                            base[mlb] = pr != null ? pr : 0;
                        }
                    }

                    const promosNaEscada = await obterPromocoesAtivasVarios(mlbs, token);
                    if (Object.keys(promosNaEscada).length) {
                        const precosAlvo = {};
                        for (const mlb of mlbs) {
                            const b = base[mlb] != null ? base[mlb] : 0;
                            const overridesMlb = (r.overrides && r.overrides[mlb]) || {};
                            precosAlvo[mlb] = precoNoNivel(b, r.escada, nivelAlvo, overridesMlb);
                        }
                        await marcarPromocaoPendente(cli, r, p, qtd, nivelAlvo, base, promosNaEscada, precosAlvo, estado);
                        houveNovaPromoPendente = true;
                        continue;
                    }

                    const log = [];
                    for (const mlb of mlbs) {
                        const b = base[mlb] != null ? base[mlb] : 0;
                        const overridesMlb = (r.overrides && r.overrides[mlb]) || {};
                        const alvo = precoNoNivel(b, r.escada, nivelAlvo, overridesMlb);
                        if (!alvo || alvo <= 0) { log.push({ mlb, ok: false, erro: 'preço inválido', preco_antigo: b }); continue; }
                        const res = token ? await aplicarPreco(mlb, alvo, token) : { ok: false, erro: 'sem token ML' };
                        log.push({ mlb, preco_antigo: round2(b), preco_novo: alvo, ok: res.ok, erro: res.erro || null });
                    }

                    await upsertEstado(cli, r, p, qtd, nivelAlvo, base, log, estado);
                    houveMudanca = true;
                }
            }

            if (houveMudanca) {
                toast('📉 Regras de nível de estoque aplicadas — preços de anúncios atualizados.', 'warning');
                atualizarSino(true);
                if (typeof window.aplicarFiltrosEOrdenacao === 'function') { try { window.aplicarFiltrosEOrdenacao(); } catch (e) {} }
            }
            if (houveNovoReset) {
                toast('📦 Estoque reposto em produto com preço reajustado — reveja o reset recomendado em Regras de nível → Disparos.', 'info');
                atualizarSino(true);
            }
            if (houveNovaPromoPendente) {
                toast('🏷️ Um produto mudaria de preço pela regra de nível, mas o anúncio está em promoção — decida em Regras de nível → Disparos.', 'info');
                atualizarSino(true);
            }
        } catch (e) {
            console.warn('[regras-nivel] avaliar:', e);
        } finally {
            avaliando = false;
        }
    }

    async function upsertEstado(cli, r, p, qtd, nivel, base, log, estadoExistente) {
        const row = {
            regra_id: r.id,
            produto_id: String(p.id),
            produto_sku: p.sku || null,
            produto_nome: p.nome || null,
            estoque_no_disparo: qtd,
            nivel_atual: nivel,
            acao_descricao: `nível ${nivel} · ${descreverEscada(r.escada)}`,
            precos_base: base || {},
            mlbs: log || [],
            visto: false,
            atualizado_em: new Date().toISOString()
        };
        if (estadoExistente) {
            await cli.from('regras_nivel_disparos').update(row).eq('id', estadoExistente.id);
        } else {
            row.disparado_em = new Date().toISOString();
            await cli.from('regras_nivel_disparos').insert([row]);
        }
    }

    // Produto que mudaria de nível/preço mas tem mlb em promoção ativa agora:
    // não aplica nada sozinho, só registra a recomendação pendente (o admin
    // decide em Disparos). nivelRecomendado null = "voltaria ao preço original".
    async function marcarPromocaoPendente(cli, r, p, qtd, nivelRecomendado, base, promos, precosAlvo, estadoExistente) {
        const camposPendente = {
            estoque_no_disparo: qtd,
            promocao_pendente: true,
            promocao_nivel_recomendado: nivelRecomendado,
            promocao_precos: precosAlvo,
            promocao_info: promos,
            promocao_detectado_em: new Date().toISOString()
        };
        if (estadoExistente) {
            await cli.from('regras_nivel_disparos').update(camposPendente).eq('id', estadoExistente.id);
        } else {
            await cli.from('regras_nivel_disparos').insert([{
                regra_id: r.id,
                produto_id: String(p.id),
                produto_sku: p.sku || null,
                produto_nome: p.nome || null,
                nivel_atual: null,
                acao_descricao: `aguardando decisão sobre promoção ativa · nível recomendado ${nivelRecomendado == null ? 'original' : nivelRecomendado}`,
                precos_base: base || {},
                mlbs: [],
                visto: false,
                disparado_em: new Date().toISOString(),
                atualizado_em: new Date().toISOString(),
                ...camposPendente
            }]);
        }
    }

    // Captura o preço ATUAL de cada mlb dos produtos do escopo — usada
    // como referência fixa da regra a partir de agora. Só é chamada no
    // momento de criar a regra (ou ao ajustar uma regra antiga que
    // ainda não tinha essa referência salva); depois disso, os
    // disparos usam sempre este valor salvo, não o preço do anúncio
    // no momento em que o estoque cruza o nível.
    async function capturarPrecosBaseEscopo(produtos, token) {
        const precos = {};
        if (!token) return precos;
        for (const p of produtos) {
            for (const mlb of mlbsDoProduto(p)) {
                if (precos[mlb] != null) continue;
                const pr = await precoAtualMLB(mlb, token);
                if (pr != null) precos[mlb] = pr;
            }
        }
        return precos;
    }

    async function aplicarPreco(mlb, novoPreco, token) {
        try {
            const item = await mlGET(`${ML_BASE}/items/${mlb}?attributes=id,price,variations`, token);
            const body = { price: novoPreco };
            if (Array.isArray(item.variations) && item.variations.length) {
                body.variations = item.variations.map(v => ({ id: v.id, price: novoPreco }));
                delete body.price;
            }
            precoMLBCache[mlb] = { preco: novoPreco, quando: Date.now() };
            return await mlPUT(`${ML_BASE}/items/${mlb}`, token, body);
        } catch (e) { return { ok: false, erro: String(e.message || e) }; }
    }

    // ---------- estilo ----------------------------------
    function garantirEstilo() {
        if (document.getElementById('regrasNivelEstilo')) return;
        const st = document.createElement('style');
        st.id = 'regrasNivelEstilo';
        st.textContent = `
            #rnOverlay{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;
                justify-content:center;z-index:99999;padding:34px 14px;overflow:auto}
            #rnOverlay.hidden{display:none}
            #rnModal{background:#fff;border-radius:16px;width:100%;max-width:920px;box-shadow:0 24px 60px rgba(0,0,0,.28);overflow:hidden;font-size:14px}
            #rnModal .rn-head{display:flex;align-items:center;justify-content:space-between;padding:15px 22px;border-bottom:1px solid #eef0f4}
            #rnModal .rn-head-acoes{display:flex;align-items:center;gap:8px}
            #rnModal .rn-btn-backup{border:1px solid #d9dee7;background:#f6f7f9;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;color:#334155;font-weight:600}
            #rnModal .rn-btn-backup:hover{background:#ede9fe;border-color:#7c3aed;color:#6d28d9}
            #rnModal .rn-head h3{margin:0;font-size:17px;display:flex;gap:8px;align-items:center}
            #rnModal .rn-fechar{background:none;border:none;font-size:22px;cursor:pointer;color:#64748b}
            #rnModal .rn-tabs{display:flex;gap:6px;padding:12px 22px 0}
            #rnModal .rn-tab{border:1px solid #d9dee7;background:#f6f7f9;border-radius:999px;padding:6px 14px;cursor:pointer;font-size:13px;color:#475569}
            #rnModal .rn-tab.ativa{background:#7c3aed;border-color:#7c3aed;color:#fff;font-weight:600}
            #rnModal .rn-corpo{padding:16px 22px 24px;max-height:70vh;overflow:auto}
            #rnModal fieldset{border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:0 0 14px}
            #rnModal legend{font-weight:700;font-size:12px;color:#64748b;padding:0 6px}
            #rnModal label{font-size:13px;font-weight:600;color:#334155;display:block;margin:6px 0 3px}
            #rnModal input,#rnModal select{border:1px solid #d9dee7;border-radius:8px;padding:7px 9px;font-size:14px}
            #rnModal .rn-escopo-box{background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:10px 12px;font-size:13px;color:#475569}
            #rnModal table.rn-escada{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
            #rnModal table.rn-escada th,#rnModal table.rn-escada td{border:1px solid #e5e7eb;padding:5px 8px;text-align:center}
            #rnModal table.rn-escada th{background:#f8f9fa;font-size:12px}
            #rnModal table.rn-escada input{width:80px;padding:5px 6px}
            #rnModal table.rn-escada select{padding:5px 6px}
            #rnModal table.rn-escada .rn-preco{font-weight:700;color:#0b8043}
            #rnModal .rn-limpar-override{border:none;background:#fee2e2;color:#b91c1c;border-radius:6px;width:22px;height:22px;cursor:pointer;font-size:12px}
            #rnModal .rn-btn{border:none;border-radius:8px;padding:9px 16px;font-size:14px;cursor:pointer;font-weight:600}
            #rnModal .rn-btn-primary{background:#7c3aed;color:#fff}
            #rnModal .rn-btn-sec{background:#e2e8f0;color:#334155}
            #rnModal .rn-prod{border:1px solid #eef0f4;border-radius:10px;margin-bottom:8px}
            #rnModal .rn-prod summary{padding:9px 12px;cursor:pointer;font-weight:600;list-style:none}
            #rnModal .rn-prod summary::-webkit-details-marker{display:none}
            #rnModal .rn-prod .rn-prod-body{padding:6px 12px 12px}
            #rnModal .rn-mlb{font-size:12px;color:#475569;margin:6px 0 2px;font-weight:700}
            #rnModal .rn-regra{border:1px solid #eef0f4;border-radius:10px;padding:12px;margin-bottom:10px}
            #rnModal .rn-regra.off{opacity:.55}
            #rnModal .rn-regra .rn-acoes{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap}
            #rnModal .rn-regra .rn-acoes button{border:none;border-radius:7px;padding:5px 10px;font-size:12px;cursor:pointer;background:#e2e8f0;color:#334155}
            #rnModal .rn-disparo{border:1px solid #eef0f4;border-left:3px solid #f59e0b;border-radius:8px;padding:10px;margin-bottom:8px;font-size:13px}
            #rnModal .rn-disparo.novo{background:#fffbeb}
            #rnModal .rn-disparo-promo{border-color:#fde68a;border-left-color:#f59e0b;background:#fffbeb}
            #rnModal .rn-promo-tag{display:inline-flex;align-items:center;gap:4px;background:#fef3c7;color:#92400e;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:700;margin-left:4px}
            #rnModal .rn-decisao-acoes{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
            #rnModal .rn-decisao-acoes button{border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;
                display:inline-flex;align-items:center;gap:7px;transition:filter .15s,transform .1s}
            #rnModal .rn-decisao-acoes button:hover{filter:brightness(.95)}
            #rnModal .rn-decisao-acoes button:active{transform:scale(.97)}
            #rnModal .rn-decisao-acoes button:disabled{opacity:.55;cursor:default}
            #rnModal .rn-btn-aplicar{background:linear-gradient(180deg,#22c55e,#16a34a);color:#fff;box-shadow:0 2px 6px rgba(22,163,74,.3)}
            #rnModal .rn-btn-manter{background:#fff;color:#475569;border:1px solid #cbd5e1 !important}
            #rnModal .rn-btn-manter:hover{background:#f8fafc;border-color:#94a3b8 !important}
            #rnModal .mlb-ok{color:#166534}#rnModal .mlb-erro{color:#b91c1c}
            #rnModal .rn-vazio{text-align:center;color:#94a3b8;padding:24px}
            #wtRegrasNivelNotifBtn{position:relative}
            #wtRegrasNivelNotifBtn .rn-badge,#btnRegrasNivelToolbar .rn-badge{background:#f59e0b;color:#fff;border-radius:999px;font-size:10px;
                min-width:16px;height:16px;line-height:16px;text-align:center;padding:0 3px}
            #wtRegrasNivelNotifBtn .rn-badge{position:absolute;top:-4px;right:-4px}
            #btnRegrasNivelToolbar .rn-badge{margin-left:6px}
        `;
        document.head.appendChild(st);
    }

    // ---------- botão barra + sino ----------------------
    function garantirBotaoToolbar() {
        if (document.getElementById('btnRegrasNivelToolbar')) return;
        // O botão mora na aba "Precificação inteligente" (saiu da Gestão de Estoque).
        const barra = document.querySelector('#precificacaoInteligenteSystem .pi-acoes');
        if (!barra) return;
        garantirEstilo();
        const b = document.createElement('button');
        b.id = 'btnRegrasNivelToolbar';
        b.type = 'button';
        b.className = 'btn btn-warning';
        b.title = 'Regras de nível de estoque (escada de preços)';
        b.innerHTML = `<i class="fas fa-bolt"></i> Regras de nível <span class="rn-badge" style="display:none">0</span>`;
        b.addEventListener('click', () => abrirPainel('regras'));
        barra.insertBefore(b, barra.firstChild);
    }
    function garantirSino() {
        if (document.getElementById('wtRegrasNivelNotifBtn')) return document.getElementById('wtRegrasNivelNotifBtn');
        const ancora = document.getElementById('wtMenuSettingsBtn')
            || document.getElementById('wtUsuariosNotifBtn')
            || document.querySelector('#menuSystem .wt-top-actions');
        if (!ancora) return null;
        garantirEstilo();
        const btn = document.createElement('button');
        btn.id = 'wtRegrasNivelNotifBtn';
        btn.type = 'button';
        btn.className = 'wt-icon-button btn btn-sm btn-secondary';
        btn.title = 'Regras de nível de estoque';
        btn.style.display = 'none';
        btn.innerHTML = `<i class="fas fa-bolt"></i><span class="rn-badge" style="display:none">0</span>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); abrirPainel('disparos'); });
        if (ancora.parentElement) ancora.parentElement.insertBefore(btn, ancora);
        else ancora.appendChild(btn);
        return btn;
    }
    async function atualizarSino(forcar) {
        const btn = garantirSino();
        garantirBotaoToolbar();
        if (!btn || !ehAdmin()) { if (btn) btn.style.display = 'none'; return; }
        if (!forcar && Date.now() - ultimoSino < 30000) return;
        ultimoSino = Date.now();
        const cli = sb();
        if (!cli) return;
        let qtd = 0;
        try {
            const { count } = await cli.from('regras_nivel_disparos').select('id', { count: 'exact', head: true }).eq('visto', false);
            qtd = count || 0;
        } catch (e) { return; }
        [btn.querySelector('.rn-badge'), document.querySelector('#btnRegrasNivelToolbar .rn-badge')].forEach(bd => {
            if (!bd) return;
            if (qtd > 0) { bd.style.display = ''; bd.textContent = qtd > 99 ? '99+' : String(qtd); } else bd.style.display = 'none';
        });
        btn.style.display = qtd > 0 ? '' : 'none';
    }

    // ---------- MODAL -----------------------------------
    let abaAtual = 'regras';
    let escadaDraft = [];       // rascunho da escada em edição
    let overridesDraft = {};    // { [mlb]: { [nivel]: precoManual } } — ajustes manuais por anúncio
    let regraEditandoId = null; // != null -> painel está editando uma regra já salva
    let previewToken = null;

    function garantirOverlay() {
        let ov = document.getElementById('rnOverlay');
        if (ov) return ov;
        garantirEstilo();
        ov = document.createElement('div');
        ov.id = 'rnOverlay';
        ov.className = 'hidden';
        ov.innerHTML = `
            <div id="rnModal" role="dialog" aria-modal="true">
                <div class="rn-head">
                    <h3><i class="fas fa-bolt"></i> Regras de nível de estoque</h3>
                    <div class="rn-head-acoes">
                        <button type="button" id="rnBtnBackup" class="rn-btn-backup" title="Baixa um arquivo com todas as regras salvas e o estado dos disparos"><i class="fas fa-download"></i> Backup das regras</button>
                        <button type="button" id="rnBtnRestaurar" class="rn-btn-backup" title="Restaura regras a partir de um arquivo de backup"><i class="fas fa-upload"></i> Restaurar backup</button>
                        <input type="file" id="rnArquivoBackup" accept=".json,application/json" style="display:none;">
                        <button type="button" class="rn-fechar">&times;</button>
                    </div>
                </div>
                <div class="rn-tabs">
                    <button type="button" class="rn-tab" data-aba="regras">Regra nova</button>
                    <button type="button" class="rn-tab" data-aba="salvas">Regras salvas</button>
                    <button type="button" class="rn-tab" data-aba="disparos">Disparos</button>
                </div>
                <div class="rn-corpo"></div>
            </div>`;
        ov.addEventListener('click', e => { if (e.target === ov) fechar(); });
        ov.querySelector('.rn-fechar').addEventListener('click', fechar);
        ov.querySelector('#rnBtnBackup').addEventListener('click', fazerBackupRegras);
        const inputBackup = ov.querySelector('#rnArquivoBackup');
        ov.querySelector('#rnBtnRestaurar').addEventListener('click', () => inputBackup.click());
        inputBackup.addEventListener('change', () => {
            const arquivo = inputBackup.files && inputBackup.files[0];
            inputBackup.value = '';
            if (arquivo) restaurarBackupRegras(arquivo);
        });
        ov.querySelectorAll('.rn-tab').forEach(t => t.addEventListener('click', () => { abaAtual = t.dataset.aba; render(); }));
        document.body.appendChild(ov);
        return ov;
    }
    function fechar() { const ov = document.getElementById('rnOverlay'); if (ov) ov.classList.add('hidden'); }

    async function abrirPainel(aba) {
        if (!ehAdmin()) { toast('🔒 Só administradores.', 'warning'); return; }
        abaAtual = aba || 'regras';
        if (!regraEditandoId) { escadaDraft = []; overridesDraft = {}; previewToken = null; }
        garantirOverlay().classList.remove('hidden');
        const corpo = document.querySelector('#rnModal .rn-corpo');
        if (corpo) corpo.innerHTML = `<div class="rn-vazio">Carregando…</div>`;
        await carregarRegras();
        render();
    }
    function render() {
        const ov = document.getElementById('rnOverlay');
        if (!ov || ov.classList.contains('hidden')) return;
        ov.querySelectorAll('.rn-tab').forEach(t => t.classList.toggle('ativa', t.dataset.aba === abaAtual));
        const corpo = ov.querySelector('.rn-corpo');
        if (abaAtual === 'regras') renderRegras(corpo);
        else if (abaAtual === 'salvas') renderRegrasSalvas(corpo);
        else renderDisparos(corpo);
    }

    // ---- escada draft ----
    function montarEscadaDraft(gatilho, base) {
        base = base || [];
        const nova = [];
        for (let n = gatilho; n >= 1; n--) {
            const antiga = base.find(d => d.nivel === n);
            // padrão: primeiro degrau +5%, os demais 0% (sobe só no começo).
            nova.push(antiga ? { ...antiga, nivel: n }
                : { nivel: n, modo: 'pct', valor: nova.length === 0 ? 5 : 0 });
        }
        return nova;
    }
    // ao mexer na linha i, herda pras linhas abaixo
    function cascatearEscada(i) {
        const ref = escadaDraft[i];
        for (let k = i + 1; k < escadaDraft.length; k++) {
            escadaDraft[k].modo = ref.modo;
            escadaDraft[k].valor = ref.valor;
        }
    }

    function renderRegras(corpo) {
        const regraAtual = regraEditandoId ? regrasCache.find(x => x.id === regraEditandoId) : null;
        const escopo = regraAtual || lerFiltroAtual();
        const produtos = produtosDoEscopo(escopo);
        const temFiltro = temEscopo(escopo);
        if (!escadaDraft.length) escadaDraft = montarEscadaDraft(regraAtual ? (regraAtual.gatilho_qtd || 5) : 5, regraAtual ? regraAtual.escada : []);

        corpo.innerHTML = `
            <fieldset>
                <legend>${regraAtual ? 'Editar regra' : 'Nova regra'}</legend>
                ${regraAtual ? `
                    <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:13px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
                        <span>Editando <strong>${esc(regraAtual.nome || 'regra')}</strong> — o escopo é o que foi salvo na criação.</span>
                        <button type="button" class="rn-btn rn-btn-sec" id="rnCancelarEdicao" style="padding:4px 10px;font-size:12px;">Cancelar edição</button>
                    </div>` : ''}
                <label>Escopo ${regraAtual ? '(salvo nesta regra)' : '— vem do que está selecionado / filtrado na tabela agora'}</label>
                <div class="rn-escopo-box">
                    ${temFiltro
                        ? esc(descreverEscopoObj(escopo))
                        : '⚠️ Nada selecionado nem filtrado — a regra valeria para TODOS os produtos. Marque produtos ou aplique um filtro/busca.'}
                    <br><strong>${produtos.length}</strong> produto(s) no escopo.
                </div>

                <div style="margin-top:12px;">
                    <label>Estoque do gatilho (topo da escada)</label>
                    <input type="number" id="rnGatilho" min="1" max="60" value="${escadaDraft.length}" style="width:90px;">
                    <button type="button" class="rn-btn rn-btn-sec" id="rnGerar" style="margin-left:6px;">Gerar escada</button>
                </div>

                <table class="rn-escada" id="rnTabelaEscada"></table>

                <div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <button type="button" class="rn-btn rn-btn-sec" id="rnPuxarPrecos">Puxar preços atuais do ML</button>
                    <input type="text" id="rnNomeRegra" placeholder="Nome da regra (opcional)" value="${esc(regraAtual ? (regraAtual.nome || '') : '')}" style="flex:1;min-width:160px;">
                    <button type="button" class="rn-btn rn-btn-primary" id="rnCriar">${regraAtual ? 'Salvar alterações' : 'Criar regra'}</button>
                </div>
            </fieldset>

            <div id="rnPreview"></div>
        `;

        renderTabelaEscada(corpo);

        corpo.querySelector('#rnGerar').addEventListener('click', () => {
            const g = Math.max(1, Math.min(60, parseInt(corpo.querySelector('#rnGatilho').value, 10) || 5));
            escadaDraft = montarEscadaDraft(g, escadaDraft);
            renderTabelaEscada(corpo);
            renderPreview(corpo, produtos);
        });
        corpo.querySelector('#rnPuxarPrecos').addEventListener('click', () => renderPreview(corpo, produtos, true));
        corpo.querySelector('#rnCriar').addEventListener('click', () => salvarRegra(corpo, temFiltro, regraAtual));
        if (regraAtual) corpo.querySelector('#rnCancelarEdicao').addEventListener('click', cancelarEdicao);

        // delegação: edição manual do preço calculado, direto no preview
        const previewBox = corpo.querySelector('#rnPreview');
        previewBox.addEventListener('change', e => {
            if (!e.target.classList.contains('rn-override-input')) return;
            const tr = e.target.closest('tr');
            const mlb = tr.dataset.mlb, nivel = tr.dataset.nivel;
            overridesDraft[mlb] = overridesDraft[mlb] || {};
            overridesDraft[mlb][nivel] = e.target.value === '' ? '' : round2(e.target.value);
            renderPreview(corpo, produtos, false);
        });
        previewBox.addEventListener('click', e => {
            if (!e.target.classList.contains('rn-limpar-override')) return;
            const tr = e.target.closest('tr');
            const mlb = tr.dataset.mlb, nivel = tr.dataset.nivel;
            if (overridesDraft[mlb]) delete overridesDraft[mlb][nivel];
            renderPreview(corpo, produtos, false);
        });

        // escopo pequeno -> já puxa os preços do ML sozinho, sem precisar clicar
        renderPreview(corpo, produtos, produtos.length > 0 && produtos.length <= 15);
    }

    function cancelarEdicao() {
        regraEditandoId = null;
        escadaDraft = [];
        overridesDraft = {};
        render();
    }

    function renderTabelaEscada(corpo) {
        const t = corpo.querySelector('#rnTabelaEscada');
        if (!t) return;
        t.innerHTML = `
            <tr><th>Estoque</th><th>Degrau</th><th>Valor</th><th>Preço (ref.)</th></tr>
            ${escadaDraft.map((d, i) => `
                <tr data-i="${i}">
                    <td><strong>${d.nivel}</strong></td>
                    <td>
                        <select class="rn-modo">
                            <option value="pct" ${d.modo === 'pct' ? 'selected' : ''}>%</option>
                            <option value="soma" ${d.modo === 'soma' ? 'selected' : ''}>+ R$</option>
                            <option value="fixo" ${d.modo === 'fixo' ? 'selected' : ''}>= R$ (trava)</option>
                        </select>
                    </td>
                    <td><input type="number" step="0.01" class="rn-valor" value="${d.valor}"></td>
                    <td class="rn-preco" data-preco-nivel="${d.nivel}">—</td>
                </tr>`).join('')}
        `;
        t.querySelectorAll('tr[data-i]').forEach(tr => {
            const i = parseInt(tr.dataset.i, 10);
            const upd = () => {
                escadaDraft[i].modo = tr.querySelector('.rn-modo').value;
                escadaDraft[i].valor = Number(tr.querySelector('.rn-valor').value) || 0;
                cascatearEscada(i);
                renderTabelaEscada(corpo);
                atualizarPrecosRef(corpo);
            };
            tr.querySelector('.rn-modo').addEventListener('change', upd);
            tr.querySelector('.rn-valor').addEventListener('change', upd);
        });
        atualizarPrecosRef(corpo);
    }

    function precoRefBase(corpo) {
        // preço de referência = 1º MLB do 1º produto do escopo com preço conhecido, senão 100
        const box = corpo.querySelector('#rnPreview');
        const first = box && box.querySelector('[data-preco-atual]');
        if (first) return Number(first.getAttribute('data-preco-atual')) || 100;
        return 100;
    }
    function atualizarPrecosRef(corpo) {
        const base = precoRefBase(corpo);
        escadaDraft.forEach(d => {
            const cel = corpo.querySelector(`.rn-preco[data-preco-nivel="${d.nivel}"]`);
            if (cel) cel.textContent = fmtBRL(precoNoNivel(base, escadaDraft, d.nivel));
        });
    }

    async function renderPreview(corpo, produtos, puxar) {
        const box = corpo.querySelector('#rnPreview');
        if (!box) return;
        if (!produtos.length) { box.innerHTML = ''; return; }

        if (puxar && !previewToken) previewToken = await obterTokenML();
        const limite = 40;
        const abrirDeCara = produtos.length <= 15;
        const blocos = await Promise.all(produtos.slice(0, limite).map(async p => {
            const mlbs = mlbsDoProduto(p);
            const mlbBlocos = await Promise.all(mlbs.map(async mlb => {
                let preco = precoMLBCache[mlb] ? precoMLBCache[mlb].preco : null;
                if (preco == null && puxar && previewToken) preco = await precoAtualMLB(mlb, previewToken);
                return montarBlocoMlb(mlb, preco);
            }));
            const resumoMlb = mlbs.length
                ? ` · ${mlbs.length} MLB${mlbs.length > 1 ? 's' : ''}: ${esc(mlbs.join(', '))}`
                : ' · sem anúncio vinculado';
            return `<details class="rn-prod" ${abrirDeCara ? 'open' : ''}>
                <summary>${esc(p.sku || '')} · estoque ${p.quantidade} · ${esc(p.nome || '')}<span style="font-weight:400;color:#64748b;">${resumoMlb}</span></summary>
                <div class="rn-prod-body">${mlbs.length ? mlbBlocos.join('') : '<em style="font-size:12px;color:#94a3b8;">sem anúncios (mlb_codes)</em>'}</div>
            </details>`;
        }));
        box.innerHTML = `<h4 style="margin:10px 0 6px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                <span>Preview (${produtos.length} produto${produtos.length > 1 ? 's' : ''}${produtos.length > limite ? ' — mostrando os primeiros ' + limite : ''})</span>
                ${produtos.length > 1 ? `<span>
                    <button type="button" class="rn-btn rn-btn-sec" id="rnAbrirTudo" style="padding:4px 10px;font-size:12px;">Abrir todos</button>
                    <button type="button" class="rn-btn rn-btn-sec" id="rnFecharTudo" style="padding:4px 10px;font-size:12px;">Fechar todos</button>
                </span>` : ''}
            </h4>
            <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">Cada produto mostra o MLB e o preço atual + o preço calculado em cada nível. Edite o preço de qualquer nível pra ajustar manualmente — os níveis abaixo dele recalculam a partir do valor que você colocou.</div>`
            + blocos.join('');
        atualizarPrecosRef(corpo);

        const btnAbrir = box.querySelector('#rnAbrirTudo');
        const btnFechar = box.querySelector('#rnFecharTudo');
        if (btnAbrir) btnAbrir.addEventListener('click', () => box.querySelectorAll('details.rn-prod').forEach(d => { d.open = true; }));
        if (btnFechar) btnFechar.addEventListener('click', () => box.querySelectorAll('details.rn-prod').forEach(d => { d.open = false; }));
    }

    // um MLB = uma escada própria (mesmos degraus, preço-base diferente,
    // e pode ter ajustes manuais por nível salvos em overridesDraft[mlb])
    function montarBlocoMlb(mlb, precoAtual) {
        if (precoAtual == null) {
            return `<div class="rn-mlb">${esc(mlb)} — atual: ?</div>
                <div style="font-size:11px;color:#64748b;margin-bottom:10px;"><em>clique em "Puxar preços atuais do ML"</em></div>`;
        }
        const overMlb = overridesDraft[mlb] || {};
        const linhas = escadaDraft.map(d => {
            const val = precoNoNivel(precoAtual, escadaDraft, d.nivel, overMlb);
            const chaveNivel = String(d.nivel);
            const temOverride = overMlb[chaveNivel] != null && overMlb[chaveNivel] !== '';
            return `<tr data-mlb="${esc(mlb)}" data-nivel="${d.nivel}">
                <td>${d.nivel}</td>
                <td><input type="number" step="0.01" class="rn-override-input" value="${val}"
                    style="${temOverride ? 'border-color:#7c3aed;font-weight:700;color:#7c3aed;' : ''}"></td>
                <td>${temOverride ? '<button type="button" class="rn-limpar-override" title="Voltar ao calculado">✕</button>' : ''}</td>
            </tr>`;
        }).join('');
        return `<div class="rn-mlb" data-preco-atual="${precoAtual}">${esc(mlb)} — atual: ${fmtBRL(precoAtual)}</div>
            <table class="rn-escada" style="margin-bottom:12px;"><tr><th>Nível</th><th>Preço</th><th></th></tr>${linhas}</table>`;
    }

    // ---------- ABA "REGRAS SALVAS" — lista por PRODUTO ----------
    function renderRegrasSalvas(corpo) {
        const temOverridesMlb = (r, p) => {
            if (!r.overrides) return false;
            return mlbsDoProduto(p).some(mlb => r.overrides[mlb] && Object.keys(r.overrides[mlb]).length);
        };

        // Expande cada regra salva nos produtos reais que ela afeta —
        // o que o usuário pediu foi "lista de produtos", não de regras.
        const linhas = [];
        regrasCache.forEach(r => {
            produtosDoEscopo(r).forEach(p => linhas.push({ produto: p, regra: r }));
        });

        corpo.innerHTML = `
            <input type="text" id="rnBuscaSalvas" placeholder="🔍 Buscar por produto, SKU ou nome da regra..." style="width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px;box-sizing:border-box;">
            <div id="rnListaSalvas"></div>
        `;
        const listaEl = corpo.querySelector('#rnListaSalvas');

        function desenhar(filtro) {
            const termo = (filtro || '').trim().toLowerCase();
            const filtradas = !termo ? linhas : linhas.filter(l =>
                String(l.produto.nome || '').toLowerCase().includes(termo) ||
                String(l.produto.sku || '').toLowerCase().includes(termo) ||
                String(l.regra.nome || '').toLowerCase().includes(termo)
            );

            if (!filtradas.length) {
                listaEl.innerHTML = `<div class="rn-vazio">${linhas.length ? 'Nada encontrado.' : 'Nenhum produto com regra de estoque salva ainda.'}</div>`;
                return;
            }

            listaEl.innerHTML = filtradas.map((l, i) => {
                const p = l.produto, r = l.regra;
                return `
                <div class="rn-regra ${r.ativo ? '' : 'off'}" data-i="${i}" style="cursor:pointer;">
                    <h4 style="margin:0 0 4px;font-size:14px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
                        <span>${esc(p.nome || p.sku || 'Produto')}</span>
                        <span style="font-size:11px;font-weight:600;color:${r.ativo ? '#16a34a' : '#94a3b8'};">${r.ativo ? 'regra ativa' : 'pausada'}</span>
                    </h4>
                    <div style="font-size:12px;color:#64748b;">SKU: ${esc(p.sku || '—')} · Estoque atual: ${Number(p.quantidade) || 0} · Gatilho: ${r.gatilho_qtd}</div>
                    <div style="font-size:12px;color:#64748b;">Regra: ${esc(r.nome || 'Regra')}${temOverridesMlb(r, p) ? ' · <span style="color:#7c3aed;font-weight:600;">tem ajuste manual neste produto</span>' : ''}</div>
                    <div id="rnDetalheSalvas${i}" style="display:none;margin-top:8px;border-top:1px dashed #e2e8f0;padding-top:8px;"></div>
                </div>`;
            }).join('');

            listaEl.querySelectorAll('.rn-regra').forEach(el => {
                const i = el.dataset.i;
                el.addEventListener('click', (e) => {
                    if (e.target.closest('button')) return;
                    const det = el.querySelector('#rnDetalheSalvas' + i);
                    const jaAberto = det.style.display !== 'none';
                    listaEl.querySelectorAll('[id^="rnDetalheSalvas"]').forEach(d => { d.style.display = 'none'; });
                    if (jaAberto) return;
                    det.style.display = 'block';
                    const { produto: p, regra: r } = filtradas[i];
                    det.innerHTML = `
                        <div style="font-size:12px;color:#475569;">
                            <div><strong>Escopo da regra:</strong> ${esc(descreverEscopoObj(r))}</div>
                            <div><strong>Escada (do gatilho até 1):</strong> ${esc(descreverEscada(r.escada))}</div>
                        </div>
                        <div class="rn-acoes" style="margin-top:8px;">
                            <button data-a="editar">Ajustar preços</button>
                            <button data-a="toggle">${r.ativo ? 'Pausar' : 'Ativar'}</button>
                            <button data-a="rodar">Verificar agora</button>
                            <button data-a="excluir">Excluir</button>
                        </div>
                    `;
                    det.querySelectorAll('button[data-a]').forEach(b => b.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        if (b.dataset.a === 'toggle') toggleRegra(r.id);
                        else if (b.dataset.a === 'excluir') excluirRegra(r.id);
                        else if (b.dataset.a === 'editar') iniciarEdicao(r.id);
                        else { toast('Verificando…'); avaliarRegras({ forcar: true }).then(() => { toast('Pronto.', 'success'); render(); }); }
                    }));
                });
            });
        }

        desenhar('');
        corpo.querySelector('#rnBuscaSalvas').addEventListener('input', e => desenhar(e.target.value));
    }

    // ---- backup / restauração das regras ----
    async function fazerBackupRegras() {
        const cli = sb();
        if (!cli) return;
        try {
            const { data: regras, error } = await cli.from('regras_nivel_estoque').select('*').order('criado_em', { ascending: true });
            if (error) throw error;
            const { data: disparos, error: erroDisp } = await cli.from('regras_nivel_disparos').select('*');
            if (erroDisp) throw erroDisp;

            const agora = new Date();
            const backup = {
                tipo: 'wheeltech_regras_nivel_estoque',
                versao: 1,
                gerado_em: agora.toISOString(),
                gerado_por: (window.currentUser && (window.currentUser.name || window.currentUser.username)) || '',
                regras: regras || [],
                disparos: disparos || []
            };
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const pad = n => String(n).padStart(2, '0');
            a.href = url;
            a.download = `backup-regras-estoque-${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}-${pad(agora.getHours())}${pad(agora.getMinutes())}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            toast(`✅ Backup salvo: ${backup.regras.length} regra(s) e ${backup.disparos.length} estado(s) de disparo.`, 'success');
        } catch (e) {
            console.error('[regras-nivel] backup:', e);
            toast('Erro ao fazer backup: ' + (e.message || e), 'error');
        }
    }

    async function restaurarBackupRegras(arquivo) {
        const cli = sb();
        if (!cli) return;
        let backup;
        try {
            backup = JSON.parse(await arquivo.text());
        } catch (_) {
            toast('Arquivo inválido: não é um backup de regras.', 'error');
            return;
        }
        if (!backup || backup.tipo !== 'wheeltech_regras_nivel_estoque' || !Array.isArray(backup.regras)) {
            toast('Arquivo inválido: não é um backup de regras de estoque.', 'error');
            return;
        }

        const idsAtuais = new Set(regrasCache.map(r => String(r.id)));
        const novas = backup.regras.filter(r => !idsAtuais.has(String(r.id))).length;
        const existentes = backup.regras.length - novas;
        const quando = backup.gerado_em ? new Date(backup.gerado_em).toLocaleString('pt-BR') : 'data desconhecida';
        if (!confirm(
            `Restaurar backup de ${quando}?

` +
            `• ${novas} regra(s) que não existem mais serão recriadas
` +
            `• ${existentes} regra(s) existente(s) voltarão ao estado do backup

` +
            'Regras criadas depois do backup NÃO serão apagadas.'
        )) return;

        try {
            if (backup.regras.length) {
                const { error } = await cli.from('regras_nivel_estoque').upsert(backup.regras, { onConflict: 'id' });
                if (error) throw error;
            }
            const idsRegras = new Set(backup.regras.map(r => String(r.id)));
            const disparos = (backup.disparos || []).filter(d => idsRegras.has(String(d.regra_id)));
            if (disparos.length) {
                const { error } = await cli.from('regras_nivel_disparos').upsert(disparos, { onConflict: 'id' });
                if (error) throw error;
            }
            toast(`✅ Backup restaurado: ${backup.regras.length} regra(s).`, 'success');
            await carregarRegras();
            render();
            atualizarSino(true);
        } catch (e) {
            console.error('[regras-nivel] restaurar:', e);
            toast('Erro ao restaurar: ' + (e.message || e), 'error');
        }
    }

    function iniciarEdicao(id) {
        const r = regrasCache.find(x => x.id === id);
        if (!r) return;
        regraEditandoId = id;
        escadaDraft = (r.escada || []).map(d => ({ ...d }));
        overridesDraft = JSON.parse(JSON.stringify(r.overrides || {}));
        previewToken = null;
        // "Ajustar preços" pode ser clicado de dentro de "Regras salvas" —
        // o formulário de edição mora na aba "Regra nova".
        abaAtual = 'regras';
        const ov = document.getElementById('rnOverlay');
        if (ov) ov.querySelectorAll('.rn-tab').forEach(t => t.classList.toggle('ativa', t.dataset.aba === abaAtual));
        render();
        const corpo = document.querySelector('#rnModal .rn-corpo');
        if (corpo) corpo.scrollTop = 0;
    }

    async function salvarRegra(corpo, temFiltro, regraExistente) {
        const cli = sb();
        if (!cli) { toast('Sem conexão.', 'error'); return; }
        if (!escadaDraft.length) { toast('Monte a escada primeiro.', 'warning'); return; }
        const gatilho = escadaDraft[0].nivel;
        const escadaFinal = escadaDraft.map(d => ({ nivel: d.nivel, modo: d.modo, valor: Number(d.valor) || 0 }));
        const overridesFinal = limparOverrides(overridesDraft);
        const nomeInformado = (corpo.querySelector('#rnNomeRegra').value || '').trim();

        // ---- editando uma regra que já existe ----
        if (regraExistente) {
            const updatePayload = {
                gatilho_qtd: gatilho,
                escada: escadaFinal,
                overrides: overridesFinal,
                nome: nomeInformado || regraExistente.nome,
                atualizado_em: new Date().toISOString()
            };

            // Regra antiga (de antes desta correção) sem referência de
            // preço salva ainda — aproveita este salvamento pra
            // capturar a referência agora, uma única vez. Regra que já
            // tem referência salva NÃO é re-capturada aqui, só na
            // criação — editar degraus não deve mudar a base.
            if (!regraExistente.precos_base || !Object.keys(regraExistente.precos_base).length) {
                if (!previewToken) previewToken = await obterTokenML();
                if (previewToken) {
                    updatePayload.precos_base = await capturarPrecosBaseEscopo(produtosDoEscopo(regraExistente), previewToken);
                }
            }

            const { error } = await cli.from('regras_nivel_estoque').update(updatePayload).eq('id', regraExistente.id);
            if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return; }
            toast('✅ Regra atualizada. Verificando os produtos…', 'success');
            regraEditandoId = null;
            escadaDraft = []; overridesDraft = {};
            await carregarRegras();
            render();
            avaliarRegras({ forcar: true }).then(() => render());
            return;
        }

        // ---- criando uma regra nova ----
        const escopo = lerFiltroAtual();
        if (!temEscopo(escopo) && !confirm('Nada selecionado nem filtrado — a regra vai valer para TODOS os produtos. Continuar?')) return;

        const nome = nomeInformado || `${descreverEscopoObj(escopo)} · gatilho ${gatilho}`.slice(0, 90);

        const produtosEscopo = produtosDoEscopo(escopo);
        const jaNoGatilho = produtosEscopo.filter(p => (Number(p.quantidade) || 0) <= gatilho);
        if (jaNoGatilho.length && !confirm(
            `${jaNoGatilho.length} produto(s) já estão com estoque ≤ ${gatilho}.\nAo criar a regra, os preços dos anúncios deles vão ser alterados AGORA. Confirmar?`)) return;

        // Referência de preço fixada AGORA, no momento de criar a
        // regra — os disparos futuros (mesmo dias/semanas depois,
        // quando o estoque realmente cruzar o nível) sempre partem
        // deste valor salvo, não do preço que o anúncio tiver no
        // instante do disparo.
        if (!previewToken) previewToken = await obterTokenML();
        const precosBase = previewToken ? await capturarPrecosBaseEscopo(produtosEscopo, previewToken) : {};

        const { error } = await cli.from('regras_nivel_estoque').insert([{
            nome, ativo: true,
            escopo_categoria: escopo.categoria,
            escopo_termo: escopo.termo,
            escopo_produto_ids: escopo.produto_ids,
            escopo_custo_op: escopo.custo_op, escopo_custo_valor: escopo.custo_valor,
            escopo_qtd_op: escopo.qtd_op, escopo_qtd_valor: escopo.qtd_valor,
            gatilho_qtd: gatilho,
            escada: escadaFinal,
            overrides: overridesFinal,
            precos_base: precosBase,
            criado_por: (window.currentUser && window.currentUser.name) || 'admin'
        }]);
        if (error) { toast('Erro ao criar: ' + error.message, 'error'); return; }
        toast('✅ Regra criada. Verificando os produtos…', 'success');
        escadaDraft = []; overridesDraft = {};
        await carregarRegras();
        render();
        avaliarRegras({ forcar: true }).then(() => render());
    }

    async function toggleRegra(id) {
        const r = regrasCache.find(x => x.id === id);
        if (!r) return;
        await sb().from('regras_nivel_estoque').update({ ativo: !r.ativo, atualizado_em: new Date().toISOString() }).eq('id', id);
        await carregarRegras();
        render();
        if (!r.ativo) avaliarRegras({ forcar: true });
    }
    async function excluirRegra(id) {
        if (!confirm('Excluir esta regra? O histórico de disparos dela também some.')) return;
        await sb().from('regras_nivel_estoque').delete().eq('id', id);
        await carregarRegras();
        render();
        atualizarSino(true);
    }

    function montarBotoesDecisaoRN(atributo, id) {
        return `
            <div class="rn-decisao-acoes">
                <button type="button" class="rn-btn-aplicar" data-${atributo}-id="${id}" data-${atributo}-a="aplicar">
                    <i class="fas fa-check"></i> Aplicar preço recomendado
                </button>
                <button type="button" class="rn-btn-manter" data-${atributo}-id="${id}" data-${atributo}-a="ignorar">
                    <i class="fas fa-lock"></i> Manter preço atual
                </button>
            </div>
        `;
    }

    async function renderDisparos(corpo) {
        const cli = sb();
        corpo.innerHTML = `<div class="rn-vazio">Carregando…</div>`;
        const { data, error } = await cli.from('regras_nivel_disparos').select('*').order('atualizado_em', { ascending: false }).limit(200);
        if (error) { corpo.innerHTML = `<div class="rn-vazio">Erro ao carregar.</div>`; return; }
        const lista = data || [];
        if (!lista.length) { corpo.innerHTML = `<div class="rn-vazio">Nenhum produto entrou em regra ainda.</div>`; return; }
        const temNaoVisto = lista.some(d => !d.visto);
        const pendentes = lista.filter(d => d.reset_pendente);
        const promoPendentes = lista.filter(d => d.promocao_pendente);
        const normais = lista.filter(d => !d.reset_pendente && !d.promocao_pendente);
        corpo.innerHTML = `
            ${promoPendentes.length ? `
                <h4 style="margin:0 0 10px;color:#92400e;">🏷️ Anúncio em promoção — decida o preço (${promoPendentes.length})</h4>
                ${promoPendentes.map(d => {
                    const precos = d.promocao_precos || {};
                    const info = d.promocao_info || {};
                    const voltaAoOriginal = d.promocao_nivel_recomendado == null;
                    return `<div class="rn-disparo rn-disparo-promo" data-promo-id-box="${d.id}">
                        <strong>${esc(d.produto_nome || d.produto_sku || d.produto_id)}</strong>
                        — a regra pediria ${voltaAoOriginal ? 'voltar ao preço original' : 'mudar pro nível ' + d.promocao_nivel_recomendado}, mas tem anúncio em promoção agora
                        <div style="font-size:11px;color:#92400e;">${d.promocao_detectado_em ? new Date(d.promocao_detectado_em).toLocaleString('pt-BR') : ''}</div>
                        <div style="margin-top:6px;">
                            ${Object.keys(precos).map(mlb => {
                                const p = info[mlb];
                                return `<div style="margin-bottom:3px;">
                                    <code>${esc(mlb)}</code>: preço recomendado ${fmtBRL(precos[mlb])}
                                    ${p ? `<span class="rn-promo-tag" title="${esc(p.tipo)}"><i class="fas fa-tag"></i> ${esc(p.nome)} — atual ${fmtBRL(p.preco)}</span>` : ''}
                                </div>`;
                            }).join('') || '<div style="font-size:12px;color:#94a3b8;">produto sem anúncios</div>'}
                        </div>
                        ${montarBotoesDecisaoRN('promo', d.id)}
                    </div>`;
                }).join('')}
            ` : ''}
            ${pendentes.length ? `
                <h4 style="margin:0 0 10px;color:#7c3aed;">📦 Estoque reposto — reveja o preço (${pendentes.length})</h4>
                ${pendentes.map(d => {
                    const precos = d.reset_precos || {};
                    const voltaAoOriginal = d.reset_nivel_recomendado == null;
                    return `<div class="rn-disparo" style="border-color:#c4b5fd;background:#f5f3ff;">
                        <strong>${esc(d.produto_nome || d.produto_sku || d.produto_id)}</strong>
                        — estoque agora: ${d.reset_estoque_novo}${voltaAoOriginal ? ' (fora da faixa de gatilho)' : ' · novo nível: ' + d.reset_nivel_recomendado}
                        <div style="font-size:11px;color:#7c3aed;">${d.reset_detectado_em ? new Date(d.reset_detectado_em).toLocaleString('pt-BR') : ''}</div>
                        <div style="margin-top:5px;">
                            ${Object.keys(precos).map(mlb => `<div>${esc(mlb)}: sugestão ${fmtBRL(precos[mlb])}${voltaAoOriginal ? ' (preço original)' : ''}</div>`).join('') || '<div style="font-size:12px;color:#94a3b8;">produto sem anúncios</div>'}
                        </div>
                        ${montarBotoesDecisaoRN('reset', d.id)}
                    </div>`;
                }).join('')}
                <h4 style="margin:16px 0 10px;">Histórico</h4>
            ` : ''}
            ${temNaoVisto ? `<button type="button" class="rn-btn rn-btn-sec" id="rnMarcarVistos" style="margin-bottom:12px;">Marcar todos como vistos</button>` : ''}
            ${!normais.length ? '<div class="rn-vazio">Nenhum produto entrou em regra ainda.</div>' : normais.map(d => {
                const mlbs = Array.isArray(d.mlbs) ? d.mlbs : [];
                return `<div class="rn-disparo ${d.visto ? '' : 'novo'}">
                    <strong>${esc(d.produto_nome || d.produto_sku || d.produto_id)}</strong>
                    — estoque ${d.estoque_no_disparo}, nível ${d.nivel_atual}
                    <div style="font-size:11px;color:#94a3b8;">${d.atualizado_em ? new Date(d.atualizado_em).toLocaleString('pt-BR') : ''}</div>
                    ${mlbs.length ? '<div style="margin-top:5px;">' + mlbs.map(m =>
                        `<div class="${m.ok ? 'mlb-ok' : 'mlb-erro'}">${esc(m.mlb)}: ${m.ok
                            ? (m.preco_antigo != null ? fmtBRL(m.preco_antigo) + ' → ' + fmtBRL(m.preco_novo) : fmtBRL(m.preco_novo || 0)) + (m.nota ? ' (' + esc(m.nota) + ')' : '')
                            : 'falhou — ' + esc(m.erro || '')}</div>`).join('') + '</div>'
                        : '<div style="font-size:12px;color:#94a3b8;margin-top:4px;">produto sem anúncios</div>'}
                </div>`;
            }).join('')}`;
        const btn = corpo.querySelector('#rnMarcarVistos');
        if (btn) btn.addEventListener('click', async () => {
            await cli.from('regras_nivel_disparos').update({ visto: true }).eq('visto', false);
            atualizarSino(true);
            renderDisparos(corpo);
        });
        corpo.querySelectorAll('button[data-reset-a]').forEach(b => b.addEventListener('click', async () => {
            corpo.querySelectorAll('button[data-reset-a],button[data-promo-a]').forEach(x => x.disabled = true);
            if (b.dataset.resetA === 'aplicar') await aplicarResetProduto(b.dataset.resetId);
            else await ignorarResetProduto(b.dataset.resetId);
            renderDisparos(corpo);
        }));
        corpo.querySelectorAll('button[data-promo-a]').forEach(b => b.addEventListener('click', async () => {
            corpo.querySelectorAll('button[data-reset-a],button[data-promo-a]').forEach(x => x.disabled = true);
            if (b.dataset.promoA === 'aplicar') await aplicarPromocaoPendenteProduto(b.dataset.promoId);
            else await ignorarPromocaoPendenteProduto(b.dataset.promoId);
            renderDisparos(corpo);
        }));
    }

    // ---------- RESET DE PREÇO POR REPOSIÇÃO DE ESTOQUE ----------
    async function aplicarResetProduto(id) {
        const cli = sb();
        if (!cli) return;
        const { data: estado } = await cli.from('regras_nivel_disparos').select('*').eq('id', id).maybeSingle();
        if (!estado || !estado.reset_pendente) { toast('Nada pendente pra esse produto.', 'info'); return; }

        const token = await obterTokenML();
        const recomendado = estado.reset_precos || {};

        // antes de mudar o preço, confere se algum desses mlbs está em
        // promoção ativa agora — se estiver, avisa e deixa o usuário decidir.
        const emPromocao = await obterPromocoesAtivasVarios(Object.keys(recomendado), token);
        if (Object.keys(emPromocao).length) {
            const detalhe = Object.keys(emPromocao).map(mlb =>
                `• ${mlb} — em promoção "${emPromocao[mlb].nome}", preço atual ${fmtBRL(emPromocao[mlb].preco)} (recomendado: ${fmtBRL(recomendado[mlb])})`
            ).join('\n');
            const seguir = confirm(
                `${Object.keys(emPromocao).length} anúncio(s) deste produto está(ão) em promoção ativa agora:\n\n${detalhe}\n\n` +
                `Aplicar o preço recomendado mesmo assim?\n\n(Cancelar = mantém o preço/promoção como está.)`
            );
            if (!seguir) { toast('Ok, mantido o preço da promoção.', 'info'); return; }
        }

        const log = [];
        for (const mlb of Object.keys(recomendado)) {
            const alvo = round2(recomendado[mlb]);
            const res = token ? await aplicarPreco(mlb, alvo, token) : { ok: false, erro: 'sem token ML' };
            log.push({
                mlb, preco_novo: alvo, ok: res.ok, erro: res.erro || null,
                nota: estado.reset_nivel_recomendado == null ? 'voltou ao original (estoque reposto)' : 'reajustado pela reposição de estoque'
            });
        }

        if (estado.reset_nivel_recomendado == null) {
            // saiu de vez da faixa de gatilho — não precisa mais do registro
            await cli.from('regras_nivel_disparos').delete().eq('id', id);
        } else {
            await cli.from('regras_nivel_disparos').update({
                nivel_atual: estado.reset_nivel_recomendado,
                estoque_no_disparo: estado.reset_estoque_novo,
                mlbs: log,
                reset_pendente: false,
                reset_precos: null,
                reset_nivel_recomendado: null,
                reset_estoque_novo: null,
                reset_detectado_em: null,
                atualizado_em: new Date().toISOString()
            }).eq('id', id);
        }
        toast('✅ Preço atualizado conforme o novo estoque.', 'success');
    }

    async function ignorarResetProduto(id) {
        const cli = sb();
        if (!cli) return;
        const { data: estado } = await cli.from('regras_nivel_disparos').select('*').eq('id', id).maybeSingle();
        if (!estado) return;
        // Mantém o preço atual, mas atualiza a base de comparação pro
        // estoque de agora — senão o aviso voltaria sozinho no próximo
        // ciclo mesmo sem o estoque ter mudado de novo.
        await cli.from('regras_nivel_disparos').update({
            estoque_no_disparo: estado.reset_estoque_novo != null ? estado.reset_estoque_novo : estado.estoque_no_disparo,
            reset_pendente: false,
            reset_precos: null,
            reset_nivel_recomendado: null,
            reset_estoque_novo: null,
            reset_detectado_em: null
        }).eq('id', id);
        toast('Ok, preço mantido como está.', 'info');
    }

    async function aplicarPromocaoPendenteProduto(id) {
        const cli = sb();
        if (!cli) return;
        const { data: estado } = await cli.from('regras_nivel_disparos').select('*').eq('id', id).maybeSingle();
        if (!estado || !estado.promocao_pendente) { toast('Nada pendente pra esse produto.', 'info'); return; }

        const token = await obterTokenML();
        const recomendado = estado.promocao_precos || {};
        const log = [];
        for (const mlb of Object.keys(recomendado)) {
            const alvo = round2(recomendado[mlb]);
            const res = token ? await aplicarPreco(mlb, alvo, token) : { ok: false, erro: 'sem token ML' };
            log.push({
                mlb, preco_novo: alvo, ok: res.ok, erro: res.erro || null,
                nota: estado.promocao_nivel_recomendado == null ? 'voltou ao original (aplicado mesmo com promoção ativa)' : 'aplicado mesmo com promoção ativa'
            });
        }

        if (estado.promocao_nivel_recomendado == null) {
            await cli.from('regras_nivel_disparos').delete().eq('id', id);
        } else {
            await cli.from('regras_nivel_disparos').update({
                nivel_atual: estado.promocao_nivel_recomendado,
                mlbs: log,
                promocao_pendente: false,
                promocao_precos: null,
                promocao_nivel_recomendado: null,
                promocao_info: null,
                promocao_detectado_em: null,
                atualizado_em: new Date().toISOString()
            }).eq('id', id);
        }
        toast('✅ Preço aplicado mesmo com a promoção ativa.', 'success');
    }

    async function ignorarPromocaoPendenteProduto(id) {
        const cli = sb();
        if (!cli) return;
        const { data: estado } = await cli.from('regras_nivel_disparos').select('*').eq('id', id).maybeSingle();
        if (!estado) return;

        if (estado.promocao_nivel_recomendado == null) {
            // saiu de vez da faixa de gatilho — não precisa mais do registro
            await cli.from('regras_nivel_disparos').delete().eq('id', id);
        } else {
            // Considera esse nível como já resolvido (sem mudar o preço de
            // verdade) — assim a regra não fica perguntando de novo a cada
            // ciclo pro MESMO alvo. Se o estoque mudar de novo, reavalia normal.
            await cli.from('regras_nivel_disparos').update({
                nivel_atual: estado.promocao_nivel_recomendado,
                promocao_pendente: false,
                promocao_precos: null,
                promocao_nivel_recomendado: null,
                promocao_info: null,
                promocao_detectado_em: null,
                atualizado_em: new Date().toISOString()
            }).eq('id', id);
        }
        toast('Ok, mantido o preço da promoção — não vamos perguntar de novo pra este mesmo nível.', 'info');
    }

    // ---------- hooks ----------------------------------
    function instalarHooks() {
        if (!window.__rnMovPatched && typeof window.registrarMovimentacao === 'function') {
            window.__rnMovPatched = true;
            const _mov = window.registrarMovimentacao;
            window.registrarMovimentacao = async function (produtoId, tipo) {
                const r = await _mov.apply(this, arguments);
                // 'entrada' agora também dispara — o motor só sinaliza
                // reset pendente nesse caso, nunca muda o preço sozinho.
                if (tipo && ehAdmin()) setTimeout(() => avaliarRegras({ forcar: true }), 1500);
                return r;
            };
        }
    }

    function start() {
        garantirEstilo();
        setInterval(() => {
            instalarHooks();
            if (!window.currentUser || !ehAdmin()) return;
            garantirSino();
            atualizarSino();
            // roda em QUALQUER tela — o alerta tem que funcionar mesmo
            // que a pessoa esteja só na tela inicial (o throttle interno
            // de 45s evita ficar batendo no banco/ML toda hora).
            avaliarRegras();
            const sistema = document.getElementById('precificacaoInteligenteSystem');
            if (sistema && !sistema.classList.contains('hidden')) garantirBotaoToolbar();
        }, 3000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();

    window.RegrasNivelEstoque = {
        abrir: abrirPainel, avaliar: avaliarRegras, ehAdmin,
        regras: () => regrasCache,
        carregar: async () => { const r = await carregarRegras(); window.dispatchEvent(new Event('wt-regras-nivel-atualizadas')); return r; },
        produtoNoEscopo
    };
    window.abrirRegrasNivelEstoque = () => abrirPainel('regras');
})();
