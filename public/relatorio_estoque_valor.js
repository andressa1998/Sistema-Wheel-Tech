/* ============================================================
   WHEEL TECH · Relatório: quanto vale o estoque (a preço de custo)
   (SÓ andressamiotto / ronald — dentro da Precificação inteligente)
   ------------------------------------------------------------
   Valor em estoque = quantidade × custo. Visões:
     - Resumo         (totais, custo exato x estimado, por categoria)
     - Por categoria  (com % do total; clique abre os produtos)
     - Por produto    (ordenável, com busca)
     - Por período    (evolução do valor em estoque + entradas/saídas em R$)
   Filtros: data de referência ("posição em"), categorias, busca,
   custo base (último / médio), incluir custo estimado, só com estoque.
   Posição em data passada = reconstruída pelas movimentações de estoque
   (saldo depois de cada movimentação), com o custo vigente na data
   (histórico de custos do produto). Confiável desde a 1ª movimentação
   registrada (abr/2026).
   ============================================================ */
(function () {
    'use strict';

    const USUARIOS = ['andressamiotto', 'ronald'];
    const ID = 'piRelatorioOverlay';
    const DIA_MS = 86400000;

    const f = {
        visao: 'resumo',              // resumo | categoria | produto | periodo
        dataRef: '',                  // '' = hoje
        categorias: new Set(),        // vazio = todas
        busca: '',
        custoBase: 'ultimo',          // ultimo | medio
        incluirEstimado: true,
        soComEstoque: true,
        de: '', ate: '',
        granularidade: 'mes',         // dia | semana | mes
        ordemCol: 'valor', ordemDir: -1,
        pagina: 1
    };

    let movs = null;                  // Map produto_id -> [{t, tipo, qtd, saldo}]
    let carregandoMovs = null;
    let primeiraMov = null;

    function usuarioOk() {
        return USUARIOS.includes(String((window.currentUser && window.currentUser.username) || '').trim().toLowerCase());
    }
    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function brl(v) {
        return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function num(v) { return (Number(v) || 0).toLocaleString('pt-BR'); }
    function pct(v) { return (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'; }
    function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function api() { return window.PrecificacaoInteligente && window.PrecificacaoInteligente.relatorio; }

    // ---------- movimentações (para posições passadas) ----------
    async function carregarMovimentos() {
        if (movs) return;
        if (carregandoMovs) return carregandoMovs;
        const cli = window.supabaseClient;
        carregandoMovs = (async () => {
            const mapa = new Map();
            let primeira = null;
            for (let ini = 0; ini < 100000; ini += 1000) {
                const { data, error } = await cli.from('estoque_movimentacoes')
                    .select('id, produto_id, tipo, quantidade, data_hora, saldo_apos')
                    .order('id', { ascending: true })
                    .range(ini, ini + 999);
                if (error) throw error;
                (data || []).forEach(m => {
                    const t = new Date(m.data_hora).getTime();
                    if (!isFinite(t)) return;
                    if (!primeira || t < primeira) primeira = t;
                    const k = String(m.produto_id);
                    if (!mapa.has(k)) mapa.set(k, []);
                    mapa.get(k).push({ t, tipo: m.tipo, qtd: Math.abs(Number(m.quantidade) || 0), saldo: m.saldo_apos === null || m.saldo_apos === undefined ? null : Number(m.saldo_apos) });
                });
                if (!data || data.length < 1000) break;
            }
            mapa.forEach(l => l.sort((a, b) => a.t - b.t));
            movs = mapa;
            primeiraMov = primeira;
        })().finally(() => { carregandoMovs = null; });
        await carregandoMovs;
    }

    // quantidade do produto no fim do dia `fim` (ms). null fim = agora (estoque atual)
    function qtdEm(p, fim) {
        const atual = Math.max(0, Number(p.quantidade) || 0);
        if (fim == null) return atual;
        const criado = p.created_at ? new Date(p.created_at).getTime() : 0;
        if (criado && criado > fim) return 0;
        const lista = movs && movs.get(String(p.id));
        if (!lista || !lista.length) return atual;
        // último movimento com t <= fim
        let lo = 0, hi = lista.length - 1, idx = -1;
        while (lo <= hi) { const m = (lo + hi) >> 1; if (lista[m].t <= fim) { idx = m; lo = m + 1; } else hi = m - 1; }
        if (idx >= 0) {
            const s = lista[idx].saldo;
            return s == null ? atual : Math.max(0, s);
        }
        // antes do primeiro movimento: saldo que existia antes dele
        const m0 = lista[0];
        if (m0.saldo == null) return atual;
        const antes = m0.tipo === 'entrada' ? m0.saldo - m0.qtd : m0.saldo + m0.qtd;
        return Math.max(0, antes);
    }

    // ---------- custo ----------
    const cacheHistorico = new Map();   // produto -> histórico de custos já ordenado
    function historicoCustos(p) {
        const h = p.historico_custos || (p.dados_extra && p.dados_extra.historico_custos);
        if (!Array.isArray(h)) return [];
        const chave = String(p.id);
        const guardado = cacheHistorico.get(chave);
        if (guardado && guardado.ref === h && guardado.tam === h.length) return guardado.lista;
        const lista = h.map(x => ({ t: new Date(x.data).getTime(), v: Number(x.valor) || 0 })).filter(x => isFinite(x.t) && x.v > 0).sort((a, b) => a.t - b.t);
        cacheHistorico.set(chave, { ref: h, tam: h.length, lista });
        return lista;
    }
    // { custo, exato } no fim do dia `fim` (null = hoje)
    function custoEm(p, fim) {
        const A = api();
        const base = f.custoBase === 'medio' ? (A.custoMedio(p) || A.ultimoCusto(p)) : (A.ultimoCusto(p) || A.custoMedio(p));
        if (fim != null && f.custoBase !== 'medio') {
            const h = historicoCustos(p);
            if (h.length) {
                let vig = null;
                for (const x of h) { if (x.t <= fim) vig = x.v; else break; }
                if (vig != null) return { custo: vig, exato: true };
                // data anterior ao primeiro custo conhecido: usa o mais antigo (melhor aproximação)
                return { custo: h[0].v, exato: true };
            }
        }
        if (base > 0) return { custo: base, exato: true };
        const e = A.estimativa(p);
        if (e && e.custo > 0) return { custo: e.custo, exato: false };
        return { custo: 0, exato: false };
    }

    function fimDoDia(dataStr) {
        if (!dataStr) return null;
        const d = new Date(dataStr + 'T23:59:59.999');
        return isFinite(d.getTime()) ? d.getTime() : null;
    }

    function hojeISO() { return iso(new Date()); }

    // ---------- linhas do relatório ----------
    function passaFiltroBasico(p) {
        if (f.categorias.size && !f.categorias.has(p.categoria || 'Sem categoria')) return false;
        const t = f.busca.trim().toLowerCase();
        if (t && ![p.nome, p.sku].some(x => String(x || '').toLowerCase().includes(t))) return false;
        return true;
    }

    function calcularLinhas(fim) {
        const A = api();
        const linhas = [];
        A.produtos().forEach(p => {
            if (!passaFiltroBasico(p)) return;
            const q = qtdEm(p, fim);
            if (f.soComEstoque && q <= 0) return;
            const c = custoEm(p, fim);
            if (!c.exato && !f.incluirEstimado) { linhas.push({ p, q, custo: 0, exato: false, valor: 0, semCusto: true, cat: p.categoria || 'Sem categoria' }); return; }
            linhas.push({ p, q, custo: c.custo, exato: c.exato, valor: q * c.custo, semCusto: c.custo <= 0, cat: p.categoria || 'Sem categoria' });
        });
        return linhas;
    }

    function totais(linhas) {
        const t = { exato: 0, estimado: 0, unidades: 0, produtos: 0, unidadesSemCusto: 0, produtosSemCusto: 0 };
        linhas.forEach(l => {
            t.unidades += l.q; t.produtos += l.q > 0 ? 1 : 0;
            if (l.semCusto) { t.unidadesSemCusto += l.q; t.produtosSemCusto += l.q > 0 ? 1 : 0; }
            else if (l.exato) t.exato += l.valor; else t.estimado += l.valor;
        });
        t.total = t.exato + (f.incluirEstimado ? t.estimado : 0);
        return t;
    }

    function porCategoria(linhas) {
        const m = new Map();
        linhas.forEach(l => {
            const c = m.get(l.cat) || { cat: l.cat, produtos: 0, unidades: 0, exato: 0, estimado: 0, semCusto: 0 };
            if (l.q > 0) c.produtos++;
            c.unidades += l.q;
            if (l.semCusto) c.semCusto += l.q > 0 ? 1 : 0;
            else if (l.exato) c.exato += l.valor; else c.estimado += l.valor;
            m.set(l.cat, c);
        });
        const lista = Array.from(m.values());
        lista.forEach(c => { c.total = c.exato + (f.incluirEstimado ? c.estimado : 0); });
        return lista.sort((a, b) => b.total - a.total);
    }

    // ---------- série por período ----------
    function limitesPeriodos() {
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        let ate = f.ate ? new Date(f.ate + 'T00:00:00') : hoje;
        let de = f.de ? new Date(f.de + 'T00:00:00') : new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
        if (de > ate) { const t = de; de = ate; ate = t; }
        const periodos = [];
        let ini = new Date(de);
        if (f.granularidade === 'mes') ini = new Date(de.getFullYear(), de.getMonth(), 1);
        if (f.granularidade === 'semana') { const dw = ini.getDay(); ini = new Date(ini.getTime() - ((dw + 6) % 7) * DIA_MS); }
        let guarda = 0;
        while (ini <= ate && guarda++ < 400) {
            let fimP;
            if (f.granularidade === 'dia') fimP = new Date(ini);
            else if (f.granularidade === 'semana') fimP = new Date(ini.getTime() + 6 * DIA_MS);
            else fimP = new Date(ini.getFullYear(), ini.getMonth() + 1, 0);
            const inicioEfetivo = ini < de ? de : ini;
            const fimEfetivo = fimP > ate ? ate : fimP;
            periodos.push({ ini: new Date(inicioEfetivo), fim: new Date(fimEfetivo), cheioIni: new Date(ini) });
            ini = f.granularidade === 'dia' ? new Date(ini.getTime() + DIA_MS)
                : f.granularidade === 'semana' ? new Date(ini.getTime() + 7 * DIA_MS)
                    : new Date(ini.getFullYear(), ini.getMonth() + 1, 1);
        }
        return periodos;
    }

    function rotuloPeriodo(pe) {
        const d = x => x.toLocaleDateString('pt-BR');
        if (f.granularidade === 'dia') return d(pe.ini);
        if (f.granularidade === 'mes') return pe.ini.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        return d(pe.ini) + ' a ' + d(pe.fim);
    }

    function calcularSerie() {
        const A = api();
        const periodos = limitesPeriodos();
        const produtos = A.produtos().filter(passaFiltroBasico);
        const hoje = new Date(); hoje.setHours(23, 59, 59, 999);
        const linhas = periodos.map(pe => ({ pe, valor: 0, unidades: 0, entradas: 0, saidas: 0, entradasUn: 0, saidasUn: 0 }));

        linhas.forEach(l => {
            const fim = new Date(l.pe.fim); fim.setHours(23, 59, 59, 999);
            const usarAtual = fim.getTime() >= hoje.getTime() - 1000;
            produtos.forEach(p => {
                const q = qtdEm(p, usarAtual ? null : fim.getTime());
                if (q <= 0) return;
                const c = custoEm(p, usarAtual ? null : fim.getTime());
                if (!c.exato && !f.incluirEstimado) return;
                l.valor += q * c.custo; l.unidades += q;
            });
        });

        // entradas e saídas em R$ (custo vigente no dia do movimento)
        produtos.forEach(p => {
            const lista = movs && movs.get(String(p.id));
            if (!lista) return;
            lista.forEach(m => {
                const l = linhas.find(x => m.t >= x.pe.ini.getTime() && m.t <= x.pe.fim.getTime() + DIA_MS - 1);
                if (!l) return;
                const c = custoEm(p, m.t);
                if (!c.exato && !f.incluirEstimado) return;
                const v = m.qtd * c.custo;
                if (m.tipo === 'entrada') { l.entradas += v; l.entradasUn += m.qtd; } else { l.saidas += v; l.saidasUn += m.qtd; }
            });
        });
        return linhas;
    }

    // ---------- interface ----------
    function garantirEstilo() {
        if (document.getElementById('piRelEstilo')) return;
        const st = document.createElement('style');
        st.id = 'piRelEstilo';
        st.textContent = `
            #${ID}{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:100000;display:flex;align-items:center;justify-content:center;}
            #${ID}.hidden{display:none;}
            #${ID} .rel-box{background:#fff;width:min(1250px,96vw);height:92vh;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);}
            #${ID} .rel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 20px;border-bottom:1px solid #eef0f4;}
            #${ID} .rel-head h3{margin:0;font-size:18px;}
            #${ID} .rel-filtros{padding:10px 20px;border-bottom:1px solid #eef0f4;display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#f8fafc;}
            #${ID} .rel-filtros label{font-size:12px;color:#64748b;margin:0;}
            #${ID} .rel-filtros .form-control{height:34px;width:auto;}
            #${ID} .rel-tabs{display:flex;gap:6px;padding:10px 20px 0;}
            #${ID} .rel-tab{border:1px solid #d9dee7;background:#f6f7f9;border-radius:999px;padding:6px 16px;cursor:pointer;font-size:13px;color:#475569;}
            #${ID} .rel-tab.ativa{background:#0d6efd;border-color:#0d6efd;color:#fff;font-weight:600;}
            #${ID} .rel-corpo{flex:1;overflow:auto;padding:16px 20px;}
            #${ID} .rel-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px;}
            #${ID} .rel-card{border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;background:#fff;}
            #${ID} .rel-card small{color:#64748b;display:block;}
            #${ID} .rel-card strong{font-size:20px;display:block;margin-top:2px;}
            #${ID} .rel-card.destaque{background:#0d6efd;color:#fff;border-color:#0d6efd;}
            #${ID} .rel-card.destaque small{color:#dbeafe;}
            #${ID} table{font-size:13px;}
            #${ID} th{white-space:nowrap;cursor:pointer;user-select:none;}
            #${ID} th.sem{cursor:default;}
            #${ID} .rel-barra{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;min-width:90px;}
            #${ID} .rel-barra span{display:block;height:100%;background:#0d6efd;}
            #${ID} .rel-est{color:#7c3aed;font-style:italic;}
            #${ID} .rel-aviso{font-size:12px;color:#64748b;margin:8px 0;}
            #${ID} .rel-dd{position:relative;display:inline-block;}
            #${ID} .rel-dd-btn{height:34px;min-width:210px;text-align:left;background:#fff;border:1px solid #ced4da;border-radius:6px;padding:0 12px;font-size:14px;display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;}
            #${ID} .rel-dd-btn.aberto{border-color:#0d6efd;box-shadow:0 0 0 3px rgba(13,110,253,.15);}
            #${ID} .rel-dd-painel{position:absolute;top:38px;left:0;z-index:20;width:290px;background:#fff;border:1px solid #d9dee7;border-radius:10px;box-shadow:0 12px 32px rgba(15,23,42,.18);padding:8px;}
            #${ID} .rel-dd-painel.hidden{display:none;}
            #${ID} .rel-dd-lista{max-height:260px;overflow:auto;margin:8px 0;}
            #${ID} .rel-dd-item{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;cursor:pointer;font-size:13px;margin:0;}
            #${ID} .rel-dd-item:hover{background:#f1f5f9;}
            #${ID} .rel-dd-acoes{display:flex;justify-content:space-between;border-top:1px solid #eef0f4;padding-top:6px;}
            #${ID} .rel-graficos{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:16px;margin-bottom:18px;}
            #${ID} .rel-grafico{border:1px solid #e2e8f0;border-radius:16px;padding:16px 18px 10px;background:linear-gradient(180deg,#fff,#f8fafc);box-shadow:0 2px 10px rgba(15,23,42,.05);}
            #${ID} .rel-grafico h6{margin:0 0 2px;font-size:15px;font-weight:700;color:#0f172a;}
            #${ID} .rel-grafico .sub{font-size:12px;color:#64748b;margin-bottom:12px;}
            #${ID} .rel-topo{display:grid;grid-template-columns:26px minmax(90px,1.2fr) 3fr;align-items:center;gap:10px;margin-bottom:10px;}
            #${ID} .rel-rank{width:24px;height:24px;border-radius:50%;background:#e2e8f0;color:#334155;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;}
            #${ID} .rel-topo:nth-child(3) .rel-rank{background:#fde68a;color:#92400e;}
            #${ID} .rel-topo-nome{font-size:12.5px;line-height:1.25;color:#1e293b;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
            #${ID} .rel-topo-nome small{display:block;color:#94a3b8;font-size:11px;}
            #${ID} .rel-trilho{height:26px;background:#eef2f7;border-radius:13px;position:relative;overflow:hidden;}
            #${ID} .rel-preenche{height:100%;border-radius:13px;display:flex;align-items:center;justify-content:flex-end;padding-right:10px;min-width:64px;box-sizing:border-box;color:#fff;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:inset 0 -3px 0 rgba(0,0,0,.08);animation:relCresce .7s ease-out;}
            #${ID} .rel-preenche.qtd{background:linear-gradient(90deg,#38bdf8,#2563eb);}
            #${ID} .rel-preenche.valor{background:linear-gradient(90deg,#34d399,#059669);}
            @keyframes relCresce{from{width:0 !important;}}
        `;
        document.head.appendChild(st);
    }

    function montar() {
        let ov = document.getElementById(ID);
        if (ov) return ov;
        garantirEstilo();
        ov = document.createElement('div');
        ov.id = ID;
        ov.className = 'hidden';
        ov.innerHTML = `
            <div class="rel-box" role="dialog" aria-modal="true">
                <div class="rel-head">
                    <h3><i class="fas fa-sack-dollar"></i> Relatório — quanto vale o estoque (a preço de custo)</h3>
                    <div class="d-flex gap-2">
                        <button type="button" class="btn btn-success btn-sm" id="relExcel"><i class="fas fa-file-excel"></i> Exportar Excel</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" id="relImprimir"><i class="fas fa-print"></i> Imprimir</button>
                        <button type="button" class="btn btn-secondary btn-sm" id="relFechar">&times; Fechar</button>
                    </div>
                </div>
                <div class="rel-tabs">
                    <button type="button" class="rel-tab" data-visao="resumo">Resumo</button>
                    <button type="button" class="rel-tab" data-visao="categoria">Por categoria</button>
                    <button type="button" class="rel-tab" data-visao="produto">Por produto</button>
                    <button type="button" class="rel-tab" data-visao="periodo">Por período</button>
                </div>
                <div class="rel-filtros" id="relFiltros"></div>
                <div class="rel-corpo" id="relCorpo"></div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) fechar(); });
        ov.querySelector('#relFechar').addEventListener('click', fechar);
        ov.querySelector('#relExcel').addEventListener('click', exportarExcel);
        ov.querySelector('#relImprimir').addEventListener('click', imprimir);
        ov.querySelectorAll('.rel-tab').forEach(b => b.addEventListener('click', () => { f.visao = b.dataset.visao; f.pagina = 1; desenhar(); }));
        return ov;
    }

    function fechar() { document.getElementById(ID)?.classList.add('hidden'); }

    function desenharFiltros() {
        const el = document.getElementById('relFiltros');
        const periodo = f.visao === 'periodo';
        el.innerHTML = `
            ${htmlDropdownCategorias()}
            ${periodo ? `
                <label>De</label><input type="date" class="form-control" id="relDe" value="${esc(f.de)}">
                <label>Até</label><input type="date" class="form-control" id="relAte" value="${esc(f.ate)}" max="${hojeISO()}">
                <label>Agrupar por</label>
                <select class="form-control" id="relGran">
                    <option value="dia"${f.granularidade === 'dia' ? ' selected' : ''}>Dia</option>
                    <option value="semana"${f.granularidade === 'semana' ? ' selected' : ''}>Semana</option>
                    <option value="mes"${f.granularidade === 'mes' ? ' selected' : ''}>Mês</option>
                </select>
                <button type="button" class="btn btn-outline-secondary btn-sm" data-atalho="30">Últimos 30 dias</button>
                <button type="button" class="btn btn-outline-secondary btn-sm" data-atalho="90">3 meses</button>
                <button type="button" class="btn btn-outline-secondary btn-sm" data-atalho="180">6 meses</button>
                <button type="button" class="btn btn-outline-secondary btn-sm" data-atalho="max">Tudo</button>
            ` : `
                <label>Posição em</label>
                <input type="date" class="form-control" id="relDataRef" value="${esc(f.dataRef)}" max="${hojeISO()}" title="Vazio = estoque de hoje">
                <button type="button" class="btn btn-outline-secondary btn-sm" id="relHoje">Hoje</button>
                <button type="button" class="btn btn-outline-secondary btn-sm" data-ref="-30">30 dias atrás</button>
                <button type="button" class="btn btn-outline-secondary btn-sm" data-ref="-90">90 dias atrás</button>
                <button type="button" class="btn btn-outline-secondary btn-sm" data-ref="mes">Fim do mês passado</button>
            `}
            <input type="text" class="form-control" id="relBusca" placeholder="🔍 Produto ou SKU..." value="${esc(f.busca)}" style="min-width:200px;">
            <label>Custo</label>
            <select class="form-control" id="relCustoBase">
                <option value="ultimo"${f.custoBase === 'ultimo' ? ' selected' : ''}>Último custo</option>
                <option value="medio"${f.custoBase === 'medio' ? ' selected' : ''}>Custo médio</option>
            </select>
            <label><input type="checkbox" id="relEstimado" ${f.incluirEstimado ? 'checked' : ''}> incluir custo estimado</label>
            <label><input type="checkbox" id="relSoEstoque" ${f.soComEstoque ? 'checked' : ''}> só com estoque</label>
        `;
        const l = (id, ev, fn) => { const x = el.querySelector('#' + id); if (x) x.addEventListener(ev, fn); };
        let temporizador = null;
        l('relBusca', 'input', e => { clearTimeout(temporizador); const v = e.target.value; temporizador = setTimeout(() => { f.busca = v; f.pagina = 1; desenharCorpo(); }, 250); });
        ligarDropdownCategorias(el);
        l('relCustoBase', 'change', e => { f.custoBase = e.target.value; desenharCorpo(); });
        l('relEstimado', 'change', e => { f.incluirEstimado = e.target.checked; desenharCorpo(); });
        l('relSoEstoque', 'change', e => { f.soComEstoque = e.target.checked; desenharCorpo(); });
        l('relDataRef', 'change', e => { f.dataRef = e.target.value; desenharCorpo(); });
        l('relHoje', 'click', () => { f.dataRef = ''; desenhar(); });
        el.querySelectorAll('[data-ref]').forEach(b => b.addEventListener('click', () => {
            const hoje = new Date();
            if (b.dataset.ref === 'mes') f.dataRef = iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0));
            else f.dataRef = iso(new Date(hoje.getTime() + Number(b.dataset.ref) * DIA_MS));
            desenhar();
        }));
        l('relDe', 'change', e => { f.de = e.target.value; desenharCorpo(); });
        l('relAte', 'change', e => { f.ate = e.target.value; desenharCorpo(); });
        l('relGran', 'change', e => { f.granularidade = e.target.value; desenharCorpo(); });
        el.querySelectorAll('[data-atalho]').forEach(b => b.addEventListener('click', () => {
            const hoje = new Date(); f.ate = iso(hoje);
            if (b.dataset.atalho === 'max') f.de = primeiraMov ? iso(new Date(primeiraMov)) : iso(new Date(hoje.getTime() - 180 * DIA_MS));
            else f.de = iso(new Date(hoje.getTime() - Number(b.dataset.atalho) * DIA_MS));
            f.granularidade = Number(b.dataset.atalho) <= 30 ? 'dia' : (Number(b.dataset.atalho) <= 90 ? 'semana' : 'mes');
            desenhar();
        }));
    }

    // ---------- categorias: lista suspensa com busca e caixas de seleção ----------
    function todasCategorias() {
        return [...new Set(api().produtos().map(p => p.categoria || 'Sem categoria'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }
    function rotuloCategorias() {
        if (!f.categorias.size) return 'Todas as categorias';
        if (f.categorias.size === 1) return Array.from(f.categorias)[0];
        return f.categorias.size + ' categorias';
    }
    function htmlDropdownCategorias() {
        return `<div class="rel-dd" id="relDd">
            <button type="button" class="rel-dd-btn" id="relDdBtn"><span>${esc(rotuloCategorias())}</span><i class="fas fa-chevron-down" style="font-size:11px;color:#64748b;"></i></button>
            <div class="rel-dd-painel hidden" id="relDdPainel">
                <input type="text" class="form-control" id="relDdBusca" placeholder="🔍 Buscar categoria..." style="height:32px;">
                <div class="rel-dd-lista" id="relDdLista"></div>
                <div class="rel-dd-acoes">
                    <button type="button" class="btn btn-sm btn-link" id="relDdTodas">Todas</button>
                    <button type="button" class="btn btn-sm btn-primary" id="relDdOk">Aplicar</button>
                </div>
            </div>
        </div>`;
    }
    function ligarDropdownCategorias(el) {
        const btn = el.querySelector('#relDdBtn'), painel = el.querySelector('#relDdPainel'), lista = el.querySelector('#relDdLista'), busca = el.querySelector('#relDdBusca');
        if (!btn) return;
        let rascunho = new Set(f.categorias);
        const cats = todasCategorias();
        const desenharLista = () => {
            const t = busca.value.trim().toLowerCase();
            lista.innerHTML = cats.filter(c => !t || c.toLowerCase().includes(t)).map(c =>
                `<label class="rel-dd-item"><input type="checkbox" data-c="${esc(c)}" ${rascunho.has(c) ? 'checked' : ''}> ${esc(c)}</label>`).join('') ||
                '<div class="text-muted" style="padding:8px;font-size:13px;">Nenhuma categoria.</div>';
        };
        const abrirPainel = aberto => {
            painel.classList.toggle('hidden', !aberto);
            btn.classList.toggle('aberto', aberto);
            if (aberto) { rascunho = new Set(f.categorias); busca.value = ''; desenharLista(); busca.focus(); }
        };
        const aplicar = () => {
            f.categorias = new Set(rascunho);
            f.pagina = 1;
            btn.querySelector('span').textContent = rotuloCategorias();
            abrirPainel(false);
            desenharCorpo();
        };
        btn.addEventListener('click', e => { e.stopPropagation(); abrirPainel(painel.classList.contains('hidden')); });
        painel.addEventListener('click', e => e.stopPropagation());
        busca.addEventListener('input', desenharLista);
        lista.addEventListener('change', e => {
            const c = e.target.dataset && e.target.dataset.c;
            if (!c) return;
            if (e.target.checked) rascunho.add(c); else rascunho.delete(c);
        });
        el.querySelector('#relDdTodas').addEventListener('click', () => { rascunho.clear(); desenharLista(); });
        el.querySelector('#relDdOk').addEventListener('click', aplicar);
        // fecha ao clicar fora
        const fora = () => { if (!painel.classList.contains('hidden')) aplicar(); };
        const overlay = document.getElementById(ID);
        if (overlay && !overlay.__ddFora) { overlay.__ddFora = true; overlay.addEventListener('click', () => { const p = document.getElementById('relDdPainel'); if (p && !p.classList.contains('hidden')) document.getElementById('relDdOk').click(); }); }
    }

    function cardsHtml(t, fim) {
        const posicao = fim == null ? 'hoje' : new Date(fim).toLocaleDateString('pt-BR');
        return `<div class="rel-cards">
            <div class="rel-card destaque"><small>Valor em estoque (${f.incluirEstimado ? 'exato + estimado' : 'só custo exato'}) · posição ${esc(posicao)}</small><strong>${brl(t.total)}</strong></div>
            <div class="rel-card"><small>Com custo exato</small><strong>${brl(t.exato)}</strong></div>
            <div class="rel-card"><small>Com custo estimado ${f.incluirEstimado ? '' : '(desligado)'}</small><strong class="rel-est">${brl(t.estimado)}</strong></div>
            <div class="rel-card"><small>Unidades em estoque</small><strong>${num(t.unidades)}</strong></div>
            <div class="rel-card"><small>Produtos com estoque</small><strong>${num(t.produtos)}</strong></div>
            <div class="rel-card"><small>Sem custo nenhum (fora do valor)</small><strong>${num(t.produtosSemCusto)} produtos · ${num(t.unidadesSemCusto)} un.</strong></div>
        </div>`;
    }

    // Top 5 produtos: por quantidade em estoque e por valor em estoque
    function graficosTop5(linhas) {
        const barras = (lista, campo, classe, formatar, vazio) => {
            if (!lista.length) return `<div class="text-muted" style="padding:16px;">${vazio}</div>`;
            const max = Math.max(...lista.map(l => l[campo]), 1);
            return lista.map((l, i) => `
                <div class="rel-topo">
                    <div class="rel-rank">${i + 1}</div>
                    <div class="rel-topo-nome" title="${esc(l.p.nome)}">${esc(l.p.nome)}<small>${esc(l.p.sku)} · ${esc(l.cat)}</small></div>
                    <div class="rel-trilho"><div class="rel-preenche ${classe}" style="width:${Math.max(8, l[campo] / max * 100)}%">${formatar(l)}</div></div>
                </div>`).join('');
        };
        const porQtd = linhas.filter(l => l.q > 0).sort((a, b) => b.q - a.q).slice(0, 5);
        const porValor = linhas.filter(l => l.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 5);
        return `<div class="rel-graficos">
            <div class="rel-grafico">
                <h6>📦 Top 5 — mais unidades em estoque</h6>
                <div class="sub">Produtos com maior quantidade parada</div>
                ${barras(porQtd, 'q', 'qtd', l => num(l.q) + ' un.', 'Nenhum produto com estoque.')}
            </div>
            <div class="rel-grafico">
                <h6>💰 Top 5 — mais dinheiro em estoque</h6>
                <div class="sub">Quantidade × custo${f.incluirEstimado ? ' (inclui custo estimado)' : ' (só custo exato)'}</div>
                ${barras(porValor, 'valor', 'valor', l => (l.exato ? '' : '≈ ') + brl(l.valor), 'Nenhum produto com custo.')}
            </div>
        </div>`;
    }

    function tabelaCategorias(cats, totalGeral, comLink) {
        return `<div class="table-responsive"><table class="table table-sm table-hover">
            <thead><tr><th class="sem">Categoria</th><th class="sem text-right">Produtos</th><th class="sem text-right">Unidades</th><th class="sem text-right">Custo exato</th><th class="sem text-right">Estimado</th><th class="sem text-right">Total</th><th class="sem">% do total</th></tr></thead>
            <tbody>${cats.map(c => `<tr>
                <td>${comLink ? `<a href="#" data-abrir-cat="${esc(c.cat)}">${esc(c.cat)}</a>` : esc(c.cat)}</td>
                <td class="text-right">${num(c.produtos)}</td><td class="text-right">${num(c.unidades)}</td>
                <td class="text-right">${brl(c.exato)}</td><td class="text-right rel-est">${brl(c.estimado)}</td>
                <td class="text-right"><strong>${brl(c.total)}</strong></td>
                <td><div class="rel-barra"><span style="width:${totalGeral ? Math.min(100, c.total / totalGeral * 100) : 0}%"></span></div><small>${totalGeral ? pct(c.total / totalGeral) : '—'}</small></td>
            </tr>`).join('') || '<tr><td colspan="7" class="text-center text-muted">Nada encontrado.</td></tr>'}</tbody></table></div>`;
    }

    function ordenarLinhas(linhas) {
        const k = {
            nome: l => String(l.p.nome || '').toLowerCase(), sku: l => String(l.p.sku || '').toLowerCase(),
            cat: l => l.cat.toLowerCase(), q: l => l.q, custo: l => l.custo, valor: l => l.valor
        }[f.ordemCol] || (l => l.valor);
        return linhas.slice().sort((a, b) => { const x = k(a), y = k(b); return x < y ? -f.ordemDir : x > y ? f.ordemDir : 0; });
    }

    function graficoLinha(serie) {
        const w = 900, h = 220, pad = 40;
        const max = Math.max(1, ...serie.map(s => s.valor));
        const n = serie.length;
        const x = i => pad + (n === 1 ? (w - 2 * pad) / 2 : i * (w - 2 * pad) / (n - 1));
        const y = v => h - pad - (v / max) * (h - 2 * pad);
        const pts = serie.map((s, i) => `${x(i)},${y(s.valor)}`).join(' ');
        return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;max-height:240px;background:#f8fafc;border-radius:10px;">
            <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#cbd5e1"/>
            <text x="${pad}" y="16" font-size="11" fill="#64748b">${esc(brl(max))}</text>
            <polyline points="${pts}" fill="none" stroke="#0d6efd" stroke-width="2.5"/>
            ${serie.map((s, i) => `<circle cx="${x(i)}" cy="${y(s.valor)}" r="3.5" fill="#0d6efd"><title>${esc(rotuloPeriodo(s.pe))}: ${esc(brl(s.valor))}</title></circle>`).join('')}
        </svg>`;
    }

    function desenharCorpo() {
        const corpo = document.getElementById('relCorpo');
        if (!corpo) return;
        const fim = f.visao === 'periodo' ? null : fimDoDia(f.dataRef);
        const aviso = (fim != null && primeiraMov && fim < primeiraMov)
            ? `<div class="alert alert-warning py-1 rel-aviso">Antes de ${new Date(primeiraMov).toLocaleDateString('pt-BR')} (primeira movimentação registrada) a posição é aproximada.</div>` : '';

        if (f.visao === 'periodo') {
            const serie = calcularSerie();
            const semPeriodo = !serie.length;
            corpo.innerHTML = semPeriodo ? '<p class="text-muted">Escolha um período.</p>' : `
                ${graficoLinha(serie)}
                <div class="table-responsive mt-3"><table class="table table-sm table-hover">
                    <thead><tr><th class="sem">Período</th><th class="sem text-right">Valor em estoque (fim)</th><th class="sem text-right">Unidades (fim)</th><th class="sem text-right">Entradas (R$)</th><th class="sem text-right">Saídas / baixas (R$)</th><th class="sem text-right">Variação</th></tr></thead>
                    <tbody>${serie.map((s, i) => {
                        const ant = i > 0 ? serie[i - 1].valor : null;
                        const varr = ant == null ? null : s.valor - ant;
                        return `<tr><td>${esc(rotuloPeriodo(s.pe))}</td><td class="text-right"><strong>${brl(s.valor)}</strong></td><td class="text-right">${num(s.unidades)}</td>
                            <td class="text-right" style="color:#198754;">+ ${brl(s.entradas)} <small class="text-muted">(${num(s.entradasUn)} un.)</small></td>
                            <td class="text-right" style="color:#dc3545;">− ${brl(s.saidas)} <small class="text-muted">(${num(s.saidasUn)} un.)</small></td>
                            <td class="text-right" style="color:${varr == null ? '#94a3b8' : varr >= 0 ? '#198754' : '#dc3545'};">${varr == null ? '—' : (varr >= 0 ? '+ ' : '− ') + brl(Math.abs(varr))}</td></tr>`;
                    }).join('')}</tbody></table></div>
                <div class="rel-aviso">Valor em estoque = saldo do produto no fim do período × custo vigente naquela data. Entradas e saídas usam o custo do dia do movimento (as saídas incluem vendas, envios FULL e ajustes de baixa). O histórico começa na primeira movimentação registrada (${primeiraMov ? new Date(primeiraMov).toLocaleDateString('pt-BR') : '—'}).</div>`;
            return;
        }

        const linhas = calcularLinhas(fim);
        const t = totais(linhas);
        const cats = porCategoria(linhas);

        if (f.visao === 'resumo') {
            corpo.innerHTML = aviso + cardsHtml(t, fim) + graficosTop5(linhas) + '<h6>Distribuição por categoria</h6>' + tabelaCategorias(cats.slice(0, 12), t.total, true);
        } else if (f.visao === 'categoria') {
            corpo.innerHTML = aviso + cardsHtml(t, fim) + tabelaCategorias(cats, t.total, true) +
                '<div class="rel-aviso">Clique no nome de uma categoria para ver os produtos dela.</div>';
        } else {
            const ord = ordenarLinhas(linhas);
            const porPag = 100, paginas = Math.max(1, Math.ceil(ord.length / porPag));
            if (f.pagina > paginas) f.pagina = paginas;
            corpo.innerHTML = aviso + cardsHtml(t, fim) + tabelaProdutos(ord.slice((f.pagina - 1) * porPag, f.pagina * porPag), true) +
                (paginas > 1 ? `<div class="d-flex justify-content-center align-items-center gap-2 my-2">
                    <button class="btn btn-sm btn-outline-secondary" data-pag="${f.pagina - 1}" ${f.pagina <= 1 ? 'disabled' : ''}>‹</button>
                    <small>Página ${f.pagina} de ${paginas} (${num(ord.length)} produtos)</small>
                    <button class="btn btn-sm btn-outline-secondary" data-pag="${f.pagina + 1}" ${f.pagina >= paginas ? 'disabled' : ''}>›</button></div>` : '');
        }

        corpo.querySelectorAll('[data-abrir-cat]').forEach(a => a.addEventListener('click', e => {
            e.preventDefault();
            f.categorias = new Set([a.dataset.abrirCat]);
            f.visao = 'produto'; f.pagina = 1;
            desenhar();
        }));
        corpo.querySelectorAll('th[data-col]').forEach(th => th.addEventListener('click', () => {
            if (f.ordemCol === th.dataset.col) f.ordemDir *= -1; else { f.ordemCol = th.dataset.col; f.ordemDir = th.dataset.col === 'nome' || th.dataset.col === 'sku' || th.dataset.col === 'cat' ? 1 : -1; }
            desenharCorpo();
        }));
        corpo.querySelectorAll('[data-pag]').forEach(b => b.addEventListener('click', () => { f.pagina = Number(b.dataset.pag); desenharCorpo(); }));
    }

    function tabelaProdutos(linhas, ordenavel) {
        const seta = c => ordenavel && f.ordemCol === c ? (f.ordemDir === 1 ? ' ▲' : ' ▼') : '';
        const th = (c, t, cls) => ordenavel ? `<th data-col="${c}" class="${cls || ''}">${t}${seta(c)}</th>` : `<th class="sem ${cls || ''}">${t}</th>`;
        return `<div class="table-responsive"><table class="table table-sm table-hover">
            <thead><tr>${th('nome', 'Produto')}${th('sku', 'SKU')}${th('cat', 'Categoria')}${th('q', 'Estoque', 'text-right')}${th('custo', 'Custo un.', 'text-right')}${th('valor', 'Valor em estoque', 'text-right')}</tr></thead>
            <tbody>${linhas.map(l => `<tr>
                <td>${esc(l.p.nome)}</td><td><code style="font-size:11px;">${esc(l.p.sku)}</code></td><td>${esc(l.cat)}</td>
                <td class="text-right">${num(l.q)}</td>
                <td class="text-right ${l.exato ? '' : 'rel-est'}">${l.semCusto ? '<span class="text-muted">sem custo</span>' : (l.exato ? '' : '≈ ') + brl(l.custo)}</td>
                <td class="text-right ${l.exato ? '' : 'rel-est'}"><strong>${l.semCusto ? '—' : (l.exato ? '' : '≈ ') + brl(l.valor)}</strong></td>
            </tr>`).join('') || '<tr><td colspan="6" class="text-center text-muted">Nenhum produto.</td></tr>'}</tbody></table></div>`;
    }

    function desenhar() {
        montar().querySelectorAll('.rel-tab').forEach(b => b.classList.toggle('ativa', b.dataset.visao === f.visao));
        desenharFiltros();
        desenharCorpo();
    }

    // ---------- exportar / imprimir ----------
    function dadosParaExportar() {
        const fim = f.visao === 'periodo' ? null : fimDoDia(f.dataRef);
        if (f.visao === 'periodo') {
            return {
                nome: 'Por período',
                linhas: [['Período', 'Valor em estoque (fim)', 'Unidades (fim)', 'Entradas (R$)', 'Saídas (R$)'],
                    ...calcularSerie().map(s => [rotuloPeriodo(s.pe), round(s.valor), s.unidades, round(s.entradas), round(s.saidas)])]
            };
        }
        const linhas = calcularLinhas(fim);
        if (f.visao === 'produto') {
            return {
                nome: 'Por produto',
                linhas: [['Produto', 'SKU', 'Categoria', 'Estoque', 'Custo un.', 'Tipo de custo', 'Valor em estoque'],
                    ...ordenarLinhas(linhas).map(l => [l.p.nome, l.p.sku, l.cat, l.q, round(l.custo), l.semCusto ? 'sem custo' : (l.exato ? 'exato' : 'estimado'), round(l.valor)])]
            };
        }
        return {
            nome: 'Por categoria',
            linhas: [['Categoria', 'Produtos', 'Unidades', 'Custo exato', 'Estimado', 'Total'],
                ...porCategoria(linhas).map(c => [c.cat, c.produtos, c.unidades, round(c.exato), round(c.estimado), round(c.total)])]
        };
    }
    function round(v) { return Math.round((Number(v) || 0) * 100) / 100; }

    function exportarExcel() {
        if (typeof XLSX === 'undefined') { window.showToast && window.showToast('Biblioteca de Excel não carregada.', 'error'); return; }
        const fim = f.visao === 'periodo' ? null : fimDoDia(f.dataRef);
        const d = dadosParaExportar();
        const wb = XLSX.utils.book_new();
        const t = f.visao === 'periodo' ? null : totais(calcularLinhas(fim));
        const resumo = [['Relatório de valor em estoque (custo)'], ['Gerado em', new Date().toLocaleString('pt-BR')],
            ['Posição em', f.visao === 'periodo' ? `${f.de || ''} a ${f.ate || 'hoje'}` : (f.dataRef || 'hoje')],
            ['Categorias', f.categorias.size ? Array.from(f.categorias).join(', ') : 'todas'], ['Custo base', f.custoBase === 'medio' ? 'custo médio' : 'último custo'],
            ['Inclui custo estimado', f.incluirEstimado ? 'sim' : 'não']];
        if (t) resumo.push([], ['Valor total', round(t.total)], ['Custo exato', round(t.exato)], ['Custo estimado', round(t.estimado)], ['Unidades', t.unidades], ['Produtos com estoque', t.produtos]);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'Resumo');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(d.linhas), d.nome.slice(0, 30));
        XLSX.writeFile(wb, `valor_em_estoque_${hojeISO()}.xlsx`);
        if (window.showToast) window.showToast('✅ Relatório exportado!', 'success');
    }

    function imprimir() {
        const corpo = document.getElementById('relCorpo');
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(`<html><head><title>Valor em estoque</title><style>body{font-family:Arial;font-size:12px;padding:16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 6px}.text-right{text-align:right}.rel-cards{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px}.rel-card{border:1px solid #ccc;padding:8px 12px}.rel-card small{display:block}.rel-barra{display:none}</style></head><body><h3>Relatório — valor do estoque a preço de custo</h3>${corpo.innerHTML}</body></html>`);
        w.document.close(); w.focus(); w.print();
    }

    // ---------- abrir ----------
    async function abrir() {
        if (!usuarioOk()) { window.showToast && window.showToast('🔒 Só Andressa e Ronald acessam este relatório.', 'warning'); return; }
        if (!api()) return;
        const ov = montar();
        ov.classList.remove('hidden');
        document.getElementById('relCorpo').innerHTML = '<div class="text-muted" style="padding:30px;"><i class="fas fa-spinner fa-spin"></i> Carregando movimentações de estoque…</div>';
        try { await carregarMovimentos(); } catch (e) { console.warn('[relatorio-estoque] movimentações:', e.message || e); }
        if (!f.de) { const h = new Date(); f.de = iso(new Date(h.getFullYear(), h.getMonth() - 5, 1)); f.ate = iso(h); }
        desenhar();
    }

    window.abrirRelatorioEstoqueValor = abrir;
})();
