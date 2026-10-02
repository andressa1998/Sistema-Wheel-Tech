/* ============================================================
   WHEEL TECH · Escada automática de preços (por classificação)
   ------------------------------------------------------------
   Cada produto tem uma classificação de reposição:
     - Fácil   : escada a partir de 5 un.
                 5–3 un. → +5% (até 8%) · 2–1 un. → +10% (até 16%)
     - Médio   : escada a partir de 10 un. (PADRÃO de todos)
                 10–3 un. → +5% (até 8%) · 2–1 un. → +10% (até 16%)
     - Difícil : escada a partir de 20 un.
                 20–10 → +5% (até 8%) · 9–3 → +10% (até 16%) · 2–1 → +20% (até 30%)
   Cada degrau aplica o % mínimo e arredonda para cima até terminar em
   ,9,48 (ex.: 630,00 → 639,48). Se o arredondamento passar do teto
   da faixa, fica só o % mínimo (ex.: 34,22 → 35,93).

   A classificação é escolhida por FORNECEDOR ou por CATEGORIA; vale a
   seleção mais recente entre as que pegam o produto.

   Motor (roda no navegador dos administradores, igual às regras de
   nível):
     - SAÍDA de estoque que chega num degrau: aumenta o preço sozinho
       e avisa (dá para dar OK, desfazer ou alterar).
       Não mexe sozinho em: anúncio com mais de 1 variação, MLB ligado a
       mais de um produto, anúncio em promoção ou cupom — só avisa.
     - Produto que já estava dentro da escada quando isto entrou no ar
       só começa a contar a partir da próxima saída.
     - REPOSIÇÃO de estoque (volta degraus) e DIAS SEM VENDER
       (fácil 10, médio 15, difícil 30 dias) só RECOMENDAM baixar o
       preço — o usuário decide.
     - Produto com regra de nível manual fica fora (a regra manual vence).

   Tabelas: escada_auto_config, escada_auto_classificacao,
   escada_auto_estado, escada_auto_avisos, anuncios_em_cupom
   (rodar escada_automatica.sql).
   ============================================================ */
