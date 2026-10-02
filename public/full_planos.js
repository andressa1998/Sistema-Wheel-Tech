// ============================================================
// MÓDULO: FULL - GERENCIAMENTO → PLANOS FULL
// ============================================================
// Monta um plano de envio para o FULL a partir de um período:
//
// 1) REPOSIÇÃO: todas as vendas FULL do período, somadas por
//    anúncio/variação, com SKU, MLB e inventory_id. A quantidade
//    no plano é exatamente o que vendeu.
//    - Fonte: busca de pedidos do ML (/orders/search), exata por
//      data/hora da CONFIRMAÇÃO da venda (date_closed — a data do
//      painel de vendas do ML), não da criação do pedido. O período começa na data inicial ou, se escolhida,
//      a partir de uma venda específica desse dia.
//    - Canceladas e devoluções ficam de fora: o ML marca as duas
//      como status "cancelled".
//    - FULL = envio com logistic_type "fulfillment", lido do envio
//      de cada pedido. NÃO dá pra usar o tipo do anúncio: testado com
//      vendas reais, ~22% divergem (o anúncio alterna entre Full e
//      envio próprio). O tipo do envio não muda, então fica em cache
//      no navegador e as próximas gerações ficam rápidas.
//    - Antes usava as operações SALE_CONFIRMATION do Full, mas essa
//      API vive estourando a cota (429 over_quota): lotes falhavam e
//      eram pulados (vendas faltando) e as tentativas deixavam tudo
//      lento. Além disso ela não desconta cancelamentos.
//
// 2) NOVOS ITENS: produtos que vendem no LOCAL (fora do FULL) cuja
//    N-ª venda desde a criação do MLB aconteceu DENTRO do período
//    (quem já tinha N vendas antes não entra — é pra enviar pela
//    primeira vez) e com estoque interno para montar pelo menos M
//    unidades do anúncio (kits contam pelo SKU — mesma conta da
//    coluna "Depósito" do Full - Gerenciamento). N e M são
//    configuráveis (padrão 2 e 5). O histórico vem de /orders/search
//    filtrado pelo MLB, até o início do período.
//
// Anúncios finalizados ficam de fora. O plano é salvo na tabela
// `full_planos` e exportado em Excel para enviar ao ML.
//
// Usa as funções internas do gerenciamento_anuncios.js expostas em
// window.GAInterno (mesmo token, mesmo limitador de requisições).
//
// SQL da tabela (rodar uma vez no Supabase):
//
// create table if not exists public.full_planos (
//     id bigserial primary key,
//     nome text not null,
//     periodo_inicio date not null,
//     periodo_fim date not null,
//     status text not null default 'rascunho',
//     parametros jsonb,
//     itens jsonb,
//     novos_itens jsonb,
//     total_unidades integer,
//     criado_em timestamptz not null default now(),
//     criado_por text,
//     atualizado_em timestamptz
// );
// create index if not exists full_planos_criado_idx
//     on public.full_planos (criado_em desc);
// notify pgrst, 'reload schema';
// ============================================================

