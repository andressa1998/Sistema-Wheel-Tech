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

    const ADMINS_FALLBACK = ['andressamiotto', 'ronald', 'leticia'];
    const ML_BASE = 'https://api.mercadolibre.com';

    let regrasCache = [];
    let avaliando = false;
    let ultimaAvaliacao = 0;
    let ultimoSino = 0;
    const precoMLBCache = {};   // mlb -> { preco, quando }

    // ---------- helpers ------------------------------------
    function ehAdmin() {
        const u = (window.currentUser && window.currentUser.username || '').toLowerCase();
        let admins = ADMINS_FALLBACK;
        try { if (typeof usuariosAdmin !== 'undefined' && Array.isArray(usuariosAdmin)) admins = usuariosAdmin; } catch (e) {}
        return !!u && (admins.includes(u) ||
            String(window.currentUser && window.currentUser.role || '').toLowerCase() === 'administrador');
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

    // ---------- escada ------------------------------------
    // escada: [{nivel, modo:'pct'|'fixo', valor}] do gatilho até 1
    // calcula o preço para o nível alvo a partir do preço base
    function precoNoNivel(precoBase, escada, nivelAlvo) {
        let preco = Number(precoBase) || 0;
        for (const d of escada) {
            if (d.nivel < nivelAlvo) break;   // escada vem ordenada do maior nível pro menor
            const v = Number(d.valor) || 0;
            if (d.modo === 'soma') preco = preco + v;          // R$ somado no preço da linha de cima
            else if (d.modo === 'fixo') preco = v;             // R$ absoluto (trava)
            else preco = preco * (1 + v / 100);               // %
        }
        return round2(preco);
    }
    function descreverEscada(escada) {
        if (!escada || !escada.length) return '—';
        return escada.map(d => d.modo === 'soma' ? `+${fmtBRL(d.valor)}`
            : d.modo === 'fixo' ? `=${fmtBRL(d.valor)}`
            : `${d.valor > 0 ? '+' : ''}${d.valor}%`).join(' → ');
    }

    // ---------- escopo -----------------------------------
    function lerFiltroAtual() {
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
        regrasCache = (data || []).map(r => ({ ...r, escada: Array.isArray(r.escada) ? r.escada : (r.escada ? JSON.parse(r.escada) : []) }));
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

            const produtos = getProdutos();
            let token = null;
            let houveMudanca = false;

            for (const r of regras) {
                const gatilho = r.gatilho_qtd;
                for (const p of produtos) {
                    if (!produtoNoEscopo(p, r)) continue;
                    const qtd = Number(p.quantidade) || 0;
                    const chave = r.id + '|' + String(p.id);
                    const estado = estadoDe[chave];
                    const nivelAlvo = qtd > gatilho ? null : Math.max(1, qtd);

                    // --- acima do gatilho: volta ao normal ---
                    if (nivelAlvo == null) {
                        if (estado) {
                            if (!token) token = await obterTokenML();
                            const log = [];
                            const base = estado.precos_base || {};
                            for (const mlb of Object.keys(base)) {
                                const alvo = round2(base[mlb]);
                                const res = token ? await aplicarPreco(mlb, alvo, token) : { ok: false, erro: 'sem token' };
                                log.push({ mlb, preco_novo: alvo, ok: res.ok, erro: res.erro || null, nota: 'voltou ao original' });
                            }
                            await cli.from('regras_nivel_disparos').delete().eq('id', estado.id);
                            houveMudanca = true;
                        }
                        continue;
                    }

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

                    // captura preços base na 1ª vez
                    let base = (estado && estado.precos_base && Object.keys(estado.precos_base).length) ? estado.precos_base : null;
                    if (!base) {
                        base = {};
                        for (const mlb of mlbs) {
                            const pr = token ? await precoAtualMLB(mlb, token) : null;
                            base[mlb] = pr != null ? pr : 0;
                        }
                    }

                    const log = [];
                    for (const mlb of mlbs) {
                        const b = base[mlb] != null ? base[mlb] : 0;
                        const alvo = precoNoNivel(b, r.escada, nivelAlvo);
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
        const barra = document.querySelector('#estoqueGestaoSystem .card-header .d-flex.gap-2')
            || document.querySelector('#estoqueGestaoSystem .card-header .d-flex');
        if (!barra) return;
        garantirEstilo();
        const b = document.createElement('button');
        b.id = 'btnRegrasNivelToolbar';
        b.type = 'button';
        b.className = 'btn btn-warning';
        b.title = 'Regras de nível de estoque (escada de preços)';
        b.innerHTML = `<i class="fas fa-bolt"></i> Regras de nível <span class="rn-badge" style="display:none">0</span>`;
        b.addEventListener('click', () => abrirPainel('regras'));
        barra.appendChild(b);
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
                    <button type="button" class="rn-fechar">&times;</button>
                </div>
                <div class="rn-tabs">
                    <button type="button" class="rn-tab" data-aba="regras">Regras</button>
                    <button type="button" class="rn-tab" data-aba="disparos">Disparos</button>
                </div>
                <div class="rn-corpo"></div>
            </div>`;
        ov.addEventListener('click', e => { if (e.target === ov) fechar(); });
        ov.querySelector('.rn-fechar').addEventListener('click', fechar);
        ov.querySelectorAll('.rn-tab').forEach(t => t.addEventListener('click', () => { abaAtual = t.dataset.aba; render(); }));
        document.body.appendChild(ov);
        return ov;
    }
    function fechar() { const ov = document.getElementById('rnOverlay'); if (ov) ov.classList.add('hidden'); }

    async function abrirPainel(aba) {
        if (!ehAdmin()) { toast('🔒 Só administradores.', 'warning'); return; }
        abaAtual = aba || 'regras';
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
        const escopo = lerFiltroAtual();
        const produtos = produtosDoEscopo(escopo);
        const temFiltro = temEscopo(escopo);
        if (!escadaDraft.length) escadaDraft = montarEscadaDraft(5);

        corpo.innerHTML = `
            <fieldset>
                <legend>Nova regra</legend>
                <label>Escopo — vem do que está selecionado / filtrado na tabela agora</label>
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
                    <input type="text" id="rnNomeRegra" placeholder="Nome da regra (opcional)" style="flex:1;min-width:160px;">
                    <button type="button" class="rn-btn rn-btn-primary" id="rnCriar">Criar regra</button>
                </div>
            </fieldset>

            <div id="rnPreview"></div>

            <h4 style="margin:6px 0 10px;">Regras ativas</h4>
            <div id="rnListaRegras"></div>
        `;

        renderTabelaEscada(corpo);

        corpo.querySelector('#rnGerar').addEventListener('click', () => {
            const g = Math.max(1, Math.min(60, parseInt(corpo.querySelector('#rnGatilho').value, 10) || 5));
            escadaDraft = montarEscadaDraft(g, escadaDraft);
            renderTabelaEscada(corpo);
            renderPreview(corpo, produtos);
        });
        corpo.querySelector('#rnPuxarPrecos').addEventListener('click', () => renderPreview(corpo, produtos, true));
        corpo.querySelector('#rnCriar').addEventListener('click', () => criarRegra(corpo, temFiltro));

        renderPreview(corpo, produtos);
        renderListaRegras(corpo);
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
        box.innerHTML = `<h4 style="margin:10px 0 6px;">Preview (${produtos.length} produto${produtos.length > 1 ? 's' : ''})</h4>` +
            (await Promise.all(produtos.slice(0, 40).map(async p => {
                const mlbs = mlbsDoProduto(p);
                const linhasMlb = await Promise.all(mlbs.map(async mlb => {
                    let preco = precoMLBCache[mlb] ? precoMLBCache[mlb].preco : null;
                    if (preco == null && puxar && previewToken) preco = await precoAtualMLB(mlb, previewToken);
                    const base = preco != null ? preco : null;
                    const escadaHtml = base != null
                        ? escadaDraft.map(d => `nv${d.nivel}: ${fmtBRL(precoNoNivel(base, escadaDraft, d.nivel))}`).join(' · ')
                        : '<em>clique em "Puxar preços atuais do ML"</em>';
                    return `<div class="rn-mlb" ${base != null ? `data-preco-atual="${base}"` : ''}>${esc(mlb)} — atual: ${base != null ? fmtBRL(base) : '?'}</div>
                            <div style="font-size:11px;color:#64748b;">${escadaHtml}</div>`;
                }));
                return `<details class="rn-prod">
                    <summary>${esc(p.sku || '')} · estoque ${p.quantidade} · ${esc(p.nome || '')}</summary>
                    <div class="rn-prod-body">${mlbs.length ? linhasMlb.join('') : '<em style="font-size:12px;color:#94a3b8;">sem anúncios (mlb_codes)</em>'}</div>
                </details>`;
            }))).join('');
        atualizarPrecosRef(corpo);
    }

    function renderListaRegras(corpo) {
        const lista = corpo.querySelector('#rnListaRegras');
        if (!lista) return;
        if (!regrasCache.length) { lista.innerHTML = `<div class="rn-vazio">Nenhuma regra criada.</div>`; return; }
        lista.innerHTML = regrasCache.map(r => `
            <div class="rn-regra ${r.ativo ? '' : 'off'}" data-id="${r.id}">
                <h4 style="margin:0 0 4px;font-size:14px;">${esc(r.nome || 'Regra')} — gatilho: estoque ${r.gatilho_qtd}</h4>
                <div style="font-size:12px;color:#64748b;">Escopo: ${esc(descreverEscopoObj(r))}</div>
                <div style="font-size:12px;color:#64748b;">Escada: ${esc(descreverEscada(r.escada))}</div>
                <div class="rn-acoes">
                    <button data-a="toggle">${r.ativo ? 'Pausar' : 'Ativar'}</button>
                    <button data-a="rodar">Verificar agora</button>
                    <button data-a="excluir">Excluir</button>
                </div>
            </div>`).join('');
        lista.querySelectorAll('.rn-regra').forEach(el => {
            const id = el.dataset.id;
            el.querySelectorAll('button[data-a]').forEach(b => b.addEventListener('click', () => {
                if (b.dataset.a === 'toggle') toggleRegra(id);
                else if (b.dataset.a === 'excluir') excluirRegra(id);
                else { toast('Verificando…'); avaliarRegras({ forcar: true }).then(() => { toast('Pronto.', 'success'); render(); }); }
            }));
        });
    }

    async function criarRegra(corpo, temFiltro) {
        const cli = sb();
        if (!cli) { toast('Sem conexão.', 'error'); return; }
        const escopo = lerFiltroAtual();
        if (!temEscopo(escopo) && !confirm('Nada selecionado nem filtrado — a regra vai valer para TODOS os produtos. Continuar?')) return;
        if (!escadaDraft.length) { toast('Monte a escada primeiro.', 'warning'); return; }

        const gatilho = escadaDraft[0].nivel;
        const nome = (corpo.querySelector('#rnNomeRegra').value || '').trim()
            || `${descreverEscopoObj(escopo)} · gatilho ${gatilho}`.slice(0, 90);

        const jaNoGatilho = produtosDoEscopo(escopo).filter(p => (Number(p.quantidade) || 0) <= gatilho);
        if (jaNoGatilho.length && !confirm(
            `${jaNoGatilho.length} produto(s) já estão com estoque ≤ ${gatilho}.\nAo criar a regra, os preços dos anúncios deles vão ser alterados AGORA. Confirmar?`)) return;

        const { error } = await cli.from('regras_nivel_estoque').insert([{
            nome, ativo: true,
            escopo_categoria: escopo.categoria,
            escopo_termo: escopo.termo,
            escopo_produto_ids: escopo.produto_ids,
            escopo_custo_op: escopo.custo_op, escopo_custo_valor: escopo.custo_valor,
            escopo_qtd_op: escopo.qtd_op, escopo_qtd_valor: escopo.qtd_valor,
            gatilho_qtd: gatilho,
            escada: escadaDraft.map(d => ({ nivel: d.nivel, modo: d.modo, valor: Number(d.valor) || 0 })),
            criado_por: (window.currentUser && window.currentUser.name) || 'admin'
        }]);
        if (error) { toast('Erro ao criar: ' + error.message, 'error'); return; }
        toast('✅ Regra criada. Verificando os produtos…', 'success');
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

    async function renderDisparos(corpo) {
        const cli = sb();
        corpo.innerHTML = `<div class="rn-vazio">Carregando…</div>`;
        const { data, error } = await cli.from('regras_nivel_disparos').select('*').order('atualizado_em', { ascending: false }).limit(200);
        if (error) { corpo.innerHTML = `<div class="rn-vazio">Erro ao carregar.</div>`; return; }
        const lista = data || [];
        if (!lista.length) { corpo.innerHTML = `<div class="rn-vazio">Nenhum produto entrou em regra ainda.</div>`; return; }
        const temNaoVisto = lista.some(d => !d.visto);
        corpo.innerHTML = `
            ${temNaoVisto ? `<button type="button" class="rn-btn rn-btn-sec" id="rnMarcarVistos" style="margin-bottom:12px;">Marcar todos como vistos</button>` : ''}
            ${lista.map(d => {
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
    }

    // ---------- hooks ----------------------------------
    function instalarHooks() {
        if (!window.__rnMovPatched && typeof window.registrarMovimentacao === 'function') {
            window.__rnMovPatched = true;
            const _mov = window.registrarMovimentacao;
            window.registrarMovimentacao = async function (produtoId, tipo) {
                const r = await _mov.apply(this, arguments);
                if (tipo && tipo !== 'entrada' && ehAdmin()) setTimeout(() => avaliarRegras({ forcar: true }), 1500);
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
            const sistema = document.getElementById('estoqueGestaoSystem');
            if (sistema && !sistema.classList.contains('hidden')) {
                garantirBotaoToolbar();
                if (getProdutos().length) avaliarRegras();
            }
        }, 3000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();

    window.RegrasNivelEstoque = { abrir: abrirPainel, avaliar: avaliarRegras, ehAdmin };
    window.abrirRegrasNivelEstoque = () => abrirPainel('regras');
})();