(function () {
    'use strict';

    const USUARIOS_ESCADA = ['andressamiotto', 'ronald'];
    const ML_BASE = 'https://api.mercadolibre.com';
    const DIA_MS = 86400000;

    const CLASSES = {
        facil: {
            nome: 'Fácil', cor: '#16a34a', topo: 5, diasSemVenda: 10,
            faixas: [{ de: 5, ate: 3, min: 5, max: 8 }, { de: 2, ate: 1, min: 10, max: 16 }]
        },
        medio: {
            nome: 'Médio', cor: '#d97706', topo: 10, diasSemVenda: 15,
            faixas: [{ de: 10, ate: 3, min: 5, max: 8 }, { de: 2, ate: 1, min: 10, max: 16 }]
        },
        dificil: {
            nome: 'Difícil', cor: '#dc2626', topo: 20, diasSemVenda: 30,
            faixas: [{ de: 20, ate: 10, min: 5, max: 8 }, { de: 9, ate: 3, min: 10, max: 16 }, { de: 2, ate: 1, min: 20, max: 30 }]
        }
    };
    const CLASSE_PADRAO = 'medio';

    let config = { ligado: false };
    let classificacoes = [];          // linhas de escada_auto_classificacao
    let estadosPorProduto = {};       // produto_id -> linha de escada_auto_estado
    let cupons = [];                  // linhas de anuncios_em_cupom
    let cuponsQuando = 0;
    let avisosPendentes = [];
    let dadosCarregados = false;
    let avaliando = false;
    let ultimaAvaliacao = 0;
    let tabelasFaltando = false;

    // ---------- helpers ------------------------------------
    function ehAdmin() {
        const u = (window.currentUser && window.currentUser.username || '').toLowerCase();
        return !!u && USUARIOS_ESCADA.includes(u);
    }
    function nomeUsuario() {
        return (window.currentUser && (window.currentUser.name || window.currentUser.username)) || '';
    }
    function sb() { return window.supabaseClient || null; }
    function toast(m, t) { if (window.showToast) window.showToast(m, t || 'info'); else console.log('[escada-auto]', m); }
    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function brl(v) {
        return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }
    function mlbsDoProduto(p) {
        let m = p.mlb_codes || (p.dados_extra && p.dados_extra.mlb_codes) || [];
        if (typeof m === 'string') m = m.split(',').map(s => s.trim()).filter(Boolean);
        return Array.isArray(m) ? m.filter(Boolean).map(s => String(s).trim().toUpperCase()) : [];
    }
    function produtoInativo(p) {
        return p.inativo === true || (p.dados_extra && p.dados_extra.inativo === true);
    }
    function normCategoria(c) { return String(c || '').trim().toUpperCase(); }
    function hojeISO() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function erroTabelaFaltando(error) {
        const m = String(error && (error.message || error.code) || '');
        return /escada_auto|anuncios_em_cupom|does not exist|42P01|PGRST205/i.test(m);
    }

    // ---------- cálculo da escada --------------------------
    function faixaDoNivel(classe, nivel) {
        const cfg = CLASSES[classe] || CLASSES[CLASSE_PADRAO];
        return cfg.faixas.find(f => nivel <= f.de && nivel >= f.ate) || null;
    }
    // menor valor >= x que termina em 9,48 (…9,48)
    function terminarEm948(x) {
        const k = Math.ceil((x - 9.48) / 10 - 1e-9);
        return round2(k * 10 + 9.48);
    }
    function precoComDegrau(preco, faixa) {
        const base = Number(preco) || 0;
        if (base <= 0 || !faixa) return round2(base);
        const minimo = base * (1 + faixa.min / 100);
        const ajustado = terminarEm948(minimo);
        return (ajustado - base) / base <= faixa.max / 100 + 1e-9 ? ajustado : round2(minimo);
    }
    // aplica, em sequência, os degraus (faixas salvas na entrada)
    function precoComDegraus(preco, niveis, faixas) {
        let p = Number(preco) || 0;
        niveis.slice().sort((a, b) => b - a).forEach(n => { p = precoComDegrau(p, faixas[String(n)]); });
        return round2(p);
    }

    // ---------- token / ML --------------------------------
    async function obterTokenML() {
        let token = null;
        try { token = localStorage.getItem('ml_access_token'); } catch (e) { /* sem storage */ }
        if (!token && typeof window.getValidToken === 'function') {
            try { const d = await window.getValidToken(); token = d && d.access_token; } catch (e) { /* sem token */ }
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
    async function lerItemML(mlb, token) {
        return mlGET(`${ML_BASE}/items/${mlb}?attributes=id,price,variations,status`, token);
    }
    async function aplicarPreco(mlb, novoPreco, token) {
        try {
            if (!token) return { ok: false, erro: 'sem token ML' };
            if (!(novoPreco > 0)) return { ok: false, erro: 'preço inválido' };
            const item = await lerItemML(mlb, token);
            const variacoes = Array.isArray(item.variations) ? item.variations : [];
            const body = variacoes.length
                ? { variations: variacoes.map(v => ({ id: v.id, price: novoPreco })) }
                : { price: novoPreco };
            return await mlPUT(`${ML_BASE}/items/${mlb}`, token, body);
        } catch (e) { return { ok: false, erro: String(e.message || e) }; }
    }

    // ---------- cupons (lista manual) ---------------------
    async function carregarCupons(forcar) {
        const cli = sb();
        if (!cli) return cupons;
        if (!forcar && Date.now() - cuponsQuando < 2 * 60000) return cupons;
        const { data, error } = await cli.from('anuncios_em_cupom').select('*').order('criado_em', { ascending: false });
        if (error) { if (erroTabelaFaltando(error)) tabelasFaltando = true; return cupons; }
        cupons = data || [];
        cuponsQuando = Date.now();
        return cupons;
    }
    function cupomValido(c) { return !c.valido_ate || String(c.valido_ate) >= hojeISO(); }
    // A API do ML não informa cupom de vendedor: vale a lista manual.
    async function cupomDoMLB(mlb) {
        await carregarCupons(false);
        const alvo = String(mlb || '').trim().toUpperCase();
        const c = cupons.find(x => cupomValido(x) && (x.mlb === '*' || String(x.mlb).trim().toUpperCase() === alvo));
        if (!c) return null;
        return { nome: 'Cupom' + (c.descricao ? ': ' + c.descricao : ' do vendedor'), tipo: 'CUPOM', mlb: c.mlb };
    }
    async function promocaoOuCupom(mlb, token) {
        const cupom = await cupomDoMLB(mlb);
        if (cupom) return cupom;
        const r = window.RegrasNivelEstoque;
        if (r && typeof r.promocaoAtiva === 'function') {
            try { return await r.promocaoAtiva(mlb, token); } catch (e) { return null; }
        }
        return null;
    }

    // ---------- dados ------------------------------------
    async function buscarTudo(tabela, colunas, ordem) {
        const cli = sb();
        const todos = [];
        for (let inicio = 0; ; inicio += 1000) {
            const { data, error } = await cli.from(tabela).select(colunas)
                .order(ordem, { ascending: true }).range(inicio, inicio + 999);
            if (error) throw error;
            todos.push(...(data || []));
            if (!data || data.length < 1000) break;
        }
        return todos;
    }
    // Lista leve e sempre atual (o estoque da tela pode estar velho).
    async function carregarProdutosMotor() {
        return buscarTudo('produtos_estoque',
            'id, sku, nome, categoria, quantidade, ultimo_custo, custo_medio, ' +
            'mlb_codes:dados_extra->mlb_codes, inativo:dados_extra->inativo, ' +
            'fornecedor_nome:dados_extra->>fornecedor_nome, cd_fornecedor:dados_extra->>cd_fornecedor', 'id');
    }
    async function carregarDados() {
        const cli = sb();
        if (!cli) return false;
        try {
            const [cfg, cls, est, avs] = await Promise.all([
                cli.from('escada_auto_config').select('*').eq('id', 1).maybeSingle(),
                cli.from('escada_auto_classificacao').select('*'),
                buscarTudo('escada_auto_estado', '*', 'produto_id'),
                cli.from('escada_auto_avisos').select('*').eq('status', 'pendente').order('criado_em', { ascending: false }).limit(500)
            ]);
            for (const r of [cfg, cls, avs]) if (r.error) throw r.error;
            config = cfg.data || { ligado: false };
            classificacoes = cls.data || [];
            estadosPorProduto = {};
            est.forEach(e => { estadosPorProduto[String(e.produto_id)] = e; });
            avisosPendentes = avs.data || [];
            await carregarCupons(true);
            tabelasFaltando = false;
            dadosCarregados = true;
            return true;
        } catch (e) {
            if (erroTabelaFaltando(e)) tabelasFaltando = true;
            console.warn('[escada-auto] carregar:', e.message || e);
            return false;
        }
    }

    // ---------- classificação ----------------------------
    function chavesFornecedorDoProduto(p) {
        const c = window.WTEstoqueColunas;
        if (!c || typeof c.fornecedoresDoProduto !== 'function') return [];
        return (c.fornecedoresDoProduto(p) || []).map(f => f.chave);
    }
    // Última seleção que pega o produto (fornecedor ou categoria); senão Médio.
    function regraDeClassificacao(p) {
        const cat = normCategoria(p.categoria);
        const forns = chavesFornecedorDoProduto(p);
        let melhor = null;
        classificacoes.forEach(c => {
            const pega = (c.tipo === 'categoria' && c.chave === cat) ||
                (c.tipo === 'fornecedor' && forns.includes(c.chave));
            if (!pega) return;
            if (!melhor || new Date(c.definido_em) > new Date(melhor.definido_em)) melhor = c;
        });
        return melhor;
    }
    function classificacaoDoProduto(p) {
        const r = regraDeClassificacao(p);
        return (r && CLASSES[r.classificacao]) ? r.classificacao : CLASSE_PADRAO;
    }
    function temRegraManual(p) {
        const r = window.RegrasNivelEstoque;
        if (!r || typeof r.regras !== 'function' || typeof r.produtoNoEscopo !== 'function') return false;
        return r.regras().some(g => { try { return g.ativo && r.produtoNoEscopo(p, g); } catch (e) { return false; } });
    }

    // ---------- estado (com trava por versão) -------------
    // Duas abas/administradores rodando o motor ao mesmo tempo: só quem
    // conseguir gravar a versão esperada segue com a alteração.
    async function gravarEstado(est, campos) {
        const cli = sb();
        const novo = { ...campos, versao: (Number(est.versao) || 0) + 1, atualizado_em: new Date().toISOString() };
        const { data, error } = await cli.from('escada_auto_estado').update(novo)
            .eq('produto_id', est.produto_id).eq('versao', Number(est.versao) || 0).select();
        if (error || !data || !data.length) return false;
        Object.assign(est, data[0]);
        return true;
    }
    async function lerEstado(produtoId) {
        const { data } = await sb().from('escada_auto_estado').select('*').eq('produto_id', String(produtoId)).maybeSingle();
        if (data) estadosPorProduto[String(produtoId)] = data;
        return data || null;
    }
    // altera os degraus relendo o estado (para ações feitas nos avisos)
    async function alterarDegraus(produtoId, fn) {
        for (let tentativa = 0; tentativa < 3; tentativa++) {
            const est = await lerEstado(produtoId);
            if (!est) return false;
            const degraus = JSON.parse(JSON.stringify(Array.isArray(est.degraus) ? est.degraus : []));
            const extra = fn(degraus, est) || {};
            if (await gravarEstado(est, { degraus: degraus.filter(d => d.niveis && d.niveis.length), ...extra })) return true;
        }
        return false;
    }
    function niveisAplicados(est) {
        return (Array.isArray(est.degraus) ? est.degraus : []).flatMap(d => d.niveis || []);
    }

    async function criarAviso(p, tipo, classe, niveis, mlbs, detalhe) {
        const { data, error } = await sb().from('escada_auto_avisos').insert([{
            produto_id: String(p.id), produto_sku: p.sku || null, produto_nome: p.nome || null,
            tipo, classificacao: classe, niveis, mlbs, detalhe: detalhe || null
        }]).select().maybeSingle();
        if (error) { console.warn('[escada-auto] aviso:', error.message); return null; }
        avisosPendentes.unshift(data);
        return data;
    }

    // ---------- MOTOR ------------------------------------
    async function avaliar(opts) {
        opts = opts || {};
        if (avaliando || !ehAdmin()) return;
        if (!opts.forcar && document.visibilityState && document.visibilityState !== 'visible') return;
        if (!opts.forcar && Date.now() - ultimaAvaliacao < 3 * 60000) return;
        if (!sb()) return;
        avaliando = true;
        ultimaAvaliacao = Date.now();
        let novos = 0;
        try {
            if (!(await carregarDados())) return;
            if (!config.ligado) return;

            const produtos = (await carregarProdutosMotor()).filter(p => !produtoInativo(p));
            const colunas = window.WTEstoqueColunas;
            if (colunas && typeof colunas.garantirFornecedores === 'function') {
                await colunas.garantirFornecedores(produtos).catch(() => {});
            }
            const regrasNivel = window.RegrasNivelEstoque;
            if (regrasNivel && typeof regrasNivel.carregar === 'function') await regrasNivel.carregar().catch(() => {});
            const analise = window.WTEstoqueAnalise;
            if (analise && typeof analise.garantirMetricas === 'function') await analise.garantirMetricas().catch(() => {});

            // MLB ligado a mais de um produto não muda sozinho
            const usoMlb = {};
            produtos.forEach(p => mlbsDoProduto(p).forEach(m => { usoMlb[m] = (usoMlb[m] || 0) + 1; }));

            const contexto = { token: null, usoMlb };
            const novosEstados = [];

            for (const p of produtos) {
                if (temRegraManual(p)) continue;
                const qtd = Math.max(0, Number(p.quantidade) || 0);
                const est = estadosPorProduto[String(p.id)];
                if (!est) {
                    // 1ª vez: só guarda o estoque; a escada começa na próxima saída
                    novosEstados.push({ produto_id: String(p.id), produto_sku: p.sku || null, produto_nome: p.nome || null, ultimo_estoque: qtd });
                    continue;
                }
                const classe = classificacaoDoProduto(p);
                const anterior = Number(est.ultimo_estoque) || 0;
                if (qtd < anterior) novos += await processarSaida(p, est, anterior, qtd, classe, contexto);
                else if (qtd > anterior) novos += await processarEntrada(p, est, qtd, classe, contexto);
                // processarSaida relê o estado do banco ao gravar os degraus
                novos += await verificarSemVenda(p, estadosPorProduto[String(p.id)] || est, classe, contexto);
            }

            for (let i = 0; i < novosEstados.length; i += 500) {
                const { error } = await sb().from('escada_auto_estado')
                    .upsert(novosEstados.slice(i, i + 500), { onConflict: 'produto_id', ignoreDuplicates: true });
                if (error) { console.warn('[escada-auto] estado inicial:', error.message); break; }
            }
            if (novosEstados.length) await carregarDados();

            if (novos > 0) {
                toast(`🪜 Escada automática: ${novos} aviso(s) novo(s) — veja em Gestão de Estoque → Escada automática.`, 'warning');
                if (window.WTEstoqueColunas && typeof window.WTEstoqueColunas.atualizarCelulas === 'function') window.WTEstoqueColunas.atualizarCelulas();
            }
            atualizarBadges();
        } catch (e) {
            console.warn('[escada-auto] avaliar:', e);
        } finally {
            avaliando = false;
        }
    }

    // SAÍDA: estoque caiu e chegou em degrau(s) ainda não aplicados.
    async function processarSaida(p, est, anterior, qtd, classe, ctx) {
        const cfg = CLASSES[classe];
        const aplicados = new Set(niveisAplicados(est));
        const niveis = [];
        for (let n = Math.min(anterior - 1, cfg.topo); n >= Math.max(qtd, 1); n--) {
            if (faixaDoNivel(classe, n) && !aplicados.has(n)) niveis.push(n);
        }
        if (!(await gravarEstado(est, { ultimo_estoque: qtd }))) return 0;
        if (!niveis.length) return 0;

        const faixas = {};
        niveis.forEach(n => { const f = faixaDoNivel(classe, n); faixas[String(n)] = { min: f.min, max: f.max }; });
        const mlbs = mlbsDoProduto(p);
        const linhas = [];
        if (mlbs.length && !ctx.token) ctx.token = await obterTokenML();

        for (const mlb of mlbs) {
            const linha = { mlb, antes: null, depois: null, aplicado: false, motivo: null, erro: null, resolucao: null };
            try {
                const item = await lerItemML(mlb, ctx.token);
                const variacoes = Array.isArray(item.variations) ? item.variations.length : 0;
                linha.antes = round2(item.price);
                linha.depois = precoComDegraus(linha.antes, niveis, faixas);
                if (variacoes > 1) { linha.motivo = 'variacoes'; linha.variacoes = variacoes; linha.manual = true; }
                else if ((ctx.usoMlb[mlb] || 0) > 1) { linha.motivo = 'compartilhado'; linha.manual = true; }
                else {
                    const promo = await promocaoOuCupom(mlb, ctx.token);
                    if (promo) { linha.motivo = 'promocao'; linha.promo_nome = promo.nome; }
                    else {
                        const res = await aplicarPreco(mlb, linha.depois, ctx.token);
                        linha.aplicado = res.ok;
                        if (!res.ok) { linha.motivo = 'erro'; linha.erro = res.erro || 'falhou'; }
                    }
                }
            } catch (e) {
                linha.motivo = 'erro';
                linha.erro = String(e.message || e);
            }
            linhas.push(linha);
        }

        const aviso = mlbs.length
            ? await criarAviso(p, 'saida', classe, niveis, linhas,
                `Estoque ${anterior} → ${qtd} · degrau${niveis.length > 1 ? 's' : ''} ${niveis.join(', ')}`)
            : null;

        const entrada = {
            niveis, faixas, em: new Date().toISOString(), aviso_id: aviso ? aviso.id : null,
            mlbs: Object.fromEntries(linhas.map(l => [l.mlb, { antes: l.antes, depois: l.depois, aplicado: l.aplicado, manual: !!l.manual }]))
        };
        await alterarDegraus(p.id, degraus => { degraus.push(entrada); });
        return aviso ? 1 : 0;
    }

    // Preço que o MLB teria só com os degraus que continuam valendo.
    function precoAlvoDesfazendo(entrada, mlb, niveisQueFicam) {
        const m = entrada.mlbs && entrada.mlbs[mlb];
        if (!m || m.antes == null) return null;
        return precoComDegraus(m.antes, niveisQueFicam, entrada.faixas || {});
    }
    // MLBs cujo preço subiu de fato nessa entrada (aplicado e não desfeito)
    function mlbsQueSubiram(entrada) {
        return Object.keys(entrada.mlbs || {}).filter(mlb => {
            const m = entrada.mlbs[mlb];
            return m && m.aplicado && !m.desfeito;
        });
    }
    async function precoAtual(mlb, ctx) {
        if (!ctx.token) ctx.token = await obterTokenML();
        try { return round2((await lerItemML(mlb, ctx.token)).price); } catch (e) { return null; }
    }

    // REPOSIÇÃO: estoque subiu. Degraus abaixo do estoque novo saem da
    // escada e o sistema RECOMENDA voltar o preço (não aplica sozinho).
    async function processarEntrada(p, est, qtd, classe, ctx) {
        const degraus = Array.isArray(est.degraus) ? est.degraus : [];
        const afetadas = degraus.filter(d => (d.niveis || []).some(n => n < qtd));
        if (!afetadas.length) {
            await gravarEstado(est, { ultimo_estoque: qtd });
            return 0;
        }
        const primeira = afetadas[0];
        const ficam = (primeira.niveis || []).filter(n => n >= qtd);
        const removidos = afetadas.flatMap(d => (d.niveis || []).filter(n => n < qtd));
        const novosDegraus = degraus.map(d => ({ ...d, niveis: (d.niveis || []).filter(n => n >= qtd) })).filter(d => d.niveis.length);
        if (!(await gravarEstado(est, { ultimo_estoque: qtd, degraus: novosDegraus }))) return 0;

        const linhas = [];
        for (const mlb of mlbsQueSubiram(primeira)) {
            const alvo = precoAlvoDesfazendo(primeira, mlb, ficam);
            const atual = await precoAtual(mlb, ctx);
            if (alvo == null || (atual != null && Math.abs(atual - alvo) < 0.01)) continue;
            linhas.push({ mlb, antes: atual, depois: alvo, manual: !!primeira.mlbs[mlb].manual, resolucao: null });
        }
        if (!linhas.length) return 0;
        await criarAviso(p, 'reposicao', classe, removidos, linhas,
            `Estoque reposto para ${qtd} un. — saiu do${removidos.length > 1 ? 's' : ''} degrau${removidos.length > 1 ? 's' : ''} ${removidos.sort((a, b) => b - a).join(', ')}`);
        return 1;
    }

    // DIAS SEM VENDER: recomenda descer um degrau (desfazer o último aumento).
    async function verificarSemVenda(p, est, classe, ctx) {
        const degraus = Array.isArray(est.degraus) ? est.degraus : [];
        if (!degraus.length) return 0;
        const a = window.WTEstoqueAnalise && window.WTEstoqueAnalise.metricaDe(p.id);
        const dias = a ? a.diasSemVenda : null;
        const limite = CLASSES[classe].diasSemVenda;
        if (dias == null || dias < limite) return 0;
        if (est.ultimo_aviso_sem_venda && Date.now() - new Date(est.ultimo_aviso_sem_venda).getTime() < limite * DIA_MS) return 0;
        if (avisosPendentes.some(v => String(v.produto_id) === String(p.id) && v.tipo === 'sem_venda')) return 0;

        const ultima = degraus[degraus.length - 1];
        const nivel = Math.min(...(ultima.niveis || []));
        const ficam = (ultima.niveis || []).filter(n => n !== nivel);
        if (!(await gravarEstado(est, { ultimo_aviso_sem_venda: new Date().toISOString() }))) return 0;

        const linhas = [];
        for (const mlb of mlbsQueSubiram(ultima)) {
            const alvo = precoAlvoDesfazendo(ultima, mlb, ficam);
            const atual = await precoAtual(mlb, ctx);
            if (alvo == null || (atual != null && atual <= alvo + 0.009)) continue;
            linhas.push({ mlb, antes: atual, depois: alvo, manual: !!ultima.mlbs[mlb].manual, resolucao: null });
        }
        if (!linhas.length) return 0;
        await criarAviso(p, 'sem_venda', classe, [nivel], linhas,
            `${Math.floor(dias)} dias sem vender (limite ${CLASSES[classe].nome}: ${limite} dias) — descer o degrau ${nivel}`);
        return 1;
    }

    // ---------- ações nos avisos ---------------------------
    async function resolverLinha(avisoId, idx, acao) {
        const cli = sb();
        const { data: aviso } = await cli.from('escada_auto_avisos').select('*').eq('id', avisoId).maybeSingle();
        if (!aviso) return;
        const mlbs = Array.isArray(aviso.mlbs) ? aviso.mlbs : [];
        const linha = mlbs[idx];
        if (!linha || linha.resolucao) { toast('Esse anúncio já foi resolvido.', 'info'); return; }
        const token = await obterTokenML();

        if (acao === 'desfazer') {
            if (!confirm(`Voltar ${linha.mlb} para ${brl(linha.antes)}?`)) return;
            const res = await aplicarPreco(linha.mlb, linha.antes, token);
            if (!res.ok) { toast('Não foi possível desfazer: ' + (res.erro || ''), 'error'); return; }
            linha.resolucao = 'desfeito';
            await marcarNaEntrada(aviso, linha.mlb, { desfeito: true });
        } else if (acao === 'alterar') {
            const txt = prompt(`Novo preço para ${linha.mlb} (atual ${brl(linha.depois)}):`, String(linha.depois).replace('.', ','));
            if (txt == null) return;
            const valor = round2(String(txt).replace(/\./g, '').replace(',', '.'));
            if (!(valor > 0)) { toast('Preço inválido.', 'warning'); return; }
            const res = await aplicarPreco(linha.mlb, valor, token);
            if (!res.ok) { toast('Não foi possível alterar: ' + (res.erro || ''), 'error'); return; }
            linha.resolucao = 'alterado';
            linha.depois = valor;
            await marcarNaEntrada(aviso, linha.mlb, { depois: valor, aplicado: true });
        } else if (acao === 'aplicar') {
            const res = await aplicarPreco(linha.mlb, linha.depois, token);
            if (!res.ok) { linha.erro = res.erro || 'falhou'; toast('Falhou: ' + linha.erro, 'error'); }
            else {
                linha.resolucao = 'aplicado';
                linha.aplicado = true;
                if (aviso.tipo === 'saida') await marcarNaEntrada(aviso, linha.mlb, { aplicado: true });
                if (aviso.tipo === 'sem_venda') await removerNivelSemVenda(aviso);
            }
        } else if (acao === 'feito_manual') {
            linha.resolucao = 'feito_manual';
            if (aviso.tipo === 'saida') await marcarNaEntrada(aviso, linha.mlb, { aplicado: true });
            if (aviso.tipo === 'sem_venda') await removerNivelSemVenda(aviso);
        } else if (acao === 'manter') {
            linha.resolucao = 'mantido';
            if (aviso.tipo === 'saida') await marcarNaEntrada(aviso, linha.mlb, { desfeito: true });
        } else if (acao === 'ok') {
            linha.resolucao = 'ok';
        }

        const tudo = mlbs.every(l => l.resolucao);
        await cli.from('escada_auto_avisos').update({
            mlbs, visto: true,
            status: tudo ? (mlbs.every(l => l.resolucao === 'desfeito') ? 'desfeito' : 'resolvido') : 'pendente',
            resolvido_em: tudo ? new Date().toISOString() : null,
            resolvido_por: tudo ? nomeUsuario() : null
        }).eq('id', avisoId);
    }
    async function okTodos(avisoId) {
        const cli = sb();
        const { data: aviso } = await cli.from('escada_auto_avisos').select('*').eq('id', avisoId).maybeSingle();
        if (!aviso) return;
        const mlbs = (aviso.mlbs || []).map(l => (l.resolucao || !(l.aplicado && !l.motivo)) ? l : { ...l, resolucao: 'ok' });
        const tudo = mlbs.every(l => l.resolucao);
        await cli.from('escada_auto_avisos').update({
            mlbs, visto: true, status: tudo ? 'resolvido' : 'pendente',
            resolvido_em: tudo ? new Date().toISOString() : null, resolvido_por: tudo ? nomeUsuario() : null
        }).eq('id', avisoId);
    }
    async function marcarNaEntrada(aviso, mlb, campos) {
        await alterarDegraus(aviso.produto_id, degraus => {
            const e = degraus.find(d => String(d.aviso_id) === String(aviso.id));
            if (e && e.mlbs && e.mlbs[mlb]) Object.assign(e.mlbs[mlb], campos);
        });
    }
    async function removerNivelSemVenda(aviso) {
        const nivel = Array.isArray(aviso.niveis) ? aviso.niveis[0] : null;
        if (nivel == null) return;
        await alterarDegraus(aviso.produto_id, degraus => {
            for (let i = degraus.length - 1; i >= 0; i--) {
                if ((degraus[i].niveis || []).includes(nivel)) {
                    degraus[i].niveis = degraus[i].niveis.filter(n => n !== nivel);
                    break;
                }
            }
        });
    }

    // ---------- classificação: gravar seleção --------------
    async function salvarClassificacao(tipo, nome, classe) {
        const colunas = window.WTEstoqueColunas;
        const chave = tipo === 'fornecedor'
            ? (colunas && colunas.chaveFornecedor ? colunas.chaveFornecedor(nome) : String(nome).trim().toUpperCase())
            : normCategoria(nome);
        if (!chave) { toast('Escolha o fornecedor ou a categoria.', 'warning'); return false; }
        const { error } = await sb().from('escada_auto_classificacao').upsert([{
            tipo, chave, nome: String(nome).trim(), classificacao: classe,
            definido_em: new Date().toISOString(), definido_por: nomeUsuario()
        }], { onConflict: 'tipo,chave' });
        if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return false; }
        return true;
    }

    // ---------- célula na tabela da Gestão -----------------
    function htmlCelula(p) {
        if (tabelasFaltando) return '<span class="wtc-vazio" title="Rodar escada_automatica.sql no Supabase">sem tabelas</span>';
        if (!dadosCarregados) return '<span class="wtc-vazio">…</span>';
        const classe = classificacaoDoProduto(p);
        const cfg = CLASSES[classe];
        const est = estadosPorProduto[String(p.id)];
        const qtd = Number(p.quantidade) || 0;
        let situacao;
        if (temRegraManual(p)) situacao = 'regra manual';
        else if (est && niveisAplicados(est).length) situacao = `degrau ${Math.min(...niveisAplicados(est))}`;
        else situacao = qtd > cfg.topo ? `escada a partir de ${cfg.topo}` : 'entra na próxima saída';
        const pend = avisosPendentes.filter(v => String(v.produto_id) === String(p.id));
        const alerta = pend.length
            ? `<br><button type="button" class="ea-badge-aviso" data-ea-abrir="avisos" title="Avisos pendentes da escada">⚠ ${pend.length} aviso${pend.length > 1 ? 's' : ''}</button>`
            : '';
        return `<span class="ea-classe" style="background:${cfg.cor};">${esc(cfg.nome)}</span>
            <br><small style="color:#64748b;">${esc(situacao)}</small>${alerta}`;
    }

    // ---------- estilo -----------------------------------
    function garantirEstilo() {
        if (document.getElementById('escadaAutoEstilo')) return;
        const st = document.createElement('style');
        st.id = 'escadaAutoEstilo';
        st.textContent = `
            .ea-classe{display:inline-block;color:#fff;border-radius:999px;padding:1px 9px;font-size:11px;font-weight:700}
            .ea-badge-aviso{border:0;background:#fef3c7;color:#92400e;border-radius:6px;font-size:11px;font-weight:700;padding:1px 6px;margin-top:3px;cursor:pointer}
            #eaOverlay{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;z-index:99999;padding:34px 14px;overflow:auto}
            #eaOverlay.hidden{display:none}
            #eaModal{background:#fff;border-radius:16px;width:100%;max-width:960px;box-shadow:0 24px 60px rgba(0,0,0,.28);overflow:hidden;font-size:14px}
            #eaModal .ea-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 22px;border-bottom:1px solid #eef0f4;flex-wrap:wrap}
            #eaModal .ea-head h3{margin:0;font-size:17px}
            #eaModal .ea-fechar{background:none;border:none;font-size:22px;cursor:pointer;color:#64748b}
            #eaModal .ea-ligado{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;cursor:pointer}
            #eaModal .ea-tabs{display:flex;gap:6px;padding:12px 22px 0;flex-wrap:wrap}
            #eaModal .ea-tab{border:1px solid #d9dee7;background:#f6f7f9;border-radius:999px;padding:6px 14px;cursor:pointer;font-size:13px;color:#475569}
            #eaModal .ea-tab.ativa{background:#0f766e;border-color:#0f766e;color:#fff;font-weight:600}
            #eaModal .ea-corpo{padding:16px 22px 24px;max-height:72vh;overflow:auto}
            #eaModal .ea-vazio{text-align:center;color:#94a3b8;padding:24px}
            #eaModal .ea-aviso{border:1px solid #e2e8f0;border-left:4px solid #0f766e;border-radius:10px;padding:10px 12px;margin-bottom:10px}
            #eaModal .ea-aviso.saida{border-left-color:#16a34a}
            #eaModal .ea-aviso.reposicao{border-left-color:#7c3aed}
            #eaModal .ea-aviso.sem_venda{border-left-color:#d97706}
            #eaModal .ea-aviso.fechado{opacity:.6}
            #eaModal .ea-aviso table{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}
            #eaModal .ea-aviso td{border-top:1px solid #f1f5f9;padding:5px 4px;vertical-align:middle}
            #eaModal .ea-acoes{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}
            #eaModal .ea-acoes button,#eaModal .ea-btn{border:1px solid #cbd5e1;background:#fff;border-radius:7px;padding:4px 10px;font-size:12px;cursor:pointer;font-weight:600;color:#334155}
            #eaModal .ea-acoes button.prim,#eaModal .ea-btn.prim{background:#0f766e;border-color:#0f766e;color:#fff}
            #eaModal .ea-acoes button.perigo{color:#b91c1c;border-color:#fecaca}
            #eaModal .ea-tag{display:inline-block;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:700;background:#f1f5f9;color:#475569}
            #eaModal .ea-tag.ok{background:#dcfce7;color:#166534}
            #eaModal .ea-tag.alerta{background:#fef3c7;color:#92400e}
            #eaModal .ea-tag.erro{background:#fee2e2;color:#b91c1c}
            #eaModal fieldset{border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:0 0 14px}
            #eaModal legend{font-weight:700;font-size:12px;color:#64748b;padding:0 6px;width:auto;margin:0}
            #eaModal .ea-form{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}
            #eaModal .ea-form label{display:block;font-size:12px;font-weight:600;color:#475569;margin:0 0 3px}
            #eaModal .ea-form input,#eaModal .ea-form select{border:1px solid #d9dee7;border-radius:8px;padding:6px 9px;font-size:14px}
            #eaModal table.ea-lista{width:100%;border-collapse:collapse;font-size:13px}
            #eaModal table.ea-lista th,#eaModal table.ea-lista td{border-bottom:1px solid #eef0f4;padding:6px;text-align:left}
            #eaModal table.ea-lista th{font-size:12px;color:#64748b}
            #wtEscadaAutoNotifBtn{position:relative}
            .ea-contador{background:#d97706;color:#fff;border-radius:999px;font-size:10px;min-width:16px;height:16px;line-height:16px;text-align:center;padding:0 3px}
            #wtEscadaAutoNotifBtn .ea-contador{position:absolute;top:-4px;right:-4px}
            #btnEscadaAutoToolbar .ea-contador{margin-left:6px}
        `;
        document.head.appendChild(st);
    }

    // ---------- botão no menu + sino ----------------------
    function garantirBotaoMenu() {
        const atual = document.getElementById('menuAcessibilidadeEstoqueDropdown');
        if (atual && document.getElementById('btnEscadaAutoToolbar')?.parentElement === atual) return;
        if (typeof window.garantirMenuAcessibilidadeEstoque !== 'function') return;
        const menu = window.garantirMenuAcessibilidadeEstoque();
        if (!menu) return;
        const existente = document.getElementById('btnEscadaAutoToolbar');
        if (existente) { if (existente.parentElement !== menu) menu.appendChild(existente); return; }
        const b = document.createElement('button');
        b.id = 'btnEscadaAutoToolbar';
        b.type = 'button';
        b.title = 'Escada automática de preços por classificação (fácil / médio / difícil)';
        b.innerHTML = `<i class="fas fa-stairs"></i> Escada automática <span class="ea-contador" style="display:none">0</span>`;
        b.addEventListener('click', () => abrir('avisos'));
        if (typeof window.estilizarItemMenuAcessibilidadeEstoque === 'function') window.estilizarItemMenuAcessibilidadeEstoque(b);
        menu.appendChild(b);
    }
    function garantirSino() {
        let btn = document.getElementById('wtEscadaAutoNotifBtn');
        if (btn) return btn;
        const ancora = document.getElementById('wtRegrasNivelNotifBtn')
            || document.getElementById('wtMenuSettingsBtn')
            || document.getElementById('wtUsuariosNotifBtn');
        if (!ancora || !ancora.parentElement) return null;
        btn = document.createElement('button');
        btn.id = 'wtEscadaAutoNotifBtn';
        btn.type = 'button';
        btn.className = 'wt-icon-button btn btn-sm btn-secondary';
        btn.title = 'Escada automática — avisos pendentes';
        btn.style.display = 'none';
        btn.innerHTML = `<i class="fas fa-stairs"></i><span class="ea-contador">0</span>`;
        btn.addEventListener('click', e => { e.stopPropagation(); abrir('avisos'); });
        ancora.parentElement.insertBefore(btn, ancora);
        return btn;
    }
    function atualizarBadges() {
        const qtd = ehAdmin() ? avisosPendentes.length : 0;
        const sino = garantirSino();
        if (sino) sino.style.display = qtd > 0 ? '' : 'none';
        document.querySelectorAll('#wtEscadaAutoNotifBtn .ea-contador, #btnEscadaAutoToolbar .ea-contador').forEach(el => {
            el.textContent = qtd > 99 ? '99+' : String(qtd);
            el.style.display = qtd > 0 ? '' : 'none';
        });
    }

    // ---------- MODAL -----------------------------------
    let abaAtual = 'avisos';
    function garantirOverlay() {
        let ov = document.getElementById('eaOverlay');
        if (ov) return ov;
        garantirEstilo();
        ov = document.createElement('div');
        ov.id = 'eaOverlay';
        ov.className = 'hidden';
        ov.innerHTML = `
            <div id="eaModal" role="dialog" aria-modal="true">
                <div class="ea-head">
                    <h3>🪜 Escada automática de preços</h3>
                    <div style="display:flex;align-items:center;gap:14px;">
                        <label class="ea-ligado"><input type="checkbox" id="eaLigado"> Escada automática ligada</label>
                        <button type="button" class="ea-fechar">&times;</button>
                    </div>
                </div>
                <div class="ea-tabs">
                    <button type="button" class="ea-tab" data-aba="avisos">Avisos</button>
                    <button type="button" class="ea-tab" data-aba="classificacao">Classificação</button>
                    <button type="button" class="ea-tab" data-aba="escadas">Escadas</button>
                    <button type="button" class="ea-tab" data-aba="cupons">Anúncios em cupom</button>
                </div>
                <div class="ea-corpo"></div>
            </div>`;
        ov.addEventListener('click', e => { if (e.target === ov) fechar(); });
        ov.querySelector('.ea-fechar').addEventListener('click', fechar);
        ov.querySelectorAll('.ea-tab').forEach(t => t.addEventListener('click', () => { abaAtual = t.dataset.aba; render(); }));
        ov.querySelector('#eaLigado').addEventListener('change', async e => {
            const ligado = e.target.checked;
            if (!ligado && !confirm('Desligar a escada automática? Nenhum preço será alterado até ligar de novo.')) { e.target.checked = true; return; }
            const { error } = await sb().from('escada_auto_config').upsert([{ id: 1, ligado, atualizado_em: new Date().toISOString(), atualizado_por: nomeUsuario() }]);
            if (error) { toast('Erro: ' + error.message, 'error'); e.target.checked = !ligado; return; }
            config.ligado = ligado;
            toast(ligado ? '🪜 Escada automática ligada.' : 'Escada automática desligada.', ligado ? 'success' : 'info');
            if (ligado) avaliar({ forcar: true });
        });
        document.body.appendChild(ov);
        return ov;
    }
    function fechar() { const ov = document.getElementById('eaOverlay'); if (ov) ov.classList.add('hidden'); }
    async function abrir(aba) {
        if (!ehAdmin()) { toast('🔒 Só administradores.', 'warning'); return; }
        abaAtual = aba || 'avisos';
        const ov = garantirOverlay();
        ov.classList.remove('hidden');
        ov.querySelector('.ea-corpo').innerHTML = '<div class="ea-vazio">Carregando…</div>';
        await carregarDados();
        render();
    }
    function render() {
        const ov = document.getElementById('eaOverlay');
        if (!ov || ov.classList.contains('hidden')) return;
        ov.querySelectorAll('.ea-tab').forEach(t => t.classList.toggle('ativa', t.dataset.aba === abaAtual));
        ov.querySelector('#eaLigado').checked = !!config.ligado;
        const corpo = ov.querySelector('.ea-corpo');
        if (tabelasFaltando) {
            corpo.innerHTML = '<div class="ea-vazio">As tabelas da escada automática ainda não existem.<br>Rode o arquivo <strong>escada_automatica.sql</strong> no SQL Editor do Supabase.</div>';
            return;
        }
        if (abaAtual === 'avisos') renderAvisos(corpo);
        else if (abaAtual === 'classificacao') renderClassificacao(corpo);
        else if (abaAtual === 'escadas') renderEscadas(corpo);
        else renderCupons(corpo);
    }

    // ---- aba Avisos ----
    const TITULO_TIPO = {
        saida: '📈 Preço subiu pela escada',
        reposicao: '📦 Estoque reposto — recomendação de baixar o preço',
        sem_venda: '⏳ Sem vender — recomendação de descer um degrau'
    };
    function descreverLinha(aviso, l) {
        if (l.resolucao) {
            const nomes = { ok: 'ok', desfeito: 'desfeito', alterado: 'alterado', aplicado: 'aplicado', feito_manual: 'ajustado à mão', mantido: 'mantido' };
            return `<span class="ea-tag ok">${esc(nomes[l.resolucao] || l.resolucao)}</span>`;
        }
        if (aviso.tipo === 'saida') {
            if (l.motivo === 'variacoes') return `<span class="ea-tag alerta">${l.variacoes} variações — ajuste manual</span>`;
            if (l.motivo === 'compartilhado') return '<span class="ea-tag alerta">MLB em mais de um produto — ajuste manual</span>';
            if (l.motivo === 'promocao') return `<span class="ea-tag alerta">${esc(l.promo_nome || 'Em promoção')} — não alterado</span>`;
            if (l.motivo === 'erro') return `<span class="ea-tag erro" title="${esc(l.erro || '')}">falhou</span>`;
            return '<span class="ea-tag ok">alterado automaticamente</span>';
        }
        return l.manual ? '<span class="ea-tag alerta">ajuste manual</span>' : '<span class="ea-tag">recomendado</span>';
    }
    function botoesLinha(aviso, l, i) {
        if (l.resolucao || aviso.status !== 'pendente') return '';
        const b = (acao, txt, cls) => `<button type="button" class="${cls || ''}" data-ea-aviso="${aviso.id}" data-ea-i="${i}" data-ea-acao="${acao}">${txt}</button>`;
        if (aviso.tipo === 'saida') {
            if (l.motivo === 'variacoes' || l.motivo === 'compartilhado') return b('feito_manual', 'Já ajustei', 'prim') + b('manter', 'Não vou ajustar');
            if (l.motivo === 'promocao') return b('aplicar', 'Aplicar mesmo assim', 'prim') + b('manter', 'Manter preço');
            if (l.motivo === 'erro') return b('aplicar', 'Tentar de novo', 'prim') + b('manter', 'Ignorar');
            return b('ok', 'OK', 'prim') + b('alterar', 'Alterar…') + b('desfazer', 'Desfazer', 'perigo');
        }
        if (l.manual) return b('feito_manual', 'Já ajustei', 'prim') + b('manter', 'Manter preço');
        return b('aplicar', 'Aplicar', 'prim') + b('manter', 'Manter preço');
    }
    async function renderAvisos(corpo) {
        const { data, error } = await sb().from('escada_auto_avisos').select('*').order('criado_em', { ascending: false }).limit(150);
        if (error) { corpo.innerHTML = '<div class="ea-vazio">Erro ao carregar avisos.</div>'; return; }
        const lista = data || [];
        avisosPendentes = lista.filter(a => a.status === 'pendente');
        atualizarBadges();
        if (!lista.length) {
            corpo.innerHTML = `<div class="ea-vazio">Nenhum aviso ainda.${config.ligado ? '' : '<br>A escada automática está <strong>desligada</strong>.'}</div>`;
            return;
        }
        const bloco = a => {
            const cfg = CLASSES[a.classificacao] || CLASSES[CLASSE_PADRAO];
            const linhas = (a.mlbs || []).map((l, i) => `<tr>
                <td><code>${esc(l.mlb)}</code></td>
                <td>${l.antes != null ? brl(l.antes) : '?'} → <strong>${l.depois != null ? brl(l.depois) : '?'}</strong></td>
                <td>${descreverLinha(a, l)}</td>
                <td><div class="ea-acoes">${botoesLinha(a, l, i)}</div></td>
            </tr>`).join('');
            const podeOkTodos = a.status === 'pendente' && a.tipo === 'saida' &&
                (a.mlbs || []).filter(l => !l.resolucao && l.aplicado && !l.motivo).length > 1;
            return `<div class="ea-aviso ${esc(a.tipo)} ${a.status !== 'pendente' ? 'fechado' : ''}">
                <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                    <strong>${esc(a.produto_nome || a.produto_sku || a.produto_id)}</strong>
                    <span><span class="ea-classe" style="background:${cfg.cor};">${esc(cfg.nome)}</span>
                        <small style="color:#94a3b8;margin-left:6px;">${new Date(a.criado_em).toLocaleString('pt-BR')}</small></span>
                </div>
                <div style="font-size:12px;color:#475569;">${esc(TITULO_TIPO[a.tipo] || a.tipo)} · SKU ${esc(a.produto_sku || '—')} · ${esc(a.detalhe || '')}</div>
                <table>${linhas}</table>
                ${podeOkTodos ? `<div class="ea-acoes" style="margin-top:6px;"><button type="button" class="ea-btn prim" data-ea-oktodos="${a.id}">OK para todos os alterados</button></div>` : ''}
            </div>`;
        };
        const pend = lista.filter(a => a.status === 'pendente');
        const hist = lista.filter(a => a.status !== 'pendente');
        corpo.innerHTML = `
            <h4 style="margin:0 0 10px;font-size:15px;">Pendentes (${pend.length})</h4>
            ${pend.length ? pend.map(bloco).join('') : '<div class="ea-vazio">Nada pendente.</div>'}
            ${hist.length ? `<h4 style="margin:18px 0 10px;font-size:15px;">Histórico</h4>${hist.map(bloco).join('')}` : ''}`;
        corpo.querySelectorAll('button[data-ea-acao]').forEach(b => b.addEventListener('click', async () => {
            corpo.querySelectorAll('button[data-ea-acao],button[data-ea-oktodos]').forEach(x => { x.disabled = true; });
            try { await resolverLinha(b.dataset.eaAviso, Number(b.dataset.eaI), b.dataset.eaAcao); }
            finally { renderAvisos(corpo); }
        }));
        corpo.querySelectorAll('button[data-ea-oktodos]').forEach(b => b.addEventListener('click', async () => {
            b.disabled = true;
            await okTodos(b.dataset.eaOktodos);
            renderAvisos(corpo);
        }));
    }

    // ---- aba Classificação ----
    async function produtosParaClassificar() {
        const vivos = (() => { try { return (typeof produtosEstoque !== 'undefined' && produtosEstoque) || []; } catch (e) { return []; } })();
        const lista = vivos.length ? vivos : await carregarProdutosMotor();
        const colunas = window.WTEstoqueColunas;
        if (colunas && typeof colunas.garantirFornecedores === 'function') await colunas.garantirFornecedores(lista).catch(() => {});
        return lista.filter(p => !produtoInativo(p));
    }
    async function renderClassificacao(corpo) {
        corpo.innerHTML = '<div class="ea-vazio">Carregando fornecedores e categorias…</div>';
        const produtos = await produtosParaClassificar();
        const colunas = window.WTEstoqueColunas;
        const fornecedores = colunas && colunas.nomesFornecedores ? colunas.nomesFornecedores() : [];
        const categorias = [...new Set(produtos.map(p => String(p.categoria || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));
        const contagem = { facil: 0, medio: 0, dificil: 0 };
        produtos.forEach(p => { contagem[classificacaoDoProduto(p)]++; });
        const ordenadas = classificacoes.slice().sort((a, b) => new Date(b.definido_em) - new Date(a.definido_em));

        corpo.innerHTML = `
            <fieldset>
                <legend>Definir classificação</legend>
                <div class="ea-form">
                    <div><label>Por</label>
                        <select id="eaTipo"><option value="fornecedor">Fornecedor</option><option value="categoria">Categoria</option></select></div>
                    <div style="flex:1;min-width:220px;"><label id="eaNomeRot">Fornecedor</label>
                        <input type="text" id="eaNome" list="eaNomes" style="width:100%;" placeholder="Digite ou escolha">
                        <datalist id="eaNomes"></datalist></div>
                    <div><label>Reposição</label>
                        <select id="eaClasse"><option value="facil">Fácil</option><option value="medio" selected>Médio</option><option value="dificil">Difícil</option></select></div>
                    <button type="button" class="ea-btn prim" id="eaSalvarClasse" style="padding:7px 14px;">Aplicar</button>
                </div>
                <div id="eaPrevia" style="font-size:12px;color:#64748b;margin-top:8px;"></div>
                <div style="font-size:12px;color:#94a3b8;margin-top:6px;">Vale a última seleção: se um produto entra em um fornecedor e em uma categoria classificados, fica com a classificação definida por último. Sem seleção, o produto fica em Médio.</div>
            </fieldset>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;font-size:13px;">
                ${Object.keys(CLASSES).map(k => `<span><span class="ea-classe" style="background:${CLASSES[k].cor};">${CLASSES[k].nome}</span> ${contagem[k]} produto(s)</span>`).join('')}
            </div>
            <h4 style="margin:0 0 8px;font-size:15px;">Seleções feitas (mais recente primeiro)</h4>
            ${ordenadas.length ? `<table class="ea-lista"><tr><th>Por</th><th>Nome</th><th>Reposição</th><th>Definido em</th><th></th></tr>
                ${ordenadas.map(c => `<tr>
                    <td>${c.tipo === 'fornecedor' ? 'Fornecedor' : 'Categoria'}</td>
                    <td>${esc(c.nome || c.chave)}</td>
                    <td><span class="ea-classe" style="background:${(CLASSES[c.classificacao] || CLASSES.medio).cor};">${esc((CLASSES[c.classificacao] || CLASSES.medio).nome)}</span></td>
                    <td>${new Date(c.definido_em).toLocaleString('pt-BR')}${c.definido_por ? ' · ' + esc(c.definido_por) : ''}</td>
                    <td><button type="button" class="ea-btn" data-ea-delclasse="${c.id}">Remover</button></td>
                </tr>`).join('')}</table>` : '<div class="ea-vazio">Nenhuma seleção ainda — todos os produtos estão em Médio.</div>'}`;

        const tipo = corpo.querySelector('#eaTipo');
        const nome = corpo.querySelector('#eaNome');
        const lista = corpo.querySelector('#eaNomes');
        const previa = corpo.querySelector('#eaPrevia');
        const preencher = () => {
            const opcoes = tipo.value === 'fornecedor' ? fornecedores : categorias;
            lista.innerHTML = opcoes.map(n => `<option value="${esc(n)}">`).join('');
            corpo.querySelector('#eaNomeRot').textContent = tipo.value === 'fornecedor' ? 'Fornecedor' : 'Categoria';
            nome.value = '';
            previa.textContent = '';
        };
        const atualizarPrevia = () => {
            const v = nome.value.trim();
            if (!v) { previa.textContent = ''; return; }
            let n;
            if (tipo.value === 'fornecedor') {
                const chave = colunas && colunas.chaveFornecedor ? colunas.chaveFornecedor(v) : v.toUpperCase();
                n = produtos.filter(p => chavesFornecedorDoProduto(p).includes(chave)).length;
            } else {
                n = produtos.filter(p => normCategoria(p.categoria) === normCategoria(v)).length;
            }
            previa.textContent = `${n} produto(s) recebem esta classificação.`;
        };
        tipo.addEventListener('change', preencher);
        nome.addEventListener('input', atualizarPrevia);
        preencher();
        corpo.querySelector('#eaSalvarClasse').addEventListener('click', async () => {
            const v = nome.value.trim();
            const classe = corpo.querySelector('#eaClasse').value;
            if (!v) { toast('Escolha o fornecedor ou a categoria.', 'warning'); return; }
            if (await salvarClassificacao(tipo.value, v, classe)) {
                toast(`✅ ${v}: ${CLASSES[classe].nome}.`, 'success');
                await carregarDados();
                renderClassificacao(corpo);
                if (colunas && colunas.atualizarCelulas) colunas.atualizarCelulas();
            }
        });
        corpo.querySelectorAll('[data-ea-delclasse]').forEach(b => b.addEventListener('click', async () => {
            if (!confirm('Remover esta seleção? Os produtos voltam para a seleção anterior (ou Médio).')) return;
            await sb().from('escada_auto_classificacao').delete().eq('id', b.dataset.eaDelclasse);
            await carregarDados();
            renderClassificacao(corpo);
            if (colunas && colunas.atualizarCelulas) colunas.atualizarCelulas();
        }));
    }

    // ---- aba Escadas ----
    function renderEscadas(corpo) {
        const exemplo = (preco, min, max) => brl(precoComDegrau(preco, { min, max }));
        corpo.innerHTML = Object.keys(CLASSES).map(k => {
            const c = CLASSES[k];
            return `<fieldset><legend><span class="ea-classe" style="background:${c.cor};">${c.nome}</span></legend>
                <div style="font-size:13px;">Começa com <strong>${c.topo} un.</strong> em estoque · recomenda descer um degrau após <strong>${c.diasSemVenda} dias</strong> sem vender.</div>
                <table class="ea-lista" style="margin-top:6px;"><tr><th>Estoque</th><th>Aumento por degrau</th><th>Ex.: R$ 600,00</th><th>Ex.: R$ 34,22</th></tr>
                ${c.faixas.map(f => `<tr><td>${f.de} a ${f.ate} un.</td><td>+${f.min}% ajustando para final 9,48 (máx. ${f.max}%)</td>
                    <td>${exemplo(600, f.min, f.max)}</td><td>${exemplo(34.22, f.min, f.max)}</td></tr>`).join('')}
                </table></fieldset>`;
        }).join('') + `<div style="font-size:12px;color:#64748b;">
            Cada degrau sobe sobre o preço atual do anúncio. Saída de estoque aplica sozinho (e avisa); reposição e dias sem vender só recomendam.
            Não altera sozinho: anúncio com mais de 1 variação, MLB ligado a mais de um produto, anúncio em promoção ou na lista de cupons, produto com regra de nível manual.</div>`;
    }

    // ---- aba Cupons ----
    async function renderCupons(corpo) {
        await carregarCupons(true);
        corpo.innerHTML = `
            <div style="font-size:13px;color:#475569;margin-bottom:10px;">O Mercado Livre não informa pela API os anúncios com cupom do vendedor. Cadastre aqui: anúncio desta lista não tem o preço alterado sozinho — nem pela escada automática, nem pelas regras de nível (só avisa).</div>
            <fieldset><legend>Adicionar</legend>
                <div class="ea-form">
                    <div><label>MLB</label><input type="text" id="eaCupomMlb" placeholder="MLB… ou * = todos" style="width:190px;"></div>
                    <div style="flex:1;min-width:180px;"><label>Descrição</label><input type="text" id="eaCupomDesc" placeholder="Ex.: cupom 10% outubro" style="width:100%;"></div>
                    <div><label>Válido até</label><input type="date" id="eaCupomAte"></div>
                    <button type="button" class="ea-btn prim" id="eaCupomAdd" style="padding:7px 14px;">Adicionar</button>
                </div>
            </fieldset>
            ${cupons.length ? `<table class="ea-lista"><tr><th>MLB</th><th>Descrição</th><th>Válido até</th><th></th></tr>
                ${cupons.map(c => `<tr style="${cupomValido(c) ? '' : 'opacity:.5;'}">
                    <td><code>${c.mlb === '*' ? 'todos os anúncios' : esc(c.mlb)}</code></td>
                    <td>${esc(c.descricao || '')}</td>
                    <td>${c.valido_ate ? new Date(c.valido_ate + 'T12:00:00').toLocaleDateString('pt-BR') + (cupomValido(c) ? '' : ' (vencido)') : 'sem prazo'}</td>
                    <td><button type="button" class="ea-btn" data-ea-delcupom="${c.id}">Remover</button></td>
                </tr>`).join('')}</table>` : '<div class="ea-vazio">Nenhum anúncio em cupom cadastrado.</div>'}`;
        corpo.querySelector('#eaCupomAdd').addEventListener('click', async () => {
            let mlb = corpo.querySelector('#eaCupomMlb').value.trim().toUpperCase();
            if (mlb !== '*' && /^\d+$/.test(mlb)) mlb = 'MLB' + mlb;
            if (mlb !== '*' && !/^MLB\d+$/.test(mlb)) { toast('Informe um MLB válido (ou * para todos).', 'warning'); return; }
            const { error } = await sb().from('anuncios_em_cupom').insert([{
                mlb, descricao: corpo.querySelector('#eaCupomDesc').value.trim() || null,
                valido_ate: corpo.querySelector('#eaCupomAte').value || null, criado_por: nomeUsuario()
            }]);
            if (error) { toast('Erro: ' + error.message, 'error'); return; }
            toast('✅ Anúncio em cupom cadastrado.', 'success');
            renderCupons(corpo);
        });
        corpo.querySelectorAll('[data-ea-delcupom]').forEach(b => b.addEventListener('click', async () => {
            if (!confirm('Remover da lista de cupons?')) return;
            await sb().from('anuncios_em_cupom').delete().eq('id', b.dataset.eaDelcupom);
            renderCupons(corpo);
        }));
    }

    // ---------- hooks / start ----------------------------
    function instalarHooks() {
        if (window.__eaMovPatched || typeof window.registrarMovimentacao !== 'function') return;
        window.__eaMovPatched = true;
        const original = window.registrarMovimentacao;
        window.registrarMovimentacao = async function () {
            const r = await original.apply(this, arguments);
            if (ehAdmin()) setTimeout(() => avaliar({ forcar: true }), 2500);
            return r;
        };
    }

    document.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('[data-ea-abrir]');
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        abrir(b.dataset.eaAbrir);
    });

    let ultimaRecargaTela = 0;
    function start() {
        garantirEstilo();
        setInterval(() => {
            instalarHooks();
            if (!window.currentUser || !ehAdmin()) return;
            garantirSino();
            const tela = document.getElementById('estoqueGestaoSystem');
            const telaAberta = tela && !tela.classList.contains('hidden');
            if (telaAberta) garantirBotaoMenu();
            // dados para a coluna "Reposição" mesmo com o motor desligado
            if (telaAberta && Date.now() - ultimaRecargaTela > 2 * 60000) {
                ultimaRecargaTela = Date.now();
                carregarDados().then(() => {
                    atualizarBadges();
                    const c = window.WTEstoqueColunas;
                    if (c && typeof c.atualizarCelulas === 'function') c.atualizarCelulas();
                });
            }
            avaliar();
        }, 3000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();

    window.EscadaAutomatica = {
        abrir, avaliar, ehAdmin,
        htmlCelula, classificacaoDoProduto, cupomDoMLB,
        // exposto para conferência/testes
        _calc: { precoComDegrau, precoComDegraus, terminarEm948, faixaDoNivel, CLASSES },
        _resolverLinha: resolverLinha
    };
})();