(function() {
    'use strict';

    const TABELA = 'full_planos';
    const DIAS_POR_JANELA_PEDIDOS = 2;
    const PARALELO_PEDIDOS = 4;
    const PARALELO_ENVIOS = 10;
    const CHAVE_CACHE_LOGISTICA = 'fp_logistica_envios_v1';
    const MAX_CACHE_LOGISTICA = 30000;

    const ROTULOS_STATUS = {
        rascunho: 'Rascunho',
        enviado: 'Enviado ao ML',
        concluido: 'Concluído'
    };

    const ROTULOS_MOTIVO = {
        criado: 'Criado no período',
        vende_local: 'Vende no local'
    };

    let planos = [];
    let erroTabela = null;
    let plano = null; // plano aberto no editor
    let gerando = false;

    const I = () => window.GAInterno;

    function toast(msg, tipo = 'info') {
        window.showToast?.(msg, tipo);
    }

    function esc(valor) {
        return String(valor ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatarData(valor) {
        if (!valor) return '—';
        const [ano, mes, dia] = String(valor).slice(0, 10).split('-');
        return dia ? `${dia}/${mes}/${ano}` : String(valor);
    }

    function formatarDataHora(valor) {
        if (!valor) return '—';
        const data = new Date(valor);
        if (!Number.isFinite(data.getTime())) return '—';
        return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    }

    function hojeISO(deslocamentoDias = 0) {
        const d = new Date(Date.now() + deslocamentoDias * 86400000);
        return I().formatarDataApiFull(d);
    }

    function nomeUsuario() {
        return window.currentUser?.name || 'Sistema';
    }

    function progresso(texto) {
        const el = document.getElementById('fpProgresso');
        if (el) {
            el.textContent = texto || '';
            el.style.display = texto ? 'block' : 'none';
        }
    }

    function tabelaNaoExiste(error) {
        return error?.code === 'PGRST205' || error?.code === '42P01' ||
            /could not find the table|does not exist/i.test(error?.message || '');
    }

    // ============================================================
    // BUSCAS NO MERCADO LIVRE
    // ============================================================

    // Início/fim de um dia no horário de Brasília.
    function inicioDoDia(diaISO) {
        return new Date(`${diaISO}T00:00:00.000-03:00`);
    }

    function fimDoDia(diaISO) {
        return new Date(`${diaISO}T23:59:59.999-03:00`);
    }

    function horaVenda(dataISO) {
        return new Date(dataISO).toLocaleTimeString('pt-BR', {
            timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }

    // Data da venda = quando o ML confirmou (date_closed), a mesma que
    // aparece no painel de vendas. O pedido pode ser criado dias antes
    // (pagamento pendente) — usar date_created punha a venda no período
    // errado. Sem date_closed (objetos montados aqui), usa date_created.
    function dataVenda(pedido) {
        return pedido?.date_closed || pedido?.date_created;
    }

    // Ordem cronológica das vendas; no mesmo segundo, desempata pelo nº.
    function compararVendas(a, b) {
        const ta = new Date(dataVenda(a)).getTime();
        const tb = new Date(dataVenda(b)).getTime();
        if (ta !== tb) return ta - tb;
        return String(a.id).localeCompare(String(b.id), 'en', { numeric: true });
    }

    // Todos os pedidos (qualquer status) criados entre de e ate.
    // Falha em qualquer janela interrompe: melhor avisar do que gerar
    // um plano com vendas faltando.
    async function buscarPedidos(de, ate, rotulo = 'Lendo vendas do período') {
        const seller = await I().getSellerId();
        const passo = DIAS_POR_JANELA_PEDIDOS * 86400000;
        const pedidos = new Map();

        const janelas = [];
        for (let t = de.getTime(); t <= ate.getTime(); t += passo) {
            janelas.push([new Date(t), new Date(Math.min(t + passo - 1, ate.getTime()))]);
        }

        let feitas = 0;
        await I().executarEmParaleloGA(janelas, PARALELO_PEDIDOS, async ([janelaDe, janelaAte]) => {
            let offset = 0;
            let total = Infinity;
            while (offset < total) {
                const params = new URLSearchParams({
                    seller: String(seller),
                    'order.date_closed.from': janelaDe.toISOString(),
                    'order.date_closed.to': janelaAte.toISOString(),
                    sort: 'date_asc',
                    limit: '50',
                    offset: String(offset)
                });
                const data = await I().mlComRetry(`/orders/search?${params}`, 5);
                const resultados = data?.results || [];
                total = Number(data?.paging?.total) || 0;
                for (const pedido of resultados) if (pedido?.id) pedidos.set(String(pedido.id), pedido);
                if (!resultados.length) break;
                offset += resultados.length;
            }
            feitas++;
            progresso(`${rotulo}... ${feitas}/${janelas.length} • ${pedidos.size} pedidos`);
        });

        return [...pedidos.values()].sort(compararVendas);
    }

    function lerCacheLogistica() {
        try {
            return JSON.parse(localStorage.getItem(CHAVE_CACHE_LOGISTICA) || '{}') || {};
        } catch (e) {
            return {};
        }
    }

    function salvarCacheLogistica(cache) {
        try {
            let entradas = Object.entries(cache);
            if (entradas.length > MAX_CACHE_LOGISTICA) entradas = entradas.slice(-MAX_CACHE_LOGISTICA);
            localStorage.setItem(CHAVE_CACHE_LOGISTICA, JSON.stringify(Object.fromEntries(entradas)));
        } catch (e) { /* sem cache: só fica mais lento */ }
    }

    // Marca cada pedido com _logistica (fulfillment, cross_docking,
    // self_service...) lendo o envio. Pedidos de um mesmo pacote
    // dividem o envio, então cada envio é consultado uma vez só.
    async function marcarLogistica(pedidos, rotulo = 'Conferindo quais vendas são FULL') {
        const cache = lerCacheLogistica();
        const faltando = [...new Set(pedidos
            .map(p => p.shipping?.id ? String(p.shipping.id) : '')
            .filter(id => id && !cache[id]))];

        let feitas = 0;
        let falhas = 0;
        await I().executarEmParaleloGA(faltando, PARALELO_ENVIOS, async envioId => {
            try {
                const envio = await I().mlComRetry(`/shipments/${envioId}`, 5);
                const tipo = String(envio?.logistic_type || '').toLowerCase();
                if (tipo) cache[envioId] = tipo;
                else falhas++;
            } catch (error) {
                falhas++;
                console.warn('⚠️ [Planos Full] Falha lendo envio', envioId, error);
            }
            feitas++;
            if (feitas % 10 === 0 || feitas === faltando.length) {
                progresso(`${rotulo}... ${feitas}/${faltando.length} envios`);
            }
        });
        if (faltando.length) salvarCacheLogistica(cache);

        for (const pedido of pedidos) {
            const envioId = pedido.shipping?.id ? String(pedido.shipping.id) : '';
            pedido._logistica = envioId ? (cache[envioId] || null) : 'sem_envio';
        }
        return falhas;
    }

    function pedidoValido(pedido) {
        // "cancelled" = cancelada OU devolvida (o ML usa o mesmo status).
        return String(pedido?.status || '').toLowerCase() === 'paid';
    }

    function pedidoFull(pedido) {
        return pedido._logistica === 'fulfillment';
    }

    // Aplica o ponto de partida (venda escolhida no dia inicial).
    function aPartirDaVenda(pedidos, venda) {
        if (!venda?.id || !venda?.data) return pedidos;
        const corte = { id: venda.id, date_created: venda.data };
        return pedidos.filter(p => compararVendas(p, corte) >= 0);
    }

    // Quantas vendas válidas o anúncio/variação teve ANTES do corte
    // (desde a criação do MLB). Para de contar ao chegar em `limite`:
    // só interessa saber se já tinha vendido `limite` vezes ou mais.
    async function vendasAntesDoCorte(mlb, variationId, corte, limite) {
        const seller = await I().getSellerId();
        let vendas = 0;
        for (let offset = 0; offset < 2000; offset += 50) {
            const params = new URLSearchParams({
                seller: String(seller),
                q: mlb,
                'order.status': 'paid',
                'order.date_closed.to': new Date(corte.getTime() - 1).toISOString(),
                sort: 'date_asc',
                limit: '50',
                offset: String(offset)
            });
            const data = await I().mlComRetry(`/orders/search?${params}`, 5);
            const resultados = data?.results || [];
            for (const pedido of resultados) {
                if (!pedidoValido(pedido)) continue;
                const vendeu = (pedido.order_items || []).some(l =>
                    l?.item?.id === mlb &&
                    (!variationId || String(l.item.variation_id || '') === String(variationId)));
                if (vendeu && ++vendas >= limite) return vendas;
            }
            if (resultados.length < 50) break;
        }
        return vendas;
    }

    // Soma as unidades por MLB+variação.
    function somarPorAnuncio(pedidos) {
        const vendas = new Map();
        for (const pedido of pedidos) {
            for (const linha of pedido.order_items || []) {
                const mlb = linha?.item?.id;
                if (!mlb) continue;
                const variationId = linha.item.variation_id || null;
                const chave = `${mlb}|${variationId || ''}`;
                if (!vendas.has(chave)) {
                    vendas.set(chave, {
                        mlb,
                        variationId,
                        sku: linha.item.seller_sku || '',
                        titulo: linha.item.title || '',
                        unidades: 0,
                        pedidos: 0,
                        idsPedidos: []
                    });
                }
                const venda = vendas.get(chave);
                venda.unidades += Number(linha.quantity) || 0;
                venda.pedidos++;
                venda.idsPedidos.push({ id: String(pedido.id), data: dataVenda(pedido) });
            }
        }
        return vendas;
    }

    function resumoVenda(pedido) {
        const linhas = pedido.order_items || [];
        const unidades = linhas.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
        const titulo = linhas[0]?.item?.title || '';
        return {
            id: String(pedido.id),
            data: dataVenda(pedido),
            unidades,
            titulo: linhas.length > 1 ? `${titulo} (+${linhas.length - 1} item(ns))` : titulo,
            full: pedidoFull(pedido)
        };
    }

    function estoqueMontavel(sku, mlb) {
        const skuUsado = sku || I().skuInternoPorMlb(mlb);
        const valor = I().warehouseStock(skuUsado, mlb);
        return Number.isFinite(Number(valor)) ? Number(valor) : null;
    }

    // ============================================================
    // GERAR O PLANO
    // ============================================================
    async function gerarPlano(parametros) {
        const { inicio, fim, minVendasLocal, minEstoque, aPartirVenda } = parametros;
        const GA = I().GA;

        const rowsAtivas = (GA.rows || []).filter(row => String(row.status || '').toLowerCase() !== 'closed');
        if (!rowsAtivas.length) {
            throw new Error('A lista do Full - Gerenciamento está vazia. Clique em "Sincronizar Agora" antes de criar o plano.');
        }

        const [todosPedidos] = await Promise.all([
            buscarPedidos(inicioDoDia(inicio), fimDoDia(fim)),
            GA.productBySku?.size ? null : I().loadInternalStock()
        ]);

        const doPeriodo = aPartirDaVenda(todosPedidos, aPartirVenda);
        const validos = doPeriodo.filter(pedidoValido);
        const ignoradas = doPeriodo.length - validos.length;

        await marcarLogistica(validos);
        const semLogistica = validos.filter(p => !p._logistica);
        if (semLogistica.length) {
            throw new Error(`Não foi possível confirmar se ${semLogistica.length} venda(s) são FULL (o ML não respondeu). ` +
                'Tente gerar de novo — o que já foi conferido fica guardado e a próxima vez é mais rápida.');
        }

        // ---------- 1) Reposição: vendas FULL ----------
        // Todas as linhas (inclusive finalizadas) para achar inventory_id,
        // SKU e estoque; finalizadas ficam de fora do plano.
        const rowsPorAnuncio = new Map();
        for (const row of GA.rows || []) {
            const chave = `${row.itemId}|${row.variationId || ''}`;
            if (!rowsPorAnuncio.has(chave)) rowsPorAnuncio.set(chave, row);
        }

        const pedidosFull = validos.filter(pedidoFull);
        const itens = [];
        for (const venda of somarPorAnuncio(pedidosFull).values()) {
            if (!(venda.unidades > 0)) continue;
            const row = rowsPorAnuncio.get(`${venda.mlb}|${venda.variationId || ''}`) ||
                rowsPorAnuncio.get(`${venda.mlb}|`);
            if (row && String(row.status || '').toLowerCase() === 'closed') continue;
            itens.push({
                inventoryId: row?.inventoryId || '',
                mlb: venda.mlb,
                variationId: venda.variationId,
                sku: row?.sku || venda.sku || '',
                titulo: row?.title || venda.titulo,
                vendidos: venda.unidades,
                pedidos: venda.pedidos,
                idsPedidos: venda.idsPedidos,
                estoqueFull: row && Number.isFinite(Number(row.full)) ? Number(row.full) : null,
                quantidade: venda.unidades
            });
        }
        itens.sort((a, b) => b.vendidos - a.vendidos);

        // Guardado no plano para conferência (Excel detalhado) e para o
        // próximo plano poder continuar da venda seguinte.
        parametros.vendasFull = pedidosFull.map(pedido => ({
            pedido: String(pedido.id),
            data: dataVenda(pedido),
            itens: (pedido.order_items || []).map(l => ({
                mlb: l.item?.id || '',
                variationId: l.item?.variation_id || null,
                sku: l.item?.seller_sku || '',
                titulo: l.item?.title || '',
                quantidade: Number(l.quantity) || 0
            }))
        }));
        const ultimo = doPeriodo[doPeriodo.length - 1];
        parametros.ultimaVenda = ultimo ? { id: String(ultimo.id), data: dataVenda(ultimo) } : null;
        parametros.resumo = {
            pedidos: doPeriodo.length,
            validos: validos.length,
            full: pedidosFull.length,
            canceladasOuDevolvidas: ignoradas
        };

        // ---------- 2) Novos itens ----------
        // Entra quem vende no local e, DENTRO do período, chegou à
        // N-ª venda desde que o MLB foi criado (padrão: 2ª venda). Quem
        // já tinha N vendas antes do período não entra — vender a 5ª
        // vez no período não conta, a 2ª sim.
        const mlbsNoFull = new Set(rowsAtivas.map(row => row.itemId));
        const corte = aPartirVenda?.data ? new Date(aPartirVenda.data) : inicioDoDia(inicio);

        const candidatos = [];
        for (const venda of somarPorAnuncio(validos).values()) {
            // Quem já está no FULL entra pela reposição, não aqui.
            if (mlbsNoFull.has(venda.mlb)) continue;
            const estoque = estoqueMontavel(venda.sku, venda.mlb);
            if (!(estoque >= minEstoque)) continue;
            candidatos.push({ venda, estoque });
        }

        const novosItens = [];
        let conferidos = 0;
        await I().executarEmParaleloGA(candidatos, PARALELO_PEDIDOS, async ({ venda, estoque }) => {
            const antes = await vendasAntesDoCorte(venda.mlb, venda.variationId, corte, minVendasLocal);
            conferidos++;
            progresso(`Conferindo histórico de vendas dos novos itens... ${conferidos}/${candidatos.length}`);
            if (antes >= minVendasLocal || antes + venda.pedidos < minVendasLocal) return;

            novosItens.push({
                mlb: venda.mlb,
                variationId: venda.variationId,
                sku: venda.sku || I().skuInternoPorMlb(venda.mlb),
                titulo: venda.titulo,
                motivos: ['vende_local'],
                vendasAntes: antes,
                vendasLocal: venda.pedidos,
                estoqueMontavel: estoque,
                jaNoFull: false,
                quantidade: venda.unidades
            });
        });

        novosItens.sort((a, b) =>
            b.vendasLocal - a.vendasLocal || String(a.titulo).localeCompare(String(b.titulo), 'pt-BR'));

        return { itens, novosItens };
    }

    // ============================================================
    // BANCO
    // ============================================================
    async function carregarPlanos() {
        const db = window.supabaseClient;
        if (!db) return;
        const { data, error } = await db
            .from(TABELA)
            // parametros.vendasFull pode ser grande: só os campos leves aqui.
            .select('id, nome, periodo_inicio, periodo_fim, status, total_unidades, criado_em, criado_por, atualizado_em, itens, novos_itens, ' +
                'p_min_vendas:parametros->minVendasLocal, p_min_estoque:parametros->minEstoque, ' +
                'p_a_partir:parametros->aPartirVenda, p_ultima:parametros->ultimaVenda, p_resumo:parametros->resumo')
            .order('criado_em', { ascending: false })
            .limit(100);
        erroTabela = error || null;
        planos = error ? [] : (data || []).map(({ p_min_vendas, p_min_estoque, p_a_partir, p_ultima, p_resumo, ...p }) => ({
            ...p,
            parametros: {
                minVendasLocal: p_min_vendas ?? undefined,
                minEstoque: p_min_estoque ?? undefined,
                aPartirVenda: p_a_partir || null,
                ultimaVenda: p_ultima || null,
                resumo: p_resumo || null
            },
            _parametrosParciais: true
        }));
    }

    // Lista completa de vendas FULL de um plano salvo (para o Excel).
    async function carregarVendasFullPlano(p) {
        if (!p._parametrosParciais) return p.parametros?.vendasFull || [];
        const { data, error } = await window.supabaseClient
            .from(TABELA)
            .select('vendas:parametros->vendasFull')
            .eq('id', p.id)
            .single();
        if (error) throw error;
        return data?.vendas || [];
    }

    function totalUnidades(p) {
        return [...(p.itens || []), ...(p.novos_itens || [])]
            .reduce((s, item) => s + (Number(item.quantidade) || 0), 0);
    }

    async function salvarPlano() {
        const db = window.supabaseClient;
        if (!db || !plano) return;
        const registro = {
            nome: plano.nome,
            periodo_inicio: plano.periodo_inicio,
            periodo_fim: plano.periodo_fim,
            status: plano.status || 'rascunho',
            parametros: plano.parametros || null,
            itens: plano.itens || [],
            novos_itens: plano.novos_itens || [],
            total_unidades: totalUnidades(plano),
            atualizado_em: new Date().toISOString()
        };
        // Plano reaberto só tem os parâmetros leves: não sobrescrever.
        if (plano._parametrosParciais) delete registro.parametros;

        if (plano.id) {
            const { error } = await db.from(TABELA).update(registro).eq('id', plano.id);
            if (error) throw error;
        } else {
            const { data, error } = await db.from(TABELA)
                .insert({ ...registro, criado_por: nomeUsuario() })
                .select('id, criado_em, criado_por')
                .single();
            if (error) throw error;
            Object.assign(plano, data);
        }
    }

    // ============================================================
    // INTERFACE
    // ============================================================
    function garantirTela() {
        let tela = document.getElementById('fullPlanosTela');
        if (tela) return tela;
        tela = document.createElement('div');
        tela.id = 'fullPlanosTela';
        tela.style.cssText =
            'position:fixed; inset:0; z-index:2000; background:#f4f6fb; overflow:auto; padding:20px;';
        tela.innerHTML = `
            <div style="max-width:1400px; margin:0 auto;">
                <div class="card mb-4">
                    <div class="card-header">
                        <h2 class="card-title"><i class="fas fa-truck-loading"></i> Planos Full</h2>
                        <button type="button" class="btn btn-secondary" onclick="fecharPlanosFullGA()">
                            <i class="fas fa-times"></i> Fechar
                        </button>
                    </div>
                    <div id="fpProgresso" class="alert alert-info" style="display:none; margin:12px;"></div>
                </div>
                <div id="fpConteudo"></div>
            </div>`;
        document.body.appendChild(tela);
        return tela;
    }

    window.abrirPlanosFullGA = async function() {
        if (!window.GAInterno) {
            toast('❌ Full - Gerenciamento não carregado', 'error');
            return;
        }
        garantirTela().style.display = 'block';
        document.body.style.overflow = 'hidden';
        plano = null;
        await renderizarLista();
    };

    window.fecharPlanosFullGA = function() {
        if (plano && plano._alterado && !confirm('O plano tem alterações não salvas. Fechar mesmo assim?')) return;
        const tela = document.getElementById('fullPlanosTela');
        if (tela) tela.style.display = 'none';
        document.body.style.overflow = '';
    };

    async function renderizarLista() {
        const alvo = document.getElementById('fpConteudo');
        if (!alvo) return;
        alvo.innerHTML = '<div class="card"><div class="card-body text-center text-muted py-4">Carregando planos...</div></div>';
        await carregarPlanos();

        const linhas = erroTabela
            ? `<tr><td colspan="7" class="text-center text-danger py-4"><i class="fas fa-exclamation-triangle"></i> ${
                tabelaNaoExiste(erroTabela)
                    ? `A tabela <strong>${TABELA}</strong> ainda não foi criada no Supabase. Rode o SQL que está no topo do arquivo full_planos.js.`
                    : `Erro ao carregar: ${esc(erroTabela.message)}`
            }</td></tr>`
            : planos.length
                ? planos.map(p => `
                    <tr>
                        <td><strong>${esc(p.nome)}</strong></td>
                        <td>${formatarData(p.periodo_inicio)} a ${formatarData(p.periodo_fim)}</td>
                        <td style="text-align:center;">${(p.itens || []).length} + ${(p.novos_itens || []).length} novos</td>
                        <td style="text-align:center;">${Number(p.total_unidades) || 0}</td>
                        <td><span class="badge ${p.status === 'rascunho' ? 'badge-warning' : 'badge-success'}">${esc(ROTULOS_STATUS[p.status] || p.status)}</span></td>
                        <td>${formatarDataHora(p.criado_em)}<br><small class="text-muted">${esc(p.criado_por || '')}</small></td>
                        <td style="white-space:nowrap;">
                            <button type="button" class="btn btn-sm btn-primary" onclick="abrirPlanoFullGA(${Number(p.id)})"><i class="fas fa-folder-open"></i> Abrir</button>
                            <button type="button" class="btn btn-sm btn-outline-success" onclick="exportarPlanoFullGA(${Number(p.id)})" title="Planilha no modelo do ML"><i class="fas fa-file-excel"></i></button>
                            <button type="button" class="btn btn-sm btn-outline-danger" onclick="excluirPlanoFullGA(${Number(p.id)})" title="Excluir"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>`).join('')
                : '<tr><td colspan="7" class="text-center text-muted py-4">Nenhum plano criado ainda.</td></tr>';

        // Lista vem do mais novo para o mais antigo.
        const ultimoPlanoComVenda = planos.find(p => p.parametros?.ultimaVenda?.id);

        alvo.innerHTML = `
            <div class="card mb-4">
                <div class="card-header"><h2 class="card-title"><i class="fas fa-plus-circle"></i> Novo plano</h2></div>
                <div class="card-body">
                    ${ultimoPlanoComVenda ? `
                        <div class="alert alert-light d-flex flex-wrap align-items-center" style="gap:8px; border:1px dashed #b6c2d9;">
                            <span><i class="fas fa-history"></i> O plano <strong>${esc(ultimoPlanoComVenda.nome)}</strong> terminou na venda
                                <strong>#${esc(ultimoPlanoComVenda.parametros.ultimaVenda.id)}</strong>
                                (${formatarDataHoraVenda(ultimoPlanoComVenda.parametros.ultimaVenda.data)}).</span>
                            <button type="button" class="btn btn-sm btn-outline-primary" onclick="continuarUltimoPlanoFullGA()">
                                <i class="fas fa-forward"></i> Começar na venda seguinte
                            </button>
                        </div>` : ''}
                    <div class="row align-items-end">
                        <div class="col-md-3">
                            <label>Nome do plano</label>
                            <input type="text" id="fpNome" class="form-control" value="Plano Full ${esc(formatarData(hojeISO()))}">
                        </div>
                        <div class="col-md-2">
                            <label>Vendas de</label>
                            <input type="date" id="fpInicio" class="form-control" value="${hojeISO(-30)}" onchange="carregarVendasDiaPlanoFullGA()">
                        </div>
                        <div class="col-md-5">
                            <label>A partir da venda <small class="text-muted">(do dia inicial)</small></label>
                            <select id="fpAPartirVenda" class="form-control">
                                <option value="">Desde a primeira venda do dia</option>
                            </select>
                            <small id="fpVendasDiaInfo" class="text-muted"></small>
                        </div>
                        <div class="col-md-2">
                            <label>até</label>
                            <input type="date" id="fpFim" class="form-control" value="${hojeISO()}">
                        </div>
                    </div>
                    <div class="row align-items-end mt-2">
                        <div class="col-md-2">
                            <label title="Novos itens: entra quando a venda no período é esta (ex.: 2 = 2ª venda desde a criação do MLB)">Venda nº</label>
                            <input type="number" min="1" id="fpMinVendas" class="form-control" value="2">
                        </div>
                        <div class="col-md-2">
                            <label title="Estoque interno mínimo (ou kits que dá pra montar)">Estoque mín.</label>
                            <input type="number" min="0" id="fpMinEstoque" class="form-control" value="5">
                        </div>
                        <div class="col-md-3">
                            <button type="button" class="btn btn-success" style="width:100%;" id="fpBtnGerar" onclick="gerarPlanoFullGA()">
                                <i class="fas fa-magic"></i> Gerar plano
                            </button>
                        </div>
                    </div>
                    <small class="text-muted d-block mt-2">
                        Reposição = vendas FULL do período, quantidade exata vendida (SKU, MLB e quantidade somada).
                        Vendas canceladas e devolvidas ficam de fora.
                        Novos itens = produtos fora do FULL cuja venda no período é a 2ª desde que o MLB foi criado
                        (o nº vem de "Venda nº") e com o estoque mínimo (conta os kits que dá pra montar pelo SKU).
                        Quem já tinha vendido antes disso não entra. Anúncios finalizados ficam de fora.
                    </small>
                </div>
            </div>

            <div class="card">
                <div class="card-header"><h2 class="card-title"><i class="fas fa-list"></i> Planos criados</h2></div>
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Plano</th><th>Período</th><th style="text-align:center;">Itens</th>
                                <th style="text-align:center;">Unidades</th><th>Status</th><th>Criado</th><th></th>
                            </tr>
                        </thead>
                        <tbody>${linhas}</tbody>
                    </table>
                </div>
            </div>`;

        carregarVendasDiaPlanoFullGA();
    }

    // ------------------------------------------------------------
    // "A partir da venda": lista as vendas do dia inicial.
    // ------------------------------------------------------------
    let vendasDia = []; // resumos das vendas do dia inicial
    let consultaVendasDia = 0; // ignora respostas de datas antigas

    window.carregarVendasDiaPlanoFullGA = async function(selecionarApos = null) {
        const select = document.getElementById('fpAPartirVenda');
        const info = document.getElementById('fpVendasDiaInfo');
        const dia = document.getElementById('fpInicio')?.value;
        if (!select || !dia) return;

        const consulta = ++consultaVendasDia;
        vendasDia = [];
        select.innerHTML = '<option value="">Desde a primeira venda do dia</option>';
        select.disabled = true;
        if (info) info.textContent = 'Carregando vendas do dia...';

        try {
            const pedidos = await buscarPedidos(inicioDoDia(dia), fimDoDia(dia), 'Lendo vendas do dia inicial');
            const validos = pedidos.filter(pedidoValido);
            await marcarLogistica(validos, 'Conferindo vendas do dia inicial');
            if (consulta !== consultaVendasDia) return;
            progresso('');

            vendasDia = validos.map(resumoVenda);
            select.innerHTML = '<option value="">Desde a primeira venda do dia</option>' +
                vendasDia.map(v => `<option value="${esc(v.id)}">${esc(horaVenda(v.data))} — #${esc(v.id)} — ${esc(v.titulo.slice(0, 60))} — ${v.unidades} un.${v.full ? ' — FULL' : ''}</option>`).join('');

            if (selecionarApos) {
                const proxima = vendasDia.find(v => compararVendas(
                    { id: v.id, date_created: v.data },
                    { id: selecionarApos.id, date_created: selecionarApos.data }) > 0);
                if (proxima) select.value = proxima.id;
            }

            const full = vendasDia.filter(v => v.full).length;
            if (info) info.textContent = vendasDia.length
                ? `${vendasDia.length} venda(s) no dia, ${full} FULL (canceladas e devolvidas já fora).`
                : 'Nenhuma venda válida neste dia.';
        } catch (error) {
            if (consulta !== consultaVendasDia) return;
            console.warn('⚠️ [Planos Full] Falha listando vendas do dia', error);
            progresso('');
            if (info) info.textContent = `Não foi possível carregar as vendas do dia: ${error.message}`;
        } finally {
            if (consulta === consultaVendasDia) select.disabled = false;
        }
    };

    window.continuarUltimoPlanoFullGA = async function() {
        const ultimo = planos.find(p => p.parametros?.ultimaVenda?.id)?.parametros.ultimaVenda;
        const campo = document.getElementById('fpInicio');
        if (!ultimo || !campo) return;
        campo.value = new Date(ultimo.data).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        await window.carregarVendasDiaPlanoFullGA(ultimo);
        const select = document.getElementById('fpAPartirVenda');
        // A última venda foi a última do dia: o plano novo começa no dia seguinte.
        if (select && !select.value) {
            const seguinte = new Date(new Date(`${campo.value}T12:00:00-03:00`).getTime() + 86400000);
            campo.value = seguinte.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            await window.carregarVendasDiaPlanoFullGA();
        }
    };

    function formatarDataHoraVenda(valor) {
        if (!valor) return '—';
        return new Date(valor).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' });
    }

    window.gerarPlanoFullGA = async function() {
        if (gerando) return;
        const valor = id => document.getElementById(id)?.value || '';
        const vendaInicial = vendasDia.find(v => v.id === valor('fpAPartirVenda'));
        const parametros = {
            inicio: valor('fpInicio'),
            fim: valor('fpFim'),
            aPartirVenda: vendaInicial ? { id: vendaInicial.id, data: vendaInicial.data } : null,
            minVendasLocal: Math.max(1, Number(valor('fpMinVendas')) || 2),
            minEstoque: Math.max(0, Number(valor('fpMinEstoque')) || 0)
        };
        if (!parametros.inicio || !parametros.fim || parametros.inicio > parametros.fim) {
            toast('⚠️ Informe um período válido', 'warning');
            return;
        }
        if (document.getElementById('fpAPartirVenda')?.disabled) {
            toast('⏳ Aguarde carregar as vendas do dia inicial', 'warning');
            return;
        }

        gerando = true;
        const botao = document.getElementById('fpBtnGerar');
        if (botao) {
            botao.disabled = true;
            botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
        }

        try {
            const { itens, novosItens } = await gerarPlano(parametros);
            plano = {
                id: null,
                nome: valor('fpNome').trim() || `Plano Full ${formatarData(hojeISO())}`,
                periodo_inicio: parametros.inicio,
                periodo_fim: parametros.fim,
                status: 'rascunho',
                parametros,
                itens,
                novos_itens: novosItens,
                _alterado: true
            };
            progresso('');
            renderizarEditor();
            const r = parametros.resumo;
            toast(`✅ Plano gerado: ${r.full} venda(s) FULL → ${itens.length} item(ns) de reposição, e ${novosItens.length} novo(s) item(ns). ` +
                `${r.canceladasOuDevolvidas} cancelada(s)/devolvida(s) ignorada(s). Revise e salve.`, 'success');
        } catch (error) {
            console.error('❌ [Planos Full]', error);
            progresso(`❌ ${error.message}`);
            toast(`❌ ${error.message}`, 'error');
        } finally {
            gerando = false;
            if (botao) {
                botao.disabled = false;
                botao.innerHTML = '<i class="fas fa-magic"></i> Gerar plano';
            }
        }
    };

    window.abrirPlanoFullGA = function(id) {
        const encontrado = planos.find(p => Number(p.id) === Number(id));
        if (!encontrado) return;
        plano = JSON.parse(JSON.stringify(encontrado));
        plano.itens = plano.itens || [];
        plano.novos_itens = plano.novos_itens || [];
        renderizarEditor();
    };

    window.excluirPlanoFullGA = async function(id) {
        const encontrado = planos.find(p => Number(p.id) === Number(id));
        if (!encontrado || !confirm(`Excluir o plano "${encontrado.nome}"?`)) return;
        const { error } = await window.supabaseClient.from(TABELA).delete().eq('id', id);
        if (error) {
            toast(`❌ ${error.message}`, 'error');
            return;
        }
        toast('✅ Plano excluído', 'success');
        await renderizarLista();
    };

    function linhaItem(item, indice, lista) {
        const campoQtd = `
            <input type="number" min="0" class="form-control form-control-sm" style="width:90px; text-align:center;"
                value="${Number(item.quantidade) || 0}"
                onchange="alterarQuantidadePlanoFullGA('${lista}', ${indice}, this.value)">`;
        const remover = `
            <button type="button" class="btn btn-sm btn-outline-danger" title="Tirar do plano"
                onclick="removerItemPlanoFullGA('${lista}', ${indice})"><i class="fas fa-times"></i></button>`;
        const mlb = `<strong>${esc(item.mlb)}</strong>${item.variationId ? `<br><small class="text-muted">Var. ${esc(item.variationId)}</small>` : ''}`;

        if (lista === 'itens') {
            return `
                <tr>
                    <td>${mlb}</td>
                    <td>${esc(item.sku || '—')}</td>
                    <td>${esc(item.titulo)}${(item.idsPedidos || []).length ? `<br><small class="text-muted">Pedido(s): ${
                        item.idsPedidos.map(p => `#${esc(p.id)} (${esc(formatarDataHoraVenda(p.data))})`).join(', ')}</small>` : ''}</td>
                    <td><small>${esc(item.inventoryId || '—')}</small></td>
                    <td style="text-align:center;">${Number(item.vendidos) || 0}</td>
                    <td style="text-align:center;">${item.estoqueFull ?? '—'}</td>
                    <td style="text-align:center;">${campoQtd}</td>
                    <td>${remover}</td>
                </tr>`;
        }

        return `
            <tr>
                <td>${mlb}</td>
                <td>${esc(item.sku || '—')}</td>
                <td>${esc(item.titulo)}</td>
                <td>${(item.motivos || []).map(m => `<span class="badge badge-info" style="margin-right:4px;">${esc(ROTULOS_MOTIVO[m] || m)}</span>`).join('')}
                    ${item.jaNoFull ? '<br><small class="text-muted">já está no FULL</small>' : ''}</td>
                <td style="text-align:center;">${item.vendasAntes ?? '—'}</td>
                <td style="text-align:center;">${Number(item.vendasLocal) || 0}</td>
                <td style="text-align:center;">${item.estoqueMontavel ?? '—'}</td>
                <td style="text-align:center;">${campoQtd}</td>
                <td>${remover}</td>
            </tr>`;
    }

    function renderizarEditor() {
        const alvo = document.getElementById('fpConteudo');
        if (!alvo || !plano) return;

        const totalRepos = plano.itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
        const totalNovos = plano.novos_itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);

        alvo.innerHTML = `
            <div class="card mb-4">
                <div class="card-header">
                    <div>
                        <input type="text" class="form-control" style="font-weight:700; min-width:320px;"
                            value="${esc(plano.nome)}" onchange="alterarNomePlanoFullGA(this.value)">
                        <small class="text-muted">
                            Vendas de ${formatarData(plano.periodo_inicio)}${plano.parametros?.aPartirVenda
                                ? ` (a partir da venda #${esc(plano.parametros.aPartirVenda.id)}, ${formatarDataHoraVenda(plano.parametros.aPartirVenda.data)})`
                                : ''} a ${formatarData(plano.periodo_fim)}
                            ${plano.parametros?.resumo
                                ? `• ${plano.parametros.resumo.full} venda(s) FULL • ${plano.parametros.resumo.canceladasOuDevolvidas} cancelada(s)/devolvida(s) ignorada(s)`
                                : ''}
                            • ${totalRepos + totalNovos} unidade(s) no plano
                            ${plano.id ? `• salvo por ${esc(plano.criado_por || '—')}` : '• <strong>ainda não salvo</strong>'}
                        </small>
                    </div>
                    <div class="d-flex flex-wrap align-items-center" style="gap:6px;">
                        <select class="form-control form-control-sm" style="width:160px;" onchange="alterarStatusPlanoFullGA(this.value)">
                            ${Object.entries(ROTULOS_STATUS).map(([v, r]) =>
                                `<option value="${v}" ${plano.status === v ? 'selected' : ''}>${r}</option>`).join('')}
                        </select>
                        <button type="button" class="btn btn-secondary" onclick="voltarListaPlanosFullGA()"><i class="fas fa-arrow-left"></i> Voltar</button>
                        <button type="button" class="btn btn-outline-secondary" onclick="exportarDetalhePlanoFullGA()" title="Excel de conferência com todos os dados do plano"><i class="fas fa-file-alt"></i> Excel detalhado</button>
                        <button type="button" class="btn btn-outline-success" onclick="exportarPlanoFullGA()" title="Planilha no modelo do ML (Seleção de produtos para enviar ao centro de distribuição)"><i class="fas fa-file-excel"></i> Planilha para o ML</button>
                        <button type="button" class="btn btn-success" onclick="salvarPlanoFullGA()"><i class="fas fa-save"></i> Salvar plano</button>
                    </div>
                </div>
            </div>

            <div class="card mb-4">
                <div class="card-header">
                    <h2 class="card-title"><i class="fas fa-redo"></i> Reposição — vendas FULL no período
                        <span class="badge badge-primary">${plano.itens.length}</span></h2>
                    <small class="text-muted">${totalRepos} unidade(s)</small>
                </div>
                <div class="table-responsive" style="max-height:520px; overflow-y:auto;">
                    <table class="table table-striped table-hover table-sm">
                        <thead><tr>
                            <th>MLB</th><th>SKU</th><th>Título</th><th>Inventory ID</th>
                            <th style="text-align:center;">Vendidos FULL</th><th style="text-align:center;">Estoque FULL hoje</th>
                            <th style="text-align:center;">Enviar</th><th></th>
                        </tr></thead>
                        <tbody>${plano.itens.length
                            ? plano.itens.map((item, i) => linhaItem(item, i, 'itens')).join('')
                            : '<tr><td colspan="8" class="text-center text-muted py-4">Nenhuma venda FULL no período.</td></tr>'}</tbody>
                    </table>
                </div>
            </div>

            <div class="card mb-4">
                <div class="card-header">
                    <h2 class="card-title"><i class="fas fa-star"></i> Novos itens
                        <span class="badge badge-primary">${plano.novos_itens.length}</span></h2>
                    <small class="text-muted">${totalNovos} unidade(s) •
                        vende no local: chegou à ${plano.parametros?.minVendasLocal ?? 2}ª venda (desde a criação do MLB) no período e estoque para ≥ ${plano.parametros?.minEstoque ?? 5}</small>
                </div>
                <div class="table-responsive" style="max-height:520px; overflow-y:auto;">
                    <table class="table table-striped table-hover table-sm">
                        <thead><tr>
                            <th>MLB</th><th>SKU</th><th>Título</th><th>Por que entrou</th><th style="text-align:center;">Vendas antes do período</th>
                            <th style="text-align:center;">Vendas no período</th><th style="text-align:center;">Estoque (unid./kits)</th>
                            <th style="text-align:center;">Enviar</th><th></th>
                        </tr></thead>
                        <tbody>${plano.novos_itens.length
                            ? plano.novos_itens.map((item, i) => linhaItem(item, i, 'novos_itens')).join('')
                            : '<tr><td colspan="9" class="text-center text-muted py-4">Nenhum novo item.</td></tr>'}</tbody>
                    </table>
                </div>
            </div>`;
    }

    window.alterarQuantidadePlanoFullGA = function(lista, indice, valor) {
        const item = plano?.[lista]?.[indice];
        if (!item) return;
        item.quantidade = Math.max(0, Math.round(Number(valor) || 0));
        plano._alterado = true;
        renderizarEditor();
    };

    window.removerItemPlanoFullGA = function(lista, indice) {
        if (!plano?.[lista]) return;
        plano[lista].splice(indice, 1);
        plano._alterado = true;
        renderizarEditor();
    };

    window.alterarNomePlanoFullGA = function(nome) {
        if (!plano) return;
        plano.nome = String(nome || '').trim() || plano.nome;
        plano._alterado = true;
    };

    window.alterarStatusPlanoFullGA = function(status) {
        if (!plano) return;
        plano.status = status;
        plano._alterado = true;
    };

    window.voltarListaPlanosFullGA = async function() {
        if (plano?._alterado && !confirm('O plano tem alterações não salvas. Voltar mesmo assim?')) return;
        plano = null;
        await renderizarLista();
    };

    window.salvarPlanoFullGA = async function() {
        try {
            await salvarPlano();
            plano._alterado = false;
            toast('✅ Plano salvo', 'success');
            renderizarEditor();
        } catch (error) {
            toast(tabelaNaoExiste(error)
                ? '❌ Crie a tabela full_planos no Supabase (SQL no topo do full_planos.js)'
                : `❌ Erro ao salvar: ${error.message}`, 'error');
        }
    };

    function planoParaExportar(id) {
        const p = id ? planos.find(x => Number(x.id) === Number(id)) : plano;
        if (!p) return null;
        if (typeof XLSX === 'undefined') {
            toast('❌ Biblioteca de Excel não carregada', 'error');
            return null;
        }
        return p;
    }

    function itensParaEnvio(p) {
        return [
            ...(p.itens || []).map(item => ({ ...item, origem: 'Reposição' })),
            ...(p.novos_itens || []).map(item => ({ ...item, origem: 'Novo item' }))
        ].filter(item => Number(item.quantidade) > 0);
    }

    function nomeArquivoPlano(p, sufixo) {
        const base = String(p.nome || 'plano_full').normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^\w-]+/g, '_').replace(/_+/g, '_');
        return `${base}${sufixo}.xlsx`;
    }

    // ------------------------------------------------------------
    // PLANILHA NO MODELO DO ML ("Seleção de produtos para enviar ao
    // centro de distribuição"): aba "Seleção de produtos" com os
    // cabeçalhos nas linhas 4 e 5 e os produtos a partir da linha 6.
    // Colunas: SKU | Código universal | Código ML | N.º do anúncio |
    // N.º da variação | Quantidade de unidades.
    //
    // Preenche Código ML (inventory_id), N.º do anúncio (só os
    // números, como no exemplo do ML) e N.º da variação. SKU e código
    // universal ficam em branco de propósito: o ML pede um código só,
    // e o SKU que o sistema tem pode ser o do produto interno em vez
    // do que está no anúncio.
    // ------------------------------------------------------------
    window.exportarPlanoFullGA = function(id) {
        const p = planoParaExportar(id);
        if (!p) return;

        const envio = itensParaEnvio(p);
        if (!envio.length) {
            toast('⚠️ Nenhum item com quantidade para enviar', 'warning');
            return;
        }

        const semCodigo = envio.filter(item => !item.inventoryId && !item.mlb);
        if (semCodigo.length) {
            toast(`⚠️ ${semCodigo.length} item(ns) sem código ficaram de fora`, 'warning');
        }

        const linhas = [
            ['Adicione pelo menos um código de cada produto e quantas unidades você vai enviar'],
            ['Os códigos devem ser os mesmos que estão informados no anúncio.'],
            [],
            ['SKU', 'Código universal do produto', 'Código ML', 'N.º do anúncio', 'N.º da variação', 'Quantidade de unidades'],
            [
                'Encontre-o no detalhe do Anúncio.',
                'Encontre-o no detalhe do Anúncio.',
                'Encontre-o na seção "Envios e controle de estoque", juntamente com o produto.',
                'Encontre-o na lista de Anúncios, juntamente com o produto.',
                'Adicione este código somente se o seu produto for uma variação.',
                ''
            ],
            ...envio
                .filter(item => item.inventoryId || item.mlb)
                .map(item => [
                    '',
                    '',
                    item.inventoryId || '',
                    String(item.mlb || '').replace(/^MLB/i, ''),
                    item.variationId ? String(item.variationId) : '',
                    Number(item.quantidade) || 0
                ])
        ];

        const selecao = XLSX.utils.aoa_to_sheet(linhas);
        selecao['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }
        ];
        selecao['!cols'] = [{ wch: 22 }, { wch: 26 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 20 }];

        const ajuda = XLSX.utils.aoa_to_sheet([
            ['Seleção de produtos para enviar ao centro de distribuição'],
            ['Gerado pelo sistema a partir do plano:', p.nome || ''],
            ['Período de vendas:', `${formatarData(p.periodo_inicio)} a ${formatarData(p.periodo_fim)}`],
            ['Produtos:', envio.length],
            ['Unidades:', envio.reduce((s, item) => s + (Number(item.quantidade) || 0), 0)]
        ]);

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ajuda, 'Ajuda');
        XLSX.utils.book_append_sheet(wb, selecao, 'Seleção de produtos');
        XLSX.writeFile(wb, nomeArquivoPlano(p, '_envio_ML'));
    };

    // Excel de conferência, com tudo que o plano tem.
    window.exportarDetalhePlanoFullGA = async function(id) {
        const p = planoParaExportar(id);
        if (!p) return;

        let vendasFull = [];
        try {
            vendasFull = await carregarVendasFullPlano(p);
        } catch (error) {
            console.warn('⚠️ [Planos Full] Não carregou as vendas do plano', error);
        }

        const envio = itensParaEnvio(p);
        if (!envio.length) {
            toast('⚠️ Nenhum item com quantidade para enviar', 'warning');
            return;
        }

        const wb = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(envio.map(item => ({
            SKU: item.sku || '',
            MLB: item.mlb,
            Variação: item.variationId || '',
            'Inventory ID': item.inventoryId || '',
            Título: item.titulo || '',
            Quantidade: Number(item.quantidade) || 0,
            Origem: item.origem
        }))), 'Envio Full');

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((p.itens || []).map(item => ({
            SKU: item.sku || '',
            MLB: item.mlb,
            Variação: item.variationId || '',
            'Inventory ID': item.inventoryId || '',
            Título: item.titulo || '',
            'Vendidos FULL no período': Number(item.vendidos) || 0,
            'Estoque FULL': item.estoqueFull ?? '',
            Enviar: Number(item.quantidade) || 0
        }))), 'Reposição');

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((p.novos_itens || []).map(item => ({
            SKU: item.sku || '',
            MLB: item.mlb,
            Variação: item.variationId || '',
            Título: item.titulo || '',
            'Por que entrou': (item.motivos || []).map(m => ROTULOS_MOTIVO[m] || m).join(' + '),
            'Vendas antes do período': item.vendasAntes ?? '',
            'Vendas no período': Number(item.vendasLocal) || 0,
            'Estoque (unid./kits)': item.estoqueMontavel ?? '',
            'Já no FULL': item.jaNoFull ? 'Sim' : 'Não',
            Enviar: Number(item.quantidade) || 0
        }))), 'Novos itens');

        // Uma linha por item de cada venda FULL somada na reposição:
        // permite conferir venda a venda de onde saiu cada quantidade.
        if (vendasFull.length) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vendasFull.flatMap(venda =>
                (venda.itens || []).map(item => ({
                    Venda: venda.pedido,
                    'Data/hora': formatarDataHoraVenda(venda.data),
                    MLB: item.mlb,
                    Variação: item.variationId || '',
                    SKU: item.sku || '',
                    Título: item.titulo || '',
                    Quantidade: Number(item.quantidade) || 0
                })))), 'Vendas FULL');
        }

        XLSX.writeFile(wb, nomeArquivoPlano(p, '_detalhado'));
    };
})();
