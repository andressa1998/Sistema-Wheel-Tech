/* =========================================================
 * REGRAS DE EXPOSIÇÃO  (Clássico x Premium)
 *
 * Tela de configuração (mesmo layout das outras abas) com
 * seções fixas:
 *   - PRIORIDADE        (MLBs fixos sempre prevalecem)
 *   - SEM VARIAÇÕES     (estoque mínimo p/ Premium)
 *   - COM VARIAÇÕES     (critério + quando é Premium / Clássico)
 *   - FULL + LOCAL      (quem manda, limite do local)
 *   - VENDAS FULL       (histórico / restauração / recálculo)
 *
 * Armazenamento: configuracoes_sistema, chave 'regras_exposicao_v2'
 *
 * O motor é usado por nfe_manager.js -> obterAlertasExposicaoVendaNFE().
 * ========================================================= */

(function () {
    'use strict';

    const CONFIG_CHAVE = 'regras_exposicao_v2';
    const LS_CHAVE = 'wt_regras_exposicao_v2';

    // ---- config padrão ----
    const PADRAO = {
        ativo: false,
        prioridade: {
            mlbs_fixos_prevalecem: true
        },
        sem_variacoes: {
            estoque_minimo_premium: 3
        },
        com_variacoes: {
            criterio: 'individual',            // individual | soma | variacao_vendida
            premium_quantificador: 'alguma',   // alguma | todas
            premium_min: 3,
            classico_quantificador: 'todas',   // alguma | todas
            classico_max: 1
        },
        full_local: {
            prioridade: 'full',                // full | local | maior
            limite_local: 1,
            ajustar_local_auto: false
        },
        full_zerado: {
            alertar: true,
            exigir_estoque_local: true         // só alerta se houver estoque para o Local
        },
        vendas_full: {
            registrar_historico: true,
            restaurar_ao_cancelar: true,
            recalcular_exposicao: true
        },
        por_categoria: {}
    };

    let config = clonar(PADRAO);
    let carregado = false;

    function clonar(o) { return JSON.parse(JSON.stringify(o)); }

    function num(v, padrao) {
        const n = Number(v);
        return Number.isFinite(n) ? n : padrao;
    }

    // Seções que podem ser diferentes por categoria. "ativo" (liga/
    // desliga geral) e "vendas_full" valem pro sistema todo.
    function normalizarSecoes(bruto) {
        const b = (bruto && typeof bruto === 'object') ? bruto : {};
        const p = b.prioridade || {};
        const sv = b.sem_variacoes || {};
        const cv = b.com_variacoes || {};
        const fl = b.full_local || {};
        const fz = b.full_zerado || {};
        return {
            prioridade: {
                mlbs_fixos_prevalecem: p.mlbs_fixos_prevalecem !== false
            },
            sem_variacoes: {
                estoque_minimo_premium: Math.max(2, num(sv.estoque_minimo_premium, 3))
            },
            com_variacoes: {
                criterio: ['individual', 'soma', 'variacao_vendida'].includes(cv.criterio) ? cv.criterio : 'individual',
                premium_quantificador: ['alguma', 'todas'].includes(cv.premium_quantificador) ? cv.premium_quantificador : 'alguma',
                premium_min: Math.max(1, num(cv.premium_min, 3)),
                classico_quantificador: ['alguma', 'todas'].includes(cv.classico_quantificador) ? cv.classico_quantificador : 'todas',
                classico_max: Math.max(0, num(cv.classico_max, 1))
            },
            full_local: {
                prioridade: ['full', 'local', 'maior'].includes(fl.prioridade) ? fl.prioridade : 'full',
                limite_local: Math.max(0, num(fl.limite_local, 1)),
                ajustar_local_auto: fl.ajustar_local_auto === true
            },
            full_zerado: {
                alertar: fz.alertar !== false,
                exigir_estoque_local: fz.exigir_estoque_local !== false
            }
        };
    }

    function normalizar(bruto) {
        const b = (bruto && typeof bruto === 'object') ? bruto : {};
        const vf = b.vendas_full || {};

        // regras próprias por categoria: { "Gancheiras": {secoes...} }
        const porCategoria = {};
        if (b.por_categoria && typeof b.por_categoria === 'object') {
            Object.keys(b.por_categoria).forEach((cat) => {
                const nome = String(cat || '').trim();
                if (nome && b.por_categoria[cat]) porCategoria[nome] = normalizarSecoes(b.por_categoria[cat]);
            });
        }

        return {
            ativo: b.ativo === true,
            ...normalizarSecoes(b),
            vendas_full: {
                registrar_historico: vf.registrar_historico !== false,
                restaurar_ao_cancelar: vf.restaurar_ao_cancelar !== false,
                recalcular_exposicao: vf.recalcular_exposicao !== false
            },
            por_categoria: porCategoria
        };
    }

    // Config que vale pra uma categoria: as regras próprias dela (se
    // tiver) por cima das regras padrão.
    function configEfetiva(cfg, categoria) {
        const proprias = categoria && cfg.por_categoria && cfg.por_categoria[categoria];
        if (!proprias) return cfg;
        return { ...cfg, ...clonar(proprias) };
    }

    // =====================================================
    // CATEGORIA DO PRODUTO VENDIDO (pelo SKU)
    // =====================================================

    let skuCategoria = new Map();          // SKU completo -> categoria
    let skuCategoriaPrefixo = new Map();   // 8 primeiros caracteres -> categoria
    let categoriasLista = [];
    let categoriasCarregadasEm = 0;
    let carregandoCategorias = null;

    async function carregarCategoriasProdutos(forcar) {
        if (!forcar && Date.now() - categoriasCarregadasEm < 10 * 60 * 1000) return;
        if (!window.supabaseClient) return;
        if (carregandoCategorias) return carregandoCategorias;

        carregandoCategorias = (async () => {
            try {
                const porSku = new Map();
                const porPrefixo = new Map();
                const categorias = new Set();
                let inicio = 0;

                while (true) {
                    const { data, error } = await window.supabaseClient
                        .from('produtos_estoque')
                        .select('sku, categoria')
                        .range(inicio, inicio + 999);
                    if (error) throw error;
                    if (!data || !data.length) break;

                    data.forEach((p) => {
                        const cat = String(p.categoria || '').trim();
                        const sku = String(p.sku || '').trim().toUpperCase();
                        if (!cat) return;
                        categorias.add(cat);
                        if (!sku) return;
                        porSku.set(sku, cat);
                        const prefixo = sku.slice(0, 8);
                        if (!porPrefixo.has(prefixo)) porPrefixo.set(prefixo, cat);
                    });

                    if (data.length < 1000) break;
                    inicio += 1000;
                }

                skuCategoria = porSku;
                skuCategoriaPrefixo = porPrefixo;
                categoriasLista = [...categorias].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
                categoriasCarregadasEm = Date.now();
            } catch (e) {
                console.warn('⚠️ [REGRAS EXPOSIÇÃO] Não foi possível carregar categorias dos produtos:', e);
            } finally {
                carregandoCategorias = null;
            }
        })();

        return carregandoCategorias;
    }

    function categoriaDoSku(sku) {
        const s = String(sku || '').trim().toUpperCase();
        if (!s) return null;
        return skuCategoria.get(s) || skuCategoriaPrefixo.get(s.slice(0, 8)) || null;
    }

    // fatos.categoria (se vier pronta) ou a 1ª categoria dos SKUs da
    // venda que tenha regras próprias.
    function categoriaDosFatos(fatos, cfg) {
        cfg = cfg || config;
        if (fatos && fatos.categoria) return String(fatos.categoria).trim();

        // mantém o mapa atualizado sem travar a avaliação
        if (Date.now() - categoriasCarregadasEm > 10 * 60 * 1000) carregarCategoriasProdutos().catch(() => {});

        const skus = (fatos && Array.isArray(fatos.skus)) ? fatos.skus : [];
        for (const sku of skus) {
            const cat = categoriaDoSku(sku);
            if (cat && cfg.por_categoria && cfg.por_categoria[cat]) return cat;
        }
        return null;
    }

    // =====================================================
    // 30+ DIAS SEM VENDER NO FULL — REGRA MAJORITÁRIA
    //
    // MLB aberto na lista de 30+ (full_historico_30_mais_dias sem
    // data_saida, mantida pelo Full - Gerenciamento) é sempre
    // Premium, acima de qualquer outra regra — inclusive lista fixa
    // Clássico e "regras desativadas".
    // =====================================================

    let mlbs30Dias = new Set();
    let mlbs30DiasCarregadoEm = 0;
    let carregando30Dias = null;

    async function carregarMlbs30Dias(forcar) {
        if (!forcar && Date.now() - mlbs30DiasCarregadoEm < 5 * 60 * 1000) return mlbs30Dias;
        if (!window.supabaseClient) return mlbs30Dias;
        if (carregando30Dias) return carregando30Dias;

        carregando30Dias = (async () => {
            try {
                const { data, error } = await window.supabaseClient
                    .from('full_historico_30_mais_dias')
                    .select('item_id')
                    .is('data_saida', null)
                    .limit(10000);
                if (error) throw error;
                mlbs30Dias = new Set((data || []).map((r) => String(r.item_id || '').trim().toUpperCase()).filter(Boolean));
                mlbs30DiasCarregadoEm = Date.now();
            } catch (e) {
                console.warn('⚠️ [REGRAS EXPOSIÇÃO] Não foi possível carregar a lista de 30+ dias:', e);
            } finally {
                carregando30Dias = null;
            }
            return mlbs30Dias;
        })();

        return carregando30Dias;
    }

    function mlbEm30DiasSemVender(mlb) {
        // mantém a lista atualizada sem travar a avaliação
        if (Date.now() - mlbs30DiasCarregadoEm > 5 * 60 * 1000) carregarMlbs30Dias().catch(() => {});
        return mlbs30Dias.has(String(mlb || '').trim().toUpperCase());
    }

    // =====================================================
    // MOTOR
    // =====================================================

    function n(v) {
        if (v === null || v === undefined || v === '') return null;
        const x = Number(v);
        return Number.isFinite(x) ? x : null;
    }

    function porLimiar(valor, minPremium) {
        const v = n(valor);
        if (v === null || v <= 0) return null;
        return v >= minPremium ? 'premium' : 'classico';
    }

    function quantificadorCasa(quant, variacoes, comparar) {
        const casa = (v) => {
            const e = n(v && v.estoque);
            return e !== null && comparar(e);
        };
        if (quant === 'todas') return variacoes.length > 0 && variacoes.every(casa);
        return variacoes.some(casa); // 'alguma'
    }

    /**
     * fatos -> ver montarFatosRegrasEstoqueNFE() em nfe_manager.js
     *          (fatos.skus / fatos.categoria escolhem as regras da categoria)
     * retorna { casou, resultado:'classico'|'premium'|null, motivo, categoria }
     */
    function avaliar(fatos) {
        const categoria = categoriaDosFatos(fatos, config);
        const r = avaliarCom(configEfetiva(config, categoria), fatos);
        return { ...r, categoria: categoria || null };
    }

    function avaliarCom(cfg, fatos) {
        if (!fatos) return { casou: false, resultado: null, motivo: 'sem_fatos' };

        // ---- 30+ DIAS SEM VENDER: acima de tudo ----
        if (fatos.mais_30_dias_sem_vender === true || (fatos.mlb && mlbEm30DiasSemVender(fatos.mlb))) {
            return { casou: true, resultado: 'premium', motivo: '30_dias_sem_vender' };
        }

        if (!cfg.ativo) return { casou: false, resultado: null, motivo: 'desativado' };

        // ---- PRIORIDADE: MLB fixo ----
        if (
            cfg.prioridade.mlbs_fixos_prevalecem &&
            (fatos.lista_fixa === 'classico' || fatos.lista_fixa === 'premium')
        ) {
            return { casou: true, resultado: fatos.lista_fixa, motivo: 'mlb_fixo' };
        }

        const minPremium = cfg.sem_variacoes.estoque_minimo_premium;
        const temVar = fatos.tem_variacoes === true &&
            Array.isArray(fatos.variacoes) && fatos.variacoes.length > 0;

        // ---- FULL + LOCAL ----
        if (fatos.full_ativo === true && fatos.local_ativo === true) {
            const prio = cfg.full_local.prioridade;
            let base = null;
            if (prio === 'full') base = n(fatos.estoque_full);
            else if (prio === 'local') base = n(fatos.estoque_local);
            else base = Math.max(n(fatos.estoque_full) || 0, n(fatos.estoque_local) || 0);

            const r = porLimiar(base, minPremium);
            if (r) return { casou: true, resultado: r, motivo: 'full_local:' + prio };
        }

        // ---- COM VARIAÇÕES ----
        if (temVar) {
            const crit = cfg.com_variacoes.criterio;

            if (crit === 'soma') {
                const r = porLimiar(fatos.soma_variacoes, minPremium);
                if (r) return { casou: true, resultado: r, motivo: 'variacoes_soma' };
            } else if (crit === 'variacao_vendida') {
                const r = porLimiar(fatos.estoque_variacao_vendida, minPremium);
                if (r) return { casou: true, resultado: r, motivo: 'variacao_vendida' };
            } else {
                const cv = cfg.com_variacoes;
                const ehPremium = quantificadorCasa(
                    cv.premium_quantificador, fatos.variacoes, (e) => e >= cv.premium_min
                );
                if (ehPremium) return { casou: true, resultado: 'premium', motivo: 'variacoes_individual' };

                const ehClassico = quantificadorCasa(
                    cv.classico_quantificador, fatos.variacoes, (e) => e <= cv.classico_max
                );
                if (ehClassico) return { casou: true, resultado: 'classico', motivo: 'variacoes_individual' };
            }
            return { casou: false, resultado: null, motivo: 'variacoes_indefinido' };
        }

        // ---- SEM VARIAÇÕES ----
        const r = porLimiar(fatos.estoque_total, minPremium);
        if (r) return { casou: true, resultado: r, motivo: 'sem_variacoes' };

        return { casou: false, resultado: null, motivo: 'sem_base' };
    }

    // =====================================================
    // PERSISTÊNCIA
    // =====================================================

    async function carregar(forcar) {
        if (carregado && !forcar) return config;

        try {
            const local = localStorage.getItem(LS_CHAVE);
            if (local) config = normalizar(JSON.parse(local));
        } catch (e) {}

        try {
            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('configuracoes_sistema')
                    .select('valor')
                    .eq('chave', CONFIG_CHAVE)
                    .single();

                if (!error && data && data.valor) {
                    let valor = data.valor;
                    if (typeof valor === 'string') valor = JSON.parse(valor);
                    config = normalizar(valor);
                    try { localStorage.setItem(LS_CHAVE, JSON.stringify(config)); } catch (e) {}
                }
            }
        } catch (e) {
            console.warn('⚠️ [REGRAS EXPOSIÇÃO] Não foi possível carregar do Supabase:', e);
        }

        carregado = true;
        return config;
    }

    async function salvar() {
        config = normalizar(config);
        try { localStorage.setItem(LS_CHAVE, JSON.stringify(config)); } catch (e) {}

        try {
            if (window.supabaseClient) {
                const { error } = await window.supabaseClient
                    .from('configuracoes_sistema')
                    .upsert(
                        {
                            chave: CONFIG_CHAVE,
                            valor: JSON.stringify(config),
                            atualizado_em: new Date().toISOString(),
                            atualizado_por: (window.currentUser && window.currentUser.name) || 'sistema'
                        },
                        { onConflict: 'chave' }
                    );
                if (error) throw error;
            }
        } catch (e) {
            console.error('❌ [REGRAS EXPOSIÇÃO] Erro salvando:', e);
            if (typeof showToast === 'function') {
                showToast('Erro ao salvar as regras de exposição: ' + (e.message || e), 'error');
            }
            return false;
        }

        try { window.dispatchEvent(new CustomEvent('wt-regras-exposicao-atualizadas')); } catch (e) {}
        return true;
    }

    // =====================================================
    // API PÚBLICA
    // =====================================================

    window.RegrasAlertasEstoque = {
        carregar,
        salvar,
        avaliar,
        estaAtivo: () => config.ativo === true,
        // sem argumento = regras padrão; com { skus } ou { categoria }
        // = regras da categoria do produto (se ela tiver regras próprias)
        obterConfig: (fatos) => fatos ? configEfetiva(config, categoriaDosFatos(fatos, config)) : config,
        categoriaDoSku,
        mlbEm30DiasSemVender,
        carregarMlbs30Dias,
        abrirTela
    };

    const iniciar = () => {
        carregar().catch(() => {});
        // mapa SKU -> categoria (pras regras por categoria) e lista de
        // 30+ dias; espera o cliente do Supabase existir
        const tentarCategorias = () => {
            if (window.supabaseClient) {
                carregarCategoriasProdutos().catch(() => {});
                carregarMlbs30Dias().catch(() => {});
            } else setTimeout(tentarCategorias, 3000);
        };
        tentarCategorias();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }

    /* =================================================================
     * INTERFACE  (mesmo layout das outras abas)
     * ================================================================= */

    let telaEl = null;
    let rascunho = null;
    // '' = regras padrão (todas as categorias); senão, o nome da
    // categoria cujas regras estão sendo vistas/editadas
    let visaoCategoria = '';

    function css() {
        if (document.getElementById('wtRegrasExpoCss')) return;
        const s = document.createElement('style');
        s.id = 'wtRegrasExpoCss';
        s.textContent = `
        #regrasAlertaEstoqueSystem{padding-bottom:40px}
        #regrasAlertaEstoqueSystem .container{max-width:900px;margin:0 auto;padding:0 20px}
        #regrasAlertaEstoqueSystem .rex-sec{margin-bottom:26px}
        #regrasAlertaEstoqueSystem .rex-sec > h3{
            margin:0 0 4px;font-size:12px;font-weight:800;letter-spacing:1.4px;color:#7a8aa0;text-transform:uppercase}
        #regrasAlertaEstoqueSystem .rex-sec > hr{border:0;border-top:1px solid #e4e9f0;margin:0 0 16px}
        #regrasAlertaEstoqueSystem .rex-linha{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
        #regrasAlertaEstoqueSystem .rex-linha:last-child{margin-bottom:0}
        #regrasAlertaEstoqueSystem .rex-rot{font-size:14px;color:#33404f;min-width:210px}
        #regrasAlertaEstoqueSystem .rex-sub{font-size:12.5px;color:#7a8aa0;width:100%;margin-top:-6px}
        #regrasAlertaEstoqueSystem select,#regrasAlertaEstoqueSystem input[type=number]{
            border:1px solid #cdd5e0;border-radius:8px;padding:8px 10px;font-size:14px;background:#fff;color:#1c2733}
        #regrasAlertaEstoqueSystem input[type=number]{width:74px;text-align:center}
        #regrasAlertaEstoqueSystem select{min-width:230px}
        #regrasAlertaEstoqueSystem .rex-chk{display:flex;align-items:center;gap:10px;font-size:14px;color:#33404f;cursor:pointer}
        #regrasAlertaEstoqueSystem .rex-chk input{width:18px;height:18px;cursor:pointer}
        #regrasAlertaEstoqueSystem .rex-forte{font-weight:700}
        #regrasAlertaEstoqueSystem .rex-ex{background:#f5f8fc;border:1px solid #e0e8f2;border-radius:8px;
            padding:10px 14px;font-size:13px;color:#42505f;line-height:1.7;margin-top:4px}
        #regrasAlertaEstoqueSystem .rex-ex b.cl{color:#0a4da3}
        #regrasAlertaEstoqueSystem .rex-ex b.pr{color:#6b21a8}
        #regrasAlertaEstoqueSystem .rex-tag{font-weight:800;font-size:12px;padding:2px 8px;border-radius:6px}
        #regrasAlertaEstoqueSystem .rex-tag.on{background:#e3f6e8;color:#186c39}
        #regrasAlertaEstoqueSystem .rex-tag.off{background:#fdecec;color:#b23b3b}
        #regrasAlertaEstoqueSystem .rex-mini-btn{font-size:13px;padding:8px 14px;border-radius:8px;border:1px solid #cdd5e0;
            background:#f5f7fb;color:#33404f;cursor:pointer;font-weight:600}
        #regrasAlertaEstoqueSystem .rex-mini-btn:hover{background:#eaeef5}
        #regrasAlertaEstoqueSystem .rex-teste .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
        #regrasAlertaEstoqueSystem .rex-teste label{font-size:12px;display:flex;flex-direction:column;gap:4px;color:#5b6b7d}
        #regrasAlertaEstoqueSystem .rex-teste input,#regrasAlertaEstoqueSystem .rex-teste select{width:100%}
        #regrasAlertaEstoqueSystem .rex-teste-res{margin-top:14px;font-weight:800;font-size:15px}
        `;
        document.head.appendChild(s);
    }

    function garantirTela() {
        if (telaEl) return telaEl;
        telaEl = document.createElement('div');
        telaEl.id = 'regrasAlertaEstoqueSystem';
        telaEl.className = 'hidden';
        telaEl.innerHTML = `
            <header class="main-header">
                <div class="container">
                    <div class="header-content">
                        <h1 style="display:flex;align-items:center;gap:10px;">
                            <img src="logo.png" alt="Wheel Tech" style="height:35px;width:auto;">
                            <span>Regras de Exposição</span>
                        </h1>
                    </div>
                </div>
            </header>
            <div class="container" id="regrasExpoConteudo"></div>
        `;
        document.body.appendChild(telaEl);
        return telaEl;
    }

    function esconderOutrosSistemas() {
        if (typeof window.esconderTodosOsSistemas === 'function') {
            window.esconderTodosOsSistemas('regrasAlertaEstoqueSystem');
            return;
        }
        document.querySelectorAll('[id$="System"]').forEach((el) => {
            if (el.id !== 'regrasAlertaEstoqueSystem') el.classList.add('hidden');
        });
    }

    let navHookLigado = false;
    function ligarNavHook() {
        if (navHookLigado) return;
        navHookLigado = true;
        document.addEventListener('click', (e) => {
            if (!telaEl || telaEl.classList.contains('hidden')) return;
            const alvo = e.target.closest(
                '.wt-nav-item, .wt-summary-card, [onclick*="voltarParaMenu"], [onclick*="abrirSistema"], [onclick*="abrirGestao"], [onclick*="abrirPainel"], [onclick*="abrirHistorico"]'
            );
            if (!alvo) return;
            const oc = alvo.getAttribute('onclick') || '';
            if (oc.indexOf('RegrasAlertasEstoque') !== -1) return;
            telaEl.classList.add('hidden');
        }, true);
    }

    function abrirTela() {
        if (!window.currentUser) {
            if (typeof showToast === 'function') showToast('⚠️ Faça login primeiro', 'warning');
            return;
        }
        css();
        garantirTela();
        ligarNavHook();

        const u = window.currentUser || {};
        const t = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        t('regrasExpoUserName', u.name || 'Usuário');
        t('regrasExpoUserRole', u.role || '');
        t('regrasExpoUserAvatar', (u.avatar || (u.name || 'R')[0] || 'R'));

        Promise.all([
            carregar(),
            carregarCategoriasProdutos(true).catch(() => {})
        ]).then(() => {
            rascunho = normalizar(clonar(config));
            visaoCategoria = '';
            esconderOutrosSistemas();
            telaEl.classList.remove('hidden');
            window.scrollTo(0, 0);
            render();
        });
    }

    // ---------- helpers de render ----------

    function opt(pares, sel) {
        return pares.map(([v, r]) =>
            `<option value="${v}"${String(v) === String(sel) ? ' selected' : ''}>${r}</option>`).join('');
    }

    const QUANT = [['alguma', 'Pelo menos uma variação'], ['todas', 'Todas as variações']];
    const CRITERIO = [
        ['individual', 'Avaliar cada variação individualmente'],
        ['soma', 'Somar o estoque de todas as variações'],
        ['variacao_vendida', 'Usar só a variação vendida']
    ];
    const FL_PRIORIDADE = [
        ['full', 'Estoque FULL'],
        ['local', 'Estoque Local'],
        ['maior', 'O maior dos dois']
    ];

    function escHtml(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function opcoesCategoria() {
        const comRegras = Object.keys(rascunho.por_categoria || {});
        const todas = [...new Set([...categoriasLista, ...comRegras])]
            .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

        return `<option value=""${visaoCategoria === '' ? ' selected' : ''}>Todas as categorias (regras padrão)</option>` +
            todas.map((cat) =>
                `<option value="${escHtml(cat)}"${cat === visaoCategoria ? ' selected' : ''}>${escHtml(cat)}${comRegras.includes(cat) ? ' — regras próprias' : ''}</option>`
            ).join('');
    }

    function render() {
        const c = telaEl.querySelector('#regrasExpoConteudo');
        if (!c) return;
        const cat = visaoCategoria;
        const temProprias = !!(cat && rascunho.por_categoria[cat]);
        const r = cat ? configEfetiva(rascunho, cat) : rascunho;

        const infoCategoria = !cat
            ? 'Valem para todas as categorias que não têm regras próprias.'
            : temProprias
                ? `Regras próprias de <b>${escHtml(cat)}</b> — só valem para produtos desta categoria.`
                : `<b>${escHtml(cat)}</b> ainda usa as regras padrão (mostradas abaixo). Mude o que quiser e clique em Salvar para criar regras próprias desta categoria.`;

        c.innerHTML = `
        <div class="card mb-4">
            <div class="card-header">
                <h2 class="card-title"><i class="fas fa-eye"></i> Regras de Exposição</h2>
                <div class="d-flex gap-2 align-items-center">
                    <span class="rex-tag ${rascunho.ativo ? 'on' : 'off'}" id="rexStatusTag">${rascunho.ativo ? 'ATIVAS' : 'DESATIVADAS'}</span>
                    <button class="btn btn-success" id="rexSalvar"><i class="fas fa-save"></i> Salvar</button>
                </div>
            </div>

            <div class="rex-linha">
                <span class="rex-rot">Aplicar estas regras a:</span>
                <select id="rexCategoria">${opcoesCategoria()}</select>
            </div>
            <div class="rex-sub" style="margin:0 0 12px">${infoCategoria}</div>
            ${temProprias ? `
                <div class="rex-linha">
                    <button class="rex-mini-btn" id="rexRemoverCategoria"><i class="fas fa-undo"></i> Voltar a usar as regras padrão nesta categoria</button>
                </div>` : ''}

            ${!cat ? `
            <label class="rex-chk" style="margin-bottom:6px">
                <input type="checkbox" id="rexAtivo" ${r.ativo ? 'checked' : ''}>
                <span>Aplicar estas regras nos alertas de exposição da NF-e
                    <span class="rex-sub" style="margin:0">Desmarcado = comportamento antigo (1 un = Clássico, 2+ = Premium). Vale para todas as categorias.</span>
                </span>
            </label>` : ''}
        </div>

        <div class="card mb-4">
            <!-- PRIORIDADE -->
            <div class="rex-sec">
                <h3>Prioridade</h3><hr>
                <div class="rex-ex" style="margin:0 0 14px">
                    <b class="pr">30+ dias sem vender no FULL = PREMIUM</b>, acima de qualquer outra regra
                    (inclusive MLB fixo em Clássico). Anúncio finalizado não entra nessa lista.
                </div>
                <label class="rex-chk">
                    <input type="checkbox" id="rexMlbFixo" ${r.prioridade.mlbs_fixos_prevalecem ? 'checked' : ''}>
                    <span>MLBs fixos sempre prevalecem</span>
                </label>
                <div class="rex-linha" style="margin-top:12px">
                    <button class="rex-mini-btn" id="rexMlbClassico">Gerenciar MLBs Clássico</button>
                    <button class="rex-mini-btn" id="rexMlbPremium">Gerenciar MLBs Premium</button>
                </div>
            </div>

            <!-- SEM VARIAÇÕES -->
            <div class="rex-sec">
                <h3>Sem variações</h3><hr>
                <div class="rex-linha">
                    <span class="rex-rot">Estoque mínimo para Premium:</span>
                    <input type="number" min="2" id="rexMinPremium" value="${r.sem_variacoes.estoque_minimo_premium}">
                    <span>unidades</span>
                </div>
                <div class="rex-linha">
                    <span class="rex-rot">Estoque abaixo do mínimo:</span>
                    <span class="rex-forte" style="color:#0a4da3">Clássico</span>
                </div>
            </div>

            <!-- COM VARIAÇÕES -->
            <div class="rex-sec">
                <h3>Com variações</h3><hr>
                <div class="rex-linha">
                    <span class="rex-rot">Critério:</span>
                    <select id="rexCriterio">${opt(CRITERIO, r.com_variacoes.criterio)}</select>
                </div>
                <div id="rexBlocoIndividual" ${r.com_variacoes.criterio !== 'individual' ? 'hidden' : ''}>
                    <div class="rex-linha">
                        <span class="rex-rot">Premium quando:</span>
                        <select id="rexPremQuant">${opt(QUANT, r.com_variacoes.premium_quantificador)}</select>
                        <span>tiver ≥</span>
                        <input type="number" min="1" id="rexPremMin" value="${r.com_variacoes.premium_min}">
                    </div>
                    <div class="rex-linha">
                        <span class="rex-rot">Clássico quando:</span>
                        <select id="rexClasQuant">${opt(QUANT, r.com_variacoes.classico_quantificador)}</select>
                        <span>tiver ≤</span>
                        <input type="number" min="0" id="rexClasMax" value="${r.com_variacoes.classico_max}">
                    </div>
                </div>
                <div class="rex-linha" style="margin-top:4px">
                    <div class="rex-ex" id="rexExemplo"></div>
                </div>
            </div>

            <!-- FULL + LOCAL -->
            <div class="rex-sec">
                <h3>Full + Local</h3><hr>
                <div class="rex-linha">
                    <span class="rex-rot">Prioridade:</span>
                    <select id="rexFlPrioridade">${opt(FL_PRIORIDADE, r.full_local.prioridade)}</select>
                    <span class="rex-sub" style="margin:0">Quando o anúncio tem FULL e Local ao mesmo tempo, quem decide a exposição.</span>
                </div>
                <div class="rex-linha">
                    <span class="rex-rot">Limite de estoque Local quando existe FULL:</span>
                    <input type="number" min="0" id="rexLimiteLocal" value="${r.full_local.limite_local}">
                    <span>unidade(s)</span>
                </div>
                <label class="rex-chk">
                    <input type="checkbox" id="rexAjustarLocal" ${r.full_local.ajustar_local_auto ? 'checked' : ''}>
                    <span>Ajustar automaticamente estoque Local</span>
                </label>
            </div>

            <!-- FULL ZERADO -->
            <div class="rex-sec">
                <h3>Full zerado</h3><hr>
                <label class="rex-chk" style="margin-bottom:10px">
                    <input type="checkbox" id="rexFzAlertar" ${r.full_zerado.alertar ? 'checked' : ''}>
                    <span>Alertar quando <b>todas</b> as variações zeram no FULL
                        <span class="rex-sub" style="margin:0">Aviso laranja: tirar o anúncio do FULL e passar a vender pelo Local. Depois a exposição volta ao limiar normal (1 = Clássico, ≥ mínimo = Premium).</span>
                    </span>
                </label>
                <label class="rex-chk">
                    <input type="checkbox" id="rexFzExigirLocal" ${r.full_zerado.exigir_estoque_local ? 'checked' : ''}>
                    <span>Só alertar se houver estoque para o Local</span>
                </label>
            </div>

            <!-- VENDAS FULL (vale pro sistema todo — só nas regras padrão) -->
            <div class="rex-sec" ${cat ? 'hidden' : ''}>
                <h3>Vendas Full</h3><hr>
                <label class="rex-chk" style="margin-bottom:10px">
                    <input type="checkbox" id="rexVfHist" ${r.vendas_full.registrar_historico ? 'checked' : ''}>
                    <span>Registrar histórico de movimentações</span>
                </label>
                <label class="rex-chk" style="margin-bottom:10px">
                    <input type="checkbox" id="rexVfRest" ${r.vendas_full.restaurar_ao_cancelar ? 'checked' : ''}>
                    <span>Restaurar FULL ao cancelar venda</span>
                </label>
                <label class="rex-chk" style="margin-bottom:14px">
                    <input type="checkbox" id="rexVfRecalc" ${r.vendas_full.recalcular_exposicao ? 'checked' : ''}>
                    <span>Recalcular exposição após restauração</span>
                </label>
                <div class="rex-linha">
                    <button class="rex-mini-btn" id="rexVerHistFull">Ver histórico FULL</button>
                </div>
            </div>
        </div>

        <div class="card rex-teste">
            <div class="card-header"><h2 class="card-title"><i class="fas fa-flask"></i> Testar</h2></div>
            <div class="grid">
                <label>Anúncio tem variações
                    <select data-t="tem_variacoes"><option value="">-</option><option value="1">sim</option><option value="0">não</option></select></label>
                <label>Está no FULL
                    <select data-t="full_ativo"><option value="">-</option><option value="1">sim</option><option value="0">não</option></select></label>
                <label>Tem estoque local
                    <select data-t="local_ativo"><option value="">-</option><option value="1">sim</option><option value="0">não</option></select></label>
                <label>Estoque total (sem variação)
                    <input type="number" data-t="estoque_total"></label>
                <label>Estoque no FULL
                    <input type="number" data-t="estoque_full"></label>
                <label>Estoque local
                    <input type="number" data-t="estoque_local"></label>
                <label>Estoque de cada variação (vírgula)
                    <input type="text" data-t="variacoes" placeholder="ex: 1,1,3"></label>
            </div>
            <div class="rex-teste-res" id="rexTesteRes">—</div>
        </div>
        `;

        ligar();
        atualizarExemplo();
        rodarTeste();
    }

    // criarSeFaltar: numa categoria que ainda usa o padrão, só cria as
    // regras próprias dela quando a pessoa mexe em algo (não ao salvar
    // sem ter alterado nada).
    function lerRascunho(criarSeFaltar) {
        const q = (id) => telaEl.querySelector('#' + id);
        const cat = visaoCategoria;

        if (!cat) {
            if (q('rexAtivo')) rascunho.ativo = q('rexAtivo').checked;
            rascunho.vendas_full.registrar_historico = q('rexVfHist').checked;
            rascunho.vendas_full.restaurar_ao_cancelar = q('rexVfRest').checked;
            rascunho.vendas_full.recalcular_exposicao = q('rexVfRecalc').checked;
        } else if (!rascunho.por_categoria[cat]) {
            if (!criarSeFaltar) return;
            rascunho.por_categoria[cat] = normalizarSecoes(clonar(rascunho));
        }

        const r = cat ? rascunho.por_categoria[cat] : rascunho;
        r.prioridade.mlbs_fixos_prevalecem = q('rexMlbFixo').checked;
        r.sem_variacoes.estoque_minimo_premium = Math.max(2, num(q('rexMinPremium').value, 3));
        r.com_variacoes.criterio = q('rexCriterio').value;
        r.com_variacoes.premium_quantificador = q('rexPremQuant').value;
        r.com_variacoes.premium_min = Math.max(1, num(q('rexPremMin').value, 3));
        r.com_variacoes.classico_quantificador = q('rexClasQuant').value;
        r.com_variacoes.classico_max = Math.max(0, num(q('rexClasMax').value, 1));
        r.full_local.prioridade = q('rexFlPrioridade').value;
        r.full_local.limite_local = Math.max(0, num(q('rexLimiteLocal').value, 1));
        r.full_local.ajustar_local_auto = q('rexAjustarLocal').checked;
        r.full_zerado.alertar = q('rexFzAlertar').checked;
        r.full_zerado.exigir_estoque_local = q('rexFzExigirLocal').checked;
    }

    function ligar() {
        const q = (id) => telaEl.querySelector('#' + id);

        telaEl.querySelectorAll('#regrasExpoConteudo input, #regrasExpoConteudo select').forEach((el) => {
            if (el.hasAttribute('data-t')) return; // inputs do teste
            if (el.id === 'rexCategoria') return;  // troca de categoria tem handler próprio
            el.addEventListener('input', () => {
                lerRascunho(true);
                q('rexStatusTag').className = 'rex-tag ' + (rascunho.ativo ? 'on' : 'off');
                q('rexStatusTag').textContent = rascunho.ativo ? 'ATIVAS' : 'DESATIVADAS';
                const bloco = q('rexBlocoIndividual');
                const efetiva = configEfetiva(rascunho, visaoCategoria);
                if (bloco) bloco.hidden = efetiva.com_variacoes.criterio !== 'individual';
                atualizarExemplo();
                rodarTeste();
            });
        });

        // Trocar a categoria mantém o que já foi mexido nas outras (tudo
        // é salvo junto ao clicar em Salvar).
        q('rexCategoria').onchange = (e) => {
            lerRascunho(false);
            visaoCategoria = e.target.value || '';
            render();
        };

        const btnRemover = q('rexRemoverCategoria');
        if (btnRemover) {
            btnRemover.onclick = async () => {
                const cat = visaoCategoria;
                if (!cat || !confirm(`Apagar as regras próprias de "${cat}"? A categoria volta a usar as regras padrão.`)) return;
                lerRascunho(false);
                delete rascunho.por_categoria[cat];
                config = normalizar(rascunho);
                const ok = await salvar();
                if (ok) {
                    carregado = true;
                    rascunho = normalizar(clonar(config));
                    if (typeof showToast === 'function') showToast(`"${cat}" voltou a usar as regras padrão.`, 'success');
                    render();
                }
            };
        }

        q('rexSalvar').onclick = async () => {
            lerRascunho(false);
            config = normalizar(rascunho);
            const ok = await salvar();
            if (ok) {
                carregado = true;
                rascunho = normalizar(clonar(config));
                if (typeof showToast === 'function') {
                    const cat = visaoCategoria;
                    showToast(
                        !cat
                            ? 'Regras de exposição padrão salvas.'
                            : config.por_categoria[cat]
                                ? `Regras de "${cat}" salvas.`
                                : `Nada mudou em "${cat}" — ela continua usando as regras padrão.`,
                        'success'
                    );
                }
                render();
            }
        };

        const abrirMLB = () => {
            if (typeof window.abrirModalRegrasEstoque === 'function') {
                window.abrirModalRegrasEstoque();
            } else if (typeof showToast === 'function') {
                showToast('Abra a aba "Gestão de Estoque" para gerenciar os MLBs fixos.', 'info');
            }
        };
        q('rexMlbClassico').onclick = abrirMLB;
        q('rexMlbPremium').onclick = abrirMLB;

        q('rexVerHistFull').onclick = () => {
            if (typeof window.abrirSistemaFull === 'function') {
                telaEl.classList.add('hidden');
                window.abrirSistemaFull();
            } else if (typeof showToast === 'function') {
                showToast('Histórico FULL indisponível.', 'info');
            }
        };

        telaEl.querySelectorAll('[data-t]').forEach((el) => {
            el.addEventListener('input', rodarTeste);
            el.addEventListener('change', rodarTeste);
        });
    }

    function atualizarExemplo() {
        const el = telaEl.querySelector('#rexExemplo');
        if (!el) return;
        const cfg = configEfetiva(normalizar(rascunho), visaoCategoria);

        const simular = (arr) => {
            const fatos = {
                tem_variacoes: true,
                variacoes: arr.map((x) => ({ estoque: x })),
                soma_variacoes: arr.reduce((a, b) => a + b, 0),
                full_ativo: false, local_ativo: false,
                lista_fixa: 'nenhuma'
            };
            const r = avaliarCom(cfg, fatos);
            return r.casou ? (r.resultado === 'premium' ? 'PREMIUM' : 'CLÁSSICO') : 'sem decisão';
        };

        const rotular = (t) => t === 'PREMIUM'
            ? '<b class="pr">PREMIUM</b>' : (t === 'CLÁSSICO' ? '<b class="cl">CLÁSSICO</b>' : t);

        el.innerHTML = `
            Exemplo:<br>
            1 / 1 / 1 → ${rotular(simular([1, 1, 1]))}<br>
            1 / 1 / ${cfg.com_variacoes.premium_min} → ${rotular(simular([1, 1, cfg.com_variacoes.premium_min]))}
        `;
    }

    function rodarTeste() {
        const box = telaEl.querySelector('#rexTesteRes');
        if (!box) return;
        const f = { lista_fixa: 'nenhuma' };
        telaEl.querySelectorAll('[data-t]').forEach((el) => {
            const k = el.getAttribute('data-t');
            if (el.value === '') return;
            if (k === 'variacoes') {
                const arr = el.value.split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
                f.variacoes = arr.map((x) => ({ estoque: x }));
                f.tem_variacoes = arr.length > 0;
                f.soma_variacoes = arr.reduce((a, b) => a + b, 0);
                return;
            }
            if (k === 'tem_variacoes' || k === 'full_ativo' || k === 'local_ativo') f[k] = el.value === '1';
            else f[k] = Number(el.value);
        });

        const cfg = configEfetiva(normalizar(rascunho), visaoCategoria);
        const r = avaliarCom({ ...cfg, ativo: true }, f);

        if (r.casou) {
            box.textContent = '➡️ ' + (r.resultado === 'premium' ? 'PREMIUM' : 'CLÁSSICO') + '  (' + r.motivo + ')';
            box.style.color = r.resultado === 'premium' ? '#6b21a8' : '#0a4da3';
        } else {
            box.textContent = '➡️ Sem decisão → nenhum alerta de exposição';
            box.style.color = '#7a8aa0';
        }
    }

})();
